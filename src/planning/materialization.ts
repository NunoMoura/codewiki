import type { TraceEvent } from "../traces/types.ts";
import type {
	AcceptanceCriterion,
	AcceptanceCriterionInput,
	PlanningTrigger,
	PlanningTriggerInput,
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
			technicalRequirements: unique([
				...stringList(item.technicalRequirements),
				...stringList(item.technical_requirements),
			]),
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
			planningDepth: normalizePlanningDepth(
				item.planningDepth ?? item.planning_depth,
			),
			verification: stringList(item.verification),
			workerProfile: text(item.workerProfile ?? item.worker_profile),
			planningAssessment: normalizePlanningAssessment(
				item.planningAssessment ?? item.planning_assessment,
			),
			dependsOn: unique([
				...stringList(item.dependsOn),
				...stringList(item.depends_on),
			]),
			...triggerProperty(item.trigger),
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
			if (event.loop !== "decision") {
				return [];
			}
			return objectList(objectRecord(event.data?.output).approvedChanges).map(
				(change) => iterationSubref(event, "change", text(change.id)),
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

export function normalizePlanningAssessment(
	value: PlanningWorkItemInput["planningAssessment"],
): PlanningWorkItem["planningAssessment"] {
	return {
		stance: text(value?.stance),
		workUnitSize: text(value?.workUnitSize ?? value?.work_unit_size),
		rightSizing: text(value?.rightSizing ?? value?.right_sizing),
		independence: text(value?.independence),
		implementationReadiness: text(
			value?.implementationReadiness ?? value?.implementation_readiness,
		),
		uncertainties: stringList(value?.uncertainties),
		uncertaintyOwner: text(value?.uncertaintyOwner ?? value?.uncertainty_owner),
		uncertaintyResolution: text(
			value?.uncertaintyResolution ?? value?.uncertainty_resolution,
		),
		rationale: text(value?.rationale),
		concerns: stringList(value?.concerns),
	};
}

function triggerProperty(value: PlanningTriggerInput | undefined): {
	trigger?: PlanningTrigger;
} {
	const trigger = normalizePlanningTrigger(value);
	return trigger ? { trigger } : {};
}

export function normalizePlanningTrigger(
	value: PlanningTriggerInput | undefined,
): PlanningTrigger | undefined {
	if (!value) return undefined;
	const id = text(value.id);
	const kind = normalizeTriggerKind(value.kind);
	const runMode = normalizeTriggerRunMode(value.runMode);
	const concurrency = normalizeTriggerConcurrency(value.concurrency);
	const runKeyTemplate = text(value.runKeyTemplate);
	const owner = text(value.owner);
	const trigger = text(value.trigger);
	const refs = unique(stringList(value.refs));
	if (
		![id, kind, runMode, concurrency, runKeyTemplate, owner, trigger].some(
			Boolean,
		) &&
		refs.length === 0
	) {
		return undefined;
	}
	return {
		id,
		kind,
		runMode,
		concurrency,
		runKeyTemplate,
		owner,
		trigger,
		refs,
	};
}

function normalizeTriggerKind(value: unknown): string {
	return text(value).toLowerCase().replace(/_/g, "-");
}

function normalizeTriggerRunMode(value: unknown): string {
	return text(value).toLowerCase();
}

function normalizeTriggerConcurrency(value: unknown): string {
	return text(value).toLowerCase();
}

function normalizeResolutionKind(
	value: unknown,
): PlanningResolutionKind | string {
	const raw = text(value);
	if (!raw) return "work-unit";
	const normalized = raw.toLowerCase().replace(/_/g, "-");
	return resolutionAliases.get(normalized) ?? normalized;
}

function normalizePlanningDepth(value: unknown): string {
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
