import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDecisionTable } from "../../src/decision/table.ts";
import { evaluateDecisionExit } from "../../src/decision/loop.ts";
import { evaluateImplementationExit } from "../../src/implementation/loop.ts";
import { qualityDiagnosticsFromStandards } from "../../src/loops/feedback.ts";
import { evaluatePlanningExit } from "../../src/planning/loop.ts";

const blockingStandard = {
	id: "coverage",
	status: "unmet",
	mode: "deterministic",
	description: "coverage failed",
	message: "missing coverage",
	refs: ["trace:TRACE-demo:planning:iteration:1#work:WU-1"],
	method: "deterministic",
	gate: "hard",
	repairTarget: "implementation",
};

const softStandard = {
	id: "agent_review",
	status: "unmet",
	mode: "agent",
	description: "agent review failed",
	method: "agent_self_assessment",
	gate: "soft",
	repairTarget: "implementation",
};

describe("loop quality repair feedback", () => {
	it("sorts hard-gate diagnostics before soft guidance", () => {
		const diagnostics = qualityDiagnosticsFromStandards(
			[softStandard, blockingStandard],
			[
				{
					action: "Cover planned work WU-1.",
					route: "implementation",
					refs: ["trace:TRACE-demo:planning:iteration:1#work:WU-1"],
					blocking: true,
				},
			],
		);

		assert.equal(diagnostics[0].standardId, "coverage");
		assert.equal(diagnostics[0].severity, "blocking");
		assert.equal(diagnostics[0].repair, "Cover planned work WU-1.");
		assert.equal(diagnostics[1].standardId, "agent_review");
		assert.equal(diagnostics[1].severity, "warning");
	});

	it("adds compact diagnostics to decision exits", () => {
		const exit = evaluateDecisionExit(
			createDecisionTable({ id: "DT-empty", rows: [] }),
		);

		assert.equal(exit.passed, false);
		assert.ok(exit.diagnostics.length > 0);
		assert.equal(exit.diagnostics[0].severity, "blocking");
		assert.equal(exit.diagnostics[0].standardId, "decision_table_ready");
		assert.match(exit.diagnostics[0].repair, /decision/i);
	});

	it("adds compact diagnostics to planning exits", () => {
		const exit = evaluatePlanningExit({
			decisionRefs: ["trace:TRACE-demo:decision:iteration:1#row:DTR-1"],
			workItems: [],
			resolutions: [],
		});

		assert.equal(exit.passed, false);
		assert.ok(exit.diagnostics.length > 0);
		assert.equal(exit.diagnostics[0].standardId, "decision_coverage_complete");
		assert.equal(exit.diagnostics[0].severity, "blocking");
	});

	it("adds compact diagnostics to implementation exits", () => {
		const exit = evaluateImplementationExit({
			planningRefs: ["trace:TRACE-demo:planning:iteration:1#work:WU-1"],
			changes: [],
		});

		assert.equal(exit.passed, false);
		assert.ok(exit.diagnostics.length > 0);
		assert.equal(exit.diagnostics[0].standardId, "planning_coverage_complete");
		assert.equal(exit.diagnostics[0].severity, "blocking");
	});
});
