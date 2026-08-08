import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {ingestJunitXmlEvidence} from "../../src/evidence/adapters/junit.ts";
import {materializeStandardAdapterEvidence} from "../../src/evidence/adapters/materialization.ts";
import {createResolvedExitPolicy} from "../../src/verification/contracts.ts";
import {createLoopCandidate} from "../../src/verification/identity.ts";
import {resolveExitPolicy} from "../../src/verification/resolve-policy.ts";
import {
	createStandardEvidenceCheckBindingParameters,
	createStandardEvidenceCheckExecutors,
} from "../../src/verification/standard-evidence-executor.ts";
import {createLoopExitRuntime} from "../../src/runtime/loop-exit-runtime.ts";
import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";

const sourceSnapshotDigest = digest("source");
const revisionDigest = digest("revision");
const selector = Object.freeze({
	kind: "junit_tests_passed",
	minimumTestCount: 2,
	maximumSkippedCount: 0,
});

function candidate() {
	return createLoopCandidate({
		loop: "implementation",
		schemaVersion: "1.0.0",
		content: {summary: "Exact implementation candidate."},
		observedBase: {
			workStateDigest: digest("work-state"),
			knowledgeSnapshotDigest: digest("knowledge"),
			sourceSnapshotDigest,
			gitTreeDigest: digest("tree"),
			canonicalRefs: ["change:CHG-standard-executor:revision:1"],
		},
	});
}

function junit(loopCandidate, {failed = false, expectedTestCount = 2} = {}) {
	const failure = failed
		? '<failure message="private">private stack</failure>'
		: "";
	const ingestion = ingestJunitXmlEvidence({
		artifact: {
			bytes: `<testsuite name="unit" tests="2" failures="${failed ? 1 : 0}" errors="0" skipped="0"><testcase name="one"/><testcase name="two">${failure}</testcase></testsuite>`,
			ref: "artifact:junit/native-executor",
		},
		sourceSnapshotDigest,
		testSelectionDigest: digest("selection"),
		expectedTestCount,
		runner: {name: "node-test", version: "26.1.0"},
		execution: {
			adapterId: "codewiki.test.node",
			adapterVersion: "1.0.0",
			requestDigest: digest("request"),
			invocationDigest: digest("invocation"),
			environmentDigest: digest("environment"),
			configurationDigest: digest("configuration"),
			termination: "exited",
			exitCode: failed ? 1 : 0,
			durationMs: 25,
		},
		provenanceRefs: ["run:junit/native-executor"],
	});
	const subject = {
		changeRefs: ["TRACE-CHG-standard-executor"],
		changeRevisionDigests: [revisionDigest],
		candidateDigest: loopCandidate.digest,
		acceptanceRequirementIds: [],
		sourceTreeDigest: sourceSnapshotDigest,
	};
	return {
		ingestion,
		bundle: materializeStandardAdapterEvidence({
			ingestion,
			subject,
			observedAt: "2026-08-01T14:00:00.000Z",
		}),
	};
}

