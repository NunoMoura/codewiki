import {
	buildLoopQualityStandard,
	criteriaFromQualityStandards,
	type LoopQualityStandardDefinition,
} from "../loops/standards.ts";
import type { LoopQualityStandardResult } from "../traces/types.ts";
import type { DecisionExitIssue, DecisionExitIssueCode } from "./exit.ts";
import type { DecisionRow } from "./types.ts";

export { criteriaFromQualityStandards };

const BASE_DECISION_QUALITY_STANDARDS: LoopQualityStandardDefinition<DecisionExitIssueCode>[] = [
	{
		id: "decision_table_ready",
		weight: 8,
		description:
			"Decision table has at least one approved row and stable row ids.",
		codes: ["no_decision_rows", "no_approved_rows", "duplicate_decision_row_id"],
	},
	{
		id: "intention_understood",
		weight: 14,
		description:
			"Approved rows state the user intention as current state, desired state, and rationale.",
		codes: [
			"missing_current_state",
			"missing_desired_state",
			"missing_rationale",
		],
	},
	{
		id: "user_value_clear",
		weight: 10,
		description:
			"Approved rows explain how the intention benefits users or improves user outcomes.",
		codes: ["missing_user_impact"],
	},
	{
		id: "cost_understood",
		weight: 7,
		description:
			"Approved rows expose maintainer impact and a bounded effort estimate.",
		codes: ["missing_maintainer_impact", "missing_effort", "invalid_effort"],
	},
	{
		id: "work_routing_classified",
		weight: 10,
		description:
			"Approved rows classify work scale and choose micro or standard planning before planning handoff.",
		codes: [
			"missing_work_scale",
			"invalid_work_scale",
			"missing_planning_depth",
			"invalid_planning_depth",
			"invalid_micro_plan_scale",
			"invalid_micro_plan_risk",
		],
	},
	{
		id: "recommendation_justified",
		weight: 9,
		description:
			"The agent gives a clear approve/reject/defer/ask-user recommendation and explains why approved rows should proceed.",
		codes: [
			"missing_recommendation",
			"invalid_recommendation",
			"recommendation_not_approve",
			"missing_recommendation_rationale",
		],
	},
	{
		id: "intention_validated",
		weight: 12,
		mode: "agent",
		description:
			"The agent judges that the user's good-faith intention is aligned with real user value and the project's long-term interests.",
		codes: ["missing_agent_assessment", "agent_assessment_not_aligned"],
	},
	{
		id: "approval_safety",
		weight: 18,
		description:
			"High-risk approved rows have explicit user approval authority and a canonical approval ref.",
		codes: ["missing_high_risk_approval", "invalid_approval_ref"],
	},
	{
		id: "current_state_grounded",
		weight: 12,
		description:
			"Current state is grounded in canonical source, KB, trace, Git, digest, or test refs.",
		codes: ["missing_current_state_packet", "invalid_current_state_ref"],
	},
	{
		id: "evidence_sufficient",
		weight: 12,
		description:
			"Decision evidence is sufficient for planning to trust the intention, including stronger proof for high-risk rows.",
		codes: [
			"missing_traceability_ref",
			"missing_high_risk_evidence",
			"invalid_traceability_ref",
		],
	},
	{
		id: "risks_and_alternatives_considered",
		weight: 10,
		description:
			"Approved rows declare a valid risk tier; high-risk intentions identify affected layers and alternatives before implementation work is planned.",
		codes: [
			"missing_risk",
			"invalid_risk",
			"missing_high_risk_scope",
			"missing_high_risk_alternative",
		],
	},
	{
		id: "active_trace_conflicts_resolved",
		weight: 16,
		description:
			"Approved rows do not conflict with active trace goals unless the conflict is merged, superseded, deferred, or otherwise resolved.",
		codes: ["active_trace_conflict"],
	},
	{
		id: "knowledge_impact_accounted",
		weight: 8,
		description:
			"Knowledge impact is recorded as updated refs or explicit no-impact rationale.",
		codes: [
			"missing_knowledge_delta",
			"invalid_knowledge_ref",
			"incomplete_knowledge_digest",
		],
	},
];

const DECISION_KIND_QUALITY_STANDARDS: Record<
	string,
	LoopQualityStandardDefinition<DecisionExitIssueCode>
