import test from "node:test";
import assert from "node:assert/strict";
import {
	createDecisionGate,
	deriveDecisionLifecycleTransition,
} from "../../../src/runtime/lifecycle/decision.ts";
import {
	checkExecutor,
	checkOutput,
	checkSnapshot,
	packagedCheck,
} from "../../helpers/checks.mjs";
import {
	nativeDecisionCandidate,
	nativeDecisionRevision,
	nativeDecisionState,
} from "../../helpers/native-decision.mjs";

function candidate(disposition = "approve") {
	const changeId = "CHG-decision-gate";
	const revision = nativeDecisionRevision({changeId});
	const state = nativeDecisionState([{changeId, revision}]);
	return nativeDecisionCandidate({state, changeId, disposition});
}

test("Decision Gate with zero Checks passes explicitly and approve advances to Planning", async () => {
	const value = candidate("approve");
	const run = await createDecisionGate().run({
		candidate: value,
		changeRef: `change:${value.content.changeId}`,
	});
	assert.equal(run.report.status, "passed");
	assert.equal(run.report.selectedCheckCount, 0);
	assert.deepEqual(run.report.results, []);
	assert.deepEqual(run.report.warnings.map((warning) => warning.code), [
		"no_checks_configured",
	]);
	assert.equal(run.transition.target, "planning");
	assert.equal(run.transition.gateReportDigest, run.report.reportDigest);
});

test("failed Decision Check repeats Decision and preserves atomic feedback", async () => {
	const check = packagedCheck({definition: {id: "decision-standard"}});
	const value = candidate();
	const run = await createDecisionGate({
		packSnapshot: checkSnapshot([check]),
		executors: [
			checkExecutor({
				execute: (context) =>
					checkOutput(context.invocation, {
						measurement: {kind: "binary", value: false},
						summary: "Decision standard failed.",
						details: [{message: "Missing risk proof."}],
					}),
			}),
		],
	}).run({candidate: value, changeRef: `change:${value.content.changeId}`});
	assert.equal(run.report.status, "failed");
	assert.equal(run.transition.target, "decision");
	assert.equal(run.report.results[0].failure.code, "requirement_not_met");
	assert.equal(run.report.results[0].failure.details[0].message, "Missing risk proof.");
});

test("stopped Decision Gate preserves lifecycle state", async () => {
	const check = packagedCheck({definition: {id: "missing-executor"}});
	const value = candidate();
	const run = await createDecisionGate({
		packSnapshot: checkSnapshot([check]),
	}).run({candidate: value, changeRef: `change:${value.content.changeId}`});
	assert.equal(run.report.status, "stopped");
	assert.equal(run.report.results.length, 0);
	assert.equal(run.report.stoppedReason.code, "executor_unavailable");
	assert.equal(run.transition.target, "preserve_state");
});

test("malformed Decision Pack stops only Decision Gate without zero-Check warning", async () => {
	const value = candidate();
	const run = await createDecisionGate({
		stoppedReason: {
			code: "malformed_check",
			message: "Check default/broken has invalid check.json.",
			packId: "default",
			checkId: "broken",
		},
	}).run({candidate: value, changeRef: `change:${value.content.changeId}`});
	assert.equal(run.report.status, "stopped");
	assert.equal(run.report.stoppedReason.code, "malformed_check");
	assert.deepEqual(run.report.warnings, []);
	assert.equal(run.transition.target, "preserve_state");
});

test("passed Decision dispositions use fixed Runtime transitions", async () => {
	for (const [disposition, target] of [
		["approve", "planning"],
		["defer", "deferred"],
		["reject", "terminal"],
		["withdraw", "terminal"],
	]) {
		const value = candidate(disposition);
		const run = await createDecisionGate().run({
			candidate: value,
			changeRef: `change:${value.content.changeId}`,
		});
		const transition = deriveDecisionLifecycleTransition(value, run.report);
		assert.equal(transition.target, target);
		assert.equal(transition.requestedDisposition, disposition);
		assert.equal("route" in transition, false);
	}
});
