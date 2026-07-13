import {
	prepareAcceptedChangeBundle,
	type AcceptedChangeBundle,
	type AcceptedChangeSelection,
	type PreparedAcceptedChangeBundle,
} from "../changes/accepted-bundle.ts";
import { GitRefChangeStore } from "../changes/git-ref-store.ts";
import type { ChangeStoreSnapshot } from "../changes/store.ts";
import { sprintProposalFromAcceptedChanges } from "../decision/accepted-change-input.ts";
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
import type {
	CurrentStatePacket,
	SprintProposal,
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
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import { createTraceHead } from "../traces/writer.ts";

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

export interface ChangeAcceptanceInput {
	expectedHead: string;
	selections: AcceptedChangeSelection[];
	acceptedBy: string;
	acceptedAt: string;
}

export interface RunWikiDecideInput {
	traceId: string;
	changeAcceptance: ChangeAcceptanceInput;
	knowledgeDelta?: KnowledgeDelta;
	currentStatePacket?: CurrentStatePacket;
	requirementIds?: string[];
	parentId?: string | null;
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
	changeAcceptance: {
		bundle: AcceptedChangeBundle;
		storeHead: string;
		recoveredAcceptance: boolean;
	};
}

const WIKI_DECIDE_INPUT_KEYS = [
	"traceId",
	"changeAcceptance",
	"knowledgeDelta",
	"currentStatePacket",
	"requirementIds",
	"parentId",
	"mode",
	"repoRoot",
	"expectedBytes",
	"nextSequence",
	"expectedTraceId",
	"sprintProposalApproval",
] as const;

interface AcceptedDecisionContext {
	store: GitRefChangeStore;
	snapshot: ChangeStoreSnapshot;
	prepared: PreparedAcceptedChangeBundle;
}

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
	if (mode === "append") assertAppendPreflightInput(input);
	const nextSequence = requiredNextSequence(input.nextSequence ?? 1);
	requiredChangeAcceptance(input.changeAcceptance);
	const acceptedContext = await acceptedDecisionContext(input, traceId);
	const acceptedChangeBundle = acceptedContext.prepared.bundle;
	const proposal = sprintProposalFromAcceptedChanges(acceptedChangeBundle);
	const qualityJudge = await resolveLoopQualityJudgeExecutionOptions({
		repoRoot: input.repoRoot,
	});
	const loopInput = decisionIterationInput(
		input,
		qualityJudge,
		acceptedChangeBundle,
		proposal,
	);
	const previewLoopResult = await runDecisionIterationWithRunner({
		...loopInput,
		startSequence: nextSequence,
	});
	const renderedSprintProposal = renderedSprintProposalFor(
		proposal,
		previewLoopResult,
	);
	if (mode === "append") {
		assertSprintProposalApproval(
			input.sprintProposalApproval,
			renderedSprintProposal,
			input.changeAcceptance,
		);
		const expectedBytes = requiredExpectedBytes(input.expectedBytes);
		assertSemanticLoopReportBatch({
			records: previewLoopResult.traceRecords,
			loop: "decision",
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? traceId,
		});
		const persistedAcceptance = await persistAcceptedChanges(acceptedContext);
		const result = await appendSemanticLoopReport({
			repoRoot: requiredRepoRoot(input.repoRoot),
			loop: "decision",
			expectedBytes,
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? input.traceId,
			prefixRecords: initialTraceRecords(
				expectedBytes,
				traceId,
				proposal,
				loopInput.createdAt,
			),
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
			changeAcceptance: persistedAcceptance,
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
		changeAcceptance: {
			bundle: acceptedContext.prepared.bundle,
			storeHead: requiredStoreHead(acceptedContext.snapshot),
			recoveredAcceptance: acceptedContext.prepared.recoveredAcceptance,
		},
	};
}

async function acceptedDecisionContext(
	input: RunWikiDecideInput,
	traceId: string,
): Promise<AcceptedDecisionContext> {
	const store = new GitRefChangeStore({
		repoRoot: requiredRepoRoot(input.repoRoot),
	});
	const snapshot = await store.read();
	const prepared = prepareAcceptedChangeBundle({
		traceId,
		expectedHead: input.changeAcceptance.expectedHead,
		snapshot,
		selections: input.changeAcceptance.selections,
		acceptedBy: input.changeAcceptance.acceptedBy,
		acceptedAt: input.changeAcceptance.acceptedAt,
	});
	return { store, snapshot, prepared };
}

async function persistAcceptedChanges(
	context: AcceptedDecisionContext,
): Promise<NonNullable<RunWikiDecideResult["changeAcceptance"]>> {
	if (context.prepared.recoveredAcceptance) {
		return {
			bundle: context.prepared.bundle,
			storeHead: requiredStoreHead(context.snapshot),
			recoveredAcceptance: true,
		};
	}
	const written = await context.store.write({
		expectedHead: context.prepared.bundle.sourceHead,
		records: context.prepared.records,
		message: `Accept Changes for ${context.prepared.bundle.traceId}`,
		actor: context.prepared.bundle.acceptedBy,
		createdAt: context.prepared.bundle.acceptedAt,
	});
	return {
		bundle: context.prepared.bundle,
		storeHead: written.head,
		recoveredAcceptance: false,
	};
}

function requiredStoreHead(snapshot: ChangeStoreSnapshot): string {
	if (!snapshot.head)
		throw new Error("wiki_decide Change Store head is empty.");
	return snapshot.head;
}

function initialTraceRecords(
	expectedBytes: number,
	traceId: string,
	proposal: SprintProposal,
	createdAt: string | undefined,
): TraceRecord[] {
	if (expectedBytes !== 0) return [];
	return [
		createTraceHead({
			traceId,
			title: proposal.summary || `CodeWiki Sprint ${traceId}`,
			createdAt,
			origin: {
				kind: "user_intent",
				sourceRef: proposal.sourceRefs[0],
				refs: proposal.sourceRefs,
			},
		}),
	];
}

function decisionIterationInput(
	input: RunWikiDecideInput,
	qualityJudge: DecisionIterationInput["qualityJudge"],
	acceptedChangeBundle: AcceptedChangeBundle,
	proposal: SprintProposal,
): DecisionIterationInput {
	return {
		traceId: requiredStringField("wiki_decide", "traceId", input.traceId),
		acceptedChangeBundle,
		proposal,
		knowledgeDelta: input.knowledgeDelta,
		currentStatePacket: input.currentStatePacket,
		qualityJudge,
		requirementIds: input.requirementIds,
		parentId: input.parentId,
		createdAt: acceptedChangeBundle.acceptedAt,
	};
}

function requiredChangeAcceptance(
	value: ChangeAcceptanceInput | undefined,
): asserts value is ChangeAcceptanceInput {
	if (!value) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "missing_required",
			field: "changeAcceptance",
			message: "wiki_decide requires exact validated Change acceptance input.",
		});
	}
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
		acceptedChangeBundleDigest: loopResult.output.acceptedChangeBundle?.digest,
	});
	return { markdown, digest: sprintProposalMarkdownDigest(markdown) };
}

function assertSprintProposalApproval(
	approval: SprintProposalApprovalInput | undefined,
	rendered: RenderedSprintProposal,
	changeAcceptance?: ChangeAcceptanceInput,
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
	if (
		changeAcceptance &&
		(approval.approvedBy !== changeAcceptance.acceptedBy ||
			approval.approvedAt !== changeAcceptance.acceptedAt)
	) {
		throw createCodewikiApiError({
			operation: "wiki_decide",
			code: "invalid_input",
			field: "sprintProposalApproval.approvedBy",
			message:
				"wiki_decide acceptance authority and timestamp must match the exact rendered proposal approval.",
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
