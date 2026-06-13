import type { IsoTimestamp } from "../utils/time.ts";

export type TraceLoop = "decision" | "planning" | "implementation";
export type TraceRecordType = "trace_head" | "trace_event" | "tail_checkpoint";
export type TraceRecord = TraceHead | TraceEvent | TailCheckpoint;

export interface TraceHead {
	type: "trace_head";
	traceId: string;
	title: string;
	createdAt: IsoTimestamp;
}

export interface TraceEvent {
	type: "trace_event";
	id: string;
	parentId: string | null;
	traceId: string;
	sequence: number;
	loop: TraceLoop;
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

export interface LoopIterationExit {
	status: LoopExitStatus;
	conditions: LoopExitConditionResult[];
	targetLoop?: TraceLoop | null;
	nextAction?: string;
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

export interface ExitCriterionResult {
	id: string;
	status: ExitCriterionStatus;
	message?: string;
	refs?: string[];
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

export interface ExitDetails {
	verdict: ExitVerdict;
	criteria: ExitCriterionResult[];
	findings: ExitFinding[];
	remediation: ExitRemediationItem[];
	route: ExitRoute;
}
