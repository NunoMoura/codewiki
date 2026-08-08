import { createHash, randomBytes } from "node:crypto";
import {
	chmodSync,
	closeSync,
	fchmodSync,
	mkdirSync,
	openSync,
	watch,
	type FSWatcher,
} from "node:fs";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import {
	createServer,
	request as httpRequest,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
	buildProjectWikiState,
	readProjectTraceFiles,
} from "../project/state-file.ts";
import {
	knowledgeTopicRefsFromRecords,
	readKnowledgeTopicDigests,
} from "../knowledge/topic-alignment.ts";
import { openSystemBrowser } from "../preview/browser-adapter.ts";
import {
	parseDashboardPreviewCommand,
	type DashboardPreviewControl,
	unavailableDashboardPreviewControl,
} from "../preview/dashboard-control.ts";
import { readDevLog } from "../runtime/dev-log.ts";
import type { ProjectCoordinatorClientInput } from "../runtime/coordinator/project.ts";
import { connectEnsuredProjectCoordinatorClient } from "../runtime/coordinator/process.ts";
import type { ProjectCoordinatorRemoteClient } from "../runtime/coordinator/service.ts";
import { CODEWIKI_DASHBOARD_HTML } from "./assets.ts";
import {
	createDashboardChangeControl,
	type DashboardChangeControl,
} from "./change-control.ts";
import {
	createDefaultDashboardConfigControl,
	type DashboardConfigControl,
} from "./config-control.ts";
import {
	createDashboardSessionActionControl,
	type DashboardSessionActionControl,
} from "./session-actions.ts";
import {
	type DashboardTraceHostControl,
	DashboardTraceHostControlError,
} from "./trace-host-control.ts";
import { createDefaultDashboardTraceHostControl } from "./trace-host-runtime.ts";
import {
	assertDashboardRuntimeCurrent,
	captureDashboardRuntimeIdentity,
} from "./health.ts";
import {
	buildCodewikiDashboardState,
	type CodewikiDashboardState,
} from "./state.ts";

export interface CodewikiDashboardServerOptions {
	repoRoot: string;
	open?: boolean;
	keepAlive?: boolean;
	persistent?: boolean;
	inProcess?: boolean;
	traceHostControl?: DashboardTraceHostControl;
	changeControl?: DashboardChangeControl;
	configControl?: DashboardConfigControl;
	sessionActionControl?: DashboardSessionActionControl;
	previewControl?: DashboardPreviewControl;
	projectCoordinatorClient?: boolean;
	projectCoordinatorConnector?: (
		repoRoot: string,
		input: ProjectCoordinatorClientInput,
	) => Promise<ProjectCoordinatorRemoteClient>;
}

export interface CodewikiDashboardServerHandle {
	repoRoot: string;
	url: string;
	origin: string;
	token: string;
	opened: boolean;
	close(): Promise<void>;
}

interface DashboardRuntime {
	repoRoot: string;
	server: Server;
	url: string;
	origin: string;
	token: string;
	clients: Set<ServerResponse>;
	watcher?: FSWatcher;
	broadcastTimer?: NodeJS.Timeout;
	traceHostTimer?: NodeJS.Timeout;
	coordinatorHeartbeatTimer?: NodeJS.Timeout;
	coordinatorClient?: ProjectCoordinatorRemoteClient;
	coordinatorConnector: (
		repoRoot: string,
		input: ProjectCoordinatorClientInput,
	) => Promise<ProjectCoordinatorRemoteClient>;
	coordinatorEventsClosed: boolean;
	traceHostControl: DashboardTraceHostControl;
	changeControl: DashboardChangeControl;
	configControl: DashboardConfigControl;
	sessionActionControl: DashboardSessionActionControl;
	previewControl: DashboardPreviewControl;
	lastSupervisedAt: number;
	opened: boolean;
	close(): Promise<void>;
}

interface DashboardEndpoint {
	repoRoot: string;
	origin: string;
	url: string;
	token: string;
	port: number;
}

interface DashboardMeta {
	mode: "daemon" | "in_process";
	pid: number;
	assetDigest: string;
}

