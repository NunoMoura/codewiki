import type {PlanningTrigger} from "../planning/types.ts";
import type {
	LoopQualityStandardGate,
	LoopQualityStandardMode,
	LoopQualityStandardStatus,
	TraceLoop,
	TraceOrigin,
	TraceRecord,
} from "../changes/trace/types.ts";

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
	standardType?: string;
	layer?: string;
	gate?: LoopQualityStandardGate | string;
	score?: number;
	scoreThreshold?: number;
	refs: string[];
	evidenceRefs?: string[];
}

export interface LoopQualitySummary {
	total: number;
	met: number;
	unmet: number;
	blocked: number;
	missing: number;
	notApplicable?: number;
	escalated?: number;
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

export interface WorkPlanCard {
	id: string;
	title: string;
	status: WorkPlanCardStatus;
	traceRefs: string[];
	changeRefs: string[];
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
	changeRefs: string[];
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
	changeRefs: string[];
	plannedChangeRefs: string[];
	unresolvedChangeRefs: string[];
	deferredChangeRefs: string[];
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
