import type {
	ArtifactStatusHolder,
	ArtifactStatusRecord,
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
	const segment = String(value || "")
		.trim()
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return segment || fallback;
}

function pathBasename(path: string): string {
	const normalized = String(path || "")
		.replace(/\\/g, "/")
		.replace(/\/+$/g, "");
	return normalized.split("/").filter(Boolean).pop() || normalized || "repo";
}

function pathDirname(path: string): string {
	const normalized = String(path || "")
		.replace(/\\/g, "/")
		.replace(/\/+$/g, "");
	const parts = normalized.split("/");
	parts.pop();
	const joined = parts.join("/");
	return joined || (normalized.startsWith("/") ? "/" : ".");
}

function joinPath(...parts: string[]): string {
	const filtered = parts
		.map((part) => String(part || "").replace(/\\/g, "/"))
		.filter(Boolean);
	if (!filtered.length) return "";
	const absolute = filtered[0].startsWith("/");
	const joined = filtered.join("/").replace(/\/+/g, "/");
	return absolute && !joined.startsWith("/") ? `/${joined}` : joined;
}

function repoLabel(project: WikiProject): string {
	return safeSegment(
		project.config?.project_name || project.label || pathBasename(project.root),
		"repo",
	);
}

function isSha(value: string | undefined): boolean {
	return Boolean(value && /^[0-9a-f]{7,64}$/i.test(value));
}

function scopeLabel(scope: ChangeClaimScope | undefined): string | undefined {
	return (
		scope?.task_id ||
		scope?.path ||
		scope?.ref ||
		scope?.description ||
		scope?.layer
	);
}

export function createRoleWorktreePlan(
	project: WikiProject,
	input: RoleWorktreePlanInput,
): RoleWorktreePlan {
	const taskId = safeSegment(
		input.task_id || "TASK-unassigned",
		"TASK-unassigned",
	);
	const role = input.role || DEFAULT_ROLE;
	const sessionId = safeSegment(input.session_id || "session", "session");
	const root =
		input.worktree_root ||
		joinPath(
			pathDirname(project.root),
			".codewiki-worktrees",
			repoLabel(project),
		);
	const branch = input.branch || `codewiki/${taskId}/${role}/${sessionId}`;
	const worktreePath =
		input.worktree_path || joinPath(root, taskId, role, sessionId);
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
			heartbeat: [
				"codewiki_artifact_status action=heartbeat recordId=<claim_id>",
			],
			verify: [
				"git -C <worktree_path> rev-parse HEAD",
				"git -C <worktree_path> rev-parse HEAD^{tree}",
				"git status --porcelain",
			],
			cleanup: ["git worktree prune", "git worktree remove <worktree_path>"],
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
		notes: unique(
			[plan.metadata.notes, explicit.notes].filter(Boolean) as string[],
		).join("; "),
	};
}

export function nextSafeActionForBlocker(
	blocker: Omit<ArtifactBlocker, "next_safe_action">,
): string {
	const exactRef =
		blocker.branch ||
		blocker.patch_ref ||
		blocker.head_sha ||
		blocker.published_sha ||
		blocker.tree_sha ||
		blocker.build_ref ||
		blocker.claim_id;
	return `Wait for ${blocker.claim_id} release or validated publisher/patch ref for ${exactRef}; then re-read CodeWiki state and mark scopes before writing.`;
}

export function artifactBlockerFromClaim(
	claim: ChangeClaimRecord,
	scope?: ChangeClaimScope,
): ArtifactBlocker {
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
	return blockers
		.map((blocker) => {
			const exact =
				blocker.branch ||
				blocker.patch_ref ||
				blocker.head_sha ||
				blocker.published_sha ||
				blocker.tree_sha ||
				blocker.build_ref ||
				blocker.worktree_path ||
				blocker.claim_id;
			return `${blocker.claim_id}${blocker.role ? ` ${blocker.role}` : ""}${blocker.task_id ? ` ${blocker.task_id}` : ""} ${exact}`.trim();
		})
		.join("; ");
}

