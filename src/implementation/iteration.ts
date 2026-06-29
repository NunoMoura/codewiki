import {
	componentKbRefs,
	type SourceMapContract,
} from "../knowledge/source-map.ts";
import {
	createLoopIterationEvent,
	createLoopTailCheckpoint,
	loopExitFromEvaluation,
	loopProgressFromEvaluation,
} from "../traces/events.ts";
import type { ContentProof } from "../git/content-proof.ts";
import type { LoopQualityJudgeExecutionOptions } from "../loops/evaluator.ts";
import { normalizeTraceRefs } from "../traces/refs.ts";
import type {
	TailCheckpoint,
	TraceEvent,
	TraceRecord,
} from "../traces/types.ts";
import { implementationWorkerClaimsFromEvents } from "./claims.ts";
import {
	acceptanceRequirementsFromPlanningEvents,
	changedPaths,
	contentProofRefList,
	implementationEvidenceRefs,
	normalizeImplementationChanges,
	planningRefsFromEvents,
	planningScopesFromEvents,
} from "./evidence.ts";
import {
	evaluateImplementationExit,
	evaluateImplementationExitWithRunner,
} from "./loop.ts";
import { workerProofRefs } from "./worker-proof.ts";
import type {
	ImplementationWorkerAggregation,
	ImplementationWorkerResultInput,
} from "./workers.ts";
import { aggregateImplementationWorkerResults } from "./workers.ts";
import {
	evidenceRefsForReport,
	mergeImplementationEvidenceReports,
	type ImplementationEvidenceReportInput,
	type ReviewEvidenceCacheReader,
} from "./review/index.ts";
import type {
	AcceptanceRequirement,
	ImplementationArchiveDisposition,
	ImplementationArchiveDispositionInput,
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationExitResult,
	ImplementationWorkerClaim,
	PlanningImplementationScope,
} from "./types.ts";

export interface ImplementationIterationInput {
	traceId: string;
	planningEvents?: TraceEvent[];
	decisionEvents?: TraceEvent[];
	changes?: ImplementationChange[];
	changeInputs?: ImplementationChangeInput[];
	workerResults?: ImplementationWorkerResultInput[];
	workerClaims?: ImplementationWorkerClaim[];
	claimEvents?: TraceEvent[];
	reviewEvidenceReports?: ImplementationEvidenceReportInput[];
	reviewEvidenceCache?: ReviewEvidenceCacheReader;
	archiveDisposition?: ImplementationArchiveDisposition;
	archiveDispositionInput?: ImplementationArchiveDispositionInput;
	requireArchiveDisposition?: boolean;
	expectedWorkerBaseSha?: string;
	componentMap?: SourceMapContract;
	aggregateContentProof?: ContentProof;
	existingPaths?: string[];
	requireTddEvidence?: boolean;
	qualityJudge?: LoopQualityJudgeExecutionOptions;
	parentId?: string | null;
	startSequence?: number;
	createdAt?: string;
}

export interface ImplementationIterationResult {
	planningRefs: string[];
	acceptanceRequirements: AcceptanceRequirement[];
	planningScopes: PlanningImplementationScope[];
	workerAggregation: ImplementationWorkerAggregation;
	workerClaims: ImplementationWorkerClaim[];
	aggregateContentProof?: ContentProof;
	changes: ImplementationChange[];
	reviewEvidenceReports: ImplementationEvidenceReportInput[];
	archiveDisposition?: ImplementationArchiveDisposition;
	exit: ImplementationExitResult;
	draftTraceEvents: TraceEvent[];
	traceEvents: TraceEvent[];
	checkpoint: TailCheckpoint;
	traceRecords: TraceRecord[];
	readyForClosure: boolean;
}

