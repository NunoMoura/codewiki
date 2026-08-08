import assert from "node:assert/strict";
import {
	appendFileSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProjectCoordinator } from "../../src/runtime/coordinator/project.ts";

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function turn() {
	await new Promise((resolve) => setImmediate(resolve));
}

function decisionJob(id, changeId, run) {
	return {
		idempotencyKey: id,
		lane: {
			kind: "decision",
			changeId,
			changeRevisionId: `sha256:${"1".repeat(64)}`,
		},
		run,
	};
}

test("project coordinator shares one supervised generation across Pi and dashboard clients", () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-clients-"));
	try {
		const events = [];
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:clients",
			onEvent: (event) => events.push(event),
		});
		const piOne = coordinator.connectClient({
			clientId: "pi:one",
			kind: "pi",
			supervision: "approved",
		});
		const piTwo = coordinator.connectClient({
			clientId: "pi:two",
			kind: "pi",
		});
		const dashboard = coordinator.connectClient({
			clientId: "dashboard:one",
			kind: "dashboard",
		});

		assert.deepEqual(coordinator.snapshot(), {
			projectRoot: root,
			generationId: "generation:clients",
			executionPolicy: "supervised",
			executionPermitted: true,
			clientCount: 3,
			supervisorCount: 1,
			recoveringJobCount: 0,
			queuedJobCount: 0,
			activeJobCount: 0,
			completedJobCount: 0,
			jobs: [],
		});
		assert.deepEqual(
			events.map((event) => [event.state, event.clientId]),
			[
				["client_connected", "pi:one"],
				["client_connected", "pi:two"],
				["client_connected", "dashboard:one"],
			],
		);

		piOne.disconnect();
		piTwo.disconnect();
		dashboard.disconnect();
		assert.equal(coordinator.snapshot().executionPermitted, false);
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("project coordinator runs unrelated Decisions concurrently and serializes one Change", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-decisions-"));
	try {
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:decisions",
			maxConcurrentJobs: 4,
		});
		coordinator.connectClient({
			clientId: "pi:supervisor",
			kind: "pi",
			supervision: "approved",
		});
		const releaseA = deferred();
		const releaseB = deferred();
		const startedA = deferred();
		const startedB = deferred();
		let active = 0;
		let maximumActive = 0;
		let secondAStarted = false;
		const run = (started, release, result) => async () => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			started.resolve();
			await release.promise;
			active -= 1;
			return result;
		};

		const firstA = coordinator.schedule(
			decisionJob("decision:A:1:first", "CHG-A", run(startedA, releaseA, "A")),
		);
		const firstB = coordinator.schedule(
			decisionJob("decision:B:1", "CHG-B", run(startedB, releaseB, "B")),
		);
		const secondA = coordinator.schedule(
			decisionJob("decision:A:1:second", "CHG-A", async () => {
				secondAStarted = true;
				return "A2";
			}),
		);

		await Promise.all([startedA.promise, startedB.promise]);
		assert.equal(maximumActive, 2);
		assert.equal(secondAStarted, false);
		assert.equal(coordinator.snapshot().activeJobCount, 2);
		assert.equal(coordinator.snapshot().queuedJobCount, 1);

		releaseA.resolve();
		assert.equal(await firstA, "A");
		assert.equal(await secondA, "A2");
		releaseB.resolve();
		assert.equal(await firstB, "B");
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("project coordinator serializes Planning and overlapping target resources", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-lanes-"));
	try {
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:lanes",
			maxConcurrentJobs: 4,
			executionPolicy: "unattended",
		});
		const planningRelease = deferred();
		const planningStarted = deferred();
		let secondPlanningStarted = false;
		const planningOne = coordinator.schedule({
			idempotencyKey: "planning:one",
			lane: { kind: "planning" },
			async run() {
				planningStarted.resolve();
				await planningRelease.promise;
				return "plan-one";
			},
		});
		const planningTwo = coordinator.schedule({
			idempotencyKey: "planning:two",
			lane: { kind: "planning" },
			run() {
				secondPlanningStarted = true;
				return "plan-two";
			},
		});
		await planningStarted.promise;
		assert.equal(secondPlanningStarted, false);

		const integrationRelease = deferred();
		const integrationStarted = deferred();
		let effectStarted = false;
		const integration = coordinator.schedule({
			idempotencyKey: "integration:web:base",
			lane: { kind: "integration", targetRef: "web", baseRef: "base:1" },
			async run() {
				integrationStarted.resolve();
				await integrationRelease.promise;
				return "integrated";
			},
		});
		const effect = coordinator.schedule({
			idempotencyKey: "effect:web",
			lane: { kind: "effect", targetRef: "web" },
			run() {
				effectStarted = true;
				return "committed";
			},
		});
		await integrationStarted.promise;
		assert.equal(effectStarted, false);

		planningRelease.resolve();
		integrationRelease.resolve();
		assert.deepEqual(
			await Promise.all([planningOne, planningTwo, integration, effect]),
			["plan-one", "plan-two", "integrated", "committed"],
		);
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("project coordinator holds conflicting Work Items while starting independent work", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-workers-"));
	try {
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:workers",
			maxConcurrentJobs: 3,
			executionPolicy: "unattended",
		});
		const releaseShared = deferred();
		const sharedStarted = deferred();
		const independentStarted = deferred();
		let overlappingStarted = false;
		const shared = coordinator.schedule({
			idempotencyKey: "assignment:shared",
			lane: { kind: "assignment", workItemId: "WI-shared" },
			conflictRefs: ["path:src/shared.ts"],
			async run() {
				sharedStarted.resolve();
				await releaseShared.promise;
				return "shared";
			},
		});
		const independent = coordinator.schedule({
			idempotencyKey: "assignment:independent",
			lane: { kind: "assignment", workItemId: "WI-independent" },
			conflictRefs: ["path:src/other.ts"],
			run() {
				independentStarted.resolve();
				return "independent";
			},
		});
		const overlapping = coordinator.schedule({
			idempotencyKey: "assignment:overlapping",
			lane: { kind: "assignment", workItemId: "WI-overlapping" },
			conflictRefs: ["path:src/shared.ts"],
			run() {
				overlappingStarted = true;
				return "overlapping";
			},
		});

		await Promise.all([sharedStarted.promise, independentStarted.promise]);
		await independent;
		assert.equal(overlappingStarted, false);
		assert.deepEqual(
			coordinator
				.snapshot()
				.jobs.find(
					(job) => job.idempotencyKey === "assignment:overlapping",
				),
			{
				idempotencyKey: "assignment:overlapping",
				lane: { kind: "assignment", workItemId: "WI-overlapping" },
				state: "queued",
				heldReason: "conflict",
				blockingJobKeys: ["assignment:shared"],
			},
		);
		releaseShared.resolve();
		assert.deepEqual(await Promise.all([shared, overlapping]), [
			"shared",
			"overlapping",
		]);
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("supervised policy keeps intake connected while pausing new execution", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-supervision-"));
	try {
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:supervision",
		});
		coordinator.connectClient({
			clientId: "dashboard:observer",
			kind: "dashboard",
		});
		let starts = 0;
		const first = coordinator.schedule(
			decisionJob("decision:supervised:first", "CHG-supervised", () => {
				starts += 1;
				return "first";
			}),
		);
		await turn();
		assert.equal(starts, 0);
		assert.equal(coordinator.snapshot().clientCount, 1);
		assert.equal(coordinator.snapshot().queuedJobCount, 1);
		assert.equal(
			coordinator.snapshot().jobs[0].heldReason,
			"supervision_required",
		);

		const supervisor = coordinator.connectClient({
			clientId: "pi:approved",
			kind: "pi",
			supervision: "approved",
		});
		assert.equal(await first, "first");
		supervisor.disconnect();
		const second = coordinator.schedule(
			decisionJob("decision:supervised:second", "CHG-supervised-2", () => {
				starts += 1;
				return "second";
			}),
		);
		await turn();
		assert.equal(starts, 1);
		assert.equal(coordinator.snapshot().executionPermitted, false);

		coordinator.setExecutionPolicy("unattended");
		assert.equal(await second, "second");
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("write jobs recover from durable evidence after coordinator restart", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-restart-"));
	const factsPath = join(root, "facts.jsonl");
	try {
		let runs = 0;
		const job = () => ({
			idempotencyKey: "write:decision:CHG-restart:1",
			lane: {
				kind: "decision",
				changeId: "CHG-restart",
				changeRevisionId: `sha256:${"2".repeat(64)}`,
			},
			effect: "write",
			recover() {
				try {
					const record = JSON.parse(readFileSync(factsPath, "utf8").trim());
					return { status: "completed", result: record.result };
				} catch (error) {
					if (error?.code === "ENOENT") return undefined;
					throw error;
				}
			},
			run() {
				runs += 1;
				const result = { accepted: true, eventId: "decision:CHG-restart:1" };
				appendFileSync(factsPath, `${JSON.stringify({ result })}\n`, "utf8");
				return result;
			},
		});

		const first = new ProjectCoordinator(root, {
			generationId: "generation:before-restart",
			executionPolicy: "unattended",
		});
		const firstResult = await first.schedule(job());
		first.close();

		const events = [];
		const restarted = new ProjectCoordinator(root, {
			generationId: "generation:after-restart",
			onEvent: (event) => events.push(event),
		});
		const recoveredResult = await restarted.schedule(job());
		assert.deepEqual(recoveredResult, firstResult);
		assert.equal(runs, 1);
		assert.equal(readFileSync(factsPath, "utf8").trim().split("\n").length, 1);
		assert.equal(events.some((event) => event.state === "job_recovered"), true);
		restarted.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("coordinator cancels active and queued jobs before closing", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-cancel-"));
	try {
		const events = [];
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:cancel",
			executionPolicy: "unattended",
			onEvent: (event) => events.push(event),
		});
		const started = deferred();
		const active = coordinator.schedule(
			decisionJob("decision:cancel-active", "CHG-cancel", async (signal) => {
				started.resolve();
				await new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), {
						once: true,
					});
				});
			}),
		);
		await started.promise;
		const queued = coordinator.schedule(
			decisionJob("decision:cancel-queued", "CHG-cancel", () => "never"),
		);
		const activeRejected = assert.rejects(active, /generation is stopping/);
		const queuedRejected = assert.rejects(queued, /generation is stopping/);

		await coordinator.cancelJobs("Coordinator generation is stopping.", 1_000);
		await Promise.all([activeRejected, queuedRejected]);
		assert.equal(coordinator.snapshot().jobs.length, 0);
		assert.deepEqual(
			events
				.filter((event) => event.state === "job_cancelled")
				.map((event) => event.idempotencyKey)
				.sort(),
			["decision:cancel-active", "decision:cancel-queued"],
		);
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("coordinator validates external inputs and keeps observation non-authoritative", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-validation-"));
	try {
		assert.throws(
			() =>
				new ProjectCoordinator(root, {
					executionPolicy: "unsupported",
				}),
			/Unsupported project coordinator execution policy/,
		);
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:validation",
			executionPolicy: "unattended",
			onEvent() {
				throw new Error("observer unavailable");
			},
		});
		assert.throws(
			() =>
				coordinator.connectClient({
					clientId: "invalid",
					kind: "unsupported",
				}),
			/Unsupported project coordinator client kind/,
		);
		assert.throws(
			() =>
				coordinator.schedule({
					idempotencyKey: "invalid-lane",
					lane: {kind: "unsupported"},
					run: () => "never",
				}),
			/Unsupported project coordinator lane/,
		);
		assert.throws(
			() =>
				coordinator.schedule({
					idempotencyKey: "legacy-decision-revision",
					lane: {kind: "decision", changeId: "CHG-old", revision: 1},
					run: () => "never",
				}),
			/decision lane received unsupported field revision/,
		);
		assert.throws(
			() =>
				coordinator.schedule({
					idempotencyKey: "invalid-decision-revision",
					lane: {
						kind: "decision",
						changeId: "CHG-invalid",
						changeRevisionId: "sha256:not-a-digest",
					},
					run: () => "never",
				}),
			/changeRevisionId must be a SHA-256 digest/,
		);
		await assert.rejects(
			coordinator.schedule({
				idempotencyKey: "invalid-recovery",
				lane: { kind: "planning" },
				effect: "write",
				recover: () => ({ status: "stale" }),
				run: () => "never",
			}),
			/must return completed result evidence/,
		);
		assert.equal(
			await coordinator.schedule(
				decisionJob("decision:observer-failure", "CHG-observer", () => "done"),
			),
			"done",
		);
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("write jobs require durable recovery and duplicate submissions share one run", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-idempotency-"));
	try {
		const coordinator = new ProjectCoordinator(root, {
			generationId: "generation:idempotency",
			executionPolicy: "unattended",
		});
		assert.throws(
			() =>
				coordinator.schedule({
					idempotencyKey: "write:without-recovery",
					lane: { kind: "planning" },
					effect: "write",
					run: () => "never",
				}),
			/requires durable recovery/,
		);

		const release = deferred();
		let runs = 0;
		const job = decisionJob("decision:deduplicated", "CHG-deduplicated", async () => {
			runs += 1;
			await release.promise;
			return "done";
		});
		const first = coordinator.schedule(job);
		const duplicate = coordinator.schedule(job);
		assert.equal(first, duplicate);
		assert.throws(
			() =>
				coordinator.schedule({
					...job,
					lane: { kind: "planning" },
				}),
			/reused for a different job/,
		);
		release.resolve();
		assert.equal(await first, "done");
		assert.equal(await coordinator.schedule(job), "done");
		assert.throws(
			() =>
				coordinator.schedule({
					...job,
					conflictRefs: ["path:other"],
				}),
			/reused for a different job/,
		);
		assert.equal(runs, 1);
		coordinator.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
