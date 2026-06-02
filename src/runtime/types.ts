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
	automation_readiness?: Record<string, unknown>;
}

export const CODEWIKI_DAEMON_JOB_STORE_PATH =
	".codewiki/runtime/jobs.json" as const;
export const CODEWIKI_DAEMON_JOB_STORE_VERSION = 1 as const;

export const CODEWIKI_DAEMON_LOOP_VALUES = [
	"decision",
	"planning",
	"implementation",
	"validation",
	"task-close",
	"publication",
	"observe",
] as const;

export const CODEWIKI_DAEMON_JOB_STATUS_VALUES = [
	"queued",
	"running",
	"blocked",
	"completed",
	"cancelled",
] as const;

export const CODEWIKI_DAEMON_RUN_STATUS_VALUES = [
	"running",
	"completed",
	"blocked",
	"failed",
	"cancelled",
	"stale",
] as const;

export const CODEWIKI_DAEMON_RUN_OUTCOME_VALUES = [
	"pass",
	"fail",
	"block",
	"error",
	"cancelled",
	"stale",
] as const;

export const CODEWIKI_DAEMON_BLOCK_KIND_VALUES = [
	"validation_fail",
	"validation_block",
	"runtime_conflict",
	"artifact_conflict",
	"content_proof_missing",
	"risk_approval_missing",
	"budget_exhausted",
	"user_input_required",
	"planning_required",
	"decision_required",
	"validation_required",
	"retry_limit",
	"platform_limited",
	"unknown",
] as const;

export const CODEWIKI_DAEMON_QUESTION_STATUS_VALUES = [
	"open",
	"answered",
	"resolved",
	"cancelled",
] as const;

export const CODEWIKI_DAEMON_BRAIN_LEASE_STATUS_VALUES = [
	"active",
	"stale",
	"released",
] as const;

export type CodewikiDaemonLoop = (typeof CODEWIKI_DAEMON_LOOP_VALUES)[number];
export type CodewikiDaemonJobStatus =
	(typeof CODEWIKI_DAEMON_JOB_STATUS_VALUES)[number];
export type CodewikiDaemonRunStatus =
	(typeof CODEWIKI_DAEMON_RUN_STATUS_VALUES)[number];
export type CodewikiDaemonRunOutcome =
	(typeof CODEWIKI_DAEMON_RUN_OUTCOME_VALUES)[number];
export type CodewikiDaemonBlockKind =
	(typeof CODEWIKI_DAEMON_BLOCK_KIND_VALUES)[number];
export type CodewikiDaemonQuestionStatus =
	(typeof CODEWIKI_DAEMON_QUESTION_STATUS_VALUES)[number];
export type CodewikiDaemonBrainLeaseStatus =
	(typeof CODEWIKI_DAEMON_BRAIN_LEASE_STATUS_VALUES)[number];

export interface CodewikiDaemonModelPolicy {
	provider?: string;
	model?: string;
	thinking_level?: string;
	fallback_model?: string;
	max_tokens?: number;
	max_cost_usd?: number;
	risk?: string;
	approval_refs: string[];
	notes: string[];
}

export interface CodewikiDaemonWorkerProfile {
	role?: string;
	mode?: string;
	reason?: string;
	capabilities: string[];
	notes: string[];
}

export interface CodewikiDaemonBrainLease {
	status: CodewikiDaemonBrainLeaseStatus;
	session_id: string;
	session_file?: string;
	agent_name?: string;
	claimed_at: string;
	updated_at: string;
	heartbeat_at: string;
	expires_at: string;
	active_task_id?: string;
	active_sprint_id?: string;
	active_refs: string[];
	model_policy?: CodewikiDaemonModelPolicy;
	takeover_policy?: string;
	notes: string[];
}

export interface CodewikiDaemonQuestionRecord {
	id: string;
	job_id: string;
	run_id?: string;
	status: CodewikiDaemonQuestionStatus;
	asked_at: string;
	updated_at: string;
	question: string;
	refs: string[];
	attempted_evidence: string[];
	options: string[];
	answer?: string;
	answered_by?: string;
	answered_at?: string;
	resolution?: string;
	resolution_refs: string[];
}

export interface CodewikiDaemonCanonicalRefs {
	roadmap_task?: string;
	decision_build?: string;
	planning_build?: string;
	implementation_build?: string;
	validation_report?: string;
	git_commit?: string;
	git_tree?: string;
	package_digest?: string;
	archive_ref?: string;
	remote_ref?: string;
}

export interface CodewikiDaemonWorkerRef {
	session_id?: string;
	claim_id?: string;
	agent_name?: string;
	worktree_path?: string;
	branch?: string;
	base_sha?: string;
	head_sha?: string;
}

export interface CodewikiDaemonHeartbeatRecord {
	at: string;
	note?: string;
	worker?: CodewikiDaemonWorkerRef;
}

export interface CodewikiDaemonBlockReason {
	kind: CodewikiDaemonBlockKind;
	summary: string;
	refs: string[];
	recommended_next_loop?: CodewikiDaemonLoop;
	retryable: boolean;
}

