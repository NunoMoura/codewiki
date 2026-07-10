import {
	runDecisionIterationWithRunner,
	type DecisionIterationInput,
	type DecisionIterationResult,
} from "../decision/iteration.ts";
import {
	hardeningQuestionsFromIssues,
	sprintProposalMarkdownDigest,
	renderSprintProposalMarkdown,
} from "../decision/proposal-rendering.ts";
import { createSprintProposal } from "../decision/proposal.ts";
import type {
	CurrentStatePacket,
	SprintProposal,
	SprintProposalInput,
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

export interface SprintProposalApprovalInput {
	approved?: boolean;
	renderedProposalDigest?: string;
	renderedProposalMarkdown?: string;
	approvedBy?: string;
	approvedAt?: string;
}

export interface RenderedSprintProposal {
	markdown: string;
	digest: string;
}

export interface RunWikiDecideInput {
	traceId: string;
	proposal?: SprintProposal;
	proposalInput?: SprintProposalInput;
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
	sprintProposalApproval?: SprintProposalApprovalInput;
}

export interface RunWikiDecideResult {
	mode: WikiDecideMode;
	traceId: string;
	loopResult: DecisionIterationResult;
	iterationEvent: TraceEvent;
	renderedSprintProposal: RenderedSprintProposal;
	append?: AppendSemanticLoopReportResult<DecisionIterationResult>["append"];
}

const WIKI_DECIDE_INPUT_KEYS = [
	"traceId",
	"proposal",
	"proposalInput",
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
	"sprintProposalApproval",
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
	const previewLoopResult = await runDecisionIterationWithRunner({
		...loopInput,
		startSequence: nextSequence,
	});
	const renderedSprintProposal = renderedSprintProposalFor(
		loopInput.proposal!,
		previewLoopResult,
	);
	if (mode === "append") {
		assertAppendPreflightInput(input);
		assertSprintProposalApproval(
			input.sprintProposalApproval,
			renderedSprintProposal,
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
			renderedSprintProposal,
			append: result.append,
		};
	}
	const iterationEvent = assertSemanticLoopReportBatch({
		records: previewLoopResult.traceRecords,
		loop: "decision",
		nextSequence,
		expectedTraceId: input.expectedTraceId ?? traceId,
	});
	return {
		mode,
		traceId: iterationEvent.traceId,
		loopResult: previewLoopResult,
		iterationEvent,
		renderedSprintProposal,
	};
}

function decisionIterationInput(
	input: RunWikiDecideInput,
	qualityJudge: DecisionIterationInput["qualityJudge"],
): DecisionIterationInput {
	return {
		traceId: requiredStringField("wiki_decide", "traceId", input.traceId),
		proposal: input.proposal ?? createSprintProposal(input.proposalInput ?? {}),
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

function renderedSprintProposalFor(
	proposal: SprintProposal,
	loopResult: DecisionIterationResult,
): RenderedSprintProposal {
	const markdown = renderSprintProposalMarkdown(proposal, {
		hardeningQuestions: hardeningQuestionsFromIssues(loopResult.exit.issues),
	});
	return { markdown, digest: sprintProposalMarkdownDigest(markdown) };
}

function assertSprintProposalApproval(
	approval: SprintProposalApprovalInput | undefined,
	rendered: RenderedSprintProposal,
): void {
	if (!approval?.approved) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "missing_required",
			field: "sprintProposalApproval.approved",
			message:
				"wiki_decide append mode requires explicit approval of the rendered Sprint Proposal.",
		});
	}
	const approvedDigest = approval.renderedProposalMarkdown
		? sprintProposalMarkdownDigest(approval.renderedProposalMarkdown)
		: approval.renderedProposalDigest?.trim();
	if (!approvedDigest) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "missing_required",
			field: "sprintProposalApproval.renderedProposalDigest",
			message:
				"wiki_decide append mode requires the approved rendered proposal digest or markdown.",
		});
	}
	if (approvedDigest !== rendered.digest) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "invalid_input",
			field: "sprintProposalApproval.renderedProposalDigest",
			message:
				"wiki_decide append mode rejected a sprint proposal approval digest that does not match the current rendered proposal.",
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
