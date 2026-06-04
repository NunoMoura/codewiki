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
	"knowledge_applied",
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
	"in_progress",
	"code_complete",
	"validation_passed",
	"production_ready_unpublished",
	"published",
	"blocked",
] as const;

export const CODEWIKI_TRACE_PUBLICATION_STATUS_VALUES = [
	"not_applicable",
	"not_started",
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
	"roadmap",
	"code",
	"test",
	"content_digest",
	"git_commit",
	"git_tree",
	"archive_ref",
	"remote_ref",
	"package_digest",
	"source",
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

export interface CodewikiTraceLifecycleSection {
	status: CodewikiTraceLifecycleStatus;
	active_loop: CodewikiTraceLoop;
	loop_state: CodewikiTraceLoopRunState;
	created_at?: string;
	updated_at?: string;
	closed_at?: string;
	labels?: string[];
}

export interface CodewikiTraceRelation {
	kind: CodewikiTraceRelationKind;
	ref: string;
	state?: CodewikiTraceRelationState;
	summary?: string;
}

export interface CodewikiTraceScopeSection {
	task_ids?: string[];
	sprint_ids?: string[];
	knowledge_refs?: string[];
	code_refs?: string[];
	test_refs?: string[];
	gate_refs?: string[];
	path_scopes?: string[];
}

export interface CodewikiTraceRef {
	ref: string;
	kind?: CodewikiTraceRefKind;
	section?: CodewikiTraceSection;
	pointer?: string;
	summary?: string;
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
	compiler_output_refs?: CodewikiTraceRef[];
	row_refs?: CodewikiTraceRef[];
	knowledge_refs?: string[];
	gate_refs?: CodewikiTraceRef[];
	risk?: CodewikiTraceRisk;
	open_questions?: string[];
}

export interface CodewikiTracePlanningSection {
	status: CodewikiTracePlanningStatus;
	compiler_output_refs?: CodewikiTraceRef[];
	roadmap_task_refs?: string[];
	sprint_refs?: string[];
	parallelization_refs?: string[];
	gate_refs?: CodewikiTraceRef[];
	open_questions?: string[];
}

export interface CodewikiTracePublicationSection {
	status: CodewikiTracePublicationStatus;
	commit_refs?: string[];
	archive_refs?: string[];
	remote_refs?: string[];
	package_refs?: string[];
	restore_refs?: string[];
}

export interface CodewikiTraceImplementationSection {
	status: CodewikiTraceImplementationStatus;
	compiler_output_refs?: CodewikiTraceRef[];
	code_refs?: string[];
	test_refs?: string[];
	gate_refs?: CodewikiTraceRef[];
	publication?: CodewikiTracePublicationSection;
	remaining_risks?: string[];
}

export interface CodewikiTraceAccountabilitySection {
	canonical_source_refs?: string[];
	audit_evidence_refs?: string[];
	content_evidence_refs?: string[];
	gate_attestation_refs?: string[];
	isolation_refs?: string[];
	owner?: string;
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
	active_loop?: CodewikiTraceLoop;
	task_ids?: string[];
	sprint_ids?: string[];
	knowledge_refs?: string[];
	code_refs?: string[];
	test_refs?: string[];
	gate_refs?: string[];
	relations?: CodewikiTraceRelation[];
	restore: CodewikiTraceRestoreRef;
	archived_at?: string;
	last_seen_at?: string;
}

export interface CodewikiTraceCatalogV1 {
	schema_version: typeof CODEWIKI_TRACE_CATALOG_SCHEMA_VERSION;
	updated_at: string;
	entries: CodewikiColdTraceCatalogEntryV1[];
}