export interface CodewikiDaemonHandoffMetadata {
	summary?: string;
	build_refs: string[];
	validation_refs: string[];
	content_refs: string[];
	next_loop?: CodewikiDaemonLoop;
	notes: string[];
}

export interface CodewikiDaemonRunRecord {
	id: string;
	job_id: string;
	attempt: number;
	status: CodewikiDaemonRunStatus;
	loop: CodewikiDaemonLoop;
	worker?: CodewikiDaemonWorkerRef;
	worker_profile?: CodewikiDaemonWorkerProfile;
	model_policy?: CodewikiDaemonModelPolicy;
	started_at: string;
	updated_at: string;
	last_heartbeat_at?: string;
	lease_expires_at?: string;
	heartbeat_count: number;
	heartbeats: CodewikiDaemonHeartbeatRecord[];
	ended_at?: string;
	outcome?: CodewikiDaemonRunOutcome;
	build_refs: string[];
	validation_refs: string[];
	content_refs: string[];
	block_reason?: CodewikiDaemonBlockReason;
	handoff?: CodewikiDaemonHandoffMetadata;
	error?: string;
}

export interface CodewikiDaemonJobRecord {
	id: string;
	status: CodewikiDaemonJobStatus;
	task_id: string;
	sprint_id?: string;
	loop: CodewikiDaemonLoop;
	worker_profile?: CodewikiDaemonWorkerProfile;
	model_policy?: CodewikiDaemonModelPolicy;
	created_at: string;
	updated_at: string;
	priority: string;
	max_attempts: number;
	source_refs: string[];
	canonical_refs: CodewikiDaemonCanonicalRefs;
	block_reason?: CodewikiDaemonBlockReason;
	questions: CodewikiDaemonQuestionRecord[];
	runs: CodewikiDaemonRunRecord[];
}

export interface CodewikiDaemonJobStore {
	version: typeof CODEWIKI_DAEMON_JOB_STORE_VERSION;
	updated_at: string;
	brain_lease?: CodewikiDaemonBrainLease;
	jobs: Record<string, CodewikiDaemonJobRecord>;
}

export interface CreateCodewikiDaemonJobInput {
	id: string;
	task_id: string;
	loop: CodewikiDaemonLoop;
	created_at: string;
	sprint_id?: string;
	priority?: string;
	max_attempts?: number;
	source_refs?: string[];
	canonical_refs?: CodewikiDaemonCanonicalRefs;
	worker_profile?: CodewikiDaemonWorkerProfile;
	model_policy?: CodewikiDaemonModelPolicy;
}

export interface StartCodewikiDaemonRunInput {
	run_id: string;
	started_at: string;
	worker?: CodewikiDaemonWorkerRef;
	worker_profile?: CodewikiDaemonWorkerProfile;
	model_policy?: CodewikiDaemonModelPolicy;
	lease_expires_at?: string;
	build_refs?: string[];
	validation_refs?: string[];
	content_refs?: string[];
}

export interface HeartbeatCodewikiDaemonRunInput {
	at: string;
	note?: string;
	worker?: CodewikiDaemonWorkerRef;
}

export interface FinishCodewikiDaemonRunInput {
	ended_at: string;
	outcome: CodewikiDaemonRunOutcome;
	summary?: string;
	build_refs?: string[];
	validation_refs?: string[];
	content_refs?: string[];
	block_reason?: CodewikiDaemonBlockReason;
	error?: string;
	handoff?: Partial<CodewikiDaemonHandoffMetadata>;
}

export interface ClaimCodewikiDaemonBrainLeaseInput {
	session_id: string;
	now: string;
	expires_at: string;
	session_file?: string;
	agent_name?: string;
	active_task_id?: string;
	active_sprint_id?: string;
	active_refs?: string[];
	model_policy?: CodewikiDaemonModelPolicy;
	takeover_policy?: string;
	notes?: string[];
	allow_stale_takeover?: boolean;
}

export interface HeartbeatCodewikiDaemonBrainLeaseInput {
	session_id: string;
	at: string;
	expires_at: string;
	active_task_id?: string;
	active_sprint_id?: string;
	active_refs?: string[];
	notes?: string[];
}

export interface AskCodewikiDaemonWorkerQuestionInput {
	id: string;
	run_id?: string;
	asked_at: string;
	question: string;
	refs?: string[];
	attempted_evidence?: string[];
	options?: string[];
	block_kind?: CodewikiDaemonBlockKind;
	recommended_next_loop?: CodewikiDaemonLoop;
}

export interface AnswerCodewikiDaemonWorkerQuestionInput {
	question_id: string;
	answered_at: string;
	answer: string;
	answered_by?: string;
	resolution?: string;
	resolution_refs?: string[];
}

export interface UnblockCodewikiDaemonJobInput {
	unblocked_at: string;
	question_id?: string;
	resolution?: string;
	resolution_refs?: string[];
}

function uniqueStrings(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return [
		...new Set(values.map((value) => String(value).trim()).filter(Boolean)),
	];
}

function isOneOf<T extends readonly string[]>(
	values: T,
	value: unknown,
): value is T[number] {
	return values.includes(String(value) as T[number]);
}

