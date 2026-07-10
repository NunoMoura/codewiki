import {
	evaluateLoopQualityGraph,
	runLoopQualityGraphEvaluation,
	type LoopQualityJudgeExecutionOptions,
	type RunLoopQualityGraphResult,
} from "../loops/evaluator.ts";
import type { LoopQualityGraph } from "../loops/graph.ts";
import {
	buildLoopQualityStandard,
	criteriaFromQualityStandards,
	type LoopQualityStandardDefinition,
} from "../loops/quality-standards.ts";
import type { LoopQualityStandardResult } from "../traces/types.ts";
import type { PlanningExitIssue, PlanningExitIssueCode } from "./loop.ts";

export { criteriaFromQualityStandards };

export const PLANNING_QUALITY_STANDARDS: LoopQualityStandardDefinition<PlanningExitIssueCode>[] =
	[
		{
			id: "decision_coverage_complete",
			weight: 12,
			description:
				"Every Decision ref is covered by a Task or explicit resolution.",
			codes: ["missing_decision_coverage", "unknown_decision_ref"],
		},
		{
			id: "worker_units_self_contained",
			weight: 12,
			description:
				"Each Task has enough bounded context to be assigned to one implementation worker.",
			codes: ["invalid_work_item", "duplicate_work_item_id"],
		},
		{
			id: "technical_requirements_complete",
			weight: 12,
			description:
				"Each Task breaks Decision intent into concrete technical requirements.",
			codes: ["missing_technical_requirements"],
		},
		{
			id: "acceptance_and_verification_testable",
			weight: 14,
			description:
				"Each Task has stable acceptance criteria and verification refs or commands.",
			codes: [
				"invalid_acceptance_criterion",
				"duplicate_acceptance_criterion_id",
				"missing_verification",
			],
		},
		{
			id: "planning_depth_accounted",
			weight: 8,
			description:
				"Each Task declares standard or micro planning depth; micro-plans stay dependency-free and cover one Decision.",
			codes: [
				"invalid_planning_depth",
				"invalid_micro_plan_dependency",
				"invalid_micro_plan_decision_count",
			],
		},
		{
			id: "worker_assignment_ready",
			weight: 12,
			mode: "agent",
			description:
				"Each Task declares worker profile and agent judgment that it is independent and implementation-ready.",
			codes: [
				"missing_worker_profile",
				"missing_planning_assessment",
				"planning_assessment_not_worker_ready",
			],
		},
		{
			id: "uncertainty_resolved",
			weight: 12,
			mode: "agent",
			description:
				"No unresolved planning uncertainty remains; decision or user authority is routed instead of leaking into implementation.",
			codes: [
				"missing_uncertainty_resolution",
				"unresolved_planning_uncertainty",
			],
		},
		{
			id: "work_unit_right_sized",
			weight: 10,
			mode: "agent",
			description:
				"Each Task is neither Sprint-sized nor tiny busywork; the Sprint remains the Decision bundle.",
			codes: ["missing_right_sizing", "work_unit_not_right_sized"],
		},
		{
			id: "source_ownership_aligned",
			weight: 12,
			description:
				"Component refs, path scopes, and verification refs align with source ownership contracts.",
			codes: [
				"missing_component_ref",
				"unknown_component_ref",
				"invalid_component_contract",
				"path_outside_component_scope",
				"verification_outside_component_tests",
			],
		},
		{
			id: "dependency_order_clear",
			weight: 14,
			description:
				"Dependencies are known, acyclic, and order overlapping work before implementation.",
			codes: ["unknown_dependency", "dependency_cycle", "path_conflict"],
		},
		{
			id: "triggers_valid",
			weight: 8,
			description:
				"Recurring, triggered, or hook-based work has a complete planned trigger before runtime can heartbeat or start runs from it.",
			codes: [
				"invalid_trigger",
				"invalid_trigger_kind",
				"invalid_trigger_run_mode",
				"invalid_trigger_concurrency",
			],
		},
		{
			id: "resolutions_accounted",
			weight: 10,
			description:
				"Planning resolutions use a known kind, carry required evidence, and route-back resolutions return to decision authority before implementation.",
			codes: [
				"invalid_resolution",
				"invalid_resolution_kind",
				"route_back_resolution",
			],
		},
		{
			id: "traceability_refs_canonical",
			weight: 8,
			description:
				"Planning refs are canonical trace, KB, Git, digest, source, or test refs.",
			codes: ["invalid_traceability_ref"],
		},
	];

export function planningQualityStandards(
	issues: PlanningExitIssue[],
): LoopQualityStandardResult[] {
	return PLANNING_QUALITY_STANDARDS.map((definition) =>
		buildLoopQualityStandard({
			definition,
			issues,
			issueCode: (issue) => issue.code,
			issueMessage: (issue) => issue.message,
			issueRefs: planningIssueRefs,
			isBlockingIssue: isBlockingPlanningIssue,
		}),
	);
}

export function evaluatePlanningQualityStandards(
	graph: LoopQualityGraph<PlanningExitIssueCode>,
	issues: PlanningExitIssue[],
): LoopQualityStandardResult[] {
	return evaluateLoopQualityGraph(planningQualityGraphOptions(graph, issues));
}

export function runPlanningQualityStandards(
	graph: LoopQualityGraph<PlanningExitIssueCode>,
	issues: PlanningExitIssue[],
	judgeOptions: LoopQualityJudgeExecutionOptions = {},
): Promise<RunLoopQualityGraphResult> {
	return runLoopQualityGraphEvaluation({
		...planningQualityGraphOptions(graph, issues),
		...judgeOptions,
	});
}

function planningQualityGraphOptions(
	graph: LoopQualityGraph<PlanningExitIssueCode>,
	issues: PlanningExitIssue[],
) {
	return {
		graph,
		issues,
		issueCode: (issue: PlanningExitIssue) => issue.code,
		issueMessage: (issue: PlanningExitIssue) => issue.message,
		issueRefs: planningIssueRefs,
		isBlockingIssue: isBlockingPlanningIssue,
	};
}

export function planningIssueRefs(issue: PlanningExitIssue): string[] {
	return [issue.decisionRef, issue.workItemId, issue.ref, issue.componentRef]
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
}

export function isBlockingPlanningIssue(issue: PlanningExitIssue): boolean {
	return issue.route === "user";
}
