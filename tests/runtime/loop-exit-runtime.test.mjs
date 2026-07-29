import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLoopExitSuite } from "../../src/loop-exit/suite.ts";
import {
	createLoopExitRuntime,
	LOOP_EXIT_SUITE,
} from "../../src/runtime/loop-exit-runtime.ts";

describe("Loop exit runtime composition", () => {
	it("composes one immutable declaration for every semantic Loop", () => {
		assert.deepEqual(LOOP_EXIT_SUITE, {
			decision: { loop: "decision" },
			planning: { loop: "planning" },
			implementation: { loop: "implementation" },
		});
		assert.ok(Object.isFrozen(LOOP_EXIT_SUITE));
		assert.ok(Object.isFrozen(LOOP_EXIT_SUITE.decision));
		assert.ok(Object.isFrozen(LOOP_EXIT_SUITE.planning));
		assert.ok(Object.isFrozen(LOOP_EXIT_SUITE.implementation));
	});

	it("rejects a declaration assigned to the wrong Loop slot", () => {
		assert.throws(
			() =>
				createLoopExitSuite({
					decision: { loop: "planning" },
					planning: { loop: "planning" },
					implementation: { loop: "implementation" },
				}),
			/Loop exit declaration decision must declare loop decision/,
		);
	});

	it("owns frozen Catalog and result constructors without changing production Loops", () => {
		const runtime = createLoopExitRuntime();

		assert.equal(runtime.suite, LOOP_EXIT_SUITE);
		assert.ok(Object.isFrozen(runtime));
		assert.ok(Object.isFrozen(runtime.catalog));
		assert.equal(
			runtime.catalog.get("change_revision_ready").authority,
			"kernel",
		);
		assert.ok(runtime.catalog.list("decision").length > 0);
		assert.ok(runtime.catalog.list("planning").length > 0);
		assert.ok(runtime.catalog.list("implementation").length > 0);
		assert.equal(typeof runtime.createCheckResult, "function");
		assert.equal(typeof runtime.createExitReport, "function");
		assert.equal(typeof runtime.materializeDecisionResearchCitation, "function");
		assert.equal(typeof runtime.evaluateDecisionResearchProvenance, "function");
		assert.equal(
			typeof runtime.prepareDecisionResearchClaimsAssessment,
			"function",
		);
		assert.equal(
			typeof runtime.completeDecisionResearchClaimsAssessment,
			"function",
		);
	});
});
