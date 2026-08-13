import type { SemanticLoop } from "../semantic-loop.ts";

export type IsoTimestamp = string;
export type TraceLoop = SemanticLoop;
export type TraceRecordType =
	| "trace_head"
	| "trace_event"
	| "tail_checkpoint"
	| "trace_close";
export type TraceRecord = TraceHead | TraceEvent | TailCheckpoint | TraceClose;

export type TraceOriginKind =
	| "manual"
	| "trigger_run"
	| "amendment"
	| "retry"
	| "route_back"
	| string;

export interface TraceOrigin {
	kind: TraceOriginKind;
	parentTraceId?: string;
	triggerTraceId?: string;
	triggerId?: string;
	planningRef?: string;
	sourceRef?: string;
	runKey?: string;
	refs: string[];
}

export interface TraceHead {
	type: "trace_head";
	traceId: string;
	/** Stable Change identity when this trace records a persisted Change journey. */
	changeId?: string;
	title: string;
	createdAt: IsoTimestamp;
	origin?: TraceOrigin;
}

export type DecisionTraceEventName =
	| "change_received"
	| "change_revised"
	| "change_approved"
	| "change_deferred"
	| "change_rejected"
	| "change_withdrawn"
	| "user_input_required"
	| "decision_blocked";
export type PlanningTraceEventName =
	| "change_planned"
	| "change_replanned"
	| "change_resolved"
	| "work_units_created"
	| "decisions_resolved"
	| "route_back_requested"
	| "planning_blocked";
export type ImplementationTraceEventName =
	| "evidence_accepted"
	| "evidence_rejected"
	| "route_back_requested"
	| "implementation_blocked";
export type SemanticTraceEventName =
	| DecisionTraceEventName
	| PlanningTraceEventName
	| ImplementationTraceEventName;

export interface TraceEvent {
	type: "trace_event";
	id: string;
	parentId: string | null;
	traceId: string;
	sequence: number;
	loop?: TraceLoop;
	event: string;
	refs: string[];
	createdAt: IsoTimestamp;
	data?: Record<string, unknown>;
}

export interface TailCheckpoint {
	type: "tail_checkpoint";
	id: string;
	parentId: string | null;
	traceId: string;
	firstKeptRecordId: string;
	summary: string;
	createdAt: IsoTimestamp;
	data?: Record<string, unknown>;
}

export interface TraceClose {
	type: "trace_close";
	id: string;
	parentId: string | null;
	traceId: string;
	reason: string;
	gitRestoreRef: string;
	headRef: string;
	refs: string[];
	createdAt: IsoTimestamp;
	data?: Record<string, unknown>;
}

export interface TraceFile {
	head: TraceHead;
	records: TraceRecord[];
}

export type LoopExitStatus = "continue" | "exit" | "route_back" | "blocked";
export type LoopExitConditionStatus = "met" | "unmet" | "blocked";

export interface LoopExitConditionResult {
	id: string;
	status: LoopExitConditionStatus;
	message?: string;
	refs?: string[];
}

export type LoopRouteTarget = TraceLoop | "blocked" | "continue" | "close";
export type LoopRouteKind =
	| "advance"
	| "direct_implementation"
	| "clarification"
	| "authority_validation"
	| "scope_change"
	| "continue"
	| "blocked";
export type ImplementationMode = "tdd" | "targeted_checks";

export interface LoopRoutePlan {
	target: LoopRouteTarget;
	kind: LoopRouteKind | string;
	rationale: string;
	implementationMode?: ImplementationMode | string;
	refs?: string[];
}

export interface LoopIterationExit {
	status: LoopExitStatus;
	conditions: LoopExitConditionResult[];
	qualityGraph?: ExitQualityGraphRef;
	diagnostics?: LoopQualityDiagnostic[];
	qualityRunner?: LoopQualityRunnerSummary;
	targetLoop?: TraceLoop | null;
	nextAction?: string;
	routePlan?: LoopRoutePlan;
}

