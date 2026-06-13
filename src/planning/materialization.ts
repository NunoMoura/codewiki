import type { TraceEvent } from "../traces/types.ts";
import type {
	AcceptanceCriterion,
	AcceptanceCriterionInput,
	PlanningDecisionResolution,
	PlanningDecisionResolutionInput,
	PlanningResolutionKind,
	PlanningWorkItem,
	PlanningWorkItemInput,
} from "./types.ts";

const resolutionAliases = new Map<string, PlanningResolutionKind>([
	["task", "work-unit"],
	["work", "work-unit"],
	["work_unit", "work-unit"],
	["work-unit", "work-unit"],
	["roadmap-task", "work-unit"],
	["defer", "deferred"],
	["deferred", "deferred"],
	["implemented", "already-implemented"],
	["already-implemented", "already-implemented"],
	["route-back", "route-back"],
	["knowledge", "knowledge-only"],
	["knowledge-only", "knowledge-only"],
	["non-executable", "non-executable"],
	["no-work", "non-executable"],
]);

export function normalizePlanningWorkItems(
	items: PlanningWorkItemInput[],
): PlanningWorkItem[] {
	return items.map((item) => {
		const acceptance = stringList(item.acceptance);
		return {
			id: text(item.id),
			title: text(item.title) || text(item.id),
			decisionRefs: unique([
				...stringList(item.decisionRefs),
				...stringList(item.decision_refs),
			]),
			outcome: text(item.outcome),
			acceptance,
			acceptanceCriteria: normalizeAcceptanceCriteria({
				itemId: text(item.id),
				acceptance,
				explicitCriteria: [
					...criterionList(item.acceptanceCriteria),
					...criterionList(item.acceptance_criteria),
				],
			}),
			componentRefs: unique([
				...stringList(item.componentRefs),
				...stringList(item.component_refs),
			]),
			pathScopes: unique([
				...stringList(item.pathScopes),
				...stringList(item.path_scopes),
			]),
			verification: stringList(item.verification),
			dependsOn: unique([
				...stringList(item.dependsOn),
				...stringList(item.depends_on),
			]),
		};
	});
}

export function normalizePlanningDecisionResolutions(
	resolutions: PlanningDecisionResolutionInput[],
): PlanningDecisionResolution[] {
	return resolutions
		.map((resolution) => ({
			decisionRef: text(resolution.decisionRef ?? resolution.decision_ref),
			kind: normalizeResolutionKind(resolution.kind ?? resolution.resolution),
			workUnitIds: unique([
				...stringList(resolution.workUnitIds),
				...stringList(resolution.work_unit_ids),
			]),
			evidenceRefs: unique([
				...stringList(resolution.evidenceRefs),
				...stringList(resolution.evidence_refs),
			]),
			owner: text(resolution.owner) || undefined,
			trigger: text(resolution.trigger) || undefined,
			rationale: text(resolution.rationale) || undefined,
		}))
		.filter((resolution) => resolution.decisionRef);
}

export function decisionRefsFromEvents(events: TraceEvent[]): string[] {
	return unique(
		events.flatMap((event) => {
			if (event.loop !== "decision" || event.event !== "decision.iteration") {
				return [];
			}
			return objectList(objectRecord(event.data?.output).approvedRows).map(
				(row) => iterationSubref(event, "row", text(row.id)),
			);
		}),
	);
}

export function materializesDecisionRef(
	item: PlanningWorkItem,
	decisionRef: string,
): boolean {
	return item.decisionRefs.includes(decisionRef);
}

export function workItemsForDecisionRef(
	items: PlanningWorkItem[],
	decisionRef: string,
): PlanningWorkItem[] {
	return items.filter((item) => materializesDecisionRef(item, decisionRef));
}

export function normalizeResolutionKind(
	value: unknown,
): PlanningResolutionKind {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	return resolutionAliases.get(normalized) ?? "work-unit";
}

function normalizeAcceptanceCriteria(input: {
	itemId: string;
	acceptance: string[];
	explicitCriteria: AcceptanceCriterionInput[];
}): AcceptanceCriterion[] {
	const explicit = input.explicitCriteria.map((criterion, index) => ({
		id: text(criterion.id) || acceptanceCriterionId(index),
		text: text(criterion.text),
	}));
	if (explicit.length > 0) return explicit;
	return input.acceptance.map((criterionText, index) => ({
		id: acceptanceCriterionId(index),
		text: criterionText,
	}));
}

function acceptanceCriterionId(index: number): string {
	return `AC-${String(index + 1).padStart(3, "0")}`;
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
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

function iterationSubref(event: TraceEvent, kind: string, id: string): string {
	return `trace:${event.id}#${kind}:${id || event.id}`;
}

function criterionList(value: unknown): AcceptanceCriterionInput[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is AcceptanceCriterionInput =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}
