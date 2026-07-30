import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	ALIGNMENT_GRAPH_PROJECTOR,
	projectAlignmentGraph,
	projectAlignmentGraphIncremental,
} from "../../src/change-trace/index.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
} from "../../src/utils/canonical-json.ts";
import {gitObject} from "../helpers/change-trace-v1.mjs";
import {
	appendContradictoryDecisionResults,
	createThreeBatchJourney,
} from "../helpers/change-trace-replay-v1.mjs";

describe("Alignment Graph projector v1", () => {
	it("projects canonical Change, Loop, Planning, Work Item, and provenance facts", () => {
		const journey = createThreeBatchJourney("CHG-graph");
		const state = journey.states[2];
		const graph = projectAlignmentGraph(state);
		assert.equal(
			canonicalJson(graph.projector),
			canonicalJson(ALIGNMENT_GRAPH_PROJECTOR),
		);
		assert.equal(graph.status, "fresh");
		assert.equal(graph.coverage.acceptedRecordCount, state.acceptedOperationIds.length);
		assert.equal(graph.coverage.projectedRecordCount, state.acceptedOperationIds.length);
		assert.equal(graph.coverage.truncated, false);
		assert.deepEqual(graph.projectedRecordIds, state.acceptedOperationIds);

		const nodeTypes = new Set(graph.nodes.map((node) => node.type));
		for (const type of [
			"change",
			"change_revision",
			"requirement",
			"loop_attempt",
			"candidate",
			"exit_policy",
			"check_result",
			"exit_report",
			"runtime_route",
			"planning_epoch",
			"sprint",
			"work_item",
		]) {
			assert.equal(nodeTypes.has(type), true, `missing node type ${type}`);
		}
		const edgeTypes = new Set(graph.edges.map((edge) => edge.type));
		for (const type of [
			"change_has_revision",
			"revision_has_requirement",
			"change_has_loop_attempt",
			"attempt_has_candidate",
			"candidate_has_exit_policy",
			"candidate_has_check_result",
			"candidate_has_exit_report",
			"exit_report_has_result",
			"exit_report_routes_to",
			"project_has_planning_epoch",
			"change_participates_in_epoch",
			"epoch_contains_sprint",
			"epoch_contains_work_item",
			"work_item_realizes_change",
			"epoch_safe_execution_frontier",
		]) {
			assert.equal(edgeTypes.has(type), true, `missing edge type ${type}`);
		}
		assert.equal(
			graph.edges.every((edge) => edge.provenance.class !== "inferred_analysis"),
			true,
		);
		const nodeIds = new Set(graph.nodes.map((node) => node.id));
		for (const edge of graph.edges) {
			const {factId, ...body} = edge;
			assert.equal(factId, canonicalJsonDigest(body));
			assert.equal(edge.provenance.canonicalRefs.length > 0, true);
			assert.equal(nodeIds.has(edge.from), true, `missing edge source ${edge.from}`);
			assert.equal(nodeIds.has(edge.to), true, `missing edge target ${edge.to}`);
		}
	});

	it("binds snapshot and content identities to exact accepted state", () => {
		const state = createThreeBatchJourney("CHG-graph-digest").states[2];
		const graph = projectAlignmentGraph(state);
		assert.equal(
			graph.graphSnapshotDigest,
			canonicalJsonDigest({
				remoteStateHead: state.stateHead,
				sourceHead: state.observedBase.sourceHead,
				knowledgeDigest: state.observedBase.knowledgeDigest,
				configDigest: state.observedBase.configDigest,
				policyDigest: state.observedBase.policyDigest,
				projector: ALIGNMENT_GRAPH_PROJECTOR,
			}),
		);
		assert.equal(
			graph.graphContentDigest,
			canonicalJsonDigest({nodes: graph.nodes, edges: graph.edges}),
		);
	});

	it("proves full and incremental graph projection equivalence", () => {
		const journey = createThreeBatchJourney("CHG-graph-incremental");
		let incremental = projectAlignmentGraph(journey.states[0]);
		incremental = projectAlignmentGraphIncremental(
			incremental,
			journey.states[1],
		);
		incremental = projectAlignmentGraphIncremental(
			incremental,
			journey.states[2],
		);
		const full = projectAlignmentGraph(journey.states[2]);
		assert.equal(canonicalJson(incremental), canonicalJson(full));
	});

	it("rejects non-prefix incremental bases and projector version drift", () => {
		const journey = createThreeBatchJourney("CHG-graph-prefix");
		const previous = projectAlignmentGraph(journey.states[0]);
		const nonPrefix = structuredClone(previous);
		nonPrefix.projectedRecordIds[0] = `sha256:${"f".repeat(64)}`;
		assert.throws(
			() => projectAlignmentGraphIncremental(nonPrefix, journey.states[1]),
			/not an accepted prefix/,
		);
		const wrongVersion = structuredClone(previous);
		wrongVersion.projector.version = "2.0.0";
		assert.throws(
			() => projectAlignmentGraphIncremental(wrongVersion, journey.states[1]),
			/version mismatch/,
		);
		const knowledgeAugmented = structuredClone(previous);
		knowledgeAugmented.coverage.knowledgeConceptCount = 1;
		assert.throws(
			() =>
				projectAlignmentGraphIncremental(
					knowledgeAugmented,
					journey.states[1],
				),
			/Knowledge-augmented base/,
		);
	});

	it("projects retained contradictions as deterministic analysis, never authority", () => {
		const journey = createThreeBatchJourney("CHG-graph-contradiction");
		const contradicted = appendContradictoryDecisionResults(
			journey.states[2],
			gitObject("d"),
		);
		const graph = projectAlignmentGraph(contradicted.state);
		const contradiction = graph.nodes.find((node) => node.type === "contradiction");
		assert.ok(contradiction);
		assert.equal(contradiction.provenance.class, "deterministic_analysis");
		assert.deepEqual(contradiction.provenance.analysisRefs, [
			`${ALIGNMENT_GRAPH_PROJECTOR.id}@${ALIGNMENT_GRAPH_PROJECTOR.version}`,
		]);
		const contradictionEdges = graph.edges.filter(
			(edge) => edge.type === "operation_contradicts_operation",
		);
		assert.equal(contradictionEdges.length, 2);
		assert.equal(
			contradictionEdges.every(
				(edge) => edge.provenance.class === "deterministic_analysis",
			),
			true,
		);
	});
});
