import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileDecision } from "../../src/decision/compiler.ts";
import { evaluateDecisionGate } from "../../src/decision/gate.ts";
import { decisionPropagationRefs, decisionStateDeltaGaps } from "../../src/decision/propagation.ts";
import { applyDecisionRowActions, createDecisionTable } from "../../src/decision/table.ts";
import { formatTraceLine } from "../../src/traces/writer.ts";
import { parseTraceLine } from "../../src/traces/reader.ts";

describe("decision tables", () => {
	it("normalizes legacy row aliases into target decision rows", () => {
		const table = createDecisionTable({
			id: "DT-001",
			createdAt: "2026-06-11T00:00:00.000Z",
			rows: [
				{
					id: "DTR-001",
					current_state: "Graph is treated as state truth.",
					desired_state: "JSONL traces are workflow/state truth.",
					rationale: "Matches recovered traces-first decision.",
					user_action: "accept",
					affected_layers: ["system", "source"],
					source_refs: ["kb:system/traces.md"],
					change_class: "maintenance",
				},
			],
		});

		assert.equal(table.rows.length, 1);
		assert.equal(table.rows[0].approval, "approved");
		assert.equal(table.rows[0].changeType, "code");
		assert.deepEqual(table.rows[0].affectedLayers, ["system", "source"]);
	});

	it("applies row actions atomically", () => {
		const table = createDecisionTable({
			id: "DT-002",
			rows: [
				{
					id: "DTR-001",
					currentState: "Old model",
					desiredState: "New model",
					rationale: "Needed",
				},
			],
		});

		const failed = applyDecisionRowActions(table, [
			{ rowId: "DTR-001", action: "accept" },
			{ rowId: "missing", action: "reject" },
		]);
		assert.equal(failed.changed, false);
		assert.equal(failed.table.rows[0].approval, "pending");

		const passed = applyDecisionRowActions(table, [
			{ rowId: "DTR-001", action: "accept" },
		]);
		assert.equal(passed.changed, true);
		assert.equal(passed.table.rows[0].approval, "approved");
		assert.equal(table.rows[0].approval, "pending");
	});
});

describe("decision gate and compiler", () => {
	it("blocks approved rows without traceability refs or no-impact rationale", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-001",
					currentState: "Implicit source roots",
					desiredState: "Explicit traces-first roots",
					rationale: "Avoid stale graph model",
					approval: "approved",
				},
			],
		});

		const gate = evaluateDecisionGate(table);
		assert.equal(gate.passed, false);
		assert.deepEqual(gate.issues.map((issue) => issue.code), ["missing_traceability_ref"]);
	});

	it("emits approved decision trace events for planning", () => {
		const table = createDecisionTable({
			id: "DT-003",
			createdAt: "2026-06-11T00:00:00.000Z",
			updatedAt: "2026-06-11T00:00:00.000Z",
			rows: [
				{
					id: "DTR-001",
					question: "What owns CodeWiki workflow state?",
					currentState: "Graph/root state owns workflow state.",
					desiredState: "Trace JSONL owns workflow state.",
					rationale: "Matches Pi session model.",
					approval: "approved",
					sourceRefs: ["kb:system/traces.md"],
				},
			],
		});

		const result = compileDecision({ traceId: "TRACE-20260611-decision", table });
		assert.equal(result.readyForPlanning, true);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "decision.row.approved");
		assert.deepEqual(decisionPropagationRefs(table), ["kb:system/traces.md"]);
		assert.deepEqual(decisionStateDeltaGaps(table), []);

		const parsed = parseTraceLine(formatTraceLine(result.traceEvents[0]));
		assert.equal(parsed.type, "trace_event");
		assert.equal(parsed.traceId, "TRACE-20260611-decision");
	});
});
