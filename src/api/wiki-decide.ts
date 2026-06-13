import {
	runDecisionIteration,
	type DecisionIterationInput,
	type DecisionIterationResult,
} from "../decision/iteration.ts";
import {
	appendSemanticLoopIteration,
	assertSemanticLoopIterationBatch,
	type AppendSemanticLoopIterationResult,
} from "../traces/orchestrator.ts";
import type { TraceEvent } from "../traces/types.ts";

export type WikiDecideMode = "preview" | "append";

export interface RunWikiDecideInput
	extends Omit<DecisionIterationInput, "traceId" | "startSequence"> {
	traceId: string;
	mode?: WikiDecideMode;
	repoRoot?: string;
	expectedBytes?: number;
	nextSequence?: number;
	expectedTraceId?: string;
}

export interface RunWikiDecideResult {
	mode: WikiDecideMode;
	traceId: string;
	loopResult: DecisionIterationResult;
	iterationEvent: TraceEvent;
	append?: AppendSemanticLoopIterationResult<DecisionIterationResult>["append"];
}

export async function runWikiDecide(
	input: RunWikiDecideInput,
): Promise<RunWikiDecideResult> {
	const mode = input.mode || "preview";
	const nextSequence = requiredNextSequence(input.nextSequence ?? 1);
	const loopInput = decisionIterationInput(input);
	if (mode === "append") {
		const result = await appendSemanticLoopIteration({
			repoRoot: requiredRepoRoot(input.repoRoot),
			loop: "decision",
			expectedBytes: requiredExpectedBytes(input.expectedBytes),
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? input.traceId,
			run: ({ startSequence }) =>
				runDecisionIteration({ ...loopInput, startSequence }),
		});
		return {
			mode,
			traceId: result.traceId,
			loopResult: result.loopResult,
			iterationEvent: result.iterationEvent,
			append: result.append,
		};
	}
	const loopResult = runDecisionIteration({
		...loopInput,
		startSequence: nextSequence,
	});
	const iterationEvent = assertSemanticLoopIterationBatch({
		records: loopResult.traceRecords,
		loop: "decision",
		nextSequence,
		expectedTraceId: input.expectedTraceId ?? input.traceId,
	});
	return {
		mode,
		traceId: iterationEvent.traceId,
		loopResult,
		iterationEvent,
	};
}

function decisionIterationInput(
	input: RunWikiDecideInput,
): DecisionIterationInput {
	return {
		traceId: input.traceId,
		table: input.table,
		tableInput: input.tableInput,
		knowledgeDelta: input.knowledgeDelta,
		currentStatePacket: input.currentStatePacket,
		requirementIds: input.requirementIds,
		parentId: input.parentId,
		createdAt: input.createdAt,
	};
}

function requiredNextSequence(value: number): number {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error("wiki_decide requires nextSequence >= 1.");
	}
	return value;
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new Error("wiki_decide append mode requires expectedBytes >= 0.");
	}
	return value;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) throw new Error("wiki_decide append mode requires repoRoot.");
	return value;
}
