import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCheckCatalog } from "../../src/loop-exit/catalog.ts";

function projectRegistration(overrides = {}) {
	return {
		check: {
			id: "project.documentation_current",
			version: "1.0.0",
			description: "Project documentation remains current.",
			criteria: ["Affected documentation is updated."],
			execution: {
				id: "codewiki.code-check",
				version: "1.0.0",
				kind: "code",
			},
			measurement: { kind: "quantitative", shape: "boolean" },
			evidenceAdapterIds: ["source", "trace"],
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
			implementation.map((entry) => entry.check.id),
			implementation
				.map((entry) => entry.check.id)
				.toSorted((left, right) => left.localeCompare(right)),
		);
	});

	it("allows only closed execution and evidence-adapter identities", () => {
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
			/catalog dependency cycle includes project.first/,
		);
	});
});
