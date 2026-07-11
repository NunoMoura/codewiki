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
import { CODEWIKI_DASHBOARD_HTML } from "./assets.ts";
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
const DASHBOARD_DAEMON_ENV = "CODEWIKI_DASHBOARD_DAEMON";
const DASHBOARD_TMPDIR_ENV = "CODEWIKI_DASHBOARD_TMPDIR";
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
	const deadline = Date.now() + 4_000;
	let lastEndpoint: DashboardEndpoint | undefined;
	while (Date.now() < deadline) {
		const endpoint = await readDashboardEndpoint(repoRoot);
		if (endpoint) {
			lastEndpoint = endpoint;
			const meta = await readDashboardEndpointMeta(endpoint);
			if (meta?.mode === "daemon" && meta.assetDigest === expectedDigest) {
				return endpoint;
			}
		}
		await delay(60);
	}
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
	const deadline = Date.now() + 1_500;
	while (Date.now() < deadline) {
		if (!(await dashboardEndpointResponds(endpoint))) return;
		await delay(60);
	}
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

async function startInProcessDashboardServer(
	options: CodewikiDashboardServerOptions,
): Promise<CodewikiDashboardServerHandle> {
	const existing = dashboards.get(options.repoRoot);
	if (existing) {
		if (options.keepAlive) existing.server.ref();
		if (options.open && !existing.opened)
			existing.opened = openBrowser(existing.url);
		return dashboardHandle(existing);
	}
	const endpoint = await readDashboardEndpoint(options.repoRoot);
	const expectedDigest = await currentDashboardAssetDigest();
	if (
		endpoint &&
		(await dashboardEndpointIsCurrent(endpoint, expectedDigest))
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
	);
	dashboards.set(options.repoRoot, runtime);
	if (options.open) runtime.opened = openBrowser(runtime.url);
	return dashboardHandle(runtime);
}

async function readDashboardEndpoint(
	repoRoot: string,
): Promise<DashboardEndpoint | undefined> {
	try {
		const raw = await readFileWithLegacyFallback(
			dashboardEndpointPath(repoRoot),
			legacyDashboardEndpointPath(repoRoot),
		);
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

async function readFileWithLegacyFallback(
	path: string,
	legacyPath: string,
): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (!isNotFound(error)) throw error;
		return await readFile(legacyPath, "utf8");
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
	await Promise.all([
		rm(dashboardEndpointPath(repoRoot), { force: true }),
		rm(legacyDashboardEndpointPath(repoRoot), { force: true }),
	]);
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

function legacyDashboardEndpointPath(repoRoot: string): string {
	const key = createHash("sha256").update(repoRoot).digest("hex").slice(0, 32);
	return join(tmpdir(), "codewiki-dashboard", `${key}.json`);
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
): Promise<DashboardRuntime> {
	const token =
		preferredEndpoint?.token || randomBytes(18).toString("base64url");
	const clients = new Set<ServerResponse>();
	let runtime: DashboardRuntime;
	const server = createServer(async (request, response) => {
		try {
			await routeRequest(
				runtime,
				request.method || "GET",
				request.url || "/",
				response,
			);
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
	runtime = {
		repoRoot,
		server,
		url: endpoint.url,
		origin,
		token,
		clients,
		opened: false,
		close: () => closeRuntime(runtime),
	};
	await writeDashboardEndpoint(endpoint);
	runtime.watcher = watchTraceDirectory(runtime);
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
	method: string,
	requestUrl: string,
	response: ServerResponse,
): Promise<void> {
	const url = new URL(requestUrl, runtime.origin);
	if (method !== "GET") {
		writeJson(response, 405, { error: "Method not allowed" });
		return;
	}
	if (url.pathname === "/" || url.pathname === "/index.html") {
		writeHtml(
			response,
			(await currentDashboardHtml()).replaceAll(
				"__CODEWIKI_ASSET_DIGEST__",
				await currentDashboardAssetDigest(),
			),
		);
		return;
	}
	if (url.pathname === "/assets/codewiki-logo.png") {
		writePng(response, await currentDashboardLogoPng());
		return;
	}
	if (!validToken(runtime, url)) {
		writeJson(response, 403, { error: "Forbidden" });
		return;
	}
	if (url.pathname === "/api/state") {
		writeJson(response, 200, await readDashboardState(runtime.repoRoot));
		return;
	}
	if (url.pathname === "/api/meta") {
		writeJson(response, 200, {
			mode: process.env[DASHBOARD_DAEMON_ENV] === "1" ? "daemon" : "in_process",
			pid: process.pid,
			assetDigest: await currentDashboardAssetDigest(),
		});
		return;
	}
	if (url.pathname === "/api/shutdown") {
		writeJson(response, 200, { ok: true });
		setTimeout(() => {
			void runtime.close().then(() => {
				if (process.env[DASHBOARD_DAEMON_ENV] === "1") process.exit(0);
			});
		}, 10);
		return;
	}
	if (url.pathname === "/api/events") {
		await attachEventStream(runtime, response);
		return;
	}
	writeJson(response, 404, { error: "Not found" });
}

async function readDashboardState(
	repoRoot: string,
): Promise<CodewikiDashboardState> {
	const traceFiles = await readProjectTraceFiles(repoRoot);
	const snapshot = await buildProjectWikiState({ repoRoot, traceFiles });
	return buildCodewikiDashboardState(snapshot, repoRoot, traceFiles.records);
}

async function attachEventStream(
	runtime: DashboardRuntime,
	response: ServerResponse,
): Promise<void> {
	const state = await readDashboardState(runtime.repoRoot);
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

function scheduleBroadcast(runtime: DashboardRuntime): void {
	if (runtime.broadcastTimer) clearTimeout(runtime.broadcastTimer);
	runtime.broadcastTimer = setTimeout(() => {
		runtime.broadcastTimer = undefined;
		void broadcast(runtime).catch(() => undefined);
	}, 120);
}

async function broadcast(runtime: DashboardRuntime): Promise<void> {
	if (runtime.clients.size === 0) return;
	const state = await readDashboardState(runtime.repoRoot);
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
	writeJson(response, 500, {
		error: error instanceof Error ? error.message : String(error),
	});
}

async function closeRuntime(runtime: DashboardRuntime): Promise<void> {
	dashboards.delete(runtime.repoRoot);
	if (runtime.broadcastTimer) clearTimeout(runtime.broadcastTimer);
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
	const command = browserCommand(url);
	if (!command) return false;
	try {
		const child = spawn(command.command, command.args, {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
		return true;
	} catch {
		return false;
	}
}

function browserCommand(
	url: string,
): { command: string; args: string[] } | undefined {
	if (process.platform === "darwin") return { command: "open", args: [url] };
	if (process.platform === "win32") {
		return { command: "cmd", args: ["/c", "start", "", url] };
	}
	return { command: "xdg-open", args: [url] };
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
