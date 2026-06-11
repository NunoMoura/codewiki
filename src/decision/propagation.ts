import type { DecisionRow, DecisionTable } from "./types.ts";

export interface DecisionStateDeltaRow {
	id: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	affectedLayers: string[];
	sourceRefs: string[];
	missingFields: string[];
}

export function decisionStateDeltaRows(table: DecisionTable): DecisionStateDeltaRow[] {
	return table.rows
		.filter((row) => row.approval === "approved")
		.map((row) => decisionRowStateDelta(row));
}

export function decisionStateDeltaGaps(table: DecisionTable): string[] {
	const rows = decisionStateDeltaRows(table);
	if (table.rows.length > 0 && rows.length === 0) return ["decision:no_approved_rows"];
	return rows.flatMap((row) =>
		row.missingFields.map((field) => `decision_row:${row.id}:${field}`),
	);
}

export function decisionPropagationRefs(table: DecisionTable): string[] {
	return Array.from(
		new Set(decisionStateDeltaRows(table).flatMap((row) => row.sourceRefs)),
	);
}

function decisionRowStateDelta(row: DecisionRow): DecisionStateDeltaRow {
	const missingFields = [
		row.currentState ? "" : "missing_current_state",
		row.desiredState ? "" : "missing_desired_state",
		row.rationale ? "" : "missing_rationale",
	].filter(Boolean);
	return {
		id: row.id,
		currentState: row.currentState,
		desiredState: row.desiredState,
		rationale: row.rationale,
		affectedLayers: [...row.affectedLayers],
		sourceRefs: [...row.sourceRefs, ...row.proofRefs],
		missingFields,
	};
}
