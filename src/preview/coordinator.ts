import { spawn, type ChildProcess } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadWikiConfigFile } from "../project/config-file.ts";
import type { TraceRecord } from "../traces/types.ts";
import {
	checkingPreviewBrowserCapability,
	detectPreviewBrowserCapability,
	normalizePreviewSessionId,
	uncheckedPreviewBrowserCapability,
	openPreviewBrowser,
	type PreviewBrowserCapability,
	type PreviewBrowserHandle,
} from "./browser-adapter.ts";
import { tracePreviewBindings, type TracePreviewBinding } from "./binding.ts";
import {
	capturePreviewEvidence,
	type PreviewEvidenceCapture,
} from "./evidence.ts";
import {
	previewPackageScriptDigest,
	previewProfileById,
	previewProfileDigest,
	type PreviewPackageScriptRunner,
	type PreviewProfile,
} from "./profile.ts";

export type PreviewRuntimeState =
	| "starting"
	| "ready"
	| "blocked"
	| "failed"
	| "stopped";

export interface PreviewRuntimeStatus {
	profileId: string;
	profileDigest?: string;
	traceIds: string[];
	state: PreviewRuntimeState;
	url?: string;
	readyUrl?: string;
	managed: boolean;
	browser: PreviewProfile["browser"];
	browserCapability: PreviewBrowserCapability;
	startedAt?: string;
	readyAt?: string;
	failure?: string;
	logs: string[];
	captures: PreviewEvidenceCapture[];
}

export interface PreviewCoordinator {
	reconcile(records: TraceRecord[]): Promise<PreviewRuntimeStatus[]>;
	status(): PreviewRuntimeStatus[];
	start(
		profileId: string,
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]>;
	open(profileId: string): Promise<PreviewRuntimeStatus[]>;
	capture(
		profileId: string,
		traceId: string,
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]>;
	stop(profileId: string): Promise<PreviewRuntimeStatus[]>;
	restart(
		profileId: string,
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]>;
	close(): Promise<void>;
}

interface RuntimeEntry {
	profile: PreviewProfile;
	traceIds: string[];
	state: PreviewRuntimeState;
	managed: boolean;
	child?: ChildProcess;
	browserHandle?: PreviewBrowserHandle;
	browserCapability: PreviewBrowserCapability;
	startedAt?: string;
	readyAt?: string;
	failure?: string;
	logs: string[];
	captures: PreviewEvidenceCapture[];
}

export interface PreviewCoordinatorOptions {
	captureEvidence?: typeof capturePreviewEvidence;
	detectBrowserCapability?: typeof detectPreviewBrowserCapability;
	openBrowser?: typeof openPreviewBrowser;
}

interface PackageScriptCommand {
	command: string;
	args: string[];
}

const MAX_LOG_LINES = 100;
const MAX_LOG_LINE_LENGTH = 500;

