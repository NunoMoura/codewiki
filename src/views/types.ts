import type { PlanningTrigger } from "../planning/types.ts";
import type {
	LoopQualityStandardMode,
	LoopQualityStandardStatus,
	TraceLoop,
	TraceOrigin,
	TraceRecord,
} from "../traces/types.ts";

export type ViewHealth = "green" | "yellow" | "red";
export type WorkPlanCardStatus = "todo" | "blocked" | "active" | "done";
export type WorkQueueItemStatus =
	| "backlog"
	| "waiting"
	| "ready"
	| "claimed"
	| "blocked"
	| "done";
export type WorkQueueItemKind = "decision" | "work-unit";
export type TraceGoalResolutionStatus =
	| "needs_decision"
	| "needs_planning"
	| "needs_implementation"
	| "blocked"
	| "deferred"
	| "finished";
export type TraceGoalStatus =
	| TraceGoalResolutionStatus
	| "closed_complete"
	| "closed_incomplete";
export type TriggerStatus =
	| "planned"
	| "enabled"
	| "due"
	| "active"
	| "completed"
	| "blocked"
	| "disabled";
export type QualityStandardSummaryStatus =
	| LoopQualityStandardStatus
	| "missing";

export interface QualityStandardSummary {
	id: string;
	status: QualityStandardSummaryStatus;
	mode: LoopQualityStandardMode;
	weight?: number;
	description: string;
	message?: string;
	refs: string[];
	evidenceRefs?: string[];
}

export interface LoopQualitySummary {
	total: number;
	met: number;
	unmet: number;
	blocked: number;
	missing: number;
}

export interface QualityIterationSummary {
	loop: TraceLoop;
	traceId: string;
	eventId: string;
	exitStatus: string;
	ready: boolean;
	standards: QualityStandardSummary[];
	blockers: string[];
	refs: string[];
	sourceEventId: string;
}

export interface QualityView {
	generatedAt?: string;
	traceId?: string;
	summary: Record<TraceLoop, LoopQualitySummary>;
	iterations: QualityIterationSummary[];
	blockers: string[];
}

export interface TraceViewInput {
	records: TraceRecord[];
	generatedAt?: string;
}

export interface ViewSummary {
	decisionEvents: number;
	workUnits: number;
	implementationChanges: number;
	blockers: number;
	conflicts: number;
}

export interface WorkPlanCard {
	id: string;
	title: string;
	status: WorkPlanCardStatus;
	traceRefs: string[];
	decisionRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	planningDepth: string;
	verification: string[];
	dependsOn: string[];
	trigger?: PlanningTrigger;
	implementationRefs: string[];
	blockers: string[];
	qualityStandards: QualityStandardSummary[];
	qualityBlockers: string[];
}

export interface WorkPlanView {
	generatedAt?: string;
	traceId?: string;
	cards: WorkPlanCard[];
}

export interface WorkQueueItem {
	id: string;
	kind: WorkQueueItemKind;
	status: WorkQueueItemStatus;
	traceId: string;
	title: string;
	traceRefs: string[];
	decisionRefs: string[];
	planningRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	dependsOn: string[];
	trigger?: PlanningTrigger;
	blockers: string[];
	qualityStandards: QualityStandardSummary[];
	qualityBlockers: string[];
	claimedBy?: string;
	claimExpiresAt?: string;
	sourceEventId?: string;
}

export interface WorkQueueView {
	generatedAt?: string;
	traceIds: string[];
	summary: Record<WorkQueueItemStatus, number>;
	items: WorkQueueItem[];
}

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
	decisionRefs: string[];
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

export interface TraceGoalView {
	generatedAt?: string;
	traceId: string;
	title?: string;
	origin?: TraceOrigin;
	status: TraceGoalStatus;
	closable: boolean;
	closed: boolean;
	closedAt?: string;
	closeReason?: string;
	decisionRefs: string[];
	plannedDecisionRefs: string[];
	unresolvedDecisionRefs: string[];
	deferredDecisionRefs: string[];
	workUnitRefs: string[];
	incompleteWorkUnitRefs: string[];
	pathScopes: string[];
	blockers: string[];
	lastEventId?: string;
}

export interface TraceBoardConflict {
	leftTraceId: string;
	rightTraceId: string;
	pathScope: string;
	message: string;
}

export interface TraceBoardView {
	generatedAt?: string;
	traceIds: string[];
	summary: Record<TraceGoalStatus, number>;
	traces: TraceGoalView[];
	conflicts: TraceBoardConflict[];
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

export interface BlockerView {
	id: string;
	ownerRef: string;
	routeBack: string;
	kind: "deferred" | "route-back" | "conflict" | "exit";
	message: string;
	traceRefs: string[];
	sourceEventId?: string;
}

export interface BlockersView {
	generatedAt?: string;
	traceId?: string;
	blockers: BlockerView[];
}

export interface ConflictView {
	leftRef: string;
	rightRef: string;
	pathScope: string;
	traceRefs: string[];
}

export interface ConflictsView {
	generatedAt?: string;
	traceId?: string;
	conflicts: ConflictView[];
}
