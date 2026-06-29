import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	DECISION_LOOP_GRAPH,
	evaluateDecisionExitGraph,
} from "../../src/decision/loop.ts";
import { evaluateLoopQualityGraph } from "../../src/loops/evaluator.ts";
import { LOOP_QUALITY_GRAPH_SCHEMA_VERSION } from "../../src/loops/graph.ts";
import { validateLoopQualityProfile } from "../../src/loops/quality-profile.ts";
import {
	IMPLEMENTATION_LOOP_GRAPH,
	evaluateImplementationExitGraph,
} from "../../src/implementation/loop.ts";
import {
	PLANNING_LOOP_GRAPH,
	evaluatePlanningExitGraph,
} from "../../src/planning/loop.ts";

const LOOP_GRAPHS = [
	{
		loop: "decision",
		graph: DECISION_LOOP_GRAPH,
		evaluateNodeIssue(node) {
			return evaluateDecisionExitGraph(
				[
					{
						code: node.codes[0],
						rowId: "DTR-node-contract",
						message: `synthetic ${node.codes[0]}`,
					},
				],
				[],
			);
		},
	},
	{
		loop: "planning",
		graph: PLANNING_LOOP_GRAPH,
		evaluateNodeIssue(node) {
			return evaluatePlanningExitGraph([
				{
					code: node.codes[0],
					message: `synthetic ${node.codes[0]}`,
					route: "planning",
				},
			]);
		},
	},
	{
		loop: "implementation",
		graph: IMPLEMENTATION_LOOP_GRAPH,
		evaluateNodeIssue(node) {
			return evaluateImplementationExitGraph([
				{
					code: node.codes[0],
					message: `synthetic ${node.codes[0]}`,
					route: "implementation",
				},
			]);
		},
	},
];

describe("loop quality graph contracts", () => {
	for (const { loop, graph, evaluateNodeIssue } of LOOP_GRAPHS) {
		it(`${loop} graph classifies standards for fast AX feedback`, () => {
			assert.equal(graph.graphId, `${loop}.loop`);
			assert.equal(graph.schemaVersion, 2);
			assert.equal(graph.nodes.length > 0, true);
			assertUnique(graph.nodes.map((node) => node.id));

			for (const node of graph.nodes) {
				assert.equal(node.codes.length > 0, true, node.id);
				assert.ok(
					[
						"deterministic",
						"agent_self_assessment",
						"model_judge",
						"human_authority",
						"external_evidence",
					].includes(node.method),
					`${node.id} has method ${node.method}`,
				);
				assert.ok(["hard", "soft", "score_only"].includes(node.gate));
				assert.equal(typeof node.cost, "number");
				assert.equal(typeof node.weight, "number");
				assert.ok(node.timeoutMs > 0 && node.timeoutMs <= 1000);
				if (
					node.method === "agent_self_assessment" ||
					node.method === "model_judge"
				) {
					assert.equal(node.judge.id, `${node.id}.judge`, node.id);
					assert.equal(typeof node.judge.role, "string", node.id);
					assert.ok(node.judge.rubric.length > 0, node.id);
					assert.ok(node.judge.scoreThreshold > 0, node.id);
				} else {
					assert.equal(node.judge, undefined, node.id);
				}
				if (node.mode === "agent") {
					assert.equal(node.method, "agent_self_assessment", node.id);
				}
				if (node.mode === "user") {
					assert.equal(node.method, "human_authority", node.id);
				}

				const standard = evaluateNodeIssue(node).find(
					(result) => result.id === node.id,
				);
				assert.ok(standard, node.id);
				assert.notEqual(standard.status, "met", node.id);
				assert.equal(standard.method, node.method, node.id);
				assert.equal(standard.gate, node.gate, node.id);
				assert.equal(standard.timeoutMs, node.timeoutMs, node.id);
			}
		});
	}
});

it("applies quality profile activation masks without mutating graph identity", () => {
	const graph = {
		graphId: "toy.loop",
		graphVersion: "profile-test",
		schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
		layers: ["hard_gate", "input_contract"],
		nodes: [
			{
				id: "covered_standard",
				description: "Covered elsewhere by invariant.",
				codes: ["a"],
				layer: "input_contract",
				standardType: "loop_contract",
				method: "deterministic",
				repairTarget: "decision",
				weight: 1,
				cost: 1,
				gate: "soft",
			},
			{
				id: "hard_standard",
				description: "Hard gate remains protected.",
				codes: ["b"],
				layer: "hard_gate",
				standardType: "risk_authority",
				method: "deterministic",
				repairTarget: "decision",
				weight: 1,
				cost: 1,
				gate: "hard",
			},
		],
	};
	const profile = {
		id: "toy.profile",
		nodes: {
			covered_standard: {
				state: "not_applicable",
				reason: "covered_by_invariant",
				refs: ["kb:system/loop-model.md"],
			},
		},
	};
	const standards = evaluateLoopQualityGraph({
		graph,
		profile,
		issues: [],
		issueCode: (issue) => issue.code,
		issueMessage: (issue) => issue.message,
		issueRefs: () => [],
	});

	assert.equal(standards[0].status, "not_applicable");
	assert.notEqual(standards[0].status, "met");
	assert.equal(standards[0].graphId, graph.graphId);
	assert.equal(standards[1].status, "met");
	assert.deepEqual(validateLoopQualityProfile(graph, profile), []);
	assert.equal(
		validateLoopQualityProfile(graph, {
			id: "unsafe.profile",
			nodes: { hard_standard: { state: "not_applicable" } },
		}).some((issue) => issue.code === "missing_inactive_reason"),
		true,
	);
});

it("assigns partial deterministic quality scores without changing fail safety", () => {
	const standards = evaluateLoopQualityGraph({
		graph: {
			graphId: "toy.loop",
			graphVersion: "score-test",
			schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
			layers: ["input_contract"],
			nodes: [
				{
					id: "multi_field_standard",
					description: "Several fields contribute to one standard.",
					codes: ["a", "b", "c", "d"],
					layer: "input_contract",
					standardType: "loop_contract",
					method: "deterministic",
					repairTarget: "decision",
					weight: 1,
					cost: 1,
					gate: "soft",
				},
			],
		},
		issues: [{ code: "a", message: "field a missing" }],
		issueCode: (issue) => issue.code,
		issueMessage: (issue) => issue.message,
		issueRefs: () => [],
	});

	assert.equal(standards[0].status, "unmet");
	assert.equal(standards[0].score, 75);
	assert.equal(standards[0].scoreThreshold, 80);
});

function assertUnique(values) {
	assert.equal(new Set(values).size, values.length);
}
