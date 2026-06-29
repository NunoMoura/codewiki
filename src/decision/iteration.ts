import {
	createLoopIterationEvent,
	createLoopTailCheckpoint,
	loopExitFromEvaluation,
	loopProgressFromEvaluation,
} from "../traces/events.ts";
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
import { approvedDecisionRows, createDecisionTable } from "./table.ts";
import {
	decisionTypeDefinitionById,
	normalizeDecisionTypeId,
} from "./type-definitions.ts";
import type {
	ActiveTraceGoal,
	CurrentStatePacket,
	DecisionOutput,
	DecisionOutputTypeProfile,
	DecisionRow,
	DecisionTable,
	DecisionTableInput,
	KnowledgeDelta,
} from "./types.ts";

export interface DecisionIterationInput {
	traceId: string;
	table?: DecisionTable;
	tableInput?: DecisionTableInput;
	knowledgeDelta?: KnowledgeDelta;
	currentStatePacket?: CurrentStatePacket;
	activeTraceGoals?: ActiveTraceGoal[];
	qualityJudge?: LoopQualityJudgeExecutionOptions;
	requirementIds?: string[];
	parentId?: string | null;
	startSequence?: number;
	createdAt?: string;
}

export interface DecisionIterationResult {
	table: DecisionTable;
	output: DecisionOutput;
	exit: DecisionExitResult;
	approvedRows: DecisionRow[];
	draftTraceEvents: TraceEvent[];
	traceEvents: TraceEvent[];
	checkpoint: TailCheckpoint;
	traceRecords: TraceRecord[];
	readyForPlanning: boolean;
}

export function runDecisionIteration(
	input: DecisionIterationInput,
): DecisionIterationResult {
	const table = input.table ?? createDecisionTable(input.tableInput ?? {});
	const approvedRows = approvedDecisionRows(table);
	const createdAt = input.createdAt || table.updatedAt;
	const baseSequence = input.startSequence ?? 1;
	const output = decisionOutput({
		input,
		table,
		approvedRows,
		createdAt,
		baseSequence,
	});
	const exit = evaluateDecisionExit(table, {
		currentStatePacket: output.currentStatePacket,
		knowledgeDelta: output.knowledgeDelta,
		activeTraceGoals: input.activeTraceGoals,
	});
	return decisionIterationResult({
		input,
		table,
		output,
		exit,
		approvedRows,
		createdAt,
		baseSequence,
	});
}

export async function runDecisionIterationWithRunner(
	input: DecisionIterationInput,
): Promise<DecisionIterationResult> {
	const table = input.table ?? createDecisionTable(input.tableInput ?? {});
	const approvedRows = approvedDecisionRows(table);
	const createdAt = input.createdAt || table.updatedAt;
	const baseSequence = input.startSequence ?? 1;
	const output = decisionOutput({
		input,
		table,
		approvedRows,
		createdAt,
		baseSequence,
	});
	const exit = await evaluateDecisionExitWithRunner(table, {
		currentStatePacket: output.currentStatePacket,
		knowledgeDelta: output.knowledgeDelta,
		activeTraceGoals: input.activeTraceGoals,
		qualityJudge: input.qualityJudge,
	});
	return decisionIterationResult({
		input,
		table,
		output,
		exit,
		approvedRows,
		createdAt,
		baseSequence,
	});
}

function decisionIterationResult(input: {
	input: DecisionIterationInput;
	table: DecisionTable;
	output: DecisionOutput;
	exit: DecisionExitResult;
	approvedRows: DecisionRow[];
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
		table: input.table,
		output: input.output,
		exit: input.exit,
		approvedRows: input.approvedRows,
		draftTraceEvents,
		traceEvents,
		checkpoint,
		traceRecords: [...traceEvents, checkpoint],
		readyForPlanning: input.exit.route === "planning",
	};
}

function decisionOutput(input: {
	input: DecisionIterationInput;
	table: DecisionTable;
	approvedRows: DecisionRow[];
	createdAt: string;
	baseSequence: number;
}): DecisionOutput {
	const knowledgeDelta =
		input.input.knowledgeDelta || inferredKnowledgeDelta(input.approvedRows);
	const currentStatePacket =
		input.input.currentStatePacket ||
		inferredCurrentStatePacket({
			table: input.table,
			approvedRows: input.approvedRows,
			createdAt: input.createdAt,
		});
	return {
		id: `${input.input.traceId}:decision:output:${input.baseSequence}`,
		traceId: input.input.traceId,
		tableId: input.table.id,
		summary: input.table.summary || decisionSummary(input.approvedRows),
		approvedRowIds: input.approvedRows.map((row) => row.id),
		requirementIds: input.input.requirementIds || [],
		decisionTypeProfiles: decisionTypeProfiles(input.approvedRows),
		knowledgeDelta,
		currentStatePacket,
		refs: normalizeTraceRefs([
			...input.table.sourceRefs,
			...input.approvedRows.flatMap((row) => row.sourceRefs),
			...currentStatePacket.refs,
			...knowledgeDelta.updatedRefs,
		]),
		createdAt: input.createdAt,
	};
}

