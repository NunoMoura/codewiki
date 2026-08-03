import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";

describe("Check catalog", () => {
	it("provides closed versioned kernel Checks for all three loops", () => {
		const catalog = createCheckCatalog();
		const decision = catalog.list("decision");
		const planning = catalog.list("planning");
		const implementation = catalog.list("implementation");

		assert.ok(
			decision.some((entry) => entry.check.id === "change_revision_ready"),
		);
		assert.ok(
			planning.some(
				(entry) => entry.check.id === "worker_workbench_buildable",
			),
		);
		assert.ok(
			implementation.some(
				(entry) => entry.check.id === "verification_passed",
			),
		);
		assert.ok(
			decision.some(
				(entry) => entry.check.id === "release_intent_authorized",
			),
		);
		assert.ok(
			planning.some((entry) => entry.check.id === "release_plan_safe"),
		);
		assert.ok(
			planning.some(
				(entry) => entry.check.id === "ui_preview_targets_valid",
			),
		);
		assert.equal(
			decision.some((entry) => entry.check.id === "release_safety_approved"),
			false,
		);
		assert.equal(
			planning.some((entry) => entry.check.id === "release_safety_approved"),
			false,
		);
		assert.ok(
			catalog
				.list()
				.every(
					(entry) =>
						entry.authority === "kernel" &&
						entry.rollout === "require" &&
						entry.check.protected &&
						entry.customCheck === undefined,
				),
		);
		assert.deepEqual(
			catalog.get("verification_passed", "implementation").check
				.evidenceObligations[0].kinds,
			["command_execution"],
		);
		const workerObligation = catalog.get(
			"worker_claims_correlated",
			"implementation",
		).check.evidenceObligations[0];
		assert.deepEqual(workerObligation.producerKinds, ["worker"]);
		assert.deepEqual(workerObligation.authorities, ["asserted"]);
		assert.deepEqual(
			catalog.get("release_intent_authorized", "decision").check
				.evidenceObligations[0].authorities,
			["approved"],
		);
		const researchProvenance = catalog.get(
			"research_provenance_valid",
			"decision",
		);
		assert.equal(researchProvenance.check.execution.kind, "code");
		assert.deepEqual(
			{...researchProvenance.check.evidenceObligations[0]},
			{
				id: "research-citations",
				version: "1.0.0",
				kinds: ["research_citation"],
				producerKinds: ["external_service", "runtime"],
				authorities: ["observed", "verified"],
				coverages: ["complete"],
				sensitivities: ["private", "project", "public"],
				minimumCount: 1,
				subject: "change_revision",
				freshness: "exact_boundary",
				artifact: "optional",
				contradiction: "retain",
			},
		);
		const researchSupport = catalog.get(
			"research_claims_supported",
			"decision",
		);
		assert.equal(researchSupport.check.execution.kind, "model");
		assert.deepEqual(
			researchSupport.check.evidenceObligations.map(
				(obligation) => obligation.id,
			),
			["model-assessment", "research-citations"],
		);
		assert.deepEqual(researchSupport.dependsOn, ["research_provenance_valid"]);
		assert.equal(
			catalog.get("research_provenance_valid", "planning"),
			undefined,
		);
		assert.deepEqual(
			catalog.get("production_readiness_reviewed", "implementation").check
				.evidenceObligations[0].kinds,
			["model_assessment"],
		);
		assert.deepEqual(
			implementation.map((entry) => entry.check.id),
			implementation
				.map((entry) => entry.check.id)
				.toSorted((left, right) => left.localeCompare(right)),
		);
		assert.equal(catalog.version, "7.0.0");
		assert.match(catalog.digest, /^sha256:[0-9a-f]{64}$/);
		assert.ok(
			catalog
				.list()
				.every((entry) =>
					/^sha256:[0-9a-f]{64}$/.test(entry.check.requirementDigest),
				),
		);
	});
});
