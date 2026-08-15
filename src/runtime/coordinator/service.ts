import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { realpathSync } from "node:fs";
import type { Server } from "node:http";

import type { WorktreeCommandRunner } from "../../git/worktrees.ts";
import {
	normalizeClientServerRequestContext,
	type ClientServerRequestContext,
} from "../../protocol/client-server.ts";
import {
	loadRuntimeAppState,
	type CodewikiAppState,
} from "../queries/app-state.ts";
import {
	loadRuntimeChangesState,
	type RuntimeChangesState,
} from "../queries/changes.ts";
import {
	loadRuntimeConfigurationState,
	type RuntimeConfigurationState,
} from "../queries/configuration.ts";
import {
	BACKLOG_TRIAGE_QUERY_PROTOCOL,
	type BacklogTriageQueryRequest,
	type BacklogTriageQueryResult,
} from "../../changes/triage/contracts.ts";
import {queryBacklogTriage} from "../../changes/triage/query.ts";
import {
	DecisionAttentionSelectionError,
	parseDecisionAttentionSelectionCommand,
	type AuthenticatedDecisionSelectionAuthority,
	type DecisionAttentionSelectionCommand,
} from "../../changes/triage/selection.ts";
import {
	createDecisionStartRuntime,
	type DecisionStartResult,
	type DecisionStartRuntime,
	type DecisionStartRuntimeOptions,
} from "../admission/start.ts";
import {
	ImplementationWorkerDispatcher,
	type ImplementationWorkerDispatchResult,
} from "../workers/dispatch.ts";
import type {
	ImplementationWorkerAdapter,
	ImplementationWorkerAssignment,
} from "../workers/implementation-adapter.ts";
import {
	scheduleImplementationWorkerAssignments,
	type ImplementationWorkerJobReceipt,
} from "../workers/jobs.ts";
import {
	ProjectCoordinatorEventJournal,
	type ProjectCoordinatorEventBatch,
} from "./events.ts";
import type { ProjectBranchMergeAuthority } from "../effects/project-branch-merge.ts";
import type { ProjectBranchPushAuthority } from "../effects/project-branch-push.ts";
import type {
	ProductPublicationAdapter,
	ProductPublicationPlan,
} from "../effects/product-publication-contract.ts";
import type {
	ProductReleaseAdapter,
	ProductReleasePlan,
} from "../effects/product-release-contract.ts";
import {
	ProjectCoordinator,
	type ProjectCoordinatorClientConnection,
	type ProjectCoordinatorClientInput,
	type ProjectCoordinatorEvent,
	type ProjectCoordinatorExecutionPolicy,
	type ProjectCoordinatorOptions,
	type ProjectCoordinatorSnapshot,
} from "./project.ts";
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
} from "./endpoint.ts";
import {
	RuntimeReactor,
	type RuntimeReaction,
	type RuntimeTrigger,
} from "./reactor.ts";
import {
	scheduleRuntimeReactionJob,
	scheduleRuntimeReactions,
	type RuntimeReactionJobReceipt,
} from "./reactions.ts";
import { parseDecisionCandidateProposal } from "../../loops/decision/candidate-proposal.ts";
import { parseImplementationCandidateContent } from "../../loops/implementation/candidate-content.ts";
import { parsePlanningCandidateContent } from "../../loops/planning/candidate-content.ts";
import type {
	RunRuntimeSelectedSemanticReactionResult,
	RuntimeLoopExecutionPorts,
	RuntimeSemanticAdapters,
	RuntimeSemanticContext,
	RuntimeSemanticMode,
} from "./executor.ts";

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
	loopExecutionPorts?: RuntimeLoopExecutionPorts;
	semanticContext?: RuntimeSemanticContext;
	maxReactions?: number;
	maxPlanningChanges?: number;
	maxCasRetries?: number;
	maxEventHistory?: number;
	workerAdapter?: ImplementationWorkerAdapter;
	workerWorktreeRunner?: WorktreeCommandRunner;
	mergeAuthority?: ProjectBranchMergeAuthority;
	pushAuthority?: ProjectBranchPushAuthority;
	publicationPlan?: ProductPublicationPlan;
	publicationAdapter?: ProductPublicationAdapter;
	releasePlan?: ProductReleasePlan;
	releaseAdapter?: ProductReleaseAdapter;
	onEvent?: (event: ProjectCoordinatorEvent) => void;
	decisionStart?: ProjectCoordinatorDecisionStartOptions;
}

