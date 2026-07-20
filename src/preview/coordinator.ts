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
import {
	traceUiPreviewTargetBindings,
	type TraceUiPreviewTargetBinding,
} from "./binding.ts";
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
	type WikiPreviewConfig,
} from "./profile.ts";
import {
	readPreviewIntegrationState,
	type PreviewIntegrationState,
} from "./integration.ts";
import {
	previewTargetUrl,
	uiPreviewTargetById,
	uiPreviewTargetDigest,
	type UiPreviewTarget,
} from "./target.ts";

export type PreviewRuntimeState =
	| "starting"
	| "ready"
	| "blocked"
	| "failed"
	| "stopped";

export interface PreviewRuntimeStatus {
	targetId: string;
	targetDigest?: string;
	uiRef?: string;
	scenario?: string;
	profileId: string;
	profileDigest?: string;
	traceIds: string[];
	changeIds: string[];
	sprintIds: string[];
	workItemIds: string[];
	viewports: string[];
	state: PreviewRuntimeState;
	url?: string;
	readyUrl?: string;
	managed: boolean;
	browser: PreviewProfile["browser"];
	browserCapability: PreviewBrowserCapability;
	integration?: PreviewIntegrationState;
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
		targetId: string,
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]>;
	open(targetId: string): Promise<PreviewRuntimeStatus[]>;
	capture(
		targetId: string,
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]>;
	stop(targetId: string): Promise<PreviewRuntimeStatus[]>;
	restart(
		targetId: string,
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]>;
	close(): Promise<void>;
}

interface ResolvedPreviewTarget {
	binding: TraceUiPreviewTargetBinding;
	target: UiPreviewTarget;
	integration: PreviewIntegrationState;
}

interface RuntimeEntry {
	profile: PreviewProfile;
	targets: ResolvedPreviewTarget[];
	state: PreviewRuntimeState;
	managed: boolean;
	child?: ChildProcess;
	browserHandles: Map<string, PreviewBrowserHandle>;
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
	readIntegrationState?: typeof readPreviewIntegrationState;
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
	const readIntegrationState =
		options.readIntegrationState || readPreviewIntegrationState;
	const runtimes = new Map<string, RuntimeEntry>();
	const blocked = new Map<string, PreviewRuntimeStatus>();
	const capturesByTarget = new Map<string, PreviewEvidenceCapture[]>();
	const capabilitiesByProfile = new Map<string, PreviewBrowserCapability>();
	const suppressedProfiles = new Set<string>();
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
		return [
			...[...runtimes.values()].flatMap(runtimeStatuses),
			...blocked.values(),
		].sort((left, right) => left.targetId.localeCompare(right.targetId));
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
		const activeBindings = traceUiPreviewTargetBindings(records).filter(
			(binding) =>
				binding.traceIds.some((traceId) =>
					tracePreviewIsActive(records, traceId),
				),
		);
		const resolvedByProfile = await resolveActivePreviewTargets({
			repoRoot,
			config: config.preview,
			bindings: activeBindings,
			readIntegrationState,
			blocked,
			capturesByTarget,
			capabilitiesByProfile,
		});

