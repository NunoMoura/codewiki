import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { AgencyBudget } from "../agency/types.ts";
import type { WikiProject } from "../project/types.ts";
import { readRoadmapFile } from "../roadmap/store.ts";
import {
	selectRoadmapDispatchCandidates,
	type RoadmapDispatchCandidate,
	type RoadmapDispatchSkip,
} from "../roadmap/selection.ts";
import type { RoadmapFile } from "../roadmap/types.ts";
import { unique } from "../shared/utils.ts";
import { buildChangeClaimState, readChangeClaimsFile } from "./claims.ts";
import type {
	ArtifactBlocker,
	ParallelSchedulerPlan,
	SchedulerTaskInput,
} from "./worktree-isolation.ts";
import { computeParallelSchedulerPlan } from "./worktree-isolation.ts";
import type { ArtifactStatusRecord, ChangeClaimScope } from "./types.ts";

export interface WorktreeDispatcherInput {
	roadmap?: RoadmapFile;
	artifact_statuses?: ArtifactStatusRecord[];
	max_workers?: number;
	budget?: Partial<AgencyBudget>;
	session_id_prefix?: string;
	base_sha?: string;
	include_blocked?: boolean;
	claim_ttl_minutes?: number;
}

export interface WorktreeDispatchResumePacket {
	task_id: string;
	context_path: string;
	source_refs: string[];
	follow_up_intent: string;
	prompt: string;
	command: string;
	chat_context_shared: false;
}

export interface WorktreeDispatchFreshWorkerRequest {
	role: "builder";
	task_id: string;
	context_path: string;
	trace_refs: string[];
	gate_refs: string[];
	git_refs: string[];
	content_requirements: string[];
	command: string;
	chat_context_shared: false;
}

export interface WorktreeDispatchAssignment {
	worker_id: string;
	partition_id: string;
	task_id: string;
	title: string;
	priority: string;
	order_index: number;
	sprint_ids: string[];
	scopes: ChangeClaimScope[];
	worktrees: ParallelSchedulerPlan["allocations"][number]["roles"];
	artifact_claim: {
		action: "mark";
		mode: "write";
		role: "builder";
		task_id: string;
		scopes: ChangeClaimScope[];
		ttl_minutes: number;
		summary: string;
		worktree: ParallelSchedulerPlan["allocations"][number]["roles"]["builder"]["metadata"];
	};
	resume_packet: WorktreeDispatchResumePacket;
	fresh_worker_request: WorktreeDispatchFreshWorkerRequest;
}

export interface WorktreeDispatchBlockedTask {
	task_id: string;
	reason: string;
	blocked_by_task_ids: string[];
	blockers: ArtifactBlocker[];
	scopes: ChangeClaimScope[];
	wait: ParallelSchedulerPlan["blocked"][number]["wait"];
	resume_packet: WorktreeDispatchResumePacket;
}

export interface WorktreeDispatchEvidence {
	dispatch_id: string;
	selected_task_ids: string[];
	blocked_task_ids: string[];
	candidate_task_ids: string[];
	skipped: RoadmapDispatchSkip[];
	pause_reasons: string[];
	budget: {
		max_workers: number;
		max_sessions?: number;
		max_subagents?: number;
	};
}

export interface WorktreeDispatchPlan {
	status: "ready" | "partial" | "blocked";
	assignments: WorktreeDispatchAssignment[];
	blocked: WorktreeDispatchBlockedTask[];
	wait_queue: ParallelSchedulerPlan["wait_queue"];
	publisher_queue: ParallelSchedulerPlan["publisher_queue"];
	evidence: WorktreeDispatchEvidence;
	raw_scheduler_plan: ParallelSchedulerPlan;
}

function stableHash(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")
		.slice(0, 16);
}

function maxWorkers(input: WorktreeDispatcherInput): number {
	const budget = input.budget || {};
	const configured =
		input.max_workers ?? budget.maxSubagents ?? budget.maxSessions ?? 1;
	return Math.max(1, Math.floor(Number(configured || 1)));
}