const dashboards = new Map<string, DashboardRuntime>();
const loadedDashboardRuntimeIdentity = captureDashboardRuntimeIdentity(
	import.meta.url,
);
const DASHBOARD_DAEMON_ENV = "CODEWIKI_DASHBOARD_DAEMON";
const DASHBOARD_TMPDIR_ENV = "CODEWIKI_DASHBOARD_TMPDIR";
const DASHBOARD_SUPERVISION_GRACE_MS = 5_000;
const DASHBOARD_SECURITY_HEADERS = {
	"Content-Security-Policy":
		"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const;

export async function startCodewikiDashboardServer(
	options: CodewikiDashboardServerOptions,
): Promise<CodewikiDashboardServerHandle> {
	assertDashboardRuntimeCurrent(
		loadedDashboardRuntimeIdentity,
		options.repoRoot,
	);
	if (
		options.persistent &&
		!options.inProcess &&
		process.env[DASHBOARD_DAEMON_ENV] !== "1"
	) {
		return await startPersistentDashboardServer(options);
	}
	return await startInProcessDashboardServer(options);
}

export async function restoreCodewikiDashboardServer(
	repoRoot: string,
): Promise<CodewikiDashboardServerHandle | undefined> {
	const endpoint = await readDashboardEndpoint(repoRoot);
	if (!endpoint) return undefined;
	return await startCodewikiDashboardServer({
		repoRoot,
		open: false,
		keepAlive: false,
		inProcess: true,
		persistent: false,
	});
}

export async function closeCodewikiDashboardServer(
	repoRoot: string,
): Promise<void> {
	await dashboards.get(repoRoot)?.close();
	const endpoint = await readDashboardEndpoint(repoRoot);
	if (endpoint) await shutdownDashboardEndpoint(endpoint);
	await removeDashboardEndpoint(repoRoot);
}

export async function closeInProcessCodewikiDashboardServer(
	repoRoot: string,
): Promise<void> {
	await dashboards.get(repoRoot)?.close();
}

export function buildCodewikiDashboardUrlMessage(url: string): string {
	return `▸ Click to open CodeWiki dashboard: ${url}`;
}

async function startPersistentDashboardServer(
	options: CodewikiDashboardServerOptions,
): Promise<CodewikiDashboardServerHandle> {
	const endpoint = await readDashboardEndpoint(options.repoRoot);
	const expectedDigest = await currentDashboardAssetDigest();
	if (endpoint) {
		const meta = await readDashboardEndpointMeta(endpoint);
		if (meta?.assetDigest === expectedDigest) {
			return dashboardEndpointHandle(
				endpoint,
				options.open ? openBrowser(endpoint.url) : false,
			);
		}
		if (meta) await shutdownDashboardEndpoint(endpoint);
	}
	try {
		spawnDashboardDaemon(options.repoRoot);
		const started = await waitForDashboardDaemon(
			options.repoRoot,
			expectedDigest,
		);
		return dashboardEndpointHandle(
			started,
			options.open ? openBrowser(started.url) : false,
		);
	} catch {
		return await startInProcessDashboardServer({
			...options,
			keepAlive: true,
			persistent: false,
		});
	}
}

async function waitForDashboardDaemon(
	repoRoot: string,
	expectedDigest: string,
): Promise<DashboardEndpoint> {
	let lastEndpoint: DashboardEndpoint | undefined;
	const endpoint = await pollUntil(Date.now() + 4_000, async () => {
		const candidate = await readDashboardEndpoint(repoRoot);
		if (!candidate) return undefined;
		lastEndpoint = candidate;
		const meta = await readDashboardEndpointMeta(candidate);
		return meta?.mode === "daemon" && meta.assetDigest === expectedDigest
			? candidate
			: undefined;
	});
	if (endpoint) return endpoint;
	throw new Error(
		`CodeWiki dashboard daemon did not start${lastEndpoint ? ` at ${lastEndpoint.origin}` : ""}.`,
	);
}

function spawnDashboardDaemon(repoRoot: string): void {
	const script = dashboardDaemonScriptPath();
	const args = script.endsWith(".ts")
		? ["--experimental-strip-types", script, repoRoot]
		: [script, repoRoot];
	const logPath = dashboardDaemonLogPath(repoRoot);
	const logDirectory = dirname(logPath);
	mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") chmodSync(logDirectory, 0o700);
	const output = openSync(logPath, "a", 0o600);
	if (process.platform !== "win32") fchmodSync(output, 0o600);
	try {
		const child = spawn(process.execPath, args, {
			detached: true,
			stdio: ["ignore", output, output],
			env: { ...process.env, [DASHBOARD_DAEMON_ENV]: "1" },
			windowsHide: true,
		});
		child.unref();
	} finally {
		closeSync(output);
	}
}

function dashboardDaemonScriptPath(): string {
	const current = fileURLToPath(import.meta.url);
	return join(
		dirname(current),
		current.endsWith(".ts") ? "daemon.ts" : "daemon.js",
	);
}

function dashboardDaemonLogPath(repoRoot: string): string {
	const key = createHash("sha256").update(repoRoot).digest("hex").slice(0, 32);
	return join(dashboardEndpointDirectory(), `${key}.log`);
}

async function currentDashboardAssetDigest(): Promise<string> {
	const hash = createHash("sha256").update(await currentDashboardHtml());
	try {
		hash.update(await currentDashboardLogoPng());
	} catch {
		// Missing logo assets should not prevent dashboard startup.
	}
	return hash.digest("hex").slice(0, 16);
}

async function currentDashboardHtml(): Promise<string> {
	try {
		const moduleUrl = dashboardAssetsModuleUrl();
		const modulePath = fileURLToPath(moduleUrl);
		const moduleStat = await stat(modulePath);
		const cacheBustedUrl = `${moduleUrl.href}?mtime=${moduleStat.mtimeMs}`;
		const module = (await import(cacheBustedUrl)) as {
			CODEWIKI_DASHBOARD_HTML?: unknown;
		};
		if (typeof module.CODEWIKI_DASHBOARD_HTML === "string") {
			return module.CODEWIKI_DASHBOARD_HTML;
		}
	} catch {
		return CODEWIKI_DASHBOARD_HTML;
	}
	return CODEWIKI_DASHBOARD_HTML;
}

function dashboardAssetsModuleUrl(): URL {
	const current = fileURLToPath(import.meta.url);
	return new URL(
		current.endsWith(".ts") ? "./assets.ts" : "./assets.js",
		import.meta.url,
	);
}

async function currentDashboardLogoPng(): Promise<Buffer> {
	return await readFile(dashboardLogoPath());
}

function dashboardLogoPath(): string {
	return join(
		dirname(fileURLToPath(import.meta.url)),
		"assets",
		"codewiki-logo.png",
	);
}

async function readDashboardEndpointMeta(
	endpoint: DashboardEndpoint,
): Promise<DashboardMeta | undefined> {
	const result = await requestDashboardJson(
		`${endpoint.origin}/api/meta?token=${encodeURIComponent(endpoint.token)}`,
		500,
	);
	if (!result || result.status !== 200) return undefined;
	const data = result.data;
	if (!data || typeof data !== "object") return undefined;
	const record = data as Record<string, unknown>;
	if (record.mode !== "daemon" && record.mode !== "in_process")
		return undefined;
	if (typeof record.pid !== "number") return undefined;
	if (typeof record.assetDigest !== "string") return undefined;
	return {
		mode: record.mode,
		pid: record.pid,
		assetDigest: record.assetDigest,
	};
}

async function shutdownDashboardEndpoint(
	endpoint: DashboardEndpoint,
): Promise<void> {
	await requestDashboardJson(
		`${endpoint.origin}/api/shutdown?token=${encodeURIComponent(endpoint.token)}`,
		500,
	).catch(() => undefined);
	await pollUntil(Date.now() + 1_500, async () =>
		(await dashboardEndpointResponds(endpoint)) ? undefined : true,
	);
}

async function requestDashboardJson(
	url: string,
	timeout: number,
): Promise<{ status: number; data?: unknown } | undefined> {
	return await new Promise((resolve) => {
		let settled = false;
		const finish = (value: { status: number; data?: unknown } | undefined) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const request = httpRequest(url, { method: "GET", timeout }, (response) => {
			const chunks: Buffer[] = [];
			response.on("data", (chunk: Buffer) => chunks.push(chunk));
			response.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				try {
					finish({
						status: response.statusCode ?? 0,
						data: text ? JSON.parse(text) : undefined,
					});
				} catch {
					finish({ status: response.statusCode ?? 0 });
				}
			});
		});
		request.on("timeout", () => {
			request.destroy();
			finish(undefined);
		});
		request.on("error", () => finish(undefined));
		request.end();
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntil<T>(
	deadline: number,
	attempt: () => Promise<T | undefined>,
): Promise<T | undefined> {
	const result = await attempt();
	if (result !== undefined || Date.now() >= deadline) return result;
	await delay(60);
	return pollUntil(deadline, attempt);
}

async function startInProcessDashboardServer(
	options: CodewikiDashboardServerOptions,
): Promise<CodewikiDashboardServerHandle> {
	const existing = dashboards.get(options.repoRoot);
	if (existing?.server.listening) {
		if (options.keepAlive) existing.server.ref();
		if (!(await dashboardEndpointServesState(existing))) {
			await existing.close();
			await removeDashboardEndpoint(options.repoRoot);
			throw dashboardUnavailableError(existing.origin);
		}
		if (options.open && !existing.opened)
			existing.opened = openBrowser(existing.url);
		return dashboardHandle(existing);
	}
	if (existing) dashboards.delete(options.repoRoot);
	const endpoint = await readDashboardEndpoint(options.repoRoot);
	const expectedDigest = await currentDashboardAssetDigest();
	if (
		endpoint &&
		(await dashboardEndpointIsCurrent(endpoint, expectedDigest)) &&
		(await dashboardEndpointServesState(endpoint))
	) {
		return dashboardEndpointHandle(
			endpoint,
			options.open ? openBrowser(endpoint.url) : false,
		);
	}
	const runtime = await createDashboardRuntime(
		options.repoRoot,
		endpoint,
		options.keepAlive ?? false,
		options.traceHostControl,
		options.changeControl,
		options.configControl,
		options.sessionActionControl,
		options.previewControl,
		{
			connectCoordinator: options.projectCoordinatorClient ?? false,
			coordinatorConnector:
				options.projectCoordinatorConnector ||
				connectEnsuredProjectCoordinatorClient,
		},
	);
	dashboards.set(options.repoRoot, runtime);
	if (!(await dashboardEndpointServesState(runtime))) {
		await runtime.close();
		await removeDashboardEndpoint(options.repoRoot);
		throw dashboardUnavailableError(runtime.origin);
	}
	if (options.open) runtime.opened = openBrowser(runtime.url);
	return dashboardHandle(runtime);
}

async function readDashboardEndpoint(
	repoRoot: string,
): Promise<DashboardEndpoint | undefined> {
	try {
		const raw = await readFile(dashboardEndpointPath(repoRoot), "utf8");
		const data = JSON.parse(raw) as Record<string, unknown>;
		if (data.repoRoot !== repoRoot) return undefined;
		if (typeof data.origin !== "string") return undefined;
		if (typeof data.url !== "string") return undefined;
		if (typeof data.token !== "string") return undefined;
		if (!Number.isInteger(data.port)) return undefined;
		return {
			repoRoot,
			origin: data.origin,
			url: data.url,
			token: data.token,
			port: data.port as number,
		};
	} catch (error) {
		if (isNotFound(error)) return undefined;
		return undefined;
	}
}

async function writeDashboardEndpoint(
	endpoint: DashboardEndpoint,
): Promise<void> {
	await ensurePrivateDashboardEndpointDirectory();
	const endpointPath = dashboardEndpointPath(endpoint.repoRoot);
	const tempPath = `${endpointPath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(endpoint)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	if (process.platform !== "win32") await chmod(tempPath, 0o600);
	await rename(tempPath, endpointPath);
}

async function ensurePrivateDashboardEndpointDirectory(): Promise<void> {
	const directory = dashboardEndpointDirectory();
	await mkdir(directory, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") await chmod(directory, 0o700);
}

async function removeDashboardEndpoint(repoRoot: string): Promise<void> {
	await rm(dashboardEndpointPath(repoRoot), { force: true });
}

function dashboardEndpoint(
	repoRoot: string,
	origin: string,
	token: string,
	port: number,
): DashboardEndpoint {
	return {
		repoRoot,
		origin,
		url: `${origin}/#token=${encodeURIComponent(token)}`,
		token,
		port,
	};
}

function dashboardEndpointDirectory(): string {
	return join(stableTmpDirectory(), "codewiki-dashboard");
}

function stableTmpDirectory(): string {
	return (
		process.env[DASHBOARD_TMPDIR_ENV] ||
		(process.platform === "win32" ? tmpdir() : "/tmp")
	);
}

function dashboardEndpointPath(repoRoot: string): string {
	const key = createHash("sha256").update(repoRoot).digest("hex").slice(0, 32);
	return join(dashboardEndpointDirectory(), `${key}.json`);
}

async function dashboardEndpointIsCurrent(
	endpoint: DashboardEndpoint,
	expectedDigest: string,
): Promise<boolean> {
	const meta = await readDashboardEndpointMeta(endpoint);
	return meta?.assetDigest === expectedDigest;
}

async function dashboardEndpointResponds(
	endpoint: DashboardEndpoint,
): Promise<boolean> {
	return (await readDashboardEndpointMeta(endpoint)) !== undefined;
}

async function dashboardEndpointServesState(
	endpoint: Pick<DashboardEndpoint, "origin" | "token">,
): Promise<boolean> {
	const result = await requestDashboardJson(
		`${endpoint.origin}/api/state?token=${encodeURIComponent(endpoint.token)}`,
		5_000,
	);
	return Boolean(result && result.status === 200 && result.data);
}

function dashboardUnavailableError(origin: string): Error {
	return new Error(
		`CodeWiki dashboard at ${origin} did not serve pipeline state. Retry /wiki-dashboard; if the failure persists, fully restart Pi.`,
	);
}

async function listenDashboardServer(
	server: Server,
	port: number,
): Promise<void> {
	try {
		await listenOnPort(server, port);
	} catch (error) {
		if (port !== 0 && isAddressInUse(error)) {
			await listenOnPort(server, 0);
			return;
		}
		throw error;
	}
}

async function listenOnPort(server: Server, port: number): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
}

