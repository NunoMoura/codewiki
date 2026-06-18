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
import {
	DECISION_KIND_VALUES,
	type CurrentStatePacket,
	type DecisionRow,
	type DecisionTable,
	type KnowledgeDelta,
} from "./types.ts";

export type DecisionExitIssueCode =
	| "no_decision_rows"
	| "no_approved_rows"
	| "missing_current_state"
	| "missing_desired_state"
	| "missing_rationale"
	| "missing_decision_kind"
	| "invalid_decision_kind"
	| "missing_debug_target"
	| "missing_debug_hypothesis"
	| "missing_debug_invariant"
	| "missing_debug_probe"
	| "missing_debug_expected_safe_behavior"
	| "missing_debug_stop_condition"
	| "missing_fix_reproduction"
	| "missing_fix_expected_behavior"
	| "missing_fix_regression_plan"
	| "missing_harden_boundary"
	| "missing_harden_failure_modes"
	| "missing_harden_negative_test_plan"
	| "missing_harden_compatibility_impact"
	| "missing_improve_current_pain"
	| "missing_improve_desired_outcome"
	| "missing_improve_success_signal"
	| "missing_improve_non_goals"
	| "missing_migrate_source_behavior"
	| "missing_migrate_target_behavior"
	| "missing_migrate_preserved_invariants"
	| "missing_migrate_equivalence_proof"
	| "missing_migrate_rollback_plan"
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
	| "missing_risk"
	| "invalid_risk"
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
	issues.push(...tableTraceabilityRefIssues(table));
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
			...decisionKindQualityIssues(row),
			...recommendationQualityIssues(row),
			...agentAssessmentQualityIssues(row),
			...riskQualityIssues(row),
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

function decisionKindQualityIssues(row: DecisionRow): DecisionExitIssue[] {
	const issues: DecisionExitIssue[] = [];
	if (!row.decisionKind) {
		issues.push({
			code: "missing_decision_kind",
			rowId: row.id,
			message: `Decision row ${row.id} must declare decisionKind.`,
		});
		return issues;
	}
	if (!isAllowed(row.decisionKind, [...DECISION_KIND_VALUES])) {
		issues.push({
			code: "invalid_decision_kind",
			rowId: row.id,
			message: `Decision row ${row.id} has invalid decisionKind ${row.decisionKind}.`,
		});
		return issues;
	}
	if (row.decisionKind === "debug") {
		if (row.targetRefs.length === 0) {
			issues.push(kindIssue(row, "missing_debug_target", "name target refs"));
		}
		if (!row.hypothesis) {
			issues.push(
				kindIssue(row, "missing_debug_hypothesis", "state a hypothesis"),
			);
		}
		if (!row.invariant) {
			issues.push(
				kindIssue(
					row,
					"missing_debug_invariant",
					"state an invariant or failure boundary",
				),
			);
		}
		if (!row.probe) {
			issues.push(
				kindIssue(
					row,
					"missing_debug_probe",
					"define a probe or reproduction plan",
				),
			);
		}
		if (!row.expectedSafeBehavior) {
			issues.push(
				kindIssue(
					row,
					"missing_debug_expected_safe_behavior",
					"state expected safe behavior",
				),
			);
		}
		if (!row.stopCondition) {
			issues.push(
				kindIssue(
					row,
					"missing_debug_stop_condition",
					"state a stop condition",
				),
			);
		}
	}
	if (row.decisionKind === "fix") {
		if (!row.reproduction) {
			issues.push(
				kindIssue(row, "missing_fix_reproduction", "describe the reproduction"),
			);
		}
		if (!row.expectedBehavior) {
			issues.push(
				kindIssue(
					row,
					"missing_fix_expected_behavior",
					"state expected behavior",
				),
			);
		}
		if (!row.regressionPlan) {
			issues.push(
				kindIssue(
					row,
					"missing_fix_regression_plan",
					"define a regression test plan",
				),
			);
		}
	}
	if (row.decisionKind === "harden") {
		if (!row.safetyBoundary) {
			issues.push(
				kindIssue(row, "missing_harden_boundary", "name the safety boundary"),
			);
		}
		if (row.failureModes.length === 0) {
			issues.push(
				kindIssue(
					row,
					"missing_harden_failure_modes",
					"list failure or abuse modes",
				),
			);
		}
		if (!row.negativeTestPlan) {
			issues.push(
				kindIssue(
					row,
					"missing_harden_negative_test_plan",
					"define negative test coverage",
				),
			);
		}
		if (!row.compatibilityImpact) {
			issues.push(
				kindIssue(
					row,
					"missing_harden_compatibility_impact",
					"state compatibility impact",
				),
			);
		}
	}
	if (row.decisionKind === "improve") {
		if (!row.currentPain) {
			issues.push(
				kindIssue(row, "missing_improve_current_pain", "describe current pain"),
			);
		}
		if (!row.desiredOutcome) {
			issues.push(
				kindIssue(
					row,
					"missing_improve_desired_outcome",
					"state desired outcome",
				),
			);
		}
		if (!row.successSignal) {
			issues.push(
				kindIssue(
					row,
					"missing_improve_success_signal",
					"define success signal",
				),
			);
		}
		if (row.nonGoals.length === 0) {
			issues.push(
				kindIssue(row, "missing_improve_non_goals", "list non-goals"),
			);
		}
	}
	if (row.decisionKind === "migrate") {
		if (!row.sourceBehavior) {
			issues.push(
				kindIssue(
					row,
					"missing_migrate_source_behavior",
					"describe source behavior",
				),
			);
		}
		if (!row.targetBehavior) {
			issues.push(
				kindIssue(
					row,
					"missing_migrate_target_behavior",
					"describe target behavior",
				),
			);
		}
		if (row.preservedInvariants.length === 0) {
			issues.push(
				kindIssue(
					row,
					"missing_migrate_preserved_invariants",
					"list preserved invariants",
				),
			);
		}
		if (!row.equivalenceProof) {
			issues.push(
				kindIssue(
					row,
					"missing_migrate_equivalence_proof",
					"define equivalence proof",
				),
			);
		}
		if (!row.rollbackPlan) {
			issues.push(
				kindIssue(
					row,
					"missing_migrate_rollback_plan",
					"state rollback or containment plan",
				),
			);
		}
	}
	return issues;
}

