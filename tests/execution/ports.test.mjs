import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	EXECUTION_CAPABILITY_NAMES,
	resolveExecutionCapabilities,
} from "../../src/execution/ports.ts";

describe("execution ports", () => {
	it("keeps one closed capability vocabulary", () => {
		assert.deepEqual(EXECUTION_CAPABILITY_NAMES, [
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
		const profile = resolveExecutionCapabilities({
			candidate_production: "available",
			session_isolation: {
				capability: "session_isolation",
				status: "indeterminate",
				reason: "sealed calibration is unavailable",
			},
		});
		assert.equal(profile.length, EXECUTION_CAPABILITY_NAMES.length);
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
			() => resolveExecutionCapabilities({ arbitrary_execution: "available" }),
			/Unsupported execution capability: arbitrary_execution\./,
		);
		assert.throws(
			() =>
				resolveExecutionCapabilities({
					model_evaluation: {
						capability: "candidate_production",
						status: "available",
					},
				}),
			/Execution capability declaration key model_evaluation does not match candidate_production\./,
		);
		assert.throws(
			() =>
				resolveExecutionCapabilities({
					cancellation: {
						capability: "cancellation",
						status: "unavailable",
					},
				}),
			/Execution capability cancellation requires a reason when unavailable\./,
		);
	});
});
