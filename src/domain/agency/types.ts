export const SUBAGENT_ROLE_VALUES = ["implementer", "auditor", "architect"] as const;
export const SUBAGENT_VERDICT_VALUES = ["pass", "fail", "block"] as const;
export const SUBAGENT_PROPOSAL_VALUES = ["task", "refactor", "spec"] as const;
export const AGENCY_MODE_VALUES = ["auto", "dry-run", "manual", "observe", "maintain", "work"] as const;
export const AGENCY_TRIGGER_VALUES = ["manual", "task_end", "sprint_end", "roadmap_end", "budget_end"] as const;
export const AGENCY_RISK_VALUES = ["low", "medium", "high"] as const;
export const AGENCY_SCOPE_KIND_VALUES = ["roadmap", "sprint", "task"] as const;

export type SubagentRole = (typeof SUBAGENT_ROLE_VALUES)[number];
export type SubagentVerdict = (typeof SUBAGENT_VERDICT_VALUES)[number];
export type SubagentProposalKind = (typeof SUBAGENT_PROPOSAL_VALUES)[number];
export type AgencyMode = (typeof AGENCY_MODE_VALUES)[number];
export type AgencyTrigger = (typeof AGENCY_TRIGGER_VALUES)[number];
export type AgencyRisk = (typeof AGENCY_RISK_VALUES)[number];
export type AgencyScopeKind = (typeof AGENCY_SCOPE_KIND_VALUES)[number];

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

export interface CodewikiAgencyToolInput {
	repoPath?: string;
	mode?: AgencyMode;
	trigger?: AgencyTrigger;
	scope?: AgencyScope;
	budget?: AgencyBudget;
	dryRun?: boolean;
}

export type AgencyToolInput = CodewikiAgencyToolInput;
