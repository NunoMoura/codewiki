import type {
	ExitCriterionResult,
	LoopQualityStandardResult,
} from "../traces/types.ts";
import type { PlanningExitIssue, PlanningExitIssueCode } from "./exit.ts";

export function planningQualityStandards(
	issues: PlanningExitIssue[],
): LoopQualityStandardResult[] {
	return [
		standard({
			id: "decision_coverage_complete",
			description:
				"Every accepted decision ref is covered by a work unit or explicit resolution.",
			issues,
			codes: ["missing_decision_coverage", "unknown_decision_ref"],
		}),
		standard({
			id: "worker_units_self_contained",
			description:
				"Each work item has enough bounded context to be claimed by one implementation worker.",
			issues,
			codes: ["invalid_work_item", "duplicate_work_item_id"],
		}),
		standard({
			id: "technical_requirements_complete",
			description:
				"Each work item breaks decision intent into concrete technical requirements.",
			issues,
			codes: ["missing_technical_requirements"],
		}),
		standard({
			id: "acceptance_and_verification_testable",
			description:
				"Each work item has stable acceptance criteria and verification refs or commands.",
			issues,
			codes: [
				"invalid_acceptance_criterion",
				"duplicate_acceptance_criterion_id",
				"missing_verification",
			],
		}),
		standard({
			id: "worker_assignment_ready",
			description:
				"Each work item declares worker profile and agent judgment that the unit is independent and implementation-ready.",
			mode: "agent",
			issues,
			codes: [
				"missing_worker_profile",
				"missing_planning_assessment",
				"planning_assessment_not_worker_ready",
			],
		}),
		standard({
			id: "uncertainty_resolved",
			description:
				"No unresolved planning uncertainty remains; decision or user authority is routed instead of leaking into implementation.",
			mode: "agent",
			issues,
			codes: [
				"missing_uncertainty_resolution",
				"unresolved_planning_uncertainty",
			],
		}),
		standard({
			id: "work_unit_right_sized",
			description:
				"Each worker unit is neither sprint-sized nor tiny busywork; sprint remains a grouping or dispatch batch.",
			mode: "agent",
			issues,
			codes: ["missing_right_sizing", "work_unit_not_right_sized"],
		}),
		standard({
			id: "source_ownership_aligned",
			description:
				"Component refs, path scopes, and verification refs align with source ownership contracts.",
			issues,
			codes: [
				"missing_component_ref",
				"unknown_component_ref",
				"invalid_component_contract",
				"path_outside_component_scope",
				"verification_outside_component_tests",
			],
		}),
		standard({
			id: "dependency_order_clear",
			description:
				"Dependencies are known, acyclic, and order overlapping work before implementation.",
			issues,
			codes: ["unknown_dependency", "dependency_cycle", "path_conflict"],
		}),
		standard({
			id: "resolutions_accounted",
			description:
				"Planning resolutions use a known kind, carry required evidence, and route-back resolutions return to decision authority before implementation.",
			issues,
			codes: [
				"invalid_resolution",
				"invalid_resolution_kind",
				"route_back_resolution",
			],
		}),
		standard({
			id: "traceability_refs_canonical",
			description:
				"Planning refs are canonical trace, KB, Git, digest, source, or test refs.",
			issues,
			codes: ["invalid_traceability_ref"],
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

export function planningIssueRefs(issue: PlanningExitIssue): string[] {
	return [issue.decisionRef, issue.workItemId, issue.ref, issue.componentRef]
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
}

function standard(input: {
	id: string;
	description: string;
	issues: PlanningExitIssue[];
	codes: PlanningExitIssueCode[];
	mode?: LoopQualityStandardResult["mode"];
}): LoopQualityStandardResult {
	const matched = input.issues.filter((issue) =>
		input.codes.includes(issue.code),
	);
	return {
		id: input.id,
		status:
			matched.length > 0 && matched.some((issue) => issue.route === "user")
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
			? {
					refs: uniqueStrings(
						matched.flatMap((issue) => planningIssueRefs(issue)),
					),
				}
			: {}),
	};
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
