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
	});
});
