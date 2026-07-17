import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	DECISION_LOOP_GRAPH,
	DECISION_LOOP_QUALITY_PACK,
} from "../../src/decision/loop.ts";
import {
	IMPLEMENTATION_LOOP_GRAPH,
	IMPLEMENTATION_LOOP_QUALITY_PACK,
} from "../../src/implementation/loop.ts";
import { loopQualityGraphHash } from "../../src/loops/graph.ts";
import {
	PLANNING_LOOP_GRAPH,
	PLANNING_LOOP_QUALITY_PACK,
} from "../../src/planning/loop.ts";

const productionLoops = [
	{
		pack: DECISION_LOOP_QUALITY_PACK,
		graph: DECISION_LOOP_GRAPH,
		hash: "sha256:fed3354b9b1302e1ce960701812e7d6be375b4ef59a68355f8c541158eb303e2",
	},
	{
		pack: PLANNING_LOOP_QUALITY_PACK,
		graph: PLANNING_LOOP_GRAPH,
		hash: "sha256:0d543564720877e1b4d06ad88e123093d6f60886f70e390f1ce4d763ec249400",
	},
	{
		pack: IMPLEMENTATION_LOOP_QUALITY_PACK,
		graph: IMPLEMENTATION_LOOP_GRAPH,
		hash: "sha256:0c9870dcf8fc2b56ebde89952feeacbefe5a07b4b76d27594818287a4daa5e09",
	},
];

describe("production quality-pack migration", () => {
	it("defines immutable enforcing kernel packs for all semantic loops", () => {
		for (const { pack, graph } of productionLoops) {
			assert.equal(pack.authority, "kernel");
			assert.equal(pack.rollout, "enforce");
			assert.equal(pack.graph.graphId, graph.graphId);
			assert.equal(pack.graph.graphVersion, graph.graphVersion);
			assert.deepEqual(
				pack.standards.map((standard) => standard.id),
				graph.nodes.map((node) => node.id),
			);
		}
	});

	it("pins reviewed graph identity and effective standard behavior", () => {
		for (const { pack, graph, hash } of productionLoops) {
			assert.equal(loopQualityGraphHash(graph), hash);
			for (const [index, node] of graph.nodes.entries()) {
				const standard = pack.standards[index];
				assert.equal(node.method, standard.method);
				assert.equal(node.gate, standard.gate);
				assert.equal(node.weight, standard.weight);
				assert.equal(node.cost, standard.cost);
				assert.equal(node.timeoutMs, standard.timeoutMs);
				assert.deepEqual(node.codes, standard.issuePredicate.codes);
			}
		}
	});
});
