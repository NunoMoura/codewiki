import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	appendPlannedTriggerRuns,
	createRuntimeHeartbeatQueue,
	planDueTriggerHeartbeats,
	planRuntimeTriggerRuns,
	HeartbeatCycleAppendError,
	runHeartbeatCycle,
	runtimeHeartbeatKey,
	runtimeHeartbeatPriority,
} from "../../src/runtime/coordinator/index.ts";
import { readTrace, traceFilePath } from "../../src/api/traces.ts";

function triggerView(overrides = {}) {
	return {
		generatedAt: "2026-06-11T00:00:00.000Z",
		traceIds: ["TRACE-trigger"],
		summary: {
			planned: 0,
			enabled: 1,
			due: 0,
			active: 0,
			completed: 0,
			blocked: 0,
			disabled: 0,
		},
		triggers: [trigger(overrides)],
	};
}

function trigger(overrides = {}) {
	return {
		id: "TRG-ci",
		status: "enabled",
		traceId: "TRACE-trigger",
		traceTitle: "CI trigger",
		workUnitId: "WU-ci",
		planningRef: "trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
		changeRefs: ["trace:TRACE-trigger:decision:iteration:1#change:CHG-ci"],
		pathScopes: ["src/runtime/coordinator"],
		trigger: {
			id: "TRG-ci",
			kind: "schedule",
			runMode: "new_trace",
			concurrency: "skip_if_active",
			runKeyTemplate: "ci:${week}",
			owner: "implementation",
			trigger: "cron:0 9 * * 1",
			refs: ["kb:system/components/runtime.md"],
		},
		enabledBy: ["trace:TRACE-trigger:implementation:iteration:1#change:IC-ci"],
		runs: [],
		qualityBlockers: [],
		refs: [
			"TRACE-trigger",
			"trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
			"kb:system/components/runtime.md",
		],
		sourceEventId: "TRACE-trigger:planning:iteration:1",
		...overrides,
		trigger: {
			id: "TRG-ci",
			kind: "schedule",
			runMode: "new_trace",
			concurrency: "skip_if_active",
			runKeyTemplate: "ci:${week}",
			owner: "implementation",
			trigger: "cron:0 9 * * 1",
			refs: ["kb:system/components/runtime.md"],
			...(overrides.trigger || {}),
		},
	};
}

