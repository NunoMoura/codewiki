import type {
	ImplementationChange,
	ImplementationExitInput,
} from "../../src/implementation/types.ts";
import type { LabCase } from "../runner/types.ts";
import type { ImplementationLabInput } from "./loop.ts";

export const implementationCases: LabCase<ImplementationLabInput>[] = [
	{
		id: "complete-implementation-evidence",
		loop: "implementation",
		description:
			"Scoped implementation with passing checks, acceptance evidence, and content proof exits.",
		input: {
			plan: { planningRefs: ["trace:PW-1"] },
			implementation: implementationInput(implementationChange()),
		},
		expected: "pass",
		weight: 10,
	},
	{
		id: "shallow-production-assertion",
		loop: "implementation",
		description:
			"Implementation evidence claims production readiness with generic summaries and passing placeholder check.",
		input: {
			plan: { planningRefs: ["trace:PW-1"] },
			implementation: implementationInput(
				implementationChange({
					id: "IC-vague",
					checks: ["npm test"],
					checkResults: [
						{
							command: "npm test",
							status: "pass",
							outputRef: "tests/runtime/readiness-checklist.test.mjs",
							summary: "ok",
						},
					],
					acceptanceEvidence: ["done"],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-1",
							summary: "done",
							evidenceRefs: ["tests/runtime/readiness-checklist.test.mjs"],
						},
					],
					implementationAssessment: {
						stance: "production_ready",
						maintainability: "ok",
						simplicity: "ok",
						projectStyle: "ok",
						errorHandling: "ok",
						uncertainties: [],
						uncertaintyOwner: "none",
						uncertaintyResolution: "ok",
						rationale: "ok",
						concerns: [],
					},
				}),
			),
		},
		expected: "fail",
		weight: 15,
		expectedFailures: [
			{
				standardId: "implementation.check_result_specificity",
				failureClass: "verification",
			},
			{
				standardId: "implementation.acceptance_evidence_specificity",
				failureClass: "evidence",
			},
			{
				standardId: "implementation.assessment_specificity",
				failureClass: "specificity",
			},
		],
	},
	{
		id: "failed-check",
		loop: "implementation",
		description:
			"Implementation with failed recorded check does not exit even if evidence exists.",
		input: {
			plan: { planningRefs: ["trace:PW-1"] },
			implementation: implementationInput(
				implementationChange({
					id: "IC-failed",
					checkResults: [
						{
							command: "npm test",
							status: "fail",
							exitCode: 1,
							outputRef: "tests/runtime/readiness-checklist.test.mjs",
						},
					],
				}),
			),
		},
		expected: "fail",
		weight: 10,
		expectedFailures: [
			{
				standardId: "implementation.production_exit_contract",
				failureClass: "contract",
			},
			{
				standardId: "implementation.checks_and_verification",
				failureClass: "verification",
			},
			{
				standardId: "implementation.check_result_specificity",
				failureClass: "verification",
			},
		],
	},
	{
		id: "missing-content-proof",
		loop: "implementation",
		description:
			"Implementation without content proof fails even when checks and acceptance evidence are present.",
		input: {
			plan: { planningRefs: ["trace:PW-1"] },
			implementation: implementationInput(
				implementationChange({
					id: "IC-no-proof",
					contentProof: undefined,
				}),
			),
		},
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "implementation.production_exit_contract",
				failureClass: "contract",
			},
			{
				standardId: "implementation.change_and_content_proof",
				failureClass: "evidence",
			},
		],
	},
	{
		id: "unknown-acceptance-criterion",
		loop: "implementation",
		description:
			"Implementation evidence that cites an unknown planning criterion fails acceptance coverage.",
		input: {
			plan: { planningRefs: ["trace:PW-1"] },
			implementation: implementationInput(
				implementationChange({
					id: "IC-unknown-criterion",
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-unknown",
							summary:
								"Evidence cites a criterion that planning did not define.",
							evidenceRefs: ["tests/lab/loop-exit-score.test.mjs"],
						},
					],
				}),
			),
		},
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "implementation.production_exit_contract",
				failureClass: "contract",
			},
			{
				standardId: "implementation.acceptance_evidence_coverage",
				failureClass: "traceability",
			},
		],
	},
];

function implementationInput(
	change: ImplementationChange,
): ImplementationExitInput {
	return {
		planningRefs: ["trace:PW-1"],
		changes: [change],
		acceptanceRequirements: [
			{
				planningRef: "trace:PW-1",
				criterionId: "AC-1",
				text: "Loop lab reports pass, gap, or regression for every fixture.",
			},
		],
	};
}

function implementationChange(
	overrides: Partial<ImplementationChange> = {},
): ImplementationChange {
	return {
		id: "IC-good",
		planningRefs: ["trace:PW-1"],
		codePaths: ["src/runtime/types.ts"],
		docPaths: [],
		testPaths: ["tests/lab/loop-exit-score.test.mjs"],
		checks: ["node --experimental-strip-types --test tests/lab/*.test.mjs"],
		checkResults: [
			{
				command: "node --experimental-strip-types --test tests/lab/*.test.mjs",
				status: "pass",
				outputRef: "tests/lab/loop-exit-score.test.mjs",
				summary: "Loop exit lab tests pass.",
			},
		],
		acceptanceEvidence: [
			"Loop exit lab reports pass, gap, and regression statuses for fixtures.",
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-1",
				summary:
					"Loop exit lab reports pass, gap, or regression for every fixture.",
				evidenceRefs: ["tests/lab/loop-exit-score.test.mjs"],
			},
		],
		contentProof: { workingTreeDigest: "sha256:abcdef" },
		implementationAssessment: {
			stance: "production_ready",
			maintainability:
				"Lab fixture code is small, deterministic, and isolated under lab.",
			simplicity:
				"The script reuses existing loop evaluators instead of adding a second standards engine.",
			projectStyle:
				"The lab follows existing package script and node:test conventions.",
			errorHandling: "The gate reports blockers instead of hiding gaps.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved implementation, planning, decision, or user-authority uncertainty remains.",
			rationale:
				"Evidence is sufficient for a deterministic lab harness, not for closing all known loop-quality gaps.",
			concerns: [],
		},
		sensitiveSurfaceAssessment: {
			security: "No security-sensitive behavior changed.",
			privacy: "No private data handling changed.",
			accessibility: "No UI or page behavior changed.",
			dependencyRisk: "No dependency surface changed.",
			rationale: "Touched lab-only code and tests.",
		},
		approvalAuthority: "agent",
		publicationRefs: [],
		...overrides,
	};
}