		for (const [profileId, targets] of resolvedByProfile) {
			const profile = previewProfileById(config.preview, profileId);
			if (!profile) continue;
			const existing = runtimes.get(profileId);
			if (
				existing &&
				previewProfileDigest(existing.profile) !== previewProfileDigest(profile)
			) {
				await stopRuntime(existing);
				runtimes.delete(profileId);
			}
			const current = runtimes.get(profileId);
			if (current) {
				const nextById = new Map(
					targets.map((entry) => [entry.target.id, entry] as const),
				);
				for (const previous of current.targets) {
					const next = nextById.get(previous.target.id);
					if (
						next &&
						next.binding.targetDigest === previous.binding.targetDigest
					) {
						continue;
					}
					await current.browserHandles
						.get(previous.target.id)
						?.close()
						.catch(() => undefined);
					current.browserHandles.delete(previous.target.id);
				}
				if (
					current.browserHandles.size === 0 &&
					current.profile.browser !== "none"
				) {
					setRuntimeBrowserCapability(current, {
						...current.browserCapability,
						sessionState: "not_open",
						captureAvailable: false,
					});
				}
				current.targets = targets;
				continue;
			}
			if (suppressedProfiles.has(profileId)) {
				for (const entry of targets) {
					blocked.set(
						entry.target.id,
						blockedTargetStatus({
							binding: entry.binding,
							target: entry.target,
							profile,
							failure: "Preview was stopped for this Pi session.",
							browserCapability:
								capabilitiesByProfile.get(profileId) ||
								uncheckedPreviewBrowserCapability(profile.browser),
							captures: capturesByTarget.get(entry.target.id),
						}),
					);
				}
				continue;
			}
			void startRuntime(profile, targets);
		}

