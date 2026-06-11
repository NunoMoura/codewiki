import { mkdir, appendFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { TraceRecord } from "./types.ts";
import { traceFilePath } from "./schema.ts";
import { formatTraceLine } from "./writer.ts";

export interface AppendPlan {
	expectedBytes: number;
	line: string;
	record: TraceRecord;
}

export interface AppendTraceResult {
	path: string;
	previousBytes: number;
	nextBytes: number;
	line: string;
}

export class TraceAppendConflictError extends Error {
	readonly path: string;
	readonly expectedBytes: number;
	readonly actualBytes: number;

	constructor(path: string, expectedBytes: number, actualBytes: number) {
		super(
			`Trace append conflict for ${path}: expected ${expectedBytes} bytes, found ${actualBytes}.`,
		);
		this.name = "TraceAppendConflictError";
		this.path = path;
		this.expectedBytes = expectedBytes;
		this.actualBytes = actualBytes;
	}
}

export function planTraceAppend(
	record: TraceRecord,
	expectedBytes: number,
): AppendPlan {
	return { expectedBytes, line: formatTraceLine(record), record };
}

export async function appendTraceRecordToFile(
	path: string,
	record: TraceRecord,
	expectedBytes: number,
): Promise<AppendTraceResult> {
	const plan = planTraceAppend(record, expectedBytes);
	const previousBytes = await fileSize(path);
	if (previousBytes !== plan.expectedBytes) {
		throw new TraceAppendConflictError(path, plan.expectedBytes, previousBytes);
	}
	await mkdir(dirname(path), { recursive: true });
	await appendFile(path, plan.line, "utf8");
	return {
		path,
		previousBytes,
		nextBytes: previousBytes + Buffer.byteLength(plan.line, "utf8"),
		line: plan.line,
	};
}

export async function appendTraceRecord(
	repoRoot: string,
	record: TraceRecord,
	expectedBytes: number,
): Promise<AppendTraceResult> {
	return appendTraceRecordToFile(
		resolve(repoRoot, traceFilePath(record.traceId)),
		record,
		expectedBytes,
	);
}

async function fileSize(path: string): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return 0;
		throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