function kindIssue(
	row: DecisionRow,
	code: DecisionExitIssueCode,
	requirement: string,
): DecisionExitIssue {
	return {
		code,
		rowId: row.id,
		message: `${row.decisionKind} decision row ${row.id} must ${requirement}.`,
	};
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

function tableTraceabilityRefIssues(table: DecisionTable): DecisionExitIssue[] {
	return invalidTraceRefs(table.sourceRefs).map((ref) => ({
		code: "invalid_traceability_ref" as const,
		ref,
		message: `Decision table ${table.id} has non-canonical source ref ${ref}.`,
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

function riskQualityIssues(row: DecisionRow): DecisionExitIssue[] {
	if (!row.risk) {
		return [
			{
				code: "missing_risk" as const,
				rowId: row.id,
				message: `Decision row ${row.id} must declare risk as low, medium, or high.`,
			},
		];
	}
	if (!isAllowed(row.risk, ["low", "medium", "high"])) {
		return [
			{
				code: "invalid_risk" as const,
				rowId: row.id,
				message: `Decision row ${row.id} has invalid risk ${row.risk}.`,
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
		route: isBlockingDecisionIssue(issue) ? "user" : "decision",
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
	missing_decision_kind:
		"Classify the decision row as debug, fix, harden, improve, migrate, docs, or release.",
	invalid_decision_kind:
		"Use decisionKind debug, fix, harden, improve, migrate, docs, or release.",
	missing_debug_target:
		"For debug decisions, name the component or path being investigated.",
	missing_debug_hypothesis:
		"For debug decisions, state the hypothesis being tested.",
	missing_debug_invariant:
		"For debug decisions, state the invariant or failure boundary.",
	missing_debug_probe:
		"For debug decisions, define the probe, repro command, or observation plan.",
	missing_debug_expected_safe_behavior:
		"For debug decisions, state the expected safe behavior.",
	missing_debug_stop_condition:
		"For debug decisions, state when debugging should stop.",
	missing_fix_reproduction:
		"For fix decisions, describe the known reproduction or failing scenario.",
	missing_fix_expected_behavior:
		"For fix decisions, state the expected behavior.",
	missing_fix_regression_plan:
		"For fix decisions, define the regression coverage plan.",
	missing_harden_boundary:
		"For hardening decisions, name the safety boundary being protected.",
	missing_harden_failure_modes:
		"For hardening decisions, list relevant failure or abuse modes.",
	missing_harden_negative_test_plan:
		"For hardening decisions, define negative test coverage.",
	missing_harden_compatibility_impact:
		"For hardening decisions, state compatibility impact.",
	missing_improve_current_pain:
		"For improvement decisions, describe current user or maintainer pain.",
	missing_improve_desired_outcome:
		"For improvement decisions, state the desired outcome.",
	missing_improve_success_signal:
		"For improvement decisions, define a success signal.",
	missing_improve_non_goals:
		"For improvement decisions, list non-goals to bound scope.",
	missing_migrate_source_behavior:
		"For migration decisions, describe current/source behavior.",
	missing_migrate_target_behavior:
		"For migration decisions, describe target behavior.",
	missing_migrate_preserved_invariants:
		"For migration decisions, list invariants that must be preserved.",
	missing_migrate_equivalence_proof:
		"For migration decisions, define equivalence proof or checks.",
	missing_migrate_rollback_plan:
		"For migration decisions, state rollback or containment strategy.",
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
	missing_risk: "Declare decision risk as low, medium, or high.",
	invalid_risk: "Use risk low, medium, or high.",
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
