import type { TraceEvent } from "./types.ts";

export function replayTrace(events: TraceEvent[]): TraceEvent[] {
	return [...events].sort((left, right) => left.sequence - right.sequence);
}
