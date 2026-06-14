import { planningConflicts } from "../planning/conflicts.ts";
import type {
	AcceptanceCriterion,
	PlanningWorkItem,
} from "../planning/types.ts";
import { eventsByName } from "../traces/queries.ts";
import { replayTrace } from "../traces/replay.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import type { TraceViewInput, WorkPlanCard, WorkPlanView } from "./types.ts";

export function buildWorkPlanView(cards: WorkPlanCard[]): WorkPlanView;
export function buildWorkPlanView(input: TraceViewInput): WorkPlanView;
export function buildWorkPlanView(
	input: TraceViewInput | WorkPlanCard[],
): WorkPlanView {
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
	const items = acceptedPlanningWorkItemsFromTrace(records);
	const conflicts = planningConflicts(items);
	const blockedIds = new Map<string, string[]>();
	for (const conflict of conflicts) {
		const messages = conflictMessages(conflict);
		blockedIds.set(conflict.leftId, [
			...(blockedIds.get(conflict.leftId) || []),
			...messages,
		]);
		blockedIds.set(conflict.rightId, [
			...(blockedIds.get(conflict.rightId) || []),
			...messages,
		]);
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
			status: workPlanStatus({
				itemTraceRefs,
				implementedBy,
				blockers,
				runtimeRefs,
			}),
			traceRefs: itemTraceRefs,
			decisionRefs: [...item.decisionRefs],
			componentRefs: [...item.componentRefs],
			pathScopes: [...item.pathScopes],
			verification: [...item.verification],
			dependsOn: [...item.dependsOn],
			implementationRefs: implementedBy,
			blockers,
		};
	});
}

export function planningWorkItemsFromTrace(
	records: TraceRecord[],
): PlanningWorkItem[] {
	return acceptedPlanningWorkItemsFromTrace(records).map(
		({ traceEventId: _traceEventId, ...item }) => item,
	);
}

function acceptedPlanningWorkItemsFromTrace(
	records: TraceRecord[],
): TracePlanningWorkItem[] {
	return eventsByName(records, "planning.iteration").flatMap((event) =>
		objectList(objectRecord(event.data?.output).workItems).map((item) => {
			const id = text(item.id) || `${event.id}:work-item`;
			const acceptance = stringList(item.acceptance);
			return {
				id,
				traceEventId: iterationSubref(event, "work", id),
				title: text(item.title) || id,
				decisionRefs: stringList(item.decisionRefs),
				outcome: text(item.outcome),
				technicalRequirements: stringList(item.technicalRequirements),
				acceptance,
				acceptanceCriteria: acceptanceCriteriaList(
					item.acceptanceCriteria,
					acceptance,
				),
				componentRefs: stringList(item.componentRefs),
				pathScopes: stringList(item.pathScopes),
				verification: stringList(item.verification),
				workerProfile: text(item.workerProfile),
				planningAssessment: planningAssessment(item.planningAssessment),
				dependsOn: stringList(item.dependsOn),
			};
		}),
	);
}

function conflictMessages(conflict: {
	leftId: string;
	rightId: string;
	pathScopes: string[];
}): string[] {
	return conflict.pathScopes.map(
		(pathScope) =>
			`Path conflict on ${pathScope} with ${conflict.leftId}/${conflict.rightId}.`,
	);
}

function implementationRefsByPlanningRef(
	records: TraceRecord[],
): Map<string, string[]> {
	const refs = new Map<string, string[]>();
	for (const event of eventsByName(records, "implementation.iteration")) {
		for (const change of objectList(objectRecord(event.data?.output).changes)) {
			const changeRef = iterationSubref(event, "change", text(change.id));
			for (const planningRef of stringList(change.planningRefs)) {
				refs.set(
					planningRef,
					unique([...(refs.get(planningRef) || []), changeRef, ...event.refs]),
				);
			}
		}
	}
	return refs;
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
	if (input.itemTraceRefs.some((ref) => input.runtimeRefs.has(ref)))
		return "active";
	return "todo";
}

function traceRefsForWorkItem(item: TracePlanningWorkItem): string[] {
	return unique([
		item.traceEventId,
		item.id,
		...item.decisionRefs,
		...item.pathScopes,
	]);
}

function normalizeCard(card: WorkPlanCard): WorkPlanCard {
	return {
		id: card.id,
		title: card.title,
		status: card.status,
		traceRefs: [...card.traceRefs],
		decisionRefs: [...(card.decisionRefs || [])],
		componentRefs: [...(card.componentRefs || [])],
		pathScopes: [...(card.pathScopes || [])],
		verification: [...(card.verification || [])],
		dependsOn: [...(card.dependsOn || [])],
		implementationRefs: [...(card.implementationRefs || [])],
		blockers: [...(card.blockers || [])],
	};
}

function iterationSubref(event: TraceEvent, kind: string, id: string): string {
	return `trace:${event.id}#${kind}:${id || event.id}`;
}

function planningAssessment(
	value: unknown,
): TracePlanningWorkItem["planningAssessment"] {
	const record = objectRecord(value);
	return {
		stance: text(record.stance),
		workUnitSize: text(record.workUnitSize),
		rightSizing: text(record.rightSizing),
		independence: text(record.independence),
		implementationReadiness: text(record.implementationReadiness),
		rationale: text(record.rationale),
		concerns: stringList(record.concerns),
	};
}

function acceptanceCriteriaList(
	value: unknown,
	acceptance: string[],
): AcceptanceCriterion[] {
	const explicit = objectList(value).map((item, index) => ({
		id: text(item.id) || `AC-${String(index + 1).padStart(3, "0")}`,
		text: text(item.text),
	}));
	if (explicit.length > 0) return explicit;
	return acceptance.map((criterion, index) => ({
		id: `AC-${String(index + 1).padStart(3, "0")}`,
		text: criterion,
	}));
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

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