export function nextSafeActionForWaiter(
	waiter: Pick<ChangeClaimWaiterRecord, "id">,
	blockers: ArtifactBlocker[],
): string {
	if (blockers.length > 0) return blockers[0].next_safe_action;
	return `Re-read CodeWiki state, inspect artifact status, then mark scopes before resuming ${waiter.id}.`;
}

export interface SchedulerTaskInput {
	task_id: string;
	title?: string;
	sprint_id?: string;
	sprint_ids?: string[];
	code_paths?: string[];
	spec_paths?: string[];
	scopes?: ChangeClaimScope[];
	validation_refs?: string[];
	source_refs?: string[];
}

export interface ParallelSchedulerPlanInput {
	tasks: SchedulerTaskInput[];
	artifact_statuses?: ArtifactStatusRecord[];
	max_sessions?: number;
	session_id_prefix?: string;
	base_sha?: string;
	require_claims?: boolean;
	publisher_validation_refs?: string[];
	publisher_source_refs?: string[];
}

export interface PublisherQueuePlan {
	status: "waiting_validation" | "ready" | "blocked";
	serialization_key: string;
	max_active: number;
	active_publishers: string[];
	inputs: {
		task_ids: string[];
		source_refs: string[];
		validation_refs: string[];
	};
	claim: {
		role: "publisher";
		mode: "write";
		scopes: ChangeClaimScope[];
		ttl_minutes: number;
		heartbeat: string;
		release: string;
	};
	required_steps: string[];
	result: {
		required_proof: string[];
	};
}

export interface ParallelSchedulerPlan {
	status: "ready" | "partial" | "blocked";
	max_sessions: number;
	require_claims: boolean;
	allocations: Array<{
		partition_id: string;
		task_id: string;
		task_ids: string[];
		sprint_ids: string[];
		status: "ready";
		scopes: ChangeClaimScope[];
		roles: {
			builder: RoleWorktreePlan;
			validator: RoleWorktreePlan;
		};
		claim: {
			role: "builder";
			mode: "write";
			scopes: ChangeClaimScope[];
			ttl_minutes: number;
			heartbeat: string;
			release: string;
		};
	}>;
	blocked: Array<{
		task_id: string;
		task_ids: string[];
		reason: "artifact_claim" | "partition_conflict" | "max_sessions";
		blocked_by_task_ids: string[];
		blockers: ArtifactBlocker[];
		scopes: ChangeClaimScope[];
		wait: {
			action: "wait";
			role: "builder";
			mode: "write";
			task_id: string;
			scopes: ChangeClaimScope[];
		};
	}>;
	wait_queue: {
		pending_waiter_ids: string[];
		ready_waiter_ids: string[];
		blocked_task_ids: string[];
		next_safe_actions: string[];
	};
	publisher_queue: PublisherQueuePlan;
}

export function declaredWriteScopesForTask(
	task: SchedulerTaskInput,
): ChangeClaimScope[] {
	const taskId = String(task.task_id || "").trim();
	const explicit = Array.isArray(task.scopes) ? task.scopes : [];
	const generated: ChangeClaimScope[] = [];
	if (taskId) generated.push({ layer: "roadmap", task_id: taskId });
	for (const path of unique((task.code_paths || []).map(normalizeScopePath))) {
		if (!path) continue;
		generated.push(scopeForPath(path));
	}
	return dedupeScopes([...explicit, ...generated]);
}

