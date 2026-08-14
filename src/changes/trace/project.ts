import type {
	TailCheckpoint,
	TraceEvent,
	TraceHead,
	TraceRecord,
} from "./types.ts";

export interface ProjectTraceFold {
	traceIds: string[];
	heads: TraceHead[];
	events: TraceEvent[];
	checkpoints: TailCheckpoint[];
	recordsByTrace: Record<string, TraceRecord[]>;
}

export function foldProjectTraceRecords(
	records: TraceRecord[],
): ProjectTraceFold {
	const recordsByTrace = new Map<string, TraceRecord[]>();
	for (const record of records) {
		const traceId = record.traceId;
		recordsByTrace.set(traceId, [
			...(recordsByTrace.get(traceId) || []),
			record,
		]);
	}
	const traceIds = Array.from(recordsByTrace.keys());
	const groupedRecords = Object.fromEntries(recordsByTrace.entries());
	return {
		traceIds,
		heads: records.filter(
			(record): record is TraceHead => record.type === "trace_head",
		),
		events: records
			.filter((record): record is TraceEvent => record.type === "trace_event")
			.sort(compareTraceEvents),
		checkpoints: records.filter(
			(record): record is TailCheckpoint => record.type === "tail_checkpoint",
		),
		recordsByTrace: groupedRecords,
	};
}

function compareTraceEvents(left: TraceEvent, right: TraceEvent): number {
	if (left.traceId !== right.traceId)
		return left.traceId.localeCompare(right.traceId);
	return left.sequence - right.sequence;
}
