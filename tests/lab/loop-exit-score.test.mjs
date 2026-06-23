import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreAllLoops, labGateStatus } from "../../lab/runner/score.ts";

describe("CodeWiki lab loop exit scores", () => {
	it("scores seed candidates against locked DEC/PEC/IEC cases", () => {
		const scores = scoreAllLoops();

		assert.deepEqual(Object.keys(scores), [
			"decision",
			"planning",
			"implementation",
		]);
		assert.equal(scores.decision.metric, "DEC");
		assert.equal(scores.planning.metric, "PEC");
		assert.equal(scores.implementation.metric, "IEC");
		assert.equal(scores.decision.caseCount, 3);
		assert.equal(scores.planning.caseCount, 3);
		assert.equal(scores.implementation.caseCount, 3);
	});

	it("exposes known false-pass gaps from production-parity seed standards", () => {
		const scores = scoreAllLoops();
		const falsePasses = Object.values(scores).flatMap((score) =>
			score.cases
				.filter((testCase) => testCase.falsePass)
				.map((testCase) => `${score.metric}/${testCase.id}`),
		);

		assert.deepEqual(falsePasses, [
			"DEC/vague-docs-decision",
			"PEC/vague-work-unit-plan",
			"PEC/overlapping-independent-work",
			"IEC/shallow-production-assertion",
		]);
		assert.equal(labGateStatus(scores).status, "fail");
	});
});
