import test from "node:test";
import assert from "node:assert/strict";
import {
	assembleCheckInvocation,
	subjectInputSelection,
} from "../../src/checks/protocol.ts";
import {
	assertValidCheckResult,
	assertValidGateReport,
	createCheckResult,
	createGateReport,
} from "../../src/checks/results.ts";
import {createCheckPack, createCheckPackSnapshot} from "../../src/checks/packs/contracts.ts";
import {
	checkOutput,
	checkSnapshot,
	checkSubject,
	executionIdentity,
	packagedCheck,
} from "../helpers/checks.mjs";

function resultFixture(overrides = {}) {
	const check = overrides.check ?? packagedCheck(overrides.checkOverrides);
	const snapshot = overrides.snapshot ?? checkSnapshot([check]);
	const subject = overrides.subject ?? checkSubject({stage: check.stage});
	const selector = check.definition.inputs[0];
	const invocation = assembleCheckInvocation({
		subject,
		snapshot,
		check,
		inputs: [subjectInputSelection(subject, selector)],
	});
	const output = checkOutput(invocation, overrides.output);
	const execution = executionIdentity(overrides.execution);
	const result = createCheckResult({snapshot, check, invocation, output, execution});
	return {check, snapshot, subject, invocation, output, execution, result};
}

test("completed Results are passed or failed and failed Result carries authored feedback", () => {
	const passed = resultFixture();
	assert.equal(passed.result.status, "passed");
	assert.equal("failure" in passed.result, false);
	assert.doesNotThrow(() => assertValidCheckResult(passed.result, passed.snapshot));

	const failed = resultFixture({
		output: {
			measurement: {kind: "binary", value: false},
			summary: "Proof missing.",
			details: [{message: "No receipt.", ref: "evidence:missing"}],
		},
	});
	assert.equal(failed.result.status, "failed");
	assert.equal(failed.result.failure.code, "requirement_not_met");
	assert.deepEqual(failed.result.failure.remediation, ["Update subject and rerun Check."]);
	assert.equal(JSON.stringify(failed.result).includes("indeterminate"), false);
});

test("Gate Report passes empty stage with explicit warning and no synthetic Result", () => {
	const snapshot = createCheckPackSnapshot({
		stage: "review",
		packs: [createCheckPack({id: "default", checks: []})],
	});
	const subject = checkSubject({stage: "review"});
	const report = createGateReport({
		snapshot,
		subjectDigest: subject.digest,
		results: [],
		executions: [],
	});
	assert.equal(report.status, "passed");
	assert.equal(report.selectedCheckCount, 0);
	assert.deepEqual(report.results, []);
	assert.deepEqual(report.warnings.map((warning) => warning.code), [
		"empty_pack",
		"no_checks_configured",
	]);
	assert.doesNotThrow(() => assertValidGateReport(report, snapshot));
});

test("operational inability stops Gate without creating Result", () => {
	const {check, snapshot, subject} = resultFixture();
	const reason = {
		code: "executor_unavailable",
		message: "No admitted executor.",
		packId: check.packId,
		checkId: check.checkId,
	};
	const report = createGateReport({
		snapshot,
		subjectDigest: subject.digest,
		results: [],
		executions: [
			{
				packId: check.packId,
				checkId: check.checkId,
				source: "executed",
				status: "stopped",
				attempts: 0,
				stopReason: reason,
			},
		],
		stoppedReason: reason,
	});
	assert.equal(report.status, "stopped");
	assert.equal(report.results.length, 0);
	assert.deepEqual(report.warnings, []);
	assert.equal(report.stoppedReason.code, "executor_unavailable");
});