export function runImplementationIteration(
	input: ImplementationIterationInput,
): ImplementationIterationResult {
	const createdAt = input.createdAt || new Date().toISOString();
	const routeSourceEvents = [
		...(input.planningEvents || []),
		...(input.decisionEvents || []),
	];
	const planningRefs = planningRefsFromEvents(routeSourceEvents);
	const acceptanceRequirements =
		acceptanceRequirementsFromPlanningEvents(routeSourceEvents);
	const planningScopes = planningScopesFromEvents(routeSourceEvents);
	const workerAggregation = aggregateImplementationWorkerResults(
		input.workerResults,
	);
	const workerClaims =
		input.workerClaims ??
		implementationWorkerClaimsFromEvents(input.claimEvents, { at: createdAt });
	const changes =
		input.changes ??
		normalizeImplementationChanges([
			...(input.changeInputs || []),
			...workerAggregation.changeInputs,
		]);
	const aggregateContentProof = aggregateProofForOutput(
		changes,
		input.aggregateContentProof,
	);
	const reviewEvidenceReports = reviewEvidenceReportsForIteration(
		input,
		changes,
	);
	const archiveDisposition = archiveDispositionForIteration(input);
	const exit = evaluateImplementationExit({
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		componentMap: input.componentMap,
		existingPaths: input.existingPaths,
		requireTddEvidence: input.requireTddEvidence,
		aggregateContentProof,
		workerResults: workerAggregation.workerResults,
		workerProofs: workerAggregation.workerProofs,
		workerProofConflicts: workerAggregation.workerProofConflicts,
		expectedWorkerBaseSha: input.expectedWorkerBaseSha,
		workerClaims,
		reviewEvidenceReports,
		archiveDisposition,
		requireArchiveDisposition: input.requireArchiveDisposition,
		changes,
	});
	const baseSequence = input.startSequence ?? 1;
	const buildId = `${input.traceId}:implementation:iteration:${baseSequence}`;
	const eventInput = {
		...input,
		reviewEvidenceReports,
		archiveDisposition,
		createdAt,
		baseSequence,
	};
	const draftTraceEvents: TraceEvent[] = [];
	const traceEvents = implementationTraceEvents({
		input: eventInput,
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		workerAggregation,
		workerClaims,
		aggregateContentProof,
		changes,
		exit,
	});
	const refs = implementationOutputRefs(
		planningRefs,
		changes,
		planningScopes,
		workerAggregation,
		aggregateContentProof,
		input.componentMap,
		reviewEvidenceReports,
		archiveDisposition,
	);
	const checkpoint = createLoopTailCheckpoint({
		traceId: input.traceId,
		loop: "implementation",
		id: `${input.traceId}:implementation:checkpoint:${baseSequence}`,
		parentId: traceEvents.at(-1)?.id || buildId,
		firstKeptRecordId: traceEvents.at(-1)?.id || buildId,
		createdAt,
		exit,
		sourceRefs: refs,
	});
	return {
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		workerAggregation,
		workerClaims,
		aggregateContentProof,
		changes,
		reviewEvidenceReports: reviewEvidenceReports,
		archiveDisposition,
		exit,
		draftTraceEvents,
		traceEvents,
		checkpoint,
		traceRecords: [...traceEvents, checkpoint],
		readyForClosure: exit.passed,
	};
}

