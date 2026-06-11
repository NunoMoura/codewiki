import { parseJsonObject } from "../utils/json.ts";
import type { TraceRecord } from "./types.ts";

export function parseTraceLine(line: string): TraceRecord {
	const trimmed = line.trim();
	if (trimmed.length === 0) throw new Error("Trace line is empty.");
	const record = parseJsonObject<TraceRecord>(trimmed);
	if (typeof record.type !== "string") throw new Error("Trace line missing type.");
	return record;
}
