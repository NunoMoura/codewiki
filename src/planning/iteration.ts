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
import { normalizeTraceRefs } from "../traces/refs.ts";
import type {
	TailCheckpoint,
	TraceEvent,
	TraceRecord,
} from "../traces/types.ts";
import { evaluatePlanningExit, type PlanningExitResult } from "./exit.ts";
import {
	decisionRefsFromEvents,
	normalizePlanningDecisionResolutions,
	normalizePlanningWorkItems,
} from "./materialization.ts";
import type {
	PlanningDecisionResolution,
	PlanningDecisionResolutionInput,
	PlanningWorkItem,
	PlanningWorkItemInput,
} from "./types.ts";

export interface PlanningIterationInput {
	traceId: string;
	decisionEvents: TraceEvent[];
	workItems?: PlanningWorkItem[];
	workItemInputs?: PlanningWorkItemInput[];
	resolutions?: PlanningDecisionResolution[];
	resolutionInputs?: PlanningDecisionResolutionInput[];
	componentMap?: FileStructureMapContract;
	parentId?: string | null;
	startSequence?: number;
	createdAt?: string;
}

export interface PlanningIterationResult {
	decisionRefs: string[];
	workItems: PlanningWorkItem[];
	resolutions: PlanningDecisionResolution[];
	exit: PlanningExitResult;
	draftTraceEvents: TraceEvent[];
	traceEvents: TraceEvent[];
	checkpoint: TailCheckpoint;
	traceRecords: TraceRecord[];
	readyForImplementation: boolean;
}

export function runPlanningIteration(
	input: PlanningIterationInput,
): PlanningIterationResult {
	const decisionRefs = decisionRefsFromEvents(input.decisionEvents);
	const workItems =
		input.workItems ?? normalizePlanningWorkItems(input.workItemInputs || []);
	const resolutions =
		input.resolutions ??
		normalizePlanningDecisionResolutions(input.resolutionInputs || []);
	const exit = evaluatePlanningExit({
		decisionRefs,
		workItems,
		resolutions,
		componentMap: input.componentMap,
	});
	const createdAt = input.createdAt || new Date().toISOString();
	const baseSequence = input.startSequence ?? 1;
	const buildId = `${input.traceId}:planning:iteration:${baseSequence}`;
	const eventInput = { ...input, createdAt, baseSequence };
	const draftTraceEvents: TraceEvent[] = [];
	const traceEvents = planningTraceEvents({
		input: eventInput,
		decisionRefs,
		workItems,
		resolutions,
		exit,
	});
	const refs = planningOutputRefs(
		decisionRefs,
		workItems,
		resolutions,
		input.componentMap,
	);
	const checkpoint = createLoopTailCheckpoint({
		traceId: input.traceId,
		loop: "planning",
		id: `${input.traceId}:planning:checkpoint:${baseSequence}`,
		parentId: traceEvents.at(-1)?.id || buildId,
		firstKeptRecordId: traceEvents.at(-1)?.id || buildId,
		createdAt,
		exit,
		sourceRefs: refs,
	});
	return {
		decisionRefs,
		workItems,
		resolutions,
		exit,
		draftTraceEvents,
		traceEvents,
		checkpoint,
		traceRecords: [...traceEvents, checkpoint],
		readyForImplementation: exit.passed,
	};
}

function planningTraceEvents(args: {
	input: PlanningIterationInput & {
		createdAt: string;
		baseSequence: number;
	};
	decisionRefs: string[];
	workItems: PlanningWorkItem[];
	resolutions: PlanningDecisionResolution[];
	exit: PlanningExitResult;
}): TraceEvent[] {
	const { input, decisionRefs, workItems, resolutions, exit } = args;
	const refs = planningOutputRefs(
		decisionRefs,
		workItems,
		resolutions,
		input.componentMap,
	);
	return [
		createLoopIterationEvent({
			traceId: input.traceId,
			loop: "planning",
			id: `${input.traceId}:planning:iteration:${input.baseSequence}`,
			parentId: input.parentId ?? null,
			sequence: input.baseSequence,
			refs,
			createdAt: input.createdAt,
			iteration: input.baseSequence,
			trigger: "planning",
			output: {
				decisionRefs,
				workItems: workItems.map(planningWorkItemData),
				resolutions: resolutions.map(planningResolutionData),
				qualityStandards: exit.qualityStandards,
				issueCodes: exit.issues.map((issue) => issue.code),
			},
			exit: loopExitFromEvaluation("planning", exit),
			progress: loopProgressFromEvaluation(exit, refs),
		}),
	];
}

function planningOutputRefs(
	decisionRefs: string[],
	workItems: PlanningWorkItem[],
	resolutions: PlanningDecisionResolution[],
	componentMap?: FileStructureMapContract,
): string[] {
	return normalizeTraceRefs([
		...decisionRefs,
		...workItems.flatMap((item) => item.pathScopes),
		...resolutions.flatMap((resolution) => resolution.evidenceRefs),
		...componentMapRefs(workItems, componentMap),
	]);
}

function componentMapRefs(
	workItems: PlanningWorkItem[],
	componentMap?: FileStructureMapContract,
): string[] {
	if (!componentMap) return [];
	return [
		...componentMap.sourceRefs,
		...componentKbRefs(
			componentMap,
			workItems.flatMap((item) => item.componentRefs),
		),
	];
}

function planningWorkItemData(item: PlanningWorkItem): Record<string, unknown> {
	return {
		id: item.id,
		title: item.title,
		decisionRefs: item.decisionRefs,
		outcome: item.outcome,
		technicalRequirements: item.technicalRequirements,
		acceptance: item.acceptance,
		acceptanceCriteria: item.acceptanceCriteria,
		componentRefs: item.componentRefs,
		pathScopes: item.pathScopes,
		verification: item.verification,
		workerProfile: item.workerProfile,
		planningAssessment: item.planningAssessment,
		dependsOn: item.dependsOn,
	};
}

function planningResolutionData(
	resolution: PlanningDecisionResolution,
): Record<string, unknown> {
	return {
		decisionRef: resolution.decisionRef,
		kind: resolution.kind,
		workUnitIds: resolution.workUnitIds,
		evidenceRefs: resolution.evidenceRefs,
		owner: resolution.owner,
		trigger: resolution.trigger,
		rationale: resolution.rationale,
	};
}
