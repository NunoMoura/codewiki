import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { realpathSync } from "node:fs";
import type { Server } from "node:http";

import {
	ProjectCoordinator,
	type ProjectCoordinatorClientConnection,
	type ProjectCoordinatorClientInput,
	type ProjectCoordinatorEvent,
	type ProjectCoordinatorExecutionPolicy,
	type ProjectCoordinatorOptions,
	type ProjectCoordinatorSnapshot,
} from "./project-coordinator.ts";
import {
	PROJECT_COORDINATOR_ENDPOINT_SCHEMA_VERSION,
	acquireProjectCoordinatorOwnership,
	projectCoordinatorBearerToken,
	projectCoordinatorOwnershipIsCurrent,
	readProjectCoordinatorEndpoint,
	releaseProjectCoordinatorOwnership,
	removeProjectCoordinatorEndpoint,
	safeEqual,
	writeProjectCoordinatorEndpoint,
	type ProjectCoordinatorEndpoint,
	type ProjectCoordinatorOwnership,
} from "./project-coordinator-endpoint.ts";
import {
	RuntimeReactor,
	type RuntimeReaction,
	type RuntimeTrigger,
} from "./reactor.ts";
import {
	scheduleRuntimeReactionJob,
	scheduleRuntimeReactions,
	type RuntimeReactionJobReceipt,
} from "./runtime-reaction-jobs.ts";
import type {
	RunRuntimeSelectedSemanticReactionResult,
	RuntimeDecisionCandidate,
	RuntimeImplementationCandidate,
	RuntimePlanningCandidate,
	RuntimeSemanticAdapters,
	RuntimeSemanticMode,
} from "./semantic-executor.ts";

const DEFAULT_CLIENT_LEASE_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const MAX_REQUEST_BYTES = 16 * 1_024;
const MAX_RESPONSE_BYTES = 1024 * 1_024;

export interface ProjectCoordinatorServiceOptions
	extends Pick<
		ProjectCoordinatorOptions,
		"maxConcurrentJobs" | "maxCompletedJobs"
	> {
	generationId?: string;
	executionPolicy?: ProjectCoordinatorExecutionPolicy;
	clientLeaseMs?: number;
	port?: number;
	now?: () => string;
	clock?: () => number;
	semanticAdapters?: RuntimeSemanticAdapters;
	maxReactions?: number;
	maxPlanningChanges?: number;
	maxCasRetries?: number;
	onEvent?: (event: ProjectCoordinatorEvent) => void;
}

export interface ProjectCoordinatorServiceHandle {
	endpoint: ProjectCoordinatorEndpoint;
	coordinator: ProjectCoordinator;
	close(): Promise<void>;
}

type ProjectCoordinatorRemoteTrigger = Omit<
	RuntimeTrigger,
	"occurredAt"
>;
export type RuntimeCandidateLoop = "decision" | "planning" | "implementation";

export interface ProjectCoordinatorCandidateResult {
	receipt: RuntimeReactionJobReceipt;
	execution?: RunRuntimeSelectedSemanticReactionResult;
}

export interface ProjectCoordinatorRemoteClient {
	clientId: string;
	connectionId: string;
	generationId: string;
	state(): Promise<ProjectCoordinatorSnapshot>;
	inspect(trigger: ProjectCoordinatorRemoteTrigger): Promise<RuntimeReaction>;
	submitCandidate(
		trigger: ProjectCoordinatorRemoteTrigger,
		loop: RuntimeCandidateLoop,
		candidate: Record<string, unknown>,
		mode?: RuntimeSemanticMode,
	): Promise<ProjectCoordinatorCandidateResult>;
	react(
		trigger: ProjectCoordinatorRemoteTrigger,
		mode?: RuntimeSemanticMode,
	): Promise<RuntimeReactionJobReceipt[]>;
	heartbeat(): Promise<void>;
	disconnect(): Promise<void>;
}

export interface ProjectCoordinatorClientRequestOptions {
	timeoutMs?: number;
}

interface RemoteClientLease {
	clientId: string;
	connectionId: string;
	expiresAt: number;
	activeRequests: number;
	connection: ProjectCoordinatorClientConnection;
}

