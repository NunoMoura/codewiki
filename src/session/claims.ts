import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { WikiProject } from "../project/types.ts";
import type {
	ArtifactStatusHolder,
	ArtifactStatusRecord,
	CodewikiArtifactStatusToolInput,
	ChangeClaimConflict,
	ChangeClaimMode,
	ChangeClaimRecord,
	ChangeClaimRole,
	ChangeClaimScope,
	ChangeClaimWaiterRecord,
	WorktreeIsolationMetadata,
	ChangeClaimState,
	ChangeClaimsFile,
	ChangeClaimMutationInput,
} from "./types.ts";
import { nowIso, unique } from "../shared/utils.ts";
import { withLockedPaths } from "../shared/lock.ts";
import {
	artifactBlockerFromClaim,
	ensureRoleWorktreeMetadata,
	nextSafeActionForWaiter,
	summarizeArtifactBlockers,
	type ArtifactBlocker,
} from "./worktree-isolation.ts";

const DEFAULT_TTL_MINUTES = 120;
const MAX_TTL_MINUTES = 24 * 60;
const EMPTY_CLAIMS_FILE: ChangeClaimsFile = {
	version: 1,
	updated_at: "",
	next_sequence: 1,
	next_wait_sequence: 1,
	claims: [],
	waiters: [],
};

export function claimsFilePath(project: WikiProject): string {
	return resolve(project.root, `${project.metaRoot}/session/queue.json`);
}

function cloneEmptyClaimsFile(): ChangeClaimsFile {
	return { ...EMPTY_CLAIMS_FILE, claims: [] };
}

export async function readChangeClaimsFile(project: WikiProject): Promise<ChangeClaimsFile> {
	try {
		const raw = await readFile(claimsFilePath(project), "utf8");
		return normalizeClaimsFile(JSON.parse(raw));
	} catch (error: any) {
		if (error?.code === "ENOENT") return cloneEmptyClaimsFile();
		throw error;
	}
}

export function normalizeClaimsFile(value: any): ChangeClaimsFile {
	const file = cloneEmptyClaimsFile();
	file.version = Number.isFinite(Number(value?.version)) ? Number(value.version) : 1;
	file.updated_at = typeof value?.updated_at === "string" ? value.updated_at : "";
	file.next_sequence = Number.isFinite(Number(value?.next_sequence))
		? Math.max(1, Math.floor(Number(value.next_sequence)))
		: 1;
	file.next_wait_sequence = Number.isFinite(Number(value?.next_wait_sequence))
		? Math.max(1, Math.floor(Number(value.next_wait_sequence)))
		: 1;
	file.claims = Array.isArray(value?.claims)
		? value.claims.map(normalizeClaimRecord).filter(Boolean) as ChangeClaimRecord[]
		: [];
	file.waiters = Array.isArray(value?.waiters)
		? value.waiters.map(normalizeClaimWaiterRecord).filter(Boolean) as ChangeClaimWaiterRecord[]
		: [];
	const maxSequence = file.claims
		.map((claim) => parseClaimSequence(claim.id))
		.filter((seq): seq is number => seq !== null)
		.reduce((max, seq) => Math.max(max, seq), 0);
	const maxWaitSequence = file.waiters
		.map((waiter) => parseWaitSequence(waiter.id))
		.filter((seq): seq is number => seq !== null)
		.reduce((max, seq) => Math.max(max, seq), 0);
	file.next_sequence = Math.max(file.next_sequence, maxSequence + 1);
	file.next_wait_sequence = Math.max(file.next_wait_sequence || 1, maxWaitSequence + 1);
	return file;
}

function normalizeClaimRecord(value: any): ChangeClaimRecord | null {
	const id = String(value?.id || "").trim();
	const sessionId = String(value?.session_id || "").trim();
	if (!id || !sessionId) return null;
	const mode = normalizeClaimMode(value?.mode);
	const status = ["active", "released", "expired"].includes(String(value?.status || ""))
		? String(value.status) as ChangeClaimRecord["status"]
		: "active";
	return {
		id,
		session_id: sessionId,
		agent_name: String(value?.agent_name || "Agent").trim() || "Agent",
		status,
		mode,
		role: normalizeClaimRole(value?.role),
		summary: String(value?.summary || "").trim(),
		task_id: optionalTrim(value?.task_id),
		build_ref: optionalTrim(value?.build_ref),
		worktree: normalizeWorktreeIsolation(value?.worktree),
		scopes: normalizeScopes(value?.scopes),
		created_at: String(value?.created_at || value?.updated_at || nowIso()).trim(),
		updated_at: String(value?.updated_at || value?.created_at || nowIso()).trim(),
		expires_at: String(value?.expires_at || nowIso()).trim(),
		released_at: optionalTrim(value?.released_at),
	};
}

