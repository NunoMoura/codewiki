import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runLabExit } from "../../lab/runner/engine.ts";
import {
	DEC_LOSS,
	labGateStatus,
	scoreAllLoops,
	scoreLoop,
} from "../../lab/runner/score.ts";

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
		assert.equal(scores.decision.caseCount, 5);
		assert.equal(scores.planning.caseCount, 5);
		assert.equal(scores.implementation.caseCount, 5);
	});

	it("reports quality-network loss from standard node activations", () => {
		const result = runLabExit({
			input: {},
			threshold: 0,
			lossThreshold: 0.2,
			standards: [
				{
					id: "implementation.evidence.claim_to_test_link",
					mode: "deterministic",
					weight: 1,
					cost: 4,
					description: "Evidence links implementation claims to checks.",
					standardType: "evidence_quality",
					method: "deterministic",
					layer: "evidence_quality",
					repairTarget: "implementation",
					evaluate: () => ({
						id: "implementation.evidence.claim_to_test_link",
						mode: "deterministic",
						weight: 1,
						passed: false,
						route: "fail",
						description: "Evidence links implementation claims to checks.",
						score: 0.5,
					}),
				},
			],
		});

		assert.equal(result.verdict, "fail");
		assert.equal(result.loss, 2);
		assert.equal(result.maxLoss, 4);
		assert.equal(result.normalizedLoss, 0.5);
		assert.equal(result.standards[0].standardType, "evidence_quality");
		assert.equal(result.standards[0].repairTarget, "implementation");
	});

	it("does not let hard-gate layer failures get averaged into a pass", () => {
		const result = runLabExit({
			input: {},
			threshold: 0,
			lossThreshold: 1,
			standards: [
				{
					id: "decision.production_exit_contract",
					mode: "deterministic",
					weight: 1,
					cost: 1,
					description: "Production contract must pass.",
					standardType: "loop_contract",
					method: "deterministic",
					layer: "hard_gate",
					repairTarget: "decision",
					evaluate: () => false,
				},
			],
		});

		assert.equal(result.verdict, "fail");
	});

	it("penalizes route-correct failures that miss expected reasons", () => {
		const score = scoreLoop({
			loop: "decision",
			metric: "DEC",
			cases: [
				{
					id: "wrong-reason-fail",
					loop: "decision",
					description: "Route fails, but target semantic reason is missed.",
					input: {},
					expected: "fail",
					weight: 1,
					expectedFailures: [
						{
							standardId: "decision.target_semantic_reason",
							failureClass: "specificity",
						},
					],
				},
			],
			standards: [
				{
					id: "decision.generic_failure",
					mode: "deterministic",
					weight: 1,
					cost: 1,
					description: "Generic failure trips the route.",
					standardType: "loop_contract",
					method: "deterministic",
					layer: "hard_gate",
					repairTarget: "decision",
					evaluate: () => false,
				},
				{
					id: "decision.target_semantic_reason",
					mode: "deterministic",
					weight: 1,
					cost: 1,
					description: "Target reason should fail but does not.",
					standardType: "semantic_quality",
					method: "deterministic",
					layer: "semantic_quality",
					repairTarget: "decision",
					evaluate: () => true,
				},
			],
			lossMatrix: DEC_LOSS,
		});

		assert.equal(score.cases[0].routeCorrect, true);
		assert.equal(score.cases[0].reasonCorrect, false);
		assert.equal(score.cases[0].correct, false);
		assert.equal(score.cases[0].missedExpectedFailures.length, 1);
		assert.equal(score.routeQuality, 100);
		assert.equal(score.reasonQuality, 0);
		assert.ok(score.score < 100);
		assert.equal(labGateStatus({ decision: score }).status, "fail");
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
