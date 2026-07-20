import { createHash } from "node:crypto";
import {
	runWikiConfig,
	type PartialWikiConfig,
	type WikiConfig,
} from "../project/config.ts";
import {
	loadWikiConfigFile,
	writeWikiConfigFile,
} from "../project/config-file.ts";
import { DashboardTraceHostControlError } from "./trace-host-control.ts";
import {
	DASHBOARD_CONFIG_BUDGET_MAXIMA,
	DASHBOARD_CONFIG_MAX_WORKERS,
	DASHBOARD_CONFIG_MODEL_MAXIMA,
	dashboardConfigDigest,
	loadDashboardConfigState,
	type DashboardConfigState,
} from "./config-state.ts";

interface DashboardConfigCommand {
	commandId: string;
	expectedStateDigest: string;
	expectedConfigDigest: string;
	patch: PartialWikiConfig;
}

export interface DashboardConfigReceipt {
	receiptId: string;
	commandId: string;
	recordedAt: string;
	configDigestBefore: string;
	configDigestAfter: string;
	stateDigestBefore: string;
	stateDigestAfter: string;
	restartRequired: boolean;
}

export interface DashboardConfigCommandResult {
	replayed: boolean;
	receipt: DashboardConfigReceipt;
	state: DashboardConfigState;
}

export interface DashboardConfigControl {
	status(): Promise<DashboardConfigState>;
	execute(value: unknown): Promise<DashboardConfigCommandResult>;
}

interface DashboardConfigControlOptions {
	repoRoot: string;
	activeConfig: WikiConfig;
	now?: () => Date;
}

interface IdempotencyEntry {
	payloadDigest: string;
	result: DashboardConfigCommandResult;
}

export async function createDefaultDashboardConfigControl(
	repoRoot: string,
): Promise<DashboardConfigControl> {
	return createDashboardConfigControl({
		repoRoot,
		activeConfig: await loadWikiConfigFile(repoRoot),
	});
}

export function createDashboardConfigControl(
	options: DashboardConfigControlOptions,
): DashboardConfigControl {
	const completed = new Map<string, IdempotencyEntry>();
	const pending = new Map<
		string,
		{ payloadDigest: string; result: Promise<DashboardConfigCommandResult> }
	>();
	const now = options.now || (() => new Date());
	let sequence: Promise<unknown> = Promise.resolve();
	return {
		status: () =>
			loadDashboardConfigState(options.repoRoot, options.activeConfig),
		async execute(value) {
			const command = parseDashboardConfigCommand(value);
			const payloadDigest = digest(command);
			const existing = completed.get(command.commandId);
			if (existing) {
				if (existing.payloadDigest !== payloadDigest) {
					throw conflict("Command id was already used for different input.");
				}
				return { ...existing.result, replayed: true };
			}
			const inFlight = pending.get(command.commandId);
			if (inFlight) {
				if (inFlight.payloadDigest !== payloadDigest) {
					throw conflict("Command id is running with different input.");
				}
				return { ...(await inFlight.result), replayed: true };
			}
			const result = sequence.then(() => executeCommand(options, command, now));
			sequence = result.then(
				() => undefined,
				() => undefined,
			);
			pending.set(command.commandId, { payloadDigest, result });
			try {
				const resolved = await result;
				completed.set(command.commandId, { payloadDigest, result: resolved });
				trimEntries(completed, 64);
				return resolved;
			} finally {
				pending.delete(command.commandId);
			}
		},
	};
}

async function executeCommand(
	options: DashboardConfigControlOptions,
	command: DashboardConfigCommand,
	now: () => Date,
): Promise<DashboardConfigCommandResult> {
	const before = await loadDashboardConfigState(
		options.repoRoot,
		options.activeConfig,
	);
	if (before.stateDigest !== command.expectedStateDigest) {
		throw conflict(
			"Dashboard configuration state changed; refresh before retrying.",
		);
	}
	if (before.configDigest !== command.expectedConfigDigest) {
		throw conflict("Configuration digest changed; refresh before retrying.");
	}
	const current = await loadWikiConfigFile(options.repoRoot);
	if (dashboardConfigDigest(current) !== before.configDigest) {
		throw conflict("Configuration changed while preparing the patch.");
	}
	let next: WikiConfig;
	try {
		next = runWikiConfig({ current, patch: command.patch }).config;
	} catch (error) {
		throw badRequest(error instanceof Error ? error.message : String(error));
	}
	assertAuthorityCeilings(options.activeConfig, next);
	assertOperationalBounds(next);
	await writeWikiConfigFile(options.repoRoot, next);
	const after = await loadDashboardConfigState(
		options.repoRoot,
		options.activeConfig,
	);
	return {
		replayed: false,
		receipt: {
			receiptId: `config-command:${command.commandId}`,
			commandId: command.commandId,
			recordedAt: now().toISOString(),
			configDigestBefore: before.configDigest,
			configDigestAfter: after.configDigest,
			stateDigestBefore: before.stateDigest,
			stateDigestAfter: after.stateDigest,
			restartRequired: after.restartRequired,
		},
		state: after,
	};
}

