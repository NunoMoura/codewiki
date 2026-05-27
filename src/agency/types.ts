export const SUBAGENT_ROLE_VALUES = [
	"implementer",
	"auditor",
	"architect",
] as const;
export const SUBAGENT_VERDICT_VALUES = ["pass", "fail", "block"] as const;
export const SUBAGENT_PROPOSAL_VALUES = ["task", "refactor", "spec"] as const;
export const AGENCY_MODE_VALUES = [
	"auto",
	"dry-run",
	"manual",
	"observe",
	"maintain",
	"work",
] as const;
export const AGENCY_TRIGGER_VALUES = [
	"manual",
	"task_end",
	"sprint_end",
	"roadmap_end",
	"budget_end",
] as const;
export const AGENCY_RISK_VALUES = ["low", "medium", "high"] as const;
export const AGENCY_SCOPE_KIND_VALUES = ["roadmap", "sprint", "task"] as const;
export const AGENCY_LEVEL_VALUES = AGENCY_SCOPE_KIND_VALUES;
export const AGENCY_APPROVAL_CADENCE_VALUES = AGENCY_SCOPE_KIND_VALUES;
export const AGENCY_CONTEXT_RESET_STRATEGY_VALUES = [
	"manual",
	"soft-first",
	"hard-first",
] as const;
export const DEFAULT_AGENCY_STOP_GATES = [
	"semantic_decision",
	"validation_block",
	"artifact_conflict",
	"risk_escalation",
	"publication",
	"destructive_action",
	"unsafe_reset_boundary",
] as const;

export type SubagentRole = (typeof SUBAGENT_ROLE_VALUES)[number];
export type SubagentVerdict = (typeof SUBAGENT_VERDICT_VALUES)[number];
export type SubagentProposalKind = (typeof SUBAGENT_PROPOSAL_VALUES)[number];
export type AgencyMode = (typeof AGENCY_MODE_VALUES)[number];
export type AgencyTrigger = (typeof AGENCY_TRIGGER_VALUES)[number];
export type AgencyRisk = (typeof AGENCY_RISK_VALUES)[number];
export type AgencyScopeKind = (typeof AGENCY_SCOPE_KIND_VALUES)[number];
export type AgencyLevel = (typeof AGENCY_LEVEL_VALUES)[number];
export type AgencyApprovalCadence =
	(typeof AGENCY_APPROVAL_CADENCE_VALUES)[number];
export type AgencyContextResetStrategy =
	(typeof AGENCY_CONTEXT_RESET_STRATEGY_VALUES)[number];
export type AgencyStopGate =
	| (typeof DEFAULT_AGENCY_STOP_GATES)[number]
	| string;

export interface AgencyScope {
	kind: AgencyScopeKind;
	id?: string;
}

export interface AgencyBudget {
	maxCycles?: number;
	maxWallSeconds?: number;
	maxTokens?: number;
	maxCostUsd?: number;
	maxWrites?: number;
	maxSessions?: number;
	maxSubagents?: number;
	risk?: AgencyRisk;
}

export interface AgencyContextResetConfig {
	enabled?: boolean;
	auto_pickup?: boolean;
	strategy?: AgencyContextResetStrategy;
	max_resets_per_run?: number;
	require_source_backed_kickoff?: boolean;
	require_idle_boundary?: boolean;
}

export interface AgencyConfig {
	level?: AgencyLevel;
	approval_cadence?: AgencyApprovalCadence;
	default_scope?: AgencyScope;
	budgets?: Partial<Record<AgencyScopeKind | "default", AgencyBudget>>;
	parallelism?: {
		max_sessions?: number;
		session_per_sprint?: boolean;
		require_claims?: boolean;
	};
	context_reset?: AgencyContextResetConfig;
	stop_gates?: AgencyStopGate[];
}

export interface EffectiveAgencyPolicy {
	level: AgencyLevel;
	approval_cadence: AgencyApprovalCadence;
	default_scope: AgencyScope;
	context_reset: Required<AgencyContextResetConfig>;
	stop_gates: AgencyStopGate[];
}

export function effectiveAgencyPolicy(
	config: { codewiki?: { agency?: AgencyConfig } } | null | undefined,
): EffectiveAgencyPolicy {
	const agency = config?.codewiki?.agency || {};
	const level = normalizeAgencyLevel(agency.level, "task");
	const approvalCadence = normalizeAgencyLevel(agency.approval_cadence, level);
	const defaultScope = normalizeAgencyScope(agency.default_scope);
	const reset = agency.context_reset || {};
	return {
		level,
		approval_cadence: approvalCadence,
		default_scope: defaultScope,
		context_reset: {
			enabled: reset.enabled !== false,
			auto_pickup: reset.auto_pickup !== false,
			strategy: AGENCY_CONTEXT_RESET_STRATEGY_VALUES.includes(
				reset.strategy as AgencyContextResetStrategy,
			)
				? (reset.strategy as AgencyContextResetStrategy)
				: "soft-first",
			max_resets_per_run: Math.max(0, Number(reset.max_resets_per_run ?? 5)),
			require_source_backed_kickoff:
				reset.require_source_backed_kickoff !== false,
			require_idle_boundary: reset.require_idle_boundary !== false,
		},
		stop_gates: normalizeStopGates(agency.stop_gates),
	};
}

export function agencyLevelAllowsContinuation(
	level: AgencyLevel,
	boundary: AgencyApprovalCadence,
): boolean {
	const rank: Record<AgencyLevel, number> = { task: 1, sprint: 2, roadmap: 3 };
	return rank[level] >= rank[boundary];
}

export function normalizeAgencyLevel(
	value: unknown,
	fallback: AgencyLevel,
): AgencyLevel {
	const text = String(value || "").trim() as AgencyLevel;
	return AGENCY_LEVEL_VALUES.includes(text) ? text : fallback;
}

function normalizeAgencyScope(value: unknown): AgencyScope {
	const scope =
		value && typeof value === "object" ? (value as AgencyScope) : null;
	const kind = normalizeAgencyLevel(scope?.kind, "roadmap");
	const id = String(scope?.id || "").trim();
	if ((kind === "task" || kind === "sprint") && !id) return { kind: "roadmap" };
	return id ? { kind, id } : { kind };
}

function normalizeStopGates(values: unknown): AgencyStopGate[] {
	const configured = Array.isArray(values)
		? values.map((value) => String(value || "").trim()).filter(Boolean)
		: [];
	return [...new Set([...DEFAULT_AGENCY_STOP_GATES, ...configured])];
}

export interface CodewikiAgencyToolInput {
	repoPath?: string;
	mode?: AgencyMode;
	trigger?: AgencyTrigger;
	scope?: AgencyScope;
	budget?: AgencyBudget;
	dryRun?: boolean;
}

export type AgencyToolInput = CodewikiAgencyToolInput;
