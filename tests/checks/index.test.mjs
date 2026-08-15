import test from "node:test";
import assert from "node:assert/strict";
import {createChecks} from "../../src/checks/index.ts";
import {createCheckInputSelection} from "../../src/checks/protocol.ts";
import {checkExecutor, checkSnapshot, checkSubject} from "../helpers/checks.mjs";

test("Checks service creates Gate runners over one shared exact Result cache", async () => {
	let executions = 0;
	const executor = checkExecutor({
		execute(context) {
			executions += 1;
			return {
				protocolId: "codewiki.check-output",
				protocolVersion: "1.0.0",
				invocationDigest: context.invocation.invocationDigest,
				measurement: {kind: "binary", value: true},
				summary: "Passed.",
				details: [],
			};
		},
	});
	const checks = createChecks({
		executors: [executor],
		inputResolver: {
			resolve({selector}) {
				return createCheckInputSelection({selector, status: "unavailable"});
			},
		},
	});
	const input = {subject: checkSubject(), snapshot: checkSnapshot()};
	const first = await checks.createRunner().run(input);
	const second = await checks.createRunner().run(input);
	assert.equal(first.status, "passed");
	assert.equal(second.status, "passed");
	assert.deepEqual(second.cacheHitCheckIds, ["default/check-one"]);
	assert.equal(executions, 1);
});

test("Checks service exposes Gate terminology only", async () => {
	const module = await import("../../src/checks/index.ts");
	assert.equal("createVerificationRuntime" in module, false);
	assert.equal("createLoopExitRunner" in module, false);
	assert.equal(typeof module.createGateRunner, "function");
});
