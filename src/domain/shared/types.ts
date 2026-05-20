/**
 * domain/shared/types.ts
 *
 * All shared domain types. No agent-specific dependencies.
 * Adapters (Pi, MCP, CLI, etc.) must NOT appear here.
 */

export const ROADMAP_STATUS_VALUES = [
	"todo",
	"in_progress",
	"blocked",
	"done",
	"cancelled",
] as const;
export const ROADMAP_PRIORITY_VALUES = [
	"critical",
	"high",
	"medium",
	"low",
] as const;
export const TASK_SESSION_ACTION_VALUES = [
	"focus",
	"progress",
	"blocked",
	"done",
	"spawn",
	"note",
	"clear",
] as const;
export const TOOL_TASK_STATUS_VALUES = [
	"todo",
	"in_progress",
	"blocked",
	"done",
	"cancelled",
] as const;
export const TASK_EVIDENCE_RESULT_VALUES = [
	"progress",
	"pass",
	"fail",
	"block",
	"done_candidate",
] as const;

export const SUBAGENT_ROLE_VALUES = ["implementer", "auditor", "architect"] as const;
export const SUBAGENT_VERDICT_VALUES = ["pass", "fail", "block"] as const;
export const SUBAGENT_PROPOSAL_VALUES = ["task", "refactor", "spec"] as const;
export const CODEWIKI_STATE_SECTION_VALUES = ["repo", "health", "summary", "roadmap", "graph", "drift", "session", "task", "claims", "archive"] as const;
export const CHANGE_CLAIM_ACTION_VALUES = ["claim", "wait", "release", "heartbeat", "list"] as const;
export const CHANGE_CLAIM_MODE_VALUES = ["read", "write"] as const;
export const CHANGE_CLAIM_ROLE_VALUES = ["builder", "validator", "publisher", "observer"] as const;
export const CHANGE_CLAIM_LAYER_VALUES = ["knowledge", "roadmap", "code", "build", "validation", "graph", "source"] as const;
export const CHANGE_CLAIM_STATUS_VALUES = ["active", "released", "expired"] as const;
export const CHANGE_CLAIM_WAITER_STATUS_VALUES = ["pending", "ready", "cancelled", "expired"] as const;
export const ARTIFACT_STATUS_VALUES = ["available", "in-use", "waiting", "conflict", "stale"] as const;
export const ARTIFACT_STATUS_ACTION_VALUES = ["mark", "wait", "release", "heartbeat", "list"] as const;
export const AGENCY_MODE_VALUES = ["auto", "dry-run", "manual", "observe", "maintain", "work"] as const;
export const AGENCY_TRIGGER_VALUES = ["manual", "task_end", "sprint_end", "roadmap_end", "budget_end"] as const;
export const AGENCY_RISK_VALUES = ["low", "medium", "high"] as const;
export const AGENCY_SCOPE_KIND_VALUES = ["roadmap", "sprint", "task"] as const;
export const WORKFLOW_LOOP_VALUES = ["decision", "planning", "implementation", "validation", "observe"] as const;
export const CHANGE_TYPE_VALUES = ["product", "system", "task", "code"] as const;
export const TRACEABILITY_EXEMPTION_VALUES = ["generated", "runtime", "mechanical"] as const;
/** @deprecated Use CHANGE_TYPE_VALUES. */
export const CHANGE_CLASS_VALUES = CHANGE_TYPE_VALUES;
export const GC_ARTIFACT_TEMPERATURE_VALUES = ["hot", "warm", "cold", "purgeable"] as const;
export const SPRINT_STATUS_VALUES = ["planned", "active", "review", "closed", "cancelled"] as const;
export const STATUS_DOCK_DENSITY_VALUES = ["minimal", "standard", "full"] as const;
export const STATUS_DOCK_MODE_VALUES = ["auto", "pin", "off"] as const;
export const STATUS_SCOPE_VALUES = ["repo", "task", "spec", "both", "docs", "code"] as const;
export const AUDIT_PROFILE_VALUES = [
	"alignment",
	"file-structure",
	"stale-reference",
	"package",
	"security",
	"generated-parity",
	"changed",
	"task",
] as const;
export const AUDIT_SEVERITY_VALUES = ["info", "warning", "error"] as const;
export const AUDIT_STATUS_VALUES = ["pass", "warning", "fail"] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUS_VALUES)[number];
export type RoadmapPriority = (typeof ROADMAP_PRIORITY_VALUES)[number];
export type TaskSessionAction = (typeof TASK_SESSION_ACTION_VALUES)[number];
export type ChangeClaimAction = (typeof CHANGE_CLAIM_ACTION_VALUES)[number];
export type ChangeClaimMode = (typeof CHANGE_CLAIM_MODE_VALUES)[number];
export type ChangeClaimRole = (typeof CHANGE_CLAIM_ROLE_VALUES)[number];
export type ChangeClaimLayer = (typeof CHANGE_CLAIM_LAYER_VALUES)[number];
export type ChangeClaimStatus = (typeof CHANGE_CLAIM_STATUS_VALUES)[number];
export type ChangeClaimWaiterStatus = (typeof CHANGE_CLAIM_WAITER_STATUS_VALUES)[number];
export type ArtifactStatus = (typeof ARTIFACT_STATUS_VALUES)[number];
export type ArtifactStatusAction = (typeof ARTIFACT_STATUS_ACTION_VALUES)[number];
export type ToolTaskStatus = (typeof TOOL_TASK_STATUS_VALUES)[number];
export type TaskEvidenceResult = (typeof TASK_EVIDENCE_RESULT_VALUES)[number];
export type SubagentRole = (typeof SUBAGENT_ROLE_VALUES)[number];
export type SubagentVerdict = (typeof SUBAGENT_VERDICT_VALUES)[number];
export type TaskVerifierVerdict = SubagentVerdict;
export type SubagentProposalKind = (typeof SUBAGENT_PROPOSAL_VALUES)[number];
export type CodewikiStateSection = (typeof CODEWIKI_STATE_SECTION_VALUES)[number];
export type AgencyMode = (typeof AGENCY_MODE_VALUES)[number];
export type AgencyTrigger = (typeof AGENCY_TRIGGER_VALUES)[number];
export type AgencyRisk = (typeof AGENCY_RISK_VALUES)[number];
export type AgencyScopeKind = (typeof AGENCY_SCOPE_KIND_VALUES)[number];
export type WorkflowLoop = (typeof WORKFLOW_LOOP_VALUES)[number];
export type ChangeType = (typeof CHANGE_TYPE_VALUES)[number];
export type TraceabilityExemption = (typeof TRACEABILITY_EXEMPTION_VALUES)[number];
export type LegacyChangeClass = ChangeType | TraceabilityExemption | "code-bugfix" | "maintenance" | "audit" | "security" | "publication";
/** @deprecated Use ChangeType. */
export type ChangeClass = LegacyChangeClass;
export type GcArtifactTemperature = (typeof GC_ARTIFACT_TEMPERATURE_VALUES)[number];
export type SprintStatus = (typeof SPRINT_STATUS_VALUES)[number];
export type StatusDockDensity = (typeof STATUS_DOCK_DENSITY_VALUES)[number];
export type StatusDockMode = (typeof STATUS_DOCK_MODE_VALUES)[number];
export type StatusScope = (typeof STATUS_SCOPE_VALUES)[number];
export type AuditProfile = (typeof AUDIT_PROFILE_VALUES)[number];
export type AuditSeverity = (typeof AUDIT_SEVERITY_VALUES)[number];
export type AuditStatus = (typeof AUDIT_STATUS_VALUES)[number];

