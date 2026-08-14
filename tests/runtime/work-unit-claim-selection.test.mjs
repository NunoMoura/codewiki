import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectRuntimeWorkUnitClaims } from "../../src/runtime/claims/work-unit-selection.ts";

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
			changeRefs: item.changeRefs || [],
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

describe("runtime work-unit claim selection", () => {
	it("selects ready work-unit claims up to capacity", () => {
		const plan = selectRuntimeWorkUnitClaims(
			queue([
				{ id: "WU-one", pathScopes: ["src/decision"] },
				{ id: "WU-two", pathScopes: ["src/planning"] },
				{ id: "WU-three", pathScopes: ["src/implementation"] },
			]),
			{ maxWorkers: 2 },
		);

		assert.deepEqual(
			plan.selected.map((item) => item.workUnitId),
			["WU-one", "WU-two"],
		);
		assert.deepEqual(
			plan.held.map((item) => [item.workUnitId, item.reason]),
			[["WU-three", "capacity"]],
		);
		assert.equal(plan.availableSlots, 2);
	});

	it("holds work with path conflicts against selected work", () => {
		const plan = selectRuntimeWorkUnitClaims(
			queue([
				{ id: "WU-parent", pathScopes: ["src/work-state"] },
				{ id: "WU-child", pathScopes: ["src/work-state/work-queue.ts"] },
				{ id: "WU-safe", pathScopes: ["src/changes/trace"] },
			]),
			{ maxWorkers: 3 },
		);

		assert.deepEqual(
			plan.selected.map((item) => item.workUnitId),
			["WU-parent", "WU-safe"],
		);
		assert.equal(plan.held[0].workUnitId, "WU-child");
		assert.equal(plan.held[0].reason, "path_conflict");
		assert.equal(plan.held[0].conflictsWith, "WU-parent");
	});

	it("holds glob path conflicts against selected work", () => {
		const plan = selectRuntimeWorkUnitClaims(
			queue([
				{ id: "WU-glob", pathScopes: ["src/clients/pi/**"] },
				{ id: "WU-file", pathScopes: ["src/clients/pi/tools/index.ts"] },
				{
					id: "WU-safe",
					pathScopes: ["src/runtime/claims/work-unit-selection.ts"],
				},
			]),
			{ maxWorkers: 3 },
		);

		assert.deepEqual(
			plan.selected.map((item) => item.workUnitId),
			["WU-glob", "WU-safe"],
		);
		assert.equal(plan.held[0].workUnitId, "WU-file");
		assert.equal(plan.held[0].reason, "path_conflict");
		assert.equal(plan.held[0].conflictsWith, "WU-glob");
	});

	it("counts claimed work against capacity and path conflicts", () => {
		const plan = selectRuntimeWorkUnitClaims(
			queue([
				{
					id: "WU-claimed",
					status: "claimed",
					pathScopes: ["src/runtime"],
				},
				{
					id: "WU-conflict",
					pathScopes: ["src/runtime/claims/work-unit-selection.ts"],
				},
				{ id: "WU-ready", pathScopes: ["src/work-state"] },
			]),
			{ maxWorkers: 2 },
		);

		assert.deepEqual(
			plan.activeClaims.map((item) => item.workUnitId),
			["WU-claimed"],
		);
		assert.deepEqual(
			plan.selected.map((item) => item.workUnitId),
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
		const plan = selectRuntimeWorkUnitClaims(
			queue([
				{ id: "WU-waiting", status: "waiting", pathScopes: ["src/a"] },
				{ id: "WU-blocked", status: "blocked", pathScopes: ["src/b"] },
				{ id: "WU-done", status: "done", pathScopes: ["src/c"] },
			]),
			{ maxWorkers: 3 },
		);

		assert.deepEqual(plan.selected, []);
		assert.deepEqual(plan.held, []);
	});
});
