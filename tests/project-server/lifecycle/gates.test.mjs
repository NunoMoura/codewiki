import test from "node:test";
import assert from "node:assert/strict";
import {
	createDecisionGate,
	createReviewGate,
	deriveDecisionLifecycleTransition,
} from "../../../src/project-server/lifecycle/gates.ts";
import {createReviewAttempt} from "../../../src/loops/review/contracts.ts";
import {EVIDENCE_SCHEMA_VERSION} from "../../../src/evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../../src/evidence/materialize.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";
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

const digest = (value) => `sha256:${value.repeat(64)}`;

function reviewAttempt(snapshot, overrides = {}) {
	return createReviewAttempt({
		integratedHead: "a".repeat(40),
		integratedTree: "b".repeat(40),
		targetBranch: "main",
		changeIds: ["change:CHG-review"],
		workUnitIds: ["work-unit:WI-review"],
		checkPackSnapshotDigest: snapshot.checkPackDigest,
		providerReceiptDigests: [],
		evidenceRecordDigests: [],
		...overrides,
	});
}

function reviewEvidenceRecord() {
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "source_observation",
			provenanceRefs: ["source:review-test"],
			payload: {
				sourceType: "source",
				snapshotDigest: digest("3"),
				paths: ["src/review.ts"],
				symbols: ["review"],
				ownershipRefs: ["component:review"],
				observations: ["Integrated source was observed."],
			},
		},
		{
			subject: {
				changeRefs: ["change:CHG-review"],
				changeRevisionDigests: [digest("4")],
				acceptanceRequirementIds: ["review-ready"],
				sourceTreeDigest: digest("5"),
			},
			observedAt: "2026-08-15T10:00:00.000Z",
			producer: {kind: "runtime", id: "review-test", version: "1.0.0"},
			authority: "observed",
			coverage: "complete",
			sensitivity: "project",
		},
	);
}

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

test("Review Gate passes zero Checks and permits only guarded delivery", async () => {
	const snapshot = checkSnapshot([], {stage: "review", packs: []});
	const attempt = reviewAttempt(snapshot);
	const run = await createReviewGate({packSnapshot: snapshot}).run({
		attempt,
		evidence: [],
		providerReceipts: [],
	});
	assert.equal(run.report.status, "passed");
	assert.equal(run.report.selectedCheckCount, 0);
	assert.equal(run.transition.target, "guarded_delivery");
	assert.deepEqual(run.feedback, []);
});

test("Review admits Evidence only against its exact integrated revision", async () => {
	const snapshot = checkSnapshot([], {stage: "review", packs: []});
	const record = reviewEvidenceRecord();
	const attempt = reviewAttempt(snapshot, {
		evidenceRecordDigests: [canonicalJsonDigest(record)],
	});
	const run = await createReviewGate({packSnapshot: snapshot}).run({
		attempt,
		evidence: [
			{
				integratedHead: attempt.integratedHead,
				integratedTree: attempt.integratedTree,
				record,
			},
		],
		providerReceipts: [],
	});
	assert.deepEqual(run.evidenceRecords.map((item) => item.evidenceId), [
		record.evidenceId,
	]);
});

test("failed Review Check returns atomic feedback to Implementation", async () => {
	const check = packagedCheck({
		stage: "review",
		definition: {id: "review-standard"},
	});
	const snapshot = checkSnapshot([check], {stage: "review"});
	const attempt = reviewAttempt(snapshot);
	const run = await createReviewGate({
		packSnapshot: snapshot,
		executors: [
			checkExecutor({
				execute: (context) =>
					checkOutput(context.invocation, {
						measurement: {kind: "binary", value: false},
						summary: "Review standard failed.",
						details: [{message: "Expected exact release proof."}],
					}),
			}),
		],
	}).run({attempt, evidence: [], providerReceipts: []});
	assert.equal(run.report.status, "failed");
	assert.equal(run.transition.target, "implementation");
	assert.equal(run.feedback.length, 1);
	assert.equal(run.feedback[0].checkId, "review-standard");
	assert.equal(
		run.feedback[0].failure.details[0].message,
		"Expected exact release proof.",
	);
});

test("stopped Review Gate preserves state and creates no Result", async () => {
	const check = packagedCheck({stage: "review"});
	const snapshot = checkSnapshot([check], {stage: "review"});
	const run = await createReviewGate({packSnapshot: snapshot}).run({
		attempt: reviewAttempt(snapshot),
		evidence: [],
		providerReceipts: [],
	});
	assert.equal(run.report.status, "stopped");
	assert.equal(run.report.results.length, 0);
	assert.equal(run.transition.target, "preserve_state");
});

test("Review rejects Evidence and provider receipts from another head", async () => {
	const snapshot = checkSnapshot([], {stage: "review", packs: []});
	await assert.rejects(
		createReviewGate({packSnapshot: snapshot}).run({
			attempt: reviewAttempt(snapshot),
			evidence: [],
			providerReceipts: [],
			deliveryAuthority: true,
		}),
		/unsupported fields: deliveryAuthority/,
	);
	const attempt = reviewAttempt(snapshot, {
		evidenceRecordDigests: [digest("1")],
	});
	await assert.rejects(
		createReviewGate({packSnapshot: snapshot}).run({
			attempt,
			evidence: [
				{
					integratedHead: "c".repeat(40),
					integratedTree: attempt.integratedTree,
					record: {},
				},
			],
			providerReceipts: [],
		}),
		/exact integrated head and tree/,
	);
	const providerAttempt = reviewAttempt(snapshot, {
		providerReceiptDigests: [digest("2")],
	});
	await assert.rejects(
		createReviewGate({packSnapshot: snapshot}).run({
			attempt: providerAttempt,
			evidence: [],
			providerReceipts: [
				{integratedHead: "c".repeat(40), receiptDigest: digest("2")},
			],
		}),
		/exact integrated head/,
	);
});

test("passed Decision dispositions use fixed Project Server transitions", async () => {
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
