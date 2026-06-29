import {
	normalizeChangeType,
	normalizeDecisionApprovalStatus,
	normalizeTraceabilityExemption,
} from "./approval.ts";
import { normalizeDecisionTypeId } from "./type-definitions.ts";
import type {
	DecisionRow,
	DecisionRowActionFailure,
	DecisionRowActionInput,
	DecisionRowInput,
	DecisionTable,
	DecisionTableInput,
} from "./types.ts";

export interface DecisionRowActionResult {
	changed: boolean;
	table: DecisionTable;
	changedRowIds: string[];
	failures: DecisionRowActionFailure[];
}

export function createDecisionTable(input: DecisionTableInput): DecisionTable {
	const createdAt = input.createdAt || new Date().toISOString();
	const rows = normalizeDecisionRows(input.rows || []);
	return {
		id: text(input.id) || `DT-${createdAt.slice(0, 10)}`,
		summary: text(input.summary) || "Decision table",
		sourceRefs: stringList(input.sourceRefs),
		rows,
		createdAt,
		updatedAt: input.updatedAt || createdAt,
	};
}

export function normalizeDecisionRows(
	rows: DecisionRowInput[] = [],
): DecisionRow[] {
	return rows
		.map((row, index) => normalizeDecisionRow(row, index))
		.filter(
			(row) =>
				row.question || row.currentState || row.desiredState || row.rationale,
		);
}

export function applyDecisionRowActions(
	table: DecisionTable,
	actions: DecisionRowActionInput[],
	updatedAt = new Date().toISOString(),
): DecisionRowActionResult {
	const failures = actions
		.map((action) => validateRowAction(table, action))
		.filter((failure): failure is DecisionRowActionFailure => Boolean(failure));
	if (failures.length) {
		return { changed: false, table, changedRowIds: [], failures };
	}
	const next: DecisionTable = {
		...table,
		sourceRefs: [...table.sourceRefs],
		rows: table.rows.map((row) => cloneDecisionRow(row)),
		updatedAt,
	};
	for (const action of actions) applyRowAction(next, action);
	return {
		changed: actions.length > 0,
		table: next,
		changedRowIds: unique(actions.map((action) => action.rowId)),
		failures: [],
	};
}

export function approvedDecisionRows(table: DecisionTable): DecisionRow[] {
	return table.rows.filter((row) => row.approval === "approved");
}

function normalizeDecisionRow(
	row: DecisionRowInput,
	index: number,
): DecisionRow {
	const id = text(row.id) || generatedRowId(index);
	return {
		id,
		question: firstText(row.question, row.id, id),
		decisionKind: normalizeDecisionKind(row.decisionKind),
		decisionType: normalizeDecisionTypeId(
			row.decisionType ??
				row.decision_type ??
				normalizeDecisionKind(row.decisionKind),
		),
		currentState: text(row.currentState),
		desiredState: text(row.desiredState),
		rationale: text(row.rationale),
		userImpact: text(row.userImpact),
		maintainerImpact: text(row.maintainerImpact),
		effort: text(row.effort),
		workScale: normalizeWorkScale(row.workScale ?? row.work_scale),
		planningDepth: normalizePlanningDepth(
			row.planningDepth ?? row.planning_depth,
		),
		...normalizeRouteFields(row),
		affectedLayers: unique(stringList(row.affectedLayers)),
		risk: text(row.risk),
		approval: normalizeDecisionApprovalStatus(row.approval),
		approvalAuthority: text(row.approvalAuthority),
		approvalRef: text(row.approvalRef) || undefined,
		recommendation: text(row.recommendation),
		recommendationRationale: text(row.recommendationRationale),
		agentAssessment: normalizeAgentAssessment(row.agentAssessment),
		alternatives: stringList(row.alternatives),
		sourceRefs: unique(stringList(row.sourceRefs)),
		proofRefs: unique(stringList(row.proofRefs)),
		changeType: normalizeChangeType(row.changeType),
		traceabilityExemption: normalizeTraceabilityExemption(
			row.traceabilityExemption,
		),
		noKbImpactReason: text(row.noKbImpactReason) || undefined,
		targetRefs: unique(stringList(row.targetRefs)),
		hypothesis: text(row.hypothesis) || undefined,
		invariant: text(row.invariant) || undefined,
		probe: text(row.probe) || undefined,
		expectedSafeBehavior: text(row.expectedSafeBehavior) || undefined,
		stopCondition: text(row.stopCondition) || undefined,
		reproduction: text(row.reproduction) || undefined,
		expectedBehavior: text(row.expectedBehavior) || undefined,
		regressionPlan: text(row.regressionPlan) || undefined,
		safetyBoundary: text(row.safetyBoundary) || undefined,
		failureModes: unique(stringList(row.failureModes)),
		negativeTestPlan: text(row.negativeTestPlan) || undefined,
		compatibilityImpact: text(row.compatibilityImpact) || undefined,
		currentPain: text(row.currentPain) || undefined,
		desiredOutcome: text(row.desiredOutcome) || undefined,
		successSignal: text(row.successSignal) || undefined,
		nonGoals: unique(stringList(row.nonGoals)),
		sourceBehavior: text(row.sourceBehavior) || undefined,
		targetBehavior: text(row.targetBehavior) || undefined,
		preservedInvariants: unique(stringList(row.preservedInvariants)),
		equivalenceProof: text(row.equivalenceProof) || undefined,
		rollbackPlan: text(row.rollbackPlan) || undefined,
	};
}

