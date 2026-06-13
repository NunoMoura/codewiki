import { eventsByName, traceRefs } from "../traces/queries.ts";
import { replayTrace } from "../traces/replay.ts";
import type { TraceLoop, TraceRecord } from "../traces/types.ts";
import { blockersFromTrace } from "./blockers.ts";
import { conflictsFromTrace } from "./conflicts.ts";
import type { StatusView, TraceViewInput, ViewHealth } from "./types.ts";
import { workPlanCardsFromTrace } from "./work-plan.ts";

export function buildStatusView(input: TraceViewInput): StatusView {
	const state = replayTrace(input.records);
	const cards = workPlanCardsFromTrace(input.records);
	const blockers = blockersFromTrace(input.records);
	const conflicts = conflictsFromTrace(input.records);
	const currentLoop = nextLoop(input.records, {
		allWorkDone:
			cards.length > 0 && cards.every((card) => card.status === "done"),
	});
	const blockerMessages = blockers.map((blocker) => blocker.message);
	return {
		generatedAt: input.generatedAt,
		traceId: state.head.traceId,
		title: state.head.title,
		health: statusHealth({
			blockers: blockers.length,
			conflicts: conflicts.length,
			currentLoop,
		}),
		currentLoop,
		readyForClosure:
			currentLoop === null && blockers.length === 0 && conflicts.length === 0,
		lastEventId: state.lastRecordId,
		summary: {
			decisionEvents: decisionCount(input.records),
			workUnits: cards.length,
			implementationChanges: implementationChangeCount(input.records),
			blockers: blockers.length,
			conflicts: conflicts.length,
		},
		blockers: blockerMessages,
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
	const planningCoverage = new Set(
		workUnits.flatMap((item) => item.decisionRefs),
	);
	const resolvedDecisions = new Set(planningResolutions(records));
	if (
		decisions.some(
			(decision) =>
				!planningCoverage.has(decision) && !resolvedDecisions.has(decision),
		)
	) {
		return "planning";
	}
	if (workUnits.length === 0) return null;
	if (!options.allWorkDone) return "implementation";
	return null;
}

function decisionCount(records: TraceRecord[]): number {
	return decisionRefs(records).length;
}

function implementationChangeCount(records: TraceRecord[]): number {
	return eventsByName(records, "implementation.iteration").reduce(
		(count, event) =>
			count + objectList(objectRecord(event.data?.output).changes).length,
		0,
	);
}

function decisionRefs(records: TraceRecord[]): string[] {
	return eventsByName(records, "decision.iteration").flatMap((event) =>
		objectList(objectRecord(event.data?.output).approvedRows).map((row) =>
			iterationSubref(event, "row", text(row.id)),
		),
	);
}

function planningWorkItems(
	records: TraceRecord[],
): Array<{ decisionRefs: string[] }> {
	return eventsByName(records, "planning.iteration").flatMap((event) =>
		objectList(objectRecord(event.data?.output).workItems).map((item) => ({
			decisionRefs: stringList(item.decisionRefs),
		})),
	);
}

function planningResolutions(records: TraceRecord[]): string[] {
	return eventsByName(records, "planning.iteration").flatMap((event) =>
		objectList(objectRecord(event.data?.output).resolutions).map((resolution) =>
			text(resolution.decisionRef),
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
