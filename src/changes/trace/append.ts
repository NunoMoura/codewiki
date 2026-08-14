import { mkdir, appendFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
	CodewikiTraceError,
	TraceAppendConflictError,
	TraceClosedAppendError,
} from "./storage-errors.ts";
import type { TraceClose, TraceRecord } from "./types.ts";
import { parseTraceText, readLastTraceRecord } from "./reader.ts";
import { assertValidTraceRecord, traceFilePath } from "./schema.ts";
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

export type ReplaceTraceRecordsResult = AppendTraceBatchResult;

export {
	TraceAppendConflictError,
	TraceClosedAppendError,
} from "./storage-errors.ts";

function planTraceAppend(
	record: TraceRecord,
	expectedBytes: number,
): AppendPlan {
	const validRecord = assertValidTraceRecord(record);
	return {
		expectedBytes,
		line: formatTraceLine(validRecord),
		record: validRecord,
	};
}

function planTraceAppendBatch(
	records: TraceRecord[],
	expectedBytes: number,
): AppendBatchPlan {
	const validRecords = records.map((record) => assertValidTraceRecord(record));
	assertSingleTraceBatch(validRecords);
	assertTerminalClosePosition(validRecords);
	return {
		expectedBytes,
		text: formatTraceText(validRecords),
		records: [...validRecords],
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

async function replaceTraceRecordsInFile(
	path: string,
	records: TraceRecord[],
	expectedBytes: number,
): Promise<ReplaceTraceRecordsResult> {
	const plan = planTraceAppendBatch(records, expectedBytes);
	parseTraceText(plan.text);
	const previousBytes = await fileSize(path);
	if (previousBytes !== plan.expectedBytes) {
		throw new TraceAppendConflictError(path, plan.expectedBytes, previousBytes);
	}
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, plan.text, "utf8");
	return {
		path,
		previousBytes,
		nextBytes: Buffer.byteLength(plan.text, "utf8"),
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

export function replaceTraceRecords(
	repoRoot: string,
	records: TraceRecord[],
	expectedBytes: number,
): Promise<ReplaceTraceRecordsResult> {
	assertSingleTraceBatch(records);
	return replaceTraceRecordsInFile(
		resolve(repoRoot, traceFilePath(records[0].traceId)),
		records,
		expectedBytes,
	);
}

function assertSingleTraceBatch(records: TraceRecord[]): void {
	if (records.length === 0) {
		throw new CodewikiTraceError({
			code: "invalid_append_batch",
			message: "Trace append batch requires at least one record.",
		});
	}
	const traceId = records[0].traceId;
	for (const record of records) {
		if (record.traceId !== traceId) {
			throw new CodewikiTraceError({
				code: "invalid_append_batch",
				message: `Trace append batch mixes trace ids: ${traceId} and ${record.traceId}.`,
				traceId,
				data: { actualTraceId: record.traceId, recordType: record.type },
			});
		}
	}
}

function assertTerminalClosePosition(records: TraceRecord[]): void {
	const closeIndex = records.findIndex(
		(record) => record.type === "trace_close",
	);
	if (closeIndex === -1 || closeIndex === records.length - 1) return;
	throw new CodewikiTraceError({
		code: "invalid_append_batch",
		message: "Trace append batch must not include records after trace_close.",
	});
}

async function assertTraceOpenForAppend(
	path: string,
	previousBytes: number,
): Promise<void> {
	if (previousBytes === 0) return;
	const lastRecord = await readLastTraceRecord(path);
	const close: TraceClose | undefined =
		lastRecord?.type === "trace_close" ? lastRecord : undefined;
	if (!close) return;
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