function validateRowAction(
	table: DecisionTable,
	action: DecisionRowActionInput,
): DecisionRowActionFailure | null {
	const rowId = text(action.rowId);
	if (!rowId)
		return { rowId: "", action: action.action, error: "rowId is required." };
	const row = table.rows.find((item) => item.id === rowId);
	if (!row)
		return {
			rowId,
			action: action.action,
			error: `Decision row not found: ${rowId}`,
		};
	if (action.action === "alternative" && !text(action.alternative)) {
		return {
			rowId,
			action: action.action,
			error: "Alternative text is required.",
		};
	}
	if (action.action === "edit") {
		const [edited] = normalizeDecisionRows([
			{ ...row, ...(action.row || {}), id: row.id },
		]);
		if (!edited)
			return {
				rowId,
				action: action.action,
				error: "Edit produced an invalid row.",
			};
	}
	return null;
}

function applyRowAction(
	table: DecisionTable,
	action: DecisionRowActionInput,
): void {
	const row = table.rows.find((item) => item.id === action.rowId);
	if (!row) return;
	if (action.action === "accept") row.approval = "approved";
	if (action.action === "reject") row.approval = "rejected";
	if (action.action === "defer") row.approval = "deferred";
	if (action.action === "alternative") {
		row.alternatives = unique([...row.alternatives, text(action.alternative)]);
		row.approval = "edited";
	}
	if (action.action === "edit") {
		const [edited] = normalizeDecisionRows([
			{ ...row, ...(action.row || {}), id: row.id },
		]);
		if (edited) Object.assign(row, edited);
	}
}

function cloneDecisionRow(row: DecisionRow): DecisionRow {
	return {
		...row,
		affectedLayers: [...row.affectedLayers],
		agentAssessment: {
			...row.agentAssessment,
			concerns: [...row.agentAssessment.concerns],
		},
		alternatives: [...row.alternatives],
		sourceRefs: [...row.sourceRefs],
		proofRefs: [...row.proofRefs],
		directImplementationScope: cloneDirectImplementationScope(
			row.directImplementationScope,
		),
		targetRefs: [...row.targetRefs],
		failureModes: [...row.failureModes],
		nonGoals: [...row.nonGoals],
		preservedInvariants: [...row.preservedInvariants],
	};
}

function normalizeAgentAssessment(
	value: DecisionRowInput["agentAssessment"],
): DecisionRow["agentAssessment"] {
	return {
		stance: text(value?.stance),
		userAlignment: text(value?.userAlignment),
		projectBenefit: text(value?.projectBenefit),
		rationale: text(value?.rationale),
		concerns: stringList(value?.concerns),
	};
}

function generatedRowId(index: number): string {
	return `DTR-${String(index + 1).padStart(3, "0")}`;
}

function normalizeDecisionKind(value: unknown): string {
	const normalized = text(value).toLowerCase();
	if (normalized === "debugging") return "debug";
	if (["bug", "bugfix", "defect"].includes(normalized)) return "fix";
	if (["security", "safety"].includes(normalized)) return "harden";
	if (["enhance", "enhancement"].includes(normalized)) return "improve";
	if (["migration", "refactor", "refactoring"].includes(normalized)) {
		return "migrate";
	}
	return normalized;
}