describe("runtime coordinator heartbeat queue", () => {
	it("coalesces heartbeats by the most specific target", () => {
		assert.equal(
			runtimeHeartbeatKey({ source: "manual", intent: "manual" }),
			"repo",
		);
		assert.equal(
			runtimeHeartbeatKey({
				source: "manual",
				intent: "manual",
				traceId: "TRACE-a",
			}),
			"trace:TRACE-a",
		);
		assert.equal(
			runtimeHeartbeatKey({
				source: "schedule",
				intent: "scheduled",
				traceId: "TRACE-a",
				triggerId: "TRG-a",
			}),
			"trigger:TRG-a",
		);
		assert.equal(
			runtimeHeartbeatKey({
				source: "worker",
				intent: "event",
				traceId: "TRACE-a",
				triggerId: "TRG-a",
				workUnitId: "WU-a",
			}),
			"work:WU-a",
		);
	});

	it("keeps higher-priority heartbeats while merging refs and data", () => {
		const queue = createRuntimeHeartbeatQueue({ now: () => 100 });
		queue.request({
			source: "schedule",
			intent: "scheduled",
			triggerId: "TRG-ci",
			reason: "interval",
			refs: ["trace:TRACE-trigger:planning:iteration:1#work:WU-ci"],
			data: { scheduled: true },
		});
		const merged = queue.request({
			source: "manual",
			intent: "manual",
			triggerId: "TRG-ci",
			reason: "user-request",
			requestedAt: 120,
			refs: ["TRACE-manual"],
			data: { manual: true },
		});

		assert.equal(queue.size, 1);
		assert.equal(merged.source, "manual");
		assert.equal(merged.intent, "manual");
		assert.equal(merged.reason, "user-request");
		assert.equal(merged.coalescedCount, 2);
		assert.deepEqual(merged.refs, [
			"trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
			"TRACE-manual",
		]);
		assert.deepEqual(merged.data, { scheduled: true, manual: true });
	});

	it("drains highest priority first without making a daemon", () => {
		let now = 0;
		const queue = createRuntimeHeartbeatQueue({ now: () => now });
		now = 10;
		queue.request({
			source: "schedule",
			intent: "scheduled",
			triggerId: "TRG-a",
		});
		now = 20;
		queue.request({ source: "retry", intent: "retry", traceId: "TRACE-r" });
		now = 30;
		queue.request({ source: "webhook", intent: "event", traceId: "TRACE-e" });
		now = 40;
		queue.request({ source: "manual", intent: "manual", traceId: "TRACE-m" });

		assert.deepEqual(
			queue.peek().map((heartbeat) => heartbeat.intent),
			["manual", "event", "scheduled", "retry"],
		);
		assert.deepEqual(
			queue.drain().map((heartbeat) => heartbeat.key),
			["trace:TRACE-m", "trace:TRACE-e", "trigger:TRG-a", "trace:TRACE-r"],
		);
		assert.equal(queue.size, 0);
	});

	it("orders equal-priority heartbeats by request time", () => {
		const queue = createRuntimeHeartbeatQueue();
		queue.request({
			source: "webhook",
			intent: "event",
			traceId: "TRACE-late",
			requestedAt: 20,
		});
		queue.request({
			source: "hook",
			intent: "event",
			traceId: "TRACE-early",
			requestedAt: 10,
		});

		assert.deepEqual(
			queue.drain().map((heartbeat) => heartbeat.traceId),
			["TRACE-early", "TRACE-late"],
		);
	});

	it("exposes priority without tying runtime coordination to heartbeat wording", () => {
		assert.ok(
			runtimeHeartbeatPriority("manual") >
				runtimeHeartbeatPriority("scheduled"),
		);
		assert.ok(
			runtimeHeartbeatPriority("event") > runtimeHeartbeatPriority("retry"),
		);
	});

	it("plans trigger run trace heads from targeted heartbeats", () => {
		const queue = createRuntimeHeartbeatQueue({ now: () => 100 });
		queue.request({
			source: "schedule",
			intent: "scheduled",
			triggerId: "TRG-ci",
			reason: "weekly-ci",
			refs: ["kb:system/components/runtime.md"],
			data: {
				runKey: "ci:2026-W24",
				traceId: "TRACE-ci-2026-W24",
				sourceRef: "kb:system/components/runtime.md",
			},
		});

		const plan = planRuntimeTriggerRuns({
			triggers: triggerView(),
			heartbeats: queue.drain(),
			createdAt: "2026-06-11T00:00:00.000Z",
		});

		assert.equal(plan.heartbeatCount, 1);
		assert.equal(plan.starts.length, 1);
		assert.equal(plan.skipped.length, 0);
		assert.equal(plan.starts[0].traceId, "TRACE-ci-2026-W24");
		assert.equal(plan.starts[0].runKey, "ci:2026-W24");
		assert.equal(plan.traceHeads[0].type, "trace_head");
		assert.equal(plan.traceHeads[0].origin.kind, "trigger_run");
		assert.equal(plan.traceHeads[0].origin.triggerId, "TRG-ci");
		assert.equal(plan.traceHeads[0].origin.triggerTraceId, "TRACE-trigger");
	});

	it("does not invent trigger runs from untargeted heartbeats", () => {
		const queue = createRuntimeHeartbeatQueue();
		queue.request({ source: "session-open", intent: "immediate" });

		const plan = planRuntimeTriggerRuns({
			triggers: triggerView(),
			heartbeats: queue.drain(),
		});

		assert.equal(plan.starts.length, 0);
		assert.equal(plan.skipped[0].reason, "no_trigger_target");
	});

	it("honors skip_if_active trigger concurrency", () => {
		const queue = createRuntimeHeartbeatQueue();
		queue.request({
			source: "schedule",
			intent: "scheduled",
			triggerId: "TRG-ci",
			data: { runKey: "ci:2026-W25" },
		});

		const plan = planRuntimeTriggerRuns({
			triggers: triggerView({
				status: "active",
				runs: [
					{
						traceId: "TRACE-ci-active",
						status: "needs_decision",
						closed: false,
						triggerTraceId: "TRACE-trigger",
						triggerId: "TRG-ci",
						planningRef: "trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
						runKey: "ci:2026-W24",
						refs: ["TRACE-trigger"],
					},
				],
			}),
			heartbeats: queue.drain(),
		});

		assert.equal(plan.starts.length, 0);
		assert.deepEqual(
			plan.skipped.map((item) => item.reason),
			["active_skip_if_active"],
		);
	});

	it("skips duplicate trigger run keys", () => {
		const queue = createRuntimeHeartbeatQueue();
		queue.request({
			source: "schedule",
			intent: "scheduled",
			triggerId: "TRG-ci",
			data: { runKey: "ci:2026-W24" },
		});

		const plan = planRuntimeTriggerRuns({
			triggers: triggerView({
				status: "completed",
				runs: [
					{
						traceId: "TRACE-ci-complete",
						status: "closed_complete",
						closed: true,
						triggerTraceId: "TRACE-trigger",
						triggerId: "TRG-ci",
						planningRef: "trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
						runKey: "ci:2026-W24",
						refs: ["TRACE-trigger"],
					},
				],
			}),
			heartbeats: queue.drain(),
		});

		assert.equal(plan.starts.length, 0);
		assert.equal(plan.skipped[0].reason, "duplicate_run");
	});

	it("appends planned trigger run trace heads with no-existing-file guard", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-trigger-run-"));
		try {
			const queue = createRuntimeHeartbeatQueue({ now: () => 100 });
			queue.request({
				source: "schedule",
				intent: "scheduled",
				triggerId: "TRG-ci",
				data: {
					runKey: "ci:2026-W24",
					traceId: "TRACE-ci-2026-W24",
				},
			});
			const plan = planRuntimeTriggerRuns({
				triggers: triggerView(),
				heartbeats: queue.drain(),
				createdAt: "2026-06-11T00:00:00.000Z",
			});

			const result = await appendPlannedTriggerRuns({ repoRoot: root, plan });
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-ci-2026-W24")),
			);

			assert.equal(result.started.length, 1);
			assert.equal(result.blocked.length, 0);
			assert.equal(result.skipped.length, 0);
			assert.equal(result.started[0].previousBytes, 0);
			assert.equal(readBack.records.length, 1);
			assert.equal(readBack.head.origin.kind, "trigger_run");
			assert.equal(readBack.head.origin.runKey, "ci:2026-W24");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("blocks planned trigger run append when trace file exists", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-trigger-run-exists-"));
		try {
			const queue = createRuntimeHeartbeatQueue();
			queue.request({
				source: "schedule",
				intent: "scheduled",
				triggerId: "TRG-ci",
				data: {
					runKey: "ci:2026-W24",
					traceId: "TRACE-ci-2026-W24",
				},
			});
			const plan = planRuntimeTriggerRuns({
				triggers: triggerView(),
				heartbeats: queue.drain(),
			});

			const first = await appendPlannedTriggerRuns({ repoRoot: root, plan });
			const second = await appendPlannedTriggerRuns({ repoRoot: root, plan });

			assert.equal(first.started.length, 1);
			assert.equal(second.started.length, 0);
			assert.equal(second.blocked.length, 1);
			assert.equal(second.blocked[0].reason, "trace_already_exists");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("returns skipped and blocked trigger run append results without inventing traces", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-trigger-run-blocked-"));
		try {
			const duplicateQueue = createRuntimeHeartbeatQueue();
			duplicateQueue.request({
				source: "schedule",
				intent: "scheduled",
				triggerId: "TRG-ci",
				data: { runKey: "ci:2026-W24" },
			});
			const skippedPlan = planRuntimeTriggerRuns({
				triggers: triggerView({
					status: "completed",
					runs: [
						{
							traceId: "TRACE-ci-complete",
							status: "closed_complete",
							closed: true,
							triggerTraceId: "TRACE-trigger",
							triggerId: "TRG-ci",
							planningRef:
								"trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
							runKey: "ci:2026-W24",
							refs: ["TRACE-trigger"],
						},
					],
				}),
				heartbeats: duplicateQueue.drain(),
			});
			const skipped = await appendPlannedTriggerRuns({
				repoRoot: root,
				plan: skippedPlan,
			});

			assert.equal(skipped.started.length, 0);
			assert.equal(skipped.skipped[0].reason, "duplicate_run");

			const queue = createRuntimeHeartbeatQueue();
			queue.request({
				source: "schedule",
				intent: "scheduled",
				triggerId: "TRG-ci",
				data: { runKey: "ci:2026-W25" },
			});
			const plan = planRuntimeTriggerRuns({
				triggers: triggerView(),
				heartbeats: queue.drain(),
			});
			const badPlan = {
				...plan,
				starts: [
					{
						...plan.starts[0],
						head: { ...plan.starts[0].head, traceId: "TRACE-mismatch" },
					},
				],
			};

			const blocked = await appendPlannedTriggerRuns({
				repoRoot: root,
				plan: badPlan,
			});

			assert.equal(blocked.started.length, 0);
			assert.equal(blocked.blocked[0].reason, "invalid_trace_head");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("plans scheduled heartbeats from due triggers", () => {
		const plan = planDueTriggerHeartbeats(
			triggerView({
				status: "due",
				due: {
					status: "due",
					reason: "scheduled_run_missing",
					scheduledAt: "2026-06-15T09:00Z",
					runKey: "ci:2026-W25",
					traceId: "TRACE-ci-2026-W25",
				},
			}),
		);

		assert.equal(plan.heartbeats.length, 1);
		assert.equal(plan.skipped.length, 0);
		assert.equal(plan.heartbeats[0].source, "schedule");
		assert.equal(plan.heartbeats[0].intent, "scheduled");
		assert.equal(plan.heartbeats[0].triggerId, "TRG-ci");
		assert.equal(plan.heartbeats[0].data.runKey, "ci:2026-W25");
		assert.equal(plan.heartbeats[0].data.traceId, "TRACE-ci-2026-W25");
	});

	it("runs heartbeat cycle with due trigger heartbeats", async () => {
		const queue = createRuntimeHeartbeatQueue();
		const result = await runHeartbeatCycle({
			queue,
			triggers: triggerView({
				status: "due",
				due: {
					status: "due",
					reason: "scheduled_run_missing",
					scheduledAt: "2026-06-15T09:00Z",
					runKey: "ci:2026-W25",
					traceId: "TRACE-ci-2026-W25",
				},
			}),
			includeDueTriggers: true,
		});

		assert.equal(queue.size, 0);
		assert.equal(result.dueTriggers.heartbeats.length, 1);
		assert.equal(result.heartbeats.length, 1);
		assert.equal(result.plan.starts.length, 1);
		assert.equal(result.plan.starts[0].traceId, "TRACE-ci-2026-W25");
	});

	it("runs heartbeat cycle preview by draining heartbeats and planning runs without writes", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-coordinator-preview-"));
		try {
			const queue = createRuntimeHeartbeatQueue();
			queue.request({
				source: "schedule",
				intent: "scheduled",
				triggerId: "TRG-ci",
				data: {
					runKey: "ci:2026-W24",
					traceId: "TRACE-ci-2026-W24",
				},
			});

			const result = await runHeartbeatCycle({
				queue,
				triggers: triggerView(),
				createdAt: "2026-06-11T00:00:00.000Z",
			});

			assert.equal(result.mode, "preview");
			assert.equal(queue.size, 0);
			assert.equal(result.heartbeats.length, 1);
			assert.equal(result.plan.starts.length, 1);
			await assert.rejects(
				() => readTrace(join(root, traceFilePath("TRACE-ci-2026-W24"))),
				/ENOENT/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("runs heartbeat cycle append by draining heartbeats and appending run traces", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-coordinator-append-"));
		try {
			const queue = createRuntimeHeartbeatQueue();
			queue.request({
				source: "schedule",
				intent: "scheduled",
				triggerId: "TRG-ci",
				data: {
					runKey: "ci:2026-W24",
					traceId: "TRACE-ci-2026-W24",
				},
			});

			const result = await runHeartbeatCycle({
				mode: "append",
				repoRoot: root,
				queue,
				triggers: triggerView(),
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-ci-2026-W24")),
			);

			assert.equal(queue.size, 0);
			assert.equal(result.mode, "append");
			assert.equal(result.plan.starts.length, 1);
			assert.equal(result.appendResult?.started.length, 1);
			assert.equal(readBack.head.origin.runKey, "ci:2026-W24");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("requires repo root for heartbeat cycle append mode", async () => {
		const queue = createRuntimeHeartbeatQueue();
		queue.request({
			source: "schedule",
			intent: "scheduled",
			triggerId: "TRG-ci",
			data: { runKey: "ci:2026-W24" },
		});

		await assert.rejects(
			() =>
				runHeartbeatCycle({
					mode: "append",
					queue,
					triggers: triggerView(),
				}),
			HeartbeatCycleAppendError,
		);
		assert.equal(queue.size, 1);
	});

	it("allows queued trigger concurrency while active run exists", () => {
		const queue = createRuntimeHeartbeatQueue();
		queue.request({
			source: "schedule",
			intent: "scheduled",
			triggerId: "TRG-ci",
			data: { runKey: "ci:2026-W25" },
		});

		const plan = planRuntimeTriggerRuns({
			triggers: triggerView({
				status: "active",
				trigger: { concurrency: "queue" },
				runs: [
					{
						traceId: "TRACE-ci-active",
						status: "needs_decision",
						closed: false,
						triggerTraceId: "TRACE-trigger",
						triggerId: "TRG-ci",
						planningRef: "trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
						runKey: "ci:2026-W24",
						refs: ["TRACE-trigger"],
					},
				],
			}),
			heartbeats: queue.drain(),
		});

		assert.equal(plan.starts.length, 1);
		assert.equal(plan.starts[0].traceId, "TRACE-TRG-ci-ci-2026-W25");
	});
});