export interface ProjectCoordinatorDecisionAttentionCaller {
	readonly clientId: string;
	readonly clientKind: ProjectCoordinatorClientInput["kind"];
	readonly supervision: "observer" | "approved";
	readonly connectionId: string;
	readonly generationId: string;
}

export interface ProjectCoordinatorDecisionStartOptions
	extends Omit<DecisionStartRuntimeOptions, "coordinator" | "now"> {
	resolveAuthority(
		caller: ProjectCoordinatorDecisionAttentionCaller,
	):
		| AuthenticatedDecisionSelectionAuthority
		| Promise<AuthenticatedDecisionSelectionAuthority>;
}

export interface ProjectCoordinatorServiceHandle {
	endpoint: ProjectCoordinatorEndpoint;
	coordinator: ProjectCoordinator;
	scheduleWorkerAssignments(
		assignments: ImplementationWorkerAssignment[],
	): Promise<ImplementationWorkerJobReceipt[]>;
	reconcileWorkers(trigger: RuntimeTrigger): Promise<ImplementationWorkerDispatchResult>;
	close(): Promise<void>;
}

type ProjectCoordinatorRemoteTrigger = Omit<
	RuntimeTrigger,
	"occurredAt"
>;
export type RuntimeCandidateLoop = "decision" | "planning" | "implementation";
export type ProjectCoordinatorSemanticExecution =
	| "service"
	| "client_candidate";

export interface ProjectCoordinatorCandidateResult {
	receipt: RuntimeReactionJobReceipt;
	execution?: RunRuntimeSelectedSemanticReactionResult;
}

