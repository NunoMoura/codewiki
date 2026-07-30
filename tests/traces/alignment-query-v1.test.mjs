import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	augmentAlignmentGraphWithKnowledge,
	createKnowledgeAlignmentProjection,
	projectAlignmentGraph,
	queryAlignmentGraph,
} from "../../src/change-trace/index.ts";
import {canonicalJson} from "../../src/utils/canonical-json.ts";
import {gitObject} from "../helpers/change-trace-v1.mjs";
import {
	appendContradictoryDecisionResults,
	createThreeBatchJourney,
} from "../helpers/change-trace-replay-v1.mjs";

function knowledgeProjection(state) {
	return {
		knowledgeDigest: state.observedBase.knowledgeDigest,
		concepts: [
			{
				conceptId: "kb:system/runtime",
				path: ".codewiki/kb/system/components/runtime.md",
				authority: "accepted",
				type: "System Responsibility",
				title: "Runtime",
				status: "stable",
				trustTier: "human-reviewed",
				stale: false,
				markdownReferences: [],
				sourceResources: ["https://example.invalid/runtime-design"],
				relationships: [],
				sourcePatterns: ["src/runtime/**"],
				testPatterns: ["tests/runtime/**"],
			},
			{
				conceptId: "kb:system/traces",
				path: ".codewiki/kb/system/components/traces.md",
				authority: "accepted",
				type: "System Responsibility",
				title: "Change Traces",
				status: "stable",
				trustTier: "human-reviewed",
				stale: false,
				markdownReferences: ["kb:system/runtime"],
				sourceResources: ["https://example.invalid/trace-protocol"],
				relationships: [
					{
						type: "constrains",
						target: "kb:system/runtime",
						rationale: "Trace authority constrains Runtime mutation.",
					},
				],
				sourcePatterns: ["src/change-trace/**"],
				testPatterns: ["tests/traces/**"],
			},
		],
	};
}

