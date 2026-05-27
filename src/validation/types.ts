import type { SubagentVerdict } from "../agency/types.ts";
import type { ChangeClaimRole, WorkflowLoop, WorktreeIsolationMetadata } from "../session/types.ts";

export type TaskVerifierVerdict = SubagentVerdict;

export const VALIDATION_FAILURE_CLASS_VALUES = [
	"evidence_missing",
	"compiler_incomplete",
	"planning_gap",
	"decision_ambiguity",
	"risk_approval_missing",
	"content_proof_missing",
	"runtime_conflict",
] as const;

export type CodewikiValidationFailureClass = (typeof VALIDATION_FAILURE_CLASS_VALUES)[number];

export interface CodewikiValidationIsolationInput extends WorktreeIsolationMetadata {
	role?: ChangeClaimRole;
}

export interface CodewikiValidationReportInput {
	repoPath?: string;
	profile: string;
	task_id?: string;
	verdict: "pass" | "fail" | "block";
	rationale: string;
	checks?: string[];
	issues?: Array<{ severity: string; summary: string }>;
	source?: string;
	policy_profile?: string;
	required_audits?: string[];
	audit_refs?: string[];
	audit_reports?: string[];
	failed_criteria?: string[];
	blocking_questions?: string[];
	failure_class?: CodewikiValidationFailureClass | string;
	recommended_next_loop?: WorkflowLoop | string;
	stop_reason?: string;
	isolation?: CodewikiValidationIsolationInput;
	preflight_only?: boolean;
	refresh?: boolean;
}

export interface TaskVerifierResult {
	verdict: "pass" | "fail" | "block";
	taskId: string;
	checks: string[];
	issues: TaskVerifierIssue[];
	rationale: string;
}

export interface TaskVerifierIssue {
	severity: "high" | "medium" | "low";
	summary: string;
	evidence?: string;
}

export interface LintIssue {
	severity: "error" | "warning" | string;
	kind: string;
	path: string;
	line?: number;
	column?: number;
	message: string;
	code?: string;
}

export interface LintReport {
	generated_at: string;
	issues: LintIssue[];
	counts: Record<string, number>;
}