function normalizeLoop(value: unknown): CodewikiDaemonLoop {
	return isOneOf(CODEWIKI_DAEMON_LOOP_VALUES, value) ? value : "observe";
}

function normalizeJobStatus(value: unknown): CodewikiDaemonJobStatus {
	return isOneOf(CODEWIKI_DAEMON_JOB_STATUS_VALUES, value) ? value : "queued";
}

function normalizeRunStatus(value: unknown): CodewikiDaemonRunStatus {
	return isOneOf(CODEWIKI_DAEMON_RUN_STATUS_VALUES, value) ? value : "running";
}

function normalizeBlockKind(value: unknown): CodewikiDaemonBlockKind {
	return isOneOf(CODEWIKI_DAEMON_BLOCK_KIND_VALUES, value) ? value : "unknown";
}

function normalizeBlockReason(
	value: any,
): CodewikiDaemonBlockReason | undefined {
	if (!value || typeof value !== "object") return undefined;
	const summary = String(value.summary || "").trim();
	if (!summary) return undefined;
	return {
		kind: normalizeBlockKind(value.kind),
		summary,
		refs: uniqueStrings(value.refs),
		recommended_next_loop: isOneOf(
			CODEWIKI_DAEMON_LOOP_VALUES,
			value.recommended_next_loop,
		)
			? value.recommended_next_loop
			: undefined,
		retryable: Boolean(value.retryable),
	};
}

function normalizeCanonicalRefs(value: any): CodewikiDaemonCanonicalRefs {
	if (!value || typeof value !== "object") return {};
	const refs: CodewikiDaemonCanonicalRefs = {};
	for (const key of [
		"roadmap_task",
		"decision_build",
		"planning_build",
		"implementation_build",
		"validation_report",
		"git_commit",
		"git_tree",
		"package_digest",
		"archive_ref",
		"remote_ref",
	] as const) {
		const text = String(value[key] || "").trim();
		if (text) refs[key] = text;
	}
	return refs;
}

function normalizeWorker(value: any): CodewikiDaemonWorkerRef | undefined {
	if (!value || typeof value !== "object") return undefined;
	const worker: CodewikiDaemonWorkerRef = {};
	for (const key of [
		"session_id",
		"claim_id",
		"agent_name",
		"worktree_path",
		"branch",
		"base_sha",
		"head_sha",
	] as const) {
		const text = String(value[key] || "").trim();
		if (text) worker[key] = text;
	}
	return Object.keys(worker).length ? worker : undefined;
}

function normalizeModelPolicy(
	value: any,
): CodewikiDaemonModelPolicy | undefined {
	if (!value || typeof value !== "object") return undefined;
	const policy: CodewikiDaemonModelPolicy = {
		approval_refs: uniqueStrings(value.approval_refs),
		notes: uniqueStrings(value.notes),
	};
	for (const key of [
		"provider",
		"model",
		"thinking_level",
		"fallback_model",
		"risk",
	] as const) {
		const text = String(value[key] || "").trim();
		if (text) policy[key] = text;
	}
	for (const key of ["max_tokens", "max_cost_usd"] as const) {
		const number = Number(value[key]);
		if (Number.isFinite(number) && number >= 0) policy[key] = number;
	}
	return Object.keys(policy).some((key) => {
		const valueForKey = policy[key as keyof CodewikiDaemonModelPolicy];
		return Array.isArray(valueForKey) ? valueForKey.length > 0 : valueForKey;
	})
		? policy
		: undefined;
}

function normalizeWorkerProfile(
	value: any,
): CodewikiDaemonWorkerProfile | undefined {
	if (!value || typeof value !== "object") return undefined;
	const profile: CodewikiDaemonWorkerProfile = {
		capabilities: uniqueStrings(value.capabilities),
		notes: uniqueStrings(value.notes),
	};
	for (const key of ["role", "mode", "reason"] as const) {
		const text = String(value[key] || "").trim();
		if (text) profile[key] = text;
	}
	return Object.keys(profile).some((key) => {
		const valueForKey = profile[key as keyof CodewikiDaemonWorkerProfile];
		return Array.isArray(valueForKey) ? valueForKey.length > 0 : valueForKey;
	})
		? profile
		: undefined;
}

function normalizeQuestion(
	jobId: string,
	value: any,
): CodewikiDaemonQuestionRecord | null {
	if (!value || typeof value !== "object") return null;
	const id = String(value.id || "").trim();
	const question = String(value.question || "").trim();
	const askedAt = String(value.asked_at || value.updated_at || "").trim();
	if (!id || !question || !askedAt) return null;
	const status = isOneOf(CODEWIKI_DAEMON_QUESTION_STATUS_VALUES, value.status)
		? value.status
		: "open";
	const runId = String(value.run_id || "").trim();
	const answer = String(value.answer || "").trim();
	const answeredBy = String(value.answered_by || "").trim();
	const answeredAt = String(value.answered_at || "").trim();
	const resolution = String(value.resolution || "").trim();
	return {
		id,
		job_id: String(value.job_id || jobId).trim() || jobId,
		...(runId ? { run_id: runId } : {}),
		status,
		asked_at: askedAt,
		updated_at: String(value.updated_at || askedAt).trim(),
		question,
		refs: uniqueStrings(value.refs),
		attempted_evidence: uniqueStrings(value.attempted_evidence),
		options: uniqueStrings(value.options),
		...(answer ? { answer } : {}),
		...(answeredBy ? { answered_by: answeredBy } : {}),
		...(answeredAt ? { answered_at: answeredAt } : {}),
		...(resolution ? { resolution } : {}),
		resolution_refs: uniqueStrings(value.resolution_refs),
	};
}

