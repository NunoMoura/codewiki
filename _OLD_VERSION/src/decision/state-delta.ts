import { normalizeDecisionTableUserAction } from "./types.ts";
import { unique } from "../shared/utils.ts";

export type DecisionStateDeltaSourceFormat =
	| "decision_table"
	| "diff_table"
	| "approved_rows";

export interface NormalizedDecisionStateDeltaRow {
	id: string;
	current_project_state: string;
	change_delta: string;
	expected_final_state: string;
	validated_final_state: string;
	desired_state: string;
	rationale: string;
	affected_layers: string[];
	approval_status: string;
	source_format: DecisionStateDeltaSourceFormat;
	source_index: number;
	explicit_id: boolean;
	missing_delta_fields: string[];
}

function list(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function stringList(value: unknown): string[] {
	return list(value)
		.map((item) => text(item))
		.filter(Boolean);
}

function normalizedApproval(value: unknown, fallback = "pending"): string {
	return String(normalizeDecisionTableUserAction(value, fallback))
		.trim()
		.toLowerCase();
}

function approvedIdsFor(decision: any): Set<string> {
	return new Set(stringList(decision?.approved_decision_rows));
}

function rawDecisionRows(
	decision: any,
): Array<{ row: any; source_format: DecisionStateDeltaSourceFormat }> {
	const tableRows = Array.isArray(decision?.decision_table?.rows)
		? decision.decision_table.rows
		: Array.isArray(decision?.decision_table)
			? decision.decision_table
			: [];
	if (tableRows.length > 0) {
		return tableRows.map((row: any) => ({
			row,
			source_format: "decision_table",
		}));
	}
	const approvedRows = list(decision?.approved_rows);
	if (approvedRows.length > 0) {
		return approvedRows.map((row: any) => ({
			row,
			source_format: "approved_rows",
		}));
	}
	return list(decision?.diff_table).map((row: any) => ({
		row,
		source_format: "diff_table",
	}));
}

function rowId(row: any, index: number): { id: string; explicit: boolean } {
	const explicit = text(row?.id || row?.row_id || row?.question_id);
	if (explicit) return { id: explicit, explicit: true };
	return { id: `DTR-${String(index + 1).padStart(3, "0")}`, explicit: false };
}

function approvalStatus(row: any): string {
	const approval = normalizedApproval(
		row?.approval?.status ?? row?.status ?? row?.user_action,
		"pending",
	);
	return approval || "pending";
}

function isApprovedRow(
	row: any,
	id: string,
	approvedIds: Set<string>,
	source: string,
) {
	if (approvedIds.has(id)) return true;
	const status = approvalStatus(row);
	if (status === "approved") return true;
	return source === "approved_rows" && approvedIds.size === 0;
}

function normalizeAffectedLayers(row: any): string[] {
	return unique([
		...stringList(row?.affected_layers),
		...stringList(row?.impact?.product),
		...stringList(row?.impact?.system),
		...stringList(row?.impact?.source),
		...stringList(row?.impact?.tests),
		...stringList(row?.impact?.docs),
	]);
}

function normalizeRawRow(
	row: any,
	index: number,
	source_format: DecisionStateDeltaSourceFormat,
): NormalizedDecisionStateDeltaRow {
	const identity = rowId(row, index);
	const current = text(
		row?.current_project_state ??
			row?.current_state ??
			row?.state_delta?.current,
	);
	const desired = text(
		row?.desired_state ??
			row?.state_delta?.desired ??
			row?.expected_final_state ??
			row?.expected_outcome ??
			row?.agreed_change ??
			row?.proposed_change,
	);
	const changeDelta = text(
		row?.agreed_change ?? row?.proposed_change ?? row?.change_delta ?? desired,
	);
	const expected = text(
		row?.expected_final_state ?? row?.expected_outcome ?? desired,
	);
	const validated = text(row?.validated_final_state ?? row?.validated_outcome);
	const missing_delta_fields = [
		current ? "" : "missing_current_project_state",
		changeDelta ? "" : "missing_change_delta",
		expected ? "" : "missing_expected_final_state",
	].filter(Boolean);
	return {
		id: identity.id,
		current_project_state: current,
		change_delta: changeDelta,
		expected_final_state: expected,
		validated_final_state: validated,
		desired_state: desired,
		rationale: text(row?.rationale),
		affected_layers: normalizeAffectedLayers(row),
		approval_status: approvalStatus(row),
		source_format,
		source_index: index,
		explicit_id: identity.explicit,
		missing_delta_fields,
	};
}

export function normalizeDecisionStateDeltaRows(
	decision: any,
): NormalizedDecisionStateDeltaRow[] {
	const approvedIds = approvedIdsFor(decision);
	return rawDecisionRows(decision)
		.map(({ row, source_format }, index) => ({
			row,
			normalized: normalizeRawRow(row, index, source_format),
			source_format,
		}))
		.filter(({ row, normalized, source_format }) =>
			isApprovedRow(row, normalized.id, approvedIds, source_format),
		)
		.map(({ normalized }) => normalized);
}

export function decisionStateDeltaGaps(decision: any): string[] {
	const rows = normalizeDecisionStateDeltaRows(decision);
	if (
		stringList(decision?.approved_decision_rows).length > 0 &&
		rows.length === 0
	) {
		return ["decision_build:approved_rows_not_normalized"];
	}
	return unique(
		rows.flatMap((row) =>
			row.missing_delta_fields.map((gap) => `decision_row:${row.id}:${gap}`),
		),
	);
}