export function computeParallelSchedulerPlan(
	project: WikiProject,
	input: ParallelSchedulerPlanInput,
): ParallelSchedulerPlan {
	const maxSessions = Math.max(1, Number(input.max_sessions || 1));
	const requireClaims = input.require_claims !== false;
	const allocations: ParallelSchedulerPlan["allocations"] = [];
	const blocked: ParallelSchedulerPlan["blocked"] = [];
	const allocated = new Map<
		string,
		{ task: SchedulerTaskInput; scopes: ChangeClaimScope[] }
	>();
	const statuses = Array.isArray(input.artifact_statuses)
		? input.artifact_statuses
		: [];
	for (const task of input.tasks) {
		const taskId = String(task.task_id || "").trim();
		if (!taskId) continue;
		const scopes = declaredWriteScopesForTask(task);
		const artifactBlockers = artifactBlockersForScopes(scopes, statuses);
		const partitionBlockers = [...allocated.values()].filter((entry) =>
			scopesConflict(scopes, entry.scopes),
		);
		if (artifactBlockers.length > 0) {
			blocked.push(
				blockedSchedulerTask(
					taskId,
					scopes,
					"artifact_claim",
					[],
					artifactBlockers,
				),
			);
			continue;
		}
		if (partitionBlockers.length > 0) {
			blocked.push(
				blockedSchedulerTask(
					taskId,
					scopes,
					"partition_conflict",
					partitionBlockers.map((entry) => entry.task.task_id),
					[],
				),
			);
			continue;
		}
		if (allocations.length >= maxSessions) {
			blocked.push(
				blockedSchedulerTask(taskId, scopes, "max_sessions", [], []),
			);
			continue;
		}
		const sessionId = safeSegment(
			`${input.session_id_prefix || "scheduler"}-${taskId}`,
			"scheduler",
		);
		const builder = createRoleWorktreePlan(project, {
			task_id: taskId,
			role: "builder",
			session_id: sessionId,
			base_sha: input.base_sha,
		});
		const validator = createRoleWorktreePlan(project, {
			task_id: taskId,
			role: "validator",
			session_id: `${sessionId}-validator`,
			base_sha: input.base_sha,
		});
		allocated.set(taskId, { task, scopes });
		allocations.push({
			partition_id: `partition-${allocations.length + 1}`,
			task_id: taskId,
			task_ids: [taskId],
			sprint_ids: sprintIdsForTask(task),
			status: "ready",
			scopes,
			roles: { builder, validator },
			claim: {
				role: "builder",
				mode: "write",
				scopes,
				ttl_minutes: 120,
				heartbeat:
					"codewiki_artifact_status action=heartbeat recordId=<claim_id>",
				release: "codewiki_artifact_status action=release recordId=<claim_id>",
			},
		});
	}
	const taskIds = input.tasks.map((task) => task.task_id).filter(Boolean);
	const publisherQueue = createPublisherQueuePlan({
		task_ids: taskIds,
		source_refs:
			input.publisher_source_refs ||
			input.tasks.flatMap((task) => task.source_refs || []),
		validation_refs:
			input.publisher_validation_refs ||
			input.tasks.flatMap((task) => task.validation_refs || []),
		artifact_statuses: statuses,
	});
	const pendingWaiterIds = unique(
		statuses.flatMap((status) =>
			status.waiters
				.filter(
					(waiter) => waiter.blockers?.length || status.status === "conflict",
				)
				.map((waiter) => waiter.record_id),
		),
	);
	const readyWaiterIds = unique(
		statuses.flatMap((status) =>
			status.waiters
				.filter(
					(waiter) => !waiter.blockers?.length && status.status !== "conflict",
				)
				.map((waiter) => waiter.record_id),
		),
	);
	const status: ParallelSchedulerPlan["status"] =
		allocations.length === 0 && blocked.length > 0
			? "blocked"
			: blocked.length > 0 || publisherQueue.status === "blocked"
				? "partial"
				: "ready";
	return {
		status,
		max_sessions: maxSessions,
		require_claims: requireClaims,
		allocations,
		blocked,
		wait_queue: {
			pending_waiter_ids: pendingWaiterIds,
			ready_waiter_ids: readyWaiterIds,
			blocked_task_ids: blocked.map((item) => item.task_id),
			next_safe_actions: unique([
				...blocked.flatMap((item) =>
					item.blockers.map((blocker) => blocker.next_safe_action),
				),
				...statuses.flatMap((status) => [
					status.next_safe_action || "",
					...(status.waiters || []).map(
						(waiter) => waiter.next_safe_action || "",
					),
				]),
			]),
		},
		publisher_queue: publisherQueue,
	};
}

