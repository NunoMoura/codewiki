import type { TraceRecord } from "./types.ts";
import { formatTraceLine } from "./writer.ts";

export interface AppendPlan {
	expectedBytes: number;
	line: string;
}

export function planTraceAppend(record: TraceRecord, expectedBytes: number): AppendPlan {
	return { expectedBytes, line: formatTraceLine(record) };
}