export interface LoopIterationProgress {
	changedRefs: string[];
	newlyMetConditions: string[];
	repeatedFailures: string[];
	unchangedStateDigests?: string[];
	budgetSpent?: string | number;
	nextSafeAction?: string;
}

export interface LoopIterationData {
	iteration: number;
	trigger: string;
	output: Record<string, unknown>;
	exit: LoopIterationExit;
	progress: LoopIterationProgress;
}

export type ExitVerdict = "pass" | "fail" | "block";
export type ExitRoute = TraceLoop | "user" | "observe" | "close";
export type ExitCriterionStatus = ExitVerdict;
export type LoopQualityStandardStatus =
	| "met"
	| "unmet"
	| "blocked"
	| "not_applicable"
	| "escalated";
export type LoopQualityStandardMode = "deterministic" | "agent" | "user";
export type LoopQualityStandardMethod =
	| "deterministic"
	| "agent_self_assessment"
	| "model_judge"
	| "human_authority"
	| "external_evidence";
export type LoopQualityStandardGate = "hard" | "soft" | "score_only";

export interface ExitCriterionResult {
	id: string;
	status: ExitCriterionStatus;
	message?: string;
	refs?: string[];
}

export interface ExitQualityGraphRef {
	id: string;
	version: string;
	schemaVersion: number;
	hash: string;
}

export interface LoopQualityStandardResult {
	id: string;
	status: LoopQualityStandardStatus;
	mode: LoopQualityStandardMode;
	weight?: number;
	description: string;
	message?: string;
	refs?: string[];
	evidenceRefs?: string[];
	graphId?: string;
	graphVersion?: string;
	graphHash?: string;
	layer?: string;
	standardType?: string;
	method?: LoopQualityStandardMethod | string;
	gate?: LoopQualityStandardGate | string;
	cost?: number;
	timeoutMs?: number;
	score?: number;
	scoreThreshold?: number;
	repairTarget?: string;
}

export interface ExitFinding {
	id: string;
	severity: "error" | "warning" | "info";
	criterion: string;
	message: string;
	refs: string[];
	rationale: string;
}

export interface ExitRemediationItem {
	action: string;
	route: ExitRoute;
	refs: string[];
	blocking: boolean;
}

export interface LoopQualityDiagnostic {
	standardId: string;
	severity: "blocking" | "warning" | "info";
	method?: LoopQualityStandardMethod | string;
	gate?: LoopQualityStandardGate | string;
	message: string;
	refs: string[];
	score?: number;
	scoreThreshold?: number;
	repair: string;
	repairTarget?: string;
	route?: ExitRoute;
}

export interface LoopQualityRunnerJudgeSummary {
	status: "pass" | "fail" | "block";
	promptVersion: string;
	cached: boolean;
	cacheKey: string;
	confidence?: number;
	score?: number;
}

export interface LoopQualityRunnerNodeSummary {
	id: string;
	method: string;
	gate: string;
	cost: number;
	status: "pass" | "fail" | "block" | "skip";
	latencyMs: number;
	score?: number;
	judge?: LoopQualityRunnerJudgeSummary;
	skippedBy?: string;
}

export interface LoopQualityRunnerSummary {
	graphId: string;
	graphVersion: string;
	status: "pass" | "fail" | "block";
	latencyMs: number;
	nodes: LoopQualityRunnerNodeSummary[];
}

export interface ExitDetails {
	verdict: ExitVerdict;
	criteria: ExitCriterionResult[];
	qualityStandards?: LoopQualityStandardResult[];
	qualityGraph?: ExitQualityGraphRef;
	findings: ExitFinding[];
	remediation: ExitRemediationItem[];
	diagnostics?: LoopQualityDiagnostic[];
	qualityRunner?: LoopQualityRunnerSummary;
	route: ExitRoute;
	routePlan?: LoopRoutePlan;
}