interface ServiceRuntime {
	endpoint: ProjectCoordinatorEndpoint;
	ownership: ProjectCoordinatorOwnership;
	coordinator: ProjectCoordinator;
	reactor: RuntimeReactor;
	semanticAdapters?: RuntimeSemanticAdapters;
	maxReactions?: number;
	maxPlanningChanges?: number;
	maxCasRetries?: number;
	clients: Map<string, RemoteClientLease>;
	clientLeaseMs: number;
	clock: () => number;
	server: Server;
	closing: boolean;
	shutdown?: () => Promise<void>;
}

export async function startProjectCoordinatorService(
	repoRoot: string,
	options: ProjectCoordinatorServiceOptions = {},
): Promise<ProjectCoordinatorServiceHandle> {
	const canonicalRoot = realpathSync(repoRoot);
	const generationId =
		requiredOptionalText(options.generationId, "generationId") ||
		`coordinator:${randomUUID()}`;
	const startedAt = (options.now || (() => new Date().toISOString()))();
	const coordinator = new ProjectCoordinator(canonicalRoot, {
		generationId,
		executionPolicy: options.executionPolicy,
		maxConcurrentJobs: options.maxConcurrentJobs,
		maxCompletedJobs: options.maxCompletedJobs,
		now: options.now,
		onEvent: options.onEvent,
	});
	let ownership: ProjectCoordinatorOwnership | undefined;
	let server: Server | undefined;
	try {
		ownership = await acquireProjectCoordinatorOwnership({
			repoRoot: canonicalRoot,
			generationId,
			startedAt,
		});
		await removeProjectCoordinatorEndpoint(canonicalRoot);
		const token = projectCoordinatorBearerToken();
		const clients = new Map<string, RemoteClientLease>();
		const runtime = {} as ServiceRuntime;
		server = createServer((request, response) => {
			void routeServiceRequest(runtime, request, response).catch((error) => {
				writeServiceError(response, error);
			});
		});
		await listenLoopback(server, boundedPort(options.port));
		const address = server.address() as AddressInfo | null;
		if (!address || typeof address === "string") {
			throw new Error("Project coordinator did not receive a TCP address.");
		}
		const endpoint: ProjectCoordinatorEndpoint = {
			schemaVersion: PROJECT_COORDINATOR_ENDPOINT_SCHEMA_VERSION,
			repoRoot: canonicalRoot,
			origin: `http://127.0.0.1:${address.port}`,
			token,
			pid: process.pid,
			generationId,
			startedAt,
		};
		Object.assign(runtime, {
			endpoint,
			ownership,
			coordinator,
			reactor: new RuntimeReactor(canonicalRoot),
			semanticAdapters: options.semanticAdapters,
			maxReactions: boundedOptionalInteger(
				options.maxReactions,
				1,
				32,
				"maxReactions",
			),
			maxPlanningChanges: boundedOptionalInteger(
				options.maxPlanningChanges,
				1,
				32,
				"maxPlanningChanges",
			),
			maxCasRetries: boundedOptionalInteger(
				options.maxCasRetries,
				0,
				8,
				"maxCasRetries",
			),
			clients,
			clientLeaseMs: boundedClientLease(options.clientLeaseMs),
			clock: options.clock || Date.now,
			server,
			closing: false,
		});
		await writeProjectCoordinatorEndpoint(endpoint);
		const sweep = setInterval(
			() => sweepExpiredClients(runtime),
			Math.min(Math.max(Math.floor(runtime.clientLeaseMs / 2), 250), 5_000),
		);
		sweep.unref();
		let closed = false;
		const close = async (): Promise<void> => {
			if (closed) return;
			if (coordinator.snapshot().jobs.length > 0) {
				throw new Error("Project coordinator service cannot close with pending jobs.");
			}
			closed = true;
			runtime.closing = true;
			clearInterval(sweep);
			await closeServer(server as Server);
			for (const lease of clients.values()) lease.connection.disconnect();
			clients.clear();
			coordinator.close();
			await releaseProjectCoordinatorOwnership(ownership as ProjectCoordinatorOwnership);
		};
		runtime.shutdown = close;
		return { endpoint, coordinator, close };
	} catch (error) {
		if (server) await closeServer(server).catch(() => undefined);
		try {
			coordinator.close();
		} catch {
			// No externally reachable service remains after startup failure.
		}
		if (ownership) await releaseProjectCoordinatorOwnership(ownership);
		throw error;
	}
}

