import type { AcceptedChangeBundle } from "../changes/accepted-bundle.ts";
import {
	createLoopIterationEvent,
	createLoopTailCheckpoint,
	loopExitFromEvaluation,
	loopProgressFromEvaluation,
} from "../traces/events.ts";
import type { KnowledgeAlignmentBaseline } from "../knowledge/topic-alignment.ts";
import type { LoopQualityJudgeExecutionOptions } from "../loops/evaluator.ts";
import { normalizeTraceRefs } from "../traces/refs.ts";
import type {
	TailCheckpoint,
	TraceEvent,
	TraceRecord,
} from "../traces/types.ts";
import {
	evaluateDecisionExit,
	evaluateDecisionExitWithRunner,
	type DecisionExitResult,
} from "./loop.ts";
import { approvedProposalChanges, createSprintProposal } from "./proposal.ts";
import {
	decisionPolicyProfileById,
	normalizeDecisionPolicyProfileId,
} from "./policy-profiles.ts";
import type {
	ActiveTraceGoal,
	CurrentStatePacket,
	DecisionOutput,
	ApprovedChangePolicyProfile,
	DecisionChange,
	SprintProposal,
	SprintProposalInput,
	KnowledgeDelta,
} from "./types.ts";

export interface DecisionIterationInput {
	traceId: string;
	acceptedChangeBundle?: AcceptedChangeBundle;
	proposal?: SprintProposal;
	proposalInput?: SprintProposalInput;
	knowledgeDelta?: KnowledgeDelta;
	currentStatePacket?: CurrentStatePacket;
	knowledgeAlignmentBaseline?: KnowledgeAlignmentBaseline;
	activeTraceGoals?: ActiveTraceGoal[];
	qualityJudge?: LoopQualityJudgeExecutionOptions;
	requirementIds?: string[];
	parentId?: string | null;
	startSequence?: number;
	createdAt?: string;
}

export interface DecisionIterationResult {
	proposal: SprintProposal;
	output: DecisionOutput;
	exit: DecisionExitResult;
	approvedChanges: DecisionChange[];
	draftTraceEvents: TraceEvent[];
	traceEvents: TraceEvent[];
	checkpoint: TailCheckpoint;
	traceRecords: TraceRecord[];
	readyForPlanning: boolean;
}

export function runDecisionIteration(
	input: DecisionIterationInput,
): DecisionIterationResult {
	const proposal =
		input.proposal ?? createSprintProposal(input.proposalInput ?? {});
	const approvedChanges = approvedProposalChanges(proposal);
	const createdAt = input.createdAt || proposal.updatedAt;
	const baseSequence = input.startSequence ?? 1;
	const output = decisionOutput({
		input,
		proposal,
		approvedChanges,
		createdAt,
		baseSequence,
	});
	const exit = evaluateDecisionExit(proposal, {
		currentStatePacket: output.currentStatePacket,
		knowledgeDelta: output.knowledgeDelta,
		activeTraceGoals: input.activeTraceGoals,
	});
	return decisionIterationResult({
		input,
		proposal,
		output,
		exit,
		approvedChanges,
		createdAt,
		baseSequence,
	});
}

export async function runDecisionIterationWithRunner(
	input: DecisionIterationInput,
): Promise<DecisionIterationResult> {
	const proposal =
		input.proposal ?? createSprintProposal(input.proposalInput ?? {});
	const approvedChanges = approvedProposalChanges(proposal);
	const createdAt = input.createdAt || proposal.updatedAt;
	const baseSequence = input.startSequence ?? 1;
	const output = decisionOutput({
		input,
		proposal,
		approvedChanges,
		createdAt,
		baseSequence,
	});
	const exit = await evaluateDecisionExitWithRunner(proposal, {
		currentStatePacket: output.currentStatePacket,
		knowledgeDelta: output.knowledgeDelta,
		activeTraceGoals: input.activeTraceGoals,
		qualityJudge: input.qualityJudge,
	});
	return decisionIterationResult({
		input,
		proposal,
		output,
		exit,
		approvedChanges,
		createdAt,
		baseSequence,
	});
}