function normalizeBrainLease(
	value: any,
	now: string,
): CodewikiDaemonBrainLease | undefined {
	if (!value || typeof value !== "object") return undefined;
	const sessionId = String(value.session_id || "").trim();
	if (!sessionId) return undefined;
	const claimedAt = String(value.claimed_at || value.updated_at || now).trim();
	const heartbeatAt = String(
		value.heartbeat_at || value.updated_at || claimedAt,
	).trim();
	const expiresAt = String(value.expires_at || "").trim();
	if (!expiresAt) return undefined;
	const sessionFile = String(value.session_file || "").trim();
	const agentName = String(value.agent_name || "").trim();
	const activeTaskId = String(value.active_task_id || "").trim();
	const activeSprintId = String(value.active_sprint_id || "").trim();
	const takeoverPolicy = String(value.takeover_policy || "").trim();
	return {
		status: isOneOf(CODEWIKI_DAEMON_BRAIN_LEASE_STATUS_VALUES, value.status)
			? value.status
			: "active",
		session_id: sessionId,
		...(sessionFile ? { session_file: sessionFile } : {}),
		...(agentName ? { agent_name: agentName } : {}),
		claimed_at: claimedAt,
		updated_at: String(value.updated_at || heartbeatAt).trim(),
		heartbeat_at: heartbeatAt,
		expires_at: expiresAt,
		...(activeTaskId ? { active_task_id: activeTaskId } : {}),
		...(activeSprintId ? { active_sprint_id: activeSprintId } : {}),
		active_refs: uniqueStrings(value.active_refs),
		...(normalizeModelPolicy(value.model_policy)
			? { model_policy: normalizeModelPolicy(value.model_policy) }
			: {}),
		...(takeoverPolicy ? { takeover_policy: takeoverPolicy } : {}),
		notes: uniqueStrings(value.notes),
	};
}

function normalizeHeartbeat(value: any): CodewikiDaemonHeartbeatRecord | null {
	if (!value || typeof value !== "object") return null;
	const at = String(value.at || "").trim();
	if (!at) return null;
	const note = String(value.note || "").trim();
	return {
		at,
		...(note ? { note } : {}),
		...(normalizeWorker(value.worker)
			? { worker: normalizeWorker(value.worker) }
			: {}),
	};
}

function normalizeHandoff(
	value: any,
): CodewikiDaemonHandoffMetadata | undefined {
	if (!value || typeof value !== "object") return undefined;
	const summary = String(value.summary || "").trim();
	return {
		...(summary ? { summary } : {}),
		build_refs: uniqueStrings(value.build_refs),
		validation_refs: uniqueStrings(value.validation_refs),
		content_refs: uniqueStrings(value.content_refs),
		next_loop: isOneOf(CODEWIKI_DAEMON_LOOP_VALUES, value.next_loop)
			? value.next_loop
			: undefined,
		notes: uniqueStrings(value.notes),
	};
}

export function createCodewikiDaemonJob(
	input: CreateCodewikiDaemonJobInput,
): CodewikiDaemonJobRecord {
	const id = input.id.trim();
	const taskId = input.task_id.trim();
	if (!id) throw new Error("daemon job id is required");
	if (!taskId) throw new Error("daemon job task_id is required");
	return {
		id,
		status: "queued",
		task_id: taskId,
		...(input.sprint_id?.trim() ? { sprint_id: input.sprint_id.trim() } : {}),
		loop: input.loop,
		...(normalizeWorkerProfile(input.worker_profile)
			? { worker_profile: normalizeWorkerProfile(input.worker_profile) }
			: {}),
		...(normalizeModelPolicy(input.model_policy)
			? { model_policy: normalizeModelPolicy(input.model_policy) }
			: {}),
		created_at: input.created_at,
		updated_at: input.created_at,
		priority: input.priority?.trim() || "normal",
		max_attempts: Math.max(1, Math.floor(Number(input.max_attempts ?? 1))),
		source_refs: uniqueStrings(input.source_refs ?? []),
		canonical_refs: normalizeCanonicalRefs({
			...(input.canonical_refs ?? {}),
			roadmap_task: taskId,
		}),
		questions: [],
		runs: [],
	};
}

