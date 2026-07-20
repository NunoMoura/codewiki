import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChangeRecord } from "../../src/changes/records.ts";
import { implementationCases } from "../../lab/implementation/cases.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";
import {
	DECISION_CHANGE_GRAPH_HASH,
	DECISION_CHANGE_GRAPH_ID,
	DECISION_CHANGE_GRAPH_VERSION,
	evaluateChangeDecision,
} from "../../src/decision/change-quality.ts";
import {
	collectImplementationExitIssues,
	evaluateImplementationExit,
	evaluateImplementationExitGraph,
	IMPLEMENTATION_LOOP_GRAPH,
} from "../../src/implementation/loop.ts";
import {
	PLANNING_PORTFOLIO_GRAPH_HASH,
	PLANNING_PORTFOLIO_GRAPH_ID,
	PLANNING_PORTFOLIO_GRAPH_VERSION,
	evaluatePortfolioPlanning,
} from "../../src/planning/portfolio-quality.ts";

describe("src loop exits support the lab substrate", () => {
	it("exposes canonical Decision quality graph metadata", () => {
		const evaluated = evaluateChangeDecision({
			record: createChangeRecord(acceptedChangeFixture()),
			workState: { changes: [] },
			disposition: "approve",
			rationale: "Approve exact validated Change.",
			authority: {
				kind: "user",
				actor: "user:test",
				ref: "approval:user:test",
			},
		});
		assert.equal(evaluated.passed, true);
		assert.deepEqual(evaluated.graph, {
			id: DECISION_CHANGE_GRAPH_ID,
			version: DECISION_CHANGE_GRAPH_VERSION,
			hash: DECISION_CHANGE_GRAPH_HASH,
		});
		assertGraphStandards(evaluated.standards, DECISION_CHANGE_GRAPH_ID);
	});

	it("exposes canonical portfolio Planning quality graph metadata", () => {
		const evaluated = evaluatePortfolioPlanning({
			changeIds: ["CHG-planning-test"],
			sprints: [
				{
					id: "SPR-planning-test",
					goal: "Test canonical portfolio quality.",
					participatingChangeIds: ["CHG-planning-test"],
					workItemIds: ["WI-planning-test"],
					rollbackBoundary: "Revert Sprint work as one boundary.",
					dependsOn: [],
					integrationRefs: [],
				},
			],
			workItems: [
				{
					id: "WI-planning-test",
					sprintId: "SPR-planning-test",
					owningChangeId: "CHG-planning-test",
					contributingChangeIds: [],
					title: "Test canonical portfolio quality",
					outcome: "Planning quality passes.",
					technicalRequirements: ["Preserve trace authority."],
					acceptanceCriteria: ["Quality report exits."],
					componentRefs: ["planning"],
					pathScopes: ["src/planning/**"],
					verification: ["npm test"],
					workerProfile: "implementation",
					dependsOn: [],
				},
			],
			workState: { changes: [], workItems: [], assignments: [] },
		});
		assert.equal(evaluated.passed, true);
		assert.deepEqual(evaluated.graph, {
			id: PLANNING_PORTFOLIO_GRAPH_ID,
			version: PLANNING_PORTFOLIO_GRAPH_VERSION,
			hash: PLANNING_PORTFOLIO_GRAPH_HASH,
		});
		assertGraphStandards(evaluated.standards, PLANNING_PORTFOLIO_GRAPH_ID);
	});

	it("exposes implementation issue collection and production graph", () => {
		const input = implementationCases[0].input.implementation;
		const issues = collectImplementationExitIssues(input);
		const evaluated = evaluateImplementationExit(input);
		const standards = evaluateImplementationExitGraph(issues);
		assert.deepEqual(issues, evaluated.issues);
		assert.deepEqual(standards, evaluated.qualityStandards);
		assert.equal(IMPLEMENTATION_LOOP_GRAPH.graphId, "implementation.loop");
		assertGraphStandards(evaluated.qualityStandards, "implementation.loop");
	});
});

function assertGraphStandards(standards, graphId) {
	assert.equal(standards.length > 0, true);
	for (const standard of standards) {
		assert.equal(standard.graphId, graphId);
		assert.equal(typeof standard.graphVersion, "string");
		assert.match(standard.graphHash, /^sha256:[a-f0-9]{64}$/);
	}
}