export function createPreviewCoordinator(
	repoRoot: string,
	options: PreviewCoordinatorOptions = {},
): PreviewCoordinator {
	const captureEvidence = options.captureEvidence || capturePreviewEvidence;
	const detectBrowserCapability =
		options.detectBrowserCapability || detectPreviewBrowserCapability;
	const openBrowser = options.openBrowser || openPreviewBrowser;
	const runtimes = new Map<string, RuntimeEntry>();
	const blocked = new Map<string, PreviewRuntimeStatus>();
	const capturesByProfile = new Map<string, PreviewEvidenceCapture[]>();
	const capabilitiesByProfile = new Map<string, PreviewBrowserCapability>();
	const suppressed = new Set<string>();
	let closed = false;
	let sequence = Promise.resolve<PreviewRuntimeStatus[]>([]);

	function serialized(
		operation: () => Promise<PreviewRuntimeStatus[]>,
	): Promise<PreviewRuntimeStatus[]> {
		const next = sequence.then(operation, operation);
		sequence = next.catch(() => statuses());
		return next;
	}

	function statuses(): PreviewRuntimeStatus[] {
		return [...[...runtimes.values()].map(runtimeStatus), ...blocked.values()];
	}

	function reconcile(records: TraceRecord[]): Promise<PreviewRuntimeStatus[]> {
		return serialized(() => reconcileNow(records));
	}

	async function reconcileNow(
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]> {
		assertOpen();
		blocked.clear();
		const config = await loadWikiConfigFile(repoRoot);
		const activeBindings = tracePreviewBindings(records).filter((binding) =>
			tracePreviewIsActive(records, binding.traceId),
		);
		const byProfile = bindingsByProfile(activeBindings);

		for (const [profileId, bindings] of byProfile) {
			const profile = previewProfileById(config.preview, profileId);
			const traceIds = bindings
				.map((binding) => binding.traceId)
				.sort((left, right) => left.localeCompare(right));
			if (!profile) {
				await stopExistingRuntime(profileId);
				blocked.set(
					profileId,
					blockedStatus({
						profileId,
						traceIds,
						failure: "Preview profile is not configured.",
						browser: "none",
						captures: capturesByProfile.get(profileId),
					}),
				);
				continue;
			}
			const digest = previewProfileDigest(profile);
			const mismatch = bindings.find(
				(binding) => binding.profileDigest !== digest,
			);
			if (mismatch) {
				await stopExistingRuntime(profileId);
				blocked.set(
					profileId,
					blockedStatus({
						profileId,
						traceIds,
						failure: `Preview profile digest changed; expected ${mismatch.profileDigest}.`,
						profileDigest: digest,
						browser: profile.browser,
						browserCapability:
							capabilitiesByProfile.get(profileId) ||
							uncheckedPreviewBrowserCapability(profile.browser),
						captures: capturesByProfile.get(profileId),
					}),
				);
				continue;
			}
			const existing = runtimes.get(profileId);
			if (existing) {
				existing.traceIds = traceIds;
				continue;
			}
			if (suppressed.has(profileId)) {
				blocked.set(
					profileId,
					blockedStatus({
						profileId,
						traceIds,
						failure: "Preview was stopped for this Pi session.",
						profileDigest: digest,
						browser: profile.browser,
						browserCapability:
							capabilitiesByProfile.get(profileId) ||
							uncheckedPreviewBrowserCapability(profile.browser),
						captures: capturesByProfile.get(profileId),
					}),
				);
				continue;
			}
			void startRuntime(profile, traceIds, bindings);
		}

		for (const [profileId, runtime] of [...runtimes]) {
			if (byProfile.has(profileId)) continue;
			await stopRuntime(runtime);
			runtimes.delete(profileId);
			suppressed.delete(profileId);
		}
		return statuses();
	}

	async function startRuntime(
		profile: PreviewProfile,
		traceIds: string[],
		bindings: TracePreviewBinding[],
	): Promise<void> {
		const runtime: RuntimeEntry = {
			profile,
			traceIds,
			state: "starting",
			managed: false,
			browserCapability: checkingPreviewBrowserCapability(profile.browser),
			startedAt: new Date().toISOString(),
			logs: [],
			captures: [...(capturesByProfile.get(profile.id) || [])],
		};
		runtimes.set(profile.id, runtime);
		const readyUrl = previewReadyUrl(profile);
		try {
			setRuntimeBrowserCapability(
				runtime,
				await detectBrowserCapability(profile.browser),
			);
			if (runtime.browserCapability.cliState === "unavailable") {
				appendLog(
					runtime,
					runtime.browserCapability.reason || "Browser adapter unavailable.",
				);
			}
			if (!(await endpointReady(readyUrl))) {
				const command = await packageScriptCommand(repoRoot, profile.runner);
				runtime.child = spawn(command.command, command.args, {
					cwd: repoRoot,
					detached: process.platform !== "win32",
					env: { ...process.env, BROWSER: "none" },
					stdio: ["ignore", "pipe", "pipe"],
				});
				runtime.managed = true;
				attachLogs(runtime, runtime.child);
				await childSpawned(runtime.child);
			}
			await waitUntilReady(readyUrl, profile.readyTimeoutMs, runtime);
			if (runtime.state === "stopped") return;
			runtime.state = "ready";
			runtime.readyAt = new Date().toISOString();
			const autoOpen =
				profile.autoOpen &&
				bindings.some((binding) => binding.autoOpen === "once_per_trace");
			if (autoOpen && profile.browser !== "none")
				await openRuntimeBrowser(runtime);
		} catch (error) {
			if (runtime.state === "stopped") return;
			runtime.state = "failed";
			runtime.failure = message(error);
			appendLog(runtime, runtime.failure);
			if (runtime.child) await stopChild(runtime.child);
			runtime.child = undefined;
			runtime.managed = false;
		}
	}

	async function openRuntimeBrowser(runtime: RuntimeEntry): Promise<boolean> {
		if (runtime.browserHandle?.opened) return true;
		if (
			runtime.profile.browser === "playwright" &&
			runtime.browserCapability.cliState !== "available"
		) {
			appendLog(
				runtime,
				runtime.browserCapability.reason || "Playwright CLI is unavailable.",
			);
			return false;
		}
		try {
			runtime.browserHandle = await openBrowser({
				adapter: runtime.profile.browser,
				url: runtime.profile.url,
				sessionId: runtimeSessionId(runtime.profile.id, repoRoot),
			});
			if (!runtime.browserHandle.opened) return false;
			setRuntimeBrowserCapability(runtime, {
				...runtime.browserCapability,
				sessionState: "ready",
				captureAvailable: runtime.profile.browser === "playwright",
				reason: undefined,
				installHint: undefined,
			});
			return true;
		} catch (error) {
			const reason = `Browser open failed: ${message(error)}`;
			appendLog(runtime, reason);
			setRuntimeBrowserCapability(runtime, {
				...runtime.browserCapability,
				sessionState: "failed",
				captureAvailable: false,
				reason,
				...(runtime.profile.browser === "playwright"
					? {
							installHint:
								"Verify the browser with playwright-cli install-browser, then retry Open preview.",
						}
					: {}),
			});
			return false;
		}
	}

	function setRuntimeBrowserCapability(
		runtime: RuntimeEntry,
		capability: PreviewBrowserCapability,
	): void {
		runtime.browserCapability = capability;
		capabilitiesByProfile.set(runtime.profile.id, { ...capability });
	}

	async function stopExistingRuntime(profileId: string): Promise<void> {
		const runtime = runtimes.get(profileId);
		if (!runtime) return;
		await stopRuntime(runtime);
		runtimes.delete(profileId);
	}

	async function stopRuntime(runtime: RuntimeEntry): Promise<void> {
		await runtime.browserHandle?.close().catch(() => undefined);
		runtime.browserHandle = undefined;
		setRuntimeBrowserCapability(runtime, {
			...runtime.browserCapability,
			sessionState:
				runtime.profile.browser === "none" ? "not_applicable" : "not_open",
			captureAvailable: false,
			...(runtime.profile.browser === "playwright" &&
			runtime.browserCapability.cliState === "available"
				? { reason: "Open preview to verify the browser and enable Capture." }
				: {}),
		});
		if (runtime.child) await stopChild(runtime.child);
		runtime.child = undefined;
		runtime.managed = false;
		runtime.state = "stopped";
	}

	function assertOpen(): void {
		if (closed) throw new Error("Preview coordinator is closed.");
	}

	return {
		reconcile,
		status: statuses,
		start(profileId, records) {
			suppressed.delete(profileId);
			return reconcile(records);
		},
		open(profileId) {
			return serialized(async () => {
				assertOpen();
				const runtime = runtimes.get(profileId);
				if (!runtime || runtime.state !== "ready") {
					throw new Error(`Preview profile ${profileId} is not ready.`);
				}
				if (!(await openRuntimeBrowser(runtime))) {
					throw new Error(
						runtime.browserCapability.reason ||
							`Preview browser for ${profileId} is unavailable.`,
					);
				}
				return statuses();
			});
		},
		capture(profileId, traceId, records) {
			return serialized(async () => {
				assertOpen();
				const runtime = runtimes.get(profileId);
				if (!runtime || runtime.state !== "ready") {
					throw new Error(`Preview profile ${profileId} is not ready.`);
				}
				if (!runtime.traceIds.includes(traceId)) {
					throw new Error(
						`Preview profile ${profileId} is not bound to ${traceId}.`,
					);
				}
				if (runtime.profile.browser !== "playwright") {
					throw new Error(
						"Preview evidence capture requires the Playwright browser adapter.",
					);
				}
				const binding = tracePreviewBindings(records).find(
					(candidate) =>
						candidate.traceId === traceId && candidate.profileId === profileId,
				);
				if (!binding) {
					throw new Error(`Preview binding for ${traceId} is unavailable.`);
				}
				if (!runtime.browserCapability.captureAvailable) {
					throw new Error(
						runtime.browserCapability.reason ||
							"Open preview before capturing Playwright evidence.",
					);
				}
				try {
					const capture = await captureEvidence({
						repoRoot,
						profile: runtime.profile,
						traceId,
						records,
						viewports: binding.evidenceViewports,
						sessionId: runtimeSessionId(profileId, repoRoot),
					});
					runtime.captures.push(capture);
					runtime.captures = runtime.captures.slice(-10);
					capturesByProfile.set(profileId, [...runtime.captures]);
					return statuses();
				} catch (error) {
					appendLog(runtime, `Evidence capture failed: ${message(error)}`);
					throw error;
				}
			});
		},
		stop(profileId) {
			return serialized(async () => {
				assertOpen();
				suppressed.add(profileId);
				const runtime = runtimes.get(profileId);
				if (runtime) {
					await stopRuntime(runtime);
					runtimes.delete(profileId);
					blocked.set(
						profileId,
						blockedStatus({
							profileId,
							traceIds: runtime.traceIds,
							failure: "Preview was stopped for this Pi session.",
							profileDigest: previewProfileDigest(runtime.profile),
							browser: runtime.profile.browser,
							browserCapability: runtime.browserCapability,
							captures: runtime.captures,
						}),
					);
				}
				return statuses();
			});
		},
		restart(profileId, records) {
			return serialized(async () => {
				assertOpen();
				const runtime = runtimes.get(profileId);
				if (runtime) await stopRuntime(runtime);
				runtimes.delete(profileId);
				suppressed.delete(profileId);
				return reconcileNow(records);
			});
		},
		async close() {
			await serialized(async () => {
				if (closed) return [];
				closed = true;
				for (const runtime of runtimes.values()) await stopRuntime(runtime);
				runtimes.clear();
				blocked.clear();
				return [];
			});
		},
	};
}

