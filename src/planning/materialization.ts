import type { TraceEvent } from "../traces/types.ts";
import type {
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

export function normalizePlanningWorkItems(items: PlanningWorkItemInput[]): PlanningWorkItem[] {
	return items.map((item) => ({
		id: text(item.id),
		title: text(item.title) || text(item.id),
		decisionRefs: unique([...stringList(item.decisionRefs), ...stringList(item.decision_refs)]),
		outcome: text(item.outcome),
		acceptance: stringList(item.acceptance),
		pathScopes: unique([...stringList(item.pathScopes), ...stringList(item.path_scopes)]),
		verification: stringList(item.verification),
		dependsOn: unique([...stringList(item.dependsOn), ...stringList(item.depends_on)]),
	}));
}

export function normalizePlanningDecisionResolutions(
	resolutions: PlanningDecisionResolutionInput[],
): PlanningDecisionResolution[] {
	return resolutions
		.map((resolution) => ({
			decisionRef: text(resolution.decisionRef ?? resolution.decision_ref),
			kind: normalizeResolutionKind(resolution.kind ?? resolution.resolution),
			workUnitIds: unique([...stringList(resolution.workUnitIds), ...stringList(resolution.work_unit_ids)]),
			evidenceRefs: unique([...stringList(resolution.evidenceRefs), ...stringList(resolution.evidence_refs)]),
			owner: text(resolution.owner) || undefined,
			trigger: text(resolution.trigger) || undefined,
			rationale: text(resolution.rationale) || undefined,
		}))
		.filter((resolution) => resolution.decisionRef);
}

export function decisionRefsFromEvents(events: TraceEvent[]): string[] {
	return unique(
		events
			.filter((event) => event.loop === "decision" && event.event === "decision.row.approved")
			.map((event) => event.id),
	);
}

export function materializesDecisionRef(item: PlanningWorkItem, decisionRef: string): boolean {
	return item.decisionRefs.includes(decisionRef);
}

export function workItemsForDecisionRef(
	items: PlanningWorkItem[],
	decisionRef: string,
): PlanningWorkItem[] {
	return items.filter((item) => materializesDecisionRef(item, decisionRef));
}

export function normalizeResolutionKind(value: unknown): PlanningResolutionKind {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	return resolutionAliases.get(normalized) ?? "work-unit";
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}
