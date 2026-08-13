import { createHash, randomBytes } from "node:crypto";
import {
	chmodSync,
	closeSync,
	fchmodSync,
	mkdirSync,
	openSync,
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
import { openSystemBrowser } from "../../preview/browser-adapter.ts";
import {
	parseDashboardPreviewCommand,
	type DashboardPreviewControl,
	unavailableDashboardPreviewControl,
} from "../../preview/dashboard-control.ts";
import {
	connectProjectRuntimeGateway,
	createProjectRuntimeProjectionGateway,
	type ProjectRuntimeConnectionInput,
	type ProjectRuntimeGateway,
	type ProjectRuntimeProjectionGateway,
} from "../../runtime/gateway.ts";
import { CODEWIKI_APP_HTML } from "../../clients/app/shell.ts";
import {
	assertInstalledCodewikiRuntimeCurrent,
	captureInstalledCodewikiRuntimeIdentity,
} from "./installed-runtime.ts";

class AppRequestError extends Error {
	readonly status: 400 | 403 | 409;

	constructor(message: string, status: 400 | 403 | 409) {
		super(message);
		this.name = "AppRequestError";
		this.status = status;
	}
}

interface CodewikiAppServerOptions {
	repoRoot: string;
	open?: boolean;
	keepAlive?: boolean;
	persistent?: boolean;
	inProcess?: boolean;
	previewControl?: DashboardPreviewControl;
	connectProjectRuntime?: boolean;
	projectRuntimeConnector?: (
		repoRoot: string,
		input: ProjectRuntimeConnectionInput,
	) => Promise<ProjectRuntimeGateway>;
}

interface CodewikiAppServerHandle {
	repoRoot: string;
	url: string;
	origin: string;
	token: string;
	opened: boolean;
	close(): Promise<void>;
}

interface AppServerRuntime {
	repoRoot: string;
	server: Server;
	url: string;
	origin: string;
	token: string;
	clients: Set<ServerResponse>;
	projection: Pick<
		ProjectRuntimeProjectionGateway,
		"appState" | "changes" | "configuration"
	>;
	unsubscribeProjection?: () => void;
	broadcastTimer?: NodeJS.Timeout;
	runtimeHeartbeatTimer?: NodeJS.Timeout;
	projectRuntime?: ProjectRuntimeGateway;
	projectRuntimeConnector: (
		repoRoot: string,
		input: ProjectRuntimeConnectionInput,
	) => Promise<ProjectRuntimeGateway>;
	runtimeEventsClosed: boolean;
	previewControl: DashboardPreviewControl;
	opened: boolean;
	close(): Promise<void>;
}

interface AppServerEndpoint {
	repoRoot: string;
	origin: string;
	url: string;
	token: string;
	port: number;
}

interface AppServerMeta {
	mode: "daemon" | "in_process";
	pid: number;
	assetDigest: string;
}

const appServers = new Map<string, AppServerRuntime>();
const loadedCodewikiRuntimeIdentity = captureInstalledCodewikiRuntimeIdentity(
	import.meta.url,
);
const APP_DAEMON_ENV = "CODEWIKI_APP_DAEMON";
const APP_SERVER_TMPDIR_ENV = "CODEWIKI_APP_SERVER_TMPDIR";
const APP_SERVER_SECURITY_HEADERS = {
	"Content-Security-Policy":
		"default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const;

export async function startCodewikiAppServer(
	options: CodewikiAppServerOptions,
): Promise<CodewikiAppServerHandle> {
	assertInstalledCodewikiRuntimeCurrent(
		loadedCodewikiRuntimeIdentity,
		options.repoRoot,
	);
	if (
		options.persistent &&
		!options.inProcess &&
		process.env[APP_DAEMON_ENV] !== "1"
	) {
		return await startPersistentAppServer(options);
	}
	return await startInProcessAppServer(options);
}

export async function restoreCodewikiAppServer(
	repoRoot: string,
): Promise<CodewikiAppServerHandle | undefined> {
	const endpoint = await readAppEndpoint(repoRoot);
	if (!endpoint) return undefined;
	return await startCodewikiAppServer({
		repoRoot,
		open: false,
		keepAlive: false,
		inProcess: true,
		persistent: false,
	});
}

export async function closeCodewikiAppServer(
	repoRoot: string,
): Promise<void> {
	await appServers.get(repoRoot)?.close();
	const endpoint = await readAppEndpoint(repoRoot);
	if (endpoint) await shutdownAppEndpoint(endpoint);
	await removeAppEndpoint(repoRoot);
}

export async function closeInProcessCodewikiAppServer(
	repoRoot: string,
): Promise<void> {
	await appServers.get(repoRoot)?.close();
}

export function buildCodewikiAppUrlMessage(url: string): string {
	return `▸ Click to open CodeWiki dashboard: ${url}`;
}

async function startPersistentAppServer(
	options: CodewikiAppServerOptions,
): Promise<CodewikiAppServerHandle> {
	const endpoint = await readAppEndpoint(options.repoRoot);
	const expectedDigest = await currentAppAssetDigest();
	if (endpoint) {
		const meta = await readAppEndpointMeta(endpoint);
		if (meta?.assetDigest === expectedDigest) {
			return appEndpointHandle(
				endpoint,
				options.open ? openBrowser(endpoint.url) : false,
			);
		}
		if (meta) await shutdownAppEndpoint(endpoint);
	}
	try {
		spawnAppDaemon(options.repoRoot);
		const started = await waitForAppDaemon(
			options.repoRoot,
			expectedDigest,
		);
		return appEndpointHandle(
			started,
			options.open ? openBrowser(started.url) : false,
		);
	} catch {
		return await startInProcessAppServer({
			...options,
			keepAlive: true,
			persistent: false,
		});
	}
}

async function waitForAppDaemon(
	repoRoot: string,
	expectedDigest: string,
): Promise<AppServerEndpoint> {
	let lastEndpoint: AppServerEndpoint | undefined;
	const endpoint = await pollUntil(Date.now() + 4_000, async () => {
		const candidate = await readAppEndpoint(repoRoot);
		if (!candidate) return undefined;
		lastEndpoint = candidate;
		const meta = await readAppEndpointMeta(candidate);
		return meta?.mode === "daemon" && meta.assetDigest === expectedDigest
			? candidate
			: undefined;
	});
	if (endpoint) return endpoint;
	throw new Error(
		`CodeWiki App daemon did not start${lastEndpoint ? ` at ${lastEndpoint.origin}` : ""}.`,
	);
}

function spawnAppDaemon(repoRoot: string): void {
	const script = appDaemonScriptPath();
	const args = script.endsWith(".ts")
		? ["--experimental-strip-types", script, repoRoot]
		: [script, repoRoot];
	const logPath = appServerLogPath(repoRoot);
	const logDirectory = dirname(logPath);
	mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") chmodSync(logDirectory, 0o700);
	const output = openSync(logPath, "a", 0o600);
	if (process.platform !== "win32") fchmodSync(output, 0o600);
	try {
		const child = spawn(process.execPath, args, {
			detached: true,
			stdio: ["ignore", output, output],
			env: { ...process.env, [APP_DAEMON_ENV]: "1" },
			windowsHide: true,
		});
		child.unref();
	} finally {
		closeSync(output);
	}
}

function appDaemonScriptPath(): string {
	const current = fileURLToPath(import.meta.url);
	return join(
		dirname(current),
		current.endsWith(".ts") ? "daemon.ts" : "daemon.js",
	);
}

function appServerLogPath(repoRoot: string): string {
	const key = createHash("sha256").update(repoRoot).digest("hex").slice(0, 32);
	return join(appEndpointDirectory(), `${key}.log`);
}

async function currentAppAssetDigest(): Promise<string> {
	const hash = createHash("sha256").update(await currentAppHtml());
	try {
		hash.update(await currentAppLogoPng());
	} catch {
		// Missing logo assets should not prevent dashboard startup.
	}
	return hash.digest("hex").slice(0, 16);
}

async function currentAppHtml(): Promise<string> {
	try {
		const moduleUrl = appShellModuleUrl();
		const modulePath = fileURLToPath(moduleUrl);
		const moduleStat = await stat(modulePath);
		const cacheBustedUrl = `${moduleUrl.href}?mtime=${moduleStat.mtimeMs}`;
		const module = (await import(cacheBustedUrl)) as {
			CODEWIKI_APP_HTML?: unknown;
		};
		if (typeof module.CODEWIKI_APP_HTML === "string") {
			return module.CODEWIKI_APP_HTML;
		}
	} catch {
		return CODEWIKI_APP_HTML;
	}
	return CODEWIKI_APP_HTML;
}

function appShellModuleUrl(): URL {
	const current = fileURLToPath(import.meta.url);
	return new URL(
		current.endsWith(".ts")
			? "../../clients/app/shell.ts"
			: "../../clients/app/shell.js",
		import.meta.url,
	);
}

async function currentAppLogoPng(): Promise<Buffer> {
	return readFile(appLogoPath());
}

function appLogoPath(): string {
	return join(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
		"clients",
		"app",
		"assets",
		"codewiki-logo.png",
	);
}

async function readAppEndpointMeta(
	endpoint: AppServerEndpoint,
): Promise<AppServerMeta | undefined> {
	const result = await requestAppJson(
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

async function shutdownAppEndpoint(
	endpoint: AppServerEndpoint,
): Promise<void> {
	await requestAppJson(
		`${endpoint.origin}/api/shutdown?token=${encodeURIComponent(endpoint.token)}`,
		500,
	).catch(() => undefined);
	await pollUntil(Date.now() + 1_500, async () =>
		(await appEndpointResponds(endpoint)) ? undefined : true,
	);
}

async function requestAppJson(
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

async function startInProcessAppServer(
	options: CodewikiAppServerOptions,
): Promise<CodewikiAppServerHandle> {
	const existing = appServers.get(options.repoRoot);
	if (existing?.server.listening) {
		if (options.keepAlive) existing.server.ref();
		if (!(await appEndpointServesState(existing))) {
			await existing.close();
			await removeAppEndpoint(options.repoRoot);
			throw appUnavailableError(existing.origin);
		}
		if (options.open && !existing.opened)
			existing.opened = openBrowser(existing.url);
		return appServerHandle(existing);
	}
	if (existing) appServers.delete(options.repoRoot);
	const endpoint = await readAppEndpoint(options.repoRoot);
	const expectedDigest = await currentAppAssetDigest();
	if (
		endpoint &&
		(await appEndpointIsCurrent(endpoint, expectedDigest)) &&
		(await appEndpointServesState(endpoint))
	) {
		return appEndpointHandle(
			endpoint,
			options.open ? openBrowser(endpoint.url) : false,
		);
	}
	const runtime = await createAppServerRuntime(
		options.repoRoot,
		endpoint,
		options.keepAlive ?? false,
		options.previewControl,
		{
			connectProjectRuntime: options.connectProjectRuntime ?? false,
			projectRuntimeConnector:
				options.projectRuntimeConnector || connectProjectRuntimeGateway,
		},
	);
	appServers.set(options.repoRoot, runtime);
	if (!(await appEndpointServesState(runtime))) {
		await runtime.close();
		await removeAppEndpoint(options.repoRoot);
		throw appUnavailableError(runtime.origin);
	}
	if (options.open) runtime.opened = openBrowser(runtime.url);
	return appServerHandle(runtime);
}

async function readAppEndpoint(
	repoRoot: string,
): Promise<AppServerEndpoint | undefined> {
	try {
		const raw = await readFile(appEndpointPath(repoRoot), "utf8");
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

async function writeAppEndpoint(
	endpoint: AppServerEndpoint,
): Promise<void> {
	await ensurePrivateAppEndpointDirectory();
	const endpointPath = appEndpointPath(endpoint.repoRoot);
	const tempPath = `${endpointPath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(endpoint)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	if (process.platform !== "win32") await chmod(tempPath, 0o600);
	await rename(tempPath, endpointPath);
}

async function ensurePrivateAppEndpointDirectory(): Promise<void> {
	const directory = appEndpointDirectory();
	await mkdir(directory, { recursive: true, mode: 0o700 });
	if (process.platform !== "win32") await chmod(directory, 0o700);
}

async function removeAppEndpoint(repoRoot: string): Promise<void> {
	await rm(appEndpointPath(repoRoot), { force: true });
}

function appEndpoint(
	repoRoot: string,
	origin: string,
	token: string,
	port: number,
): AppServerEndpoint {
	return {
		repoRoot,
		origin,
		url: `${origin}/#token=${encodeURIComponent(token)}`,
		token,
		port,
	};
}

function appEndpointDirectory(): string {
	return join(stableTmpDirectory(), "codewiki-dashboard");
}

function stableTmpDirectory(): string {
	return (
		process.env[APP_SERVER_TMPDIR_ENV] ||
		(process.platform === "win32" ? tmpdir() : "/tmp")
	);
}

function appEndpointPath(repoRoot: string): string {
	const key = createHash("sha256").update(repoRoot).digest("hex").slice(0, 32);
	return join(appEndpointDirectory(), `${key}.json`);
}

async function appEndpointIsCurrent(
	endpoint: AppServerEndpoint,
	expectedDigest: string,
): Promise<boolean> {
	const meta = await readAppEndpointMeta(endpoint);
	return meta?.assetDigest === expectedDigest;
}

async function appEndpointResponds(
	endpoint: AppServerEndpoint,
): Promise<boolean> {
	return (await readAppEndpointMeta(endpoint)) !== undefined;
}

async function appEndpointServesState(
	endpoint: Pick<AppServerEndpoint, "origin" | "token">,
): Promise<boolean> {
	const result = await requestAppJson(
		`${endpoint.origin}/api/state?token=${encodeURIComponent(endpoint.token)}`,
		5_000,
	);
	return Boolean(result && result.status === 200 && result.data);
}

function appUnavailableError(origin: string): Error {
	return new Error(
		`CodeWiki dashboard at ${origin} did not serve pipeline state. Retry /wiki-dashboard; if the failure persists, fully restart Pi.`,
	);
}

async function listenAppServer(
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

function appEndpointHandle(
	endpoint: AppServerEndpoint,
	opened: boolean,
): CodewikiAppServerHandle {
	return {
		repoRoot: endpoint.repoRoot,
		url: endpoint.url,
		origin: endpoint.origin,
		token: endpoint.token,
		opened,
		close: async () => undefined,
	};
}

async function createAppServerRuntime(
	repoRoot: string,
	preferredEndpoint?: AppServerEndpoint,
	keepAlive = false,
	providedPreviewControl?: DashboardPreviewControl,
	options: {
		connectProjectRuntime?: boolean;
		projectRuntimeConnector?: (
			repoRoot: string,
			input: ProjectRuntimeConnectionInput,
		) => Promise<ProjectRuntimeGateway>;
	} = {},
): Promise<AppServerRuntime> {
	const token =
		preferredEndpoint?.token || randomBytes(18).toString("base64url");
	const clients = new Set<ServerResponse>();
	let runtime: AppServerRuntime;
	const server = createServer(async (request, response) => {
		try {
			await routeRequest(runtime, request, response);
		} catch (error) {
			writeServerError(response, error);
		}
	});
	await listenAppServer(server, preferredEndpoint?.port ?? 0);
	if (!keepAlive) server.unref();
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("CodeWiki dashboard server did not expose a TCP address.");
	}
	const origin = `http://127.0.0.1:${address.port}`;
	const endpoint = appEndpoint(repoRoot, origin, token, address.port);
	const previewControl =
		providedPreviewControl || unavailableDashboardPreviewControl();
	const projectRuntimeConnector =
		options.projectRuntimeConnector || connectProjectRuntimeGateway;
	const projectRuntime = options.connectProjectRuntime
		? await projectRuntimeConnector(repoRoot, {
				clientId: `dashboard:${process.pid}:${address.port}`,
				kind: "dashboard",
				supervision: "observer",
			})
		: undefined;
	let localProjection: ProjectRuntimeProjectionGateway | undefined;
	const projection =
		projectRuntime?.queries ||
		(localProjection = createProjectRuntimeProjectionGateway(repoRoot));
	runtime = {
		repoRoot,
		server,
		url: endpoint.url,
		origin,
		token,
		clients,
		projectRuntime,
		projectRuntimeConnector,
		projection,
		runtimeEventsClosed: false,
		previewControl,
		opened: false,
		close: () => closeRuntime(runtime),
	};
	await writeAppEndpoint(endpoint);
	runtime.unsubscribeProjection = localProjection?.subscribe(() =>
		scheduleBroadcast(runtime),
	);
	if (projectRuntime) {
		runtime.runtimeHeartbeatTimer = setInterval(() => {
			void runtime.projectRuntime?.connection.heartbeat().catch(() => undefined);
		}, 10_000);
		runtime.runtimeHeartbeatTimer.unref();
		if (keepAlive) void watchRuntimeEvents(runtime);
	}
	return runtime;
}

async function routeRequest(
	runtime: AppServerRuntime,
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
			(await currentAppHtml()).replaceAll(
				"__CODEWIKI_ASSET_DIGEST__",
				await currentAppAssetDigest(),
			),
		);
		return true;
	}
	if (url.pathname === "/assets/codewiki-logo.png") {
		writePng(response, await currentAppLogoPng());
		return true;
	}
	return false;
}

async function routeAuthorizedGet(
	runtime: AppServerRuntime,
	response: ServerResponse,
	url: URL,
): Promise<boolean> {
	if (url.pathname === "/api/state") {
		writeJson(response, 200, await readCodewikiAppState(runtime));
		return true;
	}
	if (url.pathname === "/api/changes") {
		writeJson(response, 200, await runtime.projection.changes());
		return true;
	}
	if (url.pathname === "/api/configuration") {
		writeJson(response, 200, await runtime.projection.configuration());
		return true;
	}
	if (url.pathname === "/api/previews") {
		writeJson(response, 200, await runtime.previewControl.status());
		return true;
	}
	if (url.pathname === "/api/meta") {
		writeJson(response, 200, {
			mode: process.env[APP_DAEMON_ENV] === "1" ? "daemon" : "in_process",
			pid: process.pid,
			assetDigest: await currentAppAssetDigest(),
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
	runtime: AppServerRuntime,
	request: IncomingMessage,
	response: ServerResponse,
	url: URL,
): Promise<boolean> {
	if (
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
	if (url.pathname === "/api/previews/commands") {
		writeJson(
			response,
			200,
			await runtime.previewControl.execute(parseDashboardPreviewCommand(command)),
		);
		scheduleBroadcast(runtime);
		scheduleProjectRuntimeObservation(runtime);
		return true;
	}
	return false;
}

function scheduleRuntimeClose(runtime: AppServerRuntime): void {
	setTimeout(() => {
		void runtime.close().then(() => {
			if (process.env[APP_DAEMON_ENV] === "1") process.exit(0);
		});
	}, 10);
}

function assertSameOriginMutation(
	runtime: AppServerRuntime,
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
		throw new AppRequestError(
			"Dashboard mutation requires exact same-origin authority.",
			403,
		);
	}
	if (fetchSite && fetchSite !== "same-origin") {
		throw new AppRequestError(
			"Dashboard mutation rejected cross-site request metadata.",
			403,
		);
	}
	const contentType = request.headers["content-type"] || "";
	if (!contentType.toLowerCase().startsWith("application/json")) {
		throw new AppRequestError(
			"Dashboard mutation requires application/json.",
			400,
		);
	}
}

async function readJsonRequest(request: IncomingMessage): Promise<unknown> {
	const maxBytes = 16_384;
	const declared = Number(request.headers["content-length"] || 0);
	if (Number.isFinite(declared) && declared > maxBytes) {
		throw new AppRequestError(
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
			throw new AppRequestError(
				"Dashboard command body exceeds 16384 bytes.",
				400,
			);
		}
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new AppRequestError(
			"Dashboard command body must be valid JSON.",
			400,
		);
	}
}

async function readCodewikiAppState(runtime: AppServerRuntime) {
	const [state, previews] = await Promise.all([
		runtime.projection.appState(),
		runtime.previewControl.status(),
	]);
	return { ...state, previews: [...previews] };
}

async function attachEventStream(
	runtime: AppServerRuntime,
	response: ServerResponse,
): Promise<void> {
	const state = await readCodewikiAppState(runtime);
	response.writeHead(200, {
		...APP_SERVER_SECURITY_HEADERS,
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
	});
	runtime.clients.add(response);
	response.on("close", () => runtime.clients.delete(response));
	writeEvent(response, state);
}

function scheduleProjectRuntimeObservation(runtime: AppServerRuntime): void {
	void runtime.projectRuntime?.queries
		.inspect({ kind: "project_truth_changed" })
		.catch(() => undefined);
}

async function watchRuntimeEvents(runtime: AppServerRuntime): Promise<void> {
	let cursor = 0;
	let generationId: string | undefined;
	while (!runtime.runtimeEventsClosed) {
		try {
			const projectRuntime = runtime.projectRuntime;
			if (!projectRuntime) return;
			const batch = await projectRuntime.events.read(cursor, {
				maxEvents: 64,
				waitMs: 5_000,
			});
			if (runtime.runtimeEventsClosed) return;
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
			if (runtime.runtimeEventsClosed) return;
			void runtime.projectRuntime?.connection
				.disconnect()
				.catch(() => undefined);
			try {
				runtime.projectRuntime = await runtime.projectRuntimeConnector(
					runtime.repoRoot,
					{
						clientId: `dashboard:${process.pid}:${new URL(runtime.origin).port}`,
						kind: "dashboard",
						supervision: "observer",
					},
				);
				runtime.projection = runtime.projectRuntime.queries;
				cursor = 0;
				generationId = undefined;
				scheduleBroadcast(runtime);
			} catch {
				await delay(250);
			}
		}
	}
}

function scheduleBroadcast(runtime: AppServerRuntime): void {
	if (runtime.broadcastTimer) clearTimeout(runtime.broadcastTimer);
	runtime.broadcastTimer = setTimeout(() => {
		runtime.broadcastTimer = undefined;
		void broadcast(runtime).catch(() => undefined);
	}, 120);
}

async function broadcast(runtime: AppServerRuntime): Promise<void> {
	if (runtime.clients.size === 0) return;
	const state = await readCodewikiAppState(runtime);
	for (const client of runtime.clients) writeEvent(client, state);
}

function writeEvent(
	response: ServerResponse,
	data: Awaited<ReturnType<typeof readCodewikiAppState>>,
): void {
	if (response.destroyed || response.writableEnded) return;
	response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function validToken(runtime: AppServerRuntime, url: URL): boolean {
	return url.searchParams.get("token") === runtime.token;
}

function writeHtml(response: ServerResponse, html: string): void {
	response.writeHead(200, {
		...APP_SERVER_SECURITY_HEADERS,
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "no-store",
	});
	response.end(html);
}

function writePng(response: ServerResponse, body: Buffer): void {
	response.writeHead(200, {
		...APP_SERVER_SECURITY_HEADERS,
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
		...APP_SERVER_SECURITY_HEADERS,
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
		error instanceof AppRequestError ? error.status : 500,
		{ error: error instanceof Error ? error.message : String(error) },
	);
}

async function closeRuntime(runtime: AppServerRuntime): Promise<void> {
	appServers.delete(runtime.repoRoot);
	runtime.runtimeEventsClosed = true;
	if (runtime.broadcastTimer) clearTimeout(runtime.broadcastTimer);
	if (runtime.runtimeHeartbeatTimer) {
		clearInterval(runtime.runtimeHeartbeatTimer);
	}
	await runtime.projectRuntime?.connection.disconnect().catch(() => undefined);
	runtime.unsubscribeProjection?.();
	for (const client of runtime.clients) client.end();
	runtime.clients.clear();
	await new Promise<void>((resolve, reject) => {
		runtime.server.close((error) => (error ? reject(error) : resolve()));
	});
}

function appServerHandle(
	runtime: AppServerRuntime,
): CodewikiAppServerHandle {
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
