import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	runSupervisedTraceHostDispatch,
	TraceHostSupervisor,
} from "../../src/runtime/trace-host-supervisor.ts";

function sessionInput(traceId = "TRACE-supervised", target = "planning") {
	return {
		repoRoot: "/repo",
		traceId,
		target,
		refs: [`trace:${traceId}:decision:iteration:1`],
		prompt: `Run ${target} for ${traceId}.`,
		supervisorId: "dashboard:123",
	};
}

function controlledFactory(options = {}) {
	const controls = new Map();
	const starts = [];
	const factory = async (input) => {
		starts.push(input);
		let running = true;
		const stopReasons = [];
		const controller = {
			isRunning() {
				if (options.monitorError) throw new Error("inspection unavailable");
				return running;
			},
			...(options.currentUsage
				? { currentUsage: () => options.currentUsage() }
				: {}),
			...(options.result
				? {
						completion: async () => ({
							exitCode: 0,
							signal: null,
							result: options.result,
						}),
					}
				: {}),
			stop(reason) {
				stopReasons.push(reason);
				running = false;
			},
		};
		controls.set(input.traceId, {
			controller,
			stopReasons,
			finish: () => {
				running = false;
			},
		});
		return {
			traceId: input.traceId,
			target: input.target,
			sessionRef: `pi:${input.traceId}`,
			pid: starts.length + 100,
			controller,
		};
	};
	return { factory, controls, starts };
}

function dispatchPlan(traceId = "TRACE-supervised") {
	return {
		role: "main",
		state: "active",
		actions: [
			{
				kind: "start_trace_host",
				traceId,
				targetLoop: "planning",
				message: `Start ${traceId}`,
				refs: [`trace:${traceId}:decision:iteration:1`],
			},
		],
		blockers: [],
		refs: [],
	};
}