export interface ProjectCoordinatorRemoteClient {
	clientId: string;
	connectionId: string;
	generationId: string;
	semanticExecution: ProjectCoordinatorSemanticExecution;
	state(): Promise<ProjectCoordinatorSnapshot>;
	appState(context: ClientServerRequestContext): Promise<CodewikiAppState>;
	changes(context: ClientServerRequestContext): Promise<RuntimeChangesState>;
	configuration(context: ClientServerRequestContext): Promise<RuntimeConfigurationState>;
	inspect(trigger: ProjectCoordinatorRemoteTrigger): Promise<RuntimeReaction>;
	decisionAttention(
		request?: BacklogTriageQueryRequest,
	): Promise<BacklogTriageQueryResult>;
	selectDecision(
		command: DecisionAttentionSelectionCommand,
	): Promise<DecisionStartResult>;
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
	reconcileWorkers(
		trigger: ProjectCoordinatorRemoteTrigger,
	): Promise<ImplementationWorkerDispatchResult>;
	events(
		afterCursor: number,
		options?: { maxEvents?: number; waitMs?: number },
	): Promise<ProjectCoordinatorEventBatch>;
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
	eventJournal: ProjectCoordinatorEventJournal;
	reactor: RuntimeReactor;
	workerDispatcher?: ImplementationWorkerDispatcher;
	semanticAdapters?: RuntimeSemanticAdapters;
	loopExecutionPorts?: RuntimeLoopExecutionPorts;
	semanticContext?: RuntimeSemanticContext;
	maxReactions?: number;
	maxPlanningChanges?: number;
	maxCasRetries?: number;
	decisionStart?: {
		readonly runtime: DecisionStartRuntime;
		readonly resolveAuthority: ProjectCoordinatorDecisionStartOptions["resolveAuthority"];
		readonly loadCurrentContext: ProjectCoordinatorDecisionStartOptions["loadCurrentContext"];
	};
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
	const eventJournal = new ProjectCoordinatorEventJournal(
		generationId,
		boundedOptionalInteger(options.maxEventHistory, 16, 4_096, "maxEventHistory") ||
			512,
	);
	const coordinator = new ProjectCoordinator(canonicalRoot, {
		generationId,
		executionPolicy: options.executionPolicy,
		maxConcurrentJobs: options.maxConcurrentJobs,
		maxCompletedJobs: options.maxCompletedJobs,
		now: options.now,
		onEvent: (event) => {
			eventJournal.append(event);
			options.onEvent?.(event);
		},
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
		const reactor = new RuntimeReactor(canonicalRoot);
		const workerDispatcher = options.workerAdapter
			? new ImplementationWorkerDispatcher({
					repoRoot: canonicalRoot,
					coordinator,
					reactor,
					adapter: options.workerAdapter,
					worktreeRunner: options.workerWorktreeRunner,
					mergeAuthority: options.mergeAuthority,
					pushAuthority: options.pushAuthority,
					publicationPlan: options.publicationPlan,
					publicationAdapter: options.publicationAdapter,
					releasePlan: options.releasePlan,
					releaseAdapter: options.releaseAdapter,
					now: options.now,
					beforeAppend: () => assertCurrentGeneration(runtime),
				})
			: undefined;
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
		const decisionStartOptions = options.decisionStart;
		const decisionStart = decisionStartOptions
			? {
					resolveAuthority: decisionStartOptions.resolveAuthority,
					loadCurrentContext: decisionStartOptions.loadCurrentContext,
					runtime: createDecisionStartRuntime({
						coordinator,
						loadCurrentContext: decisionStartOptions.loadCurrentContext,
						authorize: decisionStartOptions.authorize,
						async appendAttempt(input) {
							await assertCurrentGeneration(runtime);
							return decisionStartOptions.appendAttempt(input);
						},
						executor: decisionStartOptions.executor,
						now: options.now,
					}),
				}
			: undefined;
		Object.assign(runtime, {
			endpoint,
			ownership,
			coordinator,
			eventJournal,
			reactor,
			workerDispatcher,
			semanticAdapters: options.semanticAdapters,
			loopExecutionPorts: options.loopExecutionPorts,
			semanticContext: options.semanticContext,
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
			decisionStart,
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
		let closePromise: Promise<void> | undefined;
		const close = (): Promise<void> => {
			if (closePromise) return closePromise;
			closePromise = (async () => {
				runtime.closing = true;
				clearInterval(sweep);
				for (const lease of clients.values()) lease.connection.disconnect();
				clients.clear();
				const serverClosed = closeServer(server as Server);
				(server as Server).closeAllConnections();
				await coordinator.cancelJobs(
					`Project coordinator generation ${generationId} is stopping.`,
				);
				await serverClosed;
				eventJournal.close();
				coordinator.close();
				await releaseProjectCoordinatorOwnership(
					ownership as ProjectCoordinatorOwnership,
				);
			})();
			return closePromise;
		};
		runtime.shutdown = close;
		return {
			endpoint,
			coordinator,
			async scheduleWorkerAssignments(assignments) {
				await assertCurrentGeneration(runtime);
				if (!options.workerAdapter) {
					throw new Error("Implementation worker adapter is unavailable.");
				}
				return scheduleImplementationWorkerAssignments({
					coordinator,
					adapter: options.workerAdapter,
					assignments,
				});
			},
			async reconcileWorkers(trigger) {
				await assertCurrentGeneration(runtime);
				if (!workerDispatcher) {
					throw new Error("Implementation worker dispatcher is unavailable.");
				}
				return workerDispatcher.reconcile(trigger);
			},
			close,
		};
	} catch (error) {
		eventJournal.close();
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
		semanticExecution: ProjectCoordinatorSemanticExecution;
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
		semanticExecution: response.semanticExecution,
		state() {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<ProjectCoordinatorSnapshot>(
				endpoint,
				"/v1/state",
				{ timeoutMs: options.timeoutMs },
			);
		},
		appState(context) {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<CodewikiAppState>(
				endpoint,
				"/v1/runtime/app-state",
				{
					method: "POST",
					body: {
						connectionId: response.connectionId,
						context: normalizeClientServerRequestContext(context),
					},
					timeoutMs: options.timeoutMs,
				},
			);
		},
		changes(context) {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<RuntimeChangesState>(
				endpoint,
				"/v1/runtime/changes",
				{
					method: "POST",
					body: {
						connectionId: response.connectionId,
						context: normalizeClientServerRequestContext(context),
					},
					timeoutMs: options.timeoutMs,
				},
			);
		},
		configuration(context) {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<RuntimeConfigurationState>(
				endpoint,
				"/v1/runtime/configuration",
				{
					method: "POST",
					body: {
						connectionId: response.connectionId,
						context: normalizeClientServerRequestContext(context),
					},
					timeoutMs: options.timeoutMs,
				},
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
		decisionAttention(request) {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<BacklogTriageQueryResult>(
				endpoint,
				"/v1/runtime/decision-attention",
				{
					method: "POST",
					body: {
						connectionId: response.connectionId,
						...(request === undefined ? {} : {request}),
					},
					timeoutMs: options.timeoutMs,
				},
			);
		},
		selectDecision(command) {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<DecisionStartResult>(
				endpoint,
				"/v1/runtime/decision-selection",
				{
					method: "POST",
					body: {connectionId: response.connectionId, command},
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
					timeoutMs: Math.max(
						DEFAULT_REQUEST_TIMEOUT_MS,
						options.timeoutMs || 0,
						180_000,
					),
				},
			);
		},
		reconcileWorkers(trigger) {
			assertRemoteClientConnected(disconnected, response.clientId);
			return requestCoordinatorJson<ImplementationWorkerDispatchResult>(
				endpoint,
				"/v1/runtime/workers/reconcile",
				{
					method: "POST",
					body: { connectionId: response.connectionId, trigger },
					timeoutMs: options.timeoutMs,
				},
			);
		},
		events(afterCursor, eventOptions = {}) {
			assertRemoteClientConnected(disconnected, response.clientId);
			const waitMs = eventOptions.waitMs ?? 0;
			return requestCoordinatorJson<ProjectCoordinatorEventBatch>(
				endpoint,
				"/v1/events/poll",
				{
					method: "POST",
					body: {
						connectionId: response.connectionId,
						afterCursor,
						...(eventOptions.maxEvents === undefined
							? {}
							: { maxEvents: eventOptions.maxEvents }),
						...(eventOptions.waitMs === undefined ? {} : { waitMs }),
					},
					timeoutMs: Math.max(5_000, waitMs + 2_000),
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
): Promise<{
	generationId: string;
	pid: number;
	semanticExecution: ProjectCoordinatorSemanticExecution;
}> {
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
			semanticExecution: semanticExecution(runtime),
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
			semanticExecution: semanticExecution(runtime),
		});
		return;
	}
	if (method === "POST" && url.pathname === "/v1/events/poll") {
		await handleEventPoll(runtime, request, response);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/app-state") {
		await handleRuntimeProjection(runtime, request, response, loadRuntimeAppState);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/changes") {
		await handleRuntimeProjection(
			runtime,
			request,
			response,
			loadRuntimeChangesState,
		);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/configuration") {
		await handleRuntimeProjection(
			runtime,
			request,
			response,
			loadRuntimeConfigurationState,
		);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/inspect") {
		await handleRuntimeInspection(runtime, request, response);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/decision-attention") {
		await handleDecisionAttentionQuery(runtime, request, response);
		return;
	}
	if (method === "POST" && url.pathname === "/v1/runtime/decision-selection") {
		await handleDecisionAttentionSelection(runtime, request, response);
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
	if (method === "POST" && url.pathname === "/v1/runtime/workers/reconcile") {
		await handleWorkerReconciliation(runtime, request, response);
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

async function handleEventPoll(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId", "afterCursor", "maxEvents", "waitMs"]);
	const lease = requiredLease(runtime, text(body.connectionId));
	lease.activeRequests += 1;
	try {
		const batch = await runtime.eventJournal.poll({
			afterCursor: eventInteger(body.afterCursor, 0, Number.MAX_SAFE_INTEGER, "afterCursor"),
			...(body.maxEvents === undefined
				? {}
				: { maxEvents: eventInteger(body.maxEvents, 1, 256, "maxEvents") }),
			...(body.waitMs === undefined
				? {}
				: { waitMs: eventInteger(body.waitMs, 0, 25_000, "waitMs") }),
		});
		writeJson(response, 200, batch);
	} finally {
		extendLease(runtime, lease);
	}
}

async function handleRuntimeProjection<T>(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
	load: (repoRoot: string) => Promise<T>,
): Promise<void> {
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId", "context"]);
	const lease = requiredLease(runtime, text(body.connectionId));
	normalizeClientServerRequestContext(body.context);
	lease.activeRequests += 1;
	try {
		await assertCurrentGeneration(runtime);
		const result = await load(runtime.endpoint.repoRoot);
		await assertCurrentGeneration(runtime);
		writeJson(response, 200, result);
	} finally {
		extendLease(runtime, lease);
	}
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
		const reaction = await runtime.reactor.inspect(trigger);
		if (
			trigger.kind === "change_trace_appended" ||
			trigger.kind === "project_truth_changed"
		) {
			runtime.eventJournal.append({
				generationId: runtime.endpoint.generationId,
				state: "work_state_observed",
				observedAt: new Date(runtime.clock()).toISOString(),
				workStateDigest: reaction.observedWorkStateDigest,
			});
		}
		writeJson(response, 200, reaction);
	} finally {
		extendLease(runtime, lease);
	}
}

async function handleDecisionAttentionQuery(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const start = runtime.decisionStart;
	if (!start) {
		throw new HttpError(503, "decision_attention_projection_unavailable");
	}
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId", "request"]);
	const lease = requiredLease(runtime, text(body.connectionId));
	lease.activeRequests += 1;
	try {
		await assertCurrentGeneration(runtime);
		const context = await start.loadCurrentContext();
		const queryRequest =
			body.request === undefined
				? {
						protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
						projectionDigest: context.projection.projectionDigest,
					}
				: (body.request as BacklogTriageQueryRequest);
		let result: BacklogTriageQueryResult;
		try {
			result = queryBacklogTriage(context.projection, queryRequest);
		} catch (error) {
			throw new HttpError(400, errorMessage(error));
		}
		await assertCurrentGeneration(runtime);
		writeJson(response, 200, result);
	} finally {
		extendLease(runtime, lease);
	}
}

async function handleDecisionAttentionSelection(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const start = runtime.decisionStart;
	if (!start) {
		throw new HttpError(503, "decision_attention_selection_unavailable");
	}
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId", "command"]);
	const lease = requiredLease(runtime, text(body.connectionId));
	let command: DecisionAttentionSelectionCommand;
	try {
		command = parseDecisionAttentionSelectionCommand(body.command);
	} catch (error) {
		throw new HttpError(400, errorMessage(error));
	}
	lease.activeRequests += 1;
	try {
		await assertCurrentGeneration(runtime);
		let result: DecisionStartResult;
		try {
			const authority = await start.resolveAuthority({
				clientId: lease.clientId,
				clientKind: lease.connection.kind,
				supervision: lease.connection.supervision,
				connectionId: lease.connectionId,
				generationId: runtime.endpoint.generationId,
			});
			result = await start.runtime.start({command, authority});
		} catch (error) {
			if (error instanceof DecisionAttentionSelectionError) {
				let status = 409;
				if (error.code === "bad_request") status = 400;
				else if (error.code === "forbidden") status = 403;
				throw new HttpError(status, error.message);
			}
			throw error;
		}
		await assertCurrentGeneration(runtime);
		writeJson(response, 200, result);
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
	const adapters = candidateAdapters(loop, candidate);
	if (loop === "decision") {
		throw new HttpError(409, "decision_attention_selection_required");
	}
	const executionPorts = runtime.loopExecutionPorts;
	if (!executionPorts) {
		throw new HttpError(503, "loop_execution_ports_unavailable");
	}
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
			adapters,
			executionPorts,
			context: runtime.semanticContext,
			mode,
			maxCasRetries: runtime.maxCasRetries,
			beforeAppend: () => assertCurrentGeneration(runtime),
			onExecution(result) {
				execution = result;
			},
		});
		await reconcileWorkersAfterSemantic(runtime);
		writeJson(response, 200, {
			receipt,
			...(execution ? { execution } : {}),
		} satisfies ProjectCoordinatorCandidateResult);
	} finally {
		extendLease(runtime, lease);
	}
}

async function handleWorkerReconciliation(
	runtime: ServiceRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const body = objectBody(await readJsonBody(request));
	assertOnlyKeys(body, ["connectionId", "trigger"]);
	const lease = requiredLease(runtime, text(body.connectionId));
	const trigger = runtimeTrigger(body.trigger, runtime.clock());
	const dispatcher = runtime.workerDispatcher;
	if (!dispatcher) {
		throw new HttpError(503, "implementation_worker_dispatcher_unavailable");
	}
	lease.activeRequests += 1;
	try {
		writeJson(response, 200, await dispatcher.reconcile(trigger));
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
	const executionPorts = runtime.loopExecutionPorts;
	if (!executionPorts) {
		throw new HttpError(503, "loop_execution_ports_unavailable");
	}
	lease.activeRequests += 1;
	try {
		const workerReconciliation = await runtime.workerDispatcher
			?.reconcileRuntime(trigger)
			.catch(() => undefined);
		const receipts = await scheduleRuntimeReactions({
			repoRoot: runtime.endpoint.repoRoot,
			coordinator: runtime.coordinator,
			reactor: runtime.reactor,
			trigger,
			adapters,
			executionPorts,
			context: runtime.semanticContext,
			mode,
			maxReactions: runtime.maxReactions,
			maxPlanningChanges: runtime.maxPlanningChanges,
			maxCasRetries: runtime.maxCasRetries,
			blockedImplementationWorkItemIds:
				workerReconciliation?.dispatch.pendingWorkItemIds,
			implementationWorkerReports: workerReconciliation?.workerReports,
			beforeAppend: () => assertCurrentGeneration(runtime),
		});
		await reconcileWorkersAfterSemantic(runtime);
		writeJson(response, 200, receipts);
	} finally {
		extendLease(runtime, lease);
	}
}

async function reconcileWorkersAfterSemantic(
	runtime: ServiceRuntime,
): Promise<void> {
	if (!runtime.workerDispatcher) return;
	try {
		await assertCurrentGeneration(runtime);
		await runtime.workerDispatcher.reconcileRuntime({
			kind: "project_truth_changed",
			occurredAt: new Date(runtime.clock()).toISOString(),
		});
	} catch {
		// Semantic append is already authoritative; later triggers retry reconciliation.
	}
}

function semanticExecution(
	runtime: ServiceRuntime,
): ProjectCoordinatorSemanticExecution {
	return runtime.semanticAdapters ? "service" : "client_candidate";
}

function candidateAdapters(
	loop: RuntimeCandidateLoop,
	candidate: Record<string, unknown>,
): RuntimeSemanticAdapters {
	try {
		if (loop === "decision") {
			const parsed = parseDecisionCandidateProposal(candidate);
			return { decision: () => parsed };
		}
		if (loop === "planning") {
			const parsed = parsePlanningCandidateContent(candidate);
			return { planning: () => parsed };
		}
		const parsed = parseImplementationCandidateContent(candidate);
		return { implementation: () => parsed };
	} catch (error) {
		throw new HttpError(400, errorMessage(error));
	}
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

function eventInteger(
	value: unknown,
	minimum: number,
	maximum: number,
	field: string,
): number {
	if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
		throw new HttpError(400, `${field}_invalid`);
	}
	return Number(value);
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
