import { readFile } from "node:fs/promises";
import { parseJsonObject } from "../utils/json.ts";
import { assertValidTraceRecord } from "./schema.ts";
import type { TraceFile, TraceRecord } from "./types.ts";

export function parseTraceLine(line: string): TraceRecord {
	const trimmed = line.trim();
	if (trimmed.length === 0) throw new Error("Trace line is empty.");
	return assertValidTraceRecord(parseJsonObject<unknown>(trimmed));
}

export function parseTraceText(text: string): TraceRecord[] {
	const lines = text.split(/\r?\n/);
	return lines.flatMap((line, index) => {
		const isTrailingBlank = index === lines.length - 1 && line.trim() === "";
		if (isTrailingBlank) return [];
		if (line.trim() === "")
			throw new Error(`Trace line ${index + 1} is empty.`);
		return [parseTraceLine(line)];
	});
}

export async function readTraceFile(path: string): Promise<TraceRecord[]> {
	return parseTraceText(await readFile(path, "utf8"));
}

export async function readTrace(path: string): Promise<TraceFile> {
	const records = await readTraceFile(path);
	const head = records[0];
	if (!head || head.type !== "trace_head") {
		throw new Error("Trace file must start with trace_head.");
	}
	return { head, records };
}
