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
		changeRefs: ["trace:TRACE-control:decision:iteration:1"],
		plannedChangeRefs: [],
		unresolvedChangeRefs: ["trace:TRACE-control:decision:iteration:1"],
		deferredChangeRefs: [],
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

function enabledConfig(thinking = "medium") {
	return resolveWikiConfig({
		hosts: { pi: { enabled: true } },
		runtime: {
			modelRouting: {
				routes: [
					{
						id: "trace-host-test",
						provider: "test-provider",
						model: "test-model",
						thinking,
						quality: "standard",
						latency: "fast",
						timeoutMs: 60_000,
						pricing: {
							inputUsdPerMillion: 1,
							outputUsdPerMillion: 2,
							cacheReadUsdPerMillion: 0,
							cacheWriteUsdPerMillion: 0,
						},
						allowedTools: [
							"wiki_state",
							"wiki_plan",
							"wiki_implement",
							"wiki_archive",
						],
					},
				],
			},
		},
	});
}

function controlledFactory(result) {
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
				...(result
					? {
							completion: async () => ({
								exitCode: 0,
								signal: null,
								result,
							}),
						}
					: {}),
				stop(reason) {
					stopReasons.push(reason);
					running = false;
				},
			};
			controls.set(input.traceId, {
				stopReasons,
				finish: () => {
					running = false;
				},
			});
			return {
				traceId: input.traceId,
				target: input.target,
				sessionRef: `pi:${input.traceId}`,
				pid: 123,
				executionModel: {
					provider: "test-provider",
					model: "test-model",
					thinking: "medium",
				},
				controller,
			};
		},
	};
}

function harness(config = enabledConfig(), result) {
	const controlled = controlledFactory(result);
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
		assert.equal(card.executionPolicy.status, "selected");
		assert.equal(card.executionPolicy.selected.routeId, "trace-host-test");
		assert.equal(status.policy.qualityFloor, "standard");
		assert.match(status.policy.modelRoutingDigest, /^sha256:[a-f0-9]{64}$/);

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

	it("projects approval outcomes without granting approval authority", async () => {
		const traceResult = {
			version: 1,
			outcome: "needs_approval",
			summary: "Planning proposal is ready for review.",
			refs: ["trace:TRACE-control:decision:iteration:1"],
			sessionId: "pi-session-control",
			approval: {
				kind: "planning",
				proposalDigest: `sha256:${"b".repeat(64)}`,
			},
		};
		const { control, controlled } = harness(undefined, traceResult);
		const initial = (await control.status()).traces[0];
		await control.execute({
			action: "start",
			commandId: "command-outcome-001",
			traceId: initial.traceId,
			expectedStateDigest: initial.stateDigest,
		});
		controlled.controls.get(initial.traceId).finish();

		const completed = (await control.status()).traces[0];
		assert.deepEqual(completed.session.result, traceResult);
		assert.equal(completed.canCancel, false);
		assert.equal(completed.canStart, false);
		assert.equal(completed.canResume, true);
		assert.match(completed.blockers[0], /Exact user approval is required/);

		const resumed = await control.execute({
			action: "resume",
			commandId: "command-resume-001",
			traceId: completed.traceId,
			expectedStateDigest: completed.stateDigest,
			expectedSessionRef: completed.session.sessionRef,
			resumeAcknowledgement: "approval_completed_externally",
		});
		assert.equal(resumed.state.traces[0].canCancel, true);
		assert.equal(controlled.starts.length, 2);
		assert.equal(controlled.starts[1].resumeSessionId, "pi-session-control");
		assert.match(
			controlled.starts[1].prompt,
			/resume signal is not semantic approval/i,
		);
	});

	it("blocks resume when resolved model or thinking changed", async () => {
		const traceResult = {
			version: 1,
			outcome: "needs_approval",
			summary: "Planning proposal is ready for review.",
			refs: [],
			sessionId: "pi-session-model-change",
			approval: {
				kind: "planning",
				proposalDigest: `sha256:${"c".repeat(64)}`,
			},
		};
		const { control, controlled } = harness(enabledConfig("high"), traceResult);
		const initial = (await control.status()).traces[0];
		await control.execute({
			action: "start",
			commandId: "command-model-change-start",
			traceId: initial.traceId,
			expectedStateDigest: initial.stateDigest,
		});
		controlled.controls.get(initial.traceId).finish();

		const completed = (await control.status()).traces[0];
		assert.equal(completed.canResume, false);
		assert.match(completed.resumeBlockers.join(" "), /model policy changed/i);
	});

	it("rejects resume acknowledgement that does not match the outcome", async () => {
		const traceResult = {
			version: 1,
			outcome: "blocked",
			summary: "Waiting for external evidence.",
			refs: [],
			sessionId: "pi-session-blocked",
		};
		const { control, controlled } = harness(undefined, traceResult);
		const initial = (await control.status()).traces[0];
		await control.execute({
			action: "start",
			commandId: "command-blocked-start",
			traceId: initial.traceId,
			expectedStateDigest: initial.stateDigest,
		});
		controlled.controls.get(initial.traceId).finish();
		const blocked = (await control.status()).traces[0];

		await assert.rejects(
			control.execute({
				action: "resume",
				commandId: "command-blocked-resume",
				traceId: blocked.traceId,
				expectedStateDigest: blocked.stateDigest,
				expectedSessionRef: blocked.session.sessionRef,
				resumeAcknowledgement: "approval_completed_externally",
			}),
			/requires blocker_resolved_externally/,
		);
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

		const unrouted = harness(
			resolveWikiConfig({ hosts: { pi: { enabled: true } } }),
		);
		const unroutedCard = (await unrouted.control.status()).traces[0];
		assert.equal(unroutedCard.canStart, false);
		assert.equal(unroutedCard.executionPolicy.status, "blocked");
		assert.match(unroutedCard.blockers[0], /no untried route/i);

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
					action: "resume",
					commandId: "command-resume-missing",
					traceId: "TRACE-control",
					expectedStateDigest: `sha256:${"a".repeat(64)}`,
				}),
			/Resume requires expectedSessionRef and resumeAcknowledgement/,
		);
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
