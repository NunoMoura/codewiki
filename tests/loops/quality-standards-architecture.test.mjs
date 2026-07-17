import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	DECISION_LOOP_GRAPH,
	evaluateDecisionExitGraph,
} from "../../src/decision/loop.ts";
import {
	decisionQualityStandards,
	evaluateDecisionQualityStandards,
} from "../../src/decision/quality-standards.ts";
import {
	IMPLEMENTATION_LOOP_GRAPH,
	evaluateImplementationExitGraph,
} from "../../src/implementation/loop.ts";
import { evaluateImplementationQualityStandards } from "../../src/implementation/quality-standards.ts";
import { criteriaFromQualityStandards } from "../../src/loops/quality-standards.ts";
import {
	PLANNING_LOOP_GRAPH,
	evaluatePlanningExitGraph,
} from "../../src/planning/loop.ts";
import {
	evaluatePlanningQualityStandards,
	planningQualityStandards,
} from "../../src/planning/quality-standards.ts";
import { buildQualityView } from "../../src/views/quality.ts";

describe("loop quality-standard architecture", () => {
	it("keeps decision standard implementation in decision/quality-standards", () => {
		const issues = [
			{
				code: "missing_current_state",
				changeId: "CHG-1",
				message: "Proposed change CHG-1 is missing current state.",
			},
		];
		const direct = evaluateDecisionQualityStandards({
			graph: DECISION_LOOP_GRAPH,
			issues,
			approvedChanges: [],
		});

		assert.deepEqual(direct, evaluateDecisionExitGraph(issues, []));
		assert.equal(
			direct.find((standard) => standard.id === "intention_understood").status,
			"unmet",
		);
		assert.equal(direct[0].graphId, DECISION_LOOP_GRAPH.graphId);
	});

	it("keeps planning standard implementation in planning/quality-standards", () => {
		const issues = [
			{
				code: "missing_decision_coverage",
				decisionRef: "trace:TRACE-demo:decision:iteration:1#change:CHG-1",
				message: "Decision ref is not covered.",
			},
		];
		const direct = evaluatePlanningQualityStandards(
			PLANNING_LOOP_GRAPH,
			issues,
		);

		assert.deepEqual(direct, evaluatePlanningExitGraph(issues));
		assert.equal(direct[0].id, "decision_coverage_complete");
		assert.equal(direct[0].status, "unmet");
	});

	it("keeps implementation standard implementation in implementation/quality-standards", () => {
		const issues = [
			{
				code: "missing_acceptance_evidence",
				planningRef: "trace:TRACE-demo:planning:iteration:1#work:WU-1",
				changeId: "CHG-1",
				message: "Acceptance evidence is missing.",
			},
		];
		const direct = evaluateImplementationQualityStandards(
			IMPLEMENTATION_LOOP_GRAPH,
			issues,
		);

		assert.deepEqual(direct, evaluateImplementationExitGraph(issues));
		assert.equal(direct[2].id, "acceptance_evidence_complete");
		assert.equal(direct[2].status, "unmet");
	});

	it("uses product terms in quality standard descriptions", () => {
		const descriptions = [
			...decisionQualityStandards([], []),
			...DECISION_LOOP_GRAPH.nodes,
			...planningQualityStandards([]),
			...PLANNING_LOOP_GRAPH.nodes,
		].map((standard) => standard.description || "");

		for (const description of descriptions) {
			assert.doesNotMatch(
				description,
				/\b(row|rows|table|tables|approved change|approved changes|work unit|work units)\b/i,
			);
		}
	});

	it("normalizes legacy trace quality standard descriptions", () => {
		const quality = buildQualityView({
			records: [
				{
					type: "trace_head",
					traceId: "TRACE-quality-legacy",
					title: "Legacy quality text",
					createdAt: "2026-07-07T00:00:00.000Z",
				},
				{
					type: "trace_event",
					id: "TRACE-quality-legacy:decision:iteration:1",
					traceId: "TRACE-quality-legacy",
					sequence: 1,
					loop: "decision",
					event: "changes_approved",
					refs: [],
					createdAt: "2026-07-07T00:00:00.000Z",
					data: {
						output: {
							qualityStandards: [
								{
									id: "sprint_proposal_ready",
									status: "met",
									mode: "deterministic",
									description:
										"Sprint Proposal has at least one approved row and stable row ids.",
									refs: [],
								},
							],
						},
						exit: { status: "exit" },
					},
				},
			],
		});
		const description = quality.iterations[0].standards[0].description;

		assert.equal(
			description,
			"Decision loop output has at least one Decision and stable Decision ids.",
		);
		assert.doesNotMatch(description, /\b(row|rows|table|tables)\b/i);
	});

	it("keeps shared standard helpers in loops/quality-standards", () => {
		const criteria = criteriaFromQualityStandards([
			{
				id: "demo",
				status: "blocked",
				mode: "deterministic",
				description: "demo standard",
				message: "demo blocked",
			},
		]);

		assert.deepEqual(criteria, [
			{ id: "demo", status: "block", message: "demo blocked" },
		]);
	});
});
