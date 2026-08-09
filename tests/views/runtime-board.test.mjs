import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRuntimeBoard } from "../../src/api/views.ts";
import { planningQualityStandards } from "../helpers/canonical-loop-events.mjs";

function workItem(id, status, overrides = {}) {
	return {
		id,
		kind: "work-unit",
		status,
		traceId: overrides.traceId || "TRACE-runtime-board",
		title: overrides.title || id,
		traceRefs: overrides.traceRefs || [`trace:${id}`],
		changeRefs: overrides.changeRefs || ["trace:decision#change:CHG-board"],
		planningRefs: overrides.planningRefs || [`trace:planning#work:${id}`],
		componentRefs: overrides.componentRefs || ["runtime"],
		pathScopes: overrides.pathScopes || [`src/${id}.ts`],
		dependsOn: overrides.dependsOn || [],
		blockers: overrides.blockers || [],
		qualityStandards:
			overrides.qualityStandards || planningQualityStandards([]),
		qualityBlockers: overrides.qualityBlockers || [],
		sourceEventId: overrides.sourceEventId || `trace:planning:${id}`,
		...(overrides.claimedBy ? { claimedBy: overrides.claimedBy } : {}),
		...(overrides.claimExpiresAt
			? { claimExpiresAt: overrides.claimExpiresAt }
			: {}),
	};
}

function workQueue() {
	const items = [
		workItem("WU-ready-a", "ready", { pathScopes: ["src/a.ts"] }),
		workItem("WU-ready-b", "ready", { pathScopes: ["src/b.ts"] }),
		workItem("WU-claimed", "claimed", {
			pathScopes: ["src/c.ts"],
			claimedBy: "worker-1",
		}),
		workItem("WU-blocked", "blocked", {
			pathScopes: ["src/d.ts"],
			blockers: ["Needs implementation evidence."],
		}),
	];
	return {
		generatedAt: "2026-06-16T00:00:00.000Z",
		traceIds: ["TRACE-runtime-board"],
		summary: {
			backlog: 0,
			waiting: 0,
			ready: 2,
			claimed: 1,
			blocked: 1,
			done: 0,
		},
		items,
	};
}

function traceBoard() {
	return {
		generatedAt: "2026-06-16T00:00:00.000Z",
		traceIds: ["TRACE-runtime-board"],
		summary: {
			needs_decision: 0,
			needs_planning: 0,
			needs_implementation: 1,
			blocked: 0,
			deferred: 0,
			finished: 0,
			closed_complete: 0,
			closed_incomplete: 0,
		},
		traces: [
			{
				traceId: "TRACE-runtime-board",
				status: "needs_implementation",
				closable: false,
				closed: false,
				changeRefs: [],
				plannedChangeRefs: [],
				unresolvedChangeRefs: [],
				deferredChangeRefs: [],
				workUnitRefs: ["trace:planning#work:WU-ready-a"],
				incompleteWorkUnitRefs: ["trace:planning#work:WU-ready-a"],
				pathScopes: ["src/a.ts"],
				blockers: [],
			},
		],
		conflicts: [
			{
				leftTraceId: "TRACE-runtime-board",
				rightTraceId: "TRACE-other",
				pathScope: "src/a.ts",
				message: "Active traces overlap on src/a.ts.",
			},
		],
	};
}

function triggers() {
	return {
		generatedAt: "2026-06-16T00:00:00.000Z",
		traceIds: ["TRACE-runtime-board"],
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
				id: "TRG-board",
				status: "due",
				traceId: "TRACE-runtime-board",
				workUnitId: "WU-ready-a",
				planningRef: "trace:planning#work:WU-ready-a",
				changeRefs: [],
				pathScopes: ["src/a.ts"],
				trigger: {
					id: "TRG-board",
					kind: "schedule",
					runMode: "new_trace",
					concurrency: "skip_if_active",
					runKeyTemplate: "board:${date}",
					owner: "implementation",
					trigger: "cron:0 9 * * 1",
					refs: ["kb:system/components/runtime.md"],
				},
				enabledBy: ["trace:implementation#change:IC-board"],
				due: {
					status: "due",
					reason: "scheduled_run_missing",
					runKey: "board:2026-06-16",
					traceId: "TRACE-board-run",
				},
				runs: [],
				qualityBlockers: [],
				refs: ["TRACE-runtime-board", "trace:planning#work:WU-ready-a"],
				sourceEventId: "trace:planning:board",
			},
		],
	};
}