export async function connectProjectCoordinatorClient(
	repoRoot: string,
	input: ProjectCoordinatorClientInput,
	options: ProjectCoordinatorClientRequestOptions = {},
): Promise<ProjectCoordinatorRemoteClient> {
	const endpoint = await requiredEndpoint(repoRoot);
	const response = await requestCoordinatorJson<{
		clientId: string;
		connectionId: string;
		generationId: string;
	}>(endpoint, "/v1/clients/connect", {
		method: "POST",
		body: input,
		timeoutMs: options.timeoutMs,
	});
	let disconnected = false;
	return {
		clientId: response.clientId,
		connectionId: response.connectionId,
		generationId: response.generationId,
		state() {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<ProjectCoordinatorSnapshot>(
				endpoint,
				"/v1/state",
				{ timeoutMs: options.timeoutMs },
			);
		},
		inspect(trigger) {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<RuntimeReaction>(
				endpoint,
				"/v1/runtime/inspect",
				{
					method: "POST",
					body: { connectionId: response.connectionId, trigger },
					timeoutMs: options.timeoutMs,
				},
			);
		},
		submitCandidate(trigger, loop, candidate, mode = "append") {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<ProjectCoordinatorCandidateResult>(
				endpoint,
				"/v1/runtime/candidate",
				{
					method: "POST",
					body: {
						connectionId: response.connectionId,
						trigger,
						loop,
						candidate,
						mode,
					},
					timeoutMs: options.timeoutMs,
				},
			);
		},
		react(trigger, mode = "append") {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<RuntimeReactionJobReceipt[]>(
				endpoint,
				"/v1/runtime/react",
				{
					method: "POST",
					body: { connectionId: response.connectionId, trigger, mode },
					timeoutMs: options.timeoutMs,
				},
			);
		},
		async heartbeat() {
			assertRemoteClientConnected(disconnected, response.clientId);
			await requestCoordinatorJson(endpoint, "/v1/clients/heartbeat", {
				method: "POST",
				body: { connectionId: response.connectionId },
				timeoutMs: options.timeoutMs,
			});
		},
		async disconnect() {
			if (disconnected) return;
			disconnected = true;
			await requestCoordinatorJson(endpoint, "/v1/clients/disconnect", {
				method: "POST",
				body: { connectionId: response.connectionId },
				timeoutMs: options.timeoutMs,
			});
		},
	};
}

export async function stopProjectCoordinatorService(
	repoRoot: string,
	options: ProjectCoordinatorClientRequestOptions = {},
): Promise<void> {
	const endpoint = await requiredEndpoint(repoRoot);
	await requestCoordinatorJson(endpoint, "/v1/shutdown", {
		method: "POST",
		body: {},
		timeoutMs: options.timeoutMs,
	});
	await waitForCoordinatorStop(
		endpoint,
		Date.now() + boundedRequestTimeout(options.timeoutMs),
	);
}

export async function readProjectCoordinatorServiceState(
	repoRoot: string,
	options: ProjectCoordinatorClientRequestOptions = {},
): Promise<ProjectCoordinatorSnapshot> {
	const endpoint = await requiredEndpoint(repoRoot);
	return requestCoordinatorJson(endpoint, "/v1/state", {
		timeoutMs: options.timeoutMs,
	});
}

export async function requestProjectCoordinatorHealth(
	endpoint: ProjectCoordinatorEndpoint,
	options: ProjectCoordinatorClientRequestOptions = {},
): Promise<{ generationId: string; pid: number }> {
	return requestCoordinatorJson(endpoint, "/v1/health", {
		timeoutMs: options.timeoutMs,
	});
}

