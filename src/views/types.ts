import type { TraceLoop, TraceRecord } from "../traces/types.ts";

export type ViewHealth = "green" | "yellow" | "red";
export type WorkPlanCardStatus = "todo" | "blocked" | "active" | "done";

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
	pathScopes: string[];
	verification: string[];
	dependsOn: string[];
	implementationRefs: string[];
	blockers: string[];
}

export interface WorkPlanView {
	generatedAt?: string;
	traceId?: string;
	cards: WorkPlanCard[];
}

export interface StatusView {
	generatedAt?: string;
	traceId?: string;
	title?: string;
	health: ViewHealth;
	currentLoop: TraceLoop | null;
	readyForClosure: boolean;
	lastEventId?: string;
	summary: ViewSummary;
	blockers: string[];
	sourceRefs: string[];
}

export interface ResumeView {
	generatedAt?: string;
	traceId: string;
	title?: string;
	nextAction: string;
	currentLoop: TraceLoop | null;
	activeWorkUnitId?: string;
	lastEventId?: string;
	sourceRefs: string[];
	blockers: string[];
}

export interface BlockerView {
	id: string;
	ownerRef: string;
	routeBack: string;
	kind: "deferred" | "route-back" | "conflict" | "gate";
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
