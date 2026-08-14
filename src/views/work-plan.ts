import { planningConflicts } from "../planning/conflicts.ts";
import type {
	AcceptanceCriterion,
	PlanningTrigger,
	PlanningWorkItem,
} from "../planning/types.ts";
import { loopOutputEvents } from "../changes/trace/queries.ts";
import { replayTrace } from "../changes/trace/replay.ts";
import type { TraceEvent, TraceRecord } from "../changes/trace/types.ts";
import { blockersFromTrace } from "./blockers.ts";
import { loopQualityReadiness } from "./quality.ts";
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
	qualityStandards: WorkPlanCard["qualityStandards"];
	qualityBlockers: string[];
}

export function workPlanCardsFromTrace(records: TraceRecord[]): WorkPlanCard[] {
	const items = acceptedPlanningWorkItemsFromTrace(records);
	const implementationRefs = implementationRefsByPlanningRef(records);
	const activeItems = items.filter((item) =>
		traceRefsForWorkItem(item).every((ref) => !implementationRefs.has(ref)),
	);
	const conflicts = planningConflicts(activeItems);
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
	const traceBlockers = blockersFromTrace(records).filter(
		(blocker) => blocker.kind !== "conflict",
	);
	const runtimeRefs = activeRuntimeRefs(records);
	return items.map((item) => {
		const itemTraceRefs = traceRefsForWorkItem(item);
		const implementedBy = unique(
			itemTraceRefs.flatMap((ref) => implementationRefs.get(ref) || []),
		);
		const blockers = unique([
			...(blockedIds.get(item.id) || []),
			...blockersForRefs(traceBlockers, itemTraceRefs),
			...item.qualityBlockers,
		]);
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
			changeRefs: [...item.changeRefs],
			componentRefs: [...item.componentRefs],
			pathScopes: [...item.pathScopes],
			planningDepth: item.planningDepth,
			verification: [...item.verification],
			dependsOn: [...item.dependsOn],
			...(item.trigger ? { trigger: item.trigger } : {}),
			implementationRefs: implementedBy,
			blockers,
			qualityStandards: item.qualityStandards,
			qualityBlockers: item.qualityBlockers,
		};
	});
}

export function planningWorkItemsFromTrace(
	records: TraceRecord[],
): PlanningWorkItem[] {
	return acceptedPlanningWorkItemsFromTrace(records).map(
		({
			traceEventId: _traceEventId,
			qualityStandards: _qualityStandards,
			qualityBlockers: _qualityBlockers,
			...item
		}) => item,
	);
}

function acceptedPlanningWorkItemsFromTrace(
	records: TraceRecord[],
): TracePlanningWorkItem[] {
	const plannedItems = activePlanningEvents(records).flatMap((event) => {
		const quality = loopQualityReadiness(event);
		return objectList(objectRecord(event.data?.output).workItems).map(
			(item) => {
				const id = text(item.id) || `${event.id}:work-item`;
				const acceptanceCriteria = acceptanceCriteriaList(
					item.acceptanceCriteria,
					[],
				);
				const acceptance = acceptanceCriteria.map(
					(criterion) => criterion.text,
				);
				const owningChangeRef = text(item.owningChangeId)
					? `change:${text(item.owningChangeId)}`
					: "";
				const changeRefs = unique([
					...(owningChangeRef ? [owningChangeRef] : []),
					...stringList(item.contributingChangeIds).map(
						(changeId) => `change:${changeId}`,
					),
				]);
				return {
					id,
					traceEventId: iterationSubref(event, "work", id),
					title: text(item.title) || id,
					changeRefs,
					outcome: text(item.outcome),
					technicalRequirements: stringList(item.technicalRequirements),
					acceptance,
					acceptanceCriteria,
					componentRefs: stringList(item.componentRefs),
					pathScopes: stringList(item.pathScopes),
					planningDepth: planningDepth(item.planningDepth),
					verification: stringList(item.verification),
					workerProfile: text(item.workerProfile),
					planningAssessment: planningAssessment(item.planningAssessment),
					dependsOn: stringList(item.dependsOn),
					...triggerProperty(item.trigger),
					qualityStandards: quality.standards,
					qualityBlockers: quality.blockers,
				};
			},
		);
	});
	return plannedItems;
}

