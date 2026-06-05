export const CODEWIKI_LIFECYCLE_TRACE_SCHEMA_VERSION = 1 as const;
export const CODEWIKI_TRACE_CATALOG_SCHEMA_VERSION = 1 as const;

export const CODEWIKI_TRACE_LOOP_VALUES = [
	"decision",
	"planning",
	"implementation",
] as const;

export const CODEWIKI_TRACE_LIFECYCLE_STATUS_VALUES = [
	"active",
	"blocked",
	"production_ready_unpublished",
	"publish_blocked",
	"published",
	"closed",
] as const;

export const CODEWIKI_TRACE_LOOP_RUN_STATE_VALUES = [
	"active",
	"waiting_gate",
	"blocked",
	"repairing",
] as const;

export const CODEWIKI_TRACE_RELATION_VALUES = [
	"depends_on",
	"refines",
	"supersedes",
	"conflicts_with",
	"blocks",
	"unblocks",
	"extracts_from",
	"follow_up_to",
	"releases_with",
] as const;

export const CODEWIKI_TRACE_RELATION_STATE_VALUES = [
	"active",
	"satisfied",
	"blocked",
] as const;

export const CODEWIKI_TRACE_RISK_VALUES = ["low", "medium", "high"] as const;

export const CODEWIKI_TRACE_DECISION_STATUS_VALUES = [
	"not_started",
	"proposed",
	"approved",
	"kb_applied",
	"gate_passed",
	"blocked",
] as const;

export const CODEWIKI_TRACE_PLANNING_STATUS_VALUES = [
	"not_started",
	"active",
	"gate_passed",
	"blocked",
] as const;

export const CODEWIKI_TRACE_IMPLEMENTATION_STATUS_VALUES = [
	"not_started",
	"active",
	"gate_passed",
	"production_ready",
	"blocked",
] as const;

export const CODEWIKI_TRACE_PUBLICATION_MODE_VALUES = [
	"off",
	"manual",
	"auto",
	"dry-run",
] as const;

export const CODEWIKI_TRACE_PUBLICATION_STATUS_VALUES = [
	"not_configured",
	"ready",
	"blocked",
	"published",
] as const;

export const CODEWIKI_TRACE_REF_KIND_VALUES = [
	"lifecycle_trace",
	"decision_output",
	"planning_output",
	"implementation_output",
	"gate_attestation",
	"knowledge",
	"diagram",
	"roadmap",
	"source",
	"test",
	"content_digest",
	"git_commit",
	"git_tree",
	"archive_ref",
	"remote_ref",
	"package_digest",
] as const;

export const CODEWIKI_DECISION_TABLE_STATUS_VALUES = [
	"draft",
	"pending",
	"partially_approved",
	"approved",
	"rejected",
	"deferred",
] as const;

export const CODEWIKI_DECISION_TABLE_ROW_APPROVAL_STATUS_VALUES = [
	"pending",
	"approved",
	"rejected",
	"deferred",
	"edited",
] as const;

export const CODEWIKI_TRACE_SECTION_VALUES = [
	"lifecycle",
	"relations",
	"scope",
	"decision",
	"planning",
	"implementation",
	"accountability",
] as const;

export type CodewikiTraceLoop = (typeof CODEWIKI_TRACE_LOOP_VALUES)[number];
export type CodewikiTraceLifecycleStatus =
	(typeof CODEWIKI_TRACE_LIFECYCLE_STATUS_VALUES)[number];
export type CodewikiTraceLoopRunState =
	(typeof CODEWIKI_TRACE_LOOP_RUN_STATE_VALUES)[number];
export type CodewikiTraceRelationKind =
	(typeof CODEWIKI_TRACE_RELATION_VALUES)[number];
export type CodewikiTraceRelationState =
	(typeof CODEWIKI_TRACE_RELATION_STATE_VALUES)[number];
export type CodewikiTraceRisk = (typeof CODEWIKI_TRACE_RISK_VALUES)[number];
export type CodewikiTraceDecisionStatus =
	(typeof CODEWIKI_TRACE_DECISION_STATUS_VALUES)[number];
