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
		issue.code === "invalid_approval_ref"
	);
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
