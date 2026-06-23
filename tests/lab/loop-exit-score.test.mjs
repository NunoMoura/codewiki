import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreAllLoops, labGateStatus } from "../../lab/runner/score.ts";

describe("CodeWiki lab loop exit scores", () => {
	it("scores candidates against locked DEC/PEC/IEC cases", () => {
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

	it("passes the locked DEC/PEC/IEC gate after lab hardening", () => {
		const scores = scoreAllLoops();
		const falsePasses = Object.values(scores).flatMap((score) =>
			score.cases
				.filter((testCase) => testCase.falsePass)
				.map((testCase) => `${score.metric}/${testCase.id}`),
		);

		assert.equal(scores.decision.score, 100);
		assert.equal(scores.decision.falsePasses, 0);
		assert.equal(scores.planning.score, 100);
		assert.equal(scores.planning.falsePasses, 0);
		assert.equal(scores.implementation.score, 100);
		assert.equal(scores.implementation.falsePasses, 0);
		assert.deepEqual(falsePasses, []);
		assert.equal(labGateStatus(scores).status, "pass");
	});
});