export type CodewikiTracePlanningStatus =
	(typeof CODEWIKI_TRACE_PLANNING_STATUS_VALUES)[number];
export type CodewikiTraceImplementationStatus =
	(typeof CODEWIKI_TRACE_IMPLEMENTATION_STATUS_VALUES)[number];
export type CodewikiTracePublicationMode =
	(typeof CODEWIKI_TRACE_PUBLICATION_MODE_VALUES)[number];
export type CodewikiTracePublicationStatus =
	(typeof CODEWIKI_TRACE_PUBLICATION_STATUS_VALUES)[number];
export type CodewikiTraceRefKind =
	(typeof CODEWIKI_TRACE_REF_KIND_VALUES)[number];
export type CodewikiDecisionTableStatus =
	(typeof CODEWIKI_DECISION_TABLE_STATUS_VALUES)[number];
export type CodewikiDecisionTableRowApprovalStatus =
	(typeof CODEWIKI_DECISION_TABLE_ROW_APPROVAL_STATUS_VALUES)[number];
export type CodewikiTraceSection =
	(typeof CODEWIKI_TRACE_SECTION_VALUES)[number];

export interface CodewikiTraceRef {
	ref: string;
	kind?: CodewikiTraceRefKind;
	section?: CodewikiTraceSection;
	path?: string;
	json_pointer?: string;
	sha?: string;
	fingerprint?: string;
	summary?: string;
}

export interface CodewikiTraceActiveLoopV1 {
	loop: CodewikiTraceLoop;
	run_id: string;
	state: CodewikiTraceLoopRunState;
	cursor?: string;
	next_action?: string;
}

export interface CodewikiTraceBlockerV1 {
	id?: string;
	severity?: CodewikiTraceRisk;
	summary: string;
	refs?: CodewikiTraceRef[];
}

export interface CodewikiTraceRouteBackV1 {
	to_loop: CodewikiTraceLoop;
	reason: string;
	refs?: CodewikiTraceRef[];
}

export interface CodewikiTraceLifecycleSection {
	status: CodewikiTraceLifecycleStatus;
	active_loops: CodewikiTraceActiveLoopV1[];
	active_gates?: CodewikiTraceRef[];
	blockers?: CodewikiTraceBlockerV1[];
	route_back?: CodewikiTraceRouteBackV1[];
	next_safe_actions?: string[];
	risk?: CodewikiTraceRisk;
	recovery_cursor?: string;
	created_at?: string;
	updated_at?: string;
	closed_at?: string;
	labels?: string[];
}

export interface CodewikiTraceRelation {
	target_trace: string;
	rel: CodewikiTraceRelationKind;
	state?: CodewikiTraceRelationState;
	rationale?: string;
}

export interface CodewikiTraceScopeSection {
	task_refs?: string[];
	sprint_refs?: string[];
	knowledge_refs?: string[];
	diagram_refs?: string[];
	source_refs?: string[];
	test_refs?: string[];
	gate_refs?: string[];
	path_scopes?: string[];
}

export interface CodewikiDecisionTableOptionV1 {
	id: string;
	label: string;
	tradeoffs?: string[];
}

export interface CodewikiDecisionTableRowV1 {
	id: string;
	question: string;
	state_delta: {
		current: string;
		desired: string;
	};
	proposed_change: string;
	rationale: string;
	impact?: {
		product?: string[];
		system?: string[];
		source?: string[];
		tests?: string[];
		docs?: string[];
	};
	risk?: {
		level: CodewikiTraceRisk;
		notes?: string;
	};
	options?: CodewikiDecisionTableOptionV1[];
	approval?: {
		status: CodewikiDecisionTableRowApprovalStatus;
		actor?: string;
		decided_at?: string;
	};
	evidence_refs?: CodewikiTraceRef[];
	expected_outcome?: string;
	validated_outcome?: string;
	follow_up_refs?: CodewikiTraceRef[];
}

export interface CodewikiDecisionTableV1 {
	schema_version: 1;
	id: string;
	title: string;
	scope?: {
		product?: string[];
		system?: string[];
		source?: string[];
		tests?: string[];
		docs?: string[];
	};
	source_refs?: CodewikiTraceRef[];
	status: CodewikiDecisionTableStatus;
	rows: CodewikiDecisionTableRowV1[];
	created_at?: string;
	updated_at?: string;
}

