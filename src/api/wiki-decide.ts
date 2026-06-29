import {
	runDecisionIterationWithRunner,
	type DecisionIterationInput,
	type DecisionIterationResult,
} from "../decision/iteration.ts";
import type {
	CurrentStatePacket,
	DecisionTable,
	DecisionTableInput,
	KnowledgeDelta,
} from "../decision/types.ts";
import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import { resolveLoopQualityJudgeExecutionOptions } from "../loops/judge-provider.ts";
import {
	assertKnownInputKeys,
	requiredStringField,
} from "./input-validation.ts";
import {
	appendSemanticLoopReport,
	assertSemanticLoopReportBatch,
	type AppendSemanticLoopReportResult,
} from "../runtime/trace-writer.ts";
import type { TraceEvent } from "../traces/types.ts";

export type WikiDecideMode = "preview" | "append";

export interface RunWikiDecideInput {
	traceId: string;
	table?: DecisionTable;
	tableInput?: DecisionTableInput;
	knowledgeDelta?: KnowledgeDelta;
	currentStatePacket?: CurrentStatePacket;
	requirementIds?: string[];
	parentId?: string | null;
	createdAt?: string;
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
	append?: AppendSemanticLoopReportResult<DecisionIterationResult>["append"];
}

const WIKI_DECIDE_INPUT_KEYS = [
	"traceId",
	"table",
	"tableInput",
	"knowledgeDelta",
	"currentStatePacket",
	"requirementIds",
	"parentId",
	"createdAt",
	"mode",
	"repoRoot",
	"expectedBytes",
	"nextSequence",
	"expectedTraceId",
] as const;

export async function runWikiDecide(
	input: RunWikiDecideInput,
): Promise<RunWikiDecideResult> {
	assertKnownInputKeys(
		"wiki_decide",
		input as unknown as Record<string, unknown>,
		WIKI_DECIDE_INPUT_KEYS,
	);
	const traceId = requiredStringField("wiki_decide", "traceId", input.traceId);
	const mode = input.mode || "preview";
	const nextSequence = requiredNextSequence(input.nextSequence ?? 1);
	const qualityJudge = await resolveLoopQualityJudgeExecutionOptions({
		repoRoot: input.repoRoot,
	});
	const loopInput = decisionIterationInput(input, qualityJudge);
	if (mode === "append") {
		const result = await appendSemanticLoopReport({
			repoRoot: requiredRepoRoot(input.repoRoot),
			loop: "decision",
			expectedBytes: requiredExpectedBytes(input.expectedBytes),
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? input.traceId,
			run: ({ startSequence }) =>
				runDecisionIterationWithRunner({ ...loopInput, startSequence }),
		});
		return {
			mode,
			traceId: result.traceId,
			loopResult: result.loopResult,
			iterationEvent: result.iterationEvent,
			append: result.append,
		};
	}
	const loopResult = await runDecisionIterationWithRunner({
		...loopInput,
		startSequence: nextSequence,
	});
	const iterationEvent = assertSemanticLoopReportBatch({
		records: loopResult.traceRecords,
		loop: "decision",
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

function decisionIterationInput(
	input: RunWikiDecideInput,
	qualityJudge: DecisionIterationInput["qualityJudge"],
): DecisionIterationInput {
	return {
		traceId: requiredStringField("wiki_decide", "traceId", input.traceId),
		table: input.table,
		tableInput: input.tableInput,
		knowledgeDelta: input.knowledgeDelta,
		currentStatePacket: input.currentStatePacket,
		qualityJudge,
		requirementIds: input.requirementIds,
		parentId: input.parentId,
		createdAt: input.createdAt,
	};
}

function requiredNextSequence(value: number): number {
	if (!Number.isInteger(value) || value < 1) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "invalid_input",
			field: "nextSequence",
			message: "wiki_decide requires nextSequence >= 1.",
			data: { value },
		});
	}
	return value;
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "invalid_input",
			field: "expectedBytes",
			message: "wiki_decide append mode requires expectedBytes >= 0.",
			data: { value },
		});
	}
	return value;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "missing_required",
			field: "repoRoot",
			message: "wiki_decide append mode requires repoRoot.",
		});
	}
	return value;
}
