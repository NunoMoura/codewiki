import { planningConflicts } from "../planning/conflicts.ts";
import type { TraceRecord } from "../traces/types.ts";
import type { ConflictsView, ConflictView, TraceViewInput } from "./types.ts";
import { planningWorkItemsFromTrace } from "./work-plan.ts";

export function buildConflictsView(conflicts: ConflictView[]): ConflictsView;
export function buildConflictsView(input: TraceViewInput): ConflictsView;
export function buildConflictsView(input: TraceViewInput | ConflictView[]): ConflictsView {
	if (Array.isArray(input)) return { conflicts: input.map(normalizeConflict) };
	return {
		generatedAt: input.generatedAt,
		traceId: input.records[0]?.traceId,
		conflicts: conflictsFromTrace(input.records),
	};
}

export function conflictsFromTrace(records: TraceRecord[]): ConflictView[] {
	const items = planningWorkItemsFromTrace(records);
	return planningConflicts(items).flatMap((conflict) =>
		conflict.pathScopes.map((pathScope) => ({
			leftRef: conflict.leftId,
			rightRef: conflict.rightId,
			pathScope,
			traceRefs: [conflict.leftId, conflict.rightId, pathScope],
		})),
	);
}

function normalizeConflict(conflict: ConflictView): ConflictView {
	return {
		leftRef: conflict.leftRef,
		rightRef: conflict.rightRef,
		pathScope: conflict.pathScope,
		traceRefs: [...(conflict.traceRefs || [])],
	};
}
