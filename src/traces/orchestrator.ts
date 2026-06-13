import { appendTraceRecords, type AppendTraceBatchResult } from "./append.ts";
import type {
	TailCheckpoint,
	TraceEvent,
	TraceLoop,
	TraceRecord,
} from "./types.ts";

export interface SemanticLoopIterationResult {
	traceEvents: TraceEvent[];
	traceRecords: TraceRecord[];
	checkpoint: TailCheckpoint;
}

export interface AppendSemanticLoopIterationInput<
	TResult extends SemanticLoopIterationResult,
> {
	repoRoot: string;
	loop: TraceLoop;
	expectedBytes: number;
	nextSequence: number;
	expectedTraceId?: string;
	run: (input: { startSequence: number }) => TResult;
}

export interface AppendSemanticLoopIterationResult<
	TResult extends SemanticLoopIterationResult,
> {
	loop: TraceLoop;
	traceId: string;
	iterationEvent: TraceEvent;
	loopResult: TResult;
	append: AppendTraceBatchResult;
}

export async function appendSemanticLoopIteration<
	TResult extends SemanticLoopIterationResult,
>(
	input: AppendSemanticLoopIterationInput<TResult>,
): Promise<AppendSemanticLoopIterationResult<TResult>> {
	if (!Number.isInteger(input.nextSequence) || input.nextSequence < 1) {
		throw new Error("Loop iteration append requires next trace sequence >= 1.");
	}
	const loopResult = input.run({ startSequence: input.nextSequence });
	const iterationEvent = assertSemanticLoopIterationBatch({
		records: loopResult.traceRecords,
		loop: input.loop,
		nextSequence: input.nextSequence,
		expectedTraceId: input.expectedTraceId,
	});
	const append = await appendTraceRecords(
		input.repoRoot,
		loopResult.traceRecords,
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

export function assertSemanticLoopIterationBatch(input: {
	records: TraceRecord[];
	loop: TraceLoop;
	nextSequence: number;
	expectedTraceId?: string;
}): TraceEvent {
	if (input.records.length === 0) {
		throw new Error("Loop iteration append produced no trace records.");
	}
	if (input.records.some((record) => record.type === "trace_head")) {
		throw new Error(
			"Loop iteration append must not append trace_head records.",
		);
	}
	const firstTraceId = input.records[0].traceId;
	if (input.expectedTraceId && firstTraceId !== input.expectedTraceId) {
		throw new Error(
			`Loop iteration append expected trace ${input.expectedTraceId}, got ${firstTraceId}.`,
		);
	}
	for (const record of input.records) {
		if (record.traceId !== firstTraceId) {
			throw new Error(
				`Loop iteration append mixes trace ids: ${firstTraceId} and ${record.traceId}.`,
			);
		}
	}
	const events = input.records.filter(
		(record): record is TraceEvent => record.type === "trace_event",
	);
	if (events.length === 0) {
		throw new Error("Loop iteration append produced no trace events.");
	}
	assertContiguousSequence(events, input.nextSequence);
	const expectedEventName = `${input.loop}.iteration`;
	const iterationEvents = events.filter(
		(event) => event.loop === input.loop && event.event === expectedEventName,
	);
	if (iterationEvents.length !== 1) {
		throw new Error(
			`Loop iteration append expected exactly one ${expectedEventName} event, got ${iterationEvents.length}.`,
		);
	}
	const iterationEvent = iterationEvents[0];
	const lastEvent = events.at(-1);
	if (lastEvent?.id !== iterationEvent.id) {
		throw new Error(
			`Loop iteration append expected ${expectedEventName} as final trace event.`,
		);
	}
	const lastRecord = input.records.at(-1);
	if (lastRecord?.type !== "tail_checkpoint") {
		throw new Error(
			"Loop iteration append must finish with a tail_checkpoint.",
		);
	}
	if (lastRecord.parentId !== iterationEvent.id) {
		throw new Error(
			`Loop iteration checkpoint parent ${lastRecord.parentId} must be ${iterationEvent.id}.`,
		);
	}
	return iterationEvent;
}

function assertContiguousSequence(
	events: TraceEvent[],
	nextSequence: number,
): void {
	let expectedSequence = nextSequence;
	for (const event of events) {
		if (event.sequence !== expectedSequence) {
			throw new Error(
				`Loop iteration append expected sequence ${expectedSequence}, got ${event.sequence} for ${event.id}.`,
			);
		}
		expectedSequence += 1;
	}
}
