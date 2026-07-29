import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCheckCatalog } from "../../src/loop-exit/catalog.ts";

function evidenceObligation(overrides = {}) {
	return {
		id: "source-proof",
		version: "1.0.0",
		kinds: ["source_observation"],
		producerKinds: ["runtime"],
		authorities: ["verified"],
		coverages: ["complete"],
		sensitivities: ["project"],
		minimumCount: 1,
		subject: "candidate",
		freshness: "none",
		artifact: "optional",
		contradiction: "indeterminate",
		...overrides,
	};
}

function projectRegistration(overrides = {}) {
	return {
		check: {
			id: "project.documentation_current",
			version: "1.0.0",
			description: "Project documentation remains current.",
			requirement: "Affected documentation is updated.",
			execution: {
				id: "codewiki.code-check",
				version: "1.0.0",
				kind: "code",
			},
			measurement: { kind: "quantitative", shape: "boolean" },
			evidenceObligations: [],
			repairTarget: "source",
			cost: 1,
			timeoutMs: 5_000,
			protected: false,
		},
		loops: ["implementation"],
		rollout: "observe",
		rolloutHistory: [],
		dependsOn: [],
		...overrides,
	};
}

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
						entry.check.protected,
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
		assert.match(catalog.digest, /^sha256:[0-9a-f]{64}$/);
		assert.ok(
			catalog
				.list()
				.every((entry) =>
					/^sha256:[0-9a-f]{64}$/.test(entry.check.requirementDigest),
				),
		);
	});

	it("supports independent same-id Check definitions in disjoint Loops", () => {
		const decision = projectRegistration({
			loops: ["decision"],
			check: {
				...projectRegistration().check,
				requirement: "Decision documentation intent is complete.",
			},
		});
		const implementation = projectRegistration({
			loops: ["implementation"],
			check: {
				...projectRegistration().check,
				requirement: "Implementation documentation is current.",
			},
		});
		const catalog = createCheckCatalog([decision, implementation]);
		const reversed = createCheckCatalog([implementation, decision]);

		assert.equal(catalog.digest, reversed.digest);
		assert.equal(
			catalog.get("project.documentation_current", "decision").check.requirement,
			"Decision documentation intent is complete.",
		);
		assert.equal(
			catalog.get("project.documentation_current", "implementation").check
				.requirement,
			"Implementation documentation is current.",
		);
		assert.throws(
			() => catalog.get("project.documentation_current"),
			/loop is required/,
		);
	});

	it("allows only closed execution and declarative Evidence obligations", () => {
		assert.throws(
			() =>
				createCheckCatalog([
					projectRegistration({
						check: {
							...projectRegistration().check,
							execution: {
								id: "project.javascript",
								version: "1.0.0",
								kind: "code",
							},
						},
					}),
				]),
			/unknown execution project.javascript/,
		);
		assert.throws(
			() =>
				createCheckCatalog([
					projectRegistration({
						check: {
							...projectRegistration().check,
							evidenceObligations: [
								{ ...evidenceObligation(), adapterId: "arbitrary-shell" },
							],
						},
					}),
				]),
			/Evidence obligation received unsupported field adapterId/,
		);
		assert.throws(
			() =>
				createCheckCatalog([
					projectRegistration({
						check: {
							...projectRegistration().check,
							evidenceObligations: [
								evidenceObligation(),
								evidenceObligation({ version: "1.1.0" }),
							],
						},
					}),
				]),
			/evidence obligation ids must be unique/,
		);
	});

	it("rejects caller-owned identity and authority", () => {
		assert.throws(
			() =>
				createCheckCatalog([
					projectRegistration({
						check: {
							...projectRegistration().check,
							requirementDigest: `sha256:${"f".repeat(64)}`,
						},
					}),
				]),
			/cannot supply runtime-owned requirementDigest/,
		);
		for (const authority of ["project", "kernel", "official"]) {
			assert.throws(
				() =>
					createCheckCatalog([
						projectRegistration({ authority }),
					]),
				/cannot declare authority; the catalog assigns project authority/,
			);
		}
	});

	it("requires project rollout progression and approval", () => {
		assert.doesNotThrow(() =>
			createCheckCatalog([projectRegistration()]),
		);
		assert.doesNotThrow(() =>
			createCheckCatalog([
				projectRegistration({ rollout: "warn", rolloutHistory: ["observe"] }),
			]),
		);
		assert.doesNotThrow(() =>
			createCheckCatalog([
				projectRegistration({
					rollout: "require",
					rolloutHistory: ["observe", "warn"],
					approval: { status: "approved", refs: ["trace:approval:1"] },
				}),
			]),
		);
		assert.throws(
			() =>
				createCheckCatalog([
					projectRegistration({
						rollout: "require",
						rolloutHistory: ["observe"],
					}),
				]),
			/must progress through observe -> warn before require/,
		);
		assert.throws(
			() =>
				createCheckCatalog([
					projectRegistration({
						rollout: "require",
						rolloutHistory: ["observe", "warn"],
					}),
				]),
			/requires approval before require/,
		);
	});

	it("prevents project Checks from replacing protected kernel identity", () => {
		assert.throws(
			() =>
				createCheckCatalog([
					projectRegistration({
						check: {
							...projectRegistration().check,
							id: "scope_controlled",
						},
					}),
				]),
			/Duplicate Check registration scope_controlled/,
		);
	});

	it("rejects catalog dependency cycles before policy resolution", () => {
		const first = projectRegistration({
			check: {
				...projectRegistration().check,
				id: "project.first",
			},
			dependsOn: ["project.second"],
		});
		const second = projectRegistration({
			check: {
				...projectRegistration().check,
				id: "project.second",
			},
			dependsOn: ["project.first"],
		});

		assert.throws(
			() => createCheckCatalog([first, second]),
			/catalog dependency cycle includes implementation:project.first/,
		);
	});
});
