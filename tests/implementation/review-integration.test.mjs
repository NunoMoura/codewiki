import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateImplementationExit } from "../../src/implementation/loop.ts";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

const planningRef =
	"trace:TRACE-implementation-review-integration:planning:iteration:1#work:WU-001";

function baseExitInput(overrides = {}) {
	const change = {
		id: "IC-001",
		planningRefs: [planningRef],
		codePaths: ["src/feature.ts"],
		docPaths: [],
		testPaths: ["tests/feature.test.ts"],
		publicationRefs: [],
		checks: ["npm test"],
		checkResults: [
			{
				command: "npm test",
				status: "pass",
				outputRef: "tests/feature.test.ts",
			},
		],
		acceptanceEvidenceItems: [
			{
				criterionId: "AC-001",
				summary: "Feature behavior is covered by tests.",
				evidenceRefs: ["tests/feature.test.ts"],
			},
		],
		contentProof: { workingTreeDigest: "sha256:abc123" },
		...implementationQualityFields(),
	};
	return {
		planningRefs: [planningRef],
		acceptanceRequirements: [
			{
				planningRef,
				criterionId: "AC-001",
				text: "Feature behavior is covered.",
			},
		],
		planningScopes: [
			{
				planningRef,
				workUnitId: "WU-001",
				componentRefs: [],
				pathScopes: ["src/feature.ts", "tests/feature.test.ts"],
				verification: ["npm test"],
			},
		],
		changes: [change],
		...overrides,
	};
}

describe("implementation review evidence integration", () => {
	it("fails implementation exit on blocking review diagnostics", () => {
		const result = evaluateImplementationExit(
			baseExitInput({
				reviewEvidenceReports: [
					{
						changedPaths: ["src/feature.ts"],
						diagnostics: [
							{
								path: "src/feature.ts",
								severity: "error",
								message: "Type mismatch.",
								ruleId: "TS2322",
							},
						],
						evidenceLinks: [
							{
								kind: "acceptance",
								targetRef: planningRef,
								criterionId: "AC-001",
								evidenceRefs: ["tests/feature.test.ts"],
							},
						],
					},
				],
			}),
		);

		assert.equal(result.passed, false);
		assert.equal(
			result.issues.some(
				(issue) => issue.code === "review_blocking_diagnostic",
			),
			true,
		);
	});

	it("fails implementation exit when review evidence lacks acceptance links", () => {
		const result = evaluateImplementationExit(
			baseExitInput({
				reviewEvidenceReports: [
					{
						changedPaths: ["src/feature.ts"],
						checks: [
							{
								command: "npm test",
								status: "pass",
								outputRef: "tests/feature.test.ts",
							},
						],
					},
				],
			}),
		);

		assert.equal(result.passed, false);
		assert.equal(
			result.issues.some(
				(issue) => issue.code === "review_missing_acceptance_evidence_link",
			),
			true,
		);
	});

	it("passes implementation exit when review evidence is clean and linked", () => {
		const result = evaluateImplementationExit(
			baseExitInput({
				reviewEvidenceReports: [
					{
						changedPaths: ["src/feature.ts"],
						checks: [
							{
								command: "npm test",
								status: "pass",
								outputRef: "tests/feature.test.ts",
							},
						],
						evidenceLinks: [
							{
								kind: "acceptance",
								targetRef: planningRef,
								criterionId: "AC-001",
								evidenceRefs: ["tests/feature.test.ts"],
							},
						],
					},
				],
			}),
		);

		assert.equal(result.passed, true);
		assert.equal(
			result.qualityStandards.some(
				(standard) => standard.id === "implementation_review_evidence_clean",
			),
			true,
		);
	});
});
