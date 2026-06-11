import type { TraceRecord } from "./types.ts";

export function formatTraceLine(record: TraceRecord): string {
	return `${JSON.stringify(record)}\n`;
}