function dashboardEndpointHandle(
	endpoint: DashboardEndpoint,
	opened: boolean,
): CodewikiDashboardServerHandle {
	return {
		repoRoot: endpoint.repoRoot,
		url: endpoint.url,
		origin: endpoint.origin,
		token: endpoint.token,
		opened,
		close: async () => undefined,
	};
}

async function createDashboardRuntime(
	repoRoot: string,
	preferredEndpoint?: DashboardEndpoint,
	keepAlive = false,
	providedTraceHostControl?: DashboardTraceHostControl,
	providedChangeControl?: DashboardChangeControl,
	providedConfigControl?: DashboardConfigControl,
	providedSessionActionControl?: DashboardSessionActionControl,
	providedPreviewControl?: DashboardPreviewControl,
	options: {
		connectCoordinator?: boolean;
		coordinatorConnector?: (
			repoRoot: string,
			input: ProjectCoordinatorClientInput,
		) => Promise<ProjectCoordinatorRemoteClient>;
	} = {},
): Promise<DashboardRuntime> {
	const token =
		preferredEndpoint?.token || randomBytes(18).toString("base64url");
	const clients = new Set<ServerResponse>();
	let runtime: DashboardRuntime;
	const server = createServer(async (request, response) => {
		try {
			await routeRequest(runtime, request, response);
		} catch (error) {
			writeServerError(response, error);
		}
	});
	await listenDashboardServer(server, preferredEndpoint?.port ?? 0);
	if (!keepAlive) server.unref();
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("CodeWiki dashboard server did not expose a TCP address.");
	}
	const origin = `http://127.0.0.1:${address.port}`;
	const endpoint = dashboardEndpoint(repoRoot, origin, token, address.port);
	const dashboardActor = `dashboard:${process.pid}:${address.port}`;
	const traceHostControl =
		providedTraceHostControl ||
		(await createDefaultDashboardTraceHostControl(repoRoot, dashboardActor));
	const changeControl =
		providedChangeControl ||
		createDashboardChangeControl({ repoRoot, actor: dashboardActor });
	const configControl =
		providedConfigControl ||
		(await createDefaultDashboardConfigControl(repoRoot));
	const sessionActionControl =
		providedSessionActionControl ||
		createDashboardSessionActionControl({
			unavailableReason:
				"Sprint actions require an active in-process Pi session bridge.",
		});
	const previewControl =
		providedPreviewControl || unavailableDashboardPreviewControl();
	const coordinatorConnector =
		options.coordinatorConnector || connectEnsuredProjectCoordinatorClient;
	const coordinatorClient = options.connectCoordinator
		? await coordinatorConnector(repoRoot, {
				clientId: `dashboard:${process.pid}:${address.port}`,
				kind: "dashboard",
				supervision: "observer",
			})
		: undefined;
	runtime = {
		repoRoot,
		server,
		url: endpoint.url,
		origin,
		token,
		clients,
		coordinatorClient,
		coordinatorConnector,
		coordinatorEventsClosed: false,
		traceHostControl,
		changeControl,
		configControl,
		sessionActionControl,
		previewControl,
		lastSupervisedAt: Date.now(),
		opened: false,
		close: () => closeRuntime(runtime),
	};
	await writeDashboardEndpoint(endpoint);
	runtime.watcher = watchTraceDirectory(runtime);
	runtime.traceHostTimer = setInterval(() => {
		if (runtime.clients.size > 0) runtime.lastSupervisedAt = Date.now();
		const attached =
			Date.now() - runtime.lastSupervisedAt <= DASHBOARD_SUPERVISION_GRACE_MS;
		void runtime.traceHostControl.heartbeat(attached).catch(() => undefined);
	}, 1_000);
	runtime.traceHostTimer.unref();
	if (coordinatorClient) {
		runtime.coordinatorHeartbeatTimer = setInterval(() => {
			void runtime.coordinatorClient?.heartbeat().catch(() => undefined);
		}, 10_000);
		runtime.coordinatorHeartbeatTimer.unref();
		if (keepAlive) void watchCoordinatorEvents(runtime);
	}
	return runtime;
}

