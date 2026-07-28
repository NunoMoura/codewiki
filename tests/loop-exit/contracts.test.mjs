import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	QUALITY_POLICY_SCHEMA_VERSION,
	assertValidQualityPolicyResolution,
	createQualityPolicyResolution,
} from "../../src/loop-exit/contracts.ts";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const SELECTOR_DIGEST = `sha256:${"b".repeat(64)}`;

function policyInput() {
	return {
		stage: "implementation",
		candidateDigest: CANDIDATE_DIGEST,
		selectorInputDigest: SELECTOR_DIGEST,
		bindings: [
			{
				standardId: "acceptance_covered",
				standardVersion: "1.0.0",
				enforcement: "enforce",
				required: true,
				parameters: { minimumCoverage: 1 },
				evaluationDependsOn: ["input_valid"],
				activatedBy: ["stage:implementation", "risk:standard"],
				ruleRefs: ["quality.stage.implementation"],
			},
			{
				standardId: "input_valid",
				standardVersion: "1.0.0",
				enforcement: "enforce",
				required: true,
				parameters: {},
				evaluationDependsOn: [],
				activatedBy: ["kernel", "stage:implementation"],
				ruleRefs: ["quality.kernel.input"],
			},
		],
		exclusions: [
			{
				standardId: "ui_accessibility",
				standardVersion: "1.0.0",
				reason: "not_applicable",
				refs: ["selector:path-traits"],
			},
		],
		gates: [
			{
				id: "implementation_exit",
				version: "1.0.0",
				kind: "all_required",
				standardIds: ["input_valid", "acceptance_covered"],
				onFailure: "repair",
			},
		],
		protectedStandardIds: ["input_valid"],
	};
}

describe("Quality Policy contracts", () => {
	it("creates one deterministic explainable resolution", () => {
		const resolution = createQualityPolicyResolution(policyInput());
		const reordered = policyInput();
		reordered.bindings.reverse();
		reordered.bindings[1].activatedBy.reverse();
		reordered.gates[0].standardIds.reverse();
		const equivalent = createQualityPolicyResolution(reordered);

		assert.equal(resolution.schemaVersion, QUALITY_POLICY_SCHEMA_VERSION);
		assert.match(resolution.policyDigest, /^sha256:[a-f0-9]{64}$/);
		assert.equal(resolution.policyDigest, equivalent.policyDigest);
		assert.deepEqual(
			resolution.bindings.map((binding) => binding.standardId),
			["acceptance_covered", "input_valid"],
		);
		assert.deepEqual(resolution.bindings[1].activatedBy, [
			"kernel",
			"stage:implementation",
		]);
		assert.doesNotThrow(() => assertValidQualityPolicyResolution(resolution));
	});

	it("keeps verifier, measurement, and enforcement dimensions independent", () => {
		const standard = {
			id: "maintainability_reviewed",
			version: "1.0.0",
			description: "Changed code remains maintainable.",
			assessmentCriteria: ["Names and boundaries communicate intent."],
			verifier: {
				id: "codewiki.model.assessor",
				version: "2.0.0",
				kind: "model",
			},
			measurement: { shape: "structured", schemaRef: "quality.findings.v1" },
			evidenceAdapterIds: ["changed_source"],
			repairTarget: "source",
			cost: 4,
			timeoutMs: 30_000,
			protected: false,
		};
		const binding = {
			...policyInput().bindings[0],
			standardId: standard.id,
			standardVersion: standard.version,
			enforcement: "warn",
		};

		assert.equal(standard.verifier.kind, "model");
		assert.equal(standard.measurement.shape, "structured");
		assert.equal(binding.enforcement, "warn");
	});

	it("represents operational verifier failure as indeterminate without a fabricated measurement", () => {
		const assessment = {
			standardId: "maintainability_reviewed",
			standardVersion: "1.0.0",
			candidateDigest: CANDIDATE_DIGEST,
			status: "indeterminate",
			evidenceRefs: [],
			findings: ["Verifier timed out."],
			verifier: {
				id: "codewiki.model.assessor",
				version: "2.0.0",
				modelRef: "pi:model-route-digest",
				configurationDigest: `sha256:${"c".repeat(64)}`,
			},
		};

		assert.equal(assessment.status, "indeterminate");
		assert.equal("measurement" in assessment, false);
	});

	it("rejects protected exclusions and inactive gate refs", () => {
		const missingProtected = policyInput();
		missingProtected.bindings = missingProtected.bindings.filter(
			(binding) => binding.standardId !== "input_valid",
		);
		missingProtected.bindings[0].evaluationDependsOn = [];
		assert.throws(
			() => createQualityPolicyResolution(missingProtected),
			/Protected Quality Standard input_valid must remain active/,
		);

		const inactiveGateRef = policyInput();
		inactiveGateRef.gates[0].standardIds.push("unknown_standard");
		assert.throws(
			() => createQualityPolicyResolution(inactiveGateRef),
			/references inactive Standard unknown_standard/,
		);
	});

	it("rejects evaluation dependency cycles and resolution tampering", () => {
		const cyclic = policyInput();
		cyclic.bindings[1].evaluationDependsOn = ["acceptance_covered"];
		assert.throws(
			() => createQualityPolicyResolution(cyclic),
			/evaluation dependency cycle includes acceptance_covered/,
		);

		const resolution = createQualityPolicyResolution(policyInput());
		resolution.bindings[0].enforcement = "observe";
		assert.throws(
			() => assertValidQualityPolicyResolution(resolution),
			/Quality Policy resolution digest mismatch/,
		);
	});
});
