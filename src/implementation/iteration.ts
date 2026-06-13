import {
	componentKbRefs,
	type FileStructureMapContract,
} from "../knowledge/file-structure-map.ts";
import {
	createLoopIterationEvent,
	createLoopTailCheckpoint,
	loopExitFromEvaluation,
	loopProgressFromEvaluation,
} from "../traces/events.ts";
import type { ContentProof } from "../git/content-proof.ts";
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
import { evaluateImplementationExit } from "./exit.ts";
import type {
	ImplementationWorkerAggregation,
	ImplementationWorkerResultInput,
} from "./workers.ts";
import { aggregateImplementationWorkerResults } from "./workers.ts";
import type {
	AcceptanceRequirement,
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationExitResult,
	ImplementationWorkerClaim,
	PlanningImplementationScope,
} from "./types.ts";

export interface ImplementationIterationInput {
	traceId: string;
	planningEvents: TraceEvent[];
	changes?: ImplementationChange[];
	changeInputs?: ImplementationChangeInput[];
	workerResults?: ImplementationWorkerResultInput[];
	workerClaims?: ImplementationWorkerClaim[];
	claimEvents?: TraceEvent[];
	componentMap?: FileStructureMapContract;
	aggregateContentProof?: ContentProof;
	existingPaths?: string[];
	requireTddEvidence?: boolean;
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
	const planningRefs = planningRefsFromEvents(input.planningEvents);
	const acceptanceRequirements = acceptanceRequirementsFromPlanningEvents(
		input.planningEvents,
	);
	const planningScopes = planningScopesFromEvents(input.planningEvents);
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
	const exit = evaluateImplementationExit({
		planningRefs,
		acceptanceRequirements,
		planningScopes,
		componentMap: input.componentMap,
		existingPaths: input.existingPaths,
		requireTddEvidence: input.requireTddEvidence,
		aggregateContentProof,
		workerResults: workerAggregation.workerResults,
		workerClaims,
		changes,
	});
	const baseSequence = input.startSequence ?? 1;
	const buildId = `${input.traceId}:implementation:iteration:${baseSequence}`;
	const eventInput = { ...input, createdAt, baseSequence };
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
		aggregateContentProof,
		input.componentMap,
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
		aggregateContentProof,
		input.componentMap,
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
				workerClaims,
				aggregateContentProof,
				changes: changes.map(implementationChangeData),
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
	aggregateContentProof?: ContentProof,
	componentMap?: FileStructureMapContract,
): string[] {
	return normalizeTraceRefs([
		...planningRefs,
		...changes.flatMap((change) => changedPaths(change)),
		...changes.flatMap((change) => implementationEvidenceRefs(change)),
		...contentProofRefList(aggregateContentProof),
		...componentMapRefs(planningScopes, componentMap),
	]);
}

function componentMapRefs(
	planningScopes: PlanningImplementationScope[],
	componentMap?: FileStructureMapContract,
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
		publicationRefs: change.publicationRefs,
	};
}
