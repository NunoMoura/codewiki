import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	collectDecisionExitIssues,
	DECISION_LOOP_GRAPH,
	evaluateDecisionExit,
	evaluateDecisionExitGraph,
} from "../../src/decision/loop.ts";
import {
	collectImplementationExitIssues,
	evaluateImplementationExit,
	evaluateImplementationExitGraph,
	IMPLEMENTATION_LOOP_GRAPH,
} from "../../src/implementation/loop.ts";
import {
	collectPlanningExitIssues,
	evaluatePlanningExit,
	evaluatePlanningExitGraph,
	PLANNING_LOOP_GRAPH,
} from "../../src/planning/loop.ts";
import { decisionCases } from "../../lab/decision/cases.ts";
import { implementationCases } from "../../lab/implementation/cases.ts";
import { planningCases } from "../../lab/planning/cases.ts";

describe("src loop exits support the lab substrate", () => {
	it("exposes decision issue collection and a versioned production quality graph", () => {
		const input = decisionCases[0].input;
		const collected = collectDecisionExitIssues(
			input.decisionTable,
			input.options,
		);
		const evaluated = evaluateDecisionExit(input.decisionTable, input.options);
		const standards = evaluateDecisionExitGraph(
			collected.issues,
			collected.approvedRows,
		);

		assert.deepEqual(collected.issues, evaluated.issues);
		assert.deepEqual(
			collected.approvedRows.map((row) => row.id),
			evaluated.approvedRowIds,
		);
		assert.deepEqual(standards, evaluated.qualityStandards);
		assertGraphShape(DECISION_LOOP_GRAPH, "decision.loop");
		assertGraphStandards(evaluated.qualityStandards, "decision.loop");
	});

	it("exposes planning issue collection and a versioned production quality graph", () => {
		const input = planningCases[0].input.plan;
		const issues = collectPlanningExitIssues(input);
		const evaluated = evaluatePlanningExit(input);
		const standards = evaluatePlanningExitGraph(issues);

		assert.deepEqual(issues, evaluated.issues);
		assert.deepEqual(standards, evaluated.qualityStandards);
		assertGraphShape(PLANNING_LOOP_GRAPH, "planning.loop");
		assertGraphStandards(evaluated.qualityStandards, "planning.loop");
	});

	it("exposes implementation issue collection and a versioned production quality graph", () => {
		const input = implementationCases[0].input.implementation;
		const issues = collectImplementationExitIssues(input);
		const evaluated = evaluateImplementationExit(input);
		const standards = evaluateImplementationExitGraph(issues);

		assert.deepEqual(issues, evaluated.issues);
		assert.deepEqual(standards, evaluated.qualityStandards);
		assertGraphShape(IMPLEMENTATION_LOOP_GRAPH, "implementation.loop");
		assertGraphStandards(evaluated.qualityStandards, "implementation.loop");
	});
});

function assertGraphShape(graph, graphId) {
	assert.equal(graph.graphId, graphId);
	assert.equal(typeof graph.graphVersion, "string");
	assert.equal(graph.schemaVersion, 2);
	assert.equal(Array.isArray(graph.layers), true);
	assert.equal(Array.isArray(graph.nodes), true);
	assert.equal(graph.nodes.length > 0, true);
	assert.equal(
		new Set(graph.nodes.map((node) => node.id)).size,
		graph.nodes.length,
	);
	for (const node of graph.nodes) {
		assert.equal(typeof node.id, "string");
		assert.equal(typeof node.weight, "number");
		assert.equal(node.weight > 0, true);
		assert.equal(typeof node.cost, "number");
		assert.equal(node.cost > 0, true);
		assert.equal(graph.layers.includes(node.layer), true);
		assert.equal(typeof node.standardType, "string");
		assert.equal(typeof node.method, "string");
		assert.equal(typeof node.repairTarget, "string");
		assert.ok(Array.isArray(node.codes));
		assert.equal(node.codes.length > 0, true);
	}
}

function assertGraphStandards(standards, graphId) {
	assert.equal(standards.length > 0, true);
	for (const standard of standards) {
		assert.equal(standard.graphId, graphId);
		assert.equal(typeof standard.graphVersion, "string");
		assert.match(standard.graphHash, /^sha256:/);
		assert.equal(typeof standard.layer, "string");
		assert.equal(typeof standard.standardType, "string");
		assert.equal(typeof standard.cost, "number");
		assert.equal(typeof standard.score, "number");
		assert.equal(typeof standard.repairTarget, "string");
	}
}
