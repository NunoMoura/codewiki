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
	"content_proof_missing",
	"risk_approval_missing",
	"budget_exhausted",
	"user_input_required",
	"retry_limit",
	"platform_limited",
	"unknown",
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
	created_at: string;
	updated_at: string;
	priority: string;
	max_attempts: number;
	source_refs: string[];
	canonical_refs: CodewikiDaemonCanonicalRefs;
	block_reason?: CodewikiDaemonBlockReason;
	runs: CodewikiDaemonRunRecord[];
}

export interface CodewikiDaemonJobStore {
	version: typeof CODEWIKI_DAEMON_JOB_STORE_VERSION;
	updated_at: string;
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
}

export interface StartCodewikiDaemonRunInput {
	run_id: string;
	started_at: string;
	worker?: CodewikiDaemonWorkerRef;
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
		created_at: input.created_at,
		updated_at: input.created_at,
		priority: input.priority?.trim() || "normal",
		max_attempts: Math.max(1, Math.floor(Number(input.max_attempts ?? 1))),
		source_refs: uniqueStrings(input.source_refs ?? []),
		canonical_refs: normalizeCanonicalRefs({
			...(input.canonical_refs ?? {}),
			roadmap_task: taskId,
		}),
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
			runs,
		};
	}
	return {
		version: CODEWIKI_DAEMON_JOB_STORE_VERSION,
		updated_at: String(input?.updated_at || now).trim(),
		jobs,
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
