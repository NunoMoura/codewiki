import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertValidLoopQualityGraph } from "../../../src/verification/quality/graph.ts";
import {
	LOOP_QUALITY_PACK_SCHEMA_VERSION,
	parseLoopQualityPack,
} from "../../../src/verification/quality/pack.ts";

function validPack() {
	return {
		schemaVersion: LOOP_QUALITY_PACK_SCHEMA_VERSION,
		id: "codewiki.decision.default",
		version: "1.0.0",
		authority: "official",
		rollout: "enforce",
		graph: {
			id: "decision.loop",
			version: "pack-v1",
			layers: ["hard_gate", "evidence_quality"],
		},
		standards: [
			{
				id: "input_valid",
				description: "Input satisfies the loop contract.",
				layer: "hard_gate",
				standardType: "loop_contract",
				method: "deterministic",
				repairTarget: "decision",
				weight: 10,
				cost: 2,
				gate: "hard",
				timeoutMs: 100,
				dependsOn: [],
				evaluatorId: "issue_codes",
				evidenceAdapterIds: ["trace_refs"],
				issuePredicate: {
					kind: "issue_codes",
					match: "any",
					codes: ["invalid_input"],
				},
			},
			{
				id: "evidence_reviewed",
				description: "Evidence is independently reviewed.",
				layer: "evidence_quality",
				standardType: "evidence_quality",
				method: "external_evidence",
				repairTarget: "trace",
				weight: 5,
				cost: 3,
				gate: "soft",
				timeoutMs: 200,
				dependsOn: ["input_valid"],
				evaluatorId: "external_evidence",
				evidenceAdapterIds: ["review_evidence", "content_proof"],
				issuePredicate: {
					kind: "issue_codes",
					match: "any",
					codes: ["missing_review_evidence"],
				},
			},
		],
	};
}