export function normalizeCodewikiDaemonJobStore(
	input: any,
	now: string,
): CodewikiDaemonJobStore {
	const rawJobs = input && typeof input === "object" ? input.jobs : undefined;
	const jobValues = Array.isArray(rawJobs)
		? rawJobs
		: rawJobs && typeof rawJobs === "object"
			? Object.values(rawJobs)
			: [];
	const jobs: Record<string, CodewikiDaemonJobRecord> = {};
	for (const raw of jobValues as any[]) {
		if (!raw || typeof raw !== "object") continue;
		const id = String(raw.id || "").trim();
		const taskId = String(raw.task_id || "").trim();
		const created = String(raw.created_at || now).trim();
		if (!id || !taskId) continue;
		const runs = Array.isArray(raw.runs)
			? raw.runs
					.map((run: any) =>
						normalizeCodewikiDaemonRun(id, raw.loop, run, created),
					)
					.filter(
						(
							run: CodewikiDaemonRunRecord | null,
						): run is CodewikiDaemonRunRecord => Boolean(run),
					)
			: [];
		jobs[id] = {
			id,
			status: normalizeJobStatus(raw.status),
			task_id: taskId,
			...(String(raw.sprint_id || "").trim()
				? { sprint_id: String(raw.sprint_id).trim() }
				: {}),
			loop: normalizeLoop(raw.loop),
			...(normalizeWorkerProfile(raw.worker_profile)
				? { worker_profile: normalizeWorkerProfile(raw.worker_profile) }
				: {}),
			...(normalizeModelPolicy(raw.model_policy)
				? { model_policy: normalizeModelPolicy(raw.model_policy) }
				: {}),
			created_at: created,
			updated_at: String(raw.updated_at || created).trim(),
			priority: String(raw.priority || "normal").trim(),
			max_attempts: Math.max(1, Math.floor(Number(raw.max_attempts ?? 1))),
			source_refs: uniqueStrings(raw.source_refs),
			canonical_refs: normalizeCanonicalRefs({
				...(raw.canonical_refs ?? {}),
				roadmap_task: taskId,
			}),
			...(normalizeBlockReason(raw.block_reason)
				? { block_reason: normalizeBlockReason(raw.block_reason) }
				: {}),
			questions: Array.isArray(raw.questions)
				? raw.questions
						.map((item: unknown) => normalizeQuestion(id, item))
						.filter(
							(
								item: CodewikiDaemonQuestionRecord | null,
							): item is CodewikiDaemonQuestionRecord => Boolean(item),
						)
				: [],
			runs,
		};
	}
	return {
		version: CODEWIKI_DAEMON_JOB_STORE_VERSION,
		updated_at: String(input?.updated_at || now).trim(),
		...(normalizeBrainLease(input?.brain_lease, now)
			? { brain_lease: normalizeBrainLease(input?.brain_lease, now) }
			: {}),
		jobs,
	};
}

function parseIsoMs(value: string | undefined): number | null {
	const ms = Date.parse(String(value || ""));
	return Number.isFinite(ms) ? ms : null;
}

function brainLeaseActiveAt(
	lease: CodewikiDaemonBrainLease | undefined,
	now: string,
): boolean {
	if (!lease || lease.status !== "active") return false;
	const expiresMs = parseIsoMs(lease.expires_at);
	const nowMs = parseIsoMs(now);
	return expiresMs !== null && nowMs !== null && expiresMs > nowMs;
}

export function claimCodewikiDaemonBrainLease(
	storeInput: CodewikiDaemonJobStore,
	input: ClaimCodewikiDaemonBrainLeaseInput,
): CodewikiDaemonJobStore {
	const store = normalizeCodewikiDaemonJobStore(storeInput, input.now);
	const sessionId = input.session_id.trim();
	if (!sessionId) throw new Error("brain lease session_id is required");
	const current = store.brain_lease;
	const sameSession = current?.session_id === sessionId;
	if (current && !sameSession && brainLeaseActiveAt(current, input.now)) {
		throw new Error(`brain lease already active: ${current.session_id}`);
	}
	if (current && !sameSession && !input.allow_stale_takeover) {
		throw new Error(
			`brain lease takeover requires stale takeover policy: ${current.session_id}`,
		);
	}
	const claimedAt = sameSession ? current.claimed_at : input.now;
	const lease: CodewikiDaemonBrainLease = {
		status: "active",
		session_id: sessionId,
		...(input.session_file?.trim()
			? { session_file: input.session_file.trim() }
			: {}),
		...(input.agent_name?.trim()
			? { agent_name: input.agent_name.trim() }
			: {}),
		claimed_at: claimedAt,
		updated_at: input.now,
		heartbeat_at: input.now,
		expires_at: input.expires_at,
		...(input.active_task_id?.trim()
			? { active_task_id: input.active_task_id.trim() }
			: {}),
		...(input.active_sprint_id?.trim()
			? { active_sprint_id: input.active_sprint_id.trim() }
			: {}),
		active_refs: uniqueStrings(input.active_refs),
		...(normalizeModelPolicy(input.model_policy)
			? { model_policy: normalizeModelPolicy(input.model_policy) }
			: {}),
		...(input.takeover_policy?.trim()
			? { takeover_policy: input.takeover_policy.trim() }
			: {}),
		notes: uniqueStrings(input.notes),
	};
	return { ...store, updated_at: input.now, brain_lease: lease };
}

