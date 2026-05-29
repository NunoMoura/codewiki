import type { RoadmapFile, RoadmapStatus, RoadmapTaskRecord } from "./types.ts";
import { isClosedRoadmapStatus } from "./runtime.ts";
import { assessRoadmapTaskBoundary } from "./task-boundary.ts";

export interface RoadmapDispatchCandidate {
	task: RoadmapTaskRecord;
	order_index: number;
	priority_rank: number;
	sprint_ids: string[];
}

export interface RoadmapDispatchSkip {
	task_id: string;
	reason: "closed" | "blocked" | "non_executable";
	detail: string;
}

export interface RoadmapDispatchSelection {
	candidates: RoadmapDispatchCandidate[];
	skipped: RoadmapDispatchSkip[];
}

const PRIORITY_RANK: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

function rankPriority(priority: string): number {
	return PRIORITY_RANK[priority] ?? 99;
}

function sprintIdsForTask(roadmap: RoadmapFile, taskId: string): string[] {
	const sprints = roadmap.sprints || {};
	return Object.values(sprints)
		.filter((sprint) => sprint.task_ids?.includes(taskId))
		.map((sprint) => sprint.id)
		.sort();
}

export function orderedRoadmapTasks(roadmap: RoadmapFile): RoadmapTaskRecord[] {
	const seen = new Set<string>();
	const ordered: RoadmapTaskRecord[] = [];
	for (const taskId of roadmap.order || []) {
		const task = roadmap.tasks[taskId];
		if (!task || seen.has(task.id)) continue;
		seen.add(task.id);
		ordered.push(task);
	}
	for (const task of Object.values(roadmap.tasks || {})) {
		if (!task || seen.has(task.id)) continue;
		seen.add(task.id);
		ordered.push(task);
	}
	return ordered;
}

export function selectRoadmapDispatchCandidates(
	roadmap: RoadmapFile,
	input: { statuses?: RoadmapStatus[]; includeBlocked?: boolean } = {},
): RoadmapDispatchSelection {
	const statuses = new Set<RoadmapStatus>(input.statuses || ["todo", "in_progress"]);
	const skipped: RoadmapDispatchSkip[] = [];
	const candidates: RoadmapDispatchCandidate[] = [];
	for (const [orderIndex, task] of orderedRoadmapTasks(roadmap).entries()) {
		if (isClosedRoadmapStatus(task.status)) {
			skipped.push({ task_id: task.id, reason: "closed", detail: `status=${task.status}` });
			continue;
		}
		if (!input.includeBlocked && task.status === "blocked") {
			skipped.push({ task_id: task.id, reason: "blocked", detail: "roadmap status is blocked" });
			continue;
		}
		if (!statuses.has(task.status)) continue;
		const boundary = assessRoadmapTaskBoundary(task);
		if (!boundary.executable) {
			skipped.push({
				task_id: task.id,
				reason: "non_executable",
				detail: boundary.reasons.join("; "),
			});
			continue;
		}
		candidates.push({
			task,
			order_index: orderIndex,
			priority_rank: rankPriority(task.priority),
			sprint_ids: sprintIdsForTask(roadmap, task.id),
		});
	}
	candidates.sort((a, b) =>
		a.priority_rank - b.priority_rank ||
		a.order_index - b.order_index ||
		a.task.id.localeCompare(b.task.id),
	);
	return { candidates, skipped };
}
