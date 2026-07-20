import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { selectRuntimeReaction } from "../../src/runtime/reactor.ts";

function record(id, targetRefs = [], links = []) {
	return {
		schemaVersion: 1,
		recordRevision: 1,
		change: {
			schemaVersion: 1,
			id,
			revision: 1,
			status: "accepted",
			intent: {
				question: id,
				currentState: "before",
				desiredState: "after",
				rationale: "needed",
				nonGoals: [],
			},
			classification: {
				kind: "improve",
				type: "architecture_change",
				scope: "system",
				affectedLayers: ["runtime"],
				targetRefs,
			},
			impact: { user: "faster", maintainer: "simpler" },
			evidence: { sourceRefs: [], proofRefs: [] },
			safety: { risk: "low", failureModes: [] },
			validation: {
				state: "valid",
				issues: [],
				assessments: [],
				recommendations: [],
			},
			estimates: {},
			provenance: {
				origin: "user",
				createdBy: "user",
				createdAt: "2026-08-02T00:00:00.000Z",
				updatedAt: "2026-08-02T00:00:00.000Z",
			},
		},
		links,
	};
}

function change(id, currentLoop, targetRefs = [], links = []) {
	return {
		id,
		traceId: `TRACE-change-${id}`,
		record: record(id, targetRefs, links),
		approval: {
			status: currentLoop === "decision" ? "pending" : "approved",
			changeRevision: 1,
			changeDigest: `sha256:${id}`,
		},
		planningStatus: currentLoop === "decision" ? "unplanned" : "planned",
		realizationStatus: "not_started",
		outcomeStatus: "pending",
		sprintIds: [],
		workItemIds: [],
		rollbackBoundary: "Revert Sprint work as one boundary.",
		assignmentIds: [],
		blockers: [],
		...(currentLoop ? { currentLoop } : {}),
	};
}

function state(overrides = {}) {
	return {
		schemaVersion: 1,
		snapshotDigest: "sha256:work-state",
		changeIds: [],
		sprintIds: [],
		workItemIds: [],
		rollbackBoundary: "Revert Sprint work as one boundary.",
		assignmentIds: [],
		changes: [],
		sprints: [],
		workItems: [],
		assignments: [],
		blockers: [],
		sources: { traceCount: 0, recordCount: 0, changeTraceCount: 0 },
		...overrides,
	};
}

const trigger = { kind: "change_trace_appended", refs: ["z", "a", "a"] };

describe("runtime reactor", () => {
	it("selects deterministically across eligible semantic loops", () => {
		const reaction = selectRuntimeReaction(
			state({
				changes: [
					change("CHG-plan", "planning"),
					change("CHG-decide", "decision"),
				],
			}),
			trigger,
		);

		assert.equal(reaction.status, "ready");
		assert.equal(reaction.selection.loop, "decision");
		assert.equal(reaction.selection.change.changeId, "CHG-decide");
		assert.deepEqual(reaction.trigger.refs, ["a", "z"]);
	});

	it("prioritizes work named by the triggering event", () => {
		const reaction = selectRuntimeReaction(
			state({
				changes: [
					change("CHG-a-decision", "decision"),
					change("CHG-z-planning", "planning"),
				],
			}),
			{ kind: "user_response", refs: ["change:CHG-z-planning"] },
		);

		assert.equal(reaction.selection.loop, "planning");
		assert.deepEqual(
			reaction.selection.planningHorizon.map((entry) => entry.changeId),
			["CHG-z-planning"],
		);
	});

	it("builds a bounded Planning horizon from linked and overlapping Changes", () => {
		const changes = [
			change("CHG-a", "planning", ["src/shared.ts"]),
			change("CHG-b", "planning", ["src/shared.ts"]),
			change(
				"CHG-c",
				"planning",
				[],
				[
					{
						relation: "depends_on",
						targetChangeId: "CHG-b",
						createdBy: "user",
						createdAt: "2026-08-02T00:00:00.000Z",
					},
				],
			),
			change("CHG-unrelated", "planning", ["src/other.ts"]),
		];
		const reaction = selectRuntimeReaction(state({ changes }), trigger, {
			maxPlanningChanges: 3,
		});

		assert.equal(reaction.selection.loop, "planning");
		assert.deepEqual(
			reaction.selection.planningHorizon.map((entry) => entry.changeId),
			["CHG-a", "CHG-b", "CHG-c"],
		);
	});

	it("selects one complete Sprint with ready implementation work", () => {
		const reaction = selectRuntimeReaction(
			state({
				changes: [change("CHG-implementation", "implementation")],
				sprints: [
					{
						id: "SPR-runtime",
						source: "planning",
						goal: "Implement runtime",
						participatingChangeIds: ["CHG-implementation"],
						workItemIds: ["WI-done", "WI-ready", "WI-blocked"],
						rollbackBoundary: "Revert Sprint work as one boundary.",
						dependencyIds: [],
						integrationRefs: [],
						complete: true,
						blockers: [],
					},
				],
				workItems: [
					{ id: "WI-done", implemented: true, blockers: [] },
					{ id: "WI-ready", implemented: false, blockers: [] },
					{ id: "WI-blocked", implemented: false, blockers: ["conflict"] },
				],
			}),
			trigger,
		);

		assert.equal(reaction.selection.loop, "implementation");
		assert.equal(reaction.selection.sprintId, "SPR-runtime");
		assert.deepEqual(reaction.selection.workItemIds, ["WI-ready"]);
	});

	it("stays quiescent when no eligible work exists", () => {
		const reaction = selectRuntimeReaction(state(), {
			kind: "timer_due",
		});
		assert.equal(reaction.status, "quiescent");
		assert.equal(reaction.selection, undefined);
	});

	it("rejects unbounded Planning horizons", () => {
		assert.throws(
			() =>
				selectRuntimeReaction(
					state({ changes: [change("CHG-plan", "planning")] }),
					trigger,
					{ maxPlanningChanges: 0 },
				),
			/1 to 32/,
		);
	});
});
