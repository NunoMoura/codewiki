import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runLoopQualityGraphEvaluation } from "../../../src/verification/quality/evaluator.ts";
import { LOOP_QUALITY_GRAPH_SCHEMA_VERSION } from "../../../src/verification/quality/graph.ts";
import { MemoryLoopQualityJudgeCache } from "../../../src/verification/quality/judge.ts";

function toyGraph(nodes) {
	return {
		graphId: "toy.loop",
		graphVersion: "test.1",
		schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
		layers: ["hard_gate", "evidence_quality"],
		nodes,
	};
}

const deterministicHardNode = {
	id: "deterministic_hard_gate",
	description: "Deterministic hard gate passes before judge work.",
	codes: ["hard_issue"],
	layer: "hard_gate",
	standardType: "loop_contract",
	method: "deterministic",
	repairTarget: "decision",
	weight: 1,
	cost: 1,
	gate: "hard",
};

const agentAssessmentNode = {
	id: "agent_assessment_quality",
	description: "Agent assessment must be independently plausible.",
	codes: ["agent_issue"],
	layer: "evidence_quality",
	standardType: "evidence_quality",
	method: "agent_self_assessment",
	repairTarget: "decision",
	weight: 1,
	cost: 5,
	gate: "soft",
};

const modelJudgeNode = {
	id: "semantic_quality_judged",
	description: "Semantic quality must pass model judgment.",
	codes: ["judge_issue"],
	layer: "evidence_quality",
	standardType: "evidence_quality",
	method: "model_judge",
	repairTarget: "decision",
	weight: 1,
	cost: 8,
	gate: "soft",
};

function runWithJudge(input) {
	return runLoopQualityGraphEvaluation({
		graph: input.graph,
		issues: input.issues || [],
		issueCode: (issue) => issue.code,
		issueMessage: (issue) => issue.message,
		issueRefs: (issue) => issue.refs || [],
		judge: input.judge,
		judgeCache: input.judgeCache,
		judgeInput: input.judgeInput,
	});
}

describe("independent loop quality judge", () => {
	it("batches eligible non-deterministic standards once per loop attempt", async () => {
		const calls = [];
		const judge = {
			promptVersion: "judge.v1",
			async judge(requests) {
				calls.push(requests);
				return requests.map((request) => ({
					standardId: request.standardId,
					status: "pass",
					score: 91,
					message: `${request.standardId} passed independent review.`,
					confidence: 0.91,
				}));
			},
		};

		const result = await runWithJudge({
			graph: toyGraph([
				deterministicHardNode,
				agentAssessmentNode,
				modelJudgeNode,
			]),
			judge,
			judgeInput: { attempt: "one" },
		});

		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0][0].judgeInput, { attempt: "one" });
		assert.equal(calls[0][0].judge.id, "agent_assessment_quality.judge");
		assert.equal(calls[0][1].judge.id, "semantic_quality_judged.judge");
		assert.deepEqual(
			calls[0].map((request) => request.standardId),
			["agent_assessment_quality", "semantic_quality_judged"],
		);
		assert.equal(result.runner.status, "pass");
		assert.equal(
			result.runner.nodes.filter((node) => node.judge?.status === "pass")
				.length,
			2,
		);
	});

	it("turns independent judge failure into standard failure", async () => {
		const judge = {
			promptVersion: "judge.v1",
			async judge(requests) {
				return requests.map((request) => ({
					standardId: request.standardId,
					status:
						request.standardId === "agent_assessment_quality" ? "fail" : "pass",
					score: request.standardId === "agent_assessment_quality" ? 37 : 92,
					message: `Independent review rejected ${request.standardId}.`,
					repair: "Provide stronger evidence and retry.",
				}));
			},
		};

		const result = await runWithJudge({
			graph: toyGraph([deterministicHardNode, agentAssessmentNode]),
			judge,
		});

		const standard = result.standards.find(
			(candidate) => candidate.id === "agent_assessment_quality",
		);
		assert.equal(standard.status, "unmet");
		assert.match(standard.message, /rejected/);
		assert.equal(standard.score, 37);
		assert.equal(result.runner.status, "fail");
	});

	it("fails closed when judge pass score misses node threshold", async () => {
		const judge = {
			promptVersion: "judge.v1",
			async judge(requests) {
				return requests.map((request) => ({
					standardId: request.standardId,
					status: "pass",
					score: 79,
					message: "low confidence pass should not exit",
				}));
			},
		};

		const result = await runWithJudge({
			graph: toyGraph([modelJudgeNode]),
			judge,
		});

		assert.equal(result.standards[0].status, "unmet");
		assert.equal(result.standards[0].score, 79);
		assert.match(result.standards[0].message, /below threshold 80/);
		assert.equal(result.runner.status, "fail");
	});

	it("blocks judge passes that omit required numeric score", async () => {
		const judge = {
			promptVersion: "judge.v1",
			async judge(requests) {
				return requests.map((request) => ({
					standardId: request.standardId,
					status: "pass",
					message: "score omitted",
				}));
			},
		};

		const result = await runWithJudge({
			graph: toyGraph([modelJudgeNode]),
			judge,
		});

		assert.equal(result.standards[0].status, "blocked");
		assert.equal(result.standards[0].score, 0);
		assert.match(result.standards[0].message, /omitted required 0-100 score/);
		assert.equal(result.runner.status, "block");
	});

	it("caches judge verdicts by graph, prompt, and input/evidence hash", async () => {
		let callCount = 0;
		const cache = new MemoryLoopQualityJudgeCache();
		const judge = {
			promptVersion: "judge.v1",
			async judge(requests) {
				callCount += 1;
				return requests.map((request) => ({
					standardId: request.standardId,
					status: "pass",
					score: 90,
					message: "cached pass",
				}));
			},
		};
		const graph = toyGraph([deterministicHardNode, modelJudgeNode]);

		await runWithJudge({
			graph,
			judge,
			judgeCache: cache,
			judgeInput: { same: true },
		});
		const second = await runWithJudge({
			graph,
			judge,
			judgeCache: cache,
			judgeInput: { same: true },
		});

		assert.equal(callCount, 1);
		assert.equal(
			second.runner.nodes.find((node) => node.id === "semantic_quality_judged")
				.judge.cached,
			true,
		);
	});

	it("does not call the judge when a deterministic hard gate already failed", async () => {
		let callCount = 0;
		const judge = {
			promptVersion: "judge.v1",
			async judge(requests) {
				callCount += 1;
				return requests.map((request) => ({
					standardId: request.standardId,
					status: "pass",
					score: 90,
					message: "should not run",
				}));
			},
		};

		const result = await runWithJudge({
			graph: toyGraph([deterministicHardNode, modelJudgeNode]),
			issues: [{ code: "hard_issue", message: "Hard gate failed." }],
			judge,
		});

		assert.equal(callCount, 0);
		assert.equal(result.runner.status, "fail");
		assert.equal(
			result.runner.nodes.find((node) => node.id === "semantic_quality_judged")
				.judge,
			undefined,
		);
	});
});
