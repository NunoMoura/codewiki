import {
	collectImplementationExitIssues,
	evaluateImplementationExit,
} from "../../src/implementation/loop.ts";
import type {
	ImplementationChange,
	ImplementationExitInput,
	ImplementationExitIssue,
	ImplementationExitIssueCode,
	ImplementationExitResult,
} from "../../src/implementation/types.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface ImplementationLabInput {
	plan: unknown;
	implementation: ImplementationExitInput;
}

export const implementationLoopStandards: LabStandard<ImplementationLabInput>[] =
	[
		{
			id: "implementation.production_exit_contract",
			mode: "deterministic",
			weight: 20,
			cost: 20,
			method: "deterministic",
			standardType: "loop_contract",
			layer: "hard_gate",
			repairTarget: "implementation",
			description:
				"Production implementation exit contract must still pass before the lab candidate can exit.",
			evaluate(input) {
				const exit = evaluateImplementationExit(input.implementation);
				return productionExitResult(
					"implementation.production_exit_contract",
					exit,
				);
			},
		},
		implementationIssueCodeStandard({
			id: "implementation.planning_coverage_traceability",
			weight: 10,
			cost: 10,
			standardType: "trace_fidelity",
			description:
				"Implementation evidence must cover known planning refs and preserve valid traceability refs.",
			codes: [
				"missing_planning_coverage",
				"unknown_planning_ref",
				"invalid_traceability_ref",
			],
		}),
		implementationIssueCodeStandard({
			id: "implementation.worker_result_integrity",
			weight: 8,
			cost: 8,
			standardType: "loop_contract",
			description:
				"Implementation must preserve worker result contracts, claim lineage, and aggregate proof boundaries.",
			codes: [
				"missing_worker_claim",
				"unknown_worker_claim",
				"inactive_worker_claim",
				"worker_claim_mismatch",
				"worker_blocked",
				"worker_failed",
				"worker_proof_failed",
				"worker_proof_conflict",
				"missing_aggregate_content_proof",
			],
		}),
		implementationIssueCodeStandard({
			id: "implementation.change_and_content_proof",
			weight: 10,
			cost: 10,
			standardType: "evidence_quality",
			description:
				"Implementation changes must include valid changed paths, evidence paths, content proof, and duplicate-free IDs.",
			codes: [
				"invalid_change",
				"duplicate_change_id",
				"missing_changed_path",
				"missing_evidence_path",
				"missing_content_proof",
			],
		}),
		implementationIssueCodeStandard({
			id: "implementation.checks_and_verification",
			weight: 10,
			cost: 10,
			standardType: "robustness",
			description:
				"Implementation must provide valid passing checks, planned verification coverage, and package pack proof when needed.",
			codes: [
				"missing_check_results",
				"invalid_check_result",
				"failed_check",
				"missing_planned_verification",
				"missing_package_pack_check",
				"invalid_tdd_evidence",
				"missing_tdd_red_evidence",
				"missing_tdd_green_evidence",
				"unknown_tdd_criterion",
			],
		}),
		implementationIssueCodeStandard({
			id: "implementation.acceptance_evidence_coverage",
			weight: 10,
			cost: 10,
			standardType: "evidence_quality",
			description:
				"Implementation evidence must map acceptance evidence back to known planning criteria.",
			codes: [
				"missing_acceptance_evidence",
				"invalid_acceptance_evidence",
				"missing_acceptance_criterion_coverage",
				"unknown_acceptance_criterion",
			],
		}),
		implementationIssueCodeStandard({
			id: "implementation.component_path_alignment",
			weight: 10,
			cost: 10,
			standardType: "scope_control",
			description:
				"Implementation changed paths and tests must stay inside declared component and planning scopes.",
			codes: [
				"missing_component_ref",
				"unknown_component_ref",
				"invalid_component_contract",
				"path_outside_component_scope",
				"missing_component_test_coverage",
			],
		}),
		implementationIssueCodeStandard({
			id: "implementation.production_readiness_assessment",
			weight: 8,
			cost: 8,
			standardType: "project_fit",
			description:
				"Implementation must include production-readiness, uncertainty, safety, and release authority assessments.",
			codes: [
				"missing_implementation_assessment",
				"implementation_not_production_ready",
				"missing_implementation_uncertainty_resolution",
				"unresolved_implementation_uncertainty",
				"missing_security_privacy_assessment",
				"missing_accessibility_assessment",
				"missing_dependency_risk_assessment",
				"missing_release_approval",
				"invalid_release_approval_ref",
			],
		}),
		implementationSpecificityStandard({
			id: "implementation.check_result_specificity",
			weight: 6,
			cost: 6,
			standardType: "evidence_quality",
			description:
				"Passing check summaries must name the command result and what behavior the check verified.",
			fields(change) {
				return change.checkResults.map((result, index) => ({
					label: `checkResults[${index}].summary`,
					value: result.summary || "",
					kind: "summary" as const,
				}));
			},
		}),
		implementationSpecificityStandard({
			id: "implementation.acceptance_evidence_specificity",
			weight: 8,
			cost: 8,
			standardType: "evidence_quality",
			description:
				"Acceptance evidence must explain how concrete evidence satisfies the planned acceptance criteria.",
			fields(change) {
				return [
					...change.acceptanceEvidence.map((value, index) => ({
						label: `acceptanceEvidence[${index}]`,
						value,
						kind: "summary" as const,
					})),
					...change.acceptanceEvidenceItems.map((item, index) => ({
						label: `acceptanceEvidenceItems[${index}].summary`,
						value: item.summary,
						kind: "summary" as const,
					})),
				];
			},
		}),
		implementationSpecificityStandard({
			id: "implementation.assessment_specificity",
			weight: 6,
			cost: 6,
			standardType: "maintainability",
			description:
				"Implementation assessment must justify maintainability, simplicity, style, error handling, uncertainty, and rationale.",
			fields(change) {
				return [
					{
						label: "implementationAssessment.maintainability",
						value: change.implementationAssessment.maintainability,
						kind: "assessment" as const,
					},
					{
						label: "implementationAssessment.simplicity",
						value: change.implementationAssessment.simplicity,
						kind: "assessment" as const,
					},
					{
						label: "implementationAssessment.projectStyle",
						value: change.implementationAssessment.projectStyle,
						kind: "assessment" as const,
					},
					{
						label: "implementationAssessment.errorHandling",
						value: change.implementationAssessment.errorHandling,
						kind: "assessment" as const,
					},
					{
						label: "implementationAssessment.uncertaintyResolution",
						value: change.implementationAssessment.uncertaintyResolution,
						kind: "assessment" as const,
					},
					{
						label: "implementationAssessment.rationale",
						value: change.implementationAssessment.rationale,
						kind: "assessment" as const,
					},
				];
			},
		}),
	];

