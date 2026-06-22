import { createCodewikiConfigError } from "../error-handling/config-errors.ts";

export type WikiConfigWorktreeIsolation = "none" | "worktree" | "auto";
export type WikiConfigAutomationMode = "manual" | "assist" | "auto";
export type WikiConfigAgencyLevel = "observe" | "assist" | "delegate" | "auto";
export type WikiConfigApprovalCadence =
	| "always"
	| "per_iteration"
	| "on_risk"
	| "never";
export type WikiConfigRiskAction = "block" | "ask" | "allow";

export interface WikiRuntimeBudgetConfig {
	maxSeconds?: number;
	maxIterations?: number;
	maxChangedFiles?: number;
	maxTraceBytes?: number;
}

export interface WikiApprovalPolicyConfig {
	cadence: WikiConfigApprovalCadence;
	destructiveAction: WikiConfigRiskAction;
	riskEscalation: WikiConfigRiskAction;
	requireExpectedBytes: boolean;
}

export interface WikiRuntimeConfig {
	maxWorkers: number;
	worktreeIsolation: WikiConfigWorktreeIsolation;
	worktreeSetupCommands: string[];
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	budgets: WikiRuntimeBudgetConfig;
	approval: WikiApprovalPolicyConfig;
	stopConditions: string[];
}

export interface WikiRetentionConfig {
	enabled: boolean;
	archiveRefPrefix: string;
	hotTraceLimit: number;
	requireCloseRecord: boolean;
	hydrateOnDemand: boolean;
}

export interface WikiHostConfig {
	pi: { enabled: boolean };
	mcp: { enabled: boolean };
}

export interface WikiConfig {
	project: string;
	runtime: WikiRuntimeConfig;
	retention: WikiRetentionConfig;
	hosts: WikiHostConfig;
}

export interface RunWikiConfigInput {
	current?: PartialWikiConfig;
	patch?: PartialWikiConfig;
}

export interface RunWikiConfigResult {
	config: WikiConfig;
	changed: boolean;
}

export type PartialWikiConfig = {
	project?: string;
	runtime?: PartialRuntimeConfig;
	retention?: Partial<WikiRetentionConfig>;
	hosts?: PartialHostConfig;
};

export type PartialRuntimeConfig = Partial<
	Omit<WikiRuntimeConfig, "budgets" | "approval">
> & {
	budgets?: Partial<WikiRuntimeBudgetConfig>;
	approval?: Partial<WikiApprovalPolicyConfig>;
};

export type PartialHostConfig = {
	pi?: Partial<WikiHostConfig["pi"]>;
	mcp?: Partial<WikiHostConfig["mcp"]>;
};

export const DEFAULT_WIKI_CONFIG: WikiConfig = {
	project: "codewiki",
	runtime: {
		maxWorkers: 1,
		worktreeIsolation: "none",
		worktreeSetupCommands: [],
		automation: "manual",
		agency: "assist",
		budgets: {
			maxSeconds: undefined,
			maxIterations: 1,
			maxChangedFiles: undefined,
			maxTraceBytes: undefined,
		},
		approval: {
			cadence: "per_iteration",
			destructiveAction: "ask",
			riskEscalation: "ask",
			requireExpectedBytes: true,
		},
		stopConditions: [
			"semantic_decision",
			"risk_escalation",
			"destructive_action",
		],
	},
	retention: {
		enabled: true,
		archiveRefPrefix: "refs/codewiki/archive/",
		hotTraceLimit: 20,
		requireCloseRecord: true,
		hydrateOnDemand: true,
	},
	hosts: {
		pi: { enabled: false },
		mcp: { enabled: false },
	},
};

export function runWikiConfig(
	input: RunWikiConfigInput = {},
): RunWikiConfigResult {
	const current = resolveWikiConfig(input.current);
	const config = resolveWikiConfig(mergeWikiConfigPatch(current, input.patch));
	return {
		config,
		changed: JSON.stringify(current) !== JSON.stringify(config),
	};
}

