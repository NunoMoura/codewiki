import {
	componentKbRefs,
	type SourceMapContract,
} from "../knowledge/source-map.ts";
import type { LoopQualityJudgeExecutionOptions } from "../loops/evaluator.ts";
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
import {
	evaluatePlanningExit,
	evaluatePlanningExitWithRunner,
	type PlanningExitResult,
} from "./loop.ts";
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
	componentMap?: SourceMapContract;
	qualityJudge?: LoopQualityJudgeExecutionOptions;
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
	return planningIterationResult({
		input,
		decisionRefs,
		workItems,
		resolutions,
		exit,
	});
}

export async function runPlanningIterationWithRunner(
	input: PlanningIterationInput,
): Promise<PlanningIterationResult> {
	const decisionRefs = decisionRefsFromEvents(input.decisionEvents);
	const workItems =
		input.workItems ?? normalizePlanningWorkItems(input.workItemInputs || []);
	const resolutions =
		input.resolutions ??
		normalizePlanningDecisionResolutions(input.resolutionInputs || []);
	const exit = await evaluatePlanningExitWithRunner({
		decisionRefs,
		workItems,
		resolutions,
		componentMap: input.componentMap,
		qualityJudge: input.qualityJudge,
	});
	return planningIterationResult({
		input,
		decisionRefs,
		workItems,
		resolutions,
		exit,
	});
}

function planningIterationResult(args: {
	input: PlanningIterationInput;
	decisionRefs: string[];
	workItems: PlanningWorkItem[];
	resolutions: PlanningDecisionResolution[];
	exit: PlanningExitResult;
}): PlanningIterationResult {
	const createdAt = args.input.createdAt || new Date().toISOString();
	const baseSequence = args.input.startSequence ?? 1;
	const buildId = `${args.input.traceId}:planning:iteration:${baseSequence}`;
	const eventInput = { ...args.input, createdAt, baseSequence };
	const draftTraceEvents: TraceEvent[] = [];
	const traceEvents = planningTraceEvents({
		input: eventInput,
		decisionRefs: args.decisionRefs,
		workItems: args.workItems,
		resolutions: args.resolutions,
		exit: args.exit,
	});
	const refs = planningOutputRefs(
		args.decisionRefs,
		args.workItems,
		args.resolutions,
		args.input.componentMap,
	);
	const checkpoint = createLoopTailCheckpoint({
		traceId: args.input.traceId,
		loop: "planning",
		id: `${args.input.traceId}:planning:checkpoint:${baseSequence}`,
		parentId: traceEvents.at(-1)?.id || buildId,
		firstKeptRecordId: traceEvents.at(-1)?.id || buildId,
		createdAt,
		exit: args.exit,
		sourceRefs: refs,
	});
	return {
		decisionRefs: args.decisionRefs,
		workItems: args.workItems,
		resolutions: args.resolutions,
		exit: args.exit,
		draftTraceEvents,
		traceEvents,
		checkpoint,
		traceRecords: [...traceEvents, checkpoint],
		readyForImplementation: args.exit.passed,
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
				qualityGraph: exit.qualityGraph,
				qualityStandards: exit.qualityStandards,
				qualityDiagnostics: exit.diagnostics,
				qualityRunner: exit.qualityRunner,
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
	componentMap?: SourceMapContract,
): string[] {
	return normalizeTraceRefs([
		...decisionRefs,
		...workItems.flatMap((item) => item.pathScopes),
		...workItems.flatMap((item) => item.trigger?.refs || []),
		...resolutions.flatMap((resolution) => resolution.evidenceRefs),
		...componentMapRefs(workItems, componentMap),
	]);
}

function componentMapRefs(
	workItems: PlanningWorkItem[],
	componentMap?: SourceMapContract,
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
		planningDepth: item.planningDepth,
		verification: item.verification,
		workerProfile: item.workerProfile,
		planningAssessment: item.planningAssessment,
		dependsOn: item.dependsOn,
		...(item.trigger ? { trigger: item.trigger } : {}),
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
