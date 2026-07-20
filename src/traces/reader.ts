import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
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

export interface TraceFileSnapshot {
	records: TraceRecord[];
	bytes: number;
	endsWithNewline: boolean;
}

export async function readTraceFile(path: string): Promise<TraceRecord[]> {
	const snapshot = await readTraceFileSnapshot(path);
	return snapshot.records;
}

export async function readTraceFileSnapshot(
	path: string,
): Promise<TraceFileSnapshot> {
	return readTraceStream(path, 0);
}

export async function readLastTraceRecord(
	path: string,
): Promise<TraceRecord | undefined> {
	const handle = await open(path, "r");
	try {
		const { size } = await handle.stat();
		let position = size;
		let suffix = Buffer.alloc(0);
		while (position > 0) {
			const length = Math.min(64 * 1024, position);
			position -= length;
			const chunk = Buffer.allocUnsafe(length);
			const { bytesRead } = await handle.read(chunk, 0, length, position);
			const combined = Buffer.concat([chunk.subarray(0, bytesRead), suffix]);
			const end = lastContentByte(combined) + 1;
			if (end === 0) {
				suffix = Buffer.alloc(0);
				continue;
			}
			const newline = combined.lastIndexOf(0x0a, end - 1);
			if (newline !== -1) {
				return parseTraceLine(
					combined.subarray(newline + 1, end).toString("utf8"),
				);
			}
			suffix = combined.subarray(0, end);
		}
		return suffix.length ? parseTraceLine(suffix.toString("utf8")) : undefined;
	} finally {
		await handle.close();
	}
}

export async function readTraceFileTail(
	path: string,
	startByte: number,
): Promise<TraceFileSnapshot> {
	if (!Number.isSafeInteger(startByte) || startByte < 0) {
		throw new Error(
			"Trace tail startByte must be a non-negative safe integer.",
		);
	}
	return readTraceStream(path, startByte);
}

async function readTraceStream(
	path: string,
	startByte: number,
): Promise<TraceFileSnapshot> {
	const records: TraceRecord[] = [];
	const decoder = new StringDecoder("utf8");
	let pending = "";
	let lineNumber = 0;
	let bytes = 0;
	let endsWithNewline = true;
	for await (const chunk of createReadStream(path, { start: startByte })) {
		const buffer = chunk as Buffer;
		bytes += buffer.byteLength;
		endsWithNewline = buffer.at(-1) === 0x0a;
		pending += decoder.write(buffer);
		let newlineIndex = pending.indexOf("\n");
		while (newlineIndex !== -1) {
			lineNumber += 1;
			appendParsedLine(records, pending.slice(0, newlineIndex), lineNumber);
			pending = pending.slice(newlineIndex + 1);
			newlineIndex = pending.indexOf("\n");
		}
	}
	pending += decoder.end();
	if (pending.trim()) {
		lineNumber += 1;
		appendParsedLine(records, pending, lineNumber);
	}
	return { records, bytes, endsWithNewline };
}

function lastContentByte(buffer: Buffer): number {
	let index = buffer.length - 1;
	while (index >= 0 && isJsonWhitespace(buffer[index])) index -= 1;
	return index;
}

function isJsonWhitespace(byte: number | undefined): boolean {
	return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function appendParsedLine(
	records: TraceRecord[],
	line: string,
	lineNumber: number,
): void {
	if (!line.trim()) return;
	try {
		records.push(parseTraceLine(line));
	} catch (error) {
		throw new Error(`Invalid trace JSONL at line ${lineNumber}`, {
			cause: error,
		});
	}
}

export async function readTrace(path: string): Promise<TraceFile> {
	const records = await readTraceFile(path);
	const head = records[0];
	if (!head || head.type !== "trace_head") {
		throw new Error("Trace file must start with trace_head.");
	}
	return { head, records };
}