export function resolveWikiConfig(input: PartialWikiConfig = {}): WikiConfig {
	const config: WikiConfig = {
		project: text(input.project) || DEFAULT_WIKI_CONFIG.project,
		runtime: {
			...DEFAULT_WIKI_CONFIG.runtime,
			...(input.runtime || {}),
			budgets: {
				...DEFAULT_WIKI_CONFIG.runtime.budgets,
				...(input.runtime?.budgets || {}),
			},
			approval: {
				...DEFAULT_WIKI_CONFIG.runtime.approval,
				...(input.runtime?.approval || {}),
			},
			stopConditions: input.runtime?.stopConditions
				? [...input.runtime.stopConditions]
				: [...DEFAULT_WIKI_CONFIG.runtime.stopConditions],
		},
		retention: {
			...DEFAULT_WIKI_CONFIG.retention,
			...(input.retention || {}),
		},
		hosts: {
			pi: {
				...DEFAULT_WIKI_CONFIG.hosts.pi,
				...(input.hosts?.pi || {}),
			},
			mcp: {
				...DEFAULT_WIKI_CONFIG.hosts.mcp,
				...(input.hosts?.mcp || {}),
			},
		},
	};
	return validateWikiConfig(config);
}

export function validateWikiConfig(config: WikiConfig): WikiConfig {
	if (!config.project.trim()) {
		throw createCodewikiConfigError({
			path: "project",
			code: "missing_required",
			message: "wiki_config project is required.",
		});
	}
	assertNonNegativeInteger(config.runtime.maxWorkers, "runtime.maxWorkers");
	if (!isWorktreeIsolation(config.runtime.worktreeIsolation)) {
		throw createCodewikiConfigError({
			path: "runtime.worktreeIsolation",
			message: "wiki_config runtime.worktreeIsolation is invalid.",
			value: config.runtime.worktreeIsolation,
		});
	}
	if (!isAutomation(config.runtime.automation)) {
		throw createCodewikiConfigError({
			path: "runtime.automation",
			message: "wiki_config runtime.automation is invalid.",
			value: config.runtime.automation,
		});
	}
	if (!isAgency(config.runtime.agency)) {
		throw createCodewikiConfigError({
			path: "runtime.agency",
			message: "wiki_config runtime.agency is invalid.",
			value: config.runtime.agency,
		});
	}
	validateBudgets(config.runtime.budgets);
	validateApproval(config.runtime.approval);
	config.runtime.worktreeSetupCommands = uniqueStringList(
		config.runtime.worktreeSetupCommands,
	);
	for (const command of config.runtime.worktreeSetupCommands) {
		if (command.includes("\n") || command.includes("\r")) {
			throw createCodewikiConfigError({
				path: "runtime.worktreeSetupCommands",
				message:
					"wiki_config runtime.worktreeSetupCommands must be single-line commands.",
				value: command,
			});
		}
	}
	const stopConditions = uniqueStringList(config.runtime.stopConditions);
	if (!config.retention.archiveRefPrefix.trim()) {
		throw createCodewikiConfigError({
			path: "retention.archiveRefPrefix",
			code: "missing_required",
			message: "wiki_config retention.archiveRefPrefix is required.",
		});
	}
	assertNonNegativeInteger(
		config.retention.hotTraceLimit,
		"retention.hotTraceLimit",
	);
	validateHosts(config.hosts);
	return {
		project: config.project.trim(),
		runtime: {
			...config.runtime,
			budgets: cleanBudgets(config.runtime.budgets),
			approval: { ...config.runtime.approval },
			stopConditions,
		},
		retention: {
			...config.retention,
			archiveRefPrefix: config.retention.archiveRefPrefix.trim(),
		},
		hosts: {
			pi: { ...config.hosts.pi },
			mcp: { ...config.hosts.mcp },
		},
	};
}

