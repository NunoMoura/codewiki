import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiRuntime } from "../../src/api/wiki-runtime.ts";
import { planningQualityStandards } from "../../src/planning/quality-standards.ts";
import { createRuntimeClaimEvent } from "../../src/runtime/claims.ts";
import {
	appendTraceRecord,
	appendTraceRecords,
} from "../../src/traces/append.ts";
import { readTrace } from "../../src/traces/reader.ts";
import { traceFilePath } from "../../src/traces/schema.ts";
import { createTraceHead } from "../../src/traces/writer.ts";

function triggers() {
	return {
		generatedAt: "2026-06-15T10:00:00.000Z",
		traceIds: ["TRACE-trigger"],
		summary: {
			planned: 0,
			enabled: 0,
			due: 1,
			active: 0,
			completed: 0,
			blocked: 0,
			disabled: 0,
		},
		triggers: [
			{
				id: "TRG-ci",
				status: "due",
				traceId: "TRACE-trigger",
				traceTitle: "CI trigger",
				workUnitId: "WU-ci",
				planningRef: "trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
				decisionRefs: ["trace:TRACE-trigger:decision:iteration:1#row:DTR-ci"],
				pathScopes: ["src/runtime"],
				trigger: {
					id: "TRG-ci",
					kind: "schedule",
					runMode: "new_trace",
					concurrency: "skip_if_active",
					runKeyTemplate: "ci:${week}",
					owner: "implementation",
					trigger: "cron:0 9 * * 1",
					refs: ["kb:system/runtime.md"],
				},
				enabledBy: [
					"trace:TRACE-trigger:implementation:iteration:1#change:IC-ci",
				],
				enabledAt: "2026-06-11T00:00:00.000Z",
				due: {
					status: "due",
					reason: "scheduled_run_missing",
					scheduledAt: "2026-06-15T09:00Z",
					runKey: "ci:2026-W25",
					traceId: "TRACE-ci-2026-W25",
				},
				runs: [],
				qualityBlockers: [],
				refs: [
					"TRACE-trigger",
					"trace:TRACE-trigger:planning:iteration:1#work:WU-ci",
				],
				sourceEventId: "TRACE-trigger:planning:iteration:1",
			},
		],
	};
}

function emptyQueue() {
	return {
		traceIds: [],
		summary: {
			backlog: 0,
			waiting: 0,
			ready: 0,
			claimed: 0,
			blocked: 0,
			done: 0,
		},
		items: [],
	};
}

function expiredClaim(sequence = 8) {
	return createRuntimeClaimEvent({
		traceId: "TRACE-runtime",
		id: `TRACE-runtime:runtime:claim:expired:${sequence}`,
		parentId: null,
		sequence,
		createdAt: "2026-06-11T00:00:01.000Z",
		claimId: `claim-expired-${sequence}`,
		workerId: "worker-expired",
		workUnitId: "WU-runtime-a",
		planningRefs: ["TRACE-runtime:planning:work:1"],
		pathScopes: ["src/runtime/a.ts"],
		expiresAt: "2026-06-11T00:00:02.000Z",
	});
}

