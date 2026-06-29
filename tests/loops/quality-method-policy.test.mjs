import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DECISION_LOOP_GRAPH } from "../../src/decision/loop.ts";
import { IMPLEMENTATION_LOOP_GRAPH } from "../../src/implementation/loop.ts";
import { PLANNING_LOOP_GRAPH } from "../../src/planning/loop.ts";

const EXPECTED_METHOD_NODES = {
	decision: {
		agent_self_assessment: ["intention_validated"],
		human_authority: [],
		external_evidence: [],
		model_judge: [
			"decision_semantically_sufficient",
			"cost_tradeoff_plausible",
			"risk_tier_plausible",
		],
	},
	planning: {
		agent_self_assessment: [
			"worker_assignment_ready",
			"uncertainty_resolved",
			"work_unit_right_sized",
		],
		human_authority: [],
		external_evidence: [],
		model_judge: [
			"work_unit_atomic_judged",
			"acceptance_criteria_testable_judged",
			"scope_minimal_judged",
		],
	},
	implementation: {
		agent_self_assessment: [
			"production_quality_reviewed",
			"uncertainty_resolved",
			"security_privacy_reviewed",
			"accessibility_ui_reviewed",
			"dependency_risk_controlled",
		],
		human_authority: ["release_safety_approved"],
		external_evidence: [
			"verification_passed",
			"tdd_evidence_valid",
			"content_proof_recorded",
			"implementation_review_evidence_clean",
		],
		model_judge: [
			"evidence_matches_claims_judged",
			"checks_relevant_judged",
			"implementation_readiness_judged",
		],
	},
};

const GRAPHS = {
	decision: DECISION_LOOP_GRAPH,
	planning: PLANNING_LOOP_GRAPH,
	implementation: IMPLEMENTATION_LOOP_GRAPH,
};

describe("loop quality method policy", () => {
	for (const [loop, graph] of Object.entries(GRAPHS)) {
		it(`${loop} graph records standard ownership methods`, () => {
			const expected = EXPECTED_METHOD_NODES[loop];
			for (const [method, nodeIds] of Object.entries(expected)) {
				assert.deepEqual(nodesByMethod(graph, method), nodeIds, method);
			}

			for (const node of graph.nodes) {
				if (node.mode === "agent") {
					assert.equal(node.method, "agent_self_assessment", node.id);
				}
				if (node.mode === "user") {
					assert.equal(node.method, "human_authority", node.id);
				}
				if (node.method === "external_evidence") {
					assert.ok(
						[
							"verification_passed",
							"tdd_evidence_valid",
							"content_proof_recorded",
							"implementation_review_evidence_clean",
						].includes(node.id),
						node.id,
					);
				}
				if (node.method === "model_judge") {
					assert.equal(node.gate, "soft", node.id);
				}
				if (
					node.method === "model_judge" ||
					node.method === "agent_self_assessment"
				) {
					assert.equal(node.judge.id, `${node.id}.judge`, node.id);
				}
			}
		});
	}
});

function nodesByMethod(graph, method) {
	return graph.nodes
		.filter((node) => node.method === method)
		.map((node) => node.id);
}
