import { planningConflicts } from "../planning/conflicts.ts";
import type { PlanningWorkItem } from "../planning/types.ts";
import { loopOutputEvents } from "../traces/queries.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import type { ConflictsView, ConflictView, TraceViewInput } from "./types.ts";

export function buildConflictsView(conflicts: ConflictView[]): ConflictsView;
export function buildConflictsView(input: TraceViewInput): ConflictsView;
export function buildConflictsView(
	input: TraceViewInput | ConflictView[],
): ConflictsView {
	if (Array.isArray(input)) return { conflicts: input.map(normalizeConflict) };
	return {
		generatedAt: input.generatedAt,
		traceId: input.records[0]?.traceId,
		conflicts: conflictsFromTrace(input.records),
	};
}

export function conflictsFromTrace(records: TraceRecord[]): ConflictView[] {
	const implementedIds = implementedWorkUnitIds(records);
	const items = planningWorkItemsForConflicts(records).filter(
		(item) => !implementedIds.has(item.id),
	);
	return planningConflicts(items).flatMap((conflict) =>
		conflict.pathScopes.map((pathScope) => ({
			leftRef: conflict.leftId,
			rightRef: conflict.rightId,
			pathScope,
			traceRefs: [conflict.leftId, conflict.rightId, pathScope],
		})),
	);
}

function planningWorkItemsForConflicts(
	records: TraceRecord[],
): PlanningWorkItem[] {
	return loopOutputEvents(records, "planning")
		.filter((event) => !supersededByLaterPlanningIteration(event, records))
		.filter((event) => activePlanningConflictSource(event))
		.flatMap((event) =>
			objectList(objectRecord(event.data?.output).workItems).map(
				(item) =>
					({
						id: text(item.id) || event.id,
						title: text(item.title) || text(item.id) || event.id,
						decisionRefs: stringList(item.decisionRefs),
						outcome: text(item.outcome),
						technicalRequirements: stringList(item.technicalRequirements),
						acceptance: stringList(item.acceptance),
						acceptanceCriteria: [],
						componentRefs: stringList(item.componentRefs),
						pathScopes: stringList(item.pathScopes),
						planningDepth: text(item.planningDepth) || "standard",
						verification: stringList(item.verification),
						workerProfile: text(item.workerProfile),
						planningAssessment: item.planningAssessment,
						dependsOn: stringList(item.dependsOn),
					}) as PlanningWorkItem,
			),
		);
}

function activePlanningConflictSource(event: TraceEvent): boolean {
	return event.loop === "planning";
}

function supersededByLaterPlanningIteration(
	event: TraceEvent,
	records: TraceRecord[],
): boolean {
	return records.some(
		(record) =>
			record.type === "trace_event" &&
			record.traceId === event.traceId &&
			record.loop === "planning" &&
			record.sequence > event.sequence,
	);
}

function implementedWorkUnitIds(records: TraceRecord[]): Set<string> {
	return new Set(
		loopOutputEvents(records, "implementation")
			.flatMap((event) => objectList(objectRecord(event.data?.output).changes))
			.map((change) => text(change.workUnitId))
			.filter(Boolean),
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