function normalizeClaimWaiterRecord(value: any): ChangeClaimWaiterRecord | null {
	const id = String(value?.id || "").trim();
	const sessionId = String(value?.session_id || "").trim();
	if (!id || !sessionId) return null;
	const status = ["pending", "ready", "cancelled", "expired"].includes(String(value?.status || ""))
		? String(value.status) as ChangeClaimWaiterRecord["status"]
		: "pending";
	const blockedBy = Array.isArray(value?.blocked_by_claim_ids)
		? value.blocked_by_claim_ids.map(optionalTrim).filter(Boolean) as string[]
		: [];
	const blockers = normalizeArtifactBlockers(value?.blockers);
	return {
		id,
		session_id: sessionId,
		agent_name: String(value?.agent_name || "Agent").trim() || "Agent",
		status,
		mode: normalizeClaimMode(value?.mode),
		role: normalizeClaimRole(value?.role),
		summary: String(value?.summary || "").trim(),
		task_id: optionalTrim(value?.task_id),
		build_ref: optionalTrim(value?.build_ref),
		worktree: normalizeWorktreeIsolation(value?.worktree),
		scopes: normalizeScopes(value?.scopes),
		blocked_by_claim_ids: Array.from(new Set(blockedBy)),
		blockers,
		blocker_summary: optionalTrim(value?.blocker_summary || value?.blockerSummary),
		next_safe_action: optionalTrim(value?.next_safe_action || value?.nextSafeAction),
		created_at: String(value?.created_at || value?.updated_at || nowIso()).trim(),
		updated_at: String(value?.updated_at || value?.created_at || nowIso()).trim(),
		expires_at: String(value?.expires_at || nowIso()).trim(),
		ready_at: optionalTrim(value?.ready_at),
		cancelled_at: optionalTrim(value?.cancelled_at),
	};
}

function normalizeArtifactBlockers(value: unknown): ArtifactBlocker[] {
	if (!Array.isArray(value)) return [];
	return value.map((raw: any) => {
		const claimId = optionalTrim(raw?.claim_id || raw?.claimId);
		const sessionId = optionalTrim(raw?.session_id || raw?.sessionId);
		const nextSafeAction = optionalTrim(raw?.next_safe_action || raw?.nextSafeAction);
		if (!claimId || !sessionId || !nextSafeAction) return null;
		return {
			claim_id: claimId,
			session_id: sessionId,
			agent_name: optionalTrim(raw?.agent_name || raw?.agentName),
			role: normalizeClaimRole(raw?.role),
			task_id: optionalTrim(raw?.task_id || raw?.taskId),
			build_ref: optionalTrim(raw?.build_ref || raw?.buildRef),
			branch: optionalTrim(raw?.branch),
			worktree_path: optionalTrim(raw?.worktree_path || raw?.worktreePath),
			head_sha: optionalTrim(raw?.head_sha || raw?.headSha),
			published_sha: optionalTrim(raw?.published_sha || raw?.publishedSha),
			tree_sha: optionalTrim(raw?.tree_sha || raw?.treeSha),
			patch_ref: optionalTrim(raw?.patch_ref || raw?.patchRef),
			scope: optionalTrim(raw?.scope),
			summary: optionalTrim(raw?.summary),
			next_safe_action: nextSafeAction,
		};
	}).filter(Boolean) as ArtifactBlocker[];
}