function watchTraceDirectory(runtime: DashboardRuntime): FSWatcher | undefined {
	try {
		return watch(
			join(runtime.repoRoot, ".codewiki", "traces"),
			{ persistent: false },
			() => scheduleBroadcast(runtime),
		);
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

async function routeRequest(
	runtime: DashboardRuntime,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const method = request.method || "GET";
	const url = new URL(request.url || "/", runtime.origin);
	if (method === "GET" && (await routePublicGet(response, url))) return;
	if (!validToken(runtime, url)) {
		writeJson(response, 403, { error: "Forbidden" });
		return;
	}
	if (method === "GET" && (await routeAuthorizedGet(runtime, response, url))) {
		return;
	}
	if (
		method === "POST" &&
		(await routeAuthorizedPost(runtime, request, response, url))
	) {
		return;
	}
	if (method !== "GET") {
		writeJson(response, 405, { error: "Method not allowed" });
		return;
	}
	writeJson(response, 404, { error: "Not found" });
}

async function routePublicGet(
	response: ServerResponse,
	url: URL,
): Promise<boolean> {
	if (url.pathname === "/" || url.pathname === "/index.html") {
		writeHtml(
			response,
			(await currentDashboardHtml()).replaceAll(
				"__CODEWIKI_ASSET_DIGEST__",
				await currentDashboardAssetDigest(),
			),
		);
		return true;
	}
	if (url.pathname === "/assets/codewiki-logo.png") {
		writePng(response, await currentDashboardLogoPng());
		return true;
	}
	return false;
}

async function routeAuthorizedGet(
	runtime: DashboardRuntime,
	response: ServerResponse,
	url: URL,
): Promise<boolean> {
	if (url.pathname === "/api/state") {
		writeJson(response, 200, await readDashboardState(runtime));
		return true;
	}
	if (url.pathname === "/api/changes") {
		writeJson(response, 200, await runtime.changeControl.status());
		return true;
	}
	if (url.pathname === "/api/configuration") {
		writeJson(response, 200, await runtime.configControl.status());
		return true;
	}
	if (url.pathname === "/api/previews") {
		const traceFiles = await readProjectTraceFiles(runtime.repoRoot);
		writeJson(
			response,
			200,
			await runtime.previewControl.status(traceFiles.records),
		);
		return true;
	}
	if (url.pathname === "/api/trace-hosts") {
		runtime.lastSupervisedAt = Date.now();
		writeJson(response, 200, await runtime.traceHostControl.status());
		return true;
	}
	if (url.pathname === "/api/meta") {
		writeJson(response, 200, {
			mode: process.env[DASHBOARD_DAEMON_ENV] === "1" ? "daemon" : "in_process",
			pid: process.pid,
			assetDigest: await currentDashboardAssetDigest(),
		});
		return true;
	}
	if (url.pathname === "/api/shutdown") {
		writeJson(response, 200, { ok: true });
		scheduleRuntimeClose(runtime);
		return true;
	}
	if (url.pathname === "/api/events") {
		await attachEventStream(runtime, response);
		return true;
	}
	return false;
}

async function routeAuthorizedPost(
	runtime: DashboardRuntime,
	request: IncomingMessage,
	response: ServerResponse,
	url: URL,
): Promise<boolean> {
	if (
		url.pathname !== "/api/trace-hosts/commands" &&
		url.pathname !== "/api/changes/commands" &&
		url.pathname !== "/api/configuration/commands" &&
		url.pathname !== "/api/session-actions/commands" &&
		url.pathname !== "/api/previews/commands" &&
		url.pathname !== "/api/shutdown"
	) {
		return false;
	}
	assertSameOriginMutation(runtime, request);
	if (url.pathname === "/api/shutdown") {
		writeJson(response, 200, { ok: true });
		scheduleRuntimeClose(runtime);
		return true;
	}
	const command = await readJsonRequest(request);
	if (url.pathname === "/api/changes/commands") {
		writeJson(response, 200, await runtime.changeControl.execute(command));
		scheduleBroadcast(runtime);
		scheduleCoordinatorObservation(runtime);
		return true;
	}
	if (url.pathname === "/api/configuration/commands") {
		writeJson(response, 200, await runtime.configControl.execute(command));
		scheduleBroadcast(runtime);
		scheduleCoordinatorObservation(runtime);
		return true;
	}
	if (url.pathname === "/api/session-actions/commands") {
		writeJson(
			response,
			200,
			await runtime.sessionActionControl.execute(command),
		);
		scheduleBroadcast(runtime);
		scheduleCoordinatorObservation(runtime);
		return true;
	}
	if (url.pathname === "/api/previews/commands") {
		const traceFiles = await readProjectTraceFiles(runtime.repoRoot);
		writeJson(
			response,
			200,
			await runtime.previewControl.execute(
				parseDashboardPreviewCommand(command),
				traceFiles.records,
			),
		);
		scheduleBroadcast(runtime);
		scheduleCoordinatorObservation(runtime);
		return true;
	}
	runtime.lastSupervisedAt = Date.now();
	writeJson(response, 200, await runtime.traceHostControl.execute(command));
	scheduleCoordinatorObservation(runtime);
	return true;
}

function scheduleRuntimeClose(runtime: DashboardRuntime): void {
	setTimeout(() => {
		void runtime.close().then(() => {
			if (process.env[DASHBOARD_DAEMON_ENV] === "1") process.exit(0);
		});
	}, 10);
}

function assertSameOriginMutation(
	runtime: DashboardRuntime,
	request: IncomingMessage,
): void {
	const requestOrigin = request.headers.origin;
	const fetchSite = request.headers["sec-fetch-site"];
	const hostOrigin = request.headers.host
		? `http://${request.headers.host}`
		: undefined;
	const exactOrigin = requestOrigin === runtime.origin;
	const browserSameOriginFallback =
		requestOrigin === undefined &&
		fetchSite === "same-origin" &&
		hostOrigin === runtime.origin;
	if (!exactOrigin && !browserSameOriginFallback) {
		throw new DashboardTraceHostControlError(
			"Dashboard mutation requires exact same-origin authority.",
			403,
		);
	}
	if (fetchSite && fetchSite !== "same-origin") {
		throw new DashboardTraceHostControlError(
			"Dashboard mutation rejected cross-site request metadata.",
			403,
		);
	}
	const contentType = request.headers["content-type"] || "";
	if (!contentType.toLowerCase().startsWith("application/json")) {
		throw new DashboardTraceHostControlError(
			"Dashboard mutation requires application/json.",
			400,
		);
	}
}

async function readJsonRequest(request: IncomingMessage): Promise<unknown> {
	const maxBytes = 16_384;
	const declared = Number(request.headers["content-length"] || 0);
	if (Number.isFinite(declared) && declared > maxBytes) {
		throw new DashboardTraceHostControlError(
			"Dashboard command body exceeds 16384 bytes.",
			400,
		);
	}
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.length;
		if (bytes > maxBytes) {
			throw new DashboardTraceHostControlError(
				"Dashboard command body exceeds 16384 bytes.",
				400,
			);
		}
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new DashboardTraceHostControlError(
			"Dashboard command body must be valid JSON.",
			400,
		);
	}
}

async function readDashboardState(
	runtime: DashboardRuntime,
): Promise<CodewikiDashboardState> {
	const repoRoot = runtime.repoRoot;
	const traceFiles = await readProjectTraceFiles(repoRoot);
	const snapshot = await buildProjectWikiState({ repoRoot, traceFiles });
	const [devLogEntries, knowledgeTopicDigests] = await Promise.all([
		Promise.all(
			snapshot.traceBoard.traces
				.filter((trace) => !trace.closed)
				.map(
					async (trace) =>
						[trace.traceId, await readDevLog(repoRoot, trace.traceId)] as const,
				),
		),
		readKnowledgeTopicDigests(
			repoRoot,
			knowledgeTopicRefsFromRecords(traceFiles.records),
		),
	]);
	const devLogByTrace = new Map(devLogEntries);
	const previews = await runtime.previewControl.status(traceFiles.records);
	return buildCodewikiDashboardState(snapshot, repoRoot, traceFiles.records, {
		devLogByTrace,
		knowledgeTopicDigests,
		changes: await runtime.changeControl.status(),
		configuration: await runtime.configControl.status(),
		sessionActions: runtime.sessionActionControl.status(),
		previews: [...previews],
	});
}

async function attachEventStream(
	runtime: DashboardRuntime,
	response: ServerResponse,
): Promise<void> {
	runtime.lastSupervisedAt = Date.now();
	const state = await readDashboardState(runtime);
	response.writeHead(200, {
		...DASHBOARD_SECURITY_HEADERS,
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
	});
	runtime.clients.add(response);
	response.on("close", () => runtime.clients.delete(response));
	writeEvent(response, state);
}

function scheduleCoordinatorObservation(runtime: DashboardRuntime): void {
	void runtime.coordinatorClient
		?.inspect({ kind: "project_truth_changed" })
		.catch(() => undefined);
}

async function watchCoordinatorEvents(runtime: DashboardRuntime): Promise<void> {
	let cursor = 0;
	let generationId: string | undefined;
	while (!runtime.coordinatorEventsClosed) {
		try {
			const client = runtime.coordinatorClient;
			if (!client) return;
			const batch = await client.events(cursor, { maxEvents: 64, waitMs: 5_000 });
			if (runtime.coordinatorEventsClosed) return;
			const generationChanged =
				generationId !== undefined && generationId !== batch.generationId;
			generationId = batch.generationId;
			if (generationChanged || batch.resetRequired) {
				cursor = batch.cursor;
				scheduleBroadcast(runtime);
				continue;
			}
			cursor = batch.cursor;
			if (batch.events.length > 0) scheduleBroadcast(runtime);
		} catch {
			if (runtime.coordinatorEventsClosed) return;
			void runtime.coordinatorClient?.disconnect().catch(() => undefined);
			try {
				runtime.coordinatorClient = await runtime.coordinatorConnector(
					runtime.repoRoot,
					{
						clientId: `dashboard:${process.pid}:${new URL(runtime.origin).port}`,
						kind: "dashboard",
						supervision: "observer",
					},
				);
				cursor = 0;
				generationId = undefined;
				scheduleBroadcast(runtime);
			} catch {
				await delay(250);
			}
		}
	}
}

function scheduleBroadcast(runtime: DashboardRuntime): void {
	if (runtime.broadcastTimer) clearTimeout(runtime.broadcastTimer);
	runtime.broadcastTimer = setTimeout(() => {
		runtime.broadcastTimer = undefined;
		void broadcast(runtime).catch(() => undefined);
	}, 120);
}

async function broadcast(runtime: DashboardRuntime): Promise<void> {
	if (runtime.clients.size === 0) return;
	const state = await readDashboardState(runtime);
	for (const client of runtime.clients) writeEvent(client, state);
}

function writeEvent(
	response: ServerResponse,
	data: CodewikiDashboardState,
): void {
	if (response.destroyed || response.writableEnded) return;
	response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function validToken(runtime: DashboardRuntime, url: URL): boolean {
	return url.searchParams.get("token") === runtime.token;
}

function writeHtml(response: ServerResponse, html: string): void {
	response.writeHead(200, {
		...DASHBOARD_SECURITY_HEADERS,
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "no-store",
	});
	response.end(html);
}

function writePng(response: ServerResponse, body: Buffer): void {
	response.writeHead(200, {
		...DASHBOARD_SECURITY_HEADERS,
		"Content-Type": "image/png",
		"Cache-Control": "no-store",
	});
	response.end(body);
}

function writeJson(
	response: ServerResponse,
	status: number,
	body: unknown,
): void {
	if (response.headersSent || response.writableEnded || response.destroyed)
		return;
	response.writeHead(status, {
		...DASHBOARD_SECURITY_HEADERS,
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	response.end(JSON.stringify(body));
}

function writeServerError(response: ServerResponse, error: unknown): void {
	if (response.headersSent || response.writableEnded || response.destroyed) {
		response.destroy(error instanceof Error ? error : undefined);
		return;
	}
	writeJson(
		response,
		error instanceof DashboardTraceHostControlError ? error.status : 500,
		{ error: error instanceof Error ? error.message : String(error) },
	);
}

async function closeRuntime(runtime: DashboardRuntime): Promise<void> {
	dashboards.delete(runtime.repoRoot);
	runtime.coordinatorEventsClosed = true;
	if (runtime.broadcastTimer) clearTimeout(runtime.broadcastTimer);
	if (runtime.traceHostTimer) clearInterval(runtime.traceHostTimer);
	if (runtime.coordinatorHeartbeatTimer) {
		clearInterval(runtime.coordinatorHeartbeatTimer);
	}
	await runtime.coordinatorClient?.disconnect().catch(() => undefined);
	await runtime.traceHostControl.shutdown();
	runtime.watcher?.close();
	for (const client of runtime.clients) client.end();
	runtime.clients.clear();
	await new Promise<void>((resolve, reject) => {
		runtime.server.close((error) => (error ? reject(error) : resolve()));
	});
}

function dashboardHandle(
	runtime: DashboardRuntime,
): CodewikiDashboardServerHandle {
	return {
		repoRoot: runtime.repoRoot,
		url: runtime.url,
		origin: runtime.origin,
		token: runtime.token,
		opened: runtime.opened,
		close: runtime.close,
	};
}

function openBrowser(url: string): boolean {
	return openSystemBrowser(url);
}

function isAddressInUse(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "EADDRINUSE",
	);
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}
