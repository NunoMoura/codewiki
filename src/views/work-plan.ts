import { planningConflicts } from "../planning/conflicts.ts";
import type { PlanningWorkItem } from "../planning/types.ts";
import { eventsByName } from "../traces/queries.ts";
import { replayTrace } from "../traces/replay.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import type { TraceViewInput, WorkPlanCard, WorkPlanView } from "./types.ts";

export function buildWorkPlanView(cards: WorkPlanCard[]): WorkPlanView;
export function buildWorkPlanView(input: TraceViewInput): WorkPlanView;
export function buildWorkPlanView(input: TraceViewInput | WorkPlanCard[]): WorkPlanView {
	if (Array.isArray(input)) return { cards: input.map(normalizeCard) };
	return {
		generatedAt: input.generatedAt,
		traceId: replayTrace(input.records).head.traceId,
		cards: workPlanCardsFromTrace(input.records),
	};
}

interface TracePlanningWorkItem extends PlanningWorkItem {
	traceEventId: string;
}

export function workPlanCardsFromTrace(records: TraceRecord[]): WorkPlanCard[] {
	const items = tracePlanningWorkItemsFromTrace(records);
	const conflicts = planningConflicts(items);
	const blockedIds = new Map<string, string[]>();
	for (const conflict of conflicts) {
		const messages = conflictMessages(conflict);
		blockedIds.set(conflict.leftId, [...(blockedIds.get(conflict.leftId) || []), ...messages]);
		blockedIds.set(conflict.rightId, [...(blockedIds.get(conflict.rightId) || []), ...messages]);
	}
	const implementationRefs = implementationRefsByPlanningRef(records);
	const runtimeRefs = activeRuntimeRefs(records);
	return items.map((item) => {
		const itemTraceRefs = traceRefsForWorkItem(item);
		const implementedBy = unique(
			itemTraceRefs.flatMap((ref) => implementationRefs.get(ref) || []),
		);
		const blockers = blockedIds.get(item.id) || [];
		return {
			id: item.id,
			title: item.title,
			status: workPlanStatus({ itemTraceRefs, implementedBy, blockers, runtimeRefs }),
			traceRefs: itemTraceRefs,
			decisionRefs: [...item.decisionRefs],
			pathScopes: [...item.pathScopes],
			verification: [...item.verification],
			dependsOn: [...item.dependsOn],
			implementationRefs: implementedBy,
			blockers,
		};
	});
}

export function planningWorkItemsFromTrace(records: TraceRecord[]): PlanningWorkItem[] {
	return tracePlanningWorkItemsFromTrace(records).map(({ traceEventId: _traceEventId, ...item }) => item);
}

function tracePlanningWorkItemsFromTrace(records: TraceRecord[]): TracePlanningWorkItem[] {
	return eventsByName(records, "planning.work-unit.materialized").map((event) => {
		const data = event.data || {};
		const id = text(data.workUnitId) || event.id.split(":planning:").at(-1) || event.id;
		const decisionRefs = event.refs.filter(isDecisionRef);
		return {
			id,
			traceEventId: event.id,
			title: text(data.title) || id,
			decisionRefs,
			outcome: text(data.outcome),
			acceptance: stringList(data.acceptance),
			pathScopes: event.refs.filter((ref) => !decisionRefs.includes(ref)),
			verification: stringList(data.verification),
			dependsOn: stringList(data.dependsOn),
		};
	});
}

function conflictMessages(conflict: { leftId: string; rightId: string; pathScopes: string[] }): string[] {
	return conflict.pathScopes.map((pathScope) =>
		`Path conflict on ${pathScope} with ${conflict.leftId}/${conflict.rightId}.`,
	);
}

function implementationRefsByPlanningRef(records: TraceRecord[]): Map<string, string[]> {
	const refs = new Map<string, string[]>();
	for (const event of eventsByName(records, "implementation.change.recorded")) {
		const planningRefs = implementationPlanningRefs(event);
		for (const planningRef of planningRefs) {
			refs.set(planningRef, unique([...(refs.get(planningRef) || []), event.id, ...event.refs]));
		}
	}
	return refs;
}

function implementationPlanningRefs(event: TraceEvent): string[] {
	const fromData = stringList(event.data?.planningRefs);
	if (fromData.length > 0) return fromData;
	return event.refs.filter(isPlanningRef);
}

function activeRuntimeRefs(records: TraceRecord[]): Set<string> {
	return new Set(
		records.flatMap((record) => {
			if (record.type !== "trace_event") return [];
			if (!record.event.startsWith("runtime.")) return [];
			return record.refs;
		}),
	);
}

function workPlanStatus(input: {
	itemTraceRefs: string[];
	implementedBy: string[];
	blockers: string[];
	runtimeRefs: Set<string>;
}): WorkPlanCard["status"] {
	if (input.implementedBy.length > 0) return "done";
	if (input.blockers.length > 0) return "blocked";
	if (input.itemTraceRefs.some((ref) => input.runtimeRefs.has(ref))) return "active";
	return "todo";
}

function traceRefsForWorkItem(item: TracePlanningWorkItem): string[] {
	return unique([item.traceEventId, item.id, ...item.decisionRefs, ...item.pathScopes]);
}

function normalizeCard(card: WorkPlanCard): WorkPlanCard {
	return {
		id: card.id,
		title: card.title,
		status: card.status,
		traceRefs: [...card.traceRefs],
		decisionRefs: [...(card.decisionRefs || [])],
		pathScopes: [...(card.pathScopes || [])],
		verification: [...(card.verification || [])],
		dependsOn: [...(card.dependsOn || [])],
		implementationRefs: [...(card.implementationRefs || [])],
		blockers: [...(card.blockers || [])],
	};
}

function isDecisionRef(ref: string): boolean {
	return ref.includes(":decision:") || ref.startsWith("decision:");
}

function isPlanningRef(ref: string): boolean {
	return ref.includes(":planning:") || ref.startsWith("planning:");
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
