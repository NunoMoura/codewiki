import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createDashboardTraceHostControl,
	DashboardTraceHostControlError,
	parseDashboardTraceHostCommand,
} from "../../src/dashboard/trace-host-control.ts";
import { resolveWikiConfig } from "../../src/project/config.ts";
import { TraceHostSupervisor } from "../../src/runtime/trace-host-supervisor.ts";

function goal(overrides = {}) {
	return {
		traceId: "TRACE-control",
		status: "needs_planning",
		closable: false,
		closed: false,
		decisionRefs: ["trace:TRACE-control:decision:iteration:1"],
		plannedDecisionRefs: [],
		unresolvedDecisionRefs: ["trace:TRACE-control:decision:iteration:1"],
		deferredDecisionRefs: [],
		workUnitRefs: [],
		incompleteWorkUnitRefs: [],
		pathScopes: ["src/dashboard/**"],
		blockers: [],
		lastEventId: "TRACE-control:decision:iteration:1",
		...overrides,
	};
}

function board(trace = goal(), conflicts = []) {
	return {
		traceIds: [trace.traceId],
		summary: {
			needs_decision: 0,
			needs_planning: trace.status === "needs_planning" ? 1 : 0,
			needs_implementation: trace.status === "needs_implementation" ? 1 : 0,
			blocked: 0,
			finished: trace.status === "finished" ? 1 : 0,
			closed: trace.status === "closed" ? 1 : 0,
		},
		traces: [trace],
		conflicts,
	};
}

function controlledFactory() {
	const controls = new Map();
	const starts = [];
	return {
		starts,
		controls,
		factory: async (input) => {
			starts.push(input);
			let running = true;
			const stopReasons = [];
			const controller = {
				isRunning: () => running,
				stop(reason) {
					stopReasons.push(reason);
					running = false;
				},
			};
			controls.set(input.traceId, { stopReasons });
			return {
				traceId: input.traceId,
				target: input.target,
				sessionRef: `pi:${input.traceId}`,
				pid: 123,
				controller,
			};
		},
	};
}

function harness(config = resolveWikiConfig({ hosts: { pi: { enabled: true } } })) {
	const controlled = controlledFactory();
	const supervisor = new TraceHostSupervisor();
	let currentBoard = board();
	let tick = 0;
	const control = createDashboardTraceHostControl({
		repoRoot: "/repo",
		supervisorId: "dashboard:123",
		supervisor,
		startSession: controlled.factory,
		loadTraceBoard: async () => currentBoard,
		loadConfig: async () => config,
		now: () => new Date(Date.UTC(2026, 6, 12, 12, 0, tick++)),
	});
	return {
		control,
		controlled,
		supervisor,
		setBoard(value) {
			currentBoard = value;
		},
	};
}