export function tracePreviewIsActive(
	records: TraceRecord[],
	traceId: string,
): boolean {
	const traceRecords = records.filter((record) => record.traceId === traceId);
	if (traceRecords.some((record) => record.type === "trace_close"))
		return false;
	const semantic = traceRecords.filter(
		(record): record is Extract<TraceRecord, { type: "trace_event" }> =>
			record.type === "trace_event" && Boolean(record.loop),
	);
	const latest = semantic.at(-1);
	if (!latest) return false;
	if (latest.loop === "implementation") return true;
	return (
		latest.loop === "planning" &&
		(latest.event === "work_units_created" ||
			latest.event === "decisions_resolved")
	);
}

export async function packageScriptCommand(
	repoRoot: string,
	runner: PreviewPackageScriptRunner,
): Promise<PackageScriptCommand> {
	const source = await readFile(join(repoRoot, "package.json"), "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		throw new Error("Preview package.json must contain valid JSON.");
	}
	const command = objectRecord(objectRecord(parsed)?.scripts)?.[runner.script];
	if (typeof command !== "string" || !command.trim()) {
		throw new Error(`Preview package script ${runner.script} is not defined.`);
	}
	const actualDigest = previewPackageScriptDigest(command);
	if (actualDigest !== runner.scriptDigest) {
		throw new Error(
			`Preview package script ${runner.script} changed; expected ${runner.scriptDigest}.`,
		);
	}
	const packageManager = await detectPackageManager(repoRoot);
	if (packageManager === "yarn") {
		return { command: "yarn", args: [runner.script] };
	}
	return { command: packageManager, args: ["run", runner.script] };
}

