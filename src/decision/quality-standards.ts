import type {
	ExitCriterionResult,
	LoopQualityStandardResult,
} from "../traces/types.ts";
import type { DecisionExitIssue, DecisionExitIssueCode } from "./exit.ts";
import type { DecisionRow } from "./types.ts";

export function decisionQualityStandards(
	issues: DecisionExitIssue[],
	approvedRows: DecisionRow[],
): LoopQualityStandardResult[] {
	const standards = [
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
			id: "user_value_clear",
			description:
				"Approved rows explain how the intention benefits users or improves user outcomes.",
			issues,
			codes: ["missing_user_impact"],
		}),
		standard({
			id: "cost_understood",
			description:
				"Approved rows expose maintainer impact and a bounded effort estimate.",
			issues,
			codes: ["missing_maintainer_impact", "missing_effort", "invalid_effort"],
		}),
		standard({
			id: "work_routing_classified",
			description:
				"Approved rows classify work scale and choose micro or standard planning before planning handoff.",
			issues,
			codes: [
				"missing_work_scale",
				"invalid_work_scale",
				"missing_planning_depth",
				"invalid_planning_depth",
				"invalid_micro_plan_scale",
				"invalid_micro_plan_risk",
			],
		}),
		standard({
			id: "recommendation_justified",
			description:
				"The agent gives a clear approve/reject/defer/ask-user recommendation and explains why approved rows should proceed.",
			issues,
			codes: [
				"missing_recommendation",
				"invalid_recommendation",
				"recommendation_not_approve",
				"missing_recommendation_rationale",
			],
		}),
		standard({
			id: "intention_validated",
			description:
				"The agent judges that the user's good-faith intention is aligned with real user value and the project's long-term interests.",
			mode: "agent",
			issues,
			codes: ["missing_agent_assessment", "agent_assessment_not_aligned"],
		}),
		standard({
			id: "approval_safety",
			description:
				"High-risk approved rows have explicit user approval authority and a canonical approval ref.",
			issues,
			codes: ["missing_high_risk_approval", "invalid_approval_ref"],
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
				"Approved rows declare a valid risk tier; high-risk intentions identify affected layers and alternatives before implementation work is planned.",
			issues,
			codes: [
				"missing_risk",
				"invalid_risk",
				"missing_high_risk_scope",
				"missing_high_risk_alternative",
			],
		}),
		standard({
			id: "active_trace_conflicts_resolved",
			description:
				"Approved rows do not conflict with active trace goals unless the conflict is merged, superseded, deferred, or otherwise resolved.",
			issues,
			codes: ["active_trace_conflict"],
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
	return [...standards, ...decisionKindQualityStandards(issues, approvedRows)];
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
			standard({
				id: "decision_kind_classified",
				description:
					"Approved rows classify the decision kind so kind-specific quality can apply inside the decision loop.",
				issues,
				codes: ["missing_decision_kind", "invalid_decision_kind"],
			}),
		);
	}
	if (
		hasKind(approvedRows, "debug") ||
		hasCodePrefix(issues, "missing_debug_")
	) {
		standards.push(
			standard({
				id: "debug_decision_focused",
				description:
					"Debug decisions name target, hypothesis, invariant, probe, expected safe behavior, and stop condition.",
				issues,
				codes: [
					"missing_debug_target",
					"missing_debug_hypothesis",
					"missing_debug_invariant",
					"missing_debug_probe",
					"missing_debug_expected_safe_behavior",
					"missing_debug_stop_condition",
				],
			}),
		);
	}
	if (hasKind(approvedRows, "fix") || hasCodePrefix(issues, "missing_fix_")) {
		standards.push(
			standard({
				id: "fix_decision_reproducible",
				description:
					"Fix decisions identify reproduction, expected behavior, and regression coverage.",
				issues,
				codes: [
					"missing_fix_reproduction",
					"missing_fix_expected_behavior",
					"missing_fix_regression_plan",
				],
			}),
		);
	}
	if (
		hasKind(approvedRows, "harden") ||
		hasCodePrefix(issues, "missing_harden_")
	) {
		standards.push(
			standard({
				id: "harden_decision_boundary",
				description:
					"Hardening decisions define the safety boundary, failure modes, negative tests, and compatibility impact.",
				issues,
				codes: [
					"missing_harden_boundary",
					"missing_harden_failure_modes",
					"missing_harden_negative_test_plan",
					"missing_harden_compatibility_impact",
				],
			}),
		);
	}
	if (
		hasKind(approvedRows, "improve") ||
		hasCodePrefix(issues, "missing_improve_")
	) {
		standards.push(
			standard({
				id: "improve_decision_outcome",
				description:
					"Improvement decisions describe current pain, desired outcome, success signal, and non-goals.",
				issues,
				codes: [
					"missing_improve_current_pain",
					"missing_improve_desired_outcome",
					"missing_improve_success_signal",
					"missing_improve_non_goals",
				],
			}),
		);
	}
	if (
		hasKind(approvedRows, "migrate") ||
		hasCodePrefix(issues, "missing_migrate_")
	) {
		standards.push(
			standard({
				id: "migrate_decision_equivalent",
				description:
					"Migration decisions describe source/target behavior, preserved invariants, equivalence proof, and rollback strategy.",
				issues,
				codes: [
					"missing_migrate_source_behavior",
					"missing_migrate_target_behavior",
					"missing_migrate_preserved_invariants",
					"missing_migrate_equivalence_proof",
					"missing_migrate_rollback_plan",
				],
			}),
		);
	}
	return standards;
}

export function criteriaFromQualityStandards(
	standards: LoopQualityStandardResult[],
): ExitCriterionResult[] {
	return standards.map((standardResult) => ({
		id: standardResult.id,
		status:
			standardResult.status === "met"
				? "pass"
				: standardResult.status === "blocked"
					? "block"
					: "fail",
		...(standardResult.message ? { message: standardResult.message } : {}),
		...(standardResult.refs ? { refs: standardResult.refs } : {}),
	}));
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

function standard(input: {
	id: string;
	description: string;
	issues: DecisionExitIssue[];
	codes: DecisionExitIssueCode[];
	evidenceRefs?: string[];
	mode?: LoopQualityStandardResult["mode"];
}): LoopQualityStandardResult {
	const matched = input.issues.filter((issue) =>
		input.codes.includes(issue.code),
	);
	return {
		id: input.id,
		status:
			matched.length > 0 && matched.some(isBlockingDecisionIssue)
				? "blocked"
				: matched.length > 0
					? "unmet"
					: "met",
		mode: input.mode || "deterministic",
		description: input.description,
		...(matched.length > 0
			? { message: matched.map((issue) => issue.message).join(" ") }
			: {}),
		...(matched.length > 0
			? { refs: unique(matched.flatMap((issue) => decisionIssueRefs(issue))) }
			: {}),
		...(input.evidenceRefs && input.evidenceRefs.length > 0
			? { evidenceRefs: unique(input.evidenceRefs) }
			: {}),
	};
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
