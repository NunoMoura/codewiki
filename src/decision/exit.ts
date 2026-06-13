import { invalidTraceRefs } from "../traces/refs.ts";
import type {
	ExitCriterionResult,
	ExitDetails,
	ExitFinding,
	ExitRemediationItem,
} from "../traces/types.ts";
import { approvedDecisionRows } from "./table.ts";
import type {
	CurrentStatePacket,
	DecisionRow,
	DecisionTable,
	KnowledgeDelta,
} from "./types.ts";

export type DecisionExitIssueCode =
	| "no_decision_rows"
	| "no_approved_rows"
	| "missing_current_state"
	| "missing_desired_state"
	| "missing_rationale"
	| "missing_current_state_packet"
	| "invalid_current_state_ref"
	| "missing_traceability_ref"
	| "duplicate_decision_row_id"
	| "invalid_traceability_ref"
	| "missing_knowledge_delta"
	| "invalid_knowledge_ref"
	| "incomplete_knowledge_digest";

export interface DecisionExitIssue {
	code: DecisionExitIssueCode;
	rowId?: string;
	ref?: string;
	message: string;
}

export interface DecisionExitOptions {
	knowledgeDelta?: KnowledgeDelta;
	currentStatePacket?: CurrentStatePacket;
}

export interface DecisionExitResult extends ExitDetails {
	passed: boolean;
	issues: DecisionExitIssue[];
	approvedRowIds: string[];
}

export function evaluateDecisionExit(
	table: DecisionTable,
	options: DecisionExitOptions = {},
): DecisionExitResult {
	const issues: DecisionExitIssue[] = [];
	if (table.rows.length === 0) {
		issues.push({
			code: "no_decision_rows",
			message: "Decision exit requires at least one row.",
		});
	}
	const approvedRows = approvedDecisionRows(table);
	if (table.rows.length > 0 && approvedRows.length === 0) {
		issues.push({
			code: "no_approved_rows",
			message: "Decision exit requires at least one approved row.",
		});
	}
	issues.push(...duplicateRowIssues(table.rows));
	issues.push(
		...currentStatePacketIssues({
			approvedRows,
			packet:
				options.currentStatePacket ||
				currentStatePacketFromRows(table, approvedRows),
			validateRefs: Boolean(options.currentStatePacket),
		}),
	);
	for (const row of approvedRows) {
		issues.push(...approvedRowIssues(row), ...traceabilityRefIssues(row));
	}
	issues.push(...knowledgeDeltaIssues(approvedRows, options.knowledgeDelta));
	const verdict = issues.length === 0 ? "pass" : "fail";
	return {
		passed: verdict === "pass",
		verdict,
		issues,
		criteria: decisionCriteria(issues),
		findings: issues.map(issueFinding),
		remediation: issues.map(issueRemediation),
		route: verdict === "pass" ? "planning" : "decision",
		approvedRowIds: approvedRows.map((row) => row.id),
	};
}

export function decisionHasRequiredEvidence(row: DecisionRow): boolean {
	return approvedRowIssues(row).length === 0;
}

function approvedRowIssues(row: DecisionRow): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
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

function decisionCriteria(issues: DecisionExitIssue[]): ExitCriterionResult[] {
	return [
		criterion("decision_rows", issues, [
			"no_decision_rows",
			"duplicate_decision_row_id",
		]),
		criterion("approval", issues, ["no_approved_rows"]),
		criterion("semantic_fields", issues, [
			"missing_current_state",
			"missing_desired_state",
			"missing_rationale",
		]),
		criterion("current_state_packet", issues, [
			"missing_current_state_packet",
			"invalid_current_state_ref",
		]),
		criterion("traceability_refs", issues, [
			"missing_traceability_ref",
			"invalid_traceability_ref",
		]),
		criterion("knowledge_delta", issues, [
			"missing_knowledge_delta",
			"invalid_knowledge_ref",
			"incomplete_knowledge_digest",
		]),
	];
}

function criterion(
	id: string,
	issues: DecisionExitIssue[],
	codes: DecisionExitIssueCode[],
): ExitCriterionResult {
	const matched = issues.filter((issue) => codes.includes(issue.code));
	return {
		id,
		status: matched.length > 0 ? "fail" : "pass",
		...(matched.length > 0
			? { message: matched.map((issue) => issue.message).join(" ") }
			: {}),
	};
}

function issueFinding(issue: DecisionExitIssue): ExitFinding {
	return {
		id: `decision:${issue.code}:${issue.rowId || "table"}`,
		severity: "error",
		criterion: issue.code,
		message: issue.message,
		refs: issueRefs(issue),
		rationale:
			"Decision evidence must be complete before planning consumes it.",
	};
}

