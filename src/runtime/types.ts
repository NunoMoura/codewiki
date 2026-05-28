import type { AgencyBudget } from "../agency/types.ts";
import type { ArtifactStatusRecord } from "../session/types.ts";

export interface WorkflowEfficiencyEvidence {
	user_interruptions_avoided: number;
	user_interruptions_required: number;
	manual_commands_avoided: number;
	manual_commands_required: number;
	session_boundaries_used: number;
	platform_limited_steps: string[];
	notes: string[];
}

export interface CodewikiRuntimeBudgetUsage {
	cycles: number;
	writes: number;
	sessions: number;
	wall_seconds: number;
	tokens_estimate: number;
}

export interface CodewikiRuntimeResult {
	executed: boolean;
	status: "skipped" | "completed" | "blocked" | "stopped";
	action: string;
	summary: string;
	task_id?: string;
	stop_reason?: string;
	claim_id?: string;
	scopes: string[];
	artifact_statuses?: ArtifactStatusRecord[];
	context_boundary?: Record<string, unknown>;
	gateway?: Record<string, unknown>;
	budget_used: CodewikiRuntimeBudgetUsage;
	workflow_efficiency: WorkflowEfficiencyEvidence;
	events: string[];
}

export interface CodewikiRuntimePlan {
	mode: string;
	trigger: string;
	budget: AgencyBudget;
	cycles: Array<Record<string, unknown>>;
	stop?: Record<string, unknown>;
	policy?: Record<string, unknown>;
}
