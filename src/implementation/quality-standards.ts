import {
	evaluateLoopQualityGraph,
	runLoopQualityGraphEvaluation,
	type LoopQualityJudgeExecutionOptions,
	type RunLoopQualityGraphResult,
} from "../verification/quality/evaluator.ts";
import type { LoopQualityGraph } from "../verification/quality/graph.ts";
import {
	buildLoopQualityStandard,
	criteriaFromQualityStandards,
	type LoopQualityStandardDefinition,
} from "../verification/quality/standards.ts";
import type { LoopQualityStandardResult } from "../changes/trace/types.ts";
import type { ImplementationExitIssue } from "./types.ts";

export { criteriaFromQualityStandards };

export const IMPLEMENTATION_QUALITY_STANDARDS: LoopQualityStandardDefinition<
	ImplementationExitIssue["code"]
>[] = [
	{
		id: "planning_coverage_complete",
		weight: 12,
		description:
			"Every planned work ref is covered by implementation evidence and no unknown planning refs are introduced.",
		codes: ["missing_planning_coverage", "unknown_planning_ref"],
	},
	{
		id: "scope_controlled",
		weight: 12,
		description:
			"Implementation changes stay inside planned component/path scope and existing repo paths.",
		codes: [
			"invalid_change",
			"duplicate_change_id",
			"path_outside_component_scope",
			"missing_changed_path",
		],
	},
	{
		id: "acceptance_evidence_complete",
		weight: 16,
		description:
			"Every planned acceptance criterion is covered by structured evidence refs.",
		codes: [
			"missing_acceptance_evidence",
			"invalid_acceptance_evidence",
			"missing_acceptance_criterion_coverage",
			"unknown_acceptance_criterion",
		],
	},
	{
		id: "verification_passed",
		weight: 18,
		description:
			"Required implementation checks are structured, present, passing, cover planned verification, and package changes include pack verification.",
		codes: [
			"missing_check_results",
			"invalid_check_result",
			"failed_check",
			"missing_planned_verification",
			"missing_package_pack_check",
		],
	},
	{
		id: "tdd_evidence_valid",
		weight: 10,
		description:
			"Required red/green TDD evidence is mapped to planned acceptance criteria.",
		codes: [
			"invalid_tdd_evidence",
			"missing_tdd_red_evidence",
			"missing_tdd_green_evidence",
			"unknown_tdd_criterion",
		],
	},
	{
		id: "content_proof_recorded",
		weight: 14,
		description:
			"Implementation output has change-level and aggregate content proof when required.",
		codes: [
			"missing_content_proof",
			"missing_aggregate_content_proof",
			"worker_proof_failed",
			"worker_proof_conflict",
		],
	},
	{
		id: "worker_claims_correlated",
		weight: 12,
		description:
			"Worker-produced evidence is tied to active runtime claims and completed worker reports.",
		codes: [
			"worker_failed",
			"worker_blocked",
			"missing_worker_claim",
			"unknown_worker_claim",
			"inactive_worker_claim",
			"worker_claim_mismatch",
		],
	},
	{
		id: "source_ownership_aligned",
		weight: 12,
		description:
			"Changed source/test paths align with OKF source ownership and test coverage.",
		codes: [
			"missing_component_ref",
			"unknown_component_ref",
			"invalid_component_contract",
			"missing_component_test_coverage",
			"missing_evidence_path",
		],
	},
	{
		id: "implementation_review_evidence_clean",
		weight: 18,
		description:
			"CodeWiki-owned review evidence has no blocking diagnostics and links acceptance criteria to concrete evidence.",
		codes: [
			"review_blocking_diagnostic",
			"review_missing_acceptance_evidence_link",
		],
	},
	{
		id: "production_quality_reviewed",
		weight: 16,
		mode: "agent",
		description:
			"Agent assessment confirms maintainability, simplicity, project style, and error handling are production-ready.",
		codes: [
			"missing_implementation_assessment",
			"implementation_not_production_ready",
		],
	},
	{
		id: "uncertainty_resolved",
		weight: 14,
		mode: "agent",
		description:
			"No unresolved implementation uncertainty remains; planning, decision, or user authority is routed instead of drifting.",
		codes: [
			"missing_implementation_uncertainty_resolution",
			"unresolved_implementation_uncertainty",
		],
	},
	{
		id: "security_privacy_reviewed",
		weight: 12,
		mode: "agent",
		description:
			"Security/privacy-sensitive changes include explicit review evidence.",
		codes: ["missing_security_privacy_assessment"],
	},
	{
		id: "accessibility_ui_reviewed",
		weight: 8,
		mode: "agent",
		description: "UI/page changes include accessibility review evidence.",
		codes: ["missing_accessibility_assessment"],
	},
	{
		id: "dependency_risk_controlled",
		weight: 8,
		mode: "agent",
		description: "Dependency-surface changes include risk review evidence.",
		codes: ["missing_dependency_risk_assessment"],
	},
	{
		id: "release_safety_approved",
		weight: 20,
		mode: "user",
		description:
			"Release, publication, destructive, or externally visible implementation refs require explicit user approval.",
		codes: ["missing_release_approval", "invalid_release_approval_ref"],
	},
	{
		id: "traceability_refs_canonical",
		weight: 8,
		description:
			"Implementation refs are canonical trace, KB, Git, digest, source, or test refs.",
		codes: ["invalid_traceability_ref"],
	},
];

export function implementationQualityStandards(
	issues: ImplementationExitIssue[],
): LoopQualityStandardResult[] {
	return IMPLEMENTATION_QUALITY_STANDARDS.map((definition) =>
		buildLoopQualityStandard({
			definition,
			issues,
			issueCode: (issue) => issue.code,
			issueMessage: (issue) => issue.message,
			issueRefs: implementationIssueRefs,
			isBlockingIssue: isBlockingImplementationIssue,
		}),
	);
}

export function evaluateImplementationQualityStandards(
	graph: LoopQualityGraph<ImplementationExitIssue["code"]>,
	issues: ImplementationExitIssue[],
): LoopQualityStandardResult[] {
	return evaluateLoopQualityGraph(
		implementationQualityGraphOptions(graph, issues),
	);
}

export function runImplementationQualityStandards(
	graph: LoopQualityGraph<ImplementationExitIssue["code"]>,
	issues: ImplementationExitIssue[],
	judgeOptions: LoopQualityJudgeExecutionOptions = {},
): Promise<RunLoopQualityGraphResult> {
	return runLoopQualityGraphEvaluation({
		...implementationQualityGraphOptions(graph, issues),
		...judgeOptions,
	});
}

function implementationQualityGraphOptions(
	graph: LoopQualityGraph<ImplementationExitIssue["code"]>,
	issues: ImplementationExitIssue[],
) {
	return {
		graph,
		issues,
		issueCode: (issue: ImplementationExitIssue) => issue.code,
		issueMessage: (issue: ImplementationExitIssue) => issue.message,
		issueRefs: implementationIssueRefs,
		isBlockingIssue: isBlockingImplementationIssue,
	};
}

export function implementationIssueRefs(
	issue: ImplementationExitIssue,
): string[] {
	return [
		issue.planningRef,
		issue.changeId,
		issue.claimId,
		issue.ref,
		issue.componentRef,
	]
		.map((ref) => String(ref || "").trim())
		.filter(Boolean);
}

export function isBlockingImplementationIssue(
	issue: ImplementationExitIssue,
): boolean {
	return issue.route === "user";
}
