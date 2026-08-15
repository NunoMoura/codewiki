import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createImplementationEvidenceReport,
	evaluateCommonReviewEvidence,
} from "../../../src/execution/review/index.ts";

const requirement = {
	planningRef:
		"trace:TRACE-owned-implementation-review-sprint:planning:iteration:3#work:WU-common-exit-quality-nodes",
	criterionId: "AC-001",
	text: "Review evidence must prove acceptance coverage.",
};

describe("implementation common exit quality nodes", () => {
	it("blocks normalized blocking diagnostics", () => {
		const report = createImplementationEvidenceReport({
			changedPaths: ["src/index.ts"],
			diagnostics: [
				{
					path: "src/index.ts",
					severity: "error",
					message: "Type mismatch.",
					ruleId: "TS2322",
				},
			],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef: requirement.planningRef,
					criterionId: requirement.criterionId,
					evidenceRefs: ["tests/execution/review/review-quality-nodes.test.mjs"],
				},
			],
		});

		const result = evaluateCommonReviewEvidence({
			report,
			acceptanceRequirements: [requirement],
		});

		assert.equal(result.passed, false);
		assert.equal(result.findings[0].code, "review_blocking_diagnostic");
		assert.equal(result.score, 70);
	});

	it("blocks when a passing tool check lacks acceptance evidence links", () => {
		const report = createImplementationEvidenceReport({
			changedPaths: ["src/index.ts"],
			checks: [
				{
					command: "npm run typecheck",
					status: "pass",
					outputRef: "tsconfig.json",
				},
			],
		});

		const result = evaluateCommonReviewEvidence({
			report,
			acceptanceRequirements: [requirement],
		});

		assert.equal(result.passed, false);
		assert.equal(
			result.findings[0].code,
			"review_missing_acceptance_evidence_link",
		);
		assert.match(result.findings[0].message, /does not link acceptance/);
	});

	it("passes when acceptance criteria link to concrete evidence", () => {
		const report = createImplementationEvidenceReport({
			changedPaths: ["src/index.ts"],
			checks: [
				{
					command: "npm run typecheck",
					status: "pass",
					outputRef: "tests/execution/review/review-quality-nodes.test.mjs",
				},
			],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef: requirement.planningRef,
					criterionId: requirement.criterionId,
					evidenceRefs: ["tests/execution/review/review-quality-nodes.test.mjs"],
				},
			],
		});

		const result = evaluateCommonReviewEvidence({
			report,
			acceptanceRequirements: [requirement],
			requireRelevantChecks: true,
		});

		assert.equal(result.passed, true);
		assert.equal(result.score, 100);
		assert.deepEqual(result.findings, []);
	});

	it("warns for passing checks with no linked output evidence", () => {
		const report = createImplementationEvidenceReport({
			changedPaths: ["src/index.ts"],
			checks: [
				{ command: "npm test", status: "pass", outputRef: "tmp/log.txt" },
			],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef: requirement.planningRef,
					criterionId: requirement.criterionId,
					evidenceRefs: ["tests/execution/review/review-quality-nodes.test.mjs"],
				},
			],
		});

		const result = evaluateCommonReviewEvidence({
			report,
			acceptanceRequirements: [requirement],
			requireRelevantChecks: true,
		});

		assert.equal(result.passed, true);
		assert.equal(result.findings[0].code, "review_irrelevant_check");
		assert.equal(result.score, 90);
	});
});
