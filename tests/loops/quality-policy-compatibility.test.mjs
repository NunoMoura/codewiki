import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLegacyQualityCompatibility } from "../../src/loops/quality-policy-compatibility.ts";
import { assertValidQualityPolicyResolution } from "../../src/loops/quality-policy.ts";

const CANDIDATE_DIGEST = `sha256:${"d".repeat(64)}`;
const SELECTOR_DIGEST = `sha256:${"e".repeat(64)}`;

function legacyStandards() {
	return [
		{
			id: "input_valid",
			status: "met",
			mode: "deterministic",
			description: "Input is valid.",
			method: "deterministic",
			gate: "hard",
			score: 100,
			scoreThreshold: 100,
			repairTarget: "decision",
			refs: ["trace:input"],
		},
		{
			id: "evidence_reviewed",
			status: "unmet",
			mode: "agent",
			description: "Evidence is reviewed.",
			method: "model_judge",
			gate: "soft",
			score: 40,
			scoreThreshold: 80,
			repairTarget: "implementation",
			message: "Evidence lacks independent review.",
			evidenceRefs: ["source:src/example.ts"],
		},
		{
			id: "ui_accessibility",
			status: "not_applicable",
			mode: "deterministic",
			description: "UI is accessible.",
			method: "deterministic",
			gate: "hard",
			score: 0,
			scoreThreshold: 100,
			repairTarget: "implementation",
			refs: ["selector:no-ui-paths"],
		},
	];
}

function compatibilityInput() {
	return {
		stage: "implementation",
		candidateDigest: CANDIDATE_DIGEST,
		selectorInputDigest: SELECTOR_DIGEST,
		graph: {
			id: "implementation.loop",
			version: "implementation-v3",
			hash: "legacy-graph-hash",
		},
		standards: legacyStandards(),
	};
}

describe("legacy Quality compatibility", () => {
	it("projects current results into common contracts without mutating them", () => {
		const input = compatibilityInput();
		const before = structuredClone(input.standards);
		const compatibility = createLegacyQualityCompatibility(input);

		assert.deepEqual(input.standards, before);
		assert.deepEqual(
			compatibility.standards.map((standard) => standard.id),
			["input_valid", "evidence_reviewed"],
		);
		assert.equal(
			compatibility.standards[1].verifier.kind,
			"model",
		);
		assert.deepEqual(compatibility.resolution.exclusions, [
			{
				standardId: "ui_accessibility",
				standardVersion: "implementation-v3",
				reason: "not_applicable",
				refs: ["selector:no-ui-paths"],
			},
		]);
		assert.doesNotThrow(() =>
			assertValidQualityPolicyResolution(compatibility.resolution),
		);
	});

	it("preserves current pass/fail behavior in the aggregate Quality Report", () => {
		const failed = createLegacyQualityCompatibility(compatibilityInput());
		assert.equal(failed.report.status, "fail");
		assert.equal(failed.report.gateResults[0].status, "fail");
		assert.equal(
			failed.report.assessments.find(
				(assessment) => assessment.standardId === "evidence_reviewed",
			)?.status,
			"unmet",
		);

		const passingInput = compatibilityInput();
		passingInput.standards[1].status = "met";
		passingInput.standards[1].score = 100;
		const passed = createLegacyQualityCompatibility(passingInput);
		assert.equal(passed.report.status, "pass");
		assert.equal(passed.report.gateResults[0].status, "pass");
	});

	it("keeps legacy blocked results blocking until operational failures are typed", () => {
		const input = compatibilityInput();
		input.standards[1].status = "blocked";
		const compatibility = createLegacyQualityCompatibility(input);

		assert.equal(compatibility.report.status, "fail");
		assert.equal(compatibility.report.assessments[1].status, "unmet");
	});
});
