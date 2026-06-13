import {
	runPlanningIteration,
	type PlanningIterationInput,
	type PlanningIterationResult,
} from "../planning/iteration.ts";
import {
	appendSemanticLoopIteration,
	assertSemanticLoopIterationBatch,
	type AppendSemanticLoopIterationResult,
} from "../traces/orchestrator.ts";
import type { TraceEvent } from "../traces/types.ts";

export type WikiPlanMode = "preview" | "append";

export interface RunWikiPlanInput
	extends Omit<PlanningIterationInput, "traceId" | "startSequence"> {
	traceId: string;
	mode?: WikiPlanMode;
	repoRoot?: string;
	expectedBytes?: number;
	nextSequence?: number;
	expectedTraceId?: string;
}

export interface RunWikiPlanResult {
	mode: WikiPlanMode;
	traceId: string;
	loopResult: PlanningIterationResult;
	iterationEvent: TraceEvent;
	append?: AppendSemanticLoopIterationResult<PlanningIterationResult>["append"];
}

export async function runWikiPlan(
	input: RunWikiPlanInput,
): Promise<RunWikiPlanResult> {
	const mode = input.mode || "preview";
	const nextSequence = requiredNextSequence(input.nextSequence ?? 1);
	const loopInput = planningIterationInput(input);
	if (mode === "append") {
		const result = await appendSemanticLoopIteration({
			repoRoot: requiredRepoRoot(input.repoRoot),
			loop: "planning",
			expectedBytes: requiredExpectedBytes(input.expectedBytes),
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? input.traceId,
			run: ({ startSequence }) =>
				runPlanningIteration({ ...loopInput, startSequence }),
		});
		return {
			mode,
			traceId: result.traceId,
			loopResult: result.loopResult,
			iterationEvent: result.iterationEvent,
			append: result.append,
		};
	}
	const loopResult = runPlanningIteration({
		...loopInput,
		startSequence: nextSequence,
	});
	const iterationEvent = assertSemanticLoopIterationBatch({
		records: loopResult.traceRecords,
		loop: "planning",
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

function planningIterationInput(
	input: RunWikiPlanInput,
): PlanningIterationInput {
	return {
		traceId: input.traceId,
		decisionEvents: input.decisionEvents,
		workItems: input.workItems,
		workItemInputs: input.workItemInputs,
		resolutions: input.resolutions,
		resolutionInputs: input.resolutionInputs,
		componentMap: input.componentMap,
		parentId: input.parentId,
		createdAt: input.createdAt,
	};
}

function requiredNextSequence(value: number): number {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error("wiki_plan requires nextSequence >= 1.");
	}
	return value;
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new Error("wiki_plan append mode requires expectedBytes >= 0.");
	}
	return value;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) throw new Error("wiki_plan append mode requires repoRoot.");
	return value;
}