function taskContextPath(taskId: string): string {
	return `.codewiki/roadmap/tasks/${taskId}/context.json`;
}

function taskSourceRefs(candidate: RoadmapDispatchCandidate): string[] {
	const task = candidate.task;
	return unique([
		`.codewiki/roadmap/tasks/${task.id}/task.json`,
		taskContextPath(task.id),
		...task.spec_paths,
		...task.code_paths,
	]);
}

function resumePacket(
	candidate: RoadmapDispatchCandidate,
): WorktreeDispatchResumePacket {
	const sourceRefs = taskSourceRefs(candidate);
	const intent = `Implement ${candidate.task.id} from CodeWiki source refs in an isolated worktree; do not use parent chat context.`;
	return {
		task_id: candidate.task.id,
		context_path: taskContextPath(candidate.task.id),
		source_refs: sourceRefs,
		follow_up_intent: intent,
		prompt: [
			`Implement roadmap task ${candidate.task.id} for CodeWiki.`,
			`Use wiki_resume_context for ${candidate.task.id} and read source refs directly.`,
			"Do not share parent chat context; coordinate through artifact status and validation gates.",
		].join("\n"),
		command: `wiki_resume_context taskId=${candidate.task.id}`,
		chat_context_shared: false,
	};
}

function schedulerTask(
	candidate: RoadmapDispatchCandidate,
): SchedulerTaskInput {
	return {
		task_id: candidate.task.id,
		title: candidate.task.title,
		sprint_ids: candidate.sprint_ids,
		code_paths: candidate.task.code_paths,
		spec_paths: candidate.task.spec_paths,
		source_refs: taskSourceRefs(candidate),
	};
}

function freshWorkerRequest(
	candidate: RoadmapDispatchCandidate,
): WorktreeDispatchFreshWorkerRequest {
	const contextPath = taskContextPath(candidate.task.id);
	return {
		role: "builder",
		task_id: candidate.task.id,
		context_path: contextPath,
		trace_refs: taskSourceRefs(candidate),
		gate_refs: ["gate:implementation"],
		git_refs: [],
		content_requirements: [
			"clean worktree or working_tree_digest+patch/worktree handoff before validation",
		],
		command: `pi --mode json -p --no-session "$(cat ${contextPath})"`,
		chat_context_shared: false,
	};
}

function pauseReasons(input: {
	assignments: WorktreeDispatchAssignment[];
	blocked: WorktreeDispatchBlockedTask[];
	candidates: RoadmapDispatchCandidate[];
	scheduler: ParallelSchedulerPlan;
}): string[] {
	const reasons: string[] = [];
	if (input.candidates.length === 0) reasons.push("no eligible roadmap tasks");
	if (input.assignments.length === 0 && input.blocked.length > 0)
		reasons.push("all eligible tasks blocked");
	for (const blocked of input.blocked) {
		reasons.push(`${blocked.task_id}: ${blocked.reason}`);
	}
	if (input.scheduler.publisher_queue.status === "blocked")
		reasons.push("publisher queue busy");
	if (input.scheduler.publisher_queue.status === "waiting_validation")
		reasons.push("publisher queue waiting for validation refs");
	return unique(reasons);
}

function blockedCandidate(
	candidates: RoadmapDispatchCandidate[],
	taskId: string,
): RoadmapDispatchCandidate {
	return (
		candidates.find((candidate) => candidate.task.id === taskId) || {
			task: {
				id: taskId,
				title: taskId,
				status: "todo",
				priority: "low",
				kind: "task",
				summary: "",
				spec_paths: [],
				code_paths: [],
				research_ids: [],
				labels: [],
				goal: { outcome: "", acceptance: [], non_goals: [], verification: [] },
				delta: { desired: "", current: "", closure: "" },
				created: "",
				updated: "",
			},
			order_index: 9999,
			priority_rank: 99,
			sprint_ids: [],
		}
	);
}

