import type { TraceEvent } from "../traces/types.ts";
import { evaluatePlanningGate, type PlanningGateResult } from "./gate.ts";
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

export interface PlanningCompileInput {
	traceId: string;
	decisionEvents: TraceEvent[];
	workItems?: PlanningWorkItem[];
	workItemInputs?: PlanningWorkItemInput[];
	resolutions?: PlanningDecisionResolution[];
	resolutionInputs?: PlanningDecisionResolutionInput[];
	parentId?: string | null;
	startSequence?: number;
	createdAt?: string;
}

export interface PlanningCompileResult {
	decisionRefs: string[];
	workItems: PlanningWorkItem[];
	resolutions: PlanningDecisionResolution[];
	gate: PlanningGateResult;
	traceEvents: TraceEvent[];
	readyForImplementation: boolean;
}

export function compilePlan(input: PlanningCompileInput): PlanningCompileResult {
	const decisionRefs = decisionRefsFromEvents(input.decisionEvents);
	const workItems = input.workItems ?? normalizePlanningWorkItems(input.workItemInputs || []);
	const resolutions = input.resolutions ?? normalizePlanningDecisionResolutions(input.resolutionInputs || []);
	const gate = evaluatePlanningGate({ decisionRefs, workItems, resolutions });
	const traceEvents = [...workItems.map((item, index) =>
		workItemTraceEvent({ item, input, sequenceOffset: index }),
	), ...resolutions.map((resolution, index) =>
		resolutionTraceEvent({
			resolution,
			input,
			sequenceOffset: workItems.length + index,
		}),
	)];
	return {
		decisionRefs,
		workItems,
		resolutions,
		gate,
		traceEvents,
		readyForImplementation: gate.passed,
	};
}

function workItemTraceEvent(args: {
	item: PlanningWorkItem;
	input: PlanningCompileInput;
	sequenceOffset: number;
}): TraceEvent {
	const { item, input, sequenceOffset } = args;
	return {
		type: "trace_event",
		id: `${input.traceId}:planning:${item.id}`,
		parentId: input.parentId ?? null,
		traceId: input.traceId,
		sequence: (input.startSequence ?? 1) + sequenceOffset,
		loop: "planning",
		event: "planning.work-unit.materialized",
		refs: [...item.decisionRefs, ...item.pathScopes],
		createdAt: input.createdAt || new Date().toISOString(),
		data: {
			workUnitId: item.id,
			title: item.title,
			outcome: item.outcome,
			acceptance: item.acceptance,
			verification: item.verification,
			dependsOn: item.dependsOn,
		},
	};
}

function resolutionTraceEvent(args: {
	resolution: PlanningDecisionResolution;
	input: PlanningCompileInput;
	sequenceOffset: number;
}): TraceEvent {
	const { resolution, input, sequenceOffset } = args;
	return {
		type: "trace_event",
		id: `${input.traceId}:planning:${resolution.decisionRef}:${resolution.kind}`,
		parentId: input.parentId ?? null,
		traceId: input.traceId,
		sequence: (input.startSequence ?? 1) + sequenceOffset,
		loop: "planning",
		event: "planning.decision.resolved",
		refs: [resolution.decisionRef, ...resolution.workUnitIds, ...resolution.evidenceRefs],
		createdAt: input.createdAt || new Date().toISOString(),
		data: {
			decisionRef: resolution.decisionRef,
			kind: resolution.kind,
			workUnitIds: resolution.workUnitIds,
			owner: resolution.owner,
			trigger: resolution.trigger,
			rationale: resolution.rationale,
		},
	};
}