export function heartbeatCodewikiDaemonBrainLease(
	storeInput: CodewikiDaemonJobStore,
	input: HeartbeatCodewikiDaemonBrainLeaseInput,
): CodewikiDaemonJobStore {
	const store = normalizeCodewikiDaemonJobStore(storeInput, input.at);
	const lease = store.brain_lease;
	if (!lease || lease.status !== "active") {
		throw new Error("brain lease is not active");
	}
	if (lease.session_id !== input.session_id.trim()) {
		throw new Error(`brain lease owned by ${lease.session_id}`);
	}
	if (!brainLeaseActiveAt(lease, input.at)) {
		throw new Error(`brain lease expired: ${lease.session_id}`);
	}
	const updated: CodewikiDaemonBrainLease = {
		...lease,
		updated_at: input.at,
		heartbeat_at: input.at,
		expires_at: input.expires_at,
		...(input.active_task_id?.trim()
			? { active_task_id: input.active_task_id.trim() }
			: {}),
		...(input.active_sprint_id?.trim()
			? { active_sprint_id: input.active_sprint_id.trim() }
			: {}),
		active_refs: input.active_refs
			? uniqueStrings(input.active_refs)
			: lease.active_refs,
		notes: input.notes ? uniqueStrings(input.notes) : lease.notes,
	};
	return { ...store, updated_at: input.at, brain_lease: updated };
}

export function releaseCodewikiDaemonBrainLease(
	storeInput: CodewikiDaemonJobStore,
	sessionId: string,
	releasedAt: string,
): CodewikiDaemonJobStore {
	const store = normalizeCodewikiDaemonJobStore(storeInput, releasedAt);
	const lease = store.brain_lease;
	if (!lease) return store;
	if (lease.session_id !== sessionId.trim()) {
		throw new Error(`brain lease owned by ${lease.session_id}`);
	}
	return {
		...store,
		updated_at: releasedAt,
		brain_lease: {
			...lease,
			status: "released",
			updated_at: releasedAt,
			heartbeat_at: releasedAt,
		},
	};
}

function normalizeCodewikiDaemonRun(
	jobId: string,
	jobLoop: unknown,
	raw: any,
	fallbackTime: string,
): CodewikiDaemonRunRecord | null {
	if (!raw || typeof raw !== "object") return null;
	const id = String(raw.id || "").trim();
	if (!id) return null;
	const started = String(raw.started_at || fallbackTime).trim();
	const heartbeats: CodewikiDaemonHeartbeatRecord[] = Array.isArray(
		raw.heartbeats,
	)
		? raw.heartbeats
				.map((item: unknown) => normalizeHeartbeat(item))
				.filter(
					(
						item: CodewikiDaemonHeartbeatRecord | null,
					): item is CodewikiDaemonHeartbeatRecord => Boolean(item),
				)
		: [];
	return {
		id,
		job_id: String(raw.job_id || jobId).trim() || jobId,
		attempt: Math.max(1, Math.floor(Number(raw.attempt ?? 1))),
		status: normalizeRunStatus(raw.status),
		loop: normalizeLoop(raw.loop || jobLoop),
		...(normalizeWorker(raw.worker)
			? { worker: normalizeWorker(raw.worker) }
			: {}),
		...(normalizeWorkerProfile(raw.worker_profile)
			? { worker_profile: normalizeWorkerProfile(raw.worker_profile) }
			: {}),
		...(normalizeModelPolicy(raw.model_policy)
			? { model_policy: normalizeModelPolicy(raw.model_policy) }
			: {}),
		started_at: started,
		updated_at: String(raw.updated_at || started).trim(),
		...(String(raw.last_heartbeat_at || "").trim()
			? { last_heartbeat_at: String(raw.last_heartbeat_at).trim() }
			: {}),
		...(String(raw.lease_expires_at || "").trim()
			? { lease_expires_at: String(raw.lease_expires_at).trim() }
			: {}),
		heartbeat_count: Math.max(
			0,
			Math.floor(Number(raw.heartbeat_count ?? heartbeats.length)),
		),
		heartbeats,
		...(String(raw.ended_at || "").trim()
			? { ended_at: String(raw.ended_at).trim() }
			: {}),
		...(isOneOf(CODEWIKI_DAEMON_RUN_OUTCOME_VALUES, raw.outcome)
			? { outcome: raw.outcome }
			: {}),
		build_refs: uniqueStrings(raw.build_refs),
		validation_refs: uniqueStrings(raw.validation_refs),
		content_refs: uniqueStrings(raw.content_refs),
		...(normalizeBlockReason(raw.block_reason)
			? { block_reason: normalizeBlockReason(raw.block_reason) }
			: {}),
		...(normalizeHandoff(raw.handoff)
			? { handoff: normalizeHandoff(raw.handoff) }
			: {}),
		...(String(raw.error || "").trim()
			? { error: String(raw.error).trim() }
			: {}),
	};
}

function assertQuestionIdAvailable(
	job: CodewikiDaemonJobRecord,
	questionId: string,
): void {
	if (job.questions.some((question) => question.id === questionId)) {
		throw new Error(`daemon question already exists: ${questionId}`);
	}
}