export async function planParallelWorktreeDispatch(
	project: WikiProject,
	input: WorktreeDispatcherInput = {},
): Promise<WorktreeDispatchPlan> {
	const roadmap =
		input.roadmap ||
		(await readRoadmapFile(resolve(project.root, project.roadmapPath)));
	const artifactStatuses =
		input.artifact_statuses ||
		buildChangeClaimState(await readChangeClaimsFile(project))
			.artifact_statuses ||
		[];
	const selection = selectRoadmapDispatchCandidates(roadmap, {
		includeBlocked: input.include_blocked,
	});
	const candidateTasks = selection.candidates.map(schedulerTask);
	const workerLimit = maxWorkers(input);
	const scheduler = computeParallelSchedulerPlan(project, {
		tasks: candidateTasks,
		artifact_statuses: artifactStatuses,
		max_sessions: workerLimit,
		session_id_prefix: input.session_id_prefix || "dispatch",
		base_sha: input.base_sha,
	});
	const candidateById = new Map(
		selection.candidates.map((candidate) => [candidate.task.id, candidate]),
	);
	const assignments: WorktreeDispatchAssignment[] = scheduler.allocations.map(
		(allocation, index) => {
			const candidate =
				candidateById.get(allocation.task_id) ||
				blockedCandidate(selection.candidates, allocation.task_id);
			return {
				worker_id: `worker-${String(index + 1).padStart(2, "0")}`,
				partition_id: allocation.partition_id,
				task_id: allocation.task_id,
				title: candidate.task.title,
				priority: candidate.task.priority,
				order_index: candidate.order_index,
				sprint_ids: allocation.sprint_ids,
				scopes: allocation.scopes,
				worktrees: allocation.roles,
				artifact_claim: {
					action: "mark",
					mode: "write",
					role: "builder",
					task_id: allocation.task_id,
					scopes: allocation.scopes,
					ttl_minutes: input.claim_ttl_minutes || allocation.claim.ttl_minutes,
					summary: `Dispatch isolated builder for ${allocation.task_id}.`,
					worktree: allocation.roles.builder.metadata,
				},
				resume_packet: resumePacket(candidate),
				fresh_worker_request: freshWorkerRequest(candidate),
			};
		},
	);
	const blocked = scheduler.blocked.map((item) => {
		const candidate = blockedCandidate(selection.candidates, item.task_id);
		return {
			task_id: item.task_id,
			reason: item.reason,
			blocked_by_task_ids: item.blocked_by_task_ids,
			blockers: item.blockers,
			scopes: item.scopes,
			wait: item.wait,
			resume_packet: resumePacket(candidate),
		};
	});
	const evidenceBasis = {
		selected_task_ids: assignments.map((assignment) => assignment.task_id),
		blocked_task_ids: blocked.map((item) => item.task_id),
		candidate_task_ids: selection.candidates.map(
			(candidate) => candidate.task.id,
		),
		max_workers: workerLimit,
	};
	const evidence: WorktreeDispatchEvidence = {
		dispatch_id: `dispatch-${stableHash(evidenceBasis)}`,
		selected_task_ids: evidenceBasis.selected_task_ids,
		blocked_task_ids: evidenceBasis.blocked_task_ids,
		candidate_task_ids: evidenceBasis.candidate_task_ids,
		skipped: selection.skipped,
		pause_reasons: pauseReasons({
			assignments,
			blocked,
			candidates: selection.candidates,
			scheduler,
		}),
		budget: {
			max_workers: workerLimit,
			...(input.budget?.maxSessions
				? { max_sessions: input.budget.maxSessions }
				: {}),
			...(input.budget?.maxSubagents
				? { max_subagents: input.budget.maxSubagents }
				: {}),
		},
	};
	return {
		status:
			assignments.length === 0 && blocked.length > 0
				? "blocked"
				: blocked.length > 0
					? "partial"
					: "ready",
		assignments,
		blocked,
		wait_queue: scheduler.wait_queue,
		publisher_queue: scheduler.publisher_queue,
		evidence,
		raw_scheduler_plan: scheduler,
	};
}
