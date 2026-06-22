import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreLoopExits } from "../../benchmarks/score-loop-exits.mjs";

describe("loop exit debug benchmark", () => {
	it("reports deterministic pass/fail fixtures and current semantic gaps", () => {
		const summary = scoreLoopExits();

		assert.equal(summary.caseCount, 9);
		assert.equal(summary.status, "fail");
		assert.equal(summary.loops.decision.cases, 3);
		assert.equal(summary.loops.planning.cases, 3);
		assert.equal(summary.loops.implementation.cases, 3);
		assert.deepEqual(
			summary.gaps.map((gap) => `${gap.loop}/${gap.id}`),
			[
				"decision/vague-docs-decision",
				"planning/vague-work-unit-plan",
				"planning/overlapping-independent-work",
				"implementation/shallow-production-assertion",
			],
		);
		assert.deepEqual(summary.regressions, []);
		assert.equal(summary.gate.status, "fail");
		assert.equal(summary.gate.openGaps, 4);
	});

	it("keeps standard mode counts visible for token-cost analysis", () => {
		const summary = scoreLoopExits();

		assert.equal(summary.loops.decision.modeCounts.agent > 0, true);
		assert.equal(summary.loops.planning.modeCounts.agent > 0, true);
		assert.equal(summary.loops.implementation.modeCounts.agent > 0, true);
		assert.equal(summary.loops.implementation.modeCounts.user > 0, true);
		assert.equal(summary.loops.implementation.modeCounts.deterministic > 0, true);
	});
});
