import type { TraceEvent } from "./types.ts";

export function formatTraceLine(event: TraceEvent): string {
	return `${JSON.stringify(event)}\n`;
}