export interface AuditIssue {
	profile: AuditProfile;
	severity: AuditSeverity;
	kind: string;
	message: string;
	path?: string;
	rationale?: string;
	refs?: string[];
}

export interface AuditFingerprint {
	path: string;
	digest: string;
	bytes: number;
}

export interface AuditScope {
	root?: string;
	files?: string[];
	layers?: string[];
	task_id?: string;
	changed?: boolean;
}

export interface AuditProfileResult {
	profile: AuditProfile;
	status: AuditStatus;
	summary: string;
	checked_scopes: AuditScope;
	issues: AuditIssue[];
	evidence_refs: string[];
	fingerprints: AuditFingerprint[];
}

export interface AuditReport {
	kind: "audit_report";
	version: number;
	generated_at: string;
	project: string;
	status: AuditStatus;
	profiles: AuditProfile[];
	checked_scopes: AuditScope;
	issues: AuditIssue[];
	evidence_refs: string[];
	fingerprints: AuditFingerprint[];
	profile_results: AuditProfileResult[];
}

export interface RoadmapTaskInput {
	id?: string;
	title: string;
	status?: RoadmapStatus;
	priority?: RoadmapPriority;
	kind?: string;
	summary?: string;
	spec_paths?: string[];
	code_paths?: string[];
	research_ids?: string[];
	labels?: string[];
	change_type?: ChangeType;
	/** @deprecated Use change_type. */
	change_class?: LegacyChangeClass;
	goal?: Partial<RoadmapTaskGoal>;
	delta?: Partial<{ desired: string; current: string; closure: string }>;
}