async function routeServiceRequest(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	setResponseHeaders(response);
	if (runtime.closing) {
		writeJson(response, 503, { error: "coordinator_closing" });
		return;
	}
	if (!authorized(runtime.endpoint, request)) {
		writeJson(response, 403, { error: "forbidden" });
		return;
	}
	if (!(await projectCoordinatorOwnershipIsCurrent(runtime.ownership))) {
		writeJson(response, 409, {
			error: "stale_generation",
			generationId: runtime.endpoint.generationId,
		});
		return;
	}
	sweepExpiredClients(runtime);
	const url = requestUrl(request, runtime.endpoint.origin);
	if (url.origin !== runtime.endpoint.origin) {
		throw new HttpError(400, "request_origin_mismatch");
	}
	const method = request.method || "GET";
	if (method === "GET" && url.pathname === "/v1/health") {
		writeJson(response, 200, {
			generationId: runtime.endpoint.generationId,
			pid: runtime.endpoint.pid,
		});
		return;
	}
	if (method === "GET" && url.pathname === "/v1/state") {
		writeJson(response, 200, runtime.coordinator.snapshot());
		return;
	}
	if (method === "POST" && url.pathname === "/v1/shutdown") {
		const body = objectBody(await readJsonBody(request));
		assertOnlyKeys(body, []);
		if (runtime.coordinator.snapshot().jobs.length > 0) {
			throw new HttpError(409, "coordinator_jobs_pending");
		}
		writeJson(response, 202, { status: "shutting_down" });
		setImmediate(() => {
			void runtime.shutdown?.();
		});
		return;
	}
	if (method === "POST" && url.pathname === "/v1/clients/connect") {
		const body = objectBody(await readJsonBody(request));
		assertOnlyKeys(body, ["clientId", "kind", "supervision"]);
		let connection: ProjectCoordinatorClientConnection;
		try {
			connection = runtime.coordinator.connectClient({
				clientId: text(body.clientId),
				kind: body.kind as ProjectCoordinatorClientInput["kind"],
				supervision:
					body.supervision as ProjectCoordinatorClientInput["supervision"],
			});
		} catch (error) {
			throw new HttpError(400, errorMessage(error));
		}
		const connectionId = randomBytes(24).toString("base64url");
		runtime.clients.set(connectionId, {
			clientId: connection.clientId,
			connectionId,
			expiresAt: runtime.clock() + runtime.clientLeaseMs,
			activeRequests: 0,
			connection,
		});
		writeJson(response, 201, {
			clientId: connection.clientId,
			connectionId,
			generationId: runtime.endpoint.generationId,
		});
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/inspect") {
		await handleRuntimeInspection(runtime, request, response);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/candidate") {
		await handleRuntimeCandidate(runtime, request, response);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/react") {
		await handleRuntimeReaction(runtime, request, response);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/clients/heartbeat") {
		const lease = requiredLease(runtime, await readConnectionId(request));
		lease.expiresAt = runtime.clock() + runtime.clientLeaseMs;
		writeJson(response, 200, { status: "extended" });
		return;
	}
	if (method === "POST" && url.pathname === "/v1/clients/disconnect") {
		const connectionId = await readConnectionId(request);
		const lease = requiredLease(runtime, connectionId);
		lease.connection.disconnect();
		runtime.clients.delete(connectionId);
		writeJson(response, 200, { status: "disconnected" });
		return;
	}
	if (method !== "GET" && method !== "POST") {
		writeJson(response, 405, { error: "method_not_allowed" });
		return;
	}
	writeJson(response, 404, { error: "not_found" });
}

async function handleRuntimeInspection(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId", "trigger"]);
	const lease = requiredLease(runtime, text(body.connectionId));
	const trigger = runtimeTrigger(body.trigger, runtime.clock());
	lease.activeRequests += 1;
	try {
		writeJson(response, 200, await runtime.reactor.inspect(trigger));
	} finally {
		extendLease(runtime, lease);
	}
}

