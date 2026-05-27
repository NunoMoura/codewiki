import type {
	ChangeClaimRecord,
	ChangeClaimRole,
	ChangeClaimScope,
	ChangeClaimWaiterRecord,
	WorktreeIsolationMetadata,
} from "./types.ts";
import type { WikiProject } from "../project/types.ts";
import { unique } from "../shared/utils.ts";

export interface RoleWorktreePlanInput {
	task_id?: string;
	role?: ChangeClaimRole;
	session_id?: string;
	worktree_root?: string;
	worktree_path?: string;
	branch?: string;
	base_sha?: string;
	base_ref?: string;
}

export interface RoleWorktreePlan {
	task_id: string;
	role: ChangeClaimRole;
	session_id: string;
	worktree_path: string;
	branch: string;
	base_ref: string;
	base_sha?: string;
	commands: {
		prepare: string[];
		heartbeat: string[];
		verify: string[];
		cleanup: string[];
	};
	metadata: WorktreeIsolationMetadata;
}

export interface ArtifactBlocker {
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

const DEFAULT_ROLE: ChangeClaimRole = "builder";

function safeSegment(value: string, fallback: string): string {
	const segment = String(value || "").trim()
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return segment || fallback;
}

function pathBasename(path: string): string {
	const normalized = String(path || "").replace(/\\/g, "/").replace(/\/+$/g, "");
	return normalized.split("/").filter(Boolean).pop() || normalized || "repo";
}

function pathDirname(path: string): string {
	const normalized = String(path || "").replace(/\\/g, "/").replace(/\/+$/g, "");
	const parts = normalized.split("/");
	parts.pop();
	const joined = parts.join("/");
	return joined || (normalized.startsWith("/") ? "/" : ".");
}

function joinPath(...parts: string[]): string {
	const filtered = parts.map((part) => String(part || "").replace(/\\/g, "/")).filter(Boolean);
	if (!filtered.length) return "";
	const absolute = filtered[0].startsWith("/");
	const joined = filtered.join("/").replace(/\/+/g, "/");
	return absolute && !joined.startsWith("/") ? `/${joined}` : joined;
}

function repoLabel(project: WikiProject): string {
	return safeSegment(project.config?.project_name || project.label || pathBasename(project.root), "repo");
}

function isSha(value: string | undefined): boolean {
	return Boolean(value && /^[0-9a-f]{7,64}$/i.test(value));
}

function scopeLabel(scope: ChangeClaimScope | undefined): string | undefined {
	return scope?.task_id || scope?.path || scope?.ref || scope?.description || scope?.layer;
}

export function createRoleWorktreePlan(project: WikiProject, input: RoleWorktreePlanInput): RoleWorktreePlan {
	const taskId = safeSegment(input.task_id || "TASK-unassigned", "TASK-unassigned");
	const role = input.role || DEFAULT_ROLE;
	const sessionId = safeSegment(input.session_id || "session", "session");
	const root = input.worktree_root || joinPath(pathDirname(project.root), ".codewiki-worktrees", repoLabel(project));
	const branch = input.branch || `codewiki/${taskId}/${role}/${sessionId}`;
	const worktreePath = input.worktree_path || joinPath(root, taskId, role, sessionId);
	const baseRef = input.base_sha || input.base_ref || "HEAD";
	const metadata: WorktreeIsolationMetadata = {
		worktree_path: worktreePath,
		branch,
		notes: `factory=role-worktree; task=${taskId}; role=${role}; base_ref=${baseRef}; prepare=git worktree add; verify=git status/rev-parse; cleanup=git worktree remove`,
	};
	if (isSha(input.base_sha)) metadata.base_sha = input.base_sha;
	return {
		task_id: taskId,
		role,
		session_id: sessionId,
		worktree_path: worktreePath,
		branch,
		base_ref: baseRef,
		...(metadata.base_sha ? { base_sha: metadata.base_sha } : {}),
		commands: {
			prepare: [`git worktree add -B ${branch} <worktree_path> ${baseRef}`],
			heartbeat: ["codewiki_artifact_status action=heartbeat recordId=<claim_id>"],
			verify: [
				"git -C <worktree_path> rev-parse HEAD",
				"git -C <worktree_path> rev-parse HEAD^{tree}",
				"git status --porcelain",
			],
			cleanup: [
				"git worktree prune",
				"git worktree remove <worktree_path>",
			],
		},
		metadata,
	};
}

export function ensureRoleWorktreeMetadata(
	project: WikiProject,
	input: {
		mode?: "read" | "write";
		role?: ChangeClaimRole;
		task_id?: string;
		session_id: string;
		worktree?: WorktreeIsolationMetadata;
	},
): WorktreeIsolationMetadata | undefined {
	if (input.mode === "read") return input.worktree;
	if (!input.role || !input.task_id) return input.worktree;
	const plan = createRoleWorktreePlan(project, {
		task_id: input.task_id,
		role: input.role,
		session_id: input.session_id,
		worktree_path: input.worktree?.worktree_path,
		branch: input.worktree?.branch,
		base_sha: input.worktree?.base_sha,
	});
	const explicit = input.worktree || {};
	return {
		...plan.metadata,
		...explicit,
		notes: unique([plan.metadata.notes, explicit.notes].filter(Boolean) as string[]).join("; "),
	};
}

export function nextSafeActionForBlocker(blocker: Omit<ArtifactBlocker, "next_safe_action">): string {
	const exactRef = blocker.branch || blocker.patch_ref || blocker.head_sha || blocker.published_sha || blocker.tree_sha || blocker.build_ref || blocker.claim_id;
	return `Wait for ${blocker.claim_id} release or validated publisher/patch ref for ${exactRef}; then re-read CodeWiki state and mark scopes before writing.`;
}

export function artifactBlockerFromClaim(claim: ChangeClaimRecord, scope?: ChangeClaimScope): ArtifactBlocker {
	const worktree = claim.worktree || {};
	const blocker = {
		claim_id: claim.id,
		session_id: claim.session_id,
		agent_name: claim.agent_name,
		role: claim.role,
		task_id: claim.task_id,
		build_ref: claim.build_ref,
		branch: worktree.branch,
		worktree_path: worktree.worktree_path,
		head_sha: worktree.head_sha,
		published_sha: worktree.published_sha,
		tree_sha: worktree.tree_sha,
		patch_ref: claim.build_ref || scope?.ref,
		scope: scopeLabel(scope),
		summary: claim.summary,
	};
	return {
		...blocker,
		next_safe_action: nextSafeActionForBlocker(blocker),
	};
}

export function summarizeArtifactBlockers(blockers: ArtifactBlocker[]): string {
	return blockers.map((blocker) => {
		const exact = blocker.branch || blocker.patch_ref || blocker.head_sha || blocker.published_sha || blocker.tree_sha || blocker.build_ref || blocker.worktree_path || blocker.claim_id;
		return `${blocker.claim_id}${blocker.role ? ` ${blocker.role}` : ""}${blocker.task_id ? ` ${blocker.task_id}` : ""} ${exact}`.trim();
	}).join("; ");
}

export function nextSafeActionForWaiter(waiter: Pick<ChangeClaimWaiterRecord, "id">, blockers: ArtifactBlocker[]): string {
	if (blockers.length > 0) return blockers[0].next_safe_action;
	return `Re-read CodeWiki state, inspect artifact status, then mark scopes before resuming ${waiter.id}.`;
}

export function publisherProofRefs(isolation: WorktreeIsolationMetadata | undefined): string[] {
	return unique([
		isolation?.published_sha,
		isolation?.tree_sha,
		isolation?.archive_ref,
		isolation?.remote_ref,
	].map((value) => String(value || "").trim()).filter(Boolean));
}

export function hasPublisherResultProof(isolation: WorktreeIsolationMetadata | undefined): boolean {
	return publisherProofRefs(isolation).length > 0;
}
