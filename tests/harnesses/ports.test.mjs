import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	HARNESS_CAPABILITY_NAMES,
	resolveHarnessCapabilities,
} from "../../src/harnesses/ports.ts";

describe("harness execution ports", () => {
	it("keeps one closed capability vocabulary", () => {
		assert.deepEqual(HARNESS_CAPABILITY_NAMES, [
			"candidate_production",
			"model_evaluation",
			"worker_execution",
			"cancellation",
			"usage_reporting",
			"structured_output",
			"repository_read",
			"workbench_mutation",
			"session_isolation",
		]);
	});

	it("marks undeclared capabilities unavailable instead of relaxing policy", () => {
		const profile = resolveHarnessCapabilities({
			candidate_production: "available",
			session_isolation: {
				capability: "session_isolation",
				status: "indeterminate",
				reason: "sealed calibration is unavailable",
			},
		});
		assert.equal(profile.length, HARNESS_CAPABILITY_NAMES.length);
		assert.deepEqual(profile[0], {
			capability: "candidate_production",
			status: "available",
		});
		assert.deepEqual(profile.at(-1), {
			capability: "session_isolation",
			status: "indeterminate",
			reason: "sealed calibration is unavailable",
		});
		assert.deepEqual(profile[1], {
			capability: "model_evaluation",
			status: "unavailable",
			reason: "capability_not_declared",
		});
		assert.equal(Object.isFrozen(profile), true);
	});

	it("rejects unknown, mismatched, and unexplained unavailable declarations", () => {
		assert.throws(
			() => resolveHarnessCapabilities({ arbitrary_execution: "available" }),
			/Unsupported harness capability: arbitrary_execution\./,
		);
		assert.throws(
			() =>
				resolveHarnessCapabilities({
					model_evaluation: {
						capability: "candidate_production",
						status: "available",
					},
				}),
			/Harness capability declaration key model_evaluation does not match candidate_production\./,
		);
		assert.throws(
			() =>
				resolveHarnessCapabilities({
					cancellation: {
						capability: "cancellation",
						status: "unavailable",
					},
				}),
			/Harness capability cancellation requires a reason when unavailable\./,
		);
	});
});