function decisionIterationResult(input: {
	input: DecisionIterationInput;
	proposal: SprintProposal;
	output: DecisionOutput;
	exit: DecisionExitResult;
	approvedChanges: DecisionChange[];
	createdAt: string;
	baseSequence: number;
}): DecisionIterationResult {
	const draftTraceEvents: TraceEvent[] = [];
	const traceEvents = decisionTraceEvents(input);
	const checkpoint = createLoopTailCheckpoint({
		traceId: input.input.traceId,
		loop: "decision",
		id: `${input.input.traceId}:decision:checkpoint:${input.baseSequence}`,
		parentId: traceEvents.at(-1)?.id || input.output.id,
		firstKeptRecordId: traceEvents.at(-1)?.id || input.output.id,
		createdAt: input.createdAt,
		exit: input.exit,
		sourceRefs: input.output.refs,
	});
	return {
		proposal: input.proposal,
		output: input.output,
		exit: input.exit,
		approvedChanges: input.approvedChanges,
		draftTraceEvents,
		traceEvents,
		checkpoint,
		traceRecords: [...traceEvents, checkpoint],
		readyForPlanning: input.exit.route === "planning",
	};
}

function decisionOutput(input: {
	input: DecisionIterationInput;
	proposal: SprintProposal;
	approvedChanges: DecisionChange[];
	createdAt: string;
	baseSequence: number;
}): DecisionOutput {
	const knowledgeDelta =
		input.input.knowledgeDelta || inferredKnowledgeDelta(input.approvedChanges);
	const currentStatePacket =
		input.input.currentStatePacket ||
		inferredCurrentStatePacket({
			proposal: input.proposal,
			approvedChanges: input.approvedChanges,
			createdAt: input.createdAt,
		});
	return {
		id: `${input.input.traceId}:decision:output:${input.baseSequence}`,
		traceId: input.input.traceId,
		...(input.input.acceptedChangeBundle
			? { acceptedChangeBundle: input.input.acceptedChangeBundle }
			: {}),
		proposalId: input.proposal.id,
		summary: input.proposal.summary || decisionSummary(input.approvedChanges),
		approvedChangeIds: input.approvedChanges.map((change) => change.id),
		requirementIds: input.input.requirementIds || [],
		policyProfiles: policyProfiles(input.approvedChanges),
		...(input.proposal.sprintBoundary
			? { sprintBoundary: input.proposal.sprintBoundary }
			: {}),
		...(input.input.knowledgeAlignmentBaseline
			? { knowledgeAlignmentBaseline: input.input.knowledgeAlignmentBaseline }
			: {}),
		knowledgeDelta,
		currentStatePacket,
		refs: normalizeTraceRefs([
			...input.proposal.sourceRefs,
			...(input.proposal.sprintBoundary?.knowledgeTopics || []),
			...input.approvedChanges.flatMap((change) => change.sourceRefs),
			...currentStatePacket.refs,
			...knowledgeDelta.updatedRefs,
		]),
		createdAt: input.createdAt,
	};
}

function inferredCurrentStatePacket(input: {
	proposal: SprintProposal;
	approvedChanges: DecisionChange[];
	createdAt: string;
}): CurrentStatePacket {
	return {
		summary: currentStateSummary(input.approvedChanges),
		refs: normalizeTraceRefs([
			...input.proposal.sourceRefs,
			...input.approvedChanges.flatMap((change) => [
				...change.sourceRefs,
				...change.proofRefs,
			]),
		]),
		observedAt: input.createdAt,
	};
}

function currentStateSummary(changes: DecisionChange[]): string {
	if (changes.length === 0) return "No Decisions observed.";
	return changes
		.map((change) => `${change.id}: ${change.currentState}`)
		.join(" ");
}

function inferredKnowledgeDelta(changes: DecisionChange[]): KnowledgeDelta {
	return {
		updatedRefs: normalizeTraceRefs(
			changes.flatMap((change) => change.sourceRefs),
		),
		sections: [],
		...(changes.every((change) => change.noKbImpactReason)
			? {
					noImpactReason: normalizeTraceRefs(
						changes.map((change) => change.noKbImpactReason || ""),
					).join(" "),
				}
			: {}),
	};
}