function normalizeWorkScale(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	if (normalized === "trivial") return "tiny";
	if (["medium", "regular"].includes(normalized)) return "normal";
	if (["big", "broad"].includes(normalized)) return "large";
	return normalized;
}

function normalizePlanningDepth(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
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

function normalizeRouteFields(
	row: DecisionRowInput,
): Pick<
	DecisionRow,
	| "routeTarget"
	| "routeKind"
	| "routeRationale"
	| "implementationMode"
	| "directImplementationScope"
> {
	const routeTarget = normalizeRouteTarget(
		row.routeTarget ??
			row.route_target ??
			row.nextLoop ??
			row.next_loop ??
			row.nextRoute ??
			row.next_route,
	);
	const implementationMode = normalizeImplementationMode(
		row.implementationMode ??
			row.implementation_mode ??
			row.testPolicy ??
			row.test_policy,
	);
	return {
		routeTarget,
		routeKind: normalizeRouteKind(row.routeKind ?? row.route_kind, routeTarget),
		routeRationale: text(row.routeRationale ?? row.route_rationale),
		...(implementationMode ? { implementationMode } : {}),
		directImplementationScope: normalizeDirectImplementationScope(
			row.directImplementationScope ?? row.direct_implementation_scope,
		),
	};
}

function normalizeRouteTarget(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	if (!normalized) return "planning";
	if (["plan", "planning", "planning-implementation"].includes(normalized)) {
		return "planning";
	}
	if (
		[
			"implement",
			"implementation",
			"direct-implementation",
			"implementation-direct",
		].includes(normalized)
	) {
		return "implementation";
	}
	return normalized;
}

function normalizeImplementationMode(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/-/g, "_");
	if (
		["targeted", "checks", "targeted_checks", "without_tdd", "no_tdd"].includes(
			normalized,
		)
	) {
		return "targeted_checks";
	}
	if (["test_first", "test_first_tdd"].includes(normalized)) return "tdd";
	return normalized;
}

function normalizeRouteKind(value: unknown, routeTarget: string): string {
	const normalized = text(value).toLowerCase().replace(/-/g, "_");
	if (normalized) return normalized;
	return routeTarget === "implementation" ? "direct_implementation" : "advance";
}

function normalizeDirectImplementationScope(
	value: DecisionRowInput["directImplementationScope"],
): DecisionRow["directImplementationScope"] {
	return {
		acceptance: unique(stringList(value?.acceptance)),
		acceptanceCriteria: normalizeAcceptanceCriteria([
			...objectList(value?.acceptanceCriteria),
			...objectList(value?.acceptance_criteria),
		]),
		componentRefs: unique([
			...stringList(value?.componentRefs),
			...stringList(value?.component_refs),
		]),
		pathScopes: unique([
			...stringList(value?.pathScopes),
			...stringList(value?.path_scopes),
		]),
		verification: unique(stringList(value?.verification)),
	};
}

function normalizeAcceptanceCriteria(
	criteria: unknown[],
): DecisionRow["directImplementationScope"]["acceptanceCriteria"] {
	return objectList<{ id?: string; text?: string }>(criteria).map(
		(criterion, index) => ({
			id: text(criterion.id) || `AC-${String(index + 1).padStart(3, "0")}`,
			text: text(criterion.text),
		}),
	);
}

function cloneDirectImplementationScope(
	scope: DecisionRow["directImplementationScope"],
): DecisionRow["directImplementationScope"] {
	return {
		acceptance: [...scope.acceptance],
		acceptanceCriteria: scope.acceptanceCriteria.map((criterion) => ({
			...criterion,
		})),
		componentRefs: [...scope.componentRefs],
		pathScopes: [...scope.pathScopes],
		verification: [...scope.verification],
	};
}

function firstText(...values: unknown[]): string {
	for (const value of values) {
		const result = text(value);
		if (result) return result;
	}
	return "";
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function objectList<T = Record<string, unknown>>(value: unknown): T[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is T => typeof item === "object" && item !== null,
			)
		: [];
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}