export function parseDashboardConfigCommand(
	value: unknown,
): DashboardConfigCommand {
	if (!isRecord(value))
		throw badRequest("Dashboard configuration command must be an object.");
	assertKnownKeys(value, "command", [
		"commandId",
		"expectedStateDigest",
		"expectedConfigDigest",
		"patch",
	]);
	const patch = boundedPatch(value.patch);
	return {
		commandId: identifier(value.commandId, "commandId", 128),
		expectedStateDigest: sha256Digest(
			value.expectedStateDigest,
			"expectedStateDigest",
		),
		expectedConfigDigest: sha256Digest(
			value.expectedConfigDigest,
			"expectedConfigDigest",
		),
		patch,
	};
}

function boundedPatch(value: unknown): PartialWikiConfig {
	if (!isRecord(value)) throw badRequest("patch must be an object.");
	if (Buffer.byteLength(JSON.stringify(value), "utf8") > 12_000) {
		throw badRequest("patch exceeds 12000 bytes.");
	}
	assertKnownKeys(value, "patch", ["runtime", "hosts"]);
	const runtime = optionalRecord(value.runtime, "runtime");
	const hosts = optionalRecord(value.hosts, "hosts");
	if (runtime) {
		assertKnownKeys(runtime, "runtime", [
			"maxWorkers",
			"worktreeIsolation",
			"automation",
			"agency",
			"budgets",
			"modelRouting",
		]);
	}
	if (hosts) {
		assertKnownKeys(hosts, "hosts", ["pi"]);
		const pi = optionalRecord(hosts.pi, "hosts.pi");
		if (pi) assertKnownKeys(pi, "hosts.pi", ["enabled"]);
	}
	assertNoSensitiveKeys(value);
	return structuredClone(value) as PartialWikiConfig;
}

function assertAuthorityCeilings(active: WikiConfig, next: WikiConfig): void {
	if (
		automationRank(next.runtime.automation) >
		automationRank(active.runtime.automation)
	) {
		throw forbidden(
			"Dashboard configuration cannot raise the runtime automation ceiling.",
		);
	}
	if (agencyRank(next.runtime.agency) > agencyRank(active.runtime.agency)) {
		throw forbidden(
			"Dashboard configuration cannot raise the runtime agency ceiling.",
		);
	}
	if (
		qualityRank(next.runtime.modelRouting.qualityFloor) <
		qualityRank(active.runtime.modelRouting.qualityFloor)
	) {
		throw forbidden(
			"Dashboard configuration cannot lower the model quality floor.",
		);
	}
	if (next.hosts.pi.enabled && !active.hosts.pi.enabled) {
		throw forbidden(
			"Dashboard configuration cannot enable a host above the active baseline.",
		);
	}
	const allowedTools = new Set(
		active.runtime.modelRouting.routes.flatMap((route) => route.allowedTools),
	);
	for (const route of next.runtime.modelRouting.routes) {
		for (const tool of route.allowedTools) {
			if (!allowedTools.has(tool)) {
				throw forbidden(
					`Dashboard configuration cannot add tool authority ${tool}.`,
				);
			}
		}
	}
}