export interface RoadmapTaskUpdateInput {
	taskId: string;
	title?: string;
	status?: RoadmapStatus;
	priority?: RoadmapPriority;
	kind?: string;
	summary?: string;
	spec_paths?: string[];
	code_paths?: string[];
	research_ids?: string[];
	labels?: string[];
	change_type?: ChangeType;
	/** @deprecated Use change_type. */
	change_class?: LegacyChangeClass;
	goal?: Partial<RoadmapTaskGoal>;
	delta?: Partial<{ desired: string; current: string; closure: string }>;
}

export interface RoadmapTaskUpdateFields {
	title?: string;
	priority?: RoadmapPriority;
	kind?: string;
	summary?: string;
	status?: RoadmapStatus;
	spec_paths?: string[];
	code_paths?: string[];
	research_ids?: string[];
	labels?: string[];
	change_type?: ChangeType;
	/** @deprecated Use change_type. */
	change_class?: LegacyChangeClass;
	goal?: Partial<RoadmapTaskGoal>;
	delta?: Partial<{ desired: string; current: string; closure: string }>;
}

export interface RoadmapTaskGoal {
	outcome: string;
	acceptance: string[];
	non_goals: string[];
	verification: string[];
}

export interface RoadmapTaskRecord {
	id: string;
	title: string;
	status: RoadmapStatus;
	priority: RoadmapPriority;
	kind: string;
	summary: string;
	spec_paths: string[];
	code_paths: string[];
	research_ids: string[];
	labels: string[];
	change_type?: ChangeType;
	/** @deprecated Use change_type. */
	change_class?: LegacyChangeClass;
	goal: RoadmapTaskGoal;
	delta: {
		desired: string;
		current: string;
		closure: string;
	};
	created: string;
	updated: string;
}

export interface RoadmapSprintRecord {
	id: string;
	title: string;
	status: SprintStatus;
	outcome: string;
	task_ids: string[];
	scope?: {
		knowledge?: string[];
		code?: string[];
	};
	budget?: AgencyBudget;
	gates?: string[];
	created: string;
	updated: string;
}

export interface RoadmapFile {
	version: number;
	updated: string;
	order: string[];
	tasks: Record<string, RoadmapTaskRecord>;
	sprints?: Record<string, RoadmapSprintRecord>;
}

export interface WikiProject {
	root: string;
	label: string;
	config: DocsConfig;
	docsRoot: string;
	specsRoot: string;
	evidenceRoot: string;
	researchRoot: string;
	indexPath: string;
	roadmapPath: string;
	roadmapDocPath: string;
	roadmapEventsPath: string;
	metaRoot: string;
	viewsRoot: string;
	generatedFiles?: string[];
	graphPath: string;
	lintPath: string;
	roadmapStatePath: string;
	statusStatePath: string;
	eventsPath: string;
	configPath: string;
}