describe("trace host supervisor", () => {
	it("reconciles registry state around guarded lifecycle dispatch", async () => {
		const supervisor = new TraceHostSupervisor();
		const controlled = controlledFactory();
		const started = await runSupervisedTraceHostDispatch({
			repoRoot: "/repo",
			plan: dispatchPlan(),
			supervision: { attached: true, supervisorId: "dashboard:123" },
			supervisor,
			startSession: controlled.factory,
		});
		assert.equal(started.dispatch.started.length, 1);
		assert.equal(started.sessions[0].state, "running");

		const stopped = await runSupervisedTraceHostDispatch({
			repoRoot: "/repo",
			plan: dispatchPlan(),
			supervision: { attached: false, supervisorId: "dashboard:123" },
			supervisor,
			startSession: controlled.factory,
		});
		assert.equal(stopped.dispatch.started.length, 0);
		assert.equal(stopped.dispatch.held.length, 1);
		assert.equal(stopped.sessions[0].stopReason, "supervision_lost");
	});

	it("deduplicates active traces and enforces host capacity", async () => {
		const supervisor = new TraceHostSupervisor({ maxTraceHosts: 1 });
		const controlled = controlledFactory();
		const first = await supervisor.start(
			sessionInput("TRACE-one"),
			controlled.factory,
		);
		const duplicate = await supervisor.start(
			sessionInput("TRACE-one"),
			controlled.factory,
		);

		assert.equal(duplicate, first);
		assert.equal(controlled.starts.length, 1);
		assert.deepEqual(supervisor.activeTraceIds(), ["TRACE-one"]);
		await assert.rejects(
			supervisor.start(sessionInput("TRACE-two"), controlled.factory),
			/Trace host capacity is full/,
		);
	});

	it("stops every active trace when supervision disappears", async () => {
		const supervisor = new TraceHostSupervisor({ maxTraceHosts: 2 });
		const controlled = controlledFactory();
		await supervisor.start(sessionInput("TRACE-one"), controlled.factory);
		await supervisor.start(
			sessionInput("TRACE-two", "implementation"),
			controlled.factory,
		);

		const snapshots = await supervisor.reconcile({
			supervisionAttached: false,
		});

		assert.deepEqual(supervisor.activeTraceIds(), []);
		assert.deepEqual(
			snapshots.map((snapshot) => [snapshot.traceId, snapshot.stopReason]),
			[
				["TRACE-one", "supervision_lost"],
				["TRACE-two", "supervision_lost"],
			],
		);
		assert.deepEqual(controlled.controls.get("TRACE-one").stopReasons, [
			"supervision_lost",
		]);
	});

	it("enforces elapsed-time budgets", async () => {
		let now = Date.parse("2026-07-12T12:00:00.000Z");
		const supervisor = new TraceHostSupervisor({
			maxSeconds: 10,
			now: () => now,
		});
		const controlled = controlledFactory();
		await supervisor.start(sessionInput(), controlled.factory);
		now += 9_999;
		assert.equal(
			(await supervisor.reconcile({ supervisionAttached: true }))[0].state,
			"running",
		);
		now += 1;

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.state, "stopped");
		assert.equal(snapshot.stopReason, "budget_exhausted");
		assert.deepEqual(snapshot.budgetExhaustion, {
			kind: "elapsed_time",
			observed: 10_000,
			limit: 10_000,
		});
		assert.match(snapshot.result.summary, /elapsed-time budget \(10000\/10000 ms\)/);
	});

	it("enforces millisecond latency budgets", async () => {
		let now = Date.parse("2026-07-12T12:00:00.000Z");
		const supervisor = new TraceHostSupervisor({
			maxLatencyMs: 500,
			now: () => now,
		});
		const controlled = controlledFactory();
		await supervisor.start(sessionInput(), controlled.factory);
		now += 500;

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.state, "stopped");
		assert.equal(snapshot.stopReason, "budget_exhausted");
		assert.deepEqual(snapshot.budgetExhaustion, {
			kind: "latency",
			observed: 500,
			limit: 500,
		});
		assert.match(snapshot.result.summary, /latency budget \(500\/500 ms\)/);
	});

	it("stops a running host when live usage reaches an economic limit", async () => {
		let usage = {
			input: 400,
			output: 100,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 500,
			cost: 0.1,
		};
		const supervisor = new TraceHostSupervisor({
			maxTokens: 1_000,
			maxCostUsd: 0.2,
		});
		const controlled = controlledFactory({ currentUsage: () => usage });
		await supervisor.start(sessionInput(), controlled.factory);
		assert.equal(
			(await supervisor.reconcile({ supervisionAttached: true }))[0].state,
			"running",
		);
		usage = { ...usage, totalTokens: 1_000, cost: 0.2 };

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.state, "stopped");
		assert.equal(snapshot.stopReason, "budget_exhausted");
		assert.equal(snapshot.usage.totalTokens, 1_000);
		assert.deepEqual(snapshot.budgetExhaustion, {
			kind: "tokens",
			observed: 1_000,
			limit: 1_000,
		});
		assert.match(snapshot.result.summary, /token budget \(1000\/1000 tokens\)/);
		assert.deepEqual(controlled.controls.get("TRACE-supervised").stopReasons, [
			"budget_exhausted",
		]);
	});

	it("observes natural completion without sending a stop", async () => {
		const supervisor = new TraceHostSupervisor();
		const controlled = controlledFactory();
		await supervisor.start(sessionInput(), controlled.factory);
		controlled.controls.get("TRACE-supervised").finish();

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.state, "stopped");
		assert.equal(snapshot.stopReason, undefined);
		assert.deepEqual(
			controlled.controls.get("TRACE-supervised").stopReasons,
			[],
		);
	});

	it("projects bounded natural completion results", async () => {
		const result = {
			version: 1,
			outcome: "needs_approval",
			summary: "Planning proposal requires user approval.",
			refs: ["trace:TRACE-supervised:decision:iteration:1"],
			sessionId: "pi-session-1",
			approval: {
				kind: "planning",
				proposalDigest: `sha256:${"a".repeat(64)}`,
			},
		};
		const supervisor = new TraceHostSupervisor();
		const controlled = controlledFactory({ result });
		await supervisor.start(sessionInput(), controlled.factory);
		controlled.controls.get("TRACE-supervised").finish();

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.deepEqual(snapshot.result, result);
		assert.equal(snapshot.state, "stopped");
	});

	it("blocks natural completion when token or monetary spend cannot be accepted", async () => {
		const overBudgetResult = {
			version: 1,
			outcome: "completed",
			summary: "Claimed completion.",
			refs: ["trace:TRACE-supervised:implementation:iteration:1"],
			usage: {
				input: 800,
				output: 300,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 1_100,
				cost: 0.21,
			},
		};
		const supervisor = new TraceHostSupervisor({
			maxTokens: 1_000,
			maxCostUsd: 0.2,
		});
		const controlled = controlledFactory({ result: overBudgetResult });
		await supervisor.start(sessionInput(), controlled.factory);
		controlled.controls.get("TRACE-supervised").finish();

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.result.outcome, "blocked");
		assert.match(snapshot.result.summary, /token spend 1100 exceeded 1000/);
		assert.match(snapshot.result.summary, /cost \$0\.21 exceeded \$0\.2/);
		assert.deepEqual(snapshot.result.usage, overBudgetResult.usage);
	});

	it("fails closed when configured economic budgets lack usage telemetry", async () => {
		const result = {
			version: 1,
			outcome: "completed",
			summary: "Claimed completion without telemetry.",
			refs: [],
		};
		const supervisor = new TraceHostSupervisor({ maxCostUsd: 1 });
		const controlled = controlledFactory({ result });
		await supervisor.start(sessionInput(), controlled.factory);
		controlled.controls.get("TRACE-supervised").finish();

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.result.outcome, "blocked");
		assert.match(snapshot.result.summary, /usage telemetry was missing/);
	});

	it("preserves process failure when usage telemetry is unavailable", async () => {
		const result = {
			version: 1,
			outcome: "failed",
			summary: "Trace host process ended unsuccessfully.",
			refs: [],
		};
		const supervisor = new TraceHostSupervisor({ maxCostUsd: 1 });
		const controlled = controlledFactory({ result });
		await supervisor.start(sessionInput(), controlled.factory);
		controlled.controls.get("TRACE-supervised").finish();

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.deepEqual(snapshot.result, result);
	});

	it("fails closed when process monitoring breaks", async () => {
		const supervisor = new TraceHostSupervisor();
		const controlled = controlledFactory({ monitorError: true });
		await supervisor.start(sessionInput(), controlled.factory);

		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.state, "stopped");
		assert.equal(snapshot.stopReason, "monitoring_failed");
		assert.match(snapshot.message, /inspection unavailable/);
	});

	it("retains failed stops as active until a later reconciliation succeeds", async () => {
		const supervisor = new TraceHostSupervisor();
		let running = true;
		let rejectStop = true;
		await supervisor.start(sessionInput(), async (input) => ({
			traceId: input.traceId,
			target: input.target,
			sessionRef: "pi:failed-stop",
			controller: {
				isRunning: () => running,
				stop() {
					if (rejectStop) throw new Error("stop unavailable");
					running = false;
				},
			},
		}));

		await assert.rejects(
			supervisor.cancel("TRACE-supervised", "pi:failed-stop"),
			/stop unavailable/,
		);
		assert.deepEqual(supervisor.activeTraceIds(), ["TRACE-supervised"]);
		assert.equal(supervisor.snapshot()[0].state, "failed");
		rejectStop = false;
		const snapshot = (
			await supervisor.reconcile({ supervisionAttached: true })
		)[0];
		assert.equal(snapshot.state, "stopped");
		assert.equal(snapshot.stopReason, "cancelled");
	});

	it("stops all sessions during supervisor shutdown", async () => {
		const supervisor = new TraceHostSupervisor();
		const controlled = controlledFactory();
		await supervisor.start(sessionInput(), controlled.factory);

		const snapshot = (await supervisor.stopAll())[0];
		assert.equal(snapshot.state, "stopped");
		assert.equal(snapshot.stopReason, "shutdown");
		assert.equal(snapshot.result.outcome, "blocked");
	});
});