async function detectPackageManager(
	repoRoot: string,
): Promise<"npm" | "pnpm" | "yarn" | "bun"> {
	try {
		const source = await readFile(join(repoRoot, "package.json"), "utf8");
		let parsed: unknown;
		try {
			parsed = JSON.parse(source);
		} catch {
			parsed = undefined;
		}
		const packageManager = objectRecord(parsed)?.packageManager;
		if (typeof packageManager === "string") {
			const name = packageManager.split("@")[0];
			if (
				name === "npm" ||
				name === "pnpm" ||
				name === "yarn" ||
				name === "bun"
			) {
				return name;
			}
		}
	} catch (error) {
		ignoreExpectedFailure(error);
	}
	for (const [file, manager] of [
		["pnpm-lock.yaml", "pnpm"],
		["yarn.lock", "yarn"],
		["bun.lock", "bun"],
		["bun.lockb", "bun"],
	] as const) {
		try {
			await access(join(repoRoot, file));
			return manager;
		} catch (error) {
			ignoreExpectedFailure(error);
		}
	}
	return "npm";
}

function bindingsByProfile(
	bindings: TracePreviewBinding[],
): Map<string, TracePreviewBinding[]> {
	const result = new Map<string, TracePreviewBinding[]>();
	for (const binding of bindings) {
		const current = result.get(binding.profileId) || [];
		current.push(binding);
		result.set(binding.profileId, current);
	}
	return result;
}

