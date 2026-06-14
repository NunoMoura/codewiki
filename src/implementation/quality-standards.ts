import type {
	ExitCriterionResult,
	LoopQualityStandardResult,
} from "../traces/types.ts";
import type { ImplementationExitIssue } from "./types.ts";

export function implementationQualityStandards(
	issues: ImplementationExitIssue[],
): LoopQualityStandardResult[] {
	return [
		standard({
			id: "planning_coverage_complete",
			description:
				"Every planned work ref is covered by implementation evidence and no unknown planning refs are introduced.",
			issues,
			codes: ["missing_planning_coverage", "unknown_planning_ref"],
		}),
		standard({
			id: "scope_controlled",
			description:
				"Implementation changes stay inside planned component/path scope and existing repo paths.",
			issues,
			codes: [
				"invalid_change",
				"duplicate_change_id",
				"path_outside_component_scope",
				"missing_changed_path",
			],
		}),
		standard({
			id: "acceptance_evidence_complete",
			description:
				"Every planned acceptance criterion is covered by structured evidence refs.",
			issues,
			codes: [
				"missing_acceptance_evidence",
				"invalid_acceptance_evidence",
				"missing_acceptance_criterion_coverage",
				"unknown_acceptance_criterion",
			],
		}),
		standard({
			id: "verification_passed",
			description:
				"Required implementation checks are structured, present, and passing.",
			issues,
			codes: ["missing_check_results", "invalid_check_result", "failed_check"],
		}),
		standard({
			id: "tdd_evidence_valid",
			description:
				"Required red/green TDD evidence is mapped to planned acceptance criteria.",
			issues,
			codes: [
				"invalid_tdd_evidence",
				"missing_tdd_red_evidence",
				"missing_tdd_green_evidence",
				"unknown_tdd_criterion",
			],
		}),
		standard({
			id: "content_proof_recorded",
			description:
				"Implementation output has change-level and aggregate content proof when required.",
			issues,
			codes: ["missing_content_proof", "missing_aggregate_content_proof"],
		}),
		standard({
			id: "worker_claims_correlated",
			description:
				"Worker-produced evidence is tied to active runtime claims and completed worker results.",
			issues,
			codes: [
				"worker_failed",
				"worker_blocked",
				"missing_worker_claim",
				"unknown_worker_claim",
				"inactive_worker_claim",
				"worker_claim_mismatch",
			],
		}),
		standard({
			id: "source_ownership_aligned",
			description:
				"Changed source/test paths align with file-structure component ownership and test coverage.",
			issues,
			codes: [
				"missing_component_ref",
				"unknown_component_ref",
				"invalid_component_contract",
				"missing_component_test_coverage",
				"missing_evidence_path",
			],
		}),
		standard({
			id: "production_quality_reviewed",
			description:
				"Agent assessment confirms maintainability, simplicity, project style, and error handling are production-ready.",
			mode: "agent",
			issues,
			codes: [
				"missing_implementation_assessment",
				"implementation_not_production_ready",
			],
		}),
		standard({
			id: "uncertainty_resolved",
			description:
				"No unresolved implementation uncertainty remains; planning, decision, or user authority is routed instead of drifting.",
			mode: "agent",
			issues,
			codes: [
				"missing_implementation_uncertainty_resolution",
				"unresolved_implementation_uncertainty",
			],
		}),
		standard({
			id: "security_privacy_reviewed",
			description:
				"Security/privacy-sensitive changes include explicit review evidence.",
			mode: "agent",
			issues,
			codes: ["missing_security_privacy_assessment"],
		}),
		standard({
			id: "accessibility_ui_reviewed",
			description: "UI/page changes include accessibility review evidence.",
			mode: "agent",
			issues,
			codes: ["missing_accessibility_assessment"],
		}),
		standard({
			id: "dependency_risk_controlled",
			description: "Dependency-surface changes include risk review evidence.",
			mode: "agent",
			issues,
			codes: ["missing_dependency_risk_assessment"],
		}),
		standard({
			id: "release_safety_approved",
			description:
				"Release, publication, destructive, or externally visible implementation refs require explicit user approval.",
			mode: "user",
			issues,
			codes: ["missing_release_approval", "invalid_release_approval_ref"],
		}),
		standard({
			id: "traceability_refs_canonical",
			description:
				"Implementation refs are canonical trace, KB, Git, digest, source, or test refs.",
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

function standard(input: {
	id: string;
	description: string;
	issues: ImplementationExitIssue[];
	codes: ImplementationExitIssue["code"][];
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
						matched.flatMap((issue) => implementationIssueRefs(issue)),
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