function policy(
	loopCandidate,
	selected = selector,
	checkIds = ["verification_passed"],
) {
	const resolved = resolveExitPolicy({
		loop: "implementation",
		candidateDigest: loopCandidate.digest,
		changes: [
			{
				changeId: "CHG-standard-executor",
				revision: 1,
				digest: revisionDigest,
				kind: "improve",
				type: "behavior_change",
				risk: "low",
				affectedLayers: ["source"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: ["src/index.ts"],
		approvedAdditions: checkIds.map((checkId) => ({
			checkId,
			checkVersion: "1.0.0",
			authorityRef: `trace:approval:standard-evidence:${checkId}`,
			parameters: createStandardEvidenceCheckBindingParameters(selected),
		})),
	});
	const bindings = resolved.bindings.filter((entry) =>
		checkIds.includes(entry.checkId),
	);
	assert.equal(bindings.length, checkIds.length);
	return createResolvedExitPolicy({
		loop: "implementation",
		candidateDigest: loopCandidate.digest,
		catalogDigest: resolved.catalogDigest,
		selectorInputDigest: resolved.selectorInputDigest,
		bindings,
		protectedCheckIds: checkIds,
	});
}

function capability(admitted, checkId = "verification_passed") {
	return {
		loop: "implementation",
		checkId,
		checkVersion: "1.0.0",
		obligationIds: ["command-execution"],
		selector,
		ingestion: admitted.ingestion,
		bundle: admitted.bundle,
	};
}

async function run({failed = false, expectedTestCount = 2, selected = selector} = {}) {
	const loopCandidate = candidate();
	const admitted = junit(loopCandidate, {failed, expectedTestCount});
	const runtime = createLoopExitRuntime({
		standardEvidenceCapabilities: [capability(admitted)],
	});
	const runner = runtime.createRunner({executors: []});
	const result = await runner.run({
		candidate: loopCandidate,
		policy: policy(loopCandidate, selected),
	});
	return {result, admitted};
}

describe("native standard Evidence Check executor", () => {
	it("installs through Runtime and creates passing or failing canonical Results", async () => {
		const passed = await run();
		const failed = await run({failed: true});

		assert.equal(passed.result.report.status, "pass");
		assert.equal(passed.result.report.checkResults[0]?.status, "pass");
		assert.deepEqual({...passed.result.report.checkResults[0]?.measurement}, {
			shape: "boolean",
			value: true,
		});
		assert.deepEqual(
			passed.result.producedEvidenceRecords.map((record) => record.evidenceId),
			passed.admitted.bundle.evidenceRecordIds,
		);
		assert.equal(
			passed.result.report.checkResults[0]?.evidenceResolutions[0]?.status,
			"ready",
		);

		assert.equal(failed.result.report.status, "fail");
		assert.equal(failed.result.report.checkResults[0]?.status, "fail");
		assert.equal(
			failed.result.nextAction.failedCheckIds[0],
			"verification_passed",
		);
	});

	it("keeps partial Evidence and protected-selector mismatch indeterminate", async () => {
		const partial = await run({expectedTestCount: 3});
		assert.equal(partial.result.report.status, "indeterminate");
		assert.equal(
			partial.result.report.checkResults[0]?.evidenceResolutions[0]?.status,
			"indeterminate",
		);

		const mismatched = await run({
			selected: {
				kind: "junit_tests_passed",
				minimumTestCount: 3,
				maximumSkippedCount: 0,
			},
		});
		assert.equal(mismatched.result.report.status, "indeterminate");
		assert.match(
			mismatched.result.report.checkResults[0]?.findings[0] ?? "",
			/protected policy binding/,
		);
		assert.equal(mismatched.result.producedEvidenceRecords.length, 0);
	});

	it("fans one exact substrate into independent Results and records Evidence once", async () => {
		const loopCandidate = candidate();
		const admitted = junit(loopCandidate);
		const checkIds = ["verification_passed", "typescript_verified"];
		const runtime = createLoopExitRuntime({
			standardEvidenceCapabilities: checkIds.map((checkId) =>
				capability(admitted, checkId),
			),
		});
		const recorded = [];
		const result = await runtime.createRunner({executors: []}).run({
			candidate: loopCandidate,
			policy: policy(loopCandidate, selector, checkIds),
			onCheckMaterialized: ({producedEvidenceRecords}) =>
				recorded.push(...producedEvidenceRecords.map((record) => record.evidenceId)),
		});

		assert.equal(result.report.status, "pass");
		assert.deepEqual(
			result.report.checkResults.map((entry) => entry.checkId).sort(),
			[...checkIds].sort(),
		);
		assert.deepEqual(
			result.report.checkResults.map((entry) => entry.evidenceRecordIds),
			checkIds.map(() => admitted.bundle.evidenceRecordIds),
		);
		assert.deepEqual(
			result.producedEvidenceRecords.map((record) => record.evidenceId),
			admitted.bundle.evidenceRecordIds,
		);
		assert.deepEqual(recorded, admitted.bundle.evidenceRecordIds);

		const replayRecorded = [];
		const replay = await runtime.createRunner({executors: []}).run({
			candidate: loopCandidate,
			policy: policy(loopCandidate, selector, checkIds),
			evidenceRecords: admitted.bundle.evidenceRecords,
			onCheckMaterialized: ({producedEvidenceRecords}) =>
				replayRecorded.push(
					...producedEvidenceRecords.map((record) => record.evidenceId),
				),
		});
		assert.equal(replay.report.reportDigest, result.report.reportDigest);
		assert.deepEqual(replay.producedEvidenceRecords, []);
		assert.deepEqual(replayRecorded, []);

		const [record] = admitted.bundle.evidenceRecords;
		assert.ok(record);
		await assert.rejects(
			runtime.createRunner({executors: []}).run({
				candidate: loopCandidate,
				policy: policy(loopCandidate, selector, checkIds),
				evidenceRecords: [
					{...record, provenanceRefs: [...record.provenanceRefs, "tampered"]},
				],
			}),
			/conflicts with an existing record/,
		);
	});

	it("rejects duplicate, incomplete, unknown, and non-Code capabilities", () => {
		const loopCandidate = candidate();
		const admitted = junit(loopCandidate);
		const runtime = createLoopExitRuntime();
		const valid = capability(admitted);
		assert.throws(
			() =>
				createStandardEvidenceCheckExecutors({
					catalog: runtime.catalog,
					capabilities: [valid, valid],
				}),
			/duplicated/,
		);
		const conflictingIngestion = junit(loopCandidate, {failed: true}).ingestion;
		assert.throws(
			() =>
				createStandardEvidenceCheckExecutors({
					catalog: runtime.catalog,
					capabilities: [
						valid,
						{
							...capability(admitted, "typescript_verified"),
							ingestion: conflictingIngestion,
						},
					],
				}),
			/inconsistent shared-substrate bindings/,
		);
		assert.throws(
			() =>
				createStandardEvidenceCheckExecutors({
					catalog: runtime.catalog,
					capabilities: [{...valid, obligationIds: []}],
				}),
			/1\.\.8 unique obligationIds/,
		);
		assert.throws(
			() =>
				createStandardEvidenceCheckExecutors({
					catalog: runtime.catalog,
					capabilities: [{...valid, obligationIds: ["foreign"]}],
				}),
			/unknown obligation foreign/,
		);
		assert.throws(
			() =>
				createStandardEvidenceCheckExecutors({
					catalog: runtime.catalog,
					capabilities: [
						{
							...valid,
							checkId: "production_readiness_reviewed",
							obligationIds: ["model-assessment"],
						},
					],
				}),
			/requires a boolean Code Check/,
		);
	});
});

function digest(value) {
	return canonicalJsonDigest({value});
}