function mergeWikiConfigPatch(
	current: WikiConfig,
	patch: PartialWikiConfig = {},
): PartialWikiConfig {
	return {
		project: patch.project ?? current.project,
		runtime: {
			...current.runtime,
			...(patch.runtime || {}),
			budgets: {
				...current.runtime.budgets,
				...(patch.runtime?.budgets || {}),
			},
			approval: {
				...current.runtime.approval,
				...(patch.runtime?.approval || {}),
			},
		},
		retention: { ...current.retention, ...(patch.retention || {}) },
		hosts: {
			pi: { ...current.hosts.pi, ...(patch.hosts?.pi || {}) },
			mcp: { ...current.hosts.mcp, ...(patch.hosts?.mcp || {}) },
		},
	};
}

function validateBudgets(budgets: WikiRuntimeBudgetConfig): void {
	assertOptionalPositiveInteger(
		budgets.maxSeconds,
		"runtime.budgets.maxSeconds",
	);
	assertOptionalPositiveInteger(
		budgets.maxIterations,
		"runtime.budgets.maxIterations",
	);
	assertOptionalPositiveInteger(
		budgets.maxChangedFiles,
		"runtime.budgets.maxChangedFiles",
	);
	assertOptionalPositiveInteger(
		budgets.maxTraceBytes,
		"runtime.budgets.maxTraceBytes",
	);
}

function validateApproval(approval: WikiApprovalPolicyConfig): void {
	if (!isApprovalCadence(approval.cadence)) {
		throw createCodewikiConfigError({
			path: "runtime.approval.cadence",
			message: "wiki_config runtime.approval.cadence is invalid.",
			value: approval.cadence,
		});
	}
	if (!isRiskAction(approval.destructiveAction)) {
		throw createCodewikiConfigError({
			path: "runtime.approval.destructiveAction",
			message: "wiki_config runtime.approval.destructiveAction is invalid.",
			value: approval.destructiveAction,
		});
	}
	if (!isRiskAction(approval.riskEscalation)) {
		throw createCodewikiConfigError({
			path: "runtime.approval.riskEscalation",
			message: "wiki_config runtime.approval.riskEscalation is invalid.",
			value: approval.riskEscalation,
		});
	}
}

function validateHosts(hosts: WikiHostConfig): void {
	for (const [name, host] of Object.entries(hosts)) {
		if (typeof host.enabled !== "boolean") {
			throw createCodewikiConfigError({
				path: `hosts.${name}.enabled`,
				code: "invalid_type",
				message: `wiki_config hosts.${name}.enabled must be boolean.`,
				value: host.enabled,
			});
		}
	}
}

function cleanBudgets(
	budgets: WikiRuntimeBudgetConfig,
): WikiRuntimeBudgetConfig {
	return Object.fromEntries(
		Object.entries(budgets).filter(([, value]) => value !== undefined),
	) as WikiRuntimeBudgetConfig;
}

function assertNonNegativeInteger(value: unknown, path: string): void {
	if (!Number.isInteger(value) || Number(value) < 0) {
		throw createCodewikiConfigError({
			path,
			message: `wiki_config ${path} must be >= 0.`,
			value,
		});
	}
}

function assertOptionalPositiveInteger(value: unknown, path: string): void {
	if (value === undefined) return;
	if (!Number.isInteger(value) || Number(value) < 1) {
		throw createCodewikiConfigError({
			path,
			message: `wiki_config ${path} must be >= 1 when set.`,
			value,
		});
	}
}

function isWorktreeIsolation(
	value: unknown,
): value is WikiConfigWorktreeIsolation {
	return value === "none" || value === "worktree" || value === "auto";
}

function isAutomation(value: unknown): value is WikiConfigAutomationMode {
	return value === "manual" || value === "assist" || value === "auto";
}

function isAgency(value: unknown): value is WikiConfigAgencyLevel {
	return (
		value === "observe" ||
		value === "assist" ||
		value === "delegate" ||
		value === "auto"
	);
}

function isApprovalCadence(value: unknown): value is WikiConfigApprovalCadence {
	return (
		value === "always" ||
		value === "per_iteration" ||
		value === "on_risk" ||
		value === "never"
	);
}

function isRiskAction(value: unknown): value is WikiConfigRiskAction {
	return value === "block" || value === "ask" || value === "allow";
}

function uniqueStringList(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}

function text(value: unknown): string {
	return String(value || "").trim();
}
