import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createQualityStandardCatalog } from "../../src/loop-exit/catalog.ts";

function projectRegistration(overrides = {}) {
	return {
		standard: {
			id: "project.documentation_current",
			version: "1.0.0",
			description: "Project documentation remains current.",
			assessmentCriteria: ["Affected documentation is updated."],
			verifier: {
				id: "codewiki.deterministic",
				version: "1.0.0",
				kind: "deterministic",
			},
			measurement: { shape: "boolean" },
			evidenceAdapterIds: ["source", "trace"],
			repairTarget: "source",
			cost: 1,
			timeoutMs: 5_000,
			protected: false,
		},
		stages: ["implementation"],
		rollout: "observe",
		rolloutHistory: [],
		evaluationDependsOn: [],
		...overrides,
	};
}

describe("Quality Standard catalog", () => {
	it("provides closed versioned kernel Standards for all three stages", () => {
		const catalog = createQualityStandardCatalog();
		const decision = catalog.list("decision");
		const planning = catalog.list("planning");
		const implementation = catalog.list("implementation");

		assert.ok(
			decision.some((entry) => entry.standard.id === "change_revision_ready"),
		);
		assert.ok(
			planning.some(
				(entry) => entry.standard.id === "worker_workbench_buildable",
			),
		);
		assert.ok(
			implementation.some(
				(entry) => entry.standard.id === "verification_passed",
			),
		);
		assert.ok(
			catalog
				.list()
				.every(
					(entry) =>
						entry.authority === "kernel" &&
						entry.rollout === "enforce" &&
						entry.standard.protected,
				),
		);
		assert.deepEqual(
			implementation.map((entry) => entry.standard.id),
			implementation
				.map((entry) => entry.standard.id)
				.toSorted((left, right) => left.localeCompare(right)),
		);
	});

	it("allows only closed verifier and evidence-adapter identities", () => {
		assert.throws(
			() =>
				createQualityStandardCatalog([
					projectRegistration({
						standard: {
							...projectRegistration().standard,
							verifier: {
								id: "project.javascript",
								version: "1.0.0",
								kind: "deterministic",
							},
						},
					}),
				]),
			/unknown verifier project.javascript/,
		);
		assert.throws(
			() =>
				createQualityStandardCatalog([
					projectRegistration({
						standard: {
							...projectRegistration().standard,
							evidenceAdapterIds: ["arbitrary-shell"],
						},
					}),
				]),
			/unknown evidence adapter arbitrary-shell/,
		);
	});

	it("rejects all caller-declared authority", () => {
		for (const authority of ["project", "kernel", "official"]) {
			assert.throws(
				() =>
					createQualityStandardCatalog([
						projectRegistration({ authority }),
					]),
				/cannot declare authority; the catalog assigns project authority/,
			);
		}
	});

	it("enforces project rollout progression and approval", () => {
		assert.doesNotThrow(() =>
			createQualityStandardCatalog([projectRegistration()]),
		);
		assert.doesNotThrow(() =>
			createQualityStandardCatalog([
				projectRegistration({ rollout: "warn", rolloutHistory: ["observe"] }),
			]),
		);
		assert.doesNotThrow(() =>
			createQualityStandardCatalog([
				projectRegistration({
					rollout: "enforce",
					rolloutHistory: ["observe", "warn"],
					approval: { status: "approved", refs: ["trace:approval:1"] },
				}),
			]),
		);
		assert.throws(
			() =>
				createQualityStandardCatalog([
					projectRegistration({
						rollout: "enforce",
						rolloutHistory: ["observe"],
					}),
				]),
			/must progress through observe -> warn before enforce/,
		);
		assert.throws(
			() =>
				createQualityStandardCatalog([
					projectRegistration({
						rollout: "enforce",
						rolloutHistory: ["observe", "warn"],
					}),
				]),
			/requires approval before enforce/,
		);
	});

	it("prevents project Standards from replacing protected kernel identity", () => {
		assert.throws(
			() =>
				createQualityStandardCatalog([
					projectRegistration({
						standard: {
							...projectRegistration().standard,
							id: "scope_controlled",
						},
					}),
				]),
			/Duplicate Quality Standard registration scope_controlled/,
		);
	});

	it("rejects catalog dependency cycles before policy resolution", () => {
		const first = projectRegistration({
			standard: {
				...projectRegistration().standard,
				id: "project.first",
			},
			evaluationDependsOn: ["project.second"],
		});
		const second = projectRegistration({
			standard: {
				...projectRegistration().standard,
				id: "project.second",
			},
			evaluationDependsOn: ["project.first"],
		});

		assert.throws(
			() => createQualityStandardCatalog([first, second]),
			/catalog dependency cycle includes project.first/,
		);
	});
});
