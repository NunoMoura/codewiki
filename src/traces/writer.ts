import { assertValidTraceRecord } from "./schema.ts";
import type { TailCheckpoint, TraceHead, TraceRecord } from "./types.ts";

export interface CreateTraceHeadInput {
	traceId: string;
	title: string;
	createdAt?: string;
}

export interface CreateTailCheckpointInput {
	id: string;
	parentId: string | null;
	traceId: string;
	firstKeptRecordId: string;
	summary: string;
	createdAt?: string;
	data?: Record<string, unknown>;
}

export function createTraceHead(input: CreateTraceHeadInput): TraceHead {
	return {
		type: "trace_head",
		traceId: input.traceId.trim(),
		title: input.title.trim(),
		createdAt: input.createdAt || new Date().toISOString(),
	};
}

export function createTailCheckpoint(
	input: CreateTailCheckpointInput,
): TailCheckpoint {
	return {
		type: "tail_checkpoint",
		id: input.id.trim(),
		parentId: input.parentId,
		traceId: input.traceId.trim(),
		firstKeptRecordId: input.firstKeptRecordId.trim(),
		summary: input.summary.trim(),
		createdAt: input.createdAt || new Date().toISOString(),
		...(input.data ? { data: input.data } : {}),
	};
}

export function formatTraceLine(record: TraceRecord): string {
	return `${JSON.stringify(assertValidTraceRecord(record))}\n`;
}

export function formatTraceText(records: TraceRecord[]): string {
	return records.map(formatTraceLine).join("");
}
