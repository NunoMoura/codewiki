import type { TraceEvent } from "./types.ts";

export function traceEventKey(event: TraceEvent): string {
	return `${event.traceId}:${event.sequence}`;
}