function inferredCurrentStatePacket(input: {
	table: DecisionTable;
	approvedRows: DecisionRow[];
	createdAt: string;
}): CurrentStatePacket {
	return {
		summary: currentStateSummary(input.approvedRows),
		refs: normalizeTraceRefs([
			...input.table.sourceRefs,
			...input.approvedRows.flatMap((row) => [
				...row.sourceRefs,
				...row.proofRefs,
			]),
		]),
		observedAt: input.createdAt,
	};
}

function currentStateSummary(rows: DecisionRow[]): string {
	if (rows.length === 0) return "No approved decision rows observed.";
	return rows.map((row) => `${row.id}: ${row.currentState}`).join(" ");
}

function inferredKnowledgeDelta(rows: DecisionRow[]): KnowledgeDelta {
	return {
		updatedRefs: normalizeTraceRefs(rows.flatMap((row) => row.sourceRefs)),
		sections: [],
		...(rows.every((row) => row.noKbImpactReason)
			? {
					noImpactReason: normalizeTraceRefs(
						rows.map((row) => row.noKbImpactReason || ""),
					).join(" "),
				}
			: {}),
	};
}

function decisionTypeProfiles(
	rows: DecisionRow[],
): DecisionOutputTypeProfile[] {
	return rows.flatMap((row) => {
		const definition = decisionTypeDefinitionById(
			normalizeDecisionTypeId(row.decisionType || row.decisionKind),
		);
		if (!definition) return [];
		return [
			{
				rowId: row.id,
				decisionType: definition.id,
				pipelineProfileId: definition.pipelineProfile.id,
				loopQualityProfileId: definition.loopQualityProfile.id,
				evidencePolicy: definition.evidencePolicy,
			},
		];
	});
}

function decisionSummary(rows: DecisionRow[]): string {
	if (rows.length === 0) return "Decision candidate has no approved rows.";
	return rows.map((row) => `${row.id}: ${row.desiredState}`).join(" ");
}

function decisionTraceEvents(input: {
	input: DecisionIterationInput;
	output: DecisionOutput;
	exit: DecisionExitResult;
	approvedRows: DecisionRow[];
	createdAt: string;
	baseSequence: number;
}): TraceEvent[] {
	const { output, exit, approvedRows, createdAt, baseSequence } = input;
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
				approvedRows: approvedRows.map(decisionRowData),
				approvedRowIds: output.approvedRowIds,
				decisionTypeProfiles: output.decisionTypeProfiles || [],
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

function decisionRowData(row: DecisionRow): Record<string, unknown> {
	return {
		id: row.id,
		question: row.question,
		decisionKind: row.decisionKind,
		decisionType: row.decisionType,
		currentState: row.currentState,
		currentStateRefs: [...row.sourceRefs, ...row.proofRefs],
		desiredState: row.desiredState,
		rationale: row.rationale,
		userImpact: row.userImpact,
		maintainerImpact: row.maintainerImpact,
		effort: row.effort,
		workScale: row.workScale,
		planningDepth: row.planningDepth,
		routeTarget: row.routeTarget,
		routeKind: row.routeKind,
		routeRationale: row.routeRationale,
		implementationMode: row.implementationMode,
		directImplementationScope: row.directImplementationScope,
		affectedLayers: row.affectedLayers,
		risk: row.risk,
		approvalAuthority: row.approvalAuthority,
		approvalRef: row.approvalRef,
		recommendation: row.recommendation,
		recommendationRationale: row.recommendationRationale,
		agentAssessment: row.agentAssessment,
		changeType: row.changeType,
		noKbImpactReason: row.noKbImpactReason,
		targetRefs: row.targetRefs,
		hypothesis: row.hypothesis,
		invariant: row.invariant,
		probe: row.probe,
		expectedSafeBehavior: row.expectedSafeBehavior,
		stopCondition: row.stopCondition,
		reproduction: row.reproduction,
		expectedBehavior: row.expectedBehavior,
		regressionPlan: row.regressionPlan,
		safetyBoundary: row.safetyBoundary,
		failureModes: row.failureModes,
		negativeTestPlan: row.negativeTestPlan,
		compatibilityImpact: row.compatibilityImpact,
		currentPain: row.currentPain,
		desiredOutcome: row.desiredOutcome,
		successSignal: row.successSignal,
		nonGoals: row.nonGoals,
		sourceBehavior: row.sourceBehavior,
		targetBehavior: row.targetBehavior,
		preservedInvariants: row.preservedInvariants,
		equivalenceProof: row.equivalenceProof,
		rollbackPlan: row.rollbackPlan,
	};
}