describe("runtime board view", () => {
	it("aggregates runtime-visible trace, queue, trigger, and preview state", () => {
		const board = buildRuntimeBoard({
			traceBoard: traceBoard(),
			workQueue: workQueue(),
			triggers: triggers(),
			maxWorkers: 2,
			runtimeResultPreview: {
				policy: {
					maxParallelClaims: 2,
					automation: "assist",
					agency: "operate",
					worktreeIsolation: "none",
					worktrees: [],
					appendAllowed: false,
					blockers: ["Missing expected trace bytes for TRACE-runtime-board."],
					qualityBlockedWorkUnitIds: [],
				},
				heartbeatPolicy: {
					automation: "assist",
					agency: "operate",
					appendAllowed: false,
					blockers: ["Missing repoRoot for heartbeat cycle append."],
				},
				heartbeatCycle: {
					mode: "preview",
					heartbeats: [],
					plan: {
						heartbeatCount: 1,
						starts: [
							{
								traceId: "TRACE-board-run",
								title: "Board run",
								triggerId: "TRG-board",
								triggerTraceId: "TRACE-runtime-board",
								planningRef: "trace:planning#work:WU-ready-a",
								runKey: "board:2026-06-16",
								heartbeatKey: "trigger:TRG-board",
								heartbeatIntent: "scheduled",
								refs: ["TRG-board"],
								head: { type: "trace_head", traceId: "TRACE-board-run" },
							},
						],
						skipped: [
							{
								heartbeatKey: "trigger:TRG-skipped",
								heartbeatIntent: "scheduled",
								reason: "duplicate_run",
								message: "Run already exists.",
								refs: ["TRG-skipped"],
								triggerId: "TRG-skipped",
								traceId: "TRACE-runtime-board",
							},
						],
						traceHeads: [],
					},
				},
				leaseExpirations: {
					policy: {
						automation: "assist",
						agency: "operate",
						appendAllowed: false,
						blockers: ["Missing repoRoot for lease expiration append."],
					},
					batch: {
						nextSequenceByTrace: { "TRACE-runtime-board": 4 },
						events: [
							{
								type: "trace_event",
								id: "TRACE-runtime-board:runtime:lease-expired:1",
								parentId: "TRACE-runtime-board:runtime:claim:1",
								traceId: "TRACE-runtime-board",
								sequence: 3,
								event: "runtime.work_unit.claim.expired",
								refs: ["TRACE-runtime-board:runtime:claim:1"],
								createdAt: "2026-06-16T00:00:00.000Z",
								data: { claimId: "claim-1" },
							},
						],
					},
				},
			},
		});

		assert.equal(board.summary.openTraces, 1);
		assert.equal(board.summary.readyWorkUnits, 2);
		assert.equal(board.summary.claimedWorkUnits, 1);
		assert.equal(board.summary.activeClaims, 1);
		assert.equal(board.summary.selectedClaims, 1);
		assert.equal(board.summary.heldClaims, 1);
		assert.equal(board.summary.dueTriggers, 1);
		assert.equal(board.summary.plannedRuns, 1);
		assert.equal(board.summary.expiredLeases, 1);
		assert.equal(board.selectedClaims[0].workUnitId, "WU-ready-a");
		assert.equal(board.heldClaims[0].reason, "capacity");
		assert.deepEqual(
			board.blockers.map((blocker) => blocker.kind),
			[
				"trace_conflict",
				"work_unit_blocked",
				"runtime_policy",
				"heartbeat_policy",
				"lease_policy",
				"trigger_run_skip",
			],
		);
		assert.equal(
			board.nextActions.includes(
				"Append 1 expired work-unit claim release event(s).",
			),
			true,
		);
		assert.equal(
			board.nextActions.includes("Append 1 planned Run trace head(s)."),
			true,
		);
	});

	it("uses no-op next action when runtime board has no pending work", () => {
		const board = buildRuntimeBoard({
			traceBoard: {
				traceIds: [],
				summary: {
					needs_decision: 0,
					needs_planning: 0,
					needs_implementation: 0,
					blocked: 0,
					deferred: 0,
					finished: 0,
					closed_complete: 0,
					closed_incomplete: 0,
				},
				traces: [],
				conflicts: [],
			},
			workQueue: {
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
			},
			triggers: {
				traceIds: [],
				summary: {
					planned: 0,
					enabled: 0,
					due: 0,
					active: 0,
					completed: 0,
					blocked: 0,
					disabled: 0,
				},
				triggers: [],
			},
		});

		assert.deepEqual(board.nextActions, ["No runtime action pending."]);
	});
});
