import type { RoadmapTaskGoal, RoadmapTaskInput, RoadmapTaskRecord } from "./types.ts";
import { isOpenRoadmapStatus } from "./status.ts";

export interface RoadmapTaskBoundaryAssessment {
	executable: boolean;
	container: boolean;
	reasons: string[];
	acceptance_count: number;
	delegated_acceptance_count: number;
}

type TaskBoundaryInput = Partial<Pick<RoadmapTaskRecord, "id" | "title" | "kind" | "summary" | "labels" | "status" | "goal" | "delta">> | RoadmapTaskInput;

const CONTAINER_LABELS = new Set(["umbrella", "container", "epic", "sprint"]);
const CONTAINER_KINDS = new Set(["umbrella", "container", "epic", "sprint"]);

const CONTAINER_TEXT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /\bumbrella\b/i, reason: "uses umbrella wording" },
	{ pattern: /\bcontainer\s+(?:task|work|item)\b/i, reason: "describes a container task" },
	{ pattern: /\bepic\s+(?:task|work|item)?\b/i, reason: "describes an epic instead of a task" },
	{ pattern: /\bparent\s+task\b/i, reason: "describes a parent task" },
	{ pattern: /\bcoordination\s+task\b/i, reason: "describes a coordination task" },
	{ pattern: /\bcluster\s+of\s+(?:related\s+)?tasks\b/i, reason: "clusters other tasks" },
	{ pattern: /\b(?:only|just)\s+to\s+(?:group|coordinate|close)\b/i, reason: "exists only to group, coordinate, or close other work" },
	{ pattern: /\bclose\s+(?:all\s+)?(?:children|child\s+tasks|tasks)\b/i, reason: "delegates closure to child tasks" },
	{ pattern: /\bcoordinate\s+(?:child\s+)?tasks\b/i, reason: "coordinates child tasks instead of owning work" },
];

function asStringList(value: unknown): string[] {
	return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function taskGoal(task: TaskBoundaryInput): Partial<RoadmapTaskGoal> {
	return task.goal && typeof task.goal === "object" ? task.goal : {};
}

function textForAssessment(task: TaskBoundaryInput): string {
	const goal = taskGoal(task);
	const delta = task.delta && typeof task.delta === "object" ? task.delta : {};
	return [
		task.title,
		task.summary,
		goal.outcome,
		...asStringList(goal.acceptance),
		(delta as any).desired,
		(delta as any).current,
	].map((item) => String(item || "").trim()).filter(Boolean).join("\n");
}

function delegatedAcceptanceCriteria(task: TaskBoundaryInput): string[] {
	const id = String(task.id || "").trim().toUpperCase();
	const acceptance = asStringList(taskGoal(task).acceptance);
	return acceptance.filter((criterion) => {
		const upper = criterion.toUpperCase();
		const refs = upper.match(/\bTASK-\d+\b/g) || [];
		const otherRefs = refs.filter((ref) => ref !== id);
		if (otherRefs.length === 0) return false;
		return /\b(?:clos(?:e|ed|es|ing)|done|pass(?:ed|es|ing)?|evidence|validated?)\b/i.test(criterion);
	});
}

export function assessRoadmapTaskBoundary(task: TaskBoundaryInput): RoadmapTaskBoundaryAssessment {
	const reasons: string[] = [];
	const labels = asStringList(task.labels).map((label) => label.toLowerCase());
	for (const label of labels) {
		if (CONTAINER_LABELS.has(label)) reasons.push(`container label: ${label}`);
	}

	const kind = String(task.kind || "").trim().toLowerCase();
	if (CONTAINER_KINDS.has(kind)) reasons.push(`container kind: ${kind}`);

	const text = textForAssessment(task);
	for (const { pattern, reason } of CONTAINER_TEXT_PATTERNS) {
		if (pattern.test(text)) reasons.push(reason);
	}

	const acceptance = asStringList(taskGoal(task).acceptance);
	const delegated = delegatedAcceptanceCriteria(task);
	if (delegated.length >= 2 && delegated.length >= Math.ceil(acceptance.length / 2)) {
		reasons.push(`acceptance delegates closure to other tasks (${delegated.length}/${acceptance.length})`);
	}

	const uniqueReasons = [...new Set(reasons)];
	return {
		executable: uniqueReasons.length === 0,
		container: uniqueReasons.length > 0,
		reasons: uniqueReasons,
		acceptance_count: acceptance.length,
		delegated_acceptance_count: delegated.length,
	};
}

export function isExecutableRoadmapTask(task: TaskBoundaryInput): boolean {
	return assessRoadmapTaskBoundary(task).executable;
}

export const isOpenRoadmapTaskStatus = isOpenRoadmapStatus;

export function assertExecutableRoadmapTask(task: TaskBoundaryInput, action = "roadmap mutation"): void {
	if (!isOpenRoadmapStatus(task.status)) return;
	const assessment = assessRoadmapTaskBoundary(task);
	if (assessment.executable) return;
	const id = String(task.id || "new task").trim();
	throw new Error(`${action} blocked for ${id}: roadmap tasks must be self-contained executable work; use a sprint for grouping. ${assessment.reasons.join("; ")}`);
}
