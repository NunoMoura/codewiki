import {
	runDecisionIterationWithRunner,
	type DecisionIterationInput,
	type DecisionIterationResult,
} from "../decision/iteration.ts";
import {
	decisionTableMarkdownDigest,
	renderDecisionTableMarkdown,
} from "../decision/table-rendering.ts";
import { createDecisionTable } from "../decision/table.ts";
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

export interface DecisionTableApprovalInput {
	approved?: boolean;
	renderedTableDigest?: string;
	renderedTableMarkdown?: string;
	approvedBy?: string;
	approvedAt?: string;
}

export interface RenderedDecisionTable {
	markdown: string;
	digest: string;
}

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
	decisionTableApproval?: DecisionTableApprovalInput;
}

export interface RunWikiDecideResult {
	mode: WikiDecideMode;
	traceId: string;
	loopResult: DecisionIterationResult;
	iterationEvent: TraceEvent;
	renderedDecisionTable: RenderedDecisionTable;
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
	"decisionTableApproval",
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
	const renderedDecisionTable = renderedDecisionTableFor(loopInput.table!);
	if (mode === "append") {
		assertAppendPreflightInput(input);
		assertDecisionTableApproval(
			input.decisionTableApproval,
			renderedDecisionTable,
		);
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
			renderedDecisionTable,
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
		renderedDecisionTable,
	};
}

function decisionIterationInput(
	input: RunWikiDecideInput,
	qualityJudge: DecisionIterationInput["qualityJudge"],
): DecisionIterationInput {
	return {
		traceId: requiredStringField("wiki_decide", "traceId", input.traceId),
		table: input.table ?? createDecisionTable(input.tableInput ?? {}),
		knowledgeDelta: input.knowledgeDelta,
		currentStatePacket: input.currentStatePacket,
		qualityJudge,
		requirementIds: input.requirementIds,
		parentId: input.parentId,
		createdAt: input.createdAt,
	};
}

function assertAppendPreflightInput(input: RunWikiDecideInput): void {
	requiredRepoRoot(input.repoRoot);
	requiredExpectedBytes(input.expectedBytes);
	requiredNextSequence(input.nextSequence ?? Number.NaN);
}

function renderedDecisionTableFor(table: DecisionTable): RenderedDecisionTable {
	const markdown = renderDecisionTableMarkdown(table);
	return { markdown, digest: decisionTableMarkdownDigest(markdown) };
}

function assertDecisionTableApproval(
	approval: DecisionTableApprovalInput | undefined,
	rendered: RenderedDecisionTable,
): void {
	if (!approval?.approved) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "missing_required",
			field: "decisionTableApproval.approved",
			message:
				"wiki_decide append mode requires explicit approval of the rendered decision table.",
		});
	}
	const approvedDigest = approval.renderedTableMarkdown
		? decisionTableMarkdownDigest(approval.renderedTableMarkdown)
		: approval.renderedTableDigest?.trim();
	if (!approvedDigest) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "missing_required",
			field: "decisionTableApproval.renderedTableDigest",
			message:
				"wiki_decide append mode requires the approved rendered table digest or markdown.",
		});
	}
	if (approvedDigest !== rendered.digest) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "invalid_input",
			field: "decisionTableApproval.renderedTableDigest",
			message:
				"wiki_decide append mode rejected a decision table approval digest that does not match the current rendered table.",
			data: { expected: rendered.digest, actual: approvedDigest },
		});
	}
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
