import { createLoopIterationEvent } from "../../src/traces/events.ts";
import { assertValidTraceRecord } from "../../src/traces/schema.ts";
import type { TraceHead, TraceRecord } from "../../src/traces/types.ts";
import type { PipelineCaseInput, PipelineTraceHarnessResult } from "./types.ts";

const CREATED_AT = "2026-06-22T00:00:00.000Z";

export function buildPipelineTrace(
	input: PipelineCaseInput,
): PipelineTraceHarnessResult {
	const head: TraceHead = {
		type: "trace_head",
		traceId: input.traceId,
		title: input.userIntent,
		createdAt: CREATED_AT,
		origin: { kind: "manual", refs: input.decision.refs },
	};
	const decisionEvent = createLoopIterationEvent({
		traceId: input.traceId,
		loop: "decision",
		id: `${input.traceId}-decision-1`,
		parentId: null,
		sequence: 1,
		refs: input.decision.refs,
		createdAt: CREATED_AT,
		iteration: 1,
		trigger: input.userIntent,
		output: {
			changeRecord: {
				change: {
					id: input.decision.changeId,
					evidence: { sourceRefs: input.decision.refs },
					facts: input.decision.facts,
				},
			},
			decision: { disposition: "approve" },
		},
		exit: {
			status: "exit",
			conditions: [{ id: "decision_exit", status: "met" }],
			targetLoop: "planning",
			nextAction: "Plan implementation work from approved proposed changes.",
		},
		progress: {
			changedRefs: [input.decision.changeId, ...input.decision.refs],
			newlyMetConditions: ["decision_exit"],
			repeatedFailures: [],
			nextSafeAction:
				"Plan implementation work from approved proposed changes.",
		},
	});
	const planningEvent = createLoopIterationEvent({
		traceId: input.traceId,
		loop: "planning",
		id: `${input.traceId}-planning-1`,
		parentId: decisionEvent.id,
		sequence: 2,
		refs: input.planning.refs,
		createdAt: CREATED_AT,
		iteration: 1,
		trigger: "Decision trace event",
		output: {
			workItems: input.planning.workItems.map((workItem) => ({
				id: workItem.id,
				changeRefs: workItem.changeRefs,
				pathScopes: workItem.pathScopes,
				acceptanceCriteria: workItem.acceptanceCriteria,
				facts: workItem.facts,
			})),
		},
		exit: {
			status: "exit",
			conditions: [{ id: "planning_exit", status: "met" }],
			targetLoop: "implementation",
			nextAction: "Implement planned work units and collect evidence.",
		},
		progress: {
			changedRefs: input.planning.workItems.map((workItem) => workItem.id),
			newlyMetConditions: ["planning_exit"],
			repeatedFailures: [],
			nextSafeAction: "Implement planned work units and collect evidence.",
		},
	});
	const implementationEvent = createLoopIterationEvent({
		traceId: input.traceId,
		loop: "implementation",
		id: `${input.traceId}-implementation-1`,
		parentId: planningEvent.id,
		sequence: 3,
		refs: input.implementation.refs,
		createdAt: CREATED_AT,
		iteration: 1,
		trigger: "Planning trace event",
		output: {
			changes: input.implementation.changes.map((change) => ({
				id: change.id,
				workItemRefs: change.workItemRefs,
				acceptanceCovered: change.acceptanceCovered,
				evidenceRefs: change.evidenceRefs,
				facts: change.facts,
			})),
		},
		exit: {
			status: "exit",
			conditions: [{ id: "implementation_exit", status: "met" }],
			targetLoop: null,
			nextAction: "Close trace with accepted implementation evidence.",
		},
		progress: {
			changedRefs: input.implementation.changes.flatMap((change) => [
				change.id,
				...change.evidenceRefs,
			]),
			newlyMetConditions: ["implementation_exit"],
			repeatedFailures: [],
			nextSafeAction: "Close trace with accepted implementation evidence.",
		},
	});
	const records: TraceRecord[] = [
		head,
		decisionEvent,
		planningEvent,
		implementationEvent,
	];
	for (const record of records) assertValidTraceRecord(record);
	return {
		records,
		decisionEventId: decisionEvent.id,
		planningEventId: planningEvent.id,
		implementationEventId: implementationEvent.id,
	};
}