export function createPublisherQueuePlan(input: {
	task_ids: string[];
	source_refs?: string[];
	validation_refs?: string[];
	artifact_statuses?: ArtifactStatusRecord[];
}): PublisherQueuePlan {
	const scopes = publisherQueueScopes();
	const activePublishers = unique(
		(input.artifact_statuses || [])
			.filter(
				(status) =>
					status.holders.some((holder) => holder.role === "publisher") &&
					scopesConflict([status.artifact], scopes),
			)
			.flatMap((status) =>
				status.holders
					.filter((holder) => holder.role === "publisher")
					.map((holder) => holder.record_id),
			),
	);
	const validationRefs = unique(
		(input.validation_refs || []).map((value) => String(value || "").trim()),
	);
	return {
		status:
			activePublishers.length > 0
				? "blocked"
				: validationRefs.length > 0
					? "ready"
					: "waiting_validation",
		serialization_key: "publisher:global",
		max_active: 1,
		active_publishers: activePublishers,
		inputs: {
			task_ids: unique(
				input.task_ids.map((value) => String(value || "").trim()),
			),
			source_refs: unique(
				(input.source_refs || []).map((value) => String(value || "").trim()),
			),
			validation_refs: validationRefs,
		},
		claim: {
			role: "publisher",
			mode: "write",
			scopes,
			ttl_minutes: 120,
			heartbeat:
				"codewiki_artifact_status action=heartbeat recordId=<claim_id>",
			release: "codewiki_artifact_status action=release recordId=<claim_id>",
		},
		required_steps: [
			"consume immutable builder refs and fresh validation refs",
			"serialize merge/apply through publisher claim publisher:global",
			"refresh generated CodeWiki state",
			"run task-close/publication readiness preflight",
			"create final clean commit/tree or archive/ref proof",
			"record published_sha/tree_sha/archive_ref/remote_ref result",
		],
		result: {
			required_proof: [
				"clean=true",
				"published_sha",
				"tree_sha",
				"archive_ref or remote_ref",
			],
		},
	};
}

function blockedSchedulerTask(
	taskId: string,
	scopes: ChangeClaimScope[],
	reason: "artifact_claim" | "partition_conflict" | "max_sessions",
	blockedByTaskIds: string[],
	blockers: ArtifactBlocker[],
): ParallelSchedulerPlan["blocked"][number] {
	return {
		task_id: taskId,
		task_ids: [taskId],
		reason,
		blocked_by_task_ids: unique(blockedByTaskIds),
		blockers,
		scopes,
		wait: {
			action: "wait",
			role: "builder",
			mode: "write",
			task_id: taskId,
			scopes,
		},
	};
}

function publisherQueueScopes(): ChangeClaimScope[] {
	return [
		{ layer: "roadmap", description: "publisher-queue" },
		{ layer: "graph", path: ".codewiki/index_graph.json" },
		{ layer: "validation", path: ".codewiki/validation/**" },
	];
}

function scopeForPath(path: string): ChangeClaimScope {
	if (path.startsWith(".codewiki/kb/")) return { layer: "knowledge", path };
	if (path.startsWith(".codewiki/roadmap/")) return { layer: "roadmap", path };
	if (path.startsWith(".codewiki/builds/")) return { layer: "build", path };
	if (path.startsWith(".codewiki/validation/"))
		return { layer: "validation", path };
	if (path === ".codewiki/index_graph.json") return { layer: "graph", path };
	return { layer: "source", path };
}