> = {
	decision_kind_classified: {
		id: "decision_kind_classified",
		weight: 8,
		description:
			"Approved rows classify the decision kind so kind-specific quality can apply inside the decision loop.",
		codes: ["missing_decision_kind", "invalid_decision_kind"],
	},
	debug_decision_focused: {
		id: "debug_decision_focused",
		weight: 14,
		description:
			"Debug decisions name target, hypothesis, invariant, probe, expected safe behavior, and stop condition.",
		codes: [
			"missing_debug_target",
			"missing_debug_hypothesis",
			"missing_debug_invariant",
			"missing_debug_probe",
			"missing_debug_expected_safe_behavior",
			"missing_debug_stop_condition",
		],
	},
	fix_decision_reproducible: {
		id: "fix_decision_reproducible",
		weight: 14,
		description:
			"Fix decisions identify reproduction, expected behavior, and regression coverage.",
		codes: [
			"missing_fix_reproduction",
			"missing_fix_expected_behavior",
			"missing_fix_regression_plan",
		],
	},
	harden_decision_boundary: {
		id: "harden_decision_boundary",
		weight: 14,
		description:
			"Hardening decisions define the safety boundary, failure modes, negative tests, and compatibility impact.",
		codes: [
			"missing_harden_boundary",
			"missing_harden_failure_modes",
			"missing_harden_negative_test_plan",
			"missing_harden_compatibility_impact",
		],
	},
	improve_decision_outcome: {
		id: "improve_decision_outcome",
		weight: 14,
		description:
			"Improvement decisions describe current pain, desired outcome, success signal, and non-goals.",
		codes: [
			"missing_improve_current_pain",
			"missing_improve_desired_outcome",
			"missing_improve_success_signal",
			"missing_improve_non_goals",
		],
	},
	migrate_decision_equivalent: {
		id: "migrate_decision_equivalent",
		weight: 14,
		description:
			"Migration decisions describe source/target behavior, preserved invariants, equivalence proof, and rollback strategy.",
		codes: [
			"missing_migrate_source_behavior",
			"missing_migrate_target_behavior",
			"missing_migrate_preserved_invariants",
			"missing_migrate_equivalence_proof",
			"missing_migrate_rollback_plan",
		],
	},
};

export function decisionQualityStandards(
	issues: DecisionExitIssue[],
	approvedRows: DecisionRow[],
): LoopQualityStandardResult[] {
	const evidenceRefs = approvedRows.flatMap((row) => [
		...row.sourceRefs,
		...row.proofRefs,
	]);
	return [
		...BASE_DECISION_QUALITY_STANDARDS.map((definition) =>
			buildDecisionStandard({
				...definition,
				evidenceRefs: evidenceStandardIds.has(definition.id)
					? evidenceRefs
					: definition.evidenceRefs,
			}, issues),
		),
		...decisionKindQualityStandards(issues, approvedRows),
	];
}

function decisionKindQualityStandards(
	issues: DecisionExitIssue[],
	approvedRows: DecisionRow[],
): LoopQualityStandardResult[] {
	const standards: LoopQualityStandardResult[] = [];
	if (
		approvedRows.length > 0 ||
		hasAnyIssue(issues, ["missing_decision_kind", "invalid_decision_kind"])
	) {
		standards.push(
			buildDecisionStandard(
				DECISION_KIND_QUALITY_STANDARDS.decision_kind_classified,
				issues,
			),
		);
	}
	if (
		hasKind(approvedRows, "debug") ||
		hasCodePrefix(issues, "missing_debug_")
	) {
		standards.push(
			buildDecisionStandard(
				DECISION_KIND_QUALITY_STANDARDS.debug_decision_focused,
				issues,
			),
		);
	}
	if (hasKind(approvedRows, "fix") || hasCodePrefix(issues, "missing_fix_")) {
		standards.push(
			buildDecisionStandard(
				DECISION_KIND_QUALITY_STANDARDS.fix_decision_reproducible,
				issues,
			),
		);
	}
	if (
		hasKind(approvedRows, "harden") ||
		hasCodePrefix(issues, "missing_harden_")
	) {
		standards.push(
			buildDecisionStandard(
				DECISION_KIND_QUALITY_STANDARDS.harden_decision_boundary,
				issues,
			),
		);
	}
	if (
		hasKind(approvedRows, "improve") ||
		hasCodePrefix(issues, "missing_improve_")
	) {
		standards.push(
			buildDecisionStandard(
				DECISION_KIND_QUALITY_STANDARDS.improve_decision_outcome,
				issues,
			),
		);
	}
	if (
		hasKind(approvedRows, "migrate") ||
		hasCodePrefix(issues, "missing_migrate_")
	) {
		standards.push(
			buildDecisionStandard(
				DECISION_KIND_QUALITY_STANDARDS.migrate_decision_equivalent,
				issues,
			),
		);
	}
	return standards;
}

export function decisionIssueRefs(issue: DecisionExitIssue): string[] {
	if (issue.rowId) return [`decision-row:${issue.rowId}`];
	if (issue.ref) return [issue.ref];
	return [];
}

export function isBlockingDecisionIssue(issue: DecisionExitIssue): boolean {
	return (
		issue.code === "agent_assessment_not_aligned" ||
		issue.code === "missing_high_risk_approval" ||
		issue.code === "invalid_approval_ref" ||
		issue.code === "active_trace_conflict"
	);
}

const evidenceStandardIds = new Set([
	"current_state_grounded",
	"evidence_sufficient",
]);

function buildDecisionStandard(
	definition: LoopQualityStandardDefinition<DecisionExitIssueCode>,
	issues: DecisionExitIssue[],
): LoopQualityStandardResult {
	return buildLoopQualityStandard({
		definition,
		issues,
		issueCode: (issue) => issue.code,
		issueMessage: (issue) => issue.message,
		issueRefs: decisionIssueRefs,
		isBlockingIssue: isBlockingDecisionIssue,
	});
}

function hasAnyIssue(
	issues: DecisionExitIssue[],
	codes: DecisionExitIssueCode[],
): boolean {
	return issues.some((issue) => codes.includes(issue.code));
}

function hasKind(rows: DecisionRow[], kind: string): boolean {
	return rows.some((row) => row.decisionKind === kind);
}

function hasCodePrefix(issues: DecisionExitIssue[], prefix: string): boolean {
	return issues.some((issue) => issue.code.startsWith(prefix));
}