async function handleRuntimeCandidate(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, [
		"connectionId",
		"trigger",
		"loop",
		"candidate",
		"mode",
	]);
	const lease = requiredLease(runtime, text(body.connectionId));
	const trigger = runtimeTrigger(body.trigger, runtime.clock());
	const loop = runtimeCandidateLoop(body.loop);
	const candidate = objectBody(body.candidate);
	const mode = runtimeSemanticMode(body.mode);
	lease.activeRequests += 1;
	try {
		const observation = await runtime.reactor.observe(trigger);
		if (
			observation.reaction.status !== "ready" ||
			observation.reaction.selection?.loop !== loop
		) {
			throw new HttpError(409, "runtime_reaction_mismatch");
		}
		let execution: RunRuntimeSelectedSemanticReactionResult | undefined;
		const receipt = await scheduleRuntimeReactionJob({
			repoRoot: runtime.endpoint.repoRoot,
			coordinator: runtime.coordinator,
			reactor: runtime.reactor,
			reaction: observation.reaction,
			adapters: candidateAdapters(loop, candidate),
			mode,
			maxCasRetries: runtime.maxCasRetries,
			beforeAppend: () => assertCurrentGeneration(runtime),
			onExecution(result) {
				execution = result;
			},
		});
		writeJson(response, 200, {
			receipt,
			...(execution ? { execution } : {}),
		} satisfies ProjectCoordinatorCandidateResult);
	} finally {
		extendLease(runtime, lease);
	}
}

async function handleRuntimeReaction(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId", "trigger", "mode"]);
	const lease = requiredLease(runtime, text(body.connectionId));
	const trigger = runtimeTrigger(body.trigger, runtime.clock());
	const mode = runtimeSemanticMode(body.mode);
	const adapters = runtime.semanticAdapters;
	if (!adapters) {
		throw new HttpError(503, "semantic_adapters_unavailable");
	}
	lease.activeRequests += 1;
	try {
		const receipts = await scheduleRuntimeReactions({
			repoRoot: runtime.endpoint.repoRoot,
			coordinator: runtime.coordinator,
			reactor: runtime.reactor,
			trigger,
			adapters,
			mode,
			maxReactions: runtime.maxReactions,
			maxPlanningChanges: runtime.maxPlanningChanges,
			maxCasRetries: runtime.maxCasRetries,
			beforeAppend: () => assertCurrentGeneration(runtime),
		});
		writeJson(response, 200, receipts);
	} finally {
		extendLease(runtime, lease);
	}
}

function candidateAdapters(
	loop: RuntimeCandidateLoop,
	candidate: Record<string, unknown>,
): RuntimeSemanticAdapters {
	if (loop === "decision") {
		return { decision: () => candidate as RuntimeDecisionCandidate };
	}
	if (loop === "planning") {
		return { planning: () => candidate as RuntimePlanningCandidate };
	}
	return {
		implementation: () => candidate as RuntimeImplementationCandidate,
	};
}

async function assertCurrentGeneration(runtime: ServiceRuntime): Promise<void> {
	if (!(await projectCoordinatorOwnershipIsCurrent(runtime.ownership))) {
		throw new HttpError(409, "stale_generation");
	}
}

function extendLease(runtime: ServiceRuntime, lease: RemoteClientLease): void {
	lease.activeRequests -= 1;
	lease.expiresAt = runtime.clock() + runtime.clientLeaseMs;
}

async function readConnectionId(request: IncomingMessage): Promise<string> {
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId"]);
	return text(body.connectionId);
}

function requiredLease(
	runtime: ServiceRuntime,
	connectionId: string,
): RemoteClientLease {
	const lease = runtime.clients.get(connectionId);
	if (!lease) throw new HttpError(404, "client_connection_not_found");
	return lease;
}

function sweepExpiredClients(runtime: ServiceRuntime): void {
	const now = runtime.clock();
	for (const [connectionId, lease] of runtime.clients) {
		if (lease.activeRequests > 0 || lease.expiresAt > now) continue;
		lease.connection.disconnect();
		runtime.clients.delete(connectionId);
	}
}

function authorized(
	endpoint: ProjectCoordinatorEndpoint,
	request: IncomingMessage,
): boolean {
	const authorization = request.headers.authorization;
	const generation = request.headers["x-codewiki-generation"];
	return (
		typeof authorization === "string" &&
		safeEqual(authorization, `Bearer ${endpoint.token}`) &&
		typeof generation === "string" &&
		safeEqual(generation, endpoint.generationId)
	);
}

