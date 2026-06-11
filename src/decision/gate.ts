import { approvedDecisionRows } from "./table.ts";
import type { DecisionRow, DecisionTable } from "./types.ts";

export type DecisionGateIssueCode =
	| "no_decision_rows"
	| "no_approved_rows"
	| "missing_current_state"
	| "missing_desired_state"
	| "missing_rationale"
	| "missing_traceability_ref";

export interface DecisionGateIssue {
	code: DecisionGateIssueCode;
	rowId?: string;
	message: string;
}

export interface DecisionGateResult {
	passed: boolean;
	issues: DecisionGateIssue[];
	approvedRowIds: string[];
}

export function evaluateDecisionGate(table: DecisionTable): DecisionGateResult {
	const issues: DecisionGateIssue[] = [];
	if (table.rows.length === 0) {
		issues.push({ code: "no_decision_rows", message: "Decision gate requires at least one row." });
	}
	const approvedRows = approvedDecisionRows(table);
	if (table.rows.length > 0 && approvedRows.length === 0) {
		issues.push({ code: "no_approved_rows", message: "Decision gate requires at least one approved row." });
	}
	for (const row of approvedRows) issues.push(...approvedRowIssues(row));
	return {
		passed: issues.length === 0,
		issues,
		approvedRowIds: approvedRows.map((row) => row.id),
	};
}

export function decisionHasRequiredEvidence(row: DecisionRow): boolean {
	return approvedRowIssues(row).length === 0;
}

function approvedRowIssues(row: DecisionRow): DecisionGateIssue[] {
	const issues: DecisionGateIssue[] = [];
	if (!row.currentState) {
		issues.push({
			code: "missing_current_state",
			rowId: row.id,
			message: `Decision row ${row.id} is missing current state.`,
		});
	}
	if (!row.desiredState) {
		issues.push({
			code: "missing_desired_state",
			rowId: row.id,
			message: `Decision row ${row.id} is missing desired state.`,
		});
	}
	if (!row.rationale) {
		issues.push({
			code: "missing_rationale",
			rowId: row.id,
			message: `Decision row ${row.id} is missing rationale.`,
		});
	}
	if (row.sourceRefs.length === 0 && !row.noKbImpactReason) {
		issues.push({
			code: "missing_traceability_ref",
			rowId: row.id,
			message: `Decision row ${row.id} needs source refs or no-KB-impact rationale.`,
		});
	}
	return issues;
}