export interface DocsConfig {
	project_name?: string;
	schema_version?: number;
	wiki_root?: string;
	docs_root?: string;
	specs_root?: string;
	evidence_root?: string;
	research_root?: string;
	index_path?: string;
	roadmap_path?: string;
	roadmap_doc_path?: string;
	roadmap_events_path?: string;
	meta_root?: string;
	views_root?: string;
	generated_files?: string[];
	roadmap_retention?: {
		compress_archive?: boolean;
		archive_path?: string;
		closed_task_limit?: number;
	};
	lint?: {
		repo_markdown?: string[];
		forbidden_headings?: string[];
		word_count_warn?: number;
		word_count_exempt?: string[];
		diagram_refs_mode?: "off" | "warn" | "warning" | "migration" | "error" | "enforce" | "required" | "hard";
	};
	codewiki?: {
		system_diagrams?: {
			diagram_refs?: {
				mode?: "off" | "warn" | "warning" | "migration" | "error" | "enforce" | "required" | "hard";
			};
		};
		diagram_refs?: {
			mode?: "off" | "warn" | "warning" | "migration" | "error" | "enforce" | "required" | "hard";
		};
		self_drift_scope?: ScopeConfig;
		code_drift_scope?: CodeDriftScopeConfig;
		rebuild?: {
			quiet?: boolean;
			freshness_check?: boolean;
			debounce_ms?: number;
		};
		agency?: {
			default_scope?: AgencyScope;
			budgets?: Partial<Record<AgencyScopeKind | "default", AgencyBudget>>;
			parallelism?: {
				max_sessions?: number;
				session_per_sprint?: boolean;
				require_claims?: boolean;
			};
		};
		gc?: {
			hot_days?: number;
			warm_days?: number;
			cold_days?: number;
			purge_days?: number;
			sprint_close_hook?: boolean;
		};
		gateway?: {
			generated_readonly_paths?: string[];
			write_paths?: string[];
		};
	};
}

export interface RoadmapStateTaskSummary {
	id: string;
	title: string;
	status: RoadmapStatus;
	priority: string;
	summary: string;
	updated: string;
	spec_paths?: string[];
	code_paths?: string[];
	labels?: string[];
	goal?: RoadmapTaskGoal;
	boundary?: {
		executable: boolean;
		container: boolean;
		reasons: string[];
	};
	context_path?: string;
	loop?: {
		updated_at: string;
		evidence?: {
			verdict: string;
			summary: string;
			checks_run?: string[];
			files_touched?: string[];
			issues?: string[];
			updated_at?: string;
		};
	};
}

export interface RoadmapStateFile {
	version: number;
	generated_at: string;
	health: RoadmapStateHealth;
	summary: {
		task_count: number;
		open_count: number;
		sprint_count?: number;
		active_sprint_count?: number;
		status_counts: Record<string, number>;
		priority_counts: Record<string, number>;
	};
	views: {
		ordered_task_ids: string[];
		open_task_ids: string[];
		executable_open_task_ids?: string[];
		container_task_ids?: string[];
		in_progress_task_ids: string[];
		executable_in_progress_task_ids?: string[];
		todo_task_ids: string[];
		executable_todo_task_ids?: string[];
		blocked_task_ids: string[];
		done_task_ids: string[];
		cancelled_task_ids: string[];
		recent_task_ids: string[];
		sprint_ids?: string[];
		active_sprint_ids?: string[];
		sprints?: any[];
	};
	tasks: Record<string, RoadmapStateTaskSummary>;
	source?: {
		task_context_root: string;
	};
}

export interface AgencyScope {
	kind: AgencyScopeKind;
	id?: string;
}

export interface CodewikiIsolationRequirementInput {
	required?: boolean;
	mode?: string;
	evidence?: string[];
	reason?: string;
	profiles?: string[];
	handoff?: string;
}

export interface CodewikiBuildIsolationPolicyInput {
	loop_start?: CodewikiIsolationRequirementInput;
	validation?: CodewikiIsolationRequirementInput;
	next_loop?: CodewikiIsolationRequirementInput;
}

export interface WorkflowCursor {
	active_loop: WorkflowLoop;
	reason?: string;
	input_refs?: string[];
	expected_output?: string;
	exit_gate?: string;
	scope?: AgencyScope;
	isolation?: CodewikiIsolationRequirementInput;
	context_boundary?: string;
	handoff_refs?: string[];
}

export interface TaskSessionLinkRecord {
	taskId: string;
	action: TaskSessionAction;
	summary: string;
	filesTouched: string[];
	spawnedTaskIds: string[];
	cursor?: WorkflowCursor;
	timestamp: string;
}

