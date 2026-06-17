import { mkdir, appendFile, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { TraceRecord } from "./types.ts";
import { parseTraceText } from "./reader.ts";
import { traceFilePath } from "./schema.ts";
import { formatTraceLine, formatTraceText } from "./writer.ts";

interface AppendPlan {
	expectedBytes: number;
	line: string;
	record: TraceRecord;
}

interface AppendBatchPlan {
	expectedBytes: number;
	text: string;
	records: TraceRecord[];
}

export interface AppendTraceResult {
	path: string;
	previousBytes: number;
	nextBytes: number;
	line: string;
}

export interface AppendTraceBatchResult {
	path: string;
	previousBytes: number;
	nextBytes: number;
	text: string;
	records: TraceRecord[];
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

export class TraceClosedAppendError extends Error {
	readonly path: string;
	readonly traceId: string;
	readonly closeId: string;

	constructor(path: string, traceId: string, closeId: string) {
		super(
			`Trace ${traceId} is closed by ${closeId}; append is not allowed for ${path}.`,
		);
		this.name = "TraceClosedAppendError";
		this.path = path;
		this.traceId = traceId;
		this.closeId = closeId;
	}
}

function planTraceAppend(
	record: TraceRecord,
	expectedBytes: number,
): AppendPlan {
	return { expectedBytes, line: formatTraceLine(record), record };
}

function planTraceAppendBatch(
	records: TraceRecord[],
	expectedBytes: number,
): AppendBatchPlan {
	assertSingleTraceBatch(records);
	assertTerminalClosePosition(records);
	return {
		expectedBytes,
		text: formatTraceText(records),
		records: [...records],
	};
}

async function appendTraceRecordToFile(
	path: string,
	record: TraceRecord,
	expectedBytes: number,
): Promise<AppendTraceResult> {
	const plan = planTraceAppend(record, expectedBytes);
	const previousBytes = await fileSize(path);
	if (previousBytes !== plan.expectedBytes) {
		throw new TraceAppendConflictError(path, plan.expectedBytes, previousBytes);
	}
	await assertTraceOpenForAppend(path, previousBytes);
	await mkdir(dirname(path), { recursive: true });
	await appendFile(path, plan.line, "utf8");
	return {
		path,
		previousBytes,
		nextBytes: previousBytes + Buffer.byteLength(plan.line, "utf8"),
		line: plan.line,
	};
}

async function appendTraceRecordsToFile(
	path: string,
	records: TraceRecord[],
	expectedBytes: number,
): Promise<AppendTraceBatchResult> {
	const plan = planTraceAppendBatch(records, expectedBytes);
	const previousBytes = await fileSize(path);
	if (previousBytes !== plan.expectedBytes) {
		throw new TraceAppendConflictError(path, plan.expectedBytes, previousBytes);
	}
	await assertTraceOpenForAppend(path, previousBytes);
	await mkdir(dirname(path), { recursive: true });
	await appendFile(path, plan.text, "utf8");
	return {
		path,
		previousBytes,
		nextBytes: previousBytes + Buffer.byteLength(plan.text, "utf8"),
		text: plan.text,
		records: plan.records,
	};
}

export function appendTraceRecord(
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

export function appendTraceRecords(
	repoRoot: string,
	records: TraceRecord[],
	expectedBytes: number,
): Promise<AppendTraceBatchResult> {
	assertSingleTraceBatch(records);
	return appendTraceRecordsToFile(
		resolve(repoRoot, traceFilePath(records[0].traceId)),
		records,
		expectedBytes,
	);
}

function assertSingleTraceBatch(records: TraceRecord[]): void {
	if (records.length === 0) {
		throw new Error("Trace append batch requires at least one record.");
	}
	const traceId = records[0].traceId;
	for (const record of records) {
		if (record.traceId !== traceId) {
			throw new Error(
				`Trace append batch mixes trace ids: ${traceId} and ${record.traceId}.`,
			);
		}
	}
}

function assertTerminalClosePosition(records: TraceRecord[]): void {
	const closeIndex = records.findIndex(
		(record) => record.type === "trace_close",
	);
	if (closeIndex === -1 || closeIndex === records.length - 1) return;
	throw new Error(
		"Trace append batch must not include records after trace_close.",
	);
}

async function assertTraceOpenForAppend(
	path: string,
	previousBytes: number,
): Promise<void> {
	if (previousBytes === 0) return;
	const close = parseTraceText(await readFile(path, "utf8")).find(
		(record) => record.type === "trace_close",
	);
	if (!close || close.type !== "trace_close") return;
	throw new TraceClosedAppendError(path, close.traceId, close.id);
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
