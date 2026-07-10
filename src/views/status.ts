import { directImplementationDecisionsFromRecords } from "../decision/direct-implementation.ts";
import { loopOutputEvents, traceRefs } from "../traces/queries.ts";
import { replayTrace } from "../traces/replay.ts";
import type { TraceLoop, TraceRecord } from "../traces/types.ts";
import { blockersFromTrace } from "./blockers.ts";
import { conflictsFromTrace } from "./conflicts.ts";
import {
	buildQualityView,
	loopIterationQualityComplete,
	planningIterationClaimable,
	qualityBlockersFromTrace,
} from "./quality.ts";
import { buildTraceGoalView } from "./trace-goals.ts";
import type { StatusView, TraceViewInput, ViewHealth } from "./types.ts";
import { workPlanCardsFromTrace } from "./work-plan.ts";

export function buildStatusView(input: TraceViewInput): StatusView {
	const state = replayTrace(input.records);
	const cards = workPlanCardsFromTrace(input.records);
	const blockers = blockersFromTrace(input.records);
	const conflicts = conflictsFromTrace(input.records);
	const closed = state.closed;
	const currentLoop = closed
		? null
		: nextLoop(input.records, {
				allWorkDone:
					cards.length > 0 && cards.every((card) => card.status === "done"),
			});
	const quality = buildQualityView(input);
	const goal = buildTraceGoalView(input);
	const blockerMessages = closed
		? []
		: blockers.map((blocker) => blocker.message);
	const qualityBlockers = closed
		? []
		: qualityBlockersFromTrace(input.records).map((blocker) => blocker.message);
	const activeBlockerCount = closed ? 0 : blockers.length;
	const activeConflictCount = closed ? 0 : conflicts.length;
	return {
		generatedAt: input.generatedAt,
		traceId: state.head.traceId,
		title: state.head.title,
		...(state.head.origin ? { origin: state.head.origin } : {}),
		health:
			goal.status === "closed_incomplete"
				? "red"
				: statusHealth({
						blockers: activeBlockerCount,
						conflicts: activeConflictCount,
						currentLoop,
					}),
		currentLoop,
		readyForClosure:
			!closed &&
			goal.closable &&
			currentLoop === null &&
			activeBlockerCount === 0 &&
			activeConflictCount === 0,
		goalStatus: goal.status,
		...(closed
			? {
					closed: true,
					closedAt: state.close?.createdAt,
					closeReason: state.close?.reason,
				}
			: {}),
		lastEventId: state.lastRecordId,
		summary: {
			decisionEvents: decisionCount(input.records),
			workUnits: cards.length,
			implementationChanges: implementationChangeCount(input.records),
			blockers: activeBlockerCount,
			conflicts: activeConflictCount,
		},
		blockers: blockerMessages,
		qualityBlockers,
		quality,
		sourceRefs: traceRefs(input.records),
	};
}

function nextLoop(
	records: TraceRecord[],
	options: { allWorkDone: boolean },
): TraceLoop | null {
	const decisions = decisionRefs(records);
	if (decisions.length === 0) return "decision";
	const workUnits = planningWorkItems(records);
	const directRefs = new Set(
		directImplementationDecisionRefsForStatus(records),
	);
	const planningCoverage = new Set(
		workUnits.flatMap((item) => item.decisionRefs),
	);
	const resolvedDecisions = new Set(planningResolutions(records));
	if (
		decisions.some(
			(decision) =>
				!planningCoverage.has(decision) &&
				!directRefs.has(decision) &&
				!resolvedDecisions.has(decision),
		)
	) {
		return "planning";
	}
	if (workUnits.length === 0 && directRefs.size === 0) return null;
	if (!options.allWorkDone) return "implementation";
	return null;
}

function decisionCount(records: TraceRecord[]): number {
	return decisionRefs(records).length;
}

function implementationChangeCount(records: TraceRecord[]): number {
	return loopOutputEvents(records, "implementation").reduce(
		(count, event) =>
			count + objectList(objectRecord(event.data?.output).changes).length,
		0,
	);
}

function decisionRefs(records: TraceRecord[]): string[] {
	return loopOutputEvents(records, "decision")
		.filter(loopIterationQualityComplete)
		.flatMap((event) =>
			objectList(objectRecord(event.data?.output).approvedChanges).map((change) =>
				iterationSubref(event, "change", text(change.id)),
			),
		);
}

function directImplementationDecisionRefsForStatus(
	records: TraceRecord[],
): string[] {
	return directImplementationDecisionsFromRecords(records).map(
		(change) => change.ref,
	);
}

function planningWorkItems(
	records: TraceRecord[],
): Array<{ decisionRefs: string[] }> {
	return loopOutputEvents(records, "planning")
		.filter(planningIterationClaimable)
		.flatMap((event) =>
			objectList(objectRecord(event.data?.output).workItems).map((item) => ({
				decisionRefs: stringList(item.decisionRefs),
			})),
		);
}

function planningResolutions(records: TraceRecord[]): string[] {
	return loopOutputEvents(records, "planning")
		.filter(planningIterationClaimable)
		.flatMap((event) =>
			objectList(objectRecord(event.data?.output).resolutions).map(
				(resolution) => text(resolution.decisionRef),
			),
		);
}

function iterationSubref(
	event: { id: string },
	kind: string,
	id: string,
): string {
	return `trace:${event.id}#${kind}:${id || event.id}`;
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function statusHealth(input: {
	blockers: number;
	conflicts: number;
	currentLoop: TraceLoop | null;
}): ViewHealth {
	if (input.blockers > 0 || input.conflicts > 0) return "red";
	if (input.currentLoop !== null) return "yellow";
	return "green";
}
