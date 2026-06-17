import {
	normalizeChangeType,
	normalizeDecisionApprovalStatus,
	normalizeTraceabilityExemption,
} from "./approval.ts";
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
		currentState: text(row.currentState),
		desiredState: text(row.desiredState),
		rationale: text(row.rationale),
		userImpact: text(row.userImpact),
		maintainerImpact: text(row.maintainerImpact),
		effort: text(row.effort),
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

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}