async function requiredEndpoint(
	repoRoot: string,
): Promise<ProjectCoordinatorEndpoint> {
	const canonicalRoot = realpathSync(repoRoot);
	const endpoint = await readProjectCoordinatorEndpoint(canonicalRoot);
	if (!endpoint) {
		throw new Error(`No project coordinator endpoint exists for ${canonicalRoot}.`);
	}
	return endpoint;
}

async function requestCoordinatorJson<T>(
	endpoint: ProjectCoordinatorEndpoint,
	path: string,
	options: {
		method?: "GET" | "POST";
		body?: unknown;
		timeoutMs?: number;
	} = {},
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		boundedRequestTimeout(options.timeoutMs),
	);
	try {
		const response = await fetch(`${endpoint.origin}${path}`, {
			method: options.method || "GET",
			headers: {
				authorization: `Bearer ${endpoint.token}`,
				"x-codewiki-generation": endpoint.generationId,
				...(options.body === undefined
					? {}
					: { "content-type": "application/json" }),
			},
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
			redirect: "error",
			signal: controller.signal,
		});
		const declaredLength = Number(response.headers.get("content-length") || 0);
		if (declaredLength > MAX_RESPONSE_BYTES) {
			throw new Error("Project coordinator response exceeds 1 MiB.");
		}
		const body = await response.text();
		if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
			throw new Error("Project coordinator response exceeds 1 MiB.");
		}
		let parsed: unknown;
		try {
			parsed = body ? JSON.parse(body) : undefined;
		} catch {
			throw new Error("Project coordinator returned invalid JSON.");
		}
		if (!response.ok) {
			const message =
				parsed && typeof parsed === "object" && "error" in parsed
					? String((parsed as { error?: unknown }).error)
					: `HTTP ${response.status}`;
			throw new HttpError(response.status, message);
		}
		return parsed as T;
	} finally {
		clearTimeout(timeout);
	}
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
	const contentType = String(request.headers["content-type"] || "")
		.split(";", 1)[0]
		.trim()
		.toLowerCase();
	if (contentType !== "application/json") {
		throw new HttpError(415, "application_json_required");
	}
	const chunks: Buffer[] = [];
	let total = 0;
	for await (const chunk of request) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += bytes.length;
		if (total > MAX_REQUEST_BYTES) {
			throw new HttpError(413, "request_too_large");
		}
		chunks.push(bytes);
	}
	if (chunks.length === 0) throw new HttpError(400, "json_body_required");
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new HttpError(400, "invalid_json");
	}
}

function requestUrl(request: IncomingMessage, origin: string): URL {
	try {
		return new URL(request.url || "/", origin);
	} catch {
		throw new HttpError(400, "invalid_request_url");
	}
}

function objectBody(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new HttpError(400, "json_object_required");
	}
	return value as Record<string, unknown>;
}

function runtimeTrigger(value: unknown, observedAt: number): RuntimeTrigger {
	const trigger = objectBody(value);
	assertOnlyKeys(trigger, ["kind", "refs"]);
	const kind = text(trigger.kind);
	if (
		![
			"session_started",
			"change_trace_appended",
			"project_truth_changed",
			"timer_due",
			"user_response",
			"manual_resume",
		].includes(kind)
	) {
		throw new HttpError(400, "invalid_runtime_trigger_kind");
	}
	if (!Number.isFinite(observedAt) || observedAt < 0) {
		throw new Error("Project coordinator clock returned an invalid time.");
	}
	if (trigger.refs !== undefined && !Array.isArray(trigger.refs)) {
		throw new HttpError(400, "invalid_runtime_trigger_refs");
	}
	const refs = (trigger.refs || []).map((ref) => text(ref).trim());
	if (refs.length > 128 || refs.some((ref) => !ref || ref.length > 1_024)) {
		throw new HttpError(400, "invalid_runtime_trigger_refs");
	}
	return {
		kind: kind as RuntimeTrigger["kind"],
		occurredAt: new Date(observedAt).toISOString(),
		...(refs.length > 0 ? { refs: [...new Set(refs)].sort(compareText) } : {}),
	};
}

function runtimeCandidateLoop(value: unknown): RuntimeCandidateLoop {
	if (
		value === "decision" ||
		value === "planning" ||
		value === "implementation"
	) {
		return value;
	}
	throw new HttpError(400, "invalid_runtime_candidate_loop");
}

