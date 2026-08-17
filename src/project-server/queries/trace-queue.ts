import type {
	TraceGoalView,
	TraceViewInput,
	WorkQueueItem,
} from "../../work-state/projection-types.ts";
import type {
	TraceQueueCard,
	TraceQueueItem,
	TraceQueueView,
} from "./projection-types.ts";
import { buildTraceBoardView } from "../../work-state/trace-goals.ts";
import { buildWorkQueueView } from "../../work-state/work-queue.ts";

export function buildTraceQueueView(input: TraceViewInput): TraceQueueView {
	const traceBoard = buildTraceBoardView(input);
	const workQueue = buildWorkQueueView(input);
	const itemsByTrace = new Map<string, WorkQueueItem[]>();
	for (const item of workQueue.items) {
		itemsByTrace.set(item.traceId, [
			...(itemsByTrace.get(item.traceId) || []),
			item,
		]);
	}
	const cards = traceBoard.traces.map((trace) =>
		traceQueueCard(trace, itemsByTrace.get(trace.traceId) || []),
	);
	return {
		generatedAt: input.generatedAt,
		traceIds: traceBoard.traceIds,
		summary: { ...traceBoard.summary },
		cards,
	};
}

function traceQueueCard(
	trace: TraceGoalView,
	items: WorkQueueItem[],
): TraceQueueCard {
	const queueItems = items.map(traceQueueItem);
	return {
		traceId: trace.traceId,
		title: trace.title || trace.traceId,
		status: trace.status,
		closed: trace.closed,
		changeRefs: [...trace.changeRefs],
		rowCount: trace.changeRefs.length,
		plannedChangeRefs: [...trace.plannedChangeRefs],
		unresolvedChangeRefs: [...trace.unresolvedChangeRefs],
		workUnitRefs: [...trace.workUnitRefs],
		pathScopes: [...trace.pathScopes],
		blockers: [...trace.blockers],
		nextLoop: nextLoopForTrace(trace),
		items: queueItems,
	};
}

function traceQueueItem(item: WorkQueueItem): TraceQueueItem {
	return {
		id: item.id,
		kind: item.kind,
		status: item.status,
		title: item.title,
		changeRefs: [...item.changeRefs],
		planningRefs: [...item.planningRefs],
		pathScopes: [...item.pathScopes],
		blockers: [...item.blockers],
	};
}

function nextLoopForTrace(trace: TraceGoalView): TraceQueueCard["nextLoop"] {
	if (trace.closed) return "archive";
	if (trace.status === "needs_decision") return "decision";
	if (trace.status === "needs_planning") return "planning";
	if (trace.status === "needs_implementation") return "implementation";
	if (trace.status === "finished") return "archive";
	return undefined;
}