describe("bounded Alignment Graph queries", () => {
	it("augments canonical operation facts with accepted OKF and source ownership", () => {
		const journey = createThreeBatchJourney("CHG-query-knowledge");
		const state = journey.states[2];
		const operationGraph = projectAlignmentGraph(state);
		const graph = augmentAlignmentGraphWithKnowledge(
			operationGraph,
			knowledgeProjection(state),
		);
		assert.equal(graph.graphSnapshotDigest, operationGraph.graphSnapshotDigest);
		assert.notEqual(graph.graphContentDigest, operationGraph.graphContentDigest);
		assert.equal(graph.coverage.knowledgeConceptCount, 2);
		assert.equal(graph.coverage.authoredRelationshipCount, 1);
		assert.equal(graph.coverage.sourceOwnershipCount, 4);
		const edgeTypes = new Set(graph.edges.map((edge) => edge.type));
		for (const type of [
			"requirement_requires_evidence_obligation",
			"requirement_requires_check",
			"work_item_scoped_to_source",
			"work_item_scoped_to_knowledge",
			"work_item_scoped_to_component",
			"knowledge_ref_resolves_to",
			"references",
			"constrains",
			"derived_from",
			"source_realizes_knowledge",
			"test_verifies_knowledge",
		]) {
			assert.equal(edgeTypes.has(type), true, `missing ${type}`);
		}
		const repeated = augmentAlignmentGraphWithKnowledge(
			operationGraph,
			knowledgeProjection(state),
		);
		assert.equal(canonicalJson(repeated), canonicalJson(graph));
		assert.throws(
			() =>
				augmentAlignmentGraphWithKnowledge(graph, knowledgeProjection(state)),
			/operation-only base/,
		);
		assert.throws(
			() =>
				augmentAlignmentGraphWithKnowledge(operationGraph, {
					...knowledgeProjection(state),
					knowledgeDigest: `sha256:${"f".repeat(64)}`,
				}),
			/digest does not match/,
		);
	});

	it("derives an inert Knowledge projection from OKF v0.2 and source ownership", () => {
		const state = createThreeBatchJourney("CHG-query-okf").states[2];
		const projection = createKnowledgeAlignmentProjection({
			knowledgeDigest: state.observedBase.knowledgeDigest,
			authority: "imported",
			today: "2026-08-01",
			bundleRefPrefix: ".codewiki/kb",
			files: [
				{path: "index.md", content: "---\nokf_version: '0.2'\n---\n\n# KB\n"},
				{
					path: "system/runtime.md",
					content: "---\ntype: System Responsibility\ntitle: Runtime\ngenerated: { by: process:kb-import, at: 2026-07-01T00:00:00Z }\nverified: { by: human:reviewer, at: 2026-07-02T00:00:00Z }\n---\n\n# Runtime\n",
				},
				{
					path: "system/traces.md",
					content: "---\ntype: System Responsibility\ntitle: Traces\nsources:\n  - { resource: https://example.invalid/protocol }\ncodewiki_source_patterns: [src/change-trace/**]\ncodewiki_test_patterns: [tests/traces/**]\ncodewiki_relationships:\n  - { type: constrains, target: system/runtime, rationale: Trace authority constrains Runtime mutation. }\n---\n\nSee [Runtime](./runtime.md).\n",
				},
			],
		});
		assert.deepEqual(
			projection.concepts.map((concept) => concept.conceptId),
			["kb:system/runtime", "kb:system/traces"],
		);
		assert.deepEqual(projection.concepts[1].markdownReferences, [
			"kb:system/runtime",
		]);
		assert.deepEqual(projection.concepts[1].sourcePatterns, [
			"src/change-trace/**",
		]);
		assert.equal(projection.concepts[1].relationships[0].target, "kb:system/runtime");
		const graph = augmentAlignmentGraphWithKnowledge(
			projectAlignmentGraph(state),
			projection,
		);
		const concept = graph.nodes.find(
			(node) => node.id === "knowledge-concept:kb:system/traces",
		);
		assert.equal(concept.provenance.class, "observed_binding");
		assert.equal(
			graph.edges
				.filter((edge) => edge.type === "constrains")
				.every((edge) => edge.provenance.class === "observed_binding"),
			true,
		);
	});

	it("returns bounded readiness, assurance, Knowledge, and Change context", () => {
		const journey = createThreeBatchJourney("CHG-query-families");
		const state = journey.states[2];
		const graph = augmentAlignmentGraphWithKnowledge(
			projectAlignmentGraph(state),
			knowledgeProjection(state),
		);
		const common = {graphSnapshotDigest: graph.graphSnapshotDigest};
		const readiness = queryAlignmentGraph(
			graph,
			{
				...common,
				family: "work_item_readiness",
				planningEpochId: journey.epoch.operationId,
				workItemId: journey.epoch.body.workItems[0].id,
				depth: 4,
			},
			"fresh",
		);
		assert.equal(readiness.rootFound, true);
		assert.equal(readiness.stale, false);
		assert.equal(
			readiness.facts.some((fact) => fact.type === "epoch_safe_execution_frontier"),
			true,
		);
		assert.equal(
			readiness.facts.some((fact) => fact.type === "requirement_requires_check"),
			true,
		);
		assert.equal(
			readiness.facts.some((fact) => fact.type === "work_item_has_stable_ref"),
			true,
		);

		const assurance = queryAlignmentGraph(
			graph,
			{
				...common,
				family: "loop_assurance",
				candidateId: journey.candidate.id,
				depth: 3,
			},
			"fresh",
		);
		assert.equal(
			assurance.facts.some((fact) => fact.type === "candidate_has_exit_report"),
			true,
		);

		const knowledge = queryAlignmentGraph(
			graph,
			{
				...common,
				family: "knowledge_impact",
				conceptId: "kb:system/traces",
				depth: 2,
			},
			"stale",
		);
		assert.equal(knowledge.stale, true);
		assert.equal(
			knowledge.facts.some((fact) => fact.type === "source_realizes_knowledge"),
			true,
		);
		assert.equal(
			knowledge.underlyingRefs.includes(
				".codewiki/kb/system/components/traces.md",
			),
			true,
		);

		const bounded = queryAlignmentGraph(
			graph,
			{
				...common,
				family: "change_context",
				changeId: "CHG-query-families",
				depth: 4,
				maxFacts: 2,
			},
			"offline",
		);
		assert.equal(bounded.truncated, true);
		assert.equal(bounded.facts.length, 2);
		assert.equal(bounded.facts[0].id, "change:CHG-query-families");
		assert.equal(bounded.synchronizationStatus, "offline");
		assert.ok(bounded.resultDigest);

		const delivery = queryAlignmentGraph(
			graph,
			{
				...common,
				family: "delivery_chain",
				changeId: "CHG-query-families",
				depth: 4,
			},
			"fresh",
		);
		assert.deepEqual(
			delivery.facts.map((fact) => fact.id),
			["change:CHG-query-families"],
		);
		assert.equal(delivery.coverage.matchedEdgeCount, 0);

		const absent = queryAlignmentGraph(
			graph,
			{
				...common,
				family: "knowledge_impact",
				conceptId: "kb:missing",
			},
			"fresh",
		);
		assert.equal(absent.rootFound, false);
		assert.equal(absent.coverage.rootCount, 0);
		assert.deepEqual(absent.facts, []);
	});

	it("reports retained contradictions with deterministic provenance", () => {
		const journey = createThreeBatchJourney("CHG-query-contradiction");
		const contradicted = appendContradictoryDecisionResults(
			journey.states[2],
			gitObject("d"),
		);
		const graph = projectAlignmentGraph(contradicted.state);
		const result = queryAlignmentGraph(
			graph,
			{
				family: "contradictions",
				graphSnapshotDigest: graph.graphSnapshotDigest,
				changeId: "CHG-query-contradiction",
				depth: 2,
				maxFacts: 1,
			},
			"fresh",
		);
		assert.equal(result.contradictionFactIds.length, 1);
		assert.equal(result.truncated, true);
		assert.equal(
			result.facts.find((fact) => fact.type === "contradiction").provenance.class,
			"deterministic_analysis",
		);
	});

	it("rejects generic graph DSL, unbounded requests, and snapshot drift", () => {
		const state = createThreeBatchJourney("CHG-query-guard").states[2];
		const graph = projectAlignmentGraph(state);
		assert.throws(
			() =>
				queryAlignmentGraph(
					graph,
					{
						family: "change_context",
						graphSnapshotDigest: graph.graphSnapshotDigest,
						changeId: "CHG-query-guard",
						cypher: "MATCH (n) RETURN n",
					},
					"fresh",
				),
			/unsupported field cypher/,
		);
		assert.throws(
			() =>
				queryAlignmentGraph(
					graph,
					{
						family: "change_context",
						graphSnapshotDigest: graph.graphSnapshotDigest,
						changeId: "CHG-query-guard",
						maxFacts: 201,
					},
					"fresh",
				),
			/maxFacts/,
		);
		assert.throws(
			() =>
				queryAlignmentGraph(
					graph,
					{
						family: "change_context",
						graphSnapshotDigest: `sha256:${"0".repeat(64)}`,
						changeId: "CHG-query-guard",
					},
					"fresh",
				),
			/snapshot digest does not match/,
		);
		const tampered = structuredClone(graph);
		tampered.nodes[0].label = "tampered";
		assert.throws(
			() =>
				queryAlignmentGraph(
					tampered,
					{
						family: "change_context",
						graphSnapshotDigest: graph.graphSnapshotDigest,
						changeId: "CHG-query-guard",
					},
					"fresh",
				),
			/content digest is invalid/,
		);
	});
});
