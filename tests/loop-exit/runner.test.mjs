import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {createLoopExitResultCache} from "../../src/loop-exit/cache.ts";
import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {createLoopCandidate} from "../../src/loop-exit/identity.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {createLoopExitRunner} from "../../src/loop-exit/runner.ts";

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

function selectorInput(loopCandidate, projectRegistrations = []) {
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
		...(projectRegistrations.length > 0
			? {
					projectRegistrations,
					approvedAdditions: projectRegistrations.map((registration) => ({
						checkId: registration.check.id,
						checkVersion: registration.check.version,
						authorityRef: "trace:decision:approval:runner",
					})),
				}
			: {}),
	};
}

function foundation(checkIds = CODE_CHECK_IDS, options = {}) {
	const loopCandidate = options.candidate ?? candidate();
	const registrations = options.projectRegistrations ?? [];
	const catalog = createCheckCatalog(registrations);
	const resolved = resolveExitPolicy(selectorInput(loopCandidate, registrations));
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
		execute,
	};
}

function modelRegistration(id, dependsOn = [], timeoutMs = 50) {
	return {
		check: {
			id,
			version: "1.0.0",
			description: `Bounded ${id} model check.`,
			requirement: `The ${id} requirement is established.`,
			execution: {
				id: "codewiki.model-check",
				version: "1.0.0",
				kind: "model",
			},
			measurement: {kind: "qualitative", shape: "boolean"},
			evidenceObligations: [],
			repairTarget: "candidate",
			cost: 1,
			timeoutMs,
			protected: false,
		},
		loops: ["decision"],
		rollout: "observe",
		rolloutHistory: [],
		dependsOn,
	};
}

const delay = (milliseconds) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

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

	it("runs dependency-bound model Checks in their own pool and times out explicitly", async () => {
		const registrations = [
			modelRegistration("project.model_a"),
			modelRegistration("project.model_b", ["project.model_a"], 20),
		];
		const setup = foundation(
			registrations.map((registration) => registration.check.id),
			{projectRegistrations: registrations, candidate: candidate("model")},
		);
		const order = [];
		let active = 0;
		let maximumActive = 0;
		const runner = createLoopExitRunner({
			catalog: setup.catalog,
			limits: {codeConcurrency: 2, modelConcurrency: 1},
			executors: [
				executor(
					setup.catalog,
					"project.model_a",
					async () => {
						active += 1;
						maximumActive = Math.max(maximumActive, active);
						await delay(5);
						active -= 1;
						order.push("project.model_a");
						return {disposition: "satisfied"};
					},
					{configurationDigest: DIGEST},
				),
				executor(
					setup.catalog,
					"project.model_b",
					({dependencyResults, signal}) => {
						assert.equal(dependencyResults[0].status, "pass");
						order.push("project.model_b");
						active += 1;
						maximumActive = Math.max(maximumActive, active);
						return new Promise((resolve) => {
							signal.addEventListener(
								"abort",
								() => {
									active -= 1;
									resolve({disposition: "indeterminate"});
								},
								{once: true},
							);
						});
					},
					{configurationDigest: DIGEST},
				),
			],
		});
		const result = await runner.run({candidate: setup.candidate, policy: setup.policy});
		assert.deepEqual(order, ["project.model_a", "project.model_b"]);
		assert.equal(maximumActive, 1);
		assert.equal(
			result.report.checkResults.find(
				(entry) => entry.checkId === "project.model_b",
			).issueClass,
			"runtime_timeout",
		);
		assert.equal(result.report.status, "pass");
	});
});
