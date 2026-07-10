import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	evaluateDecisionExit,
	evaluateDecisionExitWithRunner,
} from "../../src/decision/loop.ts";
import { createSprintProposal } from "../../src/decision/proposal.ts";
import {
	evaluateImplementationExit,
	evaluateImplementationExitWithRunner,
} from "../../src/implementation/loop.ts";
import {
	evaluatePlanningExit,
	evaluatePlanningExitWithRunner,
} from "../../src/planning/loop.ts";

function withoutRunner(exit) {
	const { qualityRunner, ...rest } = exit;
	return rest;
}

describe("production loop runner wiring", () => {
	it("runs decision quality standards through the loop runner without changing verdict semantics", async () => {
		const proposal = createSprintProposal({ id: "SP-runner", changes: [] });
		const syncExit = evaluateDecisionExit(proposal);
		const runnerExit = await evaluateDecisionExitWithRunner(proposal);

		assert.deepEqual(withoutRunner(runnerExit), syncExit);
		assert.equal(runnerExit.qualityRunner.graphId, "decision.loop");
		assert.equal(
			runnerExit.qualityRunner.nodes.length,
			runnerExit.qualityStandards.length,
		);
		assert.ok(
			runnerExit.qualityRunner.nodes.every((node) => node.latencyMs >= 0),
		);
	});

	it("runs planning quality standards through the loop runner without changing verdict semantics", async () => {
		const input = {
			decisionRefs: ["trace:TRACE-demo:decision:iteration:1#change:CHG-1"],
			workItems: [],
			resolutions: [],
		};
		const syncExit = evaluatePlanningExit(input);
		const runnerExit = await evaluatePlanningExitWithRunner(input);

		assert.deepEqual(withoutRunner(runnerExit), syncExit);
		assert.equal(runnerExit.qualityRunner.graphId, "planning.loop");
		assert.equal(
			runnerExit.qualityRunner.nodes.length,
			runnerExit.qualityStandards.length,
		);
	});

	it("runs implementation quality standards through the loop runner without changing verdict semantics", async () => {
		const input = {
			planningRefs: ["trace:TRACE-demo:planning:iteration:1#work:WU-1"],
			changes: [],
		};
		const syncExit = evaluateImplementationExit(input);
		const runnerExit = await evaluateImplementationExitWithRunner(input);

		assert.deepEqual(withoutRunner(runnerExit), syncExit);
		assert.equal(runnerExit.qualityRunner.graphId, "implementation.loop");
		assert.equal(
			runnerExit.qualityRunner.nodes.length,
			runnerExit.qualityStandards.length,
		);
	});
});