export const implementationLoopCandidate = {
	loop: "implementation",
	metric: "IEC",
	graphId: "implementation.loop.lab",
	graphVersion: "0.3.0.lab.2",
	schemaVersion: 3,
	layers: [
		"hard_gate",
		"input_contract",
		"trace_fidelity",
		"coverage",
		"scope_control",
		"evidence_quality",
		"risk_authority",
		"project_fit",
		"repairability",
		"pipeline_carryover",
		"exit_loss",
	],
	standards: implementationLoopStandards,
} satisfies LabCandidateStandards<ImplementationLabInput>;

function implementationIssueCodeStandard({
	id,
	weight,
	cost,
	standardType,
	description,
	codes,
}: {
	id: string;
	weight: number;
	cost: number;
	standardType: LabStandard<ImplementationLabInput>["standardType"];
	description: string;
	codes: ImplementationExitIssueCode[];
}): LabStandard<ImplementationLabInput> {
	const codeSet = new Set(codes);
	return {
		id,
		mode: "deterministic",
		weight,
		cost,
		method: "deterministic",
		standardType,
		layer: "input_contract",
		repairTarget: "implementation",
		description,
		evaluate(input) {
			const failures = collectImplementationExitIssues(
				input.implementation,
			).filter((issue) => codeSet.has(issue.code));
			return {
				id,
				mode: "deterministic" as const,
				weight,
				cost,
				passed: failures.length === 0,
				route: "fail" as const,
				description,
				method: "deterministic" as const,
				standardType,
				layer: "input_contract" as const,
				repairTarget: "implementation" as const,
				score: failures.length === 0 ? 0 : 1,
				evidence: issueEvidence(failures),
				...(failures.length > 0 ? { message: issueMessage(failures) } : {}),
			};
		},
	};
}

