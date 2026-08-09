import { CodewikiTraceError } from "../../error-handling/trace-errors.ts";
import {
	appendTraceRecord,
	appendTraceRecords,
	type AppendTraceBatchResult,
	type AppendTraceResult,
} from "../../traces/append.ts";
export type {
	AppendTraceBatchResult,
	AppendTraceResult,
} from "../../traces/append.ts";
import type {
	TailCheckpoint,
	TraceEvent,
	TraceLoop,
	TraceRecord,
} from "../../traces/types.ts";

export interface SemanticLoopReportResult {
	traceEvents: TraceEvent[];
	traceRecords: TraceRecord[];
	checkpoint: TailCheckpoint;
}

export interface AppendSemanticLoopReportInput<
	TResult extends SemanticLoopReportResult,
> {
	repoRoot: string;
	loop: TraceLoop;
	expectedBytes: number;
	nextSequence: number;
	expectedTraceId?: string;
	prefixRecords?: TraceRecord[];
	run: (input: { startSequence: number }) => TResult | Promise<TResult>;
}

export interface AppendSemanticLoopReportResult<
	TResult extends SemanticLoopReportResult,
> {
	loop: TraceLoop;
	traceId: string;
	iterationEvent: TraceEvent;
	loopResult: TResult;
	append: AppendTraceBatchResult;
}

export function appendRuntimeTraceRecord(
	repoRoot: string,
	record: TraceRecord,
	expectedBytes: number,
): Promise<AppendTraceResult> {
	return appendTraceRecord(repoRoot, record, expectedBytes);
}

export function appendRuntimeTraceRecords(
	repoRoot: string,
	records: TraceRecord[],
	expectedBytes: number,
): Promise<AppendTraceBatchResult> {
	return appendTraceRecords(repoRoot, records, expectedBytes);
}

export async function appendSemanticLoopReport<
	TResult extends SemanticLoopReportResult,
>(
	input: AppendSemanticLoopReportInput<TResult>,
): Promise<AppendSemanticLoopReportResult<TResult>> {
	if (!Number.isInteger(input.nextSequence) || input.nextSequence < 1) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message: "Semantic loop report append requires next trace sequence >= 1.",
			data: { nextSequence: input.nextSequence },
		});
	}
	const loopResult = await input.run({ startSequence: input.nextSequence });
	const iterationEvent = assertSemanticLoopReportBatch({
		records: loopResult.traceRecords,
		loop: input.loop,
		nextSequence: input.nextSequence,
		expectedTraceId: input.expectedTraceId,
	});
	const append = await appendRuntimeTraceRecords(
		input.repoRoot,
		[...(input.prefixRecords ?? []), ...loopResult.traceRecords],
		input.expectedBytes,
	);
	return {
		loop: input.loop,
		traceId: iterationEvent.traceId,
		iterationEvent,
		loopResult,
		append,
	};
}

export function assertSemanticLoopReportBatch(input: {
	records: TraceRecord[];
	loop: TraceLoop;
	nextSequence: number;
	expectedTraceId?: string;
}): TraceEvent {
	if (input.records.length === 0) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message: "Semantic loop report append produced no trace records.",
		});
	}
	if (input.records.some((record) => record.type === "trace_head")) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message:
				"Semantic loop report append must not append trace_head records.",
		});
	}
	const firstTraceId = input.records[0].traceId;
	if (input.expectedTraceId && firstTraceId !== input.expectedTraceId) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message: `Semantic loop report append expected trace ${input.expectedTraceId}, got ${firstTraceId}.`,
			traceId: firstTraceId,
			data: { expectedTraceId: input.expectedTraceId },
		});
	}
	for (const record of input.records) {
		if (record.traceId !== firstTraceId) {
			throw new CodewikiTraceError({
				code: "invalid_iteration_batch",
				message: `Semantic loop report append mixes trace ids: ${firstTraceId} and ${record.traceId}.`,
				traceId: firstTraceId,
				data: { actualTraceId: record.traceId, recordType: record.type },
			});
		}
	}
	const events = input.records.filter(
		(record): record is TraceEvent => record.type === "trace_event",
	);
	if (events.length === 0) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message: "Semantic loop report append produced no trace events.",
			traceId: firstTraceId,
		});
	}
	assertContiguousSequence(events, input.nextSequence);
	const loopEvents = events.filter(
		(event) => event.loop === input.loop && hasOutput(event),
	);
	if (loopEvents.length !== 1) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message: `Semantic loop report append expected exactly one ${input.loop} output event, got ${loopEvents.length}.`,
			traceId: firstTraceId,
			data: { expectedLoop: input.loop, actualCount: loopEvents.length },
		});
	}
	const iterationEvent = loopEvents[0];
	const lastEvent = events.at(-1);
	if (lastEvent?.id !== iterationEvent.id) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message: `Semantic loop report append expected ${input.loop}.${iterationEvent.event} as final trace event.`,
			traceId: firstTraceId,
			recordId: iterationEvent.id,
		});
	}
	const lastRecord = input.records.at(-1);
	if (lastRecord?.type !== "tail_checkpoint") {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message:
				"Semantic loop report append must finish with a tail_checkpoint.",
			traceId: firstTraceId,
		});
	}
	if (lastRecord.parentId !== iterationEvent.id) {
		throw new CodewikiTraceError({
			code: "invalid_iteration_batch",
			message: `Semantic loop report checkpoint parent ${lastRecord.parentId} must be ${iterationEvent.id}.`,
			traceId: firstTraceId,
			recordId: lastRecord.id,
			data: {
				expectedParentId: iterationEvent.id,
				actualParentId: lastRecord.parentId,
			},
		});
	}
	return iterationEvent;
}

function hasOutput(event: TraceEvent): boolean {
	return Boolean(
		event.data &&
			typeof event.data === "object" &&
			!Array.isArray(event.data) &&
			"output" in event.data,
	);
}

function assertContiguousSequence(
	events: TraceEvent[],
	nextSequence: number,
): void {
	let expectedSequence = nextSequence;
	for (const event of events) {
		if (event.sequence !== expectedSequence) {
			throw new CodewikiTraceError({
				code: "invalid_iteration_batch",
				message: `Semantic loop report append expected sequence ${expectedSequence}, got ${event.sequence} for ${event.id}.`,
				traceId: event.traceId,
				recordId: event.id,
				data: { expectedSequence, actualSequence: event.sequence },
			});
		}
		expectedSequence += 1;
	}
}
