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
	cli: { enabled: boolean };
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
	cli?: Partial<WikiHostConfig["cli"]>;
	pi?: Partial<WikiHostConfig["pi"]>;
	mcp?: Partial<WikiHostConfig["mcp"]>;
};

export const DEFAULT_WIKI_CONFIG: WikiConfig = {
	project: "codewiki",
	runtime: {
		maxWorkers: 1,
		worktreeIsolation: "none",
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
		cli: { enabled: true },
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
			cli: {
				...DEFAULT_WIKI_CONFIG.hosts.cli,
				...(input.hosts?.cli || {}),
			},
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
		throw new Error("wiki_config project is required.");
	}
	assertNonNegativeInteger(config.runtime.maxWorkers, "runtime.maxWorkers");
	if (!isWorktreeIsolation(config.runtime.worktreeIsolation)) {
		throw new Error("wiki_config runtime.worktreeIsolation is invalid.");
	}
	if (!isAutomation(config.runtime.automation)) {
		throw new Error("wiki_config runtime.automation is invalid.");
	}
	if (!isAgency(config.runtime.agency)) {
		throw new Error("wiki_config runtime.agency is invalid.");
	}
	validateBudgets(config.runtime.budgets);
	validateApproval(config.runtime.approval);
	const stopConditions = uniqueStringList(config.runtime.stopConditions);
	if (!config.retention.archiveRefPrefix.trim()) {
		throw new Error("wiki_config retention.archiveRefPrefix is required.");
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
			cli: { ...config.hosts.cli },
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
			cli: { ...current.hosts.cli, ...(patch.hosts?.cli || {}) },
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
		throw new Error("wiki_config runtime.approval.cadence is invalid.");
	}
	if (!isRiskAction(approval.destructiveAction)) {
		throw new Error(
			"wiki_config runtime.approval.destructiveAction is invalid.",
		);
	}
	if (!isRiskAction(approval.riskEscalation)) {
		throw new Error("wiki_config runtime.approval.riskEscalation is invalid.");
	}
}

function validateHosts(hosts: WikiHostConfig): void {
	for (const [name, host] of Object.entries(hosts)) {
		if (typeof host.enabled !== "boolean") {
			throw new Error(`wiki_config hosts.${name}.enabled must be boolean.`);
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
		throw new Error(`wiki_config ${path} must be >= 0.`);
	}
}

function assertOptionalPositiveInteger(value: unknown, path: string): void {
	if (value === undefined) return;
	if (!Number.isInteger(value) || Number(value) < 1) {
		throw new Error(`wiki_config ${path} must be >= 1 when set.`);
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
