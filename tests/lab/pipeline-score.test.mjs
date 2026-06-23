import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pipelineCases } from "../../lab/pipeline/cases.ts";
import { scorePipeline, scorePipelineCase } from "../../lab/pipeline/score.ts";
import { buildPipelineTrace } from "../../lab/pipeline/trace-harness.ts";

describe("CodeWiki pipeline lab", () => {
	it("builds valid production-shaped trace records from pipeline cases", () => {
		const result = buildPipelineTrace(pipelineCases[0].input);
		assert.deepEqual(
			result.records.map((record) => record.type),
			["trace_head", "trace_event", "trace_event", "trace_event"],
		);
		assert.deepEqual(
			result.records
				.filter((record) => record.type === "trace_event")
				.map((record) => `${record.loop}.${record.event}`),
			[
				"decision.rows_approved",
				"planning.work_units_created",
				"implementation.evidence_accepted",
			],
		);
	});

	it("scores trace carryover efficiency across decision, planning, and implementation", () => {
		const score = scorePipeline();
		assert.equal(score.metric, "PCE");
		assert.equal(score.caseCount, 3);
		assert.equal(score.falsePasses, 0);
		assert.equal(score.expectedPassRegressions, 0);
		assert.equal(score.score, 100);
	});

	it("detects fact loss between planning and implementation", () => {
		const caseScore = scorePipelineCase(
			pipelineCases.find(
				(testCase) => testCase.id === "decision-fact-lost-before-implementation",
			),
		);
		assert.equal(caseScore.expected, "fail");
		assert.equal(caseScore.observed, "fail");
		assert.equal(
			caseScore.issues.some(
				(issue) => issue.id === "implementation_missing_fact",
			),
			true,
		);
	});

	it("detects missing implementation coverage for planning acceptance criteria", () => {
		const caseScore = scorePipelineCase(
			pipelineCases.find(
				(testCase) => testCase.id === "acceptance-coverage-lost-in-trace",
			),
		);
		assert.equal(caseScore.expected, "fail");
		assert.equal(caseScore.observed, "fail");
		assert.equal(
			caseScore.issues.some(
				(issue) => issue.id === "implementation_missing_acceptance_coverage",
			),
			true,
		);
	});
});