function queue() {
	return {
		traceIds: ["TRACE-runtime"],
		summary: {
			backlog: 0,
			waiting: 0,
			ready: 2,
			claimed: 0,
			blocked: 0,
			done: 0,
		},
		items: [
			{
				id: "WU-runtime-a",
				kind: "work-unit",
				status: "ready",
				traceId: "TRACE-runtime",
				title: "Runtime A",
				traceRefs: ["TRACE-runtime:planning:work:1"],
				decisionRefs: ["TRACE-runtime:decision:row:1"],
				planningRefs: ["TRACE-runtime:planning:work:1"],
				componentRefs: ["runtime"],
				pathScopes: ["src/runtime/a.ts"],
				dependsOn: [],
				blockers: [],
				qualityStandards: planningQualityStandards([]),
				qualityBlockers: [],
				sourceEventId: "TRACE-runtime:planning:work:1",
			},
			{
				id: "WU-runtime-b",
				kind: "work-unit",
				status: "ready",
				traceId: "TRACE-runtime",
				title: "Runtime B",
				traceRefs: ["TRACE-runtime:planning:work:2"],
				decisionRefs: ["TRACE-runtime:decision:row:1"],
				planningRefs: ["TRACE-runtime:planning:work:2"],
				componentRefs: ["runtime"],
				pathScopes: ["src/runtime/b.ts"],
				dependsOn: [],
				blockers: [],
				qualityStandards: planningQualityStandards([]),
				qualityBlockers: [],
				sourceEventId: "TRACE-runtime:planning:work:2",
			},
		],
	};
}