function policyProfiles(
	changes: DecisionChange[],
): ApprovedChangePolicyProfile[] {
	return changes.flatMap((change) => {
		const definition = decisionPolicyProfileById(
			normalizeDecisionPolicyProfileId(change.policyProfileId || change.kind),
		);
		if (!definition) return [];
		return [
			{
				changeId: change.id,
				policyProfileId: definition.id,
				pipelineProfileId: definition.pipelineProfile.id,
				loopQualityProfileId: definition.loopQualityProfile.id,
				evidencePolicy: definition.evidencePolicy,
			},
		];
	});
}

function decisionSummary(changes: DecisionChange[]): string {
	if (changes.length === 0) return "Sprint has no Decisions.";
	return changes
		.map((change) => `${change.id}: ${change.desiredState}`)
		.join(" ");
}

function decisionTraceEvents(input: {
	input: DecisionIterationInput;
	output: DecisionOutput;
	exit: DecisionExitResult;
	approvedChanges: DecisionChange[];
	createdAt: string;
	baseSequence: number;
}): TraceEvent[] {
	const { output, exit, approvedChanges, createdAt, baseSequence } = input;
	return [
		createLoopIterationEvent({
			traceId: output.traceId,
			loop: "decision",
			id: `${output.traceId}:decision:iteration:${baseSequence}`,
			parentId: input.input.parentId ?? null,
			sequence: baseSequence,
			refs: output.refs,
			createdAt,
			iteration: baseSequence,
			trigger: "decision",
			output: {
				id: output.id,
				summary: output.summary,
				...(output.acceptedChangeBundle
					? { acceptedChangeBundle: output.acceptedChangeBundle }
					: {}),
				approvedChanges: approvedChanges.map(decisionChangeData),
				approvedChangeIds: output.approvedChangeIds,
				policyProfiles: output.policyProfiles || [],
				...(output.sprintBoundary
					? { sprintBoundary: output.sprintBoundary }
					: {}),
				currentStatePacket: output.currentStatePacket,
				knowledgeDelta: output.knowledgeDelta,
				qualityGraph: exit.qualityGraph,
				qualityStandards: exit.qualityStandards,
				qualityDiagnostics: exit.diagnostics,
				qualityRunner: exit.qualityRunner,
				issueCodes: exit.issues.map((issue) => issue.code),
			},
			exit: loopExitFromEvaluation("decision", exit),
			progress: loopProgressFromEvaluation(exit, output.refs),
		}),
	];
}

function decisionChangeData(change: DecisionChange): Record<string, unknown> {
	return {
		id: change.id,
		question: change.question,
		kind: change.kind,
		policyProfileId: change.policyProfileId,
		currentState: change.currentState,
		currentStateRefs: [...change.sourceRefs, ...change.proofRefs],
		desiredState: change.desiredState,
		rationale: change.rationale,
		userImpact: change.userImpact,
		maintainerImpact: change.maintainerImpact,
		effort: change.effort,
		workScale: change.workScale,
		planningDepth: change.planningDepth,
		routeTarget: change.routeTarget,
		routeKind: change.routeKind,
		routeRationale: change.routeRationale,
		implementationMode: change.implementationMode,
		directImplementationScope: change.directImplementationScope,
		affectedLayers: change.affectedLayers,
		risk: change.risk,
		approvalAuthority: change.approvalAuthority,
		approvalRef: change.approvalRef,
		recommendation: change.recommendation,
		recommendationRationale: change.recommendationRationale,
		agentAssessment: change.agentAssessment,
		scope: change.scope,
		noKbImpactReason: change.noKbImpactReason,
		targetRefs: change.targetRefs,
		hypothesis: change.hypothesis,
		invariant: change.invariant,
		probe: change.probe,
		expectedSafeBehavior: change.expectedSafeBehavior,
		stopCondition: change.stopCondition,
		reproduction: change.reproduction,
		expectedBehavior: change.expectedBehavior,
		regressionPlan: change.regressionPlan,
		safetyBoundary: change.safetyBoundary,
		failureModes: change.failureModes,
		negativeTestPlan: change.negativeTestPlan,
		compatibilityImpact: change.compatibilityImpact,
		currentPain: change.currentPain,
		desiredOutcome: change.desiredOutcome,
		successSignal: change.successSignal,
		nonGoals: change.nonGoals,
		sourceBehavior: change.sourceBehavior,
		targetBehavior: change.targetBehavior,
		preservedInvariants: change.preservedInvariants,
		equivalenceProof: change.equivalenceProof,
		rollbackPlan: change.rollbackPlan,
	};
}