function activePlanningEvents(records: TraceRecord[]): TraceEvent[] {
	const events = loopOutputEvents(records, "planning").filter(
		planningIterationExited,
	);
	const latestByChangeRef = new Map<string, TraceEvent>();
	for (const event of events) {
		for (const changeRef of planningChangeRefs(event)) {
			latestByChangeRef.set(changeRef, event);
		}
	}
	const activeEventIds = new Set(
		[...latestByChangeRef.values()].map((event) => event.id),
	);
	return events.filter((event) => activeEventIds.has(event.id));
}

function planningChangeRefs(event: TraceEvent): string[] {
	return unique(
		objectList(objectRecord(event.data?.output).workItems).flatMap((item) => [
			...(text(item.owningChangeId)
				? [`change:${text(item.owningChangeId)}`]
				: []),
			...stringList(item.contributingChangeIds).map(
				(changeId) => `change:${changeId}`,
			),
		]),
	).filter(Boolean);
}

function planningIterationExited(event: TraceEvent): boolean {
	return text(objectRecord(event.data?.exit).status) === "exit";
}

function blockersForRefs(
	blockers: { message: string; traceRefs: string[] }[],
	refs: string[],
): string[] {
	const refSet = new Set(refs);
	return blockers
		.filter((blocker) => blocker.traceRefs.some((ref) => refSet.has(ref)))
		.map((blocker) => blocker.message);
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
	for (const event of loopOutputEvents(records, "implementation")) {
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
		...item.changeRefs,
		...item.pathScopes,
	]);
}

function normalizeCard(card: WorkPlanCard): WorkPlanCard {
	return {
		id: card.id,
		title: card.title,
		status: card.status,
		traceRefs: [...card.traceRefs],
		changeRefs: [...(card.changeRefs || [])],
		componentRefs: [...(card.componentRefs || [])],
		pathScopes: [...(card.pathScopes || [])],
		planningDepth: planningDepth(card.planningDepth),
		verification: [...(card.verification || [])],
		dependsOn: [...(card.dependsOn || [])],
		...(card.trigger ? { trigger: card.trigger } : {}),
		implementationRefs: [...(card.implementationRefs || [])],
		blockers: [...(card.blockers || [])],
		qualityStandards: [...(card.qualityStandards || [])],
		qualityBlockers: [...(card.qualityBlockers || [])],
	};
}

function triggerProperty(value: unknown): {
	trigger?: PlanningTrigger;
} {
	const record = objectRecord(value);
	const id = text(record.id);
	const kind = text(record.kind);
	const runMode = text(record.runMode);
	const concurrency = text(record.concurrency);
	const runKeyTemplate = text(record.runKeyTemplate);
	const owner = text(record.owner);
	const trigger = text(record.trigger);
	const refs = stringList(record.refs);
	if (
		![id, kind, runMode, concurrency, runKeyTemplate, owner, trigger].some(
			Boolean,
		) &&
		refs.length === 0
	) {
		return {};
	}
	return {
		trigger: {
			id,
			kind,
			runMode,
			concurrency,
			runKeyTemplate,
			owner,
			trigger,
			refs,
		},
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
		uncertainties: stringList(record.uncertainties),
		uncertaintyOwner: text(record.uncertaintyOwner),
		uncertaintyResolution: text(record.uncertaintyResolution),
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

function planningDepth(value: unknown): PlanningWorkItem["planningDepth"] {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	if (!normalized) return "standard";
	if (
		["micro-plan", "microplan", "fast-track", "fasttrack"].includes(normalized)
	) {
		return "micro";
	}
	if (["full", "full-plan", "standard-plan", "normal"].includes(normalized)) {
		return "standard";
	}
	return normalized;
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
