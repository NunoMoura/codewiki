import type { TraceEvent, TraceRecord } from "./types.ts";

export function eventsForLoop(records: TraceRecord[], loop: TraceEvent["loop"]): TraceEvent[] {
	return records.filter((record): record is TraceEvent => record.type === "trace_event" && record.loop === loop);
}
