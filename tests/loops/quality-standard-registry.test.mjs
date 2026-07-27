import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	createQualityStandardRegistry,
} from "../../src/loops/quality-standard-registry.ts";

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
		authority: "project",
		rollout: "observe",
		rolloutHistory: [],
		evaluationDependsOn: [],
		...overrides,
	};
}

describe("Quality Standard registry", () => {
	it("provides closed versioned kernel Standards for all three stages", () => {
		const registry = createQualityStandardRegistry();
		const decision = registry.list("decision");
		const planning = registry.list("planning");
		const implementation = registry.list("implementation");

		assert.ok(decision.some((entry) => entry.standard.id === "change_revision_ready"));
		assert.ok(planning.some((entry) => entry.standard.id === "worker_workbench_buildable"));
		assert.ok(implementation.some((entry) => entry.standard.id === "verification_passed"));
		assert.ok(
			registry.list().every(
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
				createQualityStandardRegistry([
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
				createQualityStandardRegistry([
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

	it("enforces project rollout progression and approval", () => {
		assert.doesNotThrow(() => createQualityStandardRegistry([projectRegistration()]));
		assert.doesNotThrow(() =>
			createQualityStandardRegistry([
				projectRegistration({ rollout: "warn", rolloutHistory: ["observe"] }),
			]),
		);
		assert.doesNotThrow(() =>
			createQualityStandardRegistry([
				projectRegistration({
					rollout: "enforce",
					rolloutHistory: ["observe", "warn"],
					approval: { status: "approved", refs: ["trace:approval:1"] },
				}),
			]),
		);
		assert.throws(
			() =>
				createQualityStandardRegistry([
					projectRegistration({ rollout: "enforce", rolloutHistory: ["observe"] }),
				]),
			/must progress through observe -> warn before enforce/,
		);
		assert.throws(
			() =>
				createQualityStandardRegistry([
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
				createQualityStandardRegistry([
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

	it("rejects registry dependency cycles before policy resolution", () => {
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
			() => createQualityStandardRegistry([first, second]),
			/registry dependency cycle includes project.first/,
		);
	});
});
