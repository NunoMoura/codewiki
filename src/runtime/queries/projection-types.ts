import type {PlanningTrigger} from "../../planning/types.ts";
import type {
	TraceLoop,
	TraceOrigin,
} from "../../changes/trace/types.ts";
import type {
	QualityView,
	TraceGoalStatus,
	WorkQueueItemKind,
	WorkQueueItemStatus,
} from "../../work-state/projection-types.ts";

export type ViewHealth = "green" | "yellow" | "red";

export interface ViewSummary {
	decisionEvents: number;
	workUnits: number;
	implementationChanges: number;
	blockers: number;
	conflicts: number;
}

export interface TraceQueueItem {
	id: string;
	kind: WorkQueueItemKind;
	status: WorkQueueItemStatus;
	title: string;
	changeRefs: string[];
	planningRefs: string[];
	pathScopes: string[];
	blockers: string[];
}

export interface TraceQueueCard {
	traceId: string;
	title: string;
	status: TraceGoalStatus;
	closed: boolean;
	changeRefs: string[];
	rowCount: number;
	plannedChangeRefs: string[];
	unresolvedChangeRefs: string[];
	workUnitRefs: string[];
	pathScopes: string[];
	blockers: string[];
	nextLoop?: TraceLoop | "archive";
	items: TraceQueueItem[];
}

export interface TraceQueueView {
	generatedAt?: string;
	traceIds: string[];
	summary: Record<TraceGoalStatus, number>;
	cards: TraceQueueCard[];
}

export type TriggerStatus =
	| "planned"
	| "enabled"
	| "due"
	| "active"
	| "completed"
	| "blocked"
	| "disabled";
export type TriggerDueStatus = "due" | "not_due" | "invalid";

export interface TriggerDueView {
	status: TriggerDueStatus;
	reason: string;
	scheduledAt?: string;
	runKey?: string;
	traceId?: string;
}

export interface TriggerRunView {
	traceId: string;
	title?: string;
	status: TraceGoalStatus;
	closed: boolean;
	closedAt?: string;
	triggerTraceId: string;
	triggerId: string;
	planningRef: string;
	runKey: string;
	refs: string[];
}

export interface TriggerView {
	id: string;
	status: TriggerStatus;
	traceId: string;
	traceTitle?: string;
	workUnitId: string;
	planningRef: string;
	changeRefs: string[];
	pathScopes: string[];
	trigger: PlanningTrigger;
	enabledBy: string[];
	enabledAt?: string;
	due?: TriggerDueView;
	runs: TriggerRunView[];
	qualityBlockers: string[];
	refs: string[];
	sourceEventId: string;
}

export interface TriggersView {
	generatedAt?: string;
	traceIds: string[];
	summary: Record<TriggerStatus, number>;
	triggers: TriggerView[];
}

export interface StatusView {
	generatedAt?: string;
	traceId?: string;
	title?: string;
	origin?: TraceOrigin;
	health: ViewHealth;
	currentLoop: TraceLoop | null;
	readyForClosure: boolean;
	goalStatus?: TraceGoalStatus;
	closed?: boolean;
	closedAt?: string;
	closeReason?: string;
	lastEventId?: string;
	summary: ViewSummary;
	blockers: string[];
	qualityBlockers: string[];
	quality?: QualityView;
	sourceRefs: string[];
}

export interface ResumeView {
	generatedAt?: string;
	traceId: string;
	title?: string;
	nextAction: string;
	currentLoop: TraceLoop | null;
	closed?: boolean;
	closedAt?: string;
	closeReason?: string;
	activeWorkUnitId?: string;
	lastEventId?: string;
	sourceRefs: string[];
	blockers: string[];
	qualityBlockers: string[];
	quality?: QualityView;
}
