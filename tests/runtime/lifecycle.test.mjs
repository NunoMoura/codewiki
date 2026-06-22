import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	appendRuntimeHostLifecycleEvents,
	createRuntimeHostLifecycleEvent,
	createRuntimeHostLifecycleEvents,
	planMainHostLifecycle,
	planTraceHostLifecycle,
} from "../../src/runtime/lifecycle.ts";
import { createTraceHead, formatTraceText } from "../../src/traces/writer.ts";
import { appendTraceRecords } from "../../src/traces/append.ts";
import { createCodewikiHostError } from "../../src/error-handling/host-errors.ts";

function goal(overrides = {}) {
	return {
		traceId: "TRACE-life",
		title: "Lifecycle trace",
		status: "needs_planning",
		closable: false,
		closed: false,
		decisionRefs: ["trace:TRACE-life:decision:iteration:1#row:DTR-life"],
		plannedDecisionRefs: [],
		unresolvedDecisionRefs: [
			"trace:TRACE-life:decision:iteration:1#row:DTR-life",
		],
		deferredDecisionRefs: [],
		workUnitRefs: [],
		incompleteWorkUnitRefs: [],
		pathScopes: ["src/runtime/**"],
		blockers: [],
		lastEventId: "TRACE-life:decision:iteration:1",
		...overrides,
	};
}

function board(overrides = {}) {
	const traces = overrides.traces || [goal()];
	return {
		generatedAt: "2026-06-19T00:00:00.000Z",
		traceIds: traces.map((trace) => trace.traceId),
		summary: {
			needs_decision: 0,
			needs_planning: traces.filter(
				(trace) => trace.status === "needs_planning",
			).length,
			needs_implementation: traces.filter(
				(trace) => trace.status === "needs_implementation",
			).length,
			blocked: traces.filter((trace) => trace.status === "blocked").length,
			deferred: traces.filter((trace) => trace.status === "deferred").length,
			finished: traces.filter((trace) => trace.status === "finished").length,
			closed_complete: 0,
			closed_incomplete: 0,
		},
		traces,
		conflicts: [],
		...overrides,
	};
}

function status(overrides = {}) {
	return {
		generatedAt: "2026-06-19T00:00:00.000Z",
		traceId: "TRACE-life",
		title: "Lifecycle trace",
		health: "yellow",
		currentLoop: "planning",
		readyForClosure: false,
		goalStatus: "needs_planning",
		lastEventId: "TRACE-life:decision:iteration:1",
		summary: {
			decisionEvents: 1,
			workUnits: 0,
			implementationChanges: 0,
			blockers: 0,
			conflicts: 0,
		},
		blockers: [],
		qualityBlockers: [],
		sourceRefs: ["trace:TRACE-life:decision:iteration:1#row:DTR-life"],
		...overrides,
	};
}

function queue(items = []) {
	return {
		generatedAt: "2026-06-19T00:00:00.000Z",
		traceIds: ["TRACE-life"],
		summary: {
			backlog: 0,
			waiting: 0,
			ready: items.filter((item) => item.status === "ready").length,
			claimed: items.filter((item) => item.status === "claimed").length,
			blocked: items.filter((item) => item.status === "blocked").length,
			done: items.filter((item) => item.status === "done").length,
		},
		items,
	};
}

function workItem(overrides = {}) {
	return {
		id: "WU-life",
		kind: "work-unit",
		status: "ready",
		traceId: "TRACE-life",
		title: "Implement lifecycle",
		traceRefs: ["trace:TRACE-life:planning:iteration:1#work:WU-life"],
		decisionRefs: ["trace:TRACE-life:decision:iteration:1#row:DTR-life"],
		planningRefs: ["trace:TRACE-life:planning:iteration:1#work:WU-life"],
		componentRefs: ["runtime"],
		pathScopes: ["src/runtime/lifecycle.ts"],
		dependsOn: [],
		blockers: [],
		qualityStandards: [
			{
				id: "planning_claimable",
				status: "met",
				mode: "deterministic",
				description: "Claimable",
				refs: ["trace:TRACE-life:planning:iteration:1#work:WU-life"],
			},
		],
		qualityBlockers: [],
		sourceEventId: "TRACE-life:planning:iteration:1",
		...overrides,
	};
}