function normalizeScopePath(value: string): string {
	return String(value || "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\.\//, "");
}

function dedupeScopes(scopes: ChangeClaimScope[]): ChangeClaimScope[] {
	const seen = new Set<string>();
	const result: ChangeClaimScope[] = [];
	for (const scope of scopes) {
		const key = [
			canonicalLayer(scope.layer),
			scope.task_id || "",
			normalizeScopePath(scope.path || ""),
			scope.ref || "",
			scope.description || "",
		].join(":");
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(scope);
	}
	return result;
}

function sprintIdsForTask(task: SchedulerTaskInput): string[] {
	return unique(
		[task.sprint_id || "", ...(task.sprint_ids || [])].map((value) =>
			String(value || "").trim(),
		),
	);
}

function artifactBlockersForScopes(
	scopes: ChangeClaimScope[],
	statuses: ArtifactStatusRecord[],
): ArtifactBlocker[] {
	const blockers: ArtifactBlocker[] = [];
	for (const status of statuses) {
		if (!scopes.some((scope) => schedulerScopesOverlap(scope, status.artifact)))
			continue;
		const holders = status.holders.filter((holder) => holder.mode === "write");
		if (!["conflict", "in-use"].includes(status.status) || holders.length === 0)
			continue;
		blockers.push(
			...holders.map((holder) =>
				artifactBlockerFromHolder(holder, status.artifact),
			),
		);
	}
	return uniqueArtifactBlockers(blockers);
}

function artifactBlockerFromHolder(
	holder: ArtifactStatusHolder,
	scope: ChangeClaimScope,
): ArtifactBlocker {
	const worktree = holder.worktree || {};
	const blocker = {
		claim_id: holder.record_id,
		session_id: holder.session_id,
		agent_name: holder.agent_name,
		role: holder.role,
		task_id: holder.task_id,
		build_ref: holder.build_ref,
		branch: worktree.branch,
		worktree_path: worktree.worktree_path,
		head_sha: worktree.head_sha,
		published_sha: worktree.published_sha,
		tree_sha: worktree.tree_sha,
		patch_ref: holder.build_ref || scope.ref,
		scope: scopeLabel(scope),
		summary: holder.summary,
	};
	return {
		...blocker,
		next_safe_action: nextSafeActionForBlocker(blocker),
	};
}

function uniqueArtifactBlockers(
	blockers: ArtifactBlocker[],
): ArtifactBlocker[] {
	const seen = new Set<string>();
	const result: ArtifactBlocker[] = [];
	for (const blocker of blockers) {
		const key = [
			blocker.claim_id,
			blocker.scope || "",
			blocker.branch || blocker.patch_ref || blocker.head_sha || "",
		].join("|");
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(blocker);
	}
	return result.sort((a, b) => a.claim_id.localeCompare(b.claim_id));
}

function scopesConflict(
	left: ChangeClaimScope[],
	right: ChangeClaimScope[],
): boolean {
	return left.some((leftScope) =>
		right.some((rightScope) => schedulerScopesOverlap(leftScope, rightScope)),
	);
}

function schedulerScopesOverlap(
	left: ChangeClaimScope,
	right: ChangeClaimScope,
): boolean {
	if (left.task_id || right.task_id)
		return Boolean(
			left.task_id && right.task_id && left.task_id === right.task_id,
		);
	if (left.ref || right.ref)
		return Boolean(left.ref && right.ref && left.ref === right.ref);
	if (left.path || right.path) {
		if (canonicalLayer(left.layer) !== canonicalLayer(right.layer))
			return false;
		return pathsOverlapForScheduler(left.path || "", right.path || "");
	}
	return Boolean(
		left.description &&
			right.description &&
			left.description === right.description &&
			canonicalLayer(left.layer) === canonicalLayer(right.layer),
	);
}

function canonicalLayer(layer: string): string {
	return layer === "code" ? "source" : layer;
}

function pathsOverlapForScheduler(
	leftPath: string,
	rightPath: string,
): boolean {
	const left = pathBaseForScheduler(leftPath);
	const right = pathBaseForScheduler(rightPath);
	if (!left.base || !right.base) return false;
	if (left.base === right.base) return true;
	if (
		left.glob &&
		(right.base === left.base || right.base.startsWith(`${left.base}/`))
	)
		return true;
	if (
		right.glob &&
		(left.base === right.base || left.base.startsWith(`${right.base}/`))
	)
		return true;
	return false;
}

function pathBaseForScheduler(path: string): { base: string; glob: boolean } {
	const normalized = normalizeScopePath(path).replace(/\/$/, "");
	if (normalized.endsWith("/**"))
		return { base: normalized.slice(0, -3).replace(/\/$/, ""), glob: true };
	if (normalized.endsWith("/*"))
		return { base: normalized.slice(0, -2).replace(/\/$/, ""), glob: true };
	return { base: normalized, glob: false };
}

export function publisherProofRefs(
	isolation: WorktreeIsolationMetadata | undefined,
): string[] {
	return unique(
		[
			isolation?.published_sha,
			isolation?.tree_sha,
			isolation?.archive_ref,
			isolation?.remote_ref,
		]
			.map((value) => String(value || "").trim())
			.filter(Boolean),
	);
}

export function hasPublisherResultProof(
	isolation: WorktreeIsolationMetadata | undefined,
): boolean {
	return publisherProofRefs(isolation).length > 0;
}
