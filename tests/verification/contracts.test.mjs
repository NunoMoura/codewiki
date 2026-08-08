import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	assertValidResolvedExitPolicy,
	createResolvedExitPolicy,
} from "../../src/verification/contracts.ts";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const SELECTOR_DIGEST = `sha256:${"b".repeat(64)}`;
const CATALOG_DIGEST = `sha256:${"c".repeat(64)}`;
const REQUIREMENT_DIGEST = `sha256:${"d".repeat(64)}`;
const CHECK_DIGEST = `sha256:${"e".repeat(64)}`;

function policyInput() {
	return {
		loop: "implementation",
		candidateDigest: CANDIDATE_DIGEST,
		catalogDigest: CATALOG_DIGEST,
		selectorInputDigest: SELECTOR_DIGEST,
		bindings: [
			{
				checkId: "acceptance_covered",
				checkVersion: "1.0.0",
				requirementDigest: REQUIREMENT_DIGEST,
				checkDigest: CHECK_DIGEST,
				enforcement: "require",
				required: true,
				parameters: { minimum: 1, evidence: "exact" },
				dependsOn: ["input_valid"],
				activatedBy: ["loop:implementation", "risk:check"],
				ruleRefs: ["verification.loop.implementation"],
			},
			{
				checkId: "input_valid",
				checkVersion: "1.0.0",
				requirementDigest: REQUIREMENT_DIGEST,
				checkDigest: CHECK_DIGEST,
				enforcement: "require",
				required: true,
				parameters: {},
				dependsOn: [],
				activatedBy: ["kernel", "loop:implementation"],
				ruleRefs: ["verification.kernel.input"],
			},
		],
		exclusions: [
			{
				checkId: "ui_accessibility",
				checkVersion: "1.0.0",
				requirementDigest: REQUIREMENT_DIGEST,
				checkDigest: CHECK_DIGEST,
				reason: "not_applicable",
				refs: ["change:CHG-1"],
			},
		],
		protectedCheckIds: ["input_valid"],
	};
}

describe("Resolved Exit Policy contracts", () => {
	it("normalizes ordering and produces stable identity", () => {
		const policy = createResolvedExitPolicy(policyInput());
		const reordered = structuredClone(policyInput());
		reordered.bindings.reverse();
		reordered.bindings[1].activatedBy.reverse();
		reordered.bindings[1].dependsOn.reverse();
		const equivalent = createResolvedExitPolicy(reordered);

		assert.equal(policy.policyDigest, equivalent.policyDigest);
		assert.deepEqual(
			policy.bindings.map((binding) => binding.checkId),
			["acceptance_covered", "input_valid"],
		);
		assert.deepEqual(policy.bindings[0].activatedBy, [
			"loop:implementation",
			"risk:check",
		]);
		assert.doesNotThrow(() => assertValidResolvedExitPolicy(policy));
	});

	it("keeps execution, measurement, and enforcement dimensions independent", () => {
		const check = {
			id: "maintainability_reviewed",
			version: "1.0.0",
			description: "Review maintainability independently.",
			requirement: "Findings are specific and actionable.",
			requirementDigest: REQUIREMENT_DIGEST,
			execution: {
				id: "codewiki.model-check",
				version: "1.0.0",
				kind: "model",
			},
			measurement: {
				kind: "qualitative",
				shape: "structured",
				schemaRef: "check.findings.v1",
			},
			evidenceObligations: [],
			repairTarget: "source",
			cost: 4,
			timeoutMs: 30_000,
			protected: false,
		};
		const binding = {
			checkId: check.id,
			checkVersion: check.version,
			enforcement: "warn",
			required: false,
		};
		assert.equal(check.execution.kind, "model");
		assert.equal(check.measurement.kind, "qualitative");
		assert.equal(check.measurement.shape, "structured");
		assert.equal(binding.enforcement, "warn");
	});

	it("rejects protected omissions and inactive dependencies", () => {
		const missingProtected = policyInput();
		missingProtected.bindings = missingProtected.bindings
			.filter((binding) => binding.checkId !== "input_valid")
			.map((binding) => ({ ...binding, dependsOn: [] }));
		assert.throws(
			() => createResolvedExitPolicy(missingProtected),
			/Protected Check input_valid must remain active/,
		);
		const inactiveDependency = policyInput();
		inactiveDependency.bindings[0].dependsOn.push("unknown_check");
		assert.throws(
			() => createResolvedExitPolicy(inactiveDependency),
			/has unknown dependency unknown_check/,
		);
	});

	it("rejects dependency cycles and digest tampering", () => {
		const cyclic = policyInput();
		cyclic.bindings[1].dependsOn.push("acceptance_covered");
		assert.throws(
			() => createResolvedExitPolicy(cyclic),
			/Check dependency cycle includes/,
		);
		const policy = createResolvedExitPolicy(policyInput());
		policy.bindings[0].enforcement = "observe";
		assert.throws(
			() => assertValidResolvedExitPolicy(policy),
			/Resolved Exit Policy digest mismatch/,
		);
	});
});