		for (const [profileId, runtime] of [...runtimes]) {
			if (resolvedByProfile.has(profileId)) continue;
			await stopRuntime(runtime);
			runtimes.delete(profileId);
			suppressedProfiles.delete(profileId);
		}
		return statuses();
	}

	async function startRuntime(
		profile: PreviewProfile,
		targets: ResolvedPreviewTarget[],
	): Promise<void> {
		const runtime: RuntimeEntry = {
			profile,
			targets,
			state: "starting",
			managed: false,
			browserHandles: new Map(),
			browserCapability: checkingPreviewBrowserCapability(profile.browser),
			startedAt: new Date().toISOString(),
			logs: [],
			captures: targets.flatMap(
				(entry) => capturesByTarget.get(entry.target.id) || [],
			),
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
			if (profile.autoOpen && profile.browser !== "none") {
				for (const entry of targets) {
					if (entry.binding.autoOpen === "once_per_target") {
						await openRuntimeBrowser(runtime, entry.target.id);
					}
				}
			}
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

	async function openRuntimeBrowser(
		runtime: RuntimeEntry,
		targetId: string,
	): Promise<boolean> {
		if (runtime.browserHandles.get(targetId)?.opened) return true;
		const entry = runtime.targets.find(
			(candidate) => candidate.target.id === targetId,
		);
		if (!entry) throw new Error(`Preview target ${targetId} is not active.`);
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
			const handle = await openBrowser({
				adapter: runtime.profile.browser,
				url: previewTargetUrl(runtime.profile.url, entry.target),
				sessionId: runtimeSessionId(runtime.profile.id, targetId, repoRoot),
			});
			if (!handle.opened) return false;
			runtime.browserHandles.set(targetId, handle);
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

	async function stopRuntime(runtime: RuntimeEntry): Promise<void> {
		for (const handle of runtime.browserHandles.values()) {
			await handle.close().catch(() => undefined);
		}
		runtime.browserHandles.clear();
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

	function runtimeForTarget(targetId: string): RuntimeEntry | undefined {
		return [...runtimes.values()].find((runtime) =>
			runtime.targets.some((entry) => entry.target.id === targetId),
		);
	}

	function assertOpen(): void {
		if (closed) throw new Error("Preview coordinator is closed.");
	}

	return {
		reconcile,
		status: statuses,
		start(targetId, records) {
			const blockedTarget = blocked.get(targetId);
			if (blockedTarget) suppressedProfiles.delete(blockedTarget.profileId);
			const runtime = runtimeForTarget(targetId);
			if (runtime) suppressedProfiles.delete(runtime.profile.id);
			return reconcile(records);
		},
		open(targetId) {
			return serialized(async () => {
				assertOpen();
				const runtime = runtimeForTarget(targetId);
				if (!runtime || runtime.state !== "ready") {
					throw new Error(`Preview target ${targetId} is not ready.`);
				}
				if (!(await openRuntimeBrowser(runtime, targetId))) {
					throw new Error(
						runtime.browserCapability.reason ||
							`Preview browser for ${targetId} is unavailable.`,
					);
				}
				return statuses();
			});
		},
		capture(targetId, records) {
			return serialized(async () => {
				assertOpen();
				const runtime = runtimeForTarget(targetId);
				if (!runtime || runtime.state !== "ready") {
					throw new Error(`Preview target ${targetId} is not ready.`);
				}
				const entry = runtime.targets.find(
					(candidate) => candidate.target.id === targetId,
				);
				if (!entry)
					throw new Error(`Preview target ${targetId} is unavailable.`);
				if (runtime.profile.browser !== "playwright") {
					throw new Error(
						"Preview evidence capture requires the Playwright browser adapter.",
					);
				}
				if (runtime.browserCapability.cliState !== "available") {
					throw new Error(
						runtime.browserCapability.reason ||
							"Playwright CLI is unavailable.",
					);
				}
				if (!runtime.browserHandles.get(targetId)?.opened) {
					throw new Error(
						"Open this preview target before capturing Playwright evidence.",
					);
				}
				try {
					entry.integration = await readIntegrationState({
						repoRoot,
						binding: entry.binding,
					});
					const capture = await captureEvidence({
						repoRoot,
						profile: runtime.profile,
						target: entry.target,
						binding: entry.binding,
						integration: entry.integration,
						records,
						sessionId: runtimeSessionId(runtime.profile.id, targetId, repoRoot),
					});
					runtime.captures.push(capture);
					runtime.captures = runtime.captures.slice(-20);
					capturesByTarget.set(
						targetId,
						runtime.captures.filter(
							(candidate) => candidate.targetId === targetId,
						),
					);
					return statuses();
				} catch (error) {
					appendLog(runtime, `Evidence capture failed: ${message(error)}`);
					throw error;
				}
			});
		},
		stop(targetId) {
			return serialized(async () => {
				assertOpen();
				const runtime = runtimeForTarget(targetId);
				if (!runtime) return statuses();
				suppressedProfiles.add(runtime.profile.id);
				await stopRuntime(runtime);
				runtimes.delete(runtime.profile.id);
				for (const entry of runtime.targets) {
					blocked.set(
						entry.target.id,
						blockedTargetStatus({
							binding: entry.binding,
							target: entry.target,
							profile: runtime.profile,
							failure: "Preview was stopped for this Pi session.",
							browserCapability: runtime.browserCapability,
							captures: runtime.captures.filter(
								(capture) => capture.targetId === entry.target.id,
							),
						}),
					);
				}
				return statuses();
			});
		},
		restart(targetId, records) {
			return serialized(async () => {
				assertOpen();
				const runtime = runtimeForTarget(targetId);
				if (runtime) {
					await stopRuntime(runtime);
					runtimes.delete(runtime.profile.id);
					suppressedProfiles.delete(runtime.profile.id);
				} else {
					const blockedTarget = blocked.get(targetId);
					if (blockedTarget) suppressedProfiles.delete(blockedTarget.profileId);
				}
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
	return (
		latest.loop === "implementation" ||
		(latest.loop === "planning" && latest.event === "work_units_created")
	);
}

async function packageScriptCommand(
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

async function resolveActivePreviewTargets(input: {
	repoRoot: string;
	config: WikiPreviewConfig;
	bindings: TraceUiPreviewTargetBinding[];
	readIntegrationState: typeof readPreviewIntegrationState;
	blocked: Map<string, PreviewRuntimeStatus>;
	capturesByTarget: Map<string, PreviewEvidenceCapture[]>;
	capabilitiesByProfile: Map<string, PreviewBrowserCapability>;
}): Promise<Map<string, ResolvedPreviewTarget[]>> {
	const conflictedTargetIds = conflictingTargetIds(input.bindings);
	const resolvedByProfile = new Map<string, ResolvedPreviewTarget[]>();
	for (const binding of input.bindings) {
		const profile = previewProfileById(input.config, binding.profileId);
		const target = uiPreviewTargetById(
			input.config.uiPreviewTargets,
			binding.targetId,
		);
		const failure = previewBindingFailure({
			binding,
			profile,
			target,
			conflicted: conflictedTargetIds.has(binding.targetId),
		});
		if (failure || !profile || !target) {
			input.blocked.set(
				binding.targetId,
				blockedTargetStatus({
					binding,
					target,
					profile,
					failure: failure || "Preview target is unavailable.",
					browserCapability:
						input.capabilitiesByProfile.get(binding.profileId) ||
						uncheckedPreviewBrowserCapability(profile?.browser || "none"),
					captures: input.capturesByTarget.get(binding.targetId),
				}),
			);
			continue;
		}
		try {
			const integration = await input.readIntegrationState({
				repoRoot: input.repoRoot,
				binding,
			});
			const entries = resolvedByProfile.get(profile.id) || [];
			entries.push({ binding, target, integration });
			resolvedByProfile.set(profile.id, entries);
		} catch (error) {
			input.blocked.set(
				binding.targetId,
				blockedTargetStatus({
					binding,
					target,
					profile,
					failure: `Integration checkout unavailable: ${message(error)}`,
					browserCapability:
						input.capabilitiesByProfile.get(profile.id) ||
						uncheckedPreviewBrowserCapability(profile.browser),
					captures: input.capturesByTarget.get(binding.targetId),
				}),
			);
		}
	}
	return resolvedByProfile;
}

function conflictingTargetIds(
	bindings: TraceUiPreviewTargetBinding[],
): Set<string> {
	const signatures = new Map<string, Set<string>>();
	for (const binding of bindings) {
		const values = signatures.get(binding.targetId) || new Set<string>();
		values.add(
			[
				binding.targetDigest,
				binding.profileId,
				binding.profileDigest,
				String(binding.required),
				binding.activation,
				binding.autoOpen,
			].join("\0"),
		);
		signatures.set(binding.targetId, values);
	}
	return new Set(
		[...signatures].flatMap(([targetId, values]) =>
			values.size > 1 ? [targetId] : [],
		),
	);
}

function previewBindingFailure(input: {
	binding: TraceUiPreviewTargetBinding;
	profile?: PreviewProfile;
	target?: UiPreviewTarget;
	conflicted: boolean;
}): string | undefined {
	if (input.conflicted) {
		return `Preview target ${input.binding.targetId} has conflicting active digests.`;
	}
	if (!input.target) return "Preview target is not configured.";
	if (!input.profile) return "Preview profile is not configured.";
	const targetDigest = uiPreviewTargetDigest(input.target);
	if (targetDigest !== input.binding.targetDigest) {
		return `Preview target digest changed; expected ${input.binding.targetDigest}.`;
	}
	if (input.target.profileId !== input.binding.profileId) {
		return `Preview target ${input.target.id} changed profile ownership.`;
	}
	const profileDigest = previewProfileDigest(input.profile);
	if (profileDigest !== input.binding.profileDigest) {
		return `Preview profile digest changed; expected ${input.binding.profileDigest}.`;
	}
	return undefined;
}

function blockedTargetStatus(input: {
	binding: TraceUiPreviewTargetBinding;
	target?: UiPreviewTarget;
	profile?: PreviewProfile;
	failure: string;
	browserCapability?: PreviewBrowserCapability;
	captures?: PreviewEvidenceCapture[];
}): PreviewRuntimeStatus {
	const browser = input.profile?.browser || "none";
	return {
		targetId: input.binding.targetId,
		targetDigest: input.binding.targetDigest,
		...(input.target ? { uiRef: input.target.uiRef } : {}),
		...(input.target?.scenario ? { scenario: input.target.scenario } : {}),
		profileId: input.binding.profileId,
		profileDigest: input.binding.profileDigest,
		traceIds: [...input.binding.traceIds],
		changeIds: [...input.binding.contributingChangeIds],
		sprintIds: [...input.binding.sprintIds],
		workItemIds: [...input.binding.workItemIds],
		viewports: [...(input.target?.viewports || [])],
		state: "blocked",
		managed: false,
		browser,
		browserCapability:
			input.browserCapability || uncheckedPreviewBrowserCapability(browser),
		failure: input.failure,
		logs: [],
		captures: (input.captures || []).map(copyEvidenceCapture),
	};
}

function runtimeStatuses(runtime: RuntimeEntry): PreviewRuntimeStatus[] {
	return runtime.targets.map((entry) => ({
		targetId: entry.target.id,
		targetDigest: entry.binding.targetDigest,
		uiRef: entry.target.uiRef,
		...(entry.target.scenario ? { scenario: entry.target.scenario } : {}),
		profileId: runtime.profile.id,
		profileDigest: previewProfileDigest(runtime.profile),
		traceIds: [...entry.binding.traceIds],
		changeIds: [...entry.binding.contributingChangeIds],
		sprintIds: [...entry.binding.sprintIds],
		workItemIds: [...entry.binding.workItemIds],
		viewports: [...entry.target.viewports],
		state: runtime.state,
		url: previewTargetUrl(runtime.profile.url, entry.target),
		readyUrl: previewReadyUrl(runtime.profile),
		managed: runtime.managed,
		browser: runtime.profile.browser,
		browserCapability: targetBrowserCapability(runtime, entry.target.id),
		integration: copyIntegrationState(entry.integration),
		...(runtime.startedAt ? { startedAt: runtime.startedAt } : {}),
		...(runtime.readyAt ? { readyAt: runtime.readyAt } : {}),
		...(runtime.failure ? { failure: runtime.failure } : {}),
		logs: [...runtime.logs],
		captures: runtime.captures.flatMap((capture) =>
			capture.targetId === entry.target.id
				? [copyEvidenceCapture(capture)]
				: [],
		),
	}));
}

function targetBrowserCapability(
	runtime: RuntimeEntry,
	targetId: string,
): PreviewBrowserCapability {
	if (!runtime.browserHandles.get(targetId)?.opened) {
		return {
			...runtime.browserCapability,
			...(runtime.profile.browser === "none" ||
			runtime.browserCapability.sessionState === "failed"
				? {}
				: {
						sessionState: "not_open" as const,
						captureAvailable: false,
					}),
		};
	}
	return {
		...runtime.browserCapability,
		sessionState: "ready",
		captureAvailable: runtime.profile.browser === "playwright",
		reason: undefined,
		installHint: undefined,
	};
}

function copyEvidenceCapture(
	capture: PreviewEvidenceCapture,
): PreviewEvidenceCapture {
	return {
		...capture,
		traceIds: [...capture.traceIds],
		changeIds: [...capture.changeIds],
		sprintIds: [...capture.sprintIds],
		workItemIds: [...capture.workItemIds],
		implementation: capture.implementation.map((entry) => ({ ...entry })),
		integration: copyIntegrationState(capture.integration),
		screenshots: capture.screenshots.map((screenshot) => ({ ...screenshot })),
		console: { ...capture.console, lines: [...capture.console.lines] },
		network: { ...capture.network, lines: [...capture.network.lines] },
	};
}

function copyIntegrationState(
	integration: PreviewIntegrationState,
): PreviewIntegrationState {
	return {
		...integration,
		dirtyPaths: [...integration.dirtyPaths],
		visibleChangeIds: [...integration.visibleChangeIds],
		conflictingChangeIds: [...integration.conflictingChangeIds],
		sprintIds: [...integration.sprintIds],
		workItemIds: [...integration.workItemIds],
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

function runtimeSessionId(
	profileId: string,
	targetId: string,
	repoRoot: string,
): string {
	return normalizePreviewSessionId(
		`codewiki-${profileId}-${targetId}-${digestRoot(repoRoot)}`,
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
