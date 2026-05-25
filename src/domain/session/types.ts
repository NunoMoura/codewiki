import type { AgencyScope } from "../../agency/types.ts";

export const TASK_SESSION_ACTION_VALUES = [
	"focus",
	"progress",
	"blocked",
	"done",
	"spawn",
	"note",
	"clear",
] as const;
export const CHANGE_CLAIM_ACTION_VALUES = ["claim", "wait", "release", "heartbeat", "list"] as const;
export const CHANGE_CLAIM_MODE_VALUES = ["read", "write"] as const;
export const CHANGE_CLAIM_ROLE_VALUES = ["builder", "validator", "publisher", "observer"] as const;
export const CHANGE_CLAIM_LAYER_VALUES = ["knowledge", "roadmap", "code", "build", "validation", "graph", "source"] as const;
export const CHANGE_CLAIM_STATUS_VALUES = ["active", "released", "expired"] as const;
export const CHANGE_CLAIM_WAITER_STATUS_VALUES = ["pending", "ready", "cancelled", "expired"] as const;
export const ARTIFACT_STATUS_VALUES = ["available", "in-use", "waiting", "conflict", "stale"] as const;
export const ARTIFACT_STATUS_ACTION_VALUES = ["mark", "wait", "release", "heartbeat", "list"] as const;
export const WORKFLOW_LOOP_VALUES = ["decision", "planning", "implementation", "validation", "observe"] as const;

export type TaskSessionAction = (typeof TASK_SESSION_ACTION_VALUES)[number];
export type ChangeClaimAction = (typeof CHANGE_CLAIM_ACTION_VALUES)[number];
export type ChangeClaimMode = (typeof CHANGE_CLAIM_MODE_VALUES)[number];
export type ChangeClaimRole = (typeof CHANGE_CLAIM_ROLE_VALUES)[number];
export type ChangeClaimLayer = (typeof CHANGE_CLAIM_LAYER_VALUES)[number];
export type ChangeClaimStatus = (typeof CHANGE_CLAIM_STATUS_VALUES)[number];
export type ChangeClaimWaiterStatus = (typeof CHANGE_CLAIM_WAITER_STATUS_VALUES)[number];
export type ArtifactStatus = (typeof ARTIFACT_STATUS_VALUES)[number];
export type ArtifactStatusAction = (typeof ARTIFACT_STATUS_ACTION_VALUES)[number];
export type WorkflowLoop = (typeof WORKFLOW_LOOP_VALUES)[number];

export interface CodewikiIsolationRequirementInput {
	required?: boolean;
	mode?: string;
	evidence?: string[];
	reason?: string;
	profiles?: string[];
	handoff?: string;
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
