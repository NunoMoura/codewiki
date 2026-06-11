import { latestTailCheckpoint, replayTrace } from "./replay.ts";
import type { TraceRecord } from "./types.ts";

export interface TraceRetentionStub {
	traceId: string;
	title: string;
	headRef: string;
	gitRestoreRef: string;
	firstKeptRecordId?: string;
	summary?: string;
	createdAt: string;
}

export interface TraceRetentionStubInput {
	records: TraceRecord[];
	gitRestoreRef: string;
	headRef?: string;
}

export function buildTraceRetentionStub(input: TraceRetentionStubInput): TraceRetentionStub {
	const state = replayTrace(input.records);
	const checkpoint = latestTailCheckpoint(input.records);
	return {
		traceId: state.head.traceId,
		title: state.head.title,
		headRef: input.headRef || state.head.traceId,
		gitRestoreRef: input.gitRestoreRef.trim(),
		...(checkpoint
			? {
					firstKeptRecordId: checkpoint.firstKeptRecordId,
					summary: checkpoint.summary,
				}
			: {}),
		createdAt: state.head.createdAt,
	};
}

export function traceRetentionRefs(stub: TraceRetentionStub): string[] {
	return [stub.headRef, stub.gitRestoreRef, stub.firstKeptRecordId]
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
}
