import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRuntimeDispatch } from "../../src/runtime/scheduler.ts";

function queue(items) {
	return {
		traceIds: Array.from(new Set(items.map((item) => item.traceId))),
		summary: {
			backlog: 0,
			waiting: 0,
			ready: items.filter((item) => item.status === "ready").length,
			claimed: items.filter((item) => item.status === "claimed").length,
			blocked: 0,
			done: 0,
		},
		items: items.map((item) => ({
			id: item.id,
			kind: "work-unit",
			status: item.status || "ready",
			traceId: item.traceId || `TRACE-${item.id}`,
			title: item.title || item.id,
			traceRefs: item.traceRefs || [`TRACE-${item.id}:planning:${item.id}`],
			decisionRefs: item.decisionRefs || [],
			planningRefs: item.planningRefs || [
				`TRACE-${item.id}:planning:${item.id}`,
			],
			componentRefs: item.componentRefs || ["component.runtime"],
			pathScopes: item.pathScopes || [],
			dependsOn: item.dependsOn || [],
			blockers: [],
			sourceEventId:
				item.sourceEventId || `TRACE-${item.id}:planning:${item.id}`,
		})),
	};
}

describe("runtime scheduler", () => {
	it("dispatches ready work units up to capacity", () => {
		const plan = planRuntimeDispatch(
			queue([
				{ id: "WU-one", pathScopes: ["src/decision"] },
				{ id: "WU-two", pathScopes: ["src/planning"] },
				{ id: "WU-three", pathScopes: ["src/implementation"] },
			]),
			{ maxWorkers: 2 },
		);

		assert.deepEqual(
			plan.dispatch.map((item) => item.workUnitId),
			["WU-one", "WU-two"],
		);
		assert.deepEqual(
			plan.held.map((item) => [item.workUnitId, item.reason]),
			[["WU-three", "capacity"]],
		);
		assert.equal(plan.availableSlots, 2);
	});

	it("holds work with path conflicts against selected work", () => {
		const plan = planRuntimeDispatch(
			queue([
				{ id: "WU-parent", pathScopes: ["src/views"] },
				{ id: "WU-child", pathScopes: ["src/views/work-queue.ts"] },
				{ id: "WU-safe", pathScopes: ["src/traces"] },
			]),
			{ maxWorkers: 3 },
		);

		assert.deepEqual(
			plan.dispatch.map((item) => item.workUnitId),
			["WU-parent", "WU-safe"],
		);
		assert.equal(plan.held[0].workUnitId, "WU-child");
		assert.equal(plan.held[0].reason, "path_conflict");
		assert.equal(plan.held[0].conflictsWith, "WU-parent");
	});

	it("counts claimed work against capacity and path conflicts", () => {
		const plan = planRuntimeDispatch(
			queue([
				{
					id: "WU-claimed",
					status: "claimed",
					pathScopes: ["src/runtime"],
				},
				{ id: "WU-conflict", pathScopes: ["src/runtime/scheduler.ts"] },
				{ id: "WU-ready", pathScopes: ["src/views"] },
			]),
			{ maxWorkers: 2 },
		);

		assert.deepEqual(
			plan.activeClaims.map((item) => item.workUnitId),
			["WU-claimed"],
		);
		assert.deepEqual(
			plan.dispatch.map((item) => item.workUnitId),
			["WU-ready"],
		);
		assert.deepEqual(
			plan.held.map((item) => [
				item.workUnitId,
				item.reason,
				item.conflictsWith,
			]),
			[["WU-conflict", "path_conflict", "WU-claimed"]],
		);
		assert.equal(plan.availableSlots, 1);
	});

	it("ignores non-ready queue items", () => {
		const plan = planRuntimeDispatch(
			queue([
				{ id: "WU-waiting", status: "waiting", pathScopes: ["src/a"] },
				{ id: "WU-blocked", status: "blocked", pathScopes: ["src/b"] },
				{ id: "WU-done", status: "done", pathScopes: ["src/c"] },
			]),
			{ maxWorkers: 3 },
		);

		assert.deepEqual(plan.dispatch, []);
		assert.deepEqual(plan.held, []);
	});
});
