import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DECISION_LOOP_GRAPH } from "../../src/decision/loop.ts";
import { IMPLEMENTATION_LOOP_GRAPH } from "../../src/implementation/loop.ts";
import { PLANNING_LOOP_GRAPH } from "../../src/planning/loop.ts";

const EXPECTED_HARD_GATES = {
	decision: [
		"decision_table_ready",
		"intention_understood",
		"work_routing_classified",
		"loop_route_safe",
		"approval_safety",
		"current_state_grounded",
		"evidence_sufficient",
		"risks_and_alternatives_considered",
		"active_trace_conflicts_resolved",
		"decision_kind_classified",
	],
	planning: [
		"decision_coverage_complete",
		"worker_units_self_contained",
		"acceptance_and_verification_testable",
		"planning_depth_accounted",
		"source_ownership_aligned",
		"dependency_order_clear",
		"triggers_valid",
		"resolutions_accounted",
		"traceability_refs_canonical",
	],
	implementation: [
		"planning_coverage_complete",
		"scope_controlled",
		"acceptance_evidence_complete",
		"verification_passed",
		"tdd_evidence_valid",
		"content_proof_recorded",
		"worker_claims_correlated",
		"source_ownership_aligned",
		"archive_disposition_ready",
		"implementation_review_evidence_clean",
		"release_safety_approved",
		"traceability_refs_canonical",
	],
};

const GRAPHS = {
	decision: DECISION_LOOP_GRAPH,
	planning: PLANNING_LOOP_GRAPH,
	implementation: IMPLEMENTATION_LOOP_GRAPH,
};

describe("loop quality gate policy", () => {
	for (const [loop, graph] of Object.entries(GRAPHS)) {
		it(`${loop} graph keeps binary semantic gates explicit`, () => {
			const expected = EXPECTED_HARD_GATES[loop];
			const actual = graph.nodes
				.filter((node) => node.gate === "hard" || node.hardGate)
				.map((node) => node.id);

			assert.deepEqual(actual, expected);
			for (const node of graph.nodes) {
				if (expected.includes(node.id)) {
					assert.equal(node.gate, "hard", node.id);
					assert.equal(node.hardGate, true, node.id);
					assert.notEqual(node.method, "model_judge", node.id);
				} else {
					assert.notEqual(node.gate, "hard", node.id);
				}
			}
		});
	}
});
