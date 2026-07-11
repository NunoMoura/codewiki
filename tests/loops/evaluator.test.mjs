import assert from "node:assert/strict";
import { test } from "node:test";

import { runLoopQualityGraphEvaluation } from "../../src/loops/evaluator.ts";
import { LOOP_QUALITY_GRAPH_SCHEMA_VERSION } from "../../src/loops/graph.ts";

test("keeps observe and warn rollouts non-authoritative while enforce remains blocking", async () => {
	async function evaluateRollout(rollout) {
		const graph = {
			graphId: "decision.loop",
			graphVersion: `rollout-${rollout}`,
			schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
			layers: ["hard_gate"],
			nodes: [
				{
					id: `${rollout}_standard`,
					description: `${rollout} standard`,
					codes: ["bad_input"],
					layer: "hard_gate",
					standardType: "loop_contract",
					method: "deterministic",
					repairTarget: "decision",
					weight: 1,
					cost: 1,
					gate: "hard",
					timeoutMs: 100,
					rollout,
				},
			],
		};
		return runLoopQualityGraphEvaluation({
			graph,
			issues: [{ code: "bad_input", message: "bad input" }],
			issueCode: (issue) => issue.code,
			issueMessage: (issue) => issue.message,
			issueRefs: () => [],
		});
	}

	const observed = await evaluateRollout("observe");
	assert.equal(observed.runner.status, "pass");
	assert.equal(observed.standards[0].status, "met");
	assert.deepEqual(observed.runner.diagnostics, []);

	const warned = await evaluateRollout("warn");
	assert.equal(warned.runner.status, "pass");
	assert.equal(warned.standards[0].status, "met");
	assert.equal(warned.runner.diagnostics[0].severity, "warning");
	assert.match(warned.runner.diagnostics[0].message, /bad input/);

	const enforced = await evaluateRollout("enforce");
	assert.equal(enforced.runner.status, "fail");
	assert.equal(enforced.standards[0].status, "unmet");
});

test("filters inactive dependencies from runner scheduling", async () => {
	const graph = {
		graphId: "decision.loop",
		graphVersion: "inactive-dependency",
		schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
		layers: ["hard_gate", "coverage"],
		nodes: [
			{
				id: "dependent",
				description: "Runs without waiting for an inactive dependency.",
				codes: ["dependent_issue"],
				layer: "coverage",
				standardType: "coverage",
				method: "deterministic",
				repairTarget: "decision",
				weight: 1,
				cost: 1,
				gate: "soft",
				timeoutMs: 100,
				dependsOn: ["inactive"],
			},
			{
				id: "inactive",
				description: "Inactive prerequisite.",
				codes: ["inactive_issue"],
				layer: "hard_gate",
				standardType: "loop_contract",
				method: "deterministic",
				repairTarget: "decision",
				weight: 1,
				cost: 1,
				gate: "hard",
				timeoutMs: 100,
			},
		],
	};
	const result = await runLoopQualityGraphEvaluation({
		graph,
		profile: {
			id: "inactive-dependency.profile",
			nodes: {
				inactive: {
					state: "not_applicable",
					reason: "covered_by_invariant",
					refs: ["kb:system/components/loop-model.md"],
				},
			},
		},
		issues: [],
		issueCode: (issue) => issue.code,
		issueMessage: (issue) => issue.message,
		issueRefs: () => [],
	});

	assert.deepEqual(
		result.runner.nodes.map((node) => node.id),
		["dependent", "inactive"],
	);
	assert.equal(result.runner.status, "pass");
});