export function askCodewikiDaemonWorkerQuestion(
	job: CodewikiDaemonJobRecord,
	input: AskCodewikiDaemonWorkerQuestionInput,
): CodewikiDaemonJobRecord {
	const id = input.id.trim();
	const questionText = input.question.trim();
	if (!id) throw new Error("daemon question id is required");
	if (!questionText) throw new Error("daemon question text is required");
	assertQuestionIdAvailable(job, id);
	const question: CodewikiDaemonQuestionRecord = {
		id,
		job_id: job.id,
		...(input.run_id?.trim() ? { run_id: input.run_id.trim() } : {}),
		status: "open",
		asked_at: input.asked_at,
		updated_at: input.asked_at,
		question: questionText,
		refs: uniqueStrings(input.refs),
		attempted_evidence: uniqueStrings(input.attempted_evidence),
		options: uniqueStrings(input.options),
		resolution_refs: [],
	};
	const blockReason: CodewikiDaemonBlockReason = {
		kind: input.block_kind ?? "user_input_required",
		summary: questionText,
		refs: uniqueStrings([id, ...question.refs]),
		...(input.recommended_next_loop
			? { recommended_next_loop: input.recommended_next_loop }
			: {}),
		retryable: false,
	};
	const runs = job.runs.map((run) => {
		if (input.run_id?.trim() && run.id !== input.run_id.trim()) return run;
		if (!input.run_id?.trim() && run.status !== "running") return run;
		if (run.status !== "running") return run;
		return {
			...run,
			status: "blocked" as const,
			updated_at: input.asked_at,
			ended_at: input.asked_at,
			outcome: "block" as const,
			block_reason: blockReason,
		};
	});
	return {
		...job,
		status: "blocked",
		updated_at: input.asked_at,
		block_reason: blockReason,
		questions: [...job.questions, question],
		runs,
	};
}

export function answerCodewikiDaemonWorkerQuestion(
	job: CodewikiDaemonJobRecord,
	input: AnswerCodewikiDaemonWorkerQuestionInput,
): CodewikiDaemonJobRecord {
	let found = false;
	const questions = job.questions.map((question) => {
		if (question.id !== input.question_id.trim()) return question;
		found = true;
		const answer = input.answer.trim();
		if (!answer) throw new Error("daemon question answer is required");
		return {
			...question,
			status: input.resolution?.trim()
				? ("resolved" as const)
				: ("answered" as const),
			updated_at: input.answered_at,
			answer,
			...(input.answered_by?.trim()
				? { answered_by: input.answered_by.trim() }
				: {}),
			answered_at: input.answered_at,
			...(input.resolution?.trim()
				? { resolution: input.resolution.trim() }
				: {}),
			resolution_refs: uniqueStrings(input.resolution_refs),
		};
	});
	if (!found)
		throw new Error(`daemon question not found: ${input.question_id}`);
	return {
		...job,
		updated_at: input.answered_at,
		questions,
	};
}

export function unblockCodewikiDaemonJob(
	job: CodewikiDaemonJobRecord,
	input: UnblockCodewikiDaemonJobInput,
): CodewikiDaemonJobRecord {
	if (job.status !== "blocked") return job;
	let questions = job.questions;
	if (input.question_id?.trim()) {
		let found = false;
		questions = job.questions.map((question) => {
			if (question.id !== input.question_id?.trim()) return question;
			found = true;
			return {
				...question,
				status: "resolved" as const,
				updated_at: input.unblocked_at,
				...(input.resolution?.trim()
					? { resolution: input.resolution.trim() }
					: {}),
				resolution_refs: uniqueStrings(input.resolution_refs),
			};
		});
		if (!found)
			throw new Error(`daemon question not found: ${input.question_id}`);
	}
	return {
		...job,
		status: "queued",
		updated_at: input.unblocked_at,
		block_reason: undefined,
		questions,
	};
}

function assertCanStartRun(job: CodewikiDaemonJobRecord): void {
	if (["completed", "cancelled"].includes(job.status)) {
		throw new Error(`daemon job ${job.id} is terminal: ${job.status}`);
	}
	if (job.runs.some((run) => run.status === "running")) {
		throw new Error(`daemon job ${job.id} already has a running run`);
	}
	if (job.runs.length >= job.max_attempts) {
		throw new Error(
			`daemon job ${job.id} reached max_attempts=${job.max_attempts}`,
		);
	}
}