function blockedStatus(input: {
	profileId: string;
	traceIds: string[];
	failure: string;
	profileDigest?: string;
	browser: PreviewProfile["browser"];
	browserCapability?: PreviewBrowserCapability;
	captures?: PreviewEvidenceCapture[];
}): PreviewRuntimeStatus {
	return {
		profileId: input.profileId,
		...(input.profileDigest ? { profileDigest: input.profileDigest } : {}),
		traceIds: input.traceIds,
		state: "blocked",
		managed: false,
		browser: input.browser,
		browserCapability:
			input.browserCapability ||
			uncheckedPreviewBrowserCapability(input.browser),
		failure: input.failure,
		logs: [],
		captures: (input.captures || []).map(copyEvidenceCapture),
	};
}

function runtimeStatus(runtime: RuntimeEntry): PreviewRuntimeStatus {
	return {
		profileId: runtime.profile.id,
		profileDigest: previewProfileDigest(runtime.profile),
		traceIds: [...runtime.traceIds],
		state: runtime.state,
		url: runtime.profile.url,
		readyUrl: previewReadyUrl(runtime.profile),
		managed: runtime.managed,
		browser: runtime.profile.browser,
		browserCapability: { ...runtime.browserCapability },
		...(runtime.startedAt ? { startedAt: runtime.startedAt } : {}),
		...(runtime.readyAt ? { readyAt: runtime.readyAt } : {}),
		...(runtime.failure ? { failure: runtime.failure } : {}),
		logs: [...runtime.logs],
		captures: runtime.captures.map(copyEvidenceCapture),
	};
}

function copyEvidenceCapture(
	capture: PreviewEvidenceCapture,
): PreviewEvidenceCapture {
	return {
		...capture,
		screenshots: capture.screenshots.map((screenshot) => ({ ...screenshot })),
		console: { ...capture.console, lines: [...capture.console.lines] },
		network: { ...capture.network, lines: [...capture.network.lines] },
	};
}

function previewReadyUrl(profile: PreviewProfile): string {
	return new URL(profile.readyPath, `${profile.url}/`).href;
}

async function endpointReady(url: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 750);
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "error",
			signal: controller.signal,
		});
		return response.status >= 200 && response.status < 300;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

async function waitUntilReady(
	url: string,
	timeoutMs: number,
	runtime: RuntimeEntry,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await endpointReady(url)) return;
		if (
			runtime.child &&
			(runtime.child.exitCode !== null || runtime.child.signalCode !== null)
		) {
			throw new Error(
				`Preview process exited with ${
					runtime.child.signalCode
						? `signal ${runtime.child.signalCode}`
						: `code ${runtime.child.exitCode}`
				}.`,
			);
		}
		await delay(150);
	}
	throw new Error(`Preview readiness timed out after ${timeoutMs}ms.`);
}

function attachLogs(runtime: RuntimeEntry, child: ChildProcess): void {
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk) => appendLogChunk(runtime, String(chunk)));
	child.stderr?.on("data", (chunk) => appendLogChunk(runtime, String(chunk)));
}

function appendLogChunk(runtime: RuntimeEntry, chunk: string): void {
	for (const line of chunk.split(/\r?\n/)) {
		if (line.trim()) appendLog(runtime, line);
	}
}

function appendLog(runtime: RuntimeEntry, value: string): void {
	const redacted = value
		.replace(
			/(token|secret|password|authorization)\s*[=:]\s*\S+/gi,
			"$1=[redacted]",
		)
		.slice(0, MAX_LOG_LINE_LENGTH);
	runtime.logs.push(redacted);
	if (runtime.logs.length > MAX_LOG_LINES) {
		runtime.logs.splice(0, runtime.logs.length - MAX_LOG_LINES);
	}
}

async function childSpawned(child: ChildProcess): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		child.once("spawn", resolve);
		child.once("error", reject);
	});
}

async function stopChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.killed) return;
	try {
		if (process.platform !== "win32" && child.pid)
			process.kill(-child.pid, "SIGTERM");
		else child.kill("SIGTERM");
	} catch (error) {
		ignoreExpectedFailure(error);
	}
	await Promise.race([waitForExit(child), delay(2_000)]);
	if (child.exitCode !== null) return;
	try {
		if (process.platform !== "win32" && child.pid)
			process.kill(-child.pid, "SIGKILL");
		else child.kill("SIGKILL");
	} catch (error) {
		ignoreExpectedFailure(error);
	}
}

async function waitForExit(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return;
	await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

function runtimeSessionId(profileId: string, repoRoot: string): string {
	return normalizePreviewSessionId(
		`codewiki-${profileId}-${digestRoot(repoRoot)}`,
	);
}

function digestRoot(value: string): string {
	return Buffer.from(value).toString("base64url").slice(0, 12);
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function ignoreExpectedFailure(_error: unknown): void {
	return;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
