import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {EVIDENCE_SCHEMA_VERSION} from "../../src/evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";
import {reduceEvidenceObligation} from "../../src/evidence/obligations.ts";
import {createLoopExitResultCache} from "../../src/loop-exit/cache.ts";
import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	customCheckDefinitionCheckId,
} from "../../src/loop-exit/custom-checks/index.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {createLoopCandidate} from "../../src/loop-exit/identity.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {createLoopExitRunner} from "../../src/loop-exit/runner.ts";
import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";

const DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;
const CODE_CHECK_IDS = [
	"active_change_overlap_accounted",
	"change_kind_classified",
	"change_revision_ready",
	"user_value_clear",
];

function candidate(salt = "default") {
	return createLoopCandidate({
		loop: "decision",
		schemaVersion: "1.0.0",
		content: {
			disposition: "approve",
			rationale: `Approve exact candidate ${salt}.`,
		},
		observedBase: {
			workStateDigest: DIGEST,
			knowledgeSnapshotDigest: DIGEST,
			canonicalRefs: ["change:CHG-runner:revision:1"],
		},
	});
}

function selectorInput(loopCandidate, customChecks = []) {
	return {
		loop: "decision",
		candidateDigest: loopCandidate.digest,
		changes: [
			{
				changeId: "CHG-runner",
				revision: 1,
				digest: CHANGE_DIGEST,
				kind: "improve",
				type: "behavior_change",
				risk: "low",
				affectedLayers: ["source"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: [],
		...(customChecks.length > 0 ? {customChecks} : {}),
	};
}

function foundation(checkIds = CODE_CHECK_IDS, options = {}) {
	const loopCandidate = options.candidate ?? candidate();
	const customChecks = options.customChecks ?? [];
	const catalog = createCheckCatalog(customChecks);
	const resolved = resolveExitPolicy(selectorInput(loopCandidate, customChecks));
	const bindings = resolved.bindings.filter((binding) =>
		checkIds.includes(binding.checkId),
	);
	const policy = createResolvedExitPolicy({
		loop: "decision",
		candidateDigest: loopCandidate.digest,
		catalogDigest: resolved.catalogDigest,
		selectorInputDigest: resolved.selectorInputDigest,
		bindings,
		protectedCheckIds: bindings.flatMap((binding) =>
			catalog.get(binding.checkId, "decision").check.protected
				? [binding.checkId]
				: [],
		),
	});
	return {candidate: loopCandidate, catalog, policy};
}

function executor(catalog, checkId, execute, options = {}) {
	const check = catalog.get(checkId, "decision").check;
	return {
		loop: "decision",
		checkId,
		checkVersion: check.version,
		execution: {
			...check.execution,
			...(options.configurationDigest
				? {configurationDigest: options.configurationDigest}
				: {}),
		},
		...(options.producesEvidenceObligationIds
			? {
					producesEvidenceObligationIds:
						options.producesEvidenceObligationIds,
				}
			: {}),
		execute,
	};
}

function customModelCheck(name) {
	return activateCustomCheckDefinition(
		createCustomCheckDefinition({
			checkTypeId: "organization_policy",
			name,
			requirement: `${name} is established.`,
			appliesWhen: {loops: ["decision"]},
		}),
	);
}

const delay = (milliseconds) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

function modelAssessmentEvidence(setup, check) {
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "model_assessment",
			provenanceRefs: ["model-request:runner"],
			payload: {
				checkId: check.id,
				checkVersion: check.version,
				protocolId: "codewiki.test.model-check",
				protocolVersion: "1.0.0",
				routeId: "test-model",
				configurationDigest: canonicalJsonDigest({route: "test-model"}),
				measurement: {kind: "boolean", value: true},
				consideredEvidenceIds: [],
				findings: [],
				limitations: [],
			},
		},
		{
			subject: {
				changeRefs: ["change:CHG-runner"],
				changeRevisionDigests: [CHANGE_DIGEST],
				candidateDigest: setup.candidate.digest,
				acceptanceRequirementIds: [],
			},
			observedAt: "2026-07-28T12:00:00.000Z",
			producer: {kind: "model", id: "test-model", version: "1.0.0"},
			authority: "observed",
			coverage: "complete",
			sensitivity: "project",
		},
	);
}

describe("bounded Loop exit runner", () => {
	it("bounds fan-out, fans every Result in, and reuses only an exact cache key", async () => {
		const setup = foundation();
		let active = 0;
		let maximumActive = 0;
		let executions = 0;
		let now = 0;
		const cache = createLoopExitResultCache({ttlMs: 10, now: () => now});
		const executors = CODE_CHECK_IDS.map((checkId) =>
			executor(setup.catalog, checkId, async () => {
				executions += 1;
				active += 1;
				maximumActive = Math.max(maximumActive, active);
				await delay(10);
				active -= 1;
				return {disposition: "satisfied"};
			}),
		);
		const streamed = [];
		const runner = createLoopExitRunner({
			catalog: setup.catalog,
			executors,
			cache,
			limits: {codeConcurrency: 2, modelConcurrency: 1},
		});
		const first = await runner.run({
			candidate: setup.candidate,
			policy: setup.policy,
			onResult: (result, source) => streamed.push([result.checkId, source]),
		});
		assert.equal(first.report.status, "pass");
		assert.equal(first.nextAction.kind, "ready_for_runtime_route");
		assert.equal(first.report.checkResults.length, CODE_CHECK_IDS.length);
		assert.equal(executions, CODE_CHECK_IDS.length);
		assert.equal(maximumActive, 2);
		assert.equal(Object.isFrozen(first), true);
		assert.equal(Object.isFrozen(first.report), true);

		const precomputedSources = [];
		const precomputed = await createLoopExitRunner({
			catalog: setup.catalog,
			executors: [],
		}).run({
			candidate: setup.candidate,
			policy: setup.policy,
			precomputedResults: first.report.checkResults,
			onResult: (_result, source) => precomputedSources.push(source),
		});
		assert.equal(precomputed.report.reportDigest, first.report.reportDigest);
		assert.deepEqual(precomputedSources, Array(4).fill("precomputed"));

		const second = await runner.run({
			candidate: setup.candidate,
			policy: setup.policy,
		});
		assert.equal(second.report.reportDigest, first.report.reportDigest);
		assert.deepEqual(second.cacheHitCheckIds, [...CODE_CHECK_IDS].sort());
		assert.equal(executions, CODE_CHECK_IDS.length);
		assert.equal(streamed.filter((entry) => entry[1] === "executed").length, 4);

		const changed = foundation(CODE_CHECK_IDS, {
			candidate: candidate("changed-cache-key"),
		});
		const changedRun = await runner.run({
			candidate: changed.candidate,
			policy: changed.policy,
		});
		assert.deepEqual(changedRun.cacheHitCheckIds, []);
		assert.equal(executions, CODE_CHECK_IDS.length * 2);

		now = 11;
		await runner.run({candidate: setup.candidate, policy: setup.policy});
		assert.equal(executions, CODE_CHECK_IDS.length * 3);
	});

	it("keeps independent Checks running and derives failure-dominant repair", async () => {
		const ids = CODE_CHECK_IDS.slice(0, 3);
		const setup = foundation(ids);
		const calls = [];
		const runner = createLoopExitRunner({
			catalog: setup.catalog,
			executors: [
				executor(setup.catalog, ids[0], async () => {
					calls.push(ids[0]);
					await delay(5);
					return {
						disposition: "unsatisfied",
						findings: ["Active overlap remains unresolved."],
						issueClass: "semantic_gap",
					};
				}),
				executor(setup.catalog, ids[1], () => {
					calls.push(ids[1]);
					throw new Error("executor unavailable");
				}),
				executor(setup.catalog, ids[2], async () => {
					calls.push(ids[2]);
					await delay(10);
					return {disposition: "satisfied"};
				}),
			],
		});
		const result = await runner.run({candidate: setup.candidate, policy: setup.policy});
		assert.deepEqual([...calls].sort(), [...ids].sort());
		assert.equal(result.report.status, "fail");
		const operational = result.report.checkResults.find(
			(entry) => entry.checkId === ids[1],
		);
		assert.equal(operational.status, "indeterminate");
		assert.match(operational.findings[0], /redacted/);
		assert.doesNotMatch(operational.findings[0], /executor unavailable/);
		assert.equal(result.nextAction.kind, "repair_candidate");
		assert.deepEqual([...result.nextAction.failedCheckIds], [ids[0]]);
		assert.deepEqual([...result.nextAction.repairTargets], ["loop-candidate"]);

		const retry = await runner.run({candidate: setup.candidate, policy: setup.policy});
		assert.deepEqual(retry.cacheHitCheckIds, [ids[0], ids[2]].sort());
		assert.equal(calls.filter((checkId) => checkId === ids[1]).length, 2);
	});

	it("admits Runtime-produced Evidence from an isolated Model executor", async () => {
		const setup = foundation(["intention_validated"]);
		const check = setup.catalog.get("intention_validated", "decision").check;
		const obligation = check.evidenceObligations[0];
		const evidence = modelAssessmentEvidence(setup, check);
		const resolution = reduceEvidenceObligation({
			obligation,
			evidence: [{evidence, relation: "supporting"}],
			expectedSubject: evidence.subject,
		});
		const streamedEvidence = [];
		const runner = createLoopExitRunner({
			catalog: setup.catalog,
			executors: [
				executor(
					setup.catalog,
					"intention_validated",
					(context) => {
						assert.equal(context.evidenceResolutions[0].status, "missing");
						return {
							disposition: "satisfied",
							measurement: {shape: "boolean", value: true},
							producedEvidenceRecords: [evidence],
							producedEvidenceResolutions: [resolution],
						};
					},
					{producesEvidenceObligationIds: ["model-assessment"]},
				),
			],
		});
		const result = await runner.run({
			candidate: setup.candidate,
			policy: setup.policy,
			onProducedEvidence: (record) => streamedEvidence.push(record.evidenceId),
		});
		assert.equal(result.report.status, "pass");
		assert.deepEqual(result.producedEvidenceRecords, [evidence]);
		assert.deepEqual(streamedEvidence, [evidence.evidenceId]);
		assert.deepEqual(result.report.checkResults[0].evidenceRecordIds, [
			evidence.evidenceId,
		]);
		assert.deepEqual(result.cacheHitCheckIds, []);
		assert.equal(Object.isFrozen(result.producedEvidenceRecords), true);
	});

	it("turns missing Evidence, missing executors, and cancellation into indeterminate Results", async () => {
		const setup = foundation(["approval_safety", "change_revision_ready"]);
		let calls = 0;
		const runner = createLoopExitRunner({
			catalog: setup.catalog,
			executors: [
				executor(setup.catalog, "approval_safety", () => {
					calls += 1;
					return {disposition: "satisfied"};
				}),
			],
		});
		const missing = await runner.run({
			candidate: setup.candidate,
			policy: setup.policy,
		});
		assert.equal(missing.report.status, "indeterminate");
		assert.equal(
			missing.report.checkResults.find(
				(result) => result.checkId === "approval_safety",
			).issueClass,
			"evidence_input",
		);
		assert.equal(
			missing.report.checkResults.find(
				(result) => result.checkId === "change_revision_ready",
			).issueClass,
			"runtime_unavailable",
		);
		assert.equal(calls, 0);
		assert.equal(missing.nextAction.kind, "retry_or_wait");
		assert.deepEqual([...missing.nextAction.indeterminateCheckIds], [
			"approval_safety",
			"change_revision_ready",
		]);

		const cancelledSetup = foundation(["change_revision_ready"], {
			candidate: candidate("cancelled"),
		});
		const controller = new AbortController();
		controller.abort(new Error("cancelled by runtime"));
		const cancelledRunner = createLoopExitRunner({
			catalog: cancelledSetup.catalog,
			executors: [
				executor(cancelledSetup.catalog, "change_revision_ready", () => {
					calls += 1;
					return {disposition: "satisfied"};
				}),
			],
		});
		const cancelled = await cancelledRunner.run({
			candidate: cancelledSetup.candidate,
			policy: cancelledSetup.policy,
			signal: controller.signal,
		});
		assert.equal(cancelled.report.status, "indeterminate");
		assert.equal(cancelled.report.checkResults[0].issueClass, "runtime_cancellation");
		assert.equal(calls, 0);
	});

	it("runs Custom Model Checks in their bounded model pool", async () => {
		const customChecks = [customModelCheck("Policy A"), customModelCheck("Policy B")];
		const checkIds = customChecks.map(customCheckDefinitionCheckId);
		const setup = foundation(checkIds, {
			customChecks,
			candidate: candidate("custom-model"),
		});
		const order = [];
		let active = 0;
		let maximumActive = 0;
		const executors = checkIds.map((checkId) => {
			const check = setup.catalog.get(checkId, "decision").check;
			const evidence = modelAssessmentEvidence(setup, check);
			const resolution = reduceEvidenceObligation({
				obligation: check.evidenceObligations[0],
				evidence: [{evidence, relation: "supporting"}],
				expectedSubject: evidence.subject,
			});
			return executor(
				setup.catalog,
				checkId,
				async () => {
					active += 1;
					maximumActive = Math.max(maximumActive, active);
					await delay(5);
					active -= 1;
					order.push(checkId);
					return {
						disposition: "satisfied",
						producedEvidenceRecords: [evidence],
						producedEvidenceResolutions: [resolution],
					};
				},
				{
					configurationDigest: DIGEST,
					producesEvidenceObligationIds: ["model-assessment"],
				},
			);
		});
		const runner = createLoopExitRunner({
			catalog: setup.catalog,
			limits: {codeConcurrency: 2, modelConcurrency: 1},
			executors,
		});
		const result = await runner.run({candidate: setup.candidate, policy: setup.policy});
		assert.deepEqual([...order].sort(), [...checkIds].sort());
		assert.equal(maximumActive, 1);
		assert.ok(
			result.report.checkResults
				.filter((entry) => checkIds.includes(entry.checkId))
				.every((entry) => entry.status === "pass"),
		);
		assert.equal(result.report.status, "pass");
	});
});
