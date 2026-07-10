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

export interface WikiQualityJudgeConfig {
	enabled: boolean;
	provider: "none" | "http";
	endpoint?: string;
	promptVersion: string;
	timeoutMs: number;
}

export interface WikiQualityReviewConfig {
	enabled: boolean;
	autoEvidence: boolean;
	includeCachedEvidence: boolean;
	timeoutMs: number;
	fastTimeoutMs: number;
	maxCachedEvidenceAgeMs?: number;
	enabledPacks: string[];
	disabledPacks: string[];
	requiredPacks: string[];
}

export interface WikiQualityConfig {
	judge: WikiQualityJudgeConfig;
	review: WikiQualityReviewConfig;
}

export interface WikiConfig {
	project: string;
	runtime: WikiRuntimeConfig;
	retention: WikiRetentionConfig;
	hosts: WikiHostConfig;
	quality: WikiQualityConfig;
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
	quality?: PartialQualityConfig;
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

export type PartialQualityConfig = {
	judge?: Partial<WikiQualityJudgeConfig>;
	review?: Partial<WikiQualityReviewConfig>;
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
	quality: {
		judge: {
			enabled: false,
			provider: "none",
			endpoint: undefined,
			promptVersion: "loop-quality-judge.v3",
			timeoutMs: 30_000,
		},
		review: {
			enabled: true,
			autoEvidence: true,
			includeCachedEvidence: true,
			timeoutMs: 15_000,
			fastTimeoutMs: 3_000,
			maxCachedEvidenceAgeMs: 10 * 60 * 1000,
			enabledPacks: [
				"tsjs.typescript",
				"tsjs.lint",
				"python.ruff",
				"python.pyright",
				"go.test",
				"go.vet",
				"rust.cargo-test",
				"rust.cargo-clippy",
				"shell.shellcheck",
			],
			disabledPacks: [],
			requiredPacks: [],
		},
	},
};

export function runWikiConfig(
	input: RunWikiConfigInput = {},
): RunWikiConfigResult {
	assertKnownKeys(input, "wiki_config", ["current", "patch"]);
	if (input.current !== undefined)
		validatePartialWikiConfigKeys(input.current, "wiki_config.current");
	if (input.patch !== undefined)
		validatePartialWikiConfigKeys(input.patch, "wiki_config.patch");
	const current = resolveWikiConfig(input.current);
	const config = resolveWikiConfig(mergeWikiConfigPatch(current, input.patch));
	return {
		config,
		changed: JSON.stringify(current) !== JSON.stringify(config),
	};
}

export function resolveWikiConfig(input: PartialWikiConfig = {}): WikiConfig {
	validatePartialWikiConfigKeys(input, "wiki_config");
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
		quality: {
			judge: {
				...DEFAULT_WIKI_CONFIG.quality.judge,
				...(input.quality?.judge || {}),
			},
			review: {
				...DEFAULT_WIKI_CONFIG.quality.review,
				...(input.quality?.review || {}),
				enabledPacks: input.quality?.review?.enabledPacks
					? [...input.quality.review.enabledPacks]
					: [...DEFAULT_WIKI_CONFIG.quality.review.enabledPacks],
				disabledPacks: input.quality?.review?.disabledPacks
					? [...input.quality.review.disabledPacks]
					: [...DEFAULT_WIKI_CONFIG.quality.review.disabledPacks],
				requiredPacks: input.quality?.review?.requiredPacks
					? [...input.quality.review.requiredPacks]
					: [...DEFAULT_WIKI_CONFIG.quality.review.requiredPacks],
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
	validateQuality(config.quality);
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
		quality: {
			judge: {
				...config.quality.judge,
				endpoint: text(config.quality.judge.endpoint) || undefined,
				promptVersion: text(config.quality.judge.promptVersion),
			},
			review: {
				...config.quality.review,
				enabledPacks: uniqueStringList(config.quality.review.enabledPacks),
				disabledPacks: uniqueStringList(config.quality.review.disabledPacks),
				requiredPacks: uniqueStringList(config.quality.review.requiredPacks),
			},
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
		quality: {
			judge: {
				...current.quality.judge,
				...(patch.quality?.judge || {}),
			},
			review: {
				...current.quality.review,
				...(patch.quality?.review || {}),
				enabledPacks: patch.quality?.review?.enabledPacks
					? [...patch.quality.review.enabledPacks]
					: [...current.quality.review.enabledPacks],
				disabledPacks: patch.quality?.review?.disabledPacks
					? [...patch.quality.review.disabledPacks]
					: [...current.quality.review.disabledPacks],
				requiredPacks: patch.quality?.review?.requiredPacks
					? [...patch.quality.review.requiredPacks]
					: [...current.quality.review.requiredPacks],
			},
		},
	};
}

function validateQuality(quality: WikiQualityConfig): void {
	if (typeof quality.review.enabled !== "boolean") {
		throw createCodewikiConfigError({
			path: "quality.review.enabled",
			code: "invalid_type",
			message: "wiki_config quality.review.enabled must be boolean.",
			value: quality.review.enabled,
		});
	}
	if (typeof quality.review.autoEvidence !== "boolean") {
		throw createCodewikiConfigError({
			path: "quality.review.autoEvidence",
			code: "invalid_type",
			message: "wiki_config quality.review.autoEvidence must be boolean.",
			value: quality.review.autoEvidence,
		});
	}
	if (typeof quality.review.includeCachedEvidence !== "boolean") {
		throw createCodewikiConfigError({
			path: "quality.review.includeCachedEvidence",
			code: "invalid_type",
			message:
				"wiki_config quality.review.includeCachedEvidence must be boolean.",
			value: quality.review.includeCachedEvidence,
		});
	}
	assertOptionalPositiveInteger(
		quality.review.timeoutMs,
		"quality.review.timeoutMs",
	);
	assertOptionalPositiveInteger(
		quality.review.fastTimeoutMs,
		"quality.review.fastTimeoutMs",
	);
	assertOptionalPositiveInteger(
		quality.review.maxCachedEvidenceAgeMs,
		"quality.review.maxCachedEvidenceAgeMs",
	);
	if (!Array.isArray(quality.review.enabledPacks)) {
		throw createCodewikiConfigError({
			path: "quality.review.enabledPacks",
			code: "invalid_type",
			message:
				"wiki_config quality.review.enabledPacks must be a string array.",
			value: quality.review.enabledPacks,
		});
	}
	if (!Array.isArray(quality.review.disabledPacks)) {
		throw createCodewikiConfigError({
			path: "quality.review.disabledPacks",
			code: "invalid_type",
			message:
				"wiki_config quality.review.disabledPacks must be a string array.",
			value: quality.review.disabledPacks,
		});
	}
	if (!Array.isArray(quality.review.requiredPacks)) {
		throw createCodewikiConfigError({
			path: "quality.review.requiredPacks",
			code: "invalid_type",
			message:
				"wiki_config quality.review.requiredPacks must be a string array.",
			value: quality.review.requiredPacks,
		});
	}
	validateRequiredReviewPacks(quality.review);
	if (typeof quality.judge.enabled !== "boolean") {
		throw createCodewikiConfigError({
			path: "quality.judge.enabled",
			code: "invalid_type",
			message: "wiki_config quality.judge.enabled must be boolean.",
			value: quality.judge.enabled,
		});
	}
	if (quality.judge.provider !== "none" && quality.judge.provider !== "http") {
		throw createCodewikiConfigError({
			path: "quality.judge.provider",
			message: "wiki_config quality.judge.provider is invalid.",
			value: quality.judge.provider,
		});
	}
	if (!text(quality.judge.promptVersion)) {
		throw createCodewikiConfigError({
			path: "quality.judge.promptVersion",
			code: "missing_required",
			message: "wiki_config quality.judge.promptVersion is required.",
		});
	}
	assertOptionalPositiveInteger(
		quality.judge.timeoutMs,
		"quality.judge.timeoutMs",
	);
	if (quality.judge.enabled && quality.judge.provider === "http") {
		if (!text(quality.judge.endpoint)) {
			throw createCodewikiConfigError({
				path: "quality.judge.endpoint",
				code: "missing_required",
				message:
					"wiki_config quality.judge.endpoint is required for http judge provider.",
			});
		}
	}
}

function validateRequiredReviewPacks(review: WikiQualityReviewConfig): void {
	const enabled = new Set(uniqueStringList(review.enabledPacks));
	const disabled = new Set(uniqueStringList(review.disabledPacks));
	for (const packId of uniqueStringList(review.requiredPacks)) {
		if (disabled.has(packId)) {
			throw createCodewikiConfigError({
				path: "quality.review.requiredPacks",
				message:
					"wiki_config quality.review.requiredPacks cannot include disabled review packs.",
				value: packId,
			});
		}
		if (enabled.size > 0 && !enabled.has(packId)) {
			throw createCodewikiConfigError({
				path: "quality.review.requiredPacks",
				message:
					"wiki_config quality.review.requiredPacks must also be present in enabledPacks when enabledPacks is non-empty.",
				value: packId,
			});
		}
	}
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

function validatePartialWikiConfigKeys(value: unknown, path: string): void {
	const config = assertConfigObject(value, path);
	assertKnownKeys(config, path, [
		"project",
		"runtime",
		"retention",
		"hosts",
		"quality",
	]);
	const runtime = optionalConfigObject(config.runtime, `${path}.runtime`);
	if (runtime) {
		assertKnownKeys(runtime, `${path}.runtime`, [
			"maxWorkers",
			"worktreeIsolation",
			"worktreeSetupCommands",
			"automation",
			"agency",
			"budgets",
			"approval",
			"stopConditions",
		]);
		const budgets = optionalConfigObject(
			runtime.budgets,
			`${path}.runtime.budgets`,
		);
		if (budgets) {
			assertKnownKeys(budgets, `${path}.runtime.budgets`, [
				"maxSeconds",
				"maxIterations",
				"maxChangedFiles",
				"maxTraceBytes",
			]);
		}
		const approval = optionalConfigObject(
			runtime.approval,
			`${path}.runtime.approval`,
		);
		if (approval) {
			assertKnownKeys(approval, `${path}.runtime.approval`, [
				"cadence",
				"destructiveAction",
				"riskEscalation",
				"requireExpectedBytes",
			]);
		}
	}
	const retention = optionalConfigObject(config.retention, `${path}.retention`);
	if (retention) {
		assertKnownKeys(retention, `${path}.retention`, [
			"enabled",
			"archiveRefPrefix",
			"hotTraceLimit",
			"requireCloseRecord",
			"hydrateOnDemand",
		]);
	}
	const hosts = optionalConfigObject(config.hosts, `${path}.hosts`);
	if (hosts) {
		assertKnownKeys(hosts, `${path}.hosts`, ["pi", "mcp"]);
		for (const host of ["pi", "mcp"] as const) {
			const hostConfig = optionalConfigObject(
				hosts[host],
				`${path}.hosts.${host}`,
			);
			if (hostConfig)
				assertKnownKeys(hostConfig, `${path}.hosts.${host}`, ["enabled"]);
		}
	}
	const quality = optionalConfigObject(config.quality, `${path}.quality`);
	if (quality) {
		assertKnownKeys(quality, `${path}.quality`, ["judge", "review"]);
		const judge = optionalConfigObject(quality.judge, `${path}.quality.judge`);
		if (judge) {
			assertKnownKeys(judge, `${path}.quality.judge`, [
				"enabled",
				"provider",
				"endpoint",
				"promptVersion",
				"timeoutMs",
			]);
		}
		const review = optionalConfigObject(
			quality.review,
			`${path}.quality.review`,
		);
		if (review) {
			assertKnownKeys(review, `${path}.quality.review`, [
				"enabled",
				"autoEvidence",
				"includeCachedEvidence",
				"timeoutMs",
				"fastTimeoutMs",
				"maxCachedEvidenceAgeMs",
				"enabledPacks",
				"disabledPacks",
				"requiredPacks",
			]);
		}
	}
}

function optionalConfigObject(
	value: unknown,
	path: string,
): Record<string, unknown> | undefined {
	return value === undefined ? undefined : assertConfigObject(value, path);
}

function assertConfigObject(
	value: unknown,
	path: string,
): Record<string, unknown> {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	throw createCodewikiConfigError({
		path,
		code: "invalid_type",
		message: `${path} must be an object.`,
		value,
	});
}

function assertKnownKeys(
	value: unknown,
	path: string,
	allowed: readonly string[],
): void {
	const record = assertConfigObject(value, path);
	for (const key of Object.keys(record)) {
		if (allowed.includes(key)) continue;
		const keyPath = `${path}.${key}`;
		throw createCodewikiConfigError({
			path: keyPath,
			code: "unknown_key",
			message: `${keyPath} is an unknown config key.`,
			value: record[key],
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
