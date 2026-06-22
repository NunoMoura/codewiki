import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import {
	assertKnownInputKeys,
	requiredArrayField,
	requiredStringField,
} from "./input-validation.ts";
import type { SourceMapContract } from "../knowledge/source-map.ts";
import {
	runPlanningIteration,
	type PlanningIterationInput,
	type PlanningIterationResult,
} from "../planning/iteration.ts";
import type {
	PlanningDecisionResolution,
	PlanningDecisionResolutionInput,
	PlanningWorkItem,
	PlanningWorkItemInput,
} from "../planning/types.ts";
import {
	appendSemanticLoopReport,
	assertSemanticLoopReportBatch,
	type AppendSemanticLoopReportResult,
} from "../runtime/trace-writer.ts";
import type { TraceEvent } from "../traces/types.ts";

export type WikiPlanMode = "preview" | "append";

export interface RunWikiPlanInput {
	traceId: string;
	decisionEvents: TraceEvent[];
	workItems?: PlanningWorkItem[];
	workItemInputs?: PlanningWorkItemInput[];
	resolutions?: PlanningDecisionResolution[];
	resolutionInputs?: PlanningDecisionResolutionInput[];
	componentMap?: SourceMapContract;
	parentId?: string | null;
	createdAt?: string;
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
	append?: AppendSemanticLoopReportResult<PlanningIterationResult>["append"];
}

const WIKI_PLAN_INPUT_KEYS = [
	"traceId",
	"decisionEvents",
	"workItems",
	"workItemInputs",
	"resolutions",
	"resolutionInputs",
	"componentMap",
	"parentId",
	"createdAt",
	"mode",
	"repoRoot",
	"expectedBytes",
	"nextSequence",
	"expectedTraceId",
] as const;

export async function runWikiPlan(
	input: RunWikiPlanInput,
): Promise<RunWikiPlanResult> {
	assertKnownInputKeys(
		"wiki_plan",
		input as unknown as Record<string, unknown>,
		WIKI_PLAN_INPUT_KEYS,
	);
	const traceId = requiredStringField("wiki_plan", "traceId", input.traceId);
	requiredArrayField("wiki_plan", "decisionEvents", input.decisionEvents);
	const mode = input.mode || "preview";
	const nextSequence = requiredNextSequence(input.nextSequence ?? 1);
	const loopInput = planningIterationInput(input);
	if (mode === "append") {
		const result = await appendSemanticLoopReport({
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
	const iterationEvent = assertSemanticLoopReportBatch({
		records: loopResult.traceRecords,
		loop: "planning",
		nextSequence,
		expectedTraceId: input.expectedTraceId ?? traceId,
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
		traceId: requiredStringField("wiki_plan", "traceId", input.traceId),
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
		throw createCodewikiApiError({
			operation: "wiki_plan",
			code: "invalid_input",
			field: "nextSequence",
			message: "wiki_plan requires nextSequence >= 1.",
			data: { value },
		});
	}
	return value;
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw createCodewikiApiError({
			operation: "wiki_plan",
			code: "invalid_input",
			field: "expectedBytes",
			message: "wiki_plan append mode requires expectedBytes >= 0.",
			data: { value },
		});
	}
	return value;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) {
		throw createCodewikiApiError({
			operation: "wiki_plan",
			code: "missing_required",
			field: "repoRoot",
			message: "wiki_plan append mode requires repoRoot.",
		});
	}
	return value;
}