describe("wiki_runtime core facade", () => {
	it("previews work-unit claim selections and claim events", async () => {
		const result = await runWikiRuntime({
			mode: "preview",
			queue: queue(),
			maxWorkers: 1,
			createdAt: "2026-06-11T00:00:01.000Z",
			nextSequenceByTrace: { "TRACE-runtime": 1 },
		});

		assert.equal(result.mode, "preview");
		assert.equal(result.policy.appendAllowed, false);
		assert.equal(result.policy.automation, "manual");
		assert.equal(result.plan.selected.length, 1);
		assert.equal(result.plan.held.length, 1);
		assert.equal(result.batch?.events.length, 1);
		assert.equal(result.batch?.events[0].event, "runtime.work_unit.claimed");
		assert.deepEqual(result.batch?.nextSequenceByTrace, { "TRACE-runtime": 2 });
		assert.equal(result.append, undefined);
	});

	it("ignores raw decision items during work-unit claim selection", async () => {
		const mixedQueue = queue();
		mixedQueue.items.unshift({
			id: "DTR-runtime-decision",
			kind: "decision",
			status: "ready",
			traceId: "TRACE-runtime",
			title: "Raw decision should go through planning",
			traceRefs: ["TRACE-runtime:decision:iteration:1"],
			decisionRefs: ["TRACE-runtime:decision:iteration:1#row:DTR-runtime"],
			planningRefs: [],
			componentRefs: [],
			pathScopes: ["src/runtime/raw-decision.ts"],
			dependsOn: [],
			blockers: [],
			qualityStandards: [],
			qualityBlockers: [],
			sourceEventId: "TRACE-runtime:decision:iteration:1",
		});

		const result = await runWikiRuntime({
			mode: "preview",
			queue: mixedQueue,
			maxWorkers: 2,
			createdAt: "2026-06-11T00:00:01.000Z",
			nextSequenceByTrace: { "TRACE-runtime": 1 },
		});

		assert.deepEqual(
			result.plan.selected.map((item) => item.workUnitId),
			["WU-runtime-a", "WU-runtime-b"],
		);
		assert.equal(
			result.plan.selected.some(
				(item) => item.workUnitId === "DTR-runtime-decision",
			),
			false,
		);
	});

	it("uses config worker limits and blocks unsafe append attempts", async () => {
		const configured = await runWikiRuntime({
			mode: "preview",
			config: { runtime: { automation: "assist", maxWorkers: 2 } },
			queue: queue(),
		});
		const unsafeQueue = queue();
		unsafeQueue.items[0].qualityStandards = [];

		assert.equal(configured.plan.selected.length, 2);
		assert.equal(configured.policy.appendAllowed, true);
		assert.equal(configured.policy.worktreeIsolation, "none");
		await assert.rejects(
			() =>
				runWikiRuntime({
					mode: "append",
					config: { runtime: { automation: "assist" } },
					queue: unsafeQueue,
					nextSequenceByTrace: { "TRACE-runtime": 1 },
					expectedBytesByTrace: { "TRACE-runtime": 0 },
					repoRoot: ".",
				}),
			/quality policy/,
		);
		await assert.rejects(
			() =>
				runWikiRuntime({
					mode: "append",
					config: { runtime: { automation: "assist" } },
					queue: queue(),
					nextSequenceByTrace: { "TRACE-runtime": 1 },
					repoRoot: ".",
				}),
			/Missing expected trace bytes for TRACE-runtime/,
		);
	});

	it("plans configured worktrees and carries them into claim events", async () => {
		const result = await runWikiRuntime({
			mode: "preview",
			config: {
				project: "runtime-fixture",
				runtime: {
					automation: "assist",
					maxWorkers: 2,
					worktreeIsolation: "auto",
				},
			},
			repoRoot: "/tmp/repo/codewiki",
			queue: queue(),
			workerIdPrefix: "wt-worker",
			nextSequenceByTrace: { "TRACE-runtime": 1 },
		});

		assert.deepEqual(
			result.policy.worktrees.map((plan) => [plan.workUnitId, plan.reason]),
			[
				["WU-runtime-a", "parallel_claims"],
				["WU-runtime-b", "parallel_claims"],
			],
		);
		assert.equal(
			result.policy.worktrees[0].worktree?.branch,
			"codewiki/TRACE-runtime/WU-runtime-a/wt-worker-001",
		);
		assert.equal(
			result.batch?.events[0].data?.worktree?.branch,
			"codewiki/TRACE-runtime/WU-runtime-a/wt-worker-001",
		);
	});

	it("previews heartbeat cycle alongside work-unit claim selection runtime results", async () => {
		const result = await runWikiRuntime({
			mode: "preview",
			config: { runtime: { automation: "assist" } },
			queue: queue(),
			triggers: triggers(),
			includeDueTriggers: true,
			maxWorkers: 1,
		});

		assert.equal(result.action, "work-unit-claims");
		assert.equal(result.plan.selected.length, 1);
		assert.equal(result.heartbeatPolicy?.appendAllowed, true);
		assert.equal(result.heartbeatCycle?.dueTriggers?.heartbeats.length, 1);
		assert.equal(result.heartbeatCycle?.plan.starts.length, 1);
		assert.equal(
			result.heartbeatCycle?.plan.starts[0].traceId,
			"TRACE-ci-2026-W25",
		);
	});

	it("previews heartbeat cycle without selected claim candidates", async () => {
		const result = await runWikiRuntime({
			mode: "preview",
			queue: emptyQueue(),
			triggers: triggers(),
			includeDueTriggers: true,
		});

		assert.equal(result.action, "work-unit-claims");
		assert.equal(result.plan.selected.length, 0);
		assert.equal(result.heartbeatPolicy.automation, "manual");
		assert.equal(result.heartbeatCycle.heartbeats.length, 1);
		assert.equal(result.heartbeatCycle.plan.starts.length, 1);
	});

	it("appends heartbeat cycle run traces when runtime policy allows", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-heartbeat-cycle-"));
		try {
			const result = await runWikiRuntime({
				mode: "append",
				config: { runtime: { automation: "assist" } },
				repoRoot: root,
				queue: emptyQueue(),
				triggers: triggers(),
				includeDueTriggers: true,
				createdAt: "2026-06-15T10:00:00.000Z",
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-ci-2026-W25")),
			);

			assert.equal(result.heartbeatPolicy.appendAllowed, true);
			assert.equal(result.heartbeatCycle.appendResult?.started.length, 1);
			assert.equal(readBack.head.origin.kind, "trigger_run");
			assert.equal(readBack.head.origin.runKey, "ci:2026-W25");
			await assert.rejects(
				() =>
					runWikiRuntime({
						mode: "append",
						repoRoot: root,
						queue: emptyQueue(),
						triggers: triggers(),
						includeDueTriggers: true,
					}),
				/runtime\.automation is manual/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("previews lease expirations after selected work-unit claim events", async () => {
		const result = await runWikiRuntime({
			mode: "preview",
			config: { runtime: { automation: "assist" } },
			queue: queue(),
			maxWorkers: 1,
			createdAt: "2026-06-11T00:00:03.000Z",
			nextSequenceByTrace: { "TRACE-runtime": 9 },
			expireLeases: true,
			records: [expiredClaim()],
		});

		assert.equal(result.batch?.events[0].sequence, 9);
		assert.equal(result.leaseExpirations?.batch.events.length, 1);
		assert.equal(
			result.leaseExpirations?.batch.events[0].event,
			"runtime.work_unit.claim.expired",
		);
		assert.equal(result.leaseExpirations?.batch.events[0].sequence, 10);
		assert.deepEqual(result.leaseExpirations?.batch.nextSequenceByTrace, {
			"TRACE-runtime": 11,
		});
	});

	it("appends expired lease events through runtime backend", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-leases-"));
		try {
			const head = createTraceHead({
				traceId: "TRACE-runtime",
				title: "Runtime lease expiry",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const claim = expiredClaim(1);
			const seed = await appendTraceRecords(root, [head, claim], 0);
			const before = await readTrace(
				join(root, traceFilePath("TRACE-runtime")),
			);
			const result = await runWikiRuntime({
				mode: "append",
				config: { runtime: { automation: "assist" } },
				repoRoot: root,
				queue: emptyQueue(),
				createdAt: "2026-06-11T00:00:03.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 2 },
				expectedBytesByTrace: { "TRACE-runtime": seed.nextBytes },
				expireLeases: true,
				records: before.records,
			});
			const after = await readTrace(join(root, traceFilePath("TRACE-runtime")));

			assert.equal(result.leaseExpirations?.policy.appendAllowed, true);
			assert.equal(result.leaseExpirations?.batch.events.length, 1);
			assert.equal(result.leaseExpirations?.append?.events.length, 1);
			assert.equal(
				after.records.at(-1)?.event,
				"runtime.work_unit.claim.expired",
			);
			await assert.rejects(
				() =>
					runWikiRuntime({
						mode: "append",
						config: { runtime: { automation: "assist" } },
						repoRoot: root,
						queue: emptyQueue(),
						createdAt: "2026-06-11T00:00:03.000Z",
						nextSequenceByTrace: { "TRACE-runtime": 2 },
						expectedBytesByTrace: { "TRACE-runtime": seed.nextBytes },
						expireLeases: true,
						records: before.records,
					}),
				/append conflict/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends runtime claim events across trace files", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-wiki-runtime-"));
		try {
			const head = createTraceHead({
				traceId: "TRACE-runtime",
				title: "Runtime work-unit claims",
				createdAt: "2026-06-11T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);
			const result = await runWikiRuntime({
				repoRoot: root,
				mode: "append",
				config: { runtime: { automation: "assist" } },
				queue: queue(),
				maxWorkers: 2,
				createdAt: "2026-06-11T00:00:01.000Z",
				nextSequenceByTrace: { "TRACE-runtime": 1 },
				expectedBytesByTrace: { "TRACE-runtime": first.nextBytes },
			});
			const readBack = await readTrace(
				join(root, traceFilePath("TRACE-runtime")),
			);

			assert.equal(result.mode, "append");
			assert.equal(result.batch?.events.length, 2);
			assert.equal(result.append?.events.length, 2);
			assert.equal(readBack.records.at(-1)?.type, "trace_event");
			assert.equal(readBack.records.at(-1)?.event, "runtime.work_unit.claimed");
			await assert.rejects(
				() => runWikiRuntime({ mode: "append", queue: queue() }),
				/runtime\.automation is manual/,
			);
			await assert.rejects(
				() =>
					runWikiRuntime({
						mode: "append",
						config: { runtime: { automation: "assist" } },
						queue: queue(),
					}),
				/nextSequenceByTrace/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