function currentStatePacketIssues(input: {
	approvedRows: DecisionRow[];
	packet: CurrentStatePacket;
	validateRefs: boolean;
}): DecisionExitIssue[] {
	const { approvedRows, packet, validateRefs } = input;
	if (approvedRows.length === 0) return [];
	const issues: DecisionExitIssue[] = [];
	if (packet.refs.length === 0) {
		issues.push({
			code: "missing_current_state_packet",
			message:
				"Decision exit requires current-state refs before planning can compare desired state to actual state.",
		});
	}
	if (validateRefs) {
		issues.push(
			...invalidTraceRefs(packet.refs).map((ref) => ({
				code: "invalid_current_state_ref" as const,
				ref,
				message: `Decision current-state packet has non-canonical ref ${ref}.`,
			})),
		);
	}
	return issues;
}

function currentStatePacketFromRows(
	table: DecisionTable,
	approvedRows: DecisionRow[],
): CurrentStatePacket {
	return {
		summary: approvedRows.map((row) => row.currentState).join(" "),
		refs: [
			...table.sourceRefs,
			...approvedRows.flatMap((row) => [...row.sourceRefs, ...row.proofRefs]),
		],
	};
}

function duplicateRowIssues(rows: DecisionRow[]): DecisionExitIssue[] {
	const counts = new Map<string, number>();
	for (const row of rows) counts.set(row.id, (counts.get(row.id) || 0) + 1);
	return [...counts.entries()]
		.filter(([, count]) => count > 1)
		.map(([rowId]) => ({
			code: "duplicate_decision_row_id" as const,
			rowId,
			message: `Decision row id ${rowId} appears more than once.`,
		}));
}

function traceabilityRefIssues(row: DecisionRow): DecisionExitIssue[] {
	return invalidTraceRefs([...row.sourceRefs, ...row.proofRefs]).map((ref) => ({
		code: "invalid_traceability_ref" as const,
		rowId: row.id,
		ref,
		message: `Decision row ${row.id} has non-canonical ref ${ref}.`,
	}));
}

function knowledgeDeltaIssues(
	approvedRows: DecisionRow[],
	knowledgeDelta?: KnowledgeDelta,
): DecisionExitIssue[] {
	if (approvedRows.length === 0) return [];
	const rowsRequireKnowledge = approvedRows.some(
		(row) => !row.noKbImpactReason,
	);
	if (!knowledgeDelta) {
		return rowsRequireKnowledge
			? [
					{
						code: "missing_knowledge_delta" as const,
						message:
							"Decision exit requires a knowledge delta or no-impact rationale before planning.",
					},
				]
			: [];
	}
	const issues: DecisionExitIssue[] = [];
	if (
		rowsRequireKnowledge &&
		knowledgeDelta.updatedRefs.length === 0 &&
		!knowledgeDelta.noImpactReason
	) {
		issues.push({
			code: "missing_knowledge_delta",
			message:
				"Decision knowledge delta needs updated refs or no-impact rationale.",
		});
	}
	issues.push(
		...invalidTraceRefs(knowledgeDelta.updatedRefs).map((ref) => ({
			code: "invalid_knowledge_ref" as const,
			ref,
			message: `Decision knowledge delta has non-canonical updated ref ${ref}.`,
		})),
	);
	if (
		Boolean(knowledgeDelta.beforeDigest) !== Boolean(knowledgeDelta.afterDigest)
	) {
		issues.push({
			code: "incomplete_knowledge_digest",
			message:
				"Decision knowledge delta must include both beforeDigest and afterDigest when either digest is present.",
		});
	}
	return issues;
}

function issueRefs(issue: DecisionExitIssue): string[] {
	if (issue.rowId) return [`decision-row:${issue.rowId}`];
	if (issue.ref) return [issue.ref];
	return [];
}

function issueRemediation(issue: DecisionExitIssue): ExitRemediationItem {
	return {
		action: decisionRemediationAction(issue),
		route: "decision",
		refs: issueRefs(issue),
		blocking: true,
	};
}

const DECISION_REMEDIATION: Record<DecisionExitIssueCode, string> = {
	no_decision_rows: "Create at least one decision row.",
	no_approved_rows:
		"Approve, reject, or defer the decision rows; at least one approved row is required for planning.",
	missing_current_state: "Ground the decision row in current KB/source state.",
	missing_desired_state: "State the desired target state for the decision row.",
	missing_rationale:
		"Add rationale explaining why this decision should be accepted.",
	missing_current_state_packet:
		"Attach canonical current-state refs: KB, source/test path, trace event, Git ref, or digest.",
	invalid_current_state_ref:
		"Replace weak current-state refs with canonical KB, trace, Git, digest, source, or test refs.",
	missing_traceability_ref:
		"Attach canonical source refs or an explicit no-KB-impact rationale.",
	duplicate_decision_row_id: "Give every decision row a stable unique id.",
	invalid_traceability_ref:
		"Replace weak refs with canonical KB, trace, Git, digest, source, or test refs.",
	missing_knowledge_delta:
		"Add a decision knowledge delta with updated refs or explicit no-impact rationale.",
	invalid_knowledge_ref:
		"Replace weak knowledge delta refs with canonical KB, trace, Git, digest, source, or test refs.",
	incomplete_knowledge_digest:
		"Record both beforeDigest and afterDigest, or omit both until write proof exists.",
};

function decisionRemediationAction(issue: DecisionExitIssue): string {
	return DECISION_REMEDIATION[issue.code];
}
