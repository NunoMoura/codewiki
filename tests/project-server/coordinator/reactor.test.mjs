import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	selectProjectServerReaction,
	selectProjectServerReactions,
} from "../../../src/project-server/coordinator/reactor.ts";

function record(id, targetRefs = []) {
	return {
		schemaVersion: 1,
		recordRevision: 1,
		change: {
			schemaVersion: 1,
			id,
			revision: 1,
			status: "accepted",
			intent: { question: id, currentState: "before", desiredState: "after", rationale: "needed", nonGoals: [] },
			classification: { kind: "improve", type: "architecture_change", scope: "system", affectedLayers: ["runtime"], targetRefs },
			impact: { user: "faster", maintainer: "simpler" },
			evidence: { sourceRefs: [], proofRefs: [] },
			safety: { risk: "low", failureModes: [] },
			validation: { state: "valid", issues: [], assessments: [], recommendations: [] },
			estimates: {},
			provenance: { origin: "user", createdBy: "user", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" },
		},
		links: [],
	};
}

function change(id, currentLoop, targetRefs = []) {
	return {
		id,
		traceId: `TRACE-change-${id}`,
		record: record(id, targetRefs),
		approval: { status: currentLoop === "decision" ? "pending" : "approved", changeRevision: 1, changeDigest: `sha256:${id}` },
		planningStatus: currentLoop === "decision" ? "unplanned" : "planned",
		realizationStatus: "not_started",
		outcomeStatus: "pending",
		workGraphDeltaIds: [],
		workUnitIds: [],
		rollbackBoundary: "Revert exact Change lineage.",
		assignmentIds: [],
		blockers: [],
		...(currentLoop ? { currentLoop } : {}),
	};
}

function workUnit(id, owningChangeId, overrides = {}) {
	return {
		id,
		workGraphDeltaId: `WGD-${owningChangeId}`,
		owningChangeId,
		title: id,
		planningEventId: `event:${id}`,
		dependsOn: [],
		componentRefs: [],
		pathScopes: ["src/**"],
		acceptanceCriterionIds: ["AC-1"],
		assignmentIds: [],
		implemented: false,
		blockers: [],
		...overrides,
	};
}

function state(overrides = {}) {
	return {
		schemaVersion: 3,
		snapshotDigest: "sha256:work-state",
		workGraphDigest: `sha256:${"a".repeat(64)}`,
		changeIds: [],
		workGraphDeltaIds: [],
		workUnitIds: [],
		rollbackBoundary: "Revert exact Change lineage.",
		assignmentIds: [],
		changes: [],
		workGraphDeltas: [],
		workUnits: [],
		assignments: [],
		blockers: [],
		sources: { traceCount: 0, recordCount: 0, changeTraceCount: 0 },
		...overrides,
	};
}

const trigger = { kind: "change_trace_appended", refs: ["z", "a", "a"] };

describe("runtime reactor", () => {
	it("does not auto-select pending Decision attention", () => {
		const reaction = selectProjectServerReaction(
			state({ changes: [change("CHG-plan", "planning"), change("CHG-decide", "decision")] }),
			trigger,
		);
		assert.equal(reaction.status, "ready");
		assert.equal(reaction.selection.loop, "planning");
		assert.equal(reaction.selection.change.changeId, "CHG-plan");
		assert.deepEqual(reaction.trigger.refs, ["a", "z"]);
	});

	it("prioritizes exact Change named by trigger", () => {
		const reaction = selectProjectServerReaction(
			state({ changes: [change("CHG-a", "planning"), change("CHG-z", "planning")] }),
			{ kind: "user_response", refs: ["change:CHG-z"] },
		);
		assert.equal(reaction.selection.change.changeId, "CHG-z");
	});

	it("selects independent Change-scoped Planning reactions", () => {
		const reactions = selectProjectServerReactions(
			state({ changes: [change("CHG-a", "planning"), change("CHG-b", "planning"), change("CHG-c", "planning")] }),
			trigger,
			{ maxReactions: 2 },
		);
		assert.deepEqual(
			reactions.map((reaction) => reaction.selection.change.changeId),
			["CHG-a", "CHG-b"],
		);
	});

	it("selects one dependency-ready Work Unit", () => {
		const reaction = selectProjectServerReaction(
			state({
				changes: [change("CHG-implementation", "implementation")],
				workUnits: [
					workUnit("WU-done", "CHG-implementation", { implemented: true }),
					workUnit("WU-ready", "CHG-implementation"),
					workUnit("WU-blocked", "CHG-implementation", { blockers: ["conflict"] }),
				],
			}),
			trigger,
		);
		assert.equal(reaction.selection.loop, "implementation");
		assert.equal(reaction.selection.changeId, "CHG-implementation");
		assert.equal(reaction.selection.workUnitId, "WU-ready");
	});

	it("waits for integrated dependency state", () => {
		const reaction = selectProjectServerReaction(
			state({
				changes: [change("CHG-implementation", "implementation")],
				workUnits: [
					workUnit("WU-a", "CHG-implementation"),
					workUnit("WU-b", "CHG-implementation", { dependsOn: ["WU-a"] }),
				],
			}),
			trigger,
		);
		assert.equal(reaction.selection.workUnitId, "WU-a");
	});

	it("keeps pending-Change-only WorkState quiescent", () => {
		const reactions = selectProjectServerReactions(
			state({ changes: [change("CHG-a", "decision"), change("CHG-b", "decision")] }),
			trigger,
			{ maxReactions: 4 },
		);
		assert.deepEqual(reactions, []);
	});

	it("schedules independent Planning and Implementation units without coalescing", () => {
		const reactions = selectProjectServerReactions(
			state({
				changes: [
					change("CHG-a-plan", "planning"),
					change("CHG-b-plan", "planning"),
					change("CHG-c-implementation", "implementation"),
				],
				workUnits: [workUnit("WU-ready", "CHG-c-implementation")],
			}),
			trigger,
			{ maxReactions: 4 },
		);
		assert.deepEqual(reactions.map((reaction) => reaction.selection.loop), ["planning", "planning", "implementation"]);
		assert.equal(reactions[2].selection.workUnitId, "WU-ready");
	});

	it("stays quiescent when no eligible work exists", () => {
		const reaction = selectProjectServerReaction(state(), { kind: "timer_due" });
		assert.equal(reaction.status, "quiescent");
		assert.equal(reaction.selection, undefined);
	});

	it("rejects unbounded reaction batches", () => {
		assert.throws(
			() => selectProjectServerReactions(state({ changes: [change("CHG-plan", "planning")] }), trigger, { maxReactions: 0 }),
			/1 to 32/,
		);
	});
});
