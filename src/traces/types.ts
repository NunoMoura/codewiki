import type { IsoTimestamp } from "../utils/time.ts";

export type TraceLoop = "decision" | "planning" | "implementation" | "runtime";
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
