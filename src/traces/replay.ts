import type { TraceEvent, TraceRecord } from "./types.ts";

export function replayEvents(records: TraceRecord[]): TraceEvent[] {
	return records
		.filter((record): record is TraceEvent => record.type === "trace_event")
		.sort((left, right) => left.sequence - right.sequence);
}