export interface CodewikiTraceDecisionSection {
	status: CodewikiTraceDecisionStatus;
	decision_table?: CodewikiDecisionTableV1;
	approvals?: CodewikiTraceRef[];
	compiler_output_refs?: CodewikiTraceRef[];
	kb_patch_refs?: CodewikiTraceRef[];
	row_to_kb_mappings?: CodewikiTraceRef[];
	propagation?: Record<string, unknown>;
	risk_assessment?: string[];
	benefits?: string[];
	alternatives?: string[];
	downstream_planning_questions?: string[];
	gate_history?: CodewikiTraceRef[];
}

export interface CodewikiTracePlanningSection {
	status: CodewikiTracePlanningStatus;
	compiler_output_refs?: CodewikiTraceRef[];
	work_units?: Record<string, unknown>[];
	parallelization?: {
		path_conflicts?: Record<string, unknown>[];
		waves?: Record<string, unknown>[];
		session_count?: number;
		lease_plan?: Record<string, unknown>[];
		route_back_triggers?: string[];
		publisher_serialization?: string[];
	};
	verification_strategy?: string[];
	gate_history?: CodewikiTraceRef[];
}

export interface CodewikiTracePublicationSection {
	mode: CodewikiTracePublicationMode;
	status: CodewikiTracePublicationStatus;
	gate_history?: CodewikiTraceRef[];
	git_refs?: Record<string, string>;
	package_refs?: string[];
	remote_refs?: string[];
	restore_refs?: string[];
}

export interface CodewikiTraceImplementationSection {
	status: CodewikiTraceImplementationStatus;
	compiler_output_refs?: CodewikiTraceRef[];
	work_units?: Record<string, unknown>[];
	code_refs?: string[];
	test_refs?: string[];
	gate_evidence?: CodewikiTraceRef[];
	gate_history?: CodewikiTraceRef[];
	publication?: CodewikiTracePublicationSection;
}

export interface CodewikiTraceAccountabilitySection {
	user_approval_refs?: CodewikiTraceRef[];
	pi_session_refs?: CodewikiTraceRef[];
	agent_summaries?: string[];
	content_proofs?: CodewikiTraceRef[];
}

export interface CodewikiLifecycleTraceV1 {
	schema_version: typeof CODEWIKI_LIFECYCLE_TRACE_SCHEMA_VERSION;
	trace_id: string;
	title: string;
	summary: string;
	lifecycle: CodewikiTraceLifecycleSection;
	relations: CodewikiTraceRelation[];
	scope: CodewikiTraceScopeSection;
	decision: CodewikiTraceDecisionSection;
	planning: CodewikiTracePlanningSection;
	implementation: CodewikiTraceImplementationSection;
	accountability: CodewikiTraceAccountabilitySection;
}

export interface CodewikiTraceRestoreRef {
	original_path: string;
	commit_sha?: string;
	tree_sha?: string;
	archive_ref?: string;
	remote_ref?: string;
	package_digest?: string;
	content_digest?: string;
	restore_command?: string;
}

export interface CodewikiColdTraceCatalogEntryV1 {
	trace_id: string;
	title?: string;
	summary?: string;
	lifecycle_status: CodewikiTraceLifecycleStatus;
	active_loops?: CodewikiTraceActiveLoopV1[];
	task_refs?: string[];
	sprint_refs?: string[];
	knowledge_refs?: string[];
	source_refs?: string[];
	test_refs?: string[];
	path_scopes?: string[];
	gate_refs?: string[];
	relations?: CodewikiTraceRelation[];
	restore: CodewikiTraceRestoreRef;
	cold_archive_reason?: string;
	deletion_ledger_ref?: string;
	archived_at?: string;
	last_seen_at?: string;
}

export interface CodewikiTraceCatalogV1 {
	schema_version: typeof CODEWIKI_TRACE_CATALOG_SCHEMA_VERSION;
	updated_at: string;
	entries: CodewikiColdTraceCatalogEntryV1[];
}
