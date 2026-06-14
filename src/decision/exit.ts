import { invalidTraceRefs } from "../traces/refs.ts";
import type {
	ExitCriterionResult,
	ExitDetails,
	ExitFinding,
	ExitRemediationItem,
	LoopQualityStandardResult,
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
	| "missing_high_risk_scope"
	| "missing_high_risk_alternative"
	| "missing_high_risk_evidence"
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
		issues.push(
			...approvedRowIssues(row),
			...highRiskQualityIssues(row),
			...traceabilityRefIssues(row),
		);
	}
	issues.push(...knowledgeDeltaIssues(approvedRows, options.knowledgeDelta));
	const qualityStandards = decisionQualityStandards(issues, approvedRows);
	const verdict = issues.length === 0 ? "pass" : "fail";
	return {
		passed: verdict === "pass",
		verdict,
		issues,
		criteria: criteriaFromQualityStandards(qualityStandards),
		qualityStandards,
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

function decisionQualityStandards(
	issues: DecisionExitIssue[],
	approvedRows: DecisionRow[],
): LoopQualityStandardResult[] {
	return [
		standard({
			id: "decision_table_ready",
			description:
				"Decision table has at least one approved row and stable row ids.",
			issues,
			codes: [
				"no_decision_rows",
				"no_approved_rows",
				"duplicate_decision_row_id",
			],
		}),
		standard({
			id: "intention_understood",
			description:
				"Approved rows state the user intention as current state, desired state, and rationale.",
			issues,
			codes: [
				"missing_current_state",
				"missing_desired_state",
				"missing_rationale",
			],
		}),
		standard({
			id: "current_state_grounded",
			description:
				"Current state is grounded in canonical source, KB, trace, Git, digest, or test refs.",
			issues,
			codes: ["missing_current_state_packet", "invalid_current_state_ref"],
			evidenceRefs: approvedRows.flatMap((row) => [
				...row.sourceRefs,
				...row.proofRefs,
			]),
		}),
		standard({
			id: "evidence_sufficient",
			description:
				"Decision evidence is sufficient for planning to trust the intention, including stronger proof for high-risk rows.",
			issues,
			codes: [
				"missing_traceability_ref",
				"missing_high_risk_evidence",
				"invalid_traceability_ref",
			],
			evidenceRefs: approvedRows.flatMap((row) => [
				...row.sourceRefs,
				...row.proofRefs,
			]),
		}),
		standard({
			id: "risks_and_alternatives_considered",
			description:
				"Approved high-risk intentions identify affected layers and alternatives before implementation work is planned.",
			issues,
			codes: ["missing_high_risk_scope", "missing_high_risk_alternative"],
		}),
		standard({
			id: "knowledge_impact_accounted",
			description:
				"Knowledge impact is recorded as updated refs or explicit no-impact rationale.",
			issues,
			codes: [
				"missing_knowledge_delta",
				"invalid_knowledge_ref",
				"incomplete_knowledge_digest",
			],
		}),
	];
}

function standard(input: {
	id: string;
	description: string;
	issues: DecisionExitIssue[];
	codes: DecisionExitIssueCode[];
	evidenceRefs?: string[];
}): LoopQualityStandardResult {
	const matched = input.issues.filter((issue) => input.codes.includes(issue.code));
	return {
		id: input.id,
		status: matched.length > 0 ? "unmet" : "met",
		mode: "deterministic",
		description: input.description,
		...(matched.length > 0
			? { message: matched.map((issue) => issue.message).join(" ") }
			: {}),
		...(matched.length > 0
			? { refs: unique(matched.flatMap((issue) => issueRefs(issue))) }
			: {}),
		...(input.evidenceRefs && input.evidenceRefs.length > 0
			? { evidenceRefs: unique(input.evidenceRefs) }
			: {}),
	};
}

function criteriaFromQualityStandards(
	standards: LoopQualityStandardResult[],
): ExitCriterionResult[] {
	return standards.map((standard) => ({
		id: standard.id,
		status: standard.status === "met" ? "pass" : "fail",
		...(standard.message ? { message: standard.message } : {}),
		...(standard.refs ? { refs: standard.refs } : {}),
	}));
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

function highRiskQualityIssues(row: DecisionRow): DecisionExitIssue[] {
	if (!isHighRisk(row)) return [];
	const issues: DecisionExitIssue[] = [];
	if (row.affectedLayers.length === 0) {
		issues.push({
			code: "missing_high_risk_scope",
			rowId: row.id,
			message: `High-risk decision row ${row.id} must name affected layers.`,
		});
	}
	if (row.alternatives.length === 0) {
		issues.push({
			code: "missing_high_risk_alternative",
			rowId: row.id,
			message: `High-risk decision row ${row.id} must record at least one alternative.`,
		});
	}
	if (row.proofRefs.length === 0) {
		issues.push({
			code: "missing_high_risk_evidence",
			rowId: row.id,
			message: `High-risk decision row ${row.id} needs proof refs for research, prior art, validation, or explicit user guidance.`,
		});
	}
	return issues;
}

function isHighRisk(row: DecisionRow): boolean {
	return String(row.risk || "").trim().toLowerCase() === "high";
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
	missing_high_risk_scope:
		"Name affected layers so reviewers can reason about blast radius.",
	missing_high_risk_alternative:
		"Add at least one viable alternative for the high-risk intention.",
	missing_high_risk_evidence:
		"Attach proof refs for research, prior art, validation, or explicit user guidance.",
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

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