describe("declarative quality packs", () => {
	it("normalizes valid packs into graph-v3-compatible declarations", () => {
		const pack = parseLoopQualityPack(validPack());

		assert.equal(pack.schemaVersion, LOOP_QUALITY_PACK_SCHEMA_VERSION);
		assert.equal(pack.graph.schemaVersion, 3);
		assert.equal(pack.graph.graphId, "decision.loop");
		assert.equal(pack.graph.graphVersion, "pack-v1");
		assert.deepEqual(pack.graph.layers, ["hard_gate", "evidence_quality"]);
		assert.deepEqual(
			pack.standards.map((standard) => standard.id),
			["input_valid", "evidence_reviewed"],
		);
		assert.deepEqual(pack.standards[1].dependsOn, ["input_valid"]);
		assert.deepEqual(pack.standards[1].codes, ["missing_review_evidence"]);
		assert.doesNotThrow(() =>
			assertValidLoopQualityGraph({ ...pack.graph, nodes: pack.standards }),
		);
		assert.deepEqual(parseLoopQualityPack(structuredClone(validPack())), pack);
	});

	it("rejects unknown keys at every nested schema boundary", () => {
		const cases = [
			["rootExtra", (pack) => (pack.rootExtra = "node script.js")],
			["graph.customLoop", (pack) => (pack.graph.customLoop = "review")],
			[
				"approval.owner",
				(pack) => {
					pack.approval = {
						status: "approved",
						refs: ["trace:TRACE-pack-review:decision:iteration:1"],
						owner: "project",
					};
				},
			],
			["standards[0].shell", (pack) => (pack.standards[0].shell = "eslint")],
			[
				"standards[0].issuePredicate.expression",
				(pack) =>
					(pack.standards[0].issuePredicate.expression = "issue => true"),
			],
			[
				"standards[0].judge.command",
				(pack) => {
					pack.standards[0].method = "model_judge";
					pack.standards[0].evaluatorId = "model_judge";
					pack.standards[0].judge = {
						id: "input_valid.judge",
						role: "contract reviewer",
						rubric: ["Reject invalid loop input."],
						scoreThreshold: 80,
						command: "run-model",
					};
				},
			],
		];

		for (const [path, mutate] of cases) {
			const pack = validPack();
			mutate(pack);
			assert.throws(
				() => parseLoopQualityPack(pack),
				(error) => error.message.includes(`${path} has unknown key`),
			);
		}
	});

	it("rejects duplicate ids, invalid dependencies, undeclared layers, and cycles", () => {
		const duplicate = validPack();
		duplicate.standards[1].id = "input_valid";
		assert.throws(
			() => parseLoopQualityPack(duplicate),
			/standards\[1\]\.id duplicates input_valid/,
		);

		const unknownDependency = validPack();
		unknownDependency.standards[1].dependsOn = ["missing"];
		assert.throws(
			() => parseLoopQualityPack(unknownDependency),
			/standards\[1\]\.dependsOn\[0\] references unknown standard missing/,
		);

		const undeclaredLayer = validPack();
		undeclaredLayer.standards[0].layer = "coverage";
		assert.throws(
			() => parseLoopQualityPack(undeclaredLayer),
			/standards\[0\]\.layer uses undeclared layer coverage/,
		);

		const cycle = validPack();
		cycle.standards[0].dependsOn = ["evidence_reviewed"];
		assert.throws(
			() => parseLoopQualityPack(cycle),
			/standards dependency cycle at input_valid/,
		);
	});

	it("allows only CodeWiki-owned evaluator and evidence-adapter ids", () => {
		const evaluator = validPack();
		evaluator.standards[0].evaluatorId = "project_javascript";
		assert.throws(
			() => parseLoopQualityPack(evaluator),
			/standards\[0\]\.evaluatorId has unsupported value project_javascript/,
		);

		const adapter = validPack();
		adapter.standards[0].evidenceAdapterIds = ["run_shell"];
		assert.throws(
			() => parseLoopQualityPack(adapter),
			/standards\[0\]\.evidenceAdapterIds\[0\] has unsupported value run_shell/,
		);

		const mismatch = validPack();
		mismatch.standards[0].method = "model_judge";
		assert.throws(
			() => parseLoopQualityPack(mismatch),
			/standards\[0\]\.evaluatorId issue_codes is incompatible with method model_judge/,
		);

		const customLoop = validPack();
		customLoop.graph.id = "project.custom-loop";
		assert.throws(
			() => parseLoopQualityPack(customLoop),
			/graph\.id has unsupported value project\.custom-loop/,
		);
	});

	it("rejects invalid gates, thresholds, costs, and timeouts with field paths", () => {
		const cases = [
			["standards[0].gate", "blocking"],
			["standards[0].weight", -1],
			["standards[0].cost", Number.NaN],
			["standards[0].timeoutMs", 0],
			["standards[0].scoreThreshold", 101],
		];

		for (const [path, value] of cases) {
			const pack = validPack();
			const field = path.split(".").at(-1);
			pack.standards[0][field] = value;
			assert.throws(
				() => parseLoopQualityPack(pack),
				(error) => error.message.includes(path),
			);
		}
	});

	it("protects kernel standards and rejects unapproved enforcement", () => {
		const override = validPack();
		override.authority = "project";
		override.rollout = "warn";
		override.standards[0].id = "approval_safety";
		assert.throws(
			() =>
				parseLoopQualityPack(override, {
					protectedKernelStandardIds: ["approval_safety"],
				}),
			/standards\[0\]\.id cannot override kernel standard approval_safety/,
		);

		const projectEnforce = validPack();
		projectEnforce.authority = "project";
		assert.throws(
			() => parseLoopQualityPack(projectEnforce),
			/approval is required before project pack codewiki\.decision\.default can enforce/,
		);

		projectEnforce.approval = {
			status: "approved",
			refs: ["trace:TRACE-quality-pack-review:decision:iteration:1"],
		};
		assert.equal(parseLoopQualityPack(projectEnforce).rollout, "enforce");

		const labEnforce = validPack();
		labEnforce.authority = "lab";
		assert.throws(
			() => parseLoopQualityPack(labEnforce),
			/lab pack codewiki\.decision\.default cannot enforce/,
		);
	});
});
