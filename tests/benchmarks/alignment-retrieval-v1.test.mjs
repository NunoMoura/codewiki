import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {runAlignmentRetrievalBenchmark} from "../../benchmarks/alignment-retrieval.ts";
import {
	createAlignmentGraphRetrievalAdapter,
	createOkfSourceProjectionRetrievalAdapter,
	createPlainSearchRetrievalAdapter,
	createRecordedAlignmentRetrievalAdapter,
	createUnavailableAlignmentRetrievalAdapter,
} from "../../benchmarks/retrieval-adapters.ts";
import {projectAlignmentGraph} from "../../src/alignment/graph.ts";
import {augmentAlignmentGraphWithKnowledge} from "../../src/alignment/knowledge.ts";
import {digest} from "../helpers/change-trace-v1.mjs";
import {createThreeBatchJourney} from "../helpers/change-trace-replay-v1.mjs";

const cases = [
	{
		id: "claim-authority",
		query: "Which source defines distributed Claim authority?",
		relevantRefs: ["src/changes/trace/mutation.ts", "system/runtime-work-item-claims"],
	},
	{
		id: "planning-frontier",
		query: "Why is a Work Item absent from the safe frontier?",
		relevantRefs: ["src/changes/trace/rolling-planning.ts", "system/planning-loop"],
	},
];

function adapter(method, responses, available = true) {
	return {
		method,
		available,
		...(available ? {} : {unavailableReason: "dependency_not_installed"}),
		retrieve: ({caseId, snapshotDigest, maxResults}) => {
			assert.equal(snapshotDigest, digest("a"));
			return {refs: responses[caseId].slice(0, maxResults)};
		},
	};
}

describe("Alignment retrieval benchmark harness", () => {
	it("reports Pareto metrics under one snapshot and exposes unavailable Graphify", async () => {
		let tick = 0;
		const report = await runAlignmentRetrievalBenchmark({
			snapshotDigest: digest("a"),
			maxResults: 3,
			cases,
			now: () => tick++,
			adapters: [
				adapter("plain_search", {
					"claim-authority": ["unrelated", "src/changes/trace/mutation.ts"],
					"planning-frontier": ["src/changes/trace/rolling-planning.ts", "noise"],
				}),
				adapter("pi_lens", {
					"claim-authority": [
						"src/changes/trace/mutation.ts",
						"system/runtime-work-item-claims",
					],
					"planning-frontier": [
						"src/changes/trace/rolling-planning.ts",
						"system/planning-loop",
					],
				}),
				adapter("okf_source_projection", {
					"claim-authority": ["system/runtime-work-item-claims"],
					"planning-frontier": ["system/planning-loop"],
				}),
				adapter("alignment_graph", {
					"claim-authority": [
						"system/runtime-work-item-claims",
						"src/changes/trace/mutation.ts",
					],
					"planning-frontier": [
						"system/planning-loop",
						"src/changes/trace/rolling-planning.ts",
					],
				}),
				adapter(
					"graphify",
					{"claim-authority": [], "planning-frontier": []},
					false,
				),
			],
		});
		assert.deepEqual(
			report.methods.map((result) => [result.method, result.status]),
			[
				["plain_search", "available"],
				["pi_lens", "available"],
				["okf_source_projection", "available"],
				["alignment_graph", "available"],
				["graphify", "unavailable"],
			],
		);
		const plain = report.methods[0];
		const lens = report.methods[1];
		assert.equal(plain.meanRecall, 0.5);
		assert.equal(plain.falsePositiveRate, 0.5);
		assert.equal(lens.meanRecall, 1);
		assert.equal(lens.meanPrecision, 1);
		assert.equal(report.methods[4].unavailableReason, "dependency_not_installed");
		assert.ok(report.reportDigest);
		assert.equal("overallScore" in report, false);
	});

	it("runs plain, recorded Pi-Lens, OKF, and graph adapters against one graph snapshot", async () => {
		const state = createThreeBatchJourney("CHG-benchmark-adapters").states[2];
		const projection = {
			knowledgeDigest: state.observedBase.knowledgeDigest,
			concepts: [
				{
					conceptId: "kb:system/claim-authority",
					path: ".codewiki/kb/system/claim-authority.md",
					authority: "accepted",
					type: "System Responsibility",
					title: "Distributed Claim authority",
					status: "stable",
					trustTier: "human-reviewed",
					stale: false,
					markdownReferences: [],
					sourceResources: [],
					relationships: [],
					sourcePatterns: ["src/changes/trace/mutation.ts"],
					testPatterns: ["tests/changes/trace/distributed-mutation-v1.test.mjs"],
				},
			],
		};
		const graph = augmentAlignmentGraphWithKnowledge(
			projectAlignmentGraph(state),
			projection,
		);
		const benchmarkCases = [
			{
				id: "claim-authority",
				query: "distributed Claim authority mutation",
				relevantRefs: [
					"src/changes/trace/mutation.ts",
					".codewiki/kb/system/claim-authority.md",
				],
			},
		];
		const report = await runAlignmentRetrievalBenchmark({
			snapshotDigest: graph.graphSnapshotDigest,
			maxResults: 3,
			cases: benchmarkCases,
			adapters: [
				createPlainSearchRetrievalAdapter({
					snapshotDigest: graph.graphSnapshotDigest,
					documents: [
						{
							ref: "src/changes/trace/mutation.ts",
							text: "distributed Claim authority mutation takeover",
						},
						{
							ref: ".codewiki/kb/system/claim-authority.md",
							text: "distributed Claim authority policy",
						},
						{ref: "src/project-server/app/server.ts", text: "App HTTP host server"},
					],
				}),
				createRecordedAlignmentRetrievalAdapter("pi_lens", {
					snapshotDigest: graph.graphSnapshotDigest,
					refsByCase: {
						"claim-authority": [
							"src/changes/trace/mutation.ts",
							".codewiki/kb/system/claim-authority.md",
						],
					},
				}),
				createOkfSourceProjectionRetrievalAdapter({
					snapshotDigest: graph.graphSnapshotDigest,
					projection,
				}),
				createAlignmentGraphRetrievalAdapter({
					graph,
					synchronizationStatus: "fresh",
					requests: {
						"claim-authority": {
							family: "knowledge_impact",
							graphSnapshotDigest: graph.graphSnapshotDigest,
							conceptId: "kb:system/claim-authority",
							depth: 2,
						},
					},
				}),
				createUnavailableAlignmentRetrievalAdapter(
					"graphify",
					"dependency_not_installed",
				),
			],
		});
		for (const method of report.methods.slice(0, 4)) {
			assert.equal(method.status, "available");
			assert.equal(method.meanRecall, 1, method.method);
		}
		assert.equal(report.methods[4].status, "unavailable");
	});

	it("fails malformed fairness input and records adapter errors without hiding them", async () => {
		await assert.rejects(
			() =>
				runAlignmentRetrievalBenchmark({
					snapshotDigest: digest("a"),
					maxResults: 0,
					cases,
					adapters: [],
				}),
			/maxResults/,
		);
		const report = await runAlignmentRetrievalBenchmark({
			snapshotDigest: digest("a"),
			maxResults: 3,
			cases,
			adapters: [
				{
					method: "plain_search",
					available: true,
					retrieve: () => {
						throw new Error("fixture adapter failed");
					},
				},
			],
		});
		assert.equal(report.methods[0].status, "error");
		assert.equal(report.methods[0].error, "fixture adapter failed");
		assert.equal(report.methods[1].status, "unavailable");
	});
});
