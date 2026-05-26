import type { AgencyBudget } from "../../agency/types.ts";
import type { ChangeType, LegacyChangeClass } from "../../change/types.ts";

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
export const SPRINT_STATUS_VALUES = ["planned", "active", "review", "closed", "cancelled"] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUS_VALUES)[number];
export type RoadmapPriority = (typeof ROADMAP_PRIORITY_VALUES)[number];
export type ToolTaskStatus = (typeof TOOL_TASK_STATUS_VALUES)[number];
export type TaskEvidenceResult = (typeof TASK_EVIDENCE_RESULT_VALUES)[number];
export type SprintStatus = (typeof SPRINT_STATUS_VALUES)[number];

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
