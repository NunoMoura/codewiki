import type { IsoTimestamp } from "../utils/time.ts";

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
	loop: "decision" | "planning" | "implementation" | "runtime";
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
}
