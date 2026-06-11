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
		allWorkDone: cards.length > 0 && cards.every((card) => card.status === "done"),
	});
	const blockerMessages = blockers.map((blocker) => blocker.message);
	return {
		generatedAt: input.generatedAt,
		traceId: state.head.traceId,
		title: state.head.title,
		health: statusHealth({ blockers: blockers.length, conflicts: conflicts.length, currentLoop }),
		currentLoop,
		readyForClosure: currentLoop === null && blockers.length === 0 && conflicts.length === 0,
		lastEventId: state.lastRecordId,
		summary: {
			decisionEvents: eventsByName(input.records, "decision.row.approved").length,
			workUnits: cards.length,
			implementationChanges: eventsByName(input.records, "implementation.change.recorded").length,
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
	const decisions = eventsByName(records, "decision.row.approved");
	if (decisions.length === 0) return "decision";
	const workUnits = eventsByName(records, "planning.work-unit.materialized");
	const planningCoverage = new Set(
		workUnits.flatMap((event) => event.refs.filter((ref) => ref.includes(":decision:"))),
	);
	const resolvedDecisions = new Set(
		eventsByName(records, "planning.decision.resolved").flatMap((event) => event.refs.filter((ref) => ref.includes(":decision:"))),
	);
	if (decisions.some((decision) => !planningCoverage.has(decision.id) && !resolvedDecisions.has(decision.id))) {
		return "planning";
	}
	if (workUnits.length === 0) return null;
	if (!options.allWorkDone) return "implementation";
	return null;
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