describe("runtime host lifecycle", () => {
	it("plans main host trace starts without treating board as truth", () => {
		const plan = planMainHostLifecycle({
			traceBoard: board({
				traces: [
					goal({ traceId: "TRACE-plan", status: "needs_planning" }),
					goal({ traceId: "TRACE-finish", status: "finished" }),
				],
			}),
			maxTraceHosts: 1,
		});

		assert.equal(plan.role, "main");
		assert.equal(plan.state, "active");
		assert.equal(plan.actions[0].kind, "start_trace_host");
		assert.equal(plan.actions[0].traceId, "TRACE-plan");
		assert.equal(plan.actions[0].targetLoop, "planning");
		assert.equal(plan.actions[1].kind, "report_blocker");
		assert.match(plan.actions[1].message, /capacity is full/);
	});

	it("blocks main host on active trace path conflicts", () => {
		const plan = planMainHostLifecycle({
			traceBoard: board({
				conflicts: [
					{
						leftTraceId: "TRACE-left",
						rightTraceId: "TRACE-right",
						pathScope: "src/runtime/**",
						message: "TRACE-left overlaps TRACE-right on src/runtime/**.",
					},
				],
			}),
		});

		assert.equal(plan.state, "blocked");
		assert.equal(plan.actions[0].kind, "report_blocker");
		assert.deepEqual(plan.refs, [
			"TRACE-left",
			"TRACE-right",
			"src/runtime/**",
		]);
	});

	it("routes trace host lifecycle through semantic loops and closure", () => {
		const planning = planTraceHostLifecycle({ status: status() });
		assert.equal(planning.actions[0].kind, "run_planning");
		assert.equal(planning.actions[0].targetLoop, "planning");

		const closure = planTraceHostLifecycle({
			status: status({
				currentLoop: null,
				readyForClosure: true,
				goalStatus: "finished",
				health: "green",
			}),
		});
		assert.equal(closure.actions[0].kind, "close_trace");

		const closed = planTraceHostLifecycle({
			status: status({
				closed: true,
				closedAt: "2026-06-19T00:01:00.000Z",
				currentLoop: null,
				goalStatus: "closed_complete",
			}),
		});
		assert.equal(closed.state, "closed");
		assert.equal(closed.actions[0].kind, "stop");
	});

	it("routes trace host lifecycle to worker start or watch", () => {
		const lifecycle = planTraceHostLifecycle({
			status: status({ currentLoop: null, goalStatus: "needs_implementation" }),
			workQueue: queue([workItem()]),
		});
		assert.equal(lifecycle.actions[0].kind, "start_workers");
		assert.equal(lifecycle.actions[0].targetLoop, "implementation");

		const watch = planTraceHostLifecycle({
			status: status({ currentLoop: null, goalStatus: "needs_implementation" }),
			workQueue: queue([
				workItem({ status: "claimed", claimedBy: "worker-1" }),
			]),
		});
		assert.equal(watch.actions[0].kind, "watch_workers");
	});

	it("creates trace-owned host lifecycle events", () => {
		const plan = planTraceHostLifecycle({ status: status() });
		const event = createRuntimeHostLifecycleEvent({
			traceId: "TRACE-life",
			sequence: 3,
			createdAt: "2026-06-19T00:02:00.000Z",
			role: "trace",
			state: plan.state,
			actions: plan.actions,
			refs: plan.refs,
		});

		assert.equal(event.event, "runtime.host.observed");
		assert.equal(event.loop, undefined);
		assert.equal(event.data.role, "trace");
		assert.equal(event.data.state, "active");
		assert.equal(event.data.actions[0].kind, "run_planning");
		assert.deepEqual(event.refs, [
			"TRACE-life",
			"trace:TRACE-life:decision:iteration:1#row:DTR-life",
		]);
	});

	it("creates and appends lifecycle events with per-trace byte checks", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-life-"));
		const head = createTraceHead({
			traceId: "TRACE-life",
			title: "Lifecycle trace",
			createdAt: "2026-06-19T00:00:00.000Z",
		});
		await appendTraceRecords(root, [head], 0);
		const expectedBytes = Buffer.byteLength(formatTraceText([head]), "utf8");
		const plan = planTraceHostLifecycle({ status: status() });
		const batch = createRuntimeHostLifecycleEvents([plan], {
			createdAt: "2026-06-19T00:02:00.000Z",
			nextSequenceByTrace: { "TRACE-life": 1 },
		});

		const append = await appendRuntimeHostLifecycleEvents(batch, {
			repoRoot: root,
			expectedBytesByTrace: { "TRACE-life": expectedBytes },
		});

		assert.equal(batch.nextSequenceByTrace["TRACE-life"], 2);
		assert.equal(append.events[0].event, "runtime.host.observed");
		assert.equal(append.results.length, 1);
		assert.equal(
			(await stat(join(root, ".codewiki/traces/TRACE-life.jsonl"))).size,
			append.nextBytesByTrace["TRACE-life"],
		);
	});

	it("records host error recovery as lifecycle data", () => {
		const hostError = createCodewikiHostError({
			role: "trace",
			kind: "append_conflict",
			traceId: "TRACE-life",
			message: "Trace bytes changed before lifecycle append.",
		});
		const plan = planTraceHostLifecycle({ status: status(), hostError });
		const event = createRuntimeHostLifecycleEvent({
			traceId: "TRACE-life",
			sequence: 4,
			createdAt: "2026-06-19T00:03:00.000Z",
			role: "trace",
			state: plan.state,
			actions: plan.actions,
			blockers: plan.blockers,
			hostError: plan.hostError,
		});

		assert.equal(plan.actions[0].kind, "recover_host_error");
		assert.equal(event.event, "runtime.host.blocked");
		assert.equal(event.data.hostError.kind, "append_conflict");
		assert.equal(event.data.hostError.suggestedAction, "refresh_trace");
	});
});