function assertOperationalBounds(config: WikiConfig): void {
	if (config.runtime.maxWorkers > DASHBOARD_CONFIG_MAX_WORKERS) {
		throw badRequest(
			`Dashboard configuration maxWorkers cannot exceed ${DASHBOARD_CONFIG_MAX_WORKERS}.`,
		);
	}
	if (
		config.runtime.maxWorkers > 1 &&
		config.runtime.worktreeIsolation === "none"
	) {
		throw badRequest(
			"Dashboard configuration requires worktree isolation for concurrent workers.",
		);
	}
	for (const [key, maximum] of Object.entries(DASHBOARD_CONFIG_BUDGET_MAXIMA)) {
		const value =
			config.runtime.budgets[key as keyof typeof config.runtime.budgets];
		if (typeof value === "number" && maximum !== undefined && value > maximum) {
			throw badRequest(`Dashboard configuration ${key} exceeds ${maximum}.`);
		}
	}
	const routing = config.runtime.modelRouting;
	if (routing.routes.length > DASHBOARD_CONFIG_MODEL_MAXIMA.maxRoutes) {
		throw badRequest(
			`Dashboard configuration routes cannot exceed ${DASHBOARD_CONFIG_MODEL_MAXIMA.maxRoutes}.`,
		);
	}
	if (routing.maxEscalations > DASHBOARD_CONFIG_MODEL_MAXIMA.maxEscalations) {
		throw badRequest(
			`Dashboard configuration maxEscalations cannot exceed ${DASHBOARD_CONFIG_MODEL_MAXIMA.maxEscalations}.`,
		);
	}
	for (const [key, value] of Object.entries({
		estimatedInputTokens: routing.estimatedInputTokens,
		estimatedOutputTokens: routing.estimatedOutputTokens,
	})) {
		if (value > DASHBOARD_CONFIG_MODEL_MAXIMA.maxEstimatedTokens) {
			throw badRequest(
				`Dashboard configuration ${key} cannot exceed ${DASHBOARD_CONFIG_MODEL_MAXIMA.maxEstimatedTokens}.`,
			);
		}
	}
	for (const route of routing.routes) {
		if (route.timeoutMs > DASHBOARD_CONFIG_MODEL_MAXIMA.maxRouteTimeoutMs) {
			throw badRequest(
				`Dashboard configuration route timeout cannot exceed ${DASHBOARD_CONFIG_MODEL_MAXIMA.maxRouteTimeoutMs}.`,
			);
		}
		for (const price of Object.values(route.pricing)) {
			if (price > DASHBOARD_CONFIG_MODEL_MAXIMA.maxPricingUsdPerMillion) {
				throw badRequest(
					`Dashboard configuration route pricing cannot exceed ${DASHBOARD_CONFIG_MODEL_MAXIMA.maxPricingUsdPerMillion}.`,
				);
			}
		}
	}
}

function automationRank(value: WikiConfig["runtime"]["automation"]): number {
	return { manual: 0, assist: 1, auto: 2 }[value];
}

function agencyRank(value: WikiConfig["runtime"]["agency"]): number {
	return { observe: 0, assist: 1, delegate: 2, auto: 3 }[value];
}

function qualityRank(
	value: WikiConfig["runtime"]["modelRouting"]["qualityFloor"],
): number {
	return { standard: 0, high: 1, critical: 2 }[value];
}

function assertNoSensitiveKeys(value: unknown): void {
	if (!isRecord(value)) return;
	for (const [key, entry] of Object.entries(value)) {
		if (
			/^(api[_-]?key|password|credential|secret|access[_-]?token)$/i.test(key)
		) {
			throw badRequest(`Sensitive configuration field ${key} is forbidden.`);
		}
		if (Array.isArray(entry)) entry.forEach(assertNoSensitiveKeys);
		else assertNoSensitiveKeys(entry);
	}
}

function optionalRecord(
	value: unknown,
	path: string,
): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw badRequest(`${path} must be an object.`);
	return value;
}

function assertKnownKeys(
	value: Record<string, unknown>,
	path: string,
	allowed: readonly string[],
): void {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			const label = path === "patch" ? key : `${path}.${key}`;
			throw badRequest(`Unsupported dashboard configuration field ${label}.`);
		}
	}
}

function identifier(value: unknown, label: string, max: number): string {
	if (
		typeof value !== "string" ||
		value.length < 1 ||
		value.length > max ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
	) {
		throw badRequest(`${label} is invalid.`);
	}
	return value;
}

function sha256Digest(value: unknown, label: string): string {
	if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
		throw badRequest(`${label} must be a sha256 digest.`);
	}
	return value;
}

function digest(value: unknown): string {
	return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function trimEntries(
	entries: Map<string, IdempotencyEntry>,
	max: number,
): void {
	while (entries.size > max) {
		const first = entries.keys().next().value;
		if (typeof first !== "string") return;
		entries.delete(first);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function badRequest(message: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(message, 400);
}

function forbidden(message: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(message, 403);
}

function conflict(message: string): DashboardTraceHostControlError {
	return new DashboardTraceHostControlError(message, 409);
}