export interface TaskSessionLinkInput {
	taskId: string;
	action?: string;
	summary?: string;
	filesTouched?: string[];
	spawnedTaskIds?: string[];
	cursor?: WorkflowCursor;
	setSessionName?: boolean;
}

export interface ChangeClaimScope {
	layer: ChangeClaimLayer;
	path?: string;
	task_id?: string;
	ref?: string;
	description?: string;
}

export interface WorktreeIsolationMetadata {
	worktree_path?: string;
	branch?: string;
	base_sha?: string;
	head_sha?: string;
	validated_sha?: string;
	published_sha?: string;
	tree_sha?: string;
	working_tree_digest?: string;
	worktree_digest?: string;
	package_digest?: string;
	archive_ref?: string;
	remote_ref?: string;
	clean?: boolean;
	fresh_context?: boolean;
	session_id?: string;
	claim_id?: string;
	builder_session_id?: string;
	builder_claim_id?: string;
	related_claim_ids?: string[];
	notes?: string;
}

export interface ArtifactStatusBlocker {
	claim_id: string;
	session_id: string;
	agent_name?: string;
	role?: ChangeClaimRole;
	task_id?: string;
	build_ref?: string;
	branch?: string;
	worktree_path?: string;
	head_sha?: string;
	published_sha?: string;
	tree_sha?: string;
	patch_ref?: string;
	scope?: string;
	summary?: string;
	next_safe_action: string;
}

export interface ChangeClaimRecord {
	id: string;
	session_id: string;
	agent_name: string;
	status: ChangeClaimStatus;
	mode: ChangeClaimMode;
	role?: ChangeClaimRole;
	summary: string;
	task_id?: string;
	build_ref?: string;
	worktree?: WorktreeIsolationMetadata;
	scopes: ChangeClaimScope[];
	created_at: string;
	updated_at: string;
	expires_at: string;
	released_at?: string;
}

export interface ChangeClaimWaiterRecord {
	id: string;
	session_id: string;
	agent_name: string;
	status: ChangeClaimWaiterStatus;
	mode: ChangeClaimMode;
	role?: ChangeClaimRole;
	summary: string;
	task_id?: string;
	build_ref?: string;
	worktree?: WorktreeIsolationMetadata;
	scopes: ChangeClaimScope[];
	blocked_by_claim_ids: string[];
	blockers?: ArtifactStatusBlocker[];
	blocker_summary?: string;
	next_safe_action?: string;
	created_at: string;
	updated_at: string;
	expires_at: string;
	ready_at?: string;
	cancelled_at?: string;
}

export interface ChangeClaimsFile {
	version: number;
	updated_at: string;
	next_sequence: number;
	next_wait_sequence?: number;
	claims: ChangeClaimRecord[];
	waiters?: ChangeClaimWaiterRecord[];
}

export interface ChangeClaimConflict {
	kind: "warning" | "conflict";
	claim_ids: string[];
	sessions: string[];
	scope: ChangeClaimScope;
	reason: string;
}

export interface ArtifactStatusHolder {
	record_id: string;
	session_id: string;
	agent_name: string;
	mode: ChangeClaimMode;
	role?: ChangeClaimRole;
	task_id?: string;
	build_ref?: string;
	summary?: string;
	expires_at?: string;
	worktree?: WorktreeIsolationMetadata;
	blockers?: ArtifactStatusBlocker[];
	blocker_summary?: string;
	next_safe_action?: string;
}

export interface ArtifactStatusRecord {
	artifact: ChangeClaimScope;
	status: ArtifactStatus;
	holders: ArtifactStatusHolder[];
	waiters: ArtifactStatusHolder[];
	conflict_ids: string[];
	reason?: string;
	blockers?: ArtifactStatusBlocker[];
	next_safe_action?: string;
}

export interface ChangeClaimState {
	generated_at: string;
	active_claim_count: number;
	warning_count: number;
	conflict_count: number;
	pending_waiter_count: number;
	ready_waiter_count: number;
	claims: ChangeClaimRecord[];
	conflicts: ChangeClaimConflict[];
	waiters: ChangeClaimWaiterRecord[];
	artifact_statuses?: ArtifactStatusRecord[];
}