export async function runImplementationIterationWithRunner(
	input: ImplementationIterationInput,
): Promise<ImplementationIterationResult> {
	const createdAt = input.createdAt || new Date().toISOString();
	const routeSourceEvents = [
		...(input.planningEvents || []),
		...(input.decisionEvents || []),
	];
	const planningRefs = planningRefsFromEvents(routeSourceEvents);
	const acceptanceRequirements =
		acceptanceRequirementsFromPlanningEvents(routeSourceEvents);
	const planningScopes = planningScopesFromEvents(routeSourceEvents);
	const workerAggregation = aggregateImplementationWorkerResults(
		input.workerResults,
	);
	const workerClaims =
		input.workerClaims ??
		implementationWorkerClaimsFromEvents(input.claimEvents, { at: createdAt });
	const changes =
		input.changes ??
		normalizeImplementationChanges([
			...(input.changeInputs || []),
			...workerAggregation.changeInputs,
		]);
	const aggregateContentProof = aggregateProofForOutput(
		changes,
		input.aggregateContentProof,
	);
	const reviewEvidenceReports = reviewEvidenceReportsForIteration(
		input,
		changes,
	);
	const archiveDisposition = archiveDispositionForIteration(input);
	const exit = await evaluateImplementationExitWithRunner({
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		componentMap: input.componentMap,
		existingPaths: input.existingPaths,
		requireTddEvidence: input.requireTddEvidence,
		aggregateContentProof,
		workerResults: workerAggregation.workerResults,
		workerProofs: workerAggregation.workerProofs,
		workerProofConflicts: workerAggregation.workerProofConflicts,
		expectedWorkerBaseSha: input.expectedWorkerBaseSha,
		workerClaims,
		reviewEvidenceReports,
		archiveDisposition,
		requireArchiveDisposition: input.requireArchiveDisposition,
		changes,
		qualityJudge: input.qualityJudge,
	});
	const baseSequence = input.startSequence ?? 1;
	const buildId = `${input.traceId}:implementation:iteration:${baseSequence}`;
	const eventInput = {
		...input,
		reviewEvidenceReports,
		archiveDisposition,
		createdAt,
		baseSequence,
	};
	const draftTraceEvents: TraceEvent[] = [];
	const traceEvents = implementationTraceEvents({
		input: eventInput,
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		workerAggregation,
		workerClaims,
		aggregateContentProof,
		changes,
		exit,
	});
	const refs = implementationOutputRefs(
		planningRefs,
		changes,
		planningScopes,
		workerAggregation,
		aggregateContentProof,
		input.componentMap,
		reviewEvidenceReports,
		archiveDisposition,
	);
	const checkpoint = createLoopTailCheckpoint({
		traceId: input.traceId,
		loop: "implementation",
		id: `${input.traceId}:implementation:checkpoint:${baseSequence}`,
		parentId: traceEvents.at(-1)?.id || buildId,
		firstKeptRecordId: traceEvents.at(-1)?.id || buildId,
		createdAt,
		exit,
		sourceRefs: refs,
	});
	return {
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		workerAggregation,
		workerClaims,
		aggregateContentProof,
		changes,
		reviewEvidenceReports: reviewEvidenceReports,
		archiveDisposition,
		exit,
		draftTraceEvents,
		traceEvents,
		checkpoint,
		traceRecords: [...traceEvents, checkpoint],
		readyForClosure: exit.passed,
	};
}

function aggregateProofForOutput(
	changes: ImplementationChange[],
	inputProof?: ContentProof,
): ContentProof | undefined {
	if (inputProof) return inputProof;
	if (changes.length !== 1) return undefined;
	const [change] = changes;
	return change.workerId || change.claimId ? undefined : change.contentProof;
}

function reviewEvidenceReportsForIteration(
	input: ImplementationIterationInput,
	changes: ImplementationChange[],
): ImplementationEvidenceReportInput[] {
	const changedPathList = changes.flatMap((change) => changedPaths(change));
	const cachedReports =
		input.reviewEvidenceCache?.reports({
			traceId: input.traceId,
			changedPaths: changedPathList,
			phases: ["fast", "exit"],
		}) || [];
	return [...cachedReports, ...(input.reviewEvidenceReports || [])];
}

