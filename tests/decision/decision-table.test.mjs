import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDecisionIteration } from "../../src/decision/iteration.ts";
import { evaluateDecisionExit } from "../../src/decision/exit.ts";
import {
	decisionPropagationRefs,
	decisionStateDeltaGaps,
} from "../../src/decision/propagation.ts";
import {
	applyDecisionRowActions,
	createDecisionTable,
} from "../../src/decision/table.ts";
import { formatTraceLine } from "../../src/traces/writer.ts";
import { parseTraceLine } from "../../src/traces/reader.ts";

describe("decision tables", () => {
	it("normalizes target decision row inputs", () => {
		const table = createDecisionTable({
			id: "DT-001",
			createdAt: "2026-06-11T00:00:00.000Z",
			rows: [
				{
					id: "DTR-001",
					currentState: "Graph is treated as state truth.",
					desiredState: "JSONL traces are workflow/state truth.",
					rationale: "Matches recovered traces-first decision.",
					approval: "accept",
					affectedLayers: ["system", "source"],
					sourceRefs: ["kb:system/traces.md"],
					changeType: "maintenance",
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

describe("decision exit and iteration runner", () => {
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

		const exit = evaluateDecisionExit(table);
		assert.equal(exit.passed, false);
		assert.equal(exit.verdict, "fail");
		assert.equal(exit.route, "decision");
		assert.deepEqual(
			exit.issues.map((issue) => issue.code),
			[
				"missing_current_state_packet",
				"missing_traceability_ref",
				"missing_knowledge_delta",
			],
		);
		assert.equal(
			exit.findings.some(
				(finding) => finding.criterion === "missing_traceability_ref",
			),
			true,
		);
		assert.equal(exit.remediation[0].blocking, true);
	});

	it("blocks duplicate rows and weak refs", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-dup",
					currentState: "Old",
					desiredState: "New",
					rationale: "Needed",
					approval: "approved",
					sourceRefs: ["not-a-ref"],
				},
				{
					id: "DTR-dup",
					currentState: "Old 2",
					desiredState: "New 2",
					rationale: "Needed",
					approval: "approved",
					sourceRefs: ["kb:system/traces.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table);
		assert.equal(exit.passed, false);
		assert.deepEqual(exit.issues.map((issue) => issue.code).sort(), [
			"duplicate_decision_row_id",
			"invalid_traceability_ref",
			"missing_knowledge_delta",
		]);
	});

	it("blocks incomplete or weak knowledge deltas", () => {
		const table = createDecisionTable({
			rows: [
				{
					id: "DTR-knowledge",
					currentState: "Old KB contract",
					desiredState: "New KB contract",
					rationale: "Decision owns knowledge propagation.",
					approval: "approved",
					sourceRefs: ["kb:system/loop-contracts.md"],
				},
			],
		});

		const exit = evaluateDecisionExit(table, {
			knowledgeDelta: {
				updatedRefs: ["weak-ref"],
				sections: ["Loop responsibilities"],
				beforeDigest: "sha256:abc123",
			},
		});

		assert.equal(exit.passed, false);
		assert.deepEqual(exit.issues.map((issue) => issue.code).sort(), [
			"incomplete_knowledge_digest",
			"invalid_knowledge_ref",
		]);
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

		const result = runDecisionIteration({
			traceId: "TRACE-20260611-decision",
			table,
		});
		assert.equal(result.readyForPlanning, true);
		assert.equal(result.exit.verdict, "pass");
		assert.equal(result.exit.route, "planning");
		assert.equal(result.draftTraceEvents.length, 0);
		assert.equal(result.traceEvents.length, 1);
		assert.equal(result.traceEvents[0].event, "decision.iteration");
		assert.deepEqual(result.output.currentStatePacket.refs, [
			"kb:system/traces.md",
		]);
		assert.deepEqual(
			result.traceEvents[0].data?.output?.approvedRows?.[0]?.currentStateRefs,
			["kb:system/traces.md"],
		);
		assert.equal(result.traceEvents[0].data?.exit.status, "exit");
		assert.equal(result.traceEvents[0].data?.exit.targetLoop, "planning");
		assert.equal(result.checkpoint.type, "tail_checkpoint");
		assert.equal(result.traceRecords.at(-1)?.type, "tail_checkpoint");
		assert.deepEqual(decisionPropagationRefs(table), ["kb:system/traces.md"]);
		assert.deepEqual(decisionStateDeltaGaps(table), []);

		const parsed = parseTraceLine(formatTraceLine(result.traceEvents[0]));
		assert.equal(parsed.type, "trace_event");
		assert.equal(parsed.traceId, "TRACE-20260611-decision");
	});
});
