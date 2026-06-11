import type { TraceEvent } from "./types.ts";

export function parseTraceLine(line: string): TraceEvent {
	return JSON.parse(line) as TraceEvent;
}