function archiveDispositionForIteration(
	input: ImplementationIterationInput,
): ImplementationArchiveDisposition | undefined {
	if (input.archiveDisposition) return input.archiveDisposition;
	const disposition = input.archiveDispositionInput;
	if (!disposition) return undefined;
	return {
		action: text(disposition.action),
		traceId: text(disposition.traceId ?? disposition.trace_id) || input.traceId,
		reason: text(disposition.reason),
		afterCommit: Boolean(
			disposition.afterCommit ?? disposition.after_commit ?? false,
		),
		...(text(disposition.gitRestoreRef ?? disposition.git_restore_ref)
			? {
					gitRestoreRef: text(
						disposition.gitRestoreRef ?? disposition.git_restore_ref,
					),
				}
			: {}),
		refs: (disposition.refs || []).map(text).filter(Boolean),
	};
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function implementationTraceEvents(args: {
	input: ImplementationIterationInput & {
		createdAt: string;
		baseSequence: number;
	};
	planningRefs: string[];
	acceptanceRequirements: AcceptanceRequirement[];
	planningScopes: PlanningImplementationScope[];
	workerAggregation: ImplementationWorkerAggregation;
	workerClaims: ImplementationWorkerClaim[];
	aggregateContentProof?: ContentProof;
	changes: ImplementationChange[];
	exit: ImplementationExitResult;
}): TraceEvent[] {
	const {
		input,
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		workerAggregation,
		workerClaims,
		aggregateContentProof,
		changes,
		exit,
	} = args;
	const refs = implementationOutputRefs(
		planningRefs,
		changes,
		planningScopes,
		workerAggregation,
		aggregateContentProof,
		input.componentMap,
		input.reviewEvidenceReports,
		input.archiveDisposition,
	);
	return [
		createLoopIterationEvent({
			traceId: input.traceId,
			loop: "implementation",
			id: `${input.traceId}:implementation:iteration:${input.baseSequence}`,
			parentId: input.parentId ?? null,
			sequence: input.baseSequence,
			refs,
			createdAt: input.createdAt,
			iteration: input.baseSequence,
			trigger: "implementation",
			output: {
				planningRefs,
				acceptanceRequirements,
				planningScopes,
				workerResults: workerAggregation.workerResults,
				workerProofs: workerAggregation.workerProofs,
				workerProofConflicts: workerAggregation.workerProofConflicts,
				workerClaims,
				aggregateContentProof,
				changes: changes.map(implementationChangeData),
				qualityGraph: exit.qualityGraph,
				qualityStandards: exit.qualityStandards,
				qualityDiagnostics: exit.diagnostics,
				reviewEvidenceReports: input.reviewEvidenceReports || [],
				archiveDisposition: input.archiveDisposition,
				qualityRunner: exit.qualityRunner,
				issueCodes: exit.issues.map((issue) => issue.code),
			},
			exit: loopExitFromEvaluation("implementation", exit),
			progress: loopProgressFromEvaluation(exit, refs),
		}),
	];
}

function implementationOutputRefs(
	planningRefs: string[],
	changes: ImplementationChange[],
	planningScopes: PlanningImplementationScope[],
	workerAggregation: ImplementationWorkerAggregation,
	aggregateContentProof?: ContentProof,
	componentMap?: SourceMapContract,
	reviewEvidenceReports?: ImplementationEvidenceReportInput[],
	archiveDisposition?: ImplementationArchiveDisposition,
): string[] {
	return normalizeTraceRefs([
		...planningRefs,
		...changes.flatMap((change) => changedPaths(change)),
		...changes.flatMap((change) => implementationEvidenceRefs(change)),
		...workerAggregation.workerProofs.flatMap(workerProofRefs),
		...contentProofRefList(aggregateContentProof),
		...componentMapRefs(planningScopes, componentMap),
		...reviewEvidenceReportRefs(reviewEvidenceReports),
		...archiveDispositionRefList(archiveDisposition),
	]);
}

function archiveDispositionRefList(
	disposition?: ImplementationArchiveDisposition,
): string[] {
	if (!disposition) return [];
	return [
		disposition.traceId,
		disposition.gitRestoreRef,
		...disposition.refs,
	]
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
}

function reviewEvidenceReportRefs(
	reports?: ImplementationEvidenceReportInput[],
): string[] {
	if (!reports || reports.length === 0) return [];
	return evidenceRefsForReport(mergeImplementationEvidenceReports(reports));
}

function componentMapRefs(
	planningScopes: PlanningImplementationScope[],
	componentMap?: SourceMapContract,
): string[] {
	if (!componentMap) return [];
	return [
		...componentMap.sourceRefs,
		...componentKbRefs(
			componentMap,
			planningScopes.flatMap((scope) => scope.componentRefs),
		),
	];
}

function implementationChangeData(
	change: ImplementationChange,
): Record<string, unknown> {
	return {
		id: change.id,
		planningRefs: change.planningRefs,
		workerId: change.workerId,
		workUnitId: change.workUnitId,
		claimId: change.claimId,
		sessionId: change.sessionId,
		sessionFile: change.sessionFile,
		codePaths: change.codePaths,
		docPaths: change.docPaths,
		testPaths: change.testPaths,
		checks: change.checks,
		checkResults: change.checkResults,
		acceptanceEvidence: change.acceptanceEvidence,
		acceptanceEvidenceItems: change.acceptanceEvidenceItems,
		contentProof: change.contentProof,
		implementationAssessment: change.implementationAssessment,
		sensitiveSurfaceAssessment: change.sensitiveSurfaceAssessment,
		approvalAuthority: change.approvalAuthority,
		approvalRef: change.approvalRef,
		publicationRefs: change.publicationRefs,
	};
}