function implementationSpecificityStandard({
	id,
	weight,
	cost,
	standardType,
	description,
	fields,
}: {
	id: string;
	weight: number;
	cost: number;
	standardType: LabStandard<ImplementationLabInput>["standardType"];
	description: string;
	fields(change: ImplementationChange): SpecificityField[];
}): LabStandard<ImplementationLabInput> {
	return {
		id,
		mode: "deterministic",
		weight,
		cost,
		method: "deterministic",
		standardType,
		layer: "evidence_quality",
		repairTarget: "implementation",
		description,
		evaluate(input) {
			const failures = implementationSpecificityFailures(
				input.implementation.changes,
				fields,
			);
			return {
				id,
				mode: "deterministic" as const,
				weight,
				cost,
				passed: failures.weakFields === 0,
				route: "fail" as const,
				description,
				method: "deterministic" as const,
				standardType,
				layer: "evidence_quality" as const,
				repairTarget: "implementation" as const,
				score:
					failures.totalFields === 0
						? 0
						: failures.weakFields / failures.totalFields,
				evidence: failures.messages.map((message) => ({
					kind: "implementation-field",
					ref: id,
					summary: message,
				})),
				...(failures.messages.length > 0
					? { message: failures.messages.join(" ") }
					: {}),
			};
		},
	};
}

interface SpecificityField {
	label: string;
	value: string;
	kind: "summary" | "assessment";
}

function implementationSpecificityFailures(
	changes: ImplementationExitInput["changes"],
	fieldsForChange: (change: ImplementationChange) => SpecificityField[],
): { messages: string[]; totalFields: number; weakFields: number } {
	let totalFields = 0;
	let weakFields = 0;
	const messages: string[] = [];
	for (const change of changes) {
		const fields = fieldsForChange(change);
		totalFields += fields.length;
		const weakLabels = fields
			.filter((field) => isWeakImplementationText(field.value, field.kind))
			.map((field) => field.label);
		weakFields += weakLabels.length;
		if (weakLabels.length > 0) {
			messages.push(
				`Implementation change ${change.id} has shallow evidence fields: ${weakLabels.join(", ")}.`,
			);
		}
	}
	return { messages, totalFields, weakFields };
}

function isWeakImplementationText(value: string, kind: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (GENERIC_IMPLEMENTATION_TEXT.has(normalized)) return true;
	const words = meaningfulWords(normalized);
	const minimumWords = kind === "summary" ? 5 : 4;
	return words.length < minimumWords || new Set(words).size < 3;
}

function meaningfulWords(value: string): string[] {
	return value
		.split(/[^a-z0-9-]+/)
		.filter((word) => word.length > 2)
		.filter((word) => !GENERIC_IMPLEMENTATION_WORDS.has(word));
}

function productionExitResult(id: string, exit: ImplementationExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 20,
		cost: 20,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production implementation exit contract.",
		method: "deterministic" as const,
		standardType: "loop_contract" as const,
		layer: "hard_gate" as const,
		repairTarget: "implementation" as const,
		score: exit.verdict === "pass" ? 0 : 1,
		evidence: issueEvidence(exit.issues),
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}

function issueEvidence(issues: ImplementationExitIssue[]) {
	return issues.map((issue) => ({
		kind: "implementation-issue",
		ref: issue.changeId ? `${issue.code}:${issue.changeId}` : issue.code,
		summary: issue.message,
	}));
}

function issueMessage(issues: ImplementationExitIssue[]): string {
	return issues.map((issue) => issue.message).join(" ");
}

const GENERIC_IMPLEMENTATION_TEXT = new Set([
	"done",
	"good",
	"ok",
	"passes",
	"ready",
	"tested",
	"works",
]);

const GENERIC_IMPLEMENTATION_WORDS = new Set([
	"and",
	"for",
	"the",
	"this",
	"that",
	"with",
]);