export interface TaskLoopUpdateInput {
	taskId: string;
	action: "pass" | "fail" | "block";
	summary: string;
	checks_run?: string[];
	files_touched?: string[];
	issues?: string[];
}

export interface CodewikiTaskEvidenceInput {
	summary: string;
	result?: TaskEvidenceResult;
	checks_run?: string[];
	files_touched?: string[];
	issues?: string[];
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

export interface CodewikiGcToolInput {
	repoPath?: string;
	action?: "dry-run" | "purge";
	include?: Array<"tracked" | "runtime">;
	scopes?: string[];
	archive_sha?: string;
	tree_sha?: string;
	archive_ref?: string;
	ledger_path?: string;
	max_deletes?: number;
	refresh?: boolean;
}

export type AgencyToolInput = CodewikiAgencyToolInput;

export interface CodewikiTaskPatchInput {
	title?: string;
	priority?: RoadmapPriority;
	kind?: string;
	summary?: string;
	status?: ToolTaskStatus;
	spec_paths?: string[];
	code_paths?: string[];
	research_ids?: string[];
	labels?: string[];
	change_type?: ChangeType;
	/** @deprecated Use change_type. */
	change_class?: LegacyChangeClass;
	goal?: Partial<RoadmapTaskGoal>;
	delta?: Partial<{ desired: string; current: string; closure: string }>;
}

export interface CodewikiSprintInput {
	id?: string;
	title: string;
	status?: SprintStatus;
	outcome: string;
	task_ids?: string[];
	scope?: {
		knowledge?: string[];
		code?: string[];
	};
	budget?: AgencyBudget;
	gates?: string[];
}

export interface CodewikiTaskToolInput {
	repoPath?: string;
	action: "create" | "update" | "close" | "cancel" | "checkpoint" | "clear-archive" | "sprint";
	tasks?: RoadmapTaskInput[];
	sprint?: CodewikiSprintInput;
	taskId?: string;
	summary?: string;
	patch?: CodewikiTaskPatchInput;
	evidence?: CodewikiTaskEvidenceInput;
	refresh?: boolean;
}

export interface CodewikiDiffTableRowInput {
	id?: string;
	current_state: string;
	desired_state: string;
	rationale: string;
	affected_layers?: string[];
	risk?: "low" | "medium" | "high" | string;
	user_action?: "pending" | "approved" | "rejected" | "deferred" | "edited" | string;
	alternatives?: string[];
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
		state?: "proposed" | "accepted" | "consumed" | "applied" | "validated" | "archived";
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
	diff_table?: CodewikiDiffTableRowInput[];
	approved_diff_rows?: string[];
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
	isolation?: CodewikiValidationIsolationInput;
	preflight_only?: boolean;
	refresh?: boolean;
}

export interface CodewikiSessionToolInput {
	repoPath?: string;
	action: "focus" | "note" | "clear";
	taskId?: string;
	summary?: string;
	files_touched?: string[];
	cursor?: WorkflowCursor;
	setSessionName?: boolean;
	refresh?: boolean;
}

export interface ChangeClaimMutationInput {
	repoPath?: string;
	action: ChangeClaimAction;
	claimId?: string;
	taskId?: string;
	buildRef?: string;
	summary?: string;
	mode?: ChangeClaimMode;
	role?: ChangeClaimRole;
	worktree?: WorktreeIsolationMetadata;
	scopes?: ChangeClaimScope[];
	ttl_minutes?: number;
	force?: boolean;
	refresh?: boolean;
}

export interface CodewikiArtifactStatusToolInput {
	repoPath?: string;
	action: ArtifactStatusAction;
	recordId?: string;
	taskId?: string;
	buildRef?: string;
	summary?: string;
	mode?: ChangeClaimMode;
	role?: ChangeClaimRole;
	worktree?: WorktreeIsolationMetadata;
	scopes?: ChangeClaimScope[];
	ttl_minutes?: number;
	force?: boolean;
	refresh?: boolean;
}

export interface CodewikiResumeContextToolInput {
	repoPath?: string;
	refresh?: boolean;
	taskId?: string;
	followUpIntent?: string;
}

export interface CodewikiStateToolInput {
	repoPath?: string;
	refresh?: boolean;
	include?: CodewikiStateSection[];
	taskId?: string;
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

export interface StatusStateFile {
	version: number;
	generated_at: string;
	project: {
		name: string;
		docs_root: string;
		roadmap_path: string;
	};
	health: {
		color: "green" | "yellow" | "red";
		errors: number;
		warnings: number;
		total_issues: number;
	};
	summary: {
		total_specs: number;
		mapped_specs: number;
		aligned_specs: number;
		tracked_specs: number;
		untracked_specs: number;
		blocked_specs: number;
		unmapped_specs: number;
		task_count: number;
		open_task_count: number;
		done_task_count: number;
	};
	bars: {
		tracked_drift: StatusStateBar;
		roadmap_done: StatusStateBar;
		spec_mapping: StatusStateBar;
	};
	views: {
		risky_spec_paths: string[];
		top_risky_spec_paths: string[];
		open_task_ids: string[];
		sprint_ids?: string[];
		active_sprint_ids?: string[];
	};
	next_step: {
		kind: string;
		command: string;
		reason: string;
	};
	workflow_cursor?: WorkflowCursor;
	gc?: any;
	direction: string[];
	specs: StatusStateSpecRow[];
	agency: {
		generated_at: string;
		summary: {
			lane_count: number;
			freshness_basis: string;
			high_cadence_lane_ids: string[];
			medium_cadence_lane_ids: string[];
			low_cadence_lane_ids: string[];
		};
		lanes: StatusStateAgencyLane[];
	};
	resume: {
		source: "task" | "agency" | "next_step";
		task_id: string;
		lane_id: string;
		heading: string;
		command: string;
		reason: string;
		status: string;
		verification: string;
		evidence: string;
		agency: string;
	};
	parallel: {
		generated_at: string;
		active_session_count: number;
		collision_task_ids: string[];
		sessions: StatusStateParallelSession[];
		active_claim_count?: number;
		claim_warning_count?: number;
		claim_conflict_count?: number;
		claim_pending_wait_count?: number;
		claim_ready_wait_count?: number;
		claims?: ChangeClaimRecord[];
		claim_waiters?: ChangeClaimWaiterRecord[];
		claim_conflicts?: ChangeClaimConflict[];
		artifact_statuses?: ArtifactStatusRecord[];
		artifact_status?: {
			in_use_count: number;
			warning_count: number;
			conflict_count: number;
			waiting_count: number;
			ready_waiter_count: number;
		};
	};
	wiki: {
		rows: StatusStateSpecRow[];
		sections: StatusStateWikiSection[];
	};
	roadmap: {
		focused_task_id: string;
		blocked_task_ids: string[];
		in_progress_task_ids: string[];
		next_task_id: string;
		sprint_ids?: string[];
		active_sprint_ids?: string[];
		sprints?: any[];
		columns: StatusStateRoadmapColumn[];
	};
	agents: {
		rows: StatusStateAgentRow[];
	};
	channels: {
		add_label: string;
		rows: StatusStateChannelRow[];
	};
}

export interface GraphNode {
	id: string;
	kind: string;
	title?: string;
	path?: string;
	[key: string]: any;
}

export interface GraphEdge {
	from: string;
	to: string;
	kind: string;
	[key: string]: any;
}

export interface GraphViews {
	roadmap?: {
		task_ids?: string[];
		open_task_ids?: string[];
		[key: string]: any;
	};
	[key: string]: any;
}

export interface GraphFile {
	version: number;
	generated_at: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	views?: GraphViews;
}

export interface RoadmapTaskContextPacket {
	version: number;
	generated_at: string;
	context_path: string;
	task: any;
	budget?: any;
	revision?: any;
	code?: any;
	specs?: any;
	evidence?: any;
}

export interface StatusStateSpecRow {
	path: string;
	title: string;
	summary: string;
	drift_status: "aligned" | "tracked" | "untracked" | "blocked" | "unmapped";
	code_paths: string[];
	code_area: string;
	issue_counts: { errors: number; warnings: number; total: number };
	related_task_ids: string[];
	primary_task: { id: string; status: string; title: string } | null;
	revision: any;
	note: string;
}

export interface StatusStateBar {
	label: string;
	value: number;
	total: number;
	percent: number;
}

export interface StatusStateAgencyLane {
	id: string;
	title: string;
	cadence: string;
	freshness_basis: string;
	fallback_max_age_hours: number;
	interval_hours: number;
	triggers: string[];
	checked_at: string;
	revision: any;
	freshness: {
		status: "fresh" | "stale";
		basis: string;
		checked_at: string;
		reason: string;
		stale_state_guidance: string;
	};
	spec_paths: string[];
	code_paths: string[];
	code_area: string;
	open_task_ids: string[];
	risky_spec_paths: string[];
	stats: {
		total_specs: number;
		aligned_specs: number;
		tracked_specs: number;
		untracked_specs: number;
		blocked_specs: number;
		unmapped_specs: number;
	};
	recommendation: {
		kind: string;
		command: string;
		reason: string;
	};
}

export interface StatusStateParallelSession {
	session_id: string;
	task_id: string;
	action: string;
	timestamp: string;
	title: string;
	summary: string;
	agent_name: string;
}

export interface StatusStateAgentRow {
	id: string;
	label: string;
	name: string;
	task_id: string;
	task_title: string;
	mode: string;
	status: string;
	last_action: string;
	constraint: string;
	session_id: string;
}

export interface StatusStateChannelRow {
	id: string;
	label: string;
	kind: string;
	target: string;
	description: string;
	status: string;
	scope: string;
	last_delivery_at: string;
	error?: string;
}

export interface StatusStateWikiSection {
	id: string;
	label: string;
	rows: StatusStateSpecRow[];
}

export interface StatusStateRoadmapColumn {
	id: string;
	label: string;
	task_ids: string[];
}

export interface StatusDockPrefs {
	version: number;
	density: StatusDockDensity;
	mode: StatusDockMode;
	lastRepoPath?: string;
	pinnedRepoPath?: string;
}

export type StatusPanelSection = any;

export interface StatusPanelDetail {
	sections?: any[];
	actions?: any[];
	kind?: string;
	selectedActionIndex?: number;
	title?: string;
	lines?: string[];
	[key: string]: any;
}

export interface ActiveStatusPanel {
	project: ResolvedStatusDockProject;
	density: StatusDockDensity;
	section: any;
	source: string;
	scope: StatusScope;
	requestRender?: () => void;
	close?: () => void;
	detail: StatusPanelDetail | null;
	activeLink: TaskSessionLinkRecord | null;
	sessionId: string;
	homeIssueIndex: number;
	wikiRowIndex: number;
	wikiColumnIndex: number;
	animationTick: number;
	roadmapColumnIndex: number;
	roadmapRowIndex: number;
	graphRowIndex?: number;
	diffRowIndex?: number;
	agentRowIndex: number;
	channelRowIndex: number;
	animationTimer?: any;
}

export interface ActiveConfigPanel {
	requestRender?: () => void;
	close?: () => void;
	section: any;
	pinActionIndex: number;
}

export interface ArchitecturePanelComponent {
	id: string;
	label: string;
	path: string;
	summary: string;
}

export interface CodeDriftScopeConfig {
	include: string[];
	exclude?: string[];
	docs?: string[];
	repo_docs?: string[];
	code?: string[];
}

export type ConfigPanelSection = any;

export interface DriftContext {
	selfInclude: string[];
	selfExclude: string[];
	docsScope: string[];
	docsExclude: string[];
	repoDocs: string[];
	codeScope: string[];
}

export interface HomeIssue {
	severity: "blocker" | "warning" | "info";
	title: string;
	impact: string;
	recommended: string;
	detail: string[];
}

export interface ResolvedStatusDockProject extends WikiProject {
	project: WikiProject;
	source: string;
	statusState?: StatusStateFile;
}

export interface RoadmapStateHealth {
	color: "green" | "yellow" | "red";
	errors: number;
	warnings: number;
	total_issues: number;
}

export interface ScopeConfig {
	include: string[];
	exclude?: string[];
}
