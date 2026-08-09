import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {decisionLoopExitDeclaration} from "../../src/decision/exit/index.ts";
import {implementationLoopExitDeclaration} from "../../src/implementation/exit/index.ts";
import {planningLoopExitDeclaration} from "../../src/planning/exit/index.ts";
import {createVerificationRuntime} from "../../src/verification/runtime.ts";
import {createLoopExitSuite} from "../../src/verification/suite.ts";

describe("Verification runtime composition", () => {
	it("composes owner-provided declarations without a global semantic facade", () => {
		const suite = createLoopExitSuite({
			decision: decisionLoopExitDeclaration,
			planning: planningLoopExitDeclaration,
			implementation: implementationLoopExitDeclaration,
		});

		assert.deepEqual(suite, {
			decision: {loop: "decision"},
			planning: {loop: "planning"},
			implementation: {loop: "implementation"},
		});
		assert.ok(Object.isFrozen(suite));
		assert.ok(Object.isFrozen(suite.decision));
		assert.ok(Object.isFrozen(suite.planning));
		assert.ok(Object.isFrozen(suite.implementation));
	});

	it("rejects a declaration assigned to the wrong Loop slot", () => {
		assert.throws(
			() =>
				createLoopExitSuite({
					decision: {loop: "planning"},
					planning: {loop: "planning"},
					implementation: {loop: "implementation"},
				}),
			/Loop exit declaration decision must declare loop decision/,
		);
	});

	it("owns frozen generic Catalog, Result, cache, guard, and runner machinery", () => {
		const runtime = createVerificationRuntime();

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
		assert.equal(typeof runtime.createResultCache, "function");
		assert.equal(typeof runtime.createRunner, "function");
		assert.equal(runtime.createRunner({executors: []}).cache.size(), 0);
		assert.throws(
			() => createVerificationRuntime({customChecks: []}),
			/Verification Runtime received unsupported field customChecks; use protectedBaseCustomCheckConfig/,
		);
	});
});