describe("dashboard trace host control", () => {
	it("starts from exact state and returns an audit receipt", async () => {
		const { control, controlled } = harness();
		const status = await control.status();
		const card = status.traces[0];
		assert.equal(card.canStart, true);

		const result = await control.execute({
			action: "start",
			commandId: "command-start-001",
			traceId: card.traceId,
			expectedStateDigest: card.stateDigest,
		});

		assert.equal(result.replayed, false);
		assert.equal(result.receipt.action, "start");
		assert.equal(result.receipt.sessionRef, "pi:TRACE-control");
		assert.notEqual(
			result.receipt.stateDigestAfter,
			result.receipt.stateDigestBefore,
		);
		assert.equal(result.state.traces[0].canCancel, true);
		assert.equal(controlled.starts.length, 1);
		assert.match(controlled.starts[0].prompt, /Work only on this trace/);
	});

	it("replays identical command ids without starting twice", async () => {
		const { control, controlled } = harness();
		const card = (await control.status()).traces[0];
		const command = {
			action: "start",
			commandId: "command-replay-001",
			traceId: card.traceId,
			expectedStateDigest: card.stateDigest,
		};
		const first = await control.execute(command);
		const replay = await control.execute(command);

		assert.equal(first.replayed, false);
		assert.equal(replay.replayed, true);
		assert.equal(replay.receipt.receiptId, first.receipt.receiptId);
		assert.equal(controlled.starts.length, 1);
	});

	it("coalesces concurrent retries for one command id", async () => {
		const { control, controlled } = harness();
		const card = (await control.status()).traces[0];
		const command = {
			action: "start",
			commandId: "command-concurrent-001",
			traceId: card.traceId,
			expectedStateDigest: card.stateDigest,
		};
		const results = await Promise.all([
			control.execute(command),
			control.execute(command),
		]);

		assert.equal(controlled.starts.length, 1);
		assert.equal(results.filter((result) => result.replayed).length, 1);
		assert.equal(results.filter((result) => !result.replayed).length, 1);
	});

	it("rejects stale state and command-id payload changes", async () => {
		const { control } = harness();
		const card = (await control.status()).traces[0];
		await assert.rejects(
			control.execute({
				action: "start",
				commandId: "command-stale-001",
				traceId: card.traceId,
				expectedStateDigest: `sha256:${"0".repeat(64)}`,
			}),
			(error) =>
				error instanceof DashboardTraceHostControlError &&
				error.status === 409 &&
				/state changed/.test(error.message),
		);
		await control.execute({
			action: "start",
			commandId: "command-reused-001",
			traceId: card.traceId,
			expectedStateDigest: card.stateDigest,
		});
		await assert.rejects(
			control.execute({
				action: "cancel",
				commandId: "command-reused-001",
				traceId: card.traceId,
				expectedStateDigest: card.stateDigest,
				expectedSessionRef: "pi:TRACE-control",
			}),
			/already used for different input/,
		);
	});

	it("cancels only the exact active session", async () => {
		const { control, controlled } = harness();
		const initial = (await control.status()).traces[0];
		const started = await control.execute({
			action: "start",
			commandId: "command-start-002",
			traceId: initial.traceId,
			expectedStateDigest: initial.stateDigest,
		});
		const active = started.state.traces[0];
		await assert.rejects(
			control.execute({
				action: "cancel",
				commandId: "command-cancel-stale",
				traceId: active.traceId,
				expectedStateDigest: active.stateDigest,
				expectedSessionRef: "pi:other",
			}),
			/session changed/,
		);

		const cancelled = await control.execute({
			action: "cancel",
			commandId: "command-cancel-001",
			traceId: active.traceId,
			expectedStateDigest: active.stateDigest,
			expectedSessionRef: active.session.sessionRef,
		});
		assert.equal(cancelled.state.traces[0].canCancel, false);
		assert.deepEqual(controlled.controls.get(active.traceId).stopReasons, [
			"cancelled",
		]);
	});

	it("stops execution when dashboard supervision disconnects", async () => {
		const { control, controlled } = harness();
		const initial = (await control.status()).traces[0];
		await control.execute({
			action: "start",
			commandId: "command-supervision-001",
			traceId: initial.traceId,
			expectedStateDigest: initial.stateDigest,
		});

		await control.heartbeat(false);
		assert.deepEqual(controlled.controls.get(initial.traceId).stopReasons, [
			"supervision_lost",
		]);
		assert.equal((await control.status()).traces[0].canCancel, false);
	});

	it("reports policy and trace blockers without launching", async () => {
		const disabled = harness(resolveWikiConfig());
		const disabledCard = (await disabled.control.status()).traces[0];
		assert.equal(disabledCard.canStart, false);
		assert.deepEqual(disabledCard.blockers, ["hosts.pi.enabled is false."]);

		const conflicted = harness();
		conflicted.setBoard(
			board(goal(), [
				{
					leftTraceId: "TRACE-control",
					rightTraceId: "TRACE-other",
					pathScope: "src/dashboard/**",
					message: "Trace path conflict",
				},
			]),
		);
		const conflictCard = (await conflicted.control.status()).traces[0];
		assert.equal(conflictCard.canStart, false);
		assert.deepEqual(conflictCard.blockers, ["Trace path conflict"]);
	});

	it("strictly parses bounded command input", () => {
		assert.throws(
			() =>
				parseDashboardTraceHostCommand({
					action: "start",
					commandId: "command-001",
					traceId: "TRACE-control",
					expectedStateDigest: `sha256:${"a".repeat(64)}`,
					proposal: "forbidden",
				}),
			/Unsupported command field proposal/,
		);
	});
});