export function startCodewikiDaemonRun(
	job: CodewikiDaemonJobRecord,
	input: StartCodewikiDaemonRunInput,
): CodewikiDaemonJobRecord {
	assertCanStartRun(job);
	const runId = input.run_id.trim();
	if (!runId) throw new Error("daemon run id is required");
	const run: CodewikiDaemonRunRecord = {
		id: runId,
		job_id: job.id,
		attempt: job.runs.length + 1,
		status: "running",
		loop: job.loop,
		...(input.worker ? { worker: normalizeWorker(input.worker) } : {}),
		...(normalizeWorkerProfile(input.worker_profile ?? job.worker_profile)
			? {
					worker_profile: normalizeWorkerProfile(
						input.worker_profile ?? job.worker_profile,
					),
				}
			: {}),
		...(normalizeModelPolicy(input.model_policy ?? job.model_policy)
			? {
					model_policy: normalizeModelPolicy(
						input.model_policy ?? job.model_policy,
					),
				}
			: {}),
		started_at: input.started_at,
		updated_at: input.started_at,
		last_heartbeat_at: input.started_at,
		...(input.lease_expires_at?.trim()
			? { lease_expires_at: input.lease_expires_at.trim() }
			: {}),
		heartbeat_count: 0,
		heartbeats: [],
		build_refs: uniqueStrings(input.build_refs ?? []),
		validation_refs: uniqueStrings(input.validation_refs ?? []),
		content_refs: uniqueStrings(input.content_refs ?? []),
	};
	return {
		...job,
		status: "running",
		updated_at: input.started_at,
		block_reason: undefined,
		runs: [...job.runs, run],
	};
}

export function heartbeatCodewikiDaemonRun(
	job: CodewikiDaemonJobRecord,
	runId: string,
	input: HeartbeatCodewikiDaemonRunInput,
): CodewikiDaemonJobRecord {
	let found = false;
	const runs = job.runs.map((run) => {
		if (run.id !== runId) return run;
		found = true;
		if (run.status !== "running") {
			throw new Error(`daemon run ${runId} is not running`);
		}
		const heartbeat: CodewikiDaemonHeartbeatRecord = {
			at: input.at,
			...(input.note?.trim() ? { note: input.note.trim() } : {}),
			...(input.worker ? { worker: normalizeWorker(input.worker) } : {}),
		};
		return {
			...run,
			worker: heartbeat.worker ?? run.worker,
			updated_at: input.at,
			last_heartbeat_at: input.at,
			heartbeat_count: run.heartbeat_count + 1,
			heartbeats: [...run.heartbeats, heartbeat],
		};
	});
	if (!found) throw new Error(`daemon run not found: ${runId}`);
	return {
		...job,
		updated_at: input.at,
		runs,
	};
}

function runStatusForOutcome(
	outcome: CodewikiDaemonRunOutcome,
): CodewikiDaemonRunStatus {
	if (outcome === "pass") return "completed";
	if (outcome === "block") return "blocked";
	if (outcome === "cancelled") return "cancelled";
	if (outcome === "stale") return "stale";
	return "failed";
}

function jobStatusForOutcome(
	outcome: CodewikiDaemonRunOutcome,
): CodewikiDaemonJobStatus {
	if (outcome === "pass") return "completed";
	if (outcome === "cancelled") return "cancelled";
	return "blocked";
}

export function finishCodewikiDaemonRun(
	job: CodewikiDaemonJobRecord,
	runId: string,
	input: FinishCodewikiDaemonRunInput,
): CodewikiDaemonJobRecord {
	let blockReason =
		input.outcome === "pass" || input.outcome === "cancelled"
			? undefined
			: input.block_reason;
	let found = false;
	const runs = job.runs.map((run) => {
		if (run.id !== runId) return run;
		found = true;
		if (run.status !== "running") {
			throw new Error(`daemon run ${runId} is not running`);
		}
		const handoff: CodewikiDaemonHandoffMetadata = normalizeHandoff({
			...(input.handoff ?? {}),
			summary: input.handoff?.summary ?? input.summary,
			build_refs: [
				...run.build_refs,
				...(input.build_refs ?? []),
				...(input.handoff?.build_refs ?? []),
			],
			validation_refs: [
				...run.validation_refs,
				...(input.validation_refs ?? []),
				...(input.handoff?.validation_refs ?? []),
			],
			content_refs: [
				...run.content_refs,
				...(input.content_refs ?? []),
				...(input.handoff?.content_refs ?? []),
			],
		}) ?? {
			summary: input.summary,
			build_refs: [],
			validation_refs: [],
			content_refs: [],
			notes: [],
		};
		if (
			!blockReason &&
			input.outcome !== "pass" &&
			input.outcome !== "cancelled"
		) {
			blockReason = {
				kind:
					input.outcome === "block" ? "validation_block" : "validation_fail",
				summary: input.error || input.summary || `daemon run ${input.outcome}`,
				refs: [...handoff.build_refs, ...handoff.validation_refs],
				retryable: true,
			};
		}
		return {
			...run,
			status: runStatusForOutcome(input.outcome),
			updated_at: input.ended_at,
			ended_at: input.ended_at,
			outcome: input.outcome,
			build_refs: handoff.build_refs,
			validation_refs: handoff.validation_refs,
			content_refs: handoff.content_refs,
			...(blockReason ? { block_reason: blockReason } : {}),
			...(handoff ? { handoff } : {}),
			...(input.error?.trim() ? { error: input.error.trim() } : {}),
		};
	});
	if (!found) throw new Error(`daemon run not found: ${runId}`);
	return {
		...job,
		status: jobStatusForOutcome(input.outcome),
		updated_at: input.ended_at,
		...(blockReason ? { block_reason: blockReason } : {}),
		runs,
	};
}
