import { invalidTraceRefs } from "../traces/refs.ts";
import type {
	ExitDetails,
	ExitFinding,
	ExitRemediationItem,
} from "../traces/types.ts";
import { approvedDecisionRows } from "./table.ts";
import {
	criteriaFromQualityStandards,
	decisionIssueRefs,
	decisionQualityStandards,
	isBlockingDecisionIssue,
} from "./quality-standards.ts";
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
	| "missing_user_impact"
	| "missing_maintainer_impact"
	| "missing_effort"
	| "invalid_effort"
	| "missing_recommendation"
	| "invalid_recommendation"
	| "recommendation_not_approve"
	| "missing_recommendation_rationale"
	| "missing_agent_assessment"
	| "agent_assessment_not_aligned"
	| "missing_high_risk_approval"
	| "invalid_approval_ref"
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
			...recommendationQualityIssues(row),
			...agentAssessmentQualityIssues(row),
			...highRiskQualityIssues(row),
			...traceabilityRefIssues(row),
		);
	}
	issues.push(...knowledgeDeltaIssues(approvedRows, options.knowledgeDelta));
	const qualityStandards = decisionQualityStandards(issues, approvedRows);
	const verdict =
		blockedIssues(issues).length > 0
			? "block"
			: issues.length === 0
				? "pass"
				: "fail";
	return {
		passed: verdict === "pass",
		verdict,
		issues,
		criteria: criteriaFromQualityStandards(qualityStandards),
		qualityStandards,
		findings: issues.map(issueFinding),
		remediation: issues.map(issueRemediation),
		route:
			verdict === "pass"
				? "planning"
				: verdict === "block"
					? "user"
					: "decision",
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
	if (!row.userImpact) {
		issues.push({
			code: "missing_user_impact",
			rowId: row.id,
			message: `Decision row ${row.id} must explain user impact.`,
		});
	}
	if (!row.maintainerImpact) {
		issues.push({
			code: "missing_maintainer_impact",
			rowId: row.id,
			message: `Decision row ${row.id} must explain maintainer impact.`,
		});
	}
	if (!row.effort) {
		issues.push({
			code: "missing_effort",
			rowId: row.id,
			message: `Decision row ${row.id} must estimate effort.`,
		});
	} else if (!isAllowed(row.effort, ["low", "medium", "high"])) {
		issues.push({
			code: "invalid_effort",
			rowId: row.id,
			message: `Decision row ${row.id} has invalid effort ${row.effort}.`,
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

function issueFinding(issue: DecisionExitIssue): ExitFinding {
	return {
		id: `decision:${issue.code}:${issue.rowId || "table"}`,
		severity: "error",
		criterion: issue.code,
		message: issue.message,
		refs: decisionIssueRefs(issue),
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

function recommendationQualityIssues(row: DecisionRow): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	if (!row.recommendation) {
		issues.push({
			code: "missing_recommendation",
			rowId: row.id,
			message: `Decision row ${row.id} must include an agent recommendation.`,
		});
	} else if (
		!isAllowed(row.recommendation, ["approve", "reject", "defer", "ask_user"])
	) {
		issues.push({
			code: "invalid_recommendation",
			rowId: row.id,
			message: `Decision row ${row.id} has invalid recommendation ${row.recommendation}.`,
		});
	} else if (row.recommendation !== "approve") {
		issues.push({
			code: "recommendation_not_approve",
			rowId: row.id,
			message: `Approved decision row ${row.id} must be recommended for approval by the agent.`,
		});
	}
	if (!row.recommendationRationale) {
		issues.push({
			code: "missing_recommendation_rationale",
			rowId: row.id,
			message: `Decision row ${row.id} must justify the agent recommendation.`,
		});
	}
	return issues;
}

function agentAssessmentQualityIssues(row: DecisionRow): DecisionExitIssue[] {
	const assessment = row.agentAssessment;
	const missingStance = !assessment.stance;
	const missingUserAlignment = !assessment.userAlignment;
	const missingProjectBenefit = !assessment.projectBenefit;
	const missingRationale = !assessment.rationale;
	if (
		missingStance ||
		missingUserAlignment ||
		missingProjectBenefit ||
		missingRationale
	) {
		return [
			{
				code: "missing_agent_assessment",
				rowId: row.id,
				message: `Decision row ${row.id} needs an agent assessment of user alignment, project benefit, and rationale.`,
			},
		];
	}
	if (assessment.stance !== "aligned") {
		return [
			{
				code: "agent_assessment_not_aligned",
				rowId: row.id,
				message: `Agent assessment for decision row ${row.id} does not validate the intention as aligned.`,
			},
		];
	}
	return [];
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
	if (row.approvalAuthority !== "user" || !row.approvalRef) {
		issues.push({
			code: "missing_high_risk_approval",
			rowId: row.id,
			message: `High-risk decision row ${row.id} requires explicit user approval authority and approval ref.`,
		});
	} else {
		const [invalidApprovalRef] = invalidTraceRefs([row.approvalRef]);
		if (invalidApprovalRef) {
			issues.push({
				code: "invalid_approval_ref",
				rowId: row.id,
				ref: invalidApprovalRef,
				message: `High-risk decision row ${row.id} has non-canonical approval ref ${invalidApprovalRef}.`,
			});
		}
	}
	return issues;
}

function isHighRisk(row: DecisionRow): boolean {
	return (
		String(row.risk || "")
			.trim()
			.toLowerCase() === "high"
	);
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

function issueRemediation(issue: DecisionExitIssue): ExitRemediationItem {
	return {
		action: decisionRemediationAction(issue),
		route: "decision",
		refs: decisionIssueRefs(issue),
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
	missing_user_impact:
		"Explain how the intention benefits users or user outcomes.",
	missing_maintainer_impact:
		"Explain maintainer cost, operational impact, or complexity impact.",
	missing_effort: "Add a low, medium, or high effort estimate.",
	invalid_effort: "Use effort low, medium, or high.",
	missing_recommendation:
		"Add an agent recommendation: approve, reject, defer, or ask_user.",
	invalid_recommendation:
		"Use recommendation approve, reject, defer, or ask_user.",
	recommendation_not_approve:
		"Keep approved rows only when the agent recommends approval; otherwise route to user with alternatives.",
	missing_recommendation_rationale:
		"Explain why the agent recommendation follows from the evidence.",
	missing_agent_assessment:
		"Add agent assessment for user alignment, project benefit, and rationale.",
	agent_assessment_not_aligned:
		"Route to the user with concerns or alternatives before planning.",
	missing_high_risk_approval:
		"Capture explicit user approval authority and a canonical approval ref for high-risk rows.",
	invalid_approval_ref:
		"Replace weak approval refs with canonical trace, KB, Git, digest, source, or test refs.",
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

function blockedIssues(issues: DecisionExitIssue[]): DecisionExitIssue[] {
	return issues.filter(isBlockingDecisionIssue);
}

function isAllowed(value: string, allowed: string[]): boolean {
	return allowed.includes(value.trim().toLowerCase());
}