function runtimeSemanticMode(value: unknown): RuntimeSemanticMode {
	if (value === undefined || value === "append") return "append";
	if (value === "preview") return "preview";
	throw new HttpError(400, "invalid_runtime_semantic_mode");
}

function assertOnlyKeys(
	value: Record<string, unknown>,
	allowed: string[],
): void {
	const allowedKeys = new Set(allowed);
	const unsupported = Object.keys(value).filter((key) => !allowedKeys.has(key));
	if (unsupported.length > 0) {
		throw new HttpError(
			400,
			`unsupported_field:${unsupported.sort(compareText)[0]}`,
		);
	}
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function setResponseHeaders(response: ServerResponse): void {
	response.setHeader("cache-control", "no-store");
	response.setHeader("content-type", "application/json; charset=utf-8");
	response.setHeader("x-content-type-options", "nosniff");
	response.setHeader("referrer-policy", "no-referrer");
}

function writeServiceError(response: ServerResponse, error: unknown): void {
	if (error instanceof HttpError) {
		writeJson(response, error.status, { error: error.message });
		return;
	}
	writeJson(response, 500, { error: "internal_error" });
}

function writeJson(
	response: ServerResponse,
	status: number,
	body: unknown,
): void {
	if (response.headersSent || response.writableEnded) return;
	const json = `${JSON.stringify(body)}\n`;
	response.statusCode = status;
	response.setHeader("content-length", Buffer.byteLength(json));
	response.end(json);
}

async function listenLoopback(server: Server, port: number): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => {
			server.off("listening", onListening);
			reject(error);
		};
		const onListening = () => {
			server.off("error", onError);
			resolve();
		};
		server.once("error", onError);
		server.once("listening", onListening);
		server.listen({ host: "127.0.0.1", port });
	});
}

async function closeServer(server: Server): Promise<void> {
	if (!server.listening) return;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

function boundedClientLease(value: number | undefined): number {
	if (value === undefined) return DEFAULT_CLIENT_LEASE_MS;
	if (!Number.isInteger(value) || value < 500 || value > 300_000) {
		throw new Error("clientLeaseMs must be an integer from 500 to 300000.");
	}
	return value;
}

function boundedRequestTimeout(value: number | undefined): number {
	if (value === undefined) return DEFAULT_REQUEST_TIMEOUT_MS;
	if (!Number.isInteger(value) || value < 100 || value > 600_000) {
		throw new Error("timeoutMs must be an integer from 100 to 600000.");
	}
	return value;
}

function boundedPort(value: number | undefined): number {
	if (value === undefined) return 0;
	if (!Number.isInteger(value) || value < 0 || value > 65_535) {
		throw new Error("port must be an integer from 0 to 65535.");
	}
	return value;
}

function boundedOptionalInteger(
	value: number | undefined,
	minimum: number,
	maximum: number,
	field: string,
): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value < minimum || value > maximum) {
		throw new Error(
			`${field} must be an integer from ${minimum} to ${maximum}.`,
		);
	}
	return value;
}

function requiredOptionalText(
	value: string | undefined,
	field: string,
): string | undefined {
	if (value === undefined) return undefined;
	const normalized = value.trim();
	if (!normalized || normalized.length > 512) {
		throw new Error(`${field} is invalid.`);
	}
	return normalized;
}

function assertRemoteClientConnected(
	disconnected: boolean,
	clientId: string,
): void {
	if (disconnected) {
		throw new Error(`Project coordinator client ${clientId} is disconnected.`);
	}
}

async function waitForCoordinatorStop(
	endpoint: ProjectCoordinatorEndpoint,
	deadline: number,
): Promise<void> {
	const current = await readProjectCoordinatorEndpoint(endpoint.repoRoot).catch(
		() => undefined,
	);
	if (!current || current.generationId !== endpoint.generationId) return;
	if (Date.now() >= deadline) {
		throw new Error("Project coordinator service did not stop before timeout.");
	}
	await new Promise((resolve) => setTimeout(resolve, 25));
	return waitForCoordinatorStop(endpoint, deadline);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

class HttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}
