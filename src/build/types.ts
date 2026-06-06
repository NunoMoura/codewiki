import type { ResidualIssueCoverageInput } from "../audit/types.ts";
import type {
	ChangeType,
	CodewikiDecisionTableRowInput,
	LegacyChangeClass,
	TraceabilityExemption,
} from "../decision/types.ts";
import type { CodewikiIsolationRequirementInput } from "../session/types.ts";

export type { CodewikiDecisionTableRowInput } from "../decision/types.ts";

export interface CodewikiBuildIsolationPolicyInput {
	loop_start?: CodewikiIsolationRequirementInput;
	validation?: CodewikiIsolationRequirementInput;
	next_loop?: CodewikiIsolationRequirementInput;
}

export interface CodewikiBuildRefsInput {
	decision?: string[];
	planning?: string[];
	implementation?: string[];
	roadmap?: string[];
	validation?: string[];
	source?: string[];
}

export interface CodewikiBuildProducesInput {
	knowledge?: string[];
	roadmap?: string[];
	code?: string[];
	tests?: string[];
	validation?: string[];
	publication?: string[];
	closure?: string[];
}

export interface CodewikiClosureBriefInput {
	user_intent: string;
	implemented_changes: string[];
	layers_updated?: {
		knowledge?: string[];
		roadmap?: string[];
		code?: string[];
		tests?: string[];
		validation?: string[];
	};
	acceptance_evidence: string[];
	checks: string[];
	non_goals_preserved?: string[];
	remaining_risks?: string[];
}

export interface CodewikiBuildCycleInput {
	sequence?: number;
	attempt?: string;
	supersedes?: string[];
	status?: string;
}

export interface CodewikiBuildPolicyInput {
	profile?: string;
	exit_criteria?: string[];
	required_audits?: string[];
	audit_refs?: string[];
	audit_reports?: string[];
	isolation?: CodewikiBuildIsolationPolicyInput;
}

export interface CodewikiBuildRequirementInput {
	id: string;
	text: string;
	source_refs?: string[];
	state?: string;
}

export interface CodewikiEvidenceMappingInput {
	criterion: string;
	evidence: string;
	requirement_ids?: string[];
	source_refs?: string[];
}

export interface CodewikiDecisionKbMappingInput {
	row_id: string;
	knowledge_refs?: string[];
	diagram_refs?: string[];
	evidence: string;
	deferred?: boolean;
	deferred_reason?: string;
}

export interface CodewikiDecisionPropagationInput {
	direction?: "product-first" | "system-first" | "mixed" | "no-op" | string;
	product_impact?: string[];
	system_impact?: string[];
	no_product_impact?: string;
	no_system_impact?: string;
	downstream_planning_questions?: string[];
}

export interface CodewikiDecisionPropagationResolutionInput {
	row_id?: string;
	question_id?: string;
	question?: string;
	resolution:
		| "knowledge-only"
		| "roadmap-task"
		| "sprint"
		| "deferred"
		| string;
	task_ids?: string[];
	sprint_ids?: string[];
	knowledge_refs?: string[];
	source_refs?: string[];
	owner?: string;
	trigger?: string;
	trigger_state?: string;
	rationale?: string;
	evidence: string;
}

export interface CodewikiBuildToolInput {
	repoPath?: string;
	kind: "decision" | "planning" | "implementation";
	refresh?: boolean;
	/** Common */
	summary: string;
	slug?: string;
	source?: string;
	schema_version?: number;
	consumes?: CodewikiBuildRefsInput;
	produces?: CodewikiBuildProducesInput;
	change_type?: ChangeType;
	/** @deprecated Use change_type. */
	change_class?: LegacyChangeClass;
	upstream_build_refs?: string[];
	accepted_build_refs?: string[];
	traceability?: {
		change_type?: ChangeType;
		/** @deprecated Use change_type. */
		change_class?: LegacyChangeClass;
		exemption?: TraceabilityExemption;
		semantic?: boolean;
		requires_accepted_build?: boolean;
		upstream_build_refs?: string[];
		accepted_build_refs?: string[];
	};
	cycle?: CodewikiBuildCycleInput;
	policy?: CodewikiBuildPolicyInput;
	requirements?: CodewikiBuildRequirementInput[];
	evidence_mapping?: CodewikiEvidenceMappingInput[];
	audit_refs?: string[];
	audit_reports?: string[];
	agent_assessment?: string;
	lifecycle?: {
		state?:
			| "proposed"
			| "accepted"
			| "consumed"
			| "applied"
			| "validated"
			| "archived";
		ttl_days?: number;
		archive_after?: string;
		purge_after?: string;
	};
	/** Decision-specific */
	decision_mode?: "proposal" | "accepted";
	row_to_kb_mappings?: CodewikiDecisionKbMappingInput[];
	propagation?: CodewikiDecisionPropagationInput;
	diagram_refs?: string[];
	downstream_planning_questions?: string[];
	/** Decision row table */
	decision_table?: CodewikiDecisionTableRowInput[];
	approved_decision_rows?: string[];
	decisions?: string[];
	assumptions?: string[];
	open_questions?: string[];
	non_goals?: string[];
	knowledge_changes?: string[];
	roadmap_changes?: string[];
	/** Planning-specific */
	source_decision_build?: string;
	task_ids?: string[];
	task_changes?: string[];
	decision_row_resolutions?: CodewikiDecisionPropagationResolutionInput[];
	downstream_question_resolutions?: CodewikiDecisionPropagationResolutionInput[];
	tdd_plan?: string[];
	candidate_test_files?: string[];
	candidate_code_paths?: string[];
	/** Implementation-specific */
	source_planning_build?: string;
	task_id?: string;
	test_files?: string[];
	code_files?: string[];
	checks_run?: string[];
	acceptance_mapping?: Array<{ criterion: string; evidence: string }>;
	test_design_evidence?: string[];
	code_change_evidence?: string[];
	tester_notes?: string[];
	builder_notes?: string[];
	validation_refs?: string[];
	residual_issue_coverage?: ResidualIssueCoverageInput[];
	risks?: string[];
	closure_brief?: CodewikiClosureBriefInput;
	publication?: {
		commit_title?: string;
		commit_body?: string;
		pr_title?: string;
		pr_body?: string;
		issue_update?: string;
		release_notes?: string;
		archive_ref?: string;
		commit_sha?: string;
		remote?: string;
		branch?: string;
		restore_command?: string;
		secret_scan?: string;
		remote_visibility?: string;
		private_evidence?: string;
		safe_to_push?: boolean;
	};
}