function optionalTrim(value: unknown): string | undefined {
	const text = String(value ?? "").trim();
	return text || undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function normalizeClaimRole(value: unknown): ChangeClaimRole | undefined {
	const role = String(value ?? "").trim() as ChangeClaimRole;
	return ["builder", "validator", "publisher", "observer"].includes(role) ? role : undefined;
}

function normalizeSha(value: unknown): string | undefined {
	const text = optionalTrim(value);
	if (!text) return undefined;
	return /^[0-9a-f]{7,64}$/i.test(text) ? text : undefined;
}

export function normalizeWorktreeIsolation(value: any): WorktreeIsolationMetadata | undefined {
	if (!value || typeof value !== "object") return undefined;
	const out: WorktreeIsolationMetadata = {};
	const worktreePath = optionalTrim(value.worktree_path || value.worktreePath);
	const branch = optionalTrim(value.branch);
	const notes = optionalTrim(value.notes);
	const sessionId = optionalTrim(value.session_id || value.sessionId);
	const claimId = optionalTrim(value.claim_id || value.claimId);
	const builderSessionId = optionalTrim(value.builder_session_id || value.builderSessionId);
	const builderClaimId = optionalTrim(value.builder_claim_id || value.builderClaimId);
	const relatedClaimIds = Array.isArray(value.related_claim_ids || value.relatedClaimIds)
		? (value.related_claim_ids || value.relatedClaimIds).map(optionalTrim).filter(Boolean) as string[]
		: [];
	if (worktreePath) out.worktree_path = worktreePath;
	if (branch) out.branch = branch;
	for (const key of ["base_sha", "head_sha", "validated_sha", "published_sha", "tree_sha"] as const) {
		const camelKey = key.replace(/_([a-z])/g, (_match: string, c: string) => c.toUpperCase());
		const sha = normalizeSha(value[key] || value[camelKey]);
		if (sha) out[key] = sha;
	}
	for (const key of ["working_tree_digest", "worktree_digest", "package_digest", "archive_ref", "remote_ref"] as const) {
		const camelKey = key.replace(/_([a-z])/g, (_match: string, c: string) => c.toUpperCase());
		const normalized = optionalTrim(value[key] || value[camelKey]);
		if (normalized) out[key] = normalized;
	}
	const clean = optionalBoolean(value.clean);
	const freshContext = optionalBoolean(value.fresh_context ?? value.freshContext);
	if (clean !== undefined) out.clean = clean;
	if (freshContext !== undefined) out.fresh_context = freshContext;
	if (sessionId) out.session_id = sessionId;
	if (claimId) out.claim_id = claimId;
	if (builderSessionId) out.builder_session_id = builderSessionId;
	if (builderClaimId) out.builder_claim_id = builderClaimId;
	if (relatedClaimIds.length) out.related_claim_ids = Array.from(new Set(relatedClaimIds));
	if (notes) out.notes = notes;
	return Object.keys(out).length ? out : undefined;
}

export function normalizeScopes(scopes: unknown): ChangeClaimScope[] {
	if (!Array.isArray(scopes)) return [];
	const serialized = new Set<string>();
	const result: ChangeClaimScope[] = [];
	for (const raw of scopes) {
		const scope = normalizeScope(raw);
		if (!scope) continue;
		const key = scopeKey(scope);
		if (serialized.has(key)) continue;
		serialized.add(key);
		result.push(scope);
	}
	return result;
}

export function normalizeScope(raw: any): ChangeClaimScope | null {
	const layer = String(raw?.layer || "").trim() as ChangeClaimScope["layer"];
	if (!["knowledge", "roadmap", "code", "build", "validation", "graph", "source"].includes(layer)) return null;
	const scope: ChangeClaimScope = { layer };
	const path = normalizePathLike(raw?.path);
	const taskId = optionalTrim(raw?.task_id || raw?.taskId);
	const ref = optionalTrim(raw?.ref);
	const description = optionalTrim(raw?.description);
	if (path) scope.path = path;
	if (taskId) scope.task_id = taskId;
	if (ref) scope.ref = ref;
	if (description) scope.description = description;
	if (!scope.path && !scope.task_id && !scope.ref && !scope.description) return null;
	return scope;
}

function normalizePathLike(value: unknown): string {
	return String(value ?? "")
		.trim()
		.replace(/^\.\//, "")
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/");
}

function normalizeClaimMode(value: unknown): ChangeClaimMode {
	return String(value || "write").trim() === "read" ? "read" : "write";
}

function parseClaimSequence(id: string): number | null {
	const match = /^CLAIM-(\d+)$/.exec(String(id || "").trim());
	return match ? Number(match[1]) : null;
}

function parseWaitSequence(id: string): number | null {
	const match = /^WAIT-(\d+)$/.exec(String(id || "").trim());
	return match ? Number(match[1]) : null;
}

function formatClaimId(sequence: number): string {
	return `CLAIM-${String(sequence).padStart(3, "0")}`;
}

function formatWaitId(sequence: number): string {
	return `WAIT-${String(sequence).padStart(3, "0")}`;
}

export function isClaimActive(claim: ChangeClaimRecord, now = new Date()): boolean {
	if (claim.status !== "active") return false;
	const expires = Date.parse(claim.expires_at);
	return Number.isFinite(expires) && expires > now.getTime();
}

export function activeChangeClaims(file: ChangeClaimsFile, now = new Date()): ChangeClaimRecord[] {
	return file.claims.filter((claim) => isClaimActive(claim, now));
}

export function isClaimWaiterActive(waiter: ChangeClaimWaiterRecord, now = new Date()): boolean {
	if (!["pending", "ready"].includes(waiter.status)) return false;
	const expires = Date.parse(waiter.expires_at);
	return Number.isFinite(expires) && expires > now.getTime();
}

export function activeClaimWaiters(file: ChangeClaimsFile, now = new Date()): ChangeClaimWaiterRecord[] {
	return (file.waiters || []).filter((waiter) => isClaimWaiterActive(waiter, now));
}

export function readyWaitersForSession(
	file: ChangeClaimsFile,
	sessionId: string,
	notifiedWaiterIds: Set<string> | string[] = new Set(),
	now = new Date(),
): ChangeClaimWaiterRecord[] {
	const notified = notifiedWaiterIds instanceof Set ? notifiedWaiterIds : new Set(notifiedWaiterIds);
	return buildChangeClaimState(file, now).waiters.filter((waiter) =>
		waiter.session_id === sessionId && waiter.status === "ready" && !notified.has(waiter.id),
	);
}

export function buildChangeClaimState(file: ChangeClaimsFile, now = new Date()): ChangeClaimState {
	const claims = activeChangeClaims(file, now).sort((a, b) => {
		const t = String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
		return t !== 0 ? t : a.id.localeCompare(b.id);
	});
	const waiters = activeClaimWaiters(file, now)
		.map((waiter) => computedWaiterState(waiter, claims))
		.sort((a, b) => {
			const rank = waiterStatusRank(a.status) - waiterStatusRank(b.status);
			if (rank !== 0) return rank;
			const t = String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
			return t !== 0 ? t : a.id.localeCompare(b.id);
		});
	const conflicts = detectClaimConflicts(claims);
	const state = {
		generated_at: nowIso(),
		active_claim_count: claims.length,
		warning_count: conflicts.filter((conflict) => conflict.kind === "warning").length,
		conflict_count: conflicts.filter((conflict) => conflict.kind === "conflict").length,
		pending_waiter_count: waiters.filter((waiter) => waiter.status === "pending").length,
		ready_waiter_count: waiters.filter((waiter) => waiter.status === "ready").length,
		claims,
		conflicts,
		waiters,
	};
	return {
		...state,
		artifact_statuses: buildArtifactStatusRecords(state),
	};
}

function waiterStatusRank(status: ChangeClaimWaiterRecord["status"]): number {
	return status === "ready" ? 0 : status === "pending" ? 1 : 2;
}

function uniqueBlockers(blockers: ArtifactBlocker[]): ArtifactBlocker[] {
	const byKey = new Map<string, ArtifactBlocker>();
	for (const blocker of blockers) {
		const key = [blocker.claim_id, blocker.scope || "", blocker.branch || blocker.patch_ref || blocker.head_sha || ""].join("|");
		if (!byKey.has(key)) byKey.set(key, blocker);
	}
	return [...byKey.values()].sort((a, b) => a.claim_id.localeCompare(b.claim_id));
}

function holderFromClaim(claim: ChangeClaimRecord): ArtifactStatusHolder {
	const blocker = artifactBlockerFromClaim(claim);
	return {
		record_id: claim.id,
		session_id: claim.session_id,
		agent_name: claim.agent_name,
		mode: claim.mode,
		...(claim.role ? { role: claim.role } : {}),
		...(claim.task_id ? { task_id: claim.task_id } : {}),
		...(claim.build_ref ? { build_ref: claim.build_ref } : {}),
		...(claim.summary ? { summary: claim.summary } : {}),
		...(claim.expires_at ? { expires_at: claim.expires_at } : {}),
		...(claim.worktree ? { worktree: claim.worktree } : {}),
		next_safe_action: blocker.next_safe_action,
	};
}

function holderFromWaiter(waiter: ChangeClaimWaiterRecord): ArtifactStatusHolder {
	return {
		record_id: waiter.id,
		session_id: waiter.session_id,
		agent_name: waiter.agent_name,
		mode: waiter.mode,
		...(waiter.role ? { role: waiter.role } : {}),
		...(waiter.task_id ? { task_id: waiter.task_id } : {}),
		...(waiter.build_ref ? { build_ref: waiter.build_ref } : {}),
		...(waiter.summary ? { summary: waiter.summary } : {}),
		...(waiter.expires_at ? { expires_at: waiter.expires_at } : {}),
		...(waiter.worktree ? { worktree: waiter.worktree } : {}),
		...(waiter.blockers ? { blockers: waiter.blockers } : {}),
		...(waiter.blocker_summary ? { blocker_summary: waiter.blocker_summary } : {}),
		...(waiter.next_safe_action ? { next_safe_action: waiter.next_safe_action } : {}),
	};
}

export function artifactScopeLabel(scope: ChangeClaimScope): string {
	return scope.task_id || scope.path || scope.ref || scope.description || scope.layer;
}

export function buildArtifactStatusRecords(state: Pick<ChangeClaimState, "claims" | "waiters" | "conflicts">): ArtifactStatusRecord[] {
	const records = new Map<string, ArtifactStatusRecord>();
	function ensure(scope: ChangeClaimScope): ArtifactStatusRecord {
		const key = scopeKey(scope);
		const existing = records.get(key);
		if (existing) return existing;
		const record: ArtifactStatusRecord = {
			artifact: scope,
			status: "available",
			holders: [],
			waiters: [],
			conflict_ids: [],
		};
		records.set(key, record);
		return record;
	}
	for (const claim of state.claims) {
		for (const scope of claim.scopes) {
			const record = ensure(scope);
			record.holders.push(holderFromClaim(claim));
			if (record.status === "available") record.status = "in-use";
		}
	}
	for (const waiter of state.waiters) {
		for (const scope of waiter.scopes) {
			const record = ensure(scope);
			record.waiters.push(holderFromWaiter(waiter));
			if (record.status === "available") record.status = "waiting";
			if (waiter.next_safe_action && !record.next_safe_action) record.next_safe_action = waiter.next_safe_action;
			if (waiter.blockers?.length) record.blockers = uniqueBlockers([...(record.blockers || []), ...waiter.blockers]);
		}
	}
	for (const conflict of state.conflicts) {
		const record = ensure(conflict.scope);
		record.status = conflict.kind === "conflict" ? "conflict" : record.status === "conflict" ? "conflict" : "in-use";
		record.conflict_ids.push(...conflict.claim_ids);
		const blockers = state.claims
			.filter((claim) => conflict.claim_ids.includes(claim.id))
			.map((claim) => artifactBlockerFromClaim(claim, conflict.scope));
		record.blockers = uniqueBlockers([...(record.blockers || []), ...blockers]);
		record.reason = record.blockers.length > 0
			? `${conflict.reason} Blockers: ${summarizeArtifactBlockers(record.blockers)}.`
			: conflict.reason;
		record.next_safe_action = record.blockers[0]?.next_safe_action || record.next_safe_action;
	}
	return [...records.values()].map((record) => ({
		...record,
		conflict_ids: unique(record.conflict_ids).sort(),
	})).sort((a, b) => artifactScopeLabel(a.artifact).localeCompare(artifactScopeLabel(b.artifact)));
}

export function artifactStatusesForScopes(
	scopes: ChangeClaimScope[],
	state: Pick<ChangeClaimState, "claims" | "waiters" | "conflicts">,
	sessionId: string,
	mode: ChangeClaimMode = "write",
): ArtifactStatusRecord[] {
	return scopes.map((scope) => {
		const holderClaims = state.claims
			.filter((claim) => claim.session_id !== sessionId && claim.scopes.some((claimScope) => scopesOverlap(scope, claimScope)));
		const holders = holderClaims.map(holderFromClaim);
		const waiters = state.waiters
			.filter((waiter) => waiter.session_id !== sessionId && waiter.scopes.some((waitScope) => scopesOverlap(scope, waitScope)))
			.map(holderFromWaiter);
		const blockers = mode === "write"
			? holderClaims.filter((claim) => claim.mode === "write").map((claim) => artifactBlockerFromClaim(claim, scope))
			: [];
		const status: ArtifactStatusRecord["status"] = blockers.length > 0
			? "conflict"
			: holders.length > 0
				? "in-use"
				: waiters.length > 0
					? "waiting"
					: "available";
		return {
			artifact: scope,
			status,
			holders,
			waiters,
			conflict_ids: blockers.map((blocker) => blocker.claim_id).sort(),
			...(blockers.length > 0 ? {
				blockers,
				reason: `Artifact is already in use by another active session. Blockers: ${summarizeArtifactBlockers(blockers)}.`,
				next_safe_action: blockers[0].next_safe_action,
			} : {}),
		};
	});
}

export function hasBlockingArtifactStatus(statuses: ArtifactStatusRecord[]): boolean {
	return statuses.some((status) => status.status === "conflict");
}

function computedWaiterState(waiter: ChangeClaimWaiterRecord, claims: ChangeClaimRecord[]): ChangeClaimWaiterRecord {
	if (!["pending", "ready"].includes(waiter.status)) return waiter;
	const blockers = blockingClaimBlockersForWaiter(waiter, claims);
	if (blockers.length > 0) {
		return {
			...waiter,
			status: "pending",
			blocked_by_claim_ids: blockers.map((blocker) => blocker.claim_id).sort(),
			blockers,
			blocker_summary: summarizeArtifactBlockers(blockers),
			next_safe_action: nextSafeActionForWaiter(waiter, blockers),
		};
	}
	return {
		...waiter,
		status: "ready",
		blocked_by_claim_ids: [],
		blockers: [],
		blocker_summary: "",
		next_safe_action: nextSafeActionForWaiter(waiter, []),
	};
}

export function detectClaimConflicts(claims: ChangeClaimRecord[]): ChangeClaimConflict[] {
	const conflicts: ChangeClaimConflict[] = [];
	for (let i = 0; i < claims.length; i += 1) {
		for (let j = i + 1; j < claims.length; j += 1) {
			const left = claims[i];
			const right = claims[j];
			if (!left || !right || left.session_id === right.session_id) continue;
			for (const leftScope of left.scopes) {
				for (const rightScope of right.scopes) {
					if (!scopesOverlap(leftScope, rightScope)) continue;
					const kind = left.mode === "write" && right.mode === "write" ? "conflict" : "warning";
					conflicts.push({
						kind,
						claim_ids: [left.id, right.id].sort(),
						sessions: [left.session_id, right.session_id].sort(),
						scope: commonScope(leftScope, rightScope),
						reason: kind === "conflict"
							? "Overlapping write claims from different sessions."
							: "Read/write overlap from different sessions.",
					});
				}
			}
		}
	}
	return dedupeConflicts(conflicts);
}

function dedupeConflicts(conflicts: ChangeClaimConflict[]): ChangeClaimConflict[] {
	const seen = new Set<string>();
	const result: ChangeClaimConflict[] = [];
	for (const conflict of conflicts) {
		const key = `${conflict.kind}:${conflict.claim_ids.join("+")}:${scopeKey(conflict.scope)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(conflict);
	}
	return result.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "conflict" ? -1 : 1;
		return a.claim_ids.join(",").localeCompare(b.claim_ids.join(","));
	});
}

function commonScope(left: ChangeClaimScope, right: ChangeClaimScope): ChangeClaimScope {
	return left.path || left.task_id || left.ref ? left : right;
}

function scopeKey(scope: ChangeClaimScope): string {
	return [scope.layer, scope.task_id || "", scope.path || "", scope.ref || "", scope.description || ""].join(":");
}

export function scopesOverlap(left: ChangeClaimScope, right: ChangeClaimScope): boolean {
	if (left.layer !== right.layer) return false;
	if (left.task_id || right.task_id) return Boolean(left.task_id && right.task_id && left.task_id === right.task_id);
	if (left.ref || right.ref) return Boolean(left.ref && right.ref && left.ref === right.ref);
	if (left.path || right.path) return pathsOverlap(left.path || "", right.path || "");
	return Boolean(left.description && right.description && left.description === right.description);
}

function blockingClaimBlockersForWaiter(waiter: ChangeClaimWaiterRecord, claims: ChangeClaimRecord[]): ArtifactBlocker[] {
	if (waiter.mode !== "write") return [];
	const blockers: ArtifactBlocker[] = [];
	for (const claim of claims) {
		if (claim.session_id === waiter.session_id || claim.mode !== "write") continue;
		for (const waitScope of waiter.scopes) {
			const matchingScope = claim.scopes.find((claimScope) => scopesOverlap(waitScope, claimScope));
			if (!matchingScope) continue;
			blockers.push(artifactBlockerFromClaim(claim, commonScope(waitScope, matchingScope)));
		}
	}
	return uniqueBlockers(blockers);
}

function pathBase(path: string): { base: string; glob: boolean } {
	const normalized = normalizePathLike(path);
	if (normalized.endsWith("/**")) return { base: normalized.slice(0, -3).replace(/\/$/, ""), glob: true };
	if (normalized.endsWith("/*")) return { base: normalized.slice(0, -2).replace(/\/$/, ""), glob: true };
	return { base: normalized.replace(/\/$/, ""), glob: false };
}

function pathsOverlap(leftPath: string, rightPath: string): boolean {
	const left = pathBase(leftPath);
	const right = pathBase(rightPath);
	if (!left.base || !right.base) return false;
	if (left.base === right.base) return true;
	if (left.glob && (right.base === left.base || right.base.startsWith(`${left.base}/`))) return true;
	if (right.glob && (left.base === right.base || left.base.startsWith(`${right.base}/`))) return true;
	return false;
}

type ChangeClaimMutationResult = {
	changed: boolean;
	claim?: ChangeClaimRecord;
	waiter?: ChangeClaimWaiterRecord;
	claims: ChangeClaimRecord[];
	conflicts: ChangeClaimConflict[];
	waiters: ChangeClaimWaiterRecord[];
	summary: string;
};

export type ArtifactStatusMutationResult = ChangeClaimMutationResult & {
	artifact_statuses: ArtifactStatusRecord[];
	artifact_summary: string;
};

export async function mutateArtifactStatuses(
	project: WikiProject,
	input: CodewikiArtifactStatusToolInput,
	session: { sessionId: string; agentName: string },
): Promise<ArtifactStatusMutationResult> {
	const mapped = mapArtifactStatusInput(input);
	const result = await mutateChangeClaims(project, mapped, session);
	const state = buildChangeClaimState({
		version: 1,
		updated_at: nowIso(),
		next_sequence: 1,
		claims: result.claims,
		waiters: result.waiters,
	});
	const artifactSummary = summarizeArtifactStatusAction(input.action, state.artifact_statuses || []);
	return {
		...result,
		artifact_statuses: state.artifact_statuses || [],
		artifact_summary: artifactSummary,
		summary: artifactSummary,
	};
}

function mapArtifactStatusInput(input: CodewikiArtifactStatusToolInput): ChangeClaimMutationInput {
	const action = input.action === "mark" ? "claim" : input.action;
	return {
		repoPath: input.repoPath,
		action,
		claimId: input.recordId,
		taskId: input.taskId,
		buildRef: input.buildRef,
		summary: input.summary,
		mode: input.mode,
		role: input.role,
		worktree: input.worktree,
		scopes: input.scopes,
		ttl_minutes: input.ttl_minutes,
		force: input.force,
		refresh: input.refresh,
	};
}

function summarizeArtifactStatusAction(action: string, statuses: ArtifactStatusRecord[]): string {
	const counts = new Map<string, number>();
	for (const status of statuses) counts.set(status.status, (counts.get(status.status) || 0) + 1);
	const parts = ["available", "in-use", "waiting", "conflict", "stale"]
		.map((key) => `${key}=${counts.get(key) || 0}`)
		.join(", ");
	return `codewiki artifact-status: ${action} (${parts})`;
}

export async function mutateChangeClaims(
	project: WikiProject,
	input: ChangeClaimMutationInput,
	session: { sessionId: string; agentName: string },
): Promise<ChangeClaimMutationResult> {
	const filePath = claimsFilePath(project);
	let output: ChangeClaimMutationResult | null = null;
	await withLockedPaths([filePath], async () => {
		const file = await readChangeClaimsFile(project);
		const now = new Date();
		const expired = markExpired(file, now);
		const refreshed = refreshWaiters(file, now);
		const action = input.action;
		if (action === "list") {
			if (expired + refreshed > 0) await writeClaimsFile(filePath, file);
			const state = buildChangeClaimState(file, now);
			output = mutationOutput(false, state, summarizeClaimAction(action, state));
			return;
		}
		if (action === "release") {
			const released = releaseClaims(file, input.claimId, session.sessionId);
			const cancelled = cancelWaiters(file, input.claimId, session.sessionId);
			const nextRefreshed = refreshWaiters(file, now);
			if (released + cancelled + nextRefreshed > 0) await writeClaimsFile(filePath, file);
			const state = buildChangeClaimState(file, now);
			output = mutationOutput(released + cancelled + nextRefreshed > 0, state, `codewiki artifact-status: released ${released} holder(s), cancelled ${cancelled} wait(s), readied ${nextRefreshed} wait(s)`);
			return;
		}
		if (action === "heartbeat") {
			const extended = heartbeatClaims(file, input.claimId, session.sessionId, ttlMinutes(input.ttl_minutes));
			const extendedWaiters = heartbeatWaiters(file, input.claimId, session.sessionId, ttlMinutes(input.ttl_minutes));
			const nextRefreshed = refreshWaiters(file, now);
			if (extended + extendedWaiters + nextRefreshed > 0) await writeClaimsFile(filePath, file);
			const state = buildChangeClaimState(file, now);
			output = mutationOutput(extended + extendedWaiters + nextRefreshed > 0, state, `codewiki artifact-status: extended ${extended} holder(s), ${extendedWaiters} wait(s)`);
			return;
		}
		const scopes = normalizeScopes(input.scopes);
		if (scopes.length === 0) throw new Error(`codewiki_artifact_status ${action} requires at least one valid scope.`);
		const summary = String(input.summary || "").trim();
		if (!summary) throw new Error(`codewiki_artifact_status ${action} requires summary.`);
		if (action === "wait") {
			const waiter = createWaiter(project, file, input, session, scopes, summary, now);
			file.waiters = [...(file.waiters || []), waiter];
			file.next_wait_sequence = (file.next_wait_sequence || 1) + 1;
			await writeClaimsFile(filePath, file);
			const state = buildChangeClaimState(file, now);
			output = mutationOutput(true, state, summarizeClaimAction(action, state, undefined, waiter), undefined, waiter);
			return;
		}
		const candidateMode = normalizeClaimMode(input.mode);
		const candidateRole = normalizeClaimRole(input.role);
		const candidateTaskId = optionalTrim(input.taskId);
		const candidate: ChangeClaimRecord = {
			id: formatClaimId(file.next_sequence),
			session_id: session.sessionId,
			agent_name: session.agentName,
			status: "active",
			mode: candidateMode,
			role: candidateRole,
			summary,
			task_id: candidateTaskId,
			build_ref: optionalTrim(input.buildRef),
			worktree: ensureRoleWorktreeMetadata(project, { mode: candidateMode, role: candidateRole, task_id: candidateTaskId, session_id: session.sessionId, worktree: normalizeWorktreeIsolation(input.worktree) }),
			scopes,
			created_at: nowIso(),
			updated_at: nowIso(),
			expires_at: new Date(Date.now() + ttlMinutes(input.ttl_minutes) * 60_000).toISOString(),
		};
		const nextClaims = [...activeChangeClaims(file, now), candidate];
		const conflicts = detectClaimConflicts(nextClaims).filter((conflict) => conflict.claim_ids.includes(candidate.id));
		if (conflicts.some((conflict) => conflict.kind === "conflict") && !input.force) {
			throw new Error(`codewiki_artifact_status conflict: ${conflicts.map((conflict) => conflict.reason).join("; ")}`);
		}
		file.claims.push(candidate);
		file.next_sequence += 1;
		await writeClaimsFile(filePath, file);
		const state = buildChangeClaimState(file, now);
		output = mutationOutput(true, state, summarizeClaimAction(action, state, candidate), candidate);
	});
	return output!;
}

function mutationOutput(
	changed: boolean,
	state: ChangeClaimState,
	summary: string,
	claim?: ChangeClaimRecord,
	waiter?: ChangeClaimWaiterRecord,
): ChangeClaimMutationResult {
	return { changed, claim, waiter, claims: state.claims, conflicts: state.conflicts, waiters: state.waiters, summary };
}

function ttlMinutes(value: unknown): number {
	const minutes = Number(value ?? DEFAULT_TTL_MINUTES);
	if (!Number.isFinite(minutes)) return DEFAULT_TTL_MINUTES;
	return Math.min(MAX_TTL_MINUTES, Math.max(1, Math.floor(minutes)));
}

function createWaiter(
	project: WikiProject,
	file: ChangeClaimsFile,
	input: ChangeClaimMutationInput,
	session: { sessionId: string; agentName: string },
	scopes: ChangeClaimScope[],
	summary: string,
	now: Date,
): ChangeClaimWaiterRecord {
	const mode = normalizeClaimMode(input.mode);
	const role = normalizeClaimRole(input.role);
	const taskId = optionalTrim(input.taskId);
	const waiter: ChangeClaimWaiterRecord = {
		id: formatWaitId(file.next_wait_sequence || 1),
		session_id: session.sessionId,
		agent_name: session.agentName,
		status: "pending",
		mode,
		role,
		summary,
		task_id: taskId,
		build_ref: optionalTrim(input.buildRef),
		worktree: ensureRoleWorktreeMetadata(project, { mode, role, task_id: taskId, session_id: session.sessionId, worktree: normalizeWorktreeIsolation(input.worktree) }),
		scopes,
		blocked_by_claim_ids: [],
		blockers: [],
		created_at: nowIso(),
		updated_at: nowIso(),
		expires_at: new Date(Date.now() + ttlMinutes(input.ttl_minutes) * 60_000).toISOString(),
	};
	const computed = computedWaiterState(waiter, activeChangeClaims(file, now));
	if (computed.status === "ready") computed.ready_at = nowIso();
	return computed;
}

function markExpired(file: ChangeClaimsFile, now: Date): number {
	let changed = 0;
	for (const claim of file.claims) {
		if (claim.status === "active" && !isClaimActive(claim, now)) {
			claim.status = "expired";
			claim.updated_at = nowIso();
			changed += 1;
		}
	}
	for (const waiter of file.waiters || []) {
		if (["pending", "ready"].includes(waiter.status) && !isClaimWaiterActive(waiter, now)) {
			waiter.status = "expired";
			waiter.updated_at = nowIso();
			changed += 1;
		}
	}
	if (changed > 0) file.updated_at = nowIso();
	return changed;
}

function refreshWaiters(file: ChangeClaimsFile, now: Date): number {
	let changed = 0;
	const claims = activeChangeClaims(file, now);
	for (const waiter of file.waiters || []) {
		if (!["pending", "ready"].includes(waiter.status)) continue;
		const computed = computedWaiterState(waiter, claims);
		const previousIds = waiter.blocked_by_claim_ids.join(",");
		const nextIds = computed.blocked_by_claim_ids.join(",");
		const previousBlockers = JSON.stringify(waiter.blockers || []);
		const nextBlockers = JSON.stringify(computed.blockers || []);
		let touched = false;
		if (previousIds !== nextIds || previousBlockers !== nextBlockers || waiter.status !== computed.status || waiter.next_safe_action !== computed.next_safe_action) {
			waiter.blocked_by_claim_ids = computed.blocked_by_claim_ids;
			waiter.blockers = computed.blockers;
			waiter.blocker_summary = computed.blocker_summary;
			waiter.next_safe_action = computed.next_safe_action;
			waiter.status = computed.status;
			touched = true;
		}
		if (computed.status === "ready" && !waiter.ready_at) {
			waiter.ready_at = nowIso();
			touched = true;
		}
		if (touched) {
			waiter.updated_at = nowIso();
			changed += 1;
		}
	}
	if (changed > 0) file.updated_at = nowIso();
	return changed;
}

function releaseClaims(file: ChangeClaimsFile, claimId: string | undefined, sessionId: string): number {
	let count = 0;
	for (const claim of file.claims) {
		if (claim.status !== "active") continue;
		if (claimId && claim.id !== claimId) continue;
		if (!claimId && claim.session_id !== sessionId) continue;
		claim.status = "released";
		claim.released_at = nowIso();
		claim.updated_at = nowIso();
		count += 1;
	}
	if (count > 0) file.updated_at = nowIso();
	return count;
}

function heartbeatClaims(file: ChangeClaimsFile, claimId: string | undefined, sessionId: string, minutes: number): number {
	let count = 0;
	const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
	for (const claim of file.claims) {
		if (claim.status !== "active") continue;
		if (claimId && claim.id !== claimId) continue;
		if (!claimId && claim.session_id !== sessionId) continue;
		claim.expires_at = expiresAt;
		claim.updated_at = nowIso();
		count += 1;
	}
	if (count > 0) file.updated_at = nowIso();
	return count;
}

function cancelWaiters(file: ChangeClaimsFile, waiterId: string | undefined, sessionId: string): number {
	if (waiterId && !waiterId.startsWith("WAIT-")) return 0;
	let count = 0;
	for (const waiter of file.waiters || []) {
		if (!["pending", "ready"].includes(waiter.status)) continue;
		if (waiterId && waiter.id !== waiterId) continue;
		if (!waiterId && waiter.session_id !== sessionId) continue;
		waiter.status = "cancelled";
		waiter.cancelled_at = nowIso();
		waiter.updated_at = nowIso();
		count += 1;
	}
	if (count > 0) file.updated_at = nowIso();
	return count;
}

function heartbeatWaiters(file: ChangeClaimsFile, waiterId: string | undefined, sessionId: string, minutes: number): number {
	if (waiterId && !waiterId.startsWith("WAIT-")) return 0;
	let count = 0;
	const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
	for (const waiter of file.waiters || []) {
		if (!["pending", "ready"].includes(waiter.status)) continue;
		if (waiterId && waiter.id !== waiterId) continue;
		if (!waiterId && waiter.session_id !== sessionId) continue;
		waiter.expires_at = expiresAt;
		waiter.updated_at = nowIso();
		count += 1;
	}
	if (count > 0) file.updated_at = nowIso();
	return count;
}

async function writeClaimsFile(filePath: string, file: ChangeClaimsFile): Promise<void> {
	file.updated_at = nowIso();
	file.claims = file.claims.slice(-200);
	file.waiters = (file.waiters || []).slice(-200);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(file, null, 2) + "\n", "utf8");
}

function summarizeClaimAction(action: string, state: ChangeClaimState, claim?: ChangeClaimRecord, waiter?: ChangeClaimWaiterRecord): string {
	if (action === "claim" && claim) {
		const role = claim.role ? `, role=${claim.role}` : "";
		const worktree = claim.worktree?.worktree_path ? ", worktree=recorded" : "";
		return `codewiki artifact-status: ${claim.id} in-use (${claim.mode}${role}${worktree}, artifacts=${claim.scopes.length}, warnings=${state.warning_count}, conflicts=${state.conflict_count})`;
	}
	if (action === "wait" && waiter) {
		return `codewiki artifact-status: ${waiter.id} ${waiter.status} (${waiter.mode}, artifacts=${waiter.scopes.length}, blocked_by=${waiter.blocked_by_claim_ids.length})`;
	}
	return `codewiki artifact-status: ${state.active_claim_count} in-use, ${state.conflict_count + state.warning_count} overlap(s), ${state.pending_waiter_count} waiting, ${state.ready_waiter_count} ready`;
}

export function claimScopeLabels(scopes: ChangeClaimScope[]): string[] {
	return unique(scopes.map((scope) => scope.task_id || scope.path || scope.ref || scope.description || scope.layer).filter(Boolean));
}
