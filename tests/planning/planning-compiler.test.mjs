import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileDecision } from "../../src/decision/compiler.ts";
import { createDecisionTable } from "../../src/decision/table.ts";
import { compilePlan } from "../../src/planning/compiler.ts";
import { evaluatePlanningGate } from "../../src/planning/gate.ts";
import { normalizePlanningWorkItems } from "../../src/planning/materialization.ts";
import { orderWorkItems } from "../../src/planning/ordering.ts";

function decisionEvents() {
	const table = createDecisionTable({
		id: "DT-planning",
		createdAt: "2026-06-11T00:00:00.000Z",
		updatedAt: "2026-06-11T00:00:00.000Z",
		rows: [
			{
				id: "DTR-001",
				question: "What owns workflow state?",
				currentState: "Generated graph owns workflow state.",
				desiredState: "JSONL traces own workflow state.",
				rationale: "Matches Pi session-inspired model.",
				approval: "approved",
				sourceRefs: ["kb:system/traces.md"],
			},
		],
	});
	return compileDecision({ traceId: "TRACE-planning", table }).traceEvents;
}

describe("planning compiler", () => {
	it("materializes approved decision events into work units", () => {
		const [decisionEvent] = decisionEvents();
		const result = compilePlan({
			traceId: "TRACE-planning",
			decisionEvents: [decisionEvent],
			createdAt: "2026-06-11T00:00:00.000Z",
			workItemInputs: [
				{
					id: "WU-001",
					title: "Implement trace storage",
					decision_refs: [decisionEvent.id],
					outcome: "Trace JSONL storage exists.",
					acceptance: ["Append and replay trace records."],
					path_scopes: ["src/traces"],
					verification: ["tests/planning/planning-compiler.test.mjs"],
				},
			],
		});

		assert.equal(result.readyForImplementation, true);
		assert.equal(result.gate.passed, true);
		assert.deepEqual(result.gate.coveredDecisionRefs, [decisionEvent.id]);
		assert.equal(result.traceEvents[0].event, "planning.work-unit.materialized");
		assert.equal(result.traceEvents[0].refs.includes(decisionEvent.id), true);
	});

	it("blocks accepted decision rows without planning coverage", () => {
		const [decisionEvent] = decisionEvents();
		const result = compilePlan({
			traceId: "TRACE-planning",
			decisionEvents: [decisionEvent],
		});

		assert.equal(result.readyForImplementation, false);
		assert.deepEqual(result.gate.issues.map((issue) => issue.code), [
			"missing_decision_coverage",
		]);
	});

	it("accepts deferred decisions only with owner, trigger, rationale, and evidence", () => {
		const [decisionEvent] = decisionEvents();
		const missing = compilePlan({
			traceId: "TRACE-planning",
			decisionEvents: [decisionEvent],
			resolutionInputs: [
				{
					decisionRef: decisionEvent.id,
					kind: "deferred",
					owner: "runtime migration",
				},
			],
		});
		assert.equal(missing.readyForImplementation, false);
		assert.equal(missing.gate.issues[0].code, "invalid_resolution");

		const complete = compilePlan({
			traceId: "TRACE-planning",
			decisionEvents: [decisionEvent],
			resolutionInputs: [
				{
					decisionRef: decisionEvent.id,
					kind: "deferred",
					owner: "runtime migration",
					trigger: "after traces module lands",
					rationale: "Runtime needs trace append primitives first.",
					evidenceRefs: ["kb:system/traces.md"],
				},
			],
		});
		assert.equal(complete.readyForImplementation, true);
		assert.equal(complete.traceEvents[0].event, "planning.decision.resolved");
	});

	it("detects conflicting path scopes unless dependency orders the work", () => {
		const [decisionEvent] = decisionEvents();
		const conflictingItems = normalizePlanningWorkItems([
			{
				id: "WU-001",
				decisionRefs: [decisionEvent.id],
				outcome: "First change",
				acceptance: ["Done"],
				pathScopes: ["src/traces"],
			},
			{
				id: "WU-002",
				decisionRefs: [decisionEvent.id],
				outcome: "Second change",
				acceptance: ["Done"],
				pathScopes: ["src/traces"],
			},
		]);
		const conflictGate = evaluatePlanningGate({
			decisionRefs: [decisionEvent.id],
			workItems: conflictingItems,
			resolutions: [],
		});
		assert.equal(conflictGate.passed, false);
		assert.equal(conflictGate.issues.some((issue) => issue.code === "path_conflict"), true);

		const orderedItems = normalizePlanningWorkItems([
			{ ...conflictingItems[0] },
			{ ...conflictingItems[1], dependsOn: ["WU-001"] },
		]);
		const orderedGate = evaluatePlanningGate({
			decisionRefs: [decisionEvent.id],
			workItems: orderedItems,
			resolutions: [],
		});
		assert.equal(orderedGate.passed, true);
		assert.deepEqual(orderWorkItems(orderedItems).map((item) => item.id), ["WU-001", "WU-002"]);
	});
});
