import {
	ALIGNMENT_GRAPH_PROJECTOR,
	type AlignmentGraphEdge,
	type AlignmentGraphFactProvenance,
	type AlignmentGraphSnapshot,
} from "./alignment-graph.ts";
import type { SynchronizationStatus } from "./synchronization.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import { assertExactKeys } from "../utils/json.ts";
import { compareText } from "./order.ts";

export type AlignmentQueryFamily =
	| "change_context"
	| "work_item_readiness"
	| "loop_assurance"
	| "knowledge_impact"
	| "delivery_chain"
	| "contradictions";

interface AlignmentQueryBase {
	readonly family: AlignmentQueryFamily;
	readonly graphSnapshotDigest: Sha256Digest;
	readonly maxFacts?: number;
	readonly depth?: number;
}

export interface ChangeContextQuery extends AlignmentQueryBase {
	readonly family: "change_context";
	readonly changeId: string;
}

export interface WorkItemReadinessQuery extends AlignmentQueryBase {
	readonly family: "work_item_readiness";
	readonly planningEpochId: string;
	readonly workItemId: string;
}

export interface LoopAssuranceQuery extends AlignmentQueryBase {
	readonly family: "loop_assurance";
	readonly candidateId: string;
}

export interface KnowledgeImpactQuery extends AlignmentQueryBase {
	readonly family: "knowledge_impact";
	readonly conceptId: string;
}

export interface DeliveryChainQuery extends AlignmentQueryBase {
	readonly family: "delivery_chain";
	readonly changeId: string;
}

export interface ContradictionsQuery extends AlignmentQueryBase {
	readonly family: "contradictions";
	readonly changeId?: string;
}

export type AlignmentQueryRequest =
	| ChangeContextQuery
	| WorkItemReadinessQuery
	| LoopAssuranceQuery
	| KnowledgeImpactQuery
	| DeliveryChainQuery
	| ContradictionsQuery;

export interface AlignmentQueryFact {
	readonly kind: "node" | "edge";
	readonly id: string;
	readonly type: string;
	readonly label: string | null;
	readonly from: string | null;
	readonly to: string | null;
	readonly attributes: Readonly<Record<string, CanonicalJsonValue>>;
	readonly provenance: AlignmentGraphFactProvenance;
}

export interface AlignmentQueryCoverage {
	readonly graph: AlignmentGraphSnapshot["coverage"];
	readonly rootCount: number;
	readonly matchedNodeCount: number;
	readonly matchedEdgeCount: number;
	readonly returnedFactCount: number;
}

export interface AlignmentQueryResult {
	readonly family: AlignmentQueryFamily;
	readonly graphSnapshotDigest: Sha256Digest;
	readonly graphContentDigest: Sha256Digest;
	readonly synchronizationStatus: SynchronizationStatus;
	readonly stale: boolean;
	readonly truncated: boolean;
	readonly rootFound: boolean;
	readonly facts: readonly AlignmentQueryFact[];
	readonly contradictionFactIds: readonly string[];
	readonly underlyingRefs: readonly string[];
	readonly coverage: AlignmentQueryCoverage;
	readonly resultDigest: Sha256Digest;
}

const DELIVERY_OPERATION_KINDS = new Set([
	"source.branch_merge_recorded",
	"source.branch_push_recorded",
	"review_projection.published",
	"product.publication_recorded",
	"product.release_recorded",
	"delivery.observation_recorded",
	"outcome.observation_recorded",
]);

const FAMILY_EDGE_TYPES: Readonly<
	Record<Exclude<AlignmentQueryFamily, "change_context">, ReadonlySet<string>>
> = Object.freeze({
	work_item_readiness: new Set([
		"epoch_contains_work_item",
		"work_item_belongs_to_epoch",
		"sprint_contains_work_item",
		"work_item_depends_on_work_item",
		"epoch_safe_execution_frontier",
		"work_item_realizes_change",
		"work_item_has_stable_ref",
		"work_item_contributed_by_change",
		"work_item_has_requirement",
		"requirement_requires_evidence_obligation",
		"requirement_requires_check",
		"work_item_scoped_to_source",
		"work_item_scoped_to_knowledge",
		"work_item_scoped_to_component",
		"work_item_uses_tool",
		"work_item_uses_skill",
		"work_item_uses_context",
		"work_item_requires_integration_check",
		"work_item_integrates_to_ref",
		"worker_claims_work_item",
		"claim_authorizes_work_item",
		"worker_holds_work_item_claim",
		"work_item_dispatched_as_assignment",
		"assignment_uses_claim",
		"work_item_claim_taken_over_by",
		"work_item_claim_released_by",
		"epoch_disposes_active_work",
		"epoch_disposes_active_assignment",
		"work_item_migrates_to_work_item",
	]),
	loop_assurance: new Set([
		"attempt_has_candidate",
		"candidate_has_exit_policy",
		"candidate_has_evidence",
		"candidate_has_check_result",
		"candidate_has_exit_report",
		"exit_report_has_result",
		"exit_report_routes_to",
		"change_has_loop_attempt",
		"attempt_ended_by",
	]),
	knowledge_impact: new Set([
		"knowledge_ref_resolves_to",
		"references",
		"depends_on",
		"constrains",
		"refines",
		"realizes",
		"verifies",
		"supersedes",
		"derived_from",
		"source_realizes_knowledge",
		"test_verifies_knowledge",
		"work_item_scoped_to_knowledge",
	]),
	delivery_chain: new Set([
		"integration_merged_commit",
		"commit_pushed_to_ref",
		"candidate_published_for_review",
		"candidate_published_as_product",
		"artifact_released_through_channel",
		"effect_has_delivery_observation",
		"delivery_has_outcome",
		"change_has_outcome",
		"operation_has_parent",
	]),
	contradictions: new Set([
		"change_has_operation",
		"operation_contradicts_operation",
	]),
});

export function queryAlignmentGraph(
	graph: AlignmentGraphSnapshot,
	request: AlignmentQueryRequest,
	synchronizationStatus: SynchronizationStatus,
): AlignmentQueryResult {
	assertValidGraphSnapshot(graph);
	assertQueryRequest(request);
	assertSynchronizationStatus(synchronizationStatus);
	if (request.graphSnapshotDigest !== graph.graphSnapshotDigest) {
		throw new Error("Alignment query snapshot digest does not match current graph.");
	}
	const maxFacts = request.maxFacts ?? 100;
	const depth = request.depth ?? 2;
	const roots = queryRoots(graph, request);
	const selected = traverseGraph(graph, roots, depth, edgeTypesFor(request.family));
	const allFacts = materializeFacts(graph, selected);
	const facts = allFacts.slice(0, maxFacts);
	const truncated = facts.length < allFacts.length;
	const contradictionFactIds = allFacts
		.flatMap((fact) => (fact.type === "contradiction" ? [fact.id] : []))
		.sort(compareText);
	const underlyingRefs = sortedUnique(
		facts.flatMap((fact) => [
			...fact.provenance.canonicalRefs,
			...fact.provenance.observedRefs,
			...fact.provenance.analysisRefs,
		]),
	);
	const body = {
		family: request.family,
		graphSnapshotDigest: graph.graphSnapshotDigest,
		graphContentDigest: graph.graphContentDigest,
		synchronizationStatus,
		stale: synchronizationStatus !== "fresh",
		truncated,
		rootFound: roots.length > 0,
		facts,
		contradictionFactIds,
		underlyingRefs,
		coverage: {
			graph: graph.coverage,
			rootCount: roots.length,
			matchedNodeCount: selected.nodeDepths.size,
			matchedEdgeCount: selected.edgeDepths.size,
			returnedFactCount: facts.length,
		},
	};
	return canonicalValue({...body, resultDigest: canonicalJsonDigest(body)});
}

function queryRoots(
	graph: AlignmentGraphSnapshot,
	request: AlignmentQueryRequest,
): string[] {
	switch (request.family) {
		case "change_context":
			return existingRoots(graph, [`change:${request.changeId}`]);
		case "delivery_chain":
			return deliveryRoots(graph, request.changeId);
		case "work_item_readiness":
			return existingRoots(graph, [
				`work-item:${request.planningEpochId}:${request.workItemId}`,
			]);
		case "loop_assurance":
			return existingRoots(graph, [`candidate:${request.candidateId}`]);
		case "knowledge_impact":
			return existingRoots(graph, [
				`knowledge-concept:${request.conceptId}`,
				`knowledge:${request.conceptId}`,
			]);
		case "contradictions":
			return contradictionRoots(graph, request.changeId);
		default:
			throw new Error("Alignment query family is unsupported.");
	}
}

function deliveryRoots(
	graph: AlignmentGraphSnapshot,
	changeId: string,
): string[] {
	const changeNode = `change:${changeId}`;
	const operationNodes = graph.edges.flatMap((edge) => {
		if (edge.type !== "change_has_operation" || edge.from !== changeNode) return [];
		const operation = graph.nodes.find((node) => node.id === edge.to);
		return operation && DELIVERY_OPERATION_KINDS.has(String(operation.attributes.kind))
			? [operation.id]
			: [];
	});
	const operationRefs = new Set(
		operationNodes.map((nodeId) => nodeId.slice("operation:".length)),
	);
	const effectNodes = graph.edges.flatMap((edge) =>
		edge.provenance.canonicalRefs.some((ref) => operationRefs.has(ref))
			? [edge.from, edge.to]
			: [],
	);
	return existingRoots(graph, [changeNode, ...operationNodes, ...effectNodes]).sort(
		compareText,
	);
}

function contradictionRoots(
	graph: AlignmentGraphSnapshot,
	changeId: string | undefined,
): string[] {
	const contradictions = graph.nodes.flatMap((node) =>
		node.type === "contradiction" ? [node.id] : [],
	);
	if (!changeId) return contradictions.sort(compareText);
	const operationIds = new Set(
		graph.edges.flatMap((edge) =>
			edge.type === "change_has_operation" && edge.from === `change:${changeId}`
				? [edge.to]
				: [],
		),
	);
	return contradictions
		.filter((nodeId) =>
			graph.edges.some(
				(edge) =>
					edge.type === "operation_contradicts_operation" &&
					edge.from === nodeId &&
					operationIds.has(edge.to),
			),
		)
		.sort(compareText);
}

interface SelectedGraph {
	readonly nodeDepths: ReadonlyMap<string, number>;
	readonly edgeDepths: ReadonlyMap<string, number>;
}

function traverseGraph(
	graph: AlignmentGraphSnapshot,
	roots: readonly string[],
	maxDepth: number,
	allowedEdgeTypes: ReadonlySet<string> | null,
): SelectedGraph {
	const nodeDepths = new Map(roots.map((root) => [root, 0]));
	const edgeDepths = new Map<string, number>();
	let frontier = [...roots];
	for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
		const current = new Set(frontier);
		const next = new Set<string>();
		for (const edge of graph.edges) {
			if (allowedEdgeTypes && !allowedEdgeTypes.has(edge.type)) continue;
			if (!current.has(edge.from) && !current.has(edge.to)) continue;
			if (!edgeDepths.has(edge.factId)) edgeDepths.set(edge.factId, depth);
			for (const nodeId of [edge.from, edge.to]) {
				if (!nodeDepths.has(nodeId)) {
					next.add(nodeId);
					nodeDepths.set(nodeId, depth + 1);
				}
			}
		}
		frontier = [...next].sort(compareText);
	}
	return {nodeDepths, edgeDepths};
}

interface RankedAlignmentQueryFact {
	readonly rank: number;
	readonly fact: AlignmentQueryFact;
}

function materializeFacts(
	graph: AlignmentGraphSnapshot,
	selected: SelectedGraph,
): AlignmentQueryFact[] {
	const nodeFacts = graph.nodes.flatMap((node): RankedAlignmentQueryFact[] => {
		const depth = selected.nodeDepths.get(node.id);
		return depth === undefined
			? []
			: [
					{
						rank: depth * 2,
						fact: {
							kind: "node",
							id: node.id,
							type: node.type,
							label: node.label,
							from: null,
							to: null,
							attributes: node.attributes,
							provenance: node.provenance,
						},
					},
				];
	});
	const edgeFacts = graph.edges.flatMap((edge): RankedAlignmentQueryFact[] => {
		const depth = selected.edgeDepths.get(edge.factId);
		return depth === undefined
			? []
			: [{rank: depth * 2 + 1, fact: edgeFact(edge)}];
	});
	return [...nodeFacts, ...edgeFacts]
		.sort(
			(left, right) =>
				left.rank - right.rank || compareText(left.fact.id, right.fact.id),
		)
		.map((entry) => entry.fact);
}

function edgeFact(edge: AlignmentGraphEdge): AlignmentQueryFact {
	return {
		kind: "edge",
		id: edge.factId,
		type: edge.type,
		label: null,
		from: edge.from,
		to: edge.to,
		attributes: edge.attributes,
		provenance: edge.provenance,
	};
}

function existingRoots(
	graph: AlignmentGraphSnapshot,
	candidates: readonly string[],
): string[] {
	const known = new Set(graph.nodes.map((node) => node.id));
	return candidates.filter((candidate) => known.has(candidate));
}

function edgeTypesFor(
	family: AlignmentQueryFamily,
): ReadonlySet<string> | null {
	return family === "change_context" ? null : FAMILY_EDGE_TYPES[family];
}

function assertValidGraphSnapshot(graph: AlignmentGraphSnapshot): void {
	assertGraphIdentity(graph);
	assertGraphFacts(graph);
	assertGraphCoverage(graph);
}

function assertGraphIdentity(graph: AlignmentGraphSnapshot): void {
	if (
		graph.projector.id !== ALIGNMENT_GRAPH_PROJECTOR.id ||
		graph.projector.version !== ALIGNMENT_GRAPH_PROJECTOR.version
	) {
		throw new Error("Alignment query graph projector is unsupported.");
	}
	const expectedSnapshotDigest = canonicalJsonDigest({
		remoteStateHead: graph.baseBinding.remoteStateHead,
		sourceHead: graph.baseBinding.sourceHead,
		knowledgeDigest: graph.baseBinding.knowledgeDigest,
		configDigest: graph.baseBinding.configDigest,
		policyDigest: graph.baseBinding.policyDigest,
		projector: ALIGNMENT_GRAPH_PROJECTOR,
	});
	if (graph.graphSnapshotDigest !== expectedSnapshotDigest) {
		throw new Error("Alignment query graph snapshot identity is invalid.");
	}
	if (graph.graphContentDigest !== canonicalJsonDigest({nodes: graph.nodes, edges: graph.edges})) {
		throw new Error("Alignment query graph content digest is invalid.");
	}
}

function assertGraphFacts(graph: AlignmentGraphSnapshot): void {
	const nodeIds = new Set(graph.nodes.map((node) => node.id));
	const edgeIds = new Set(graph.edges.map((edge) => edge.factId));
	if (nodeIds.size !== graph.nodes.length || edgeIds.size !== graph.edges.length) {
		throw new Error("Alignment query graph contains duplicate fact identities.");
	}
	for (const edge of graph.edges) {
		const {factId, ...body} = edge;
		if (
			canonicalJsonDigest(body) !== factId ||
			!nodeIds.has(edge.from) ||
			!nodeIds.has(edge.to)
		) {
			throw new Error(`Alignment query graph edge ${factId} is invalid.`);
		}
	}
}

function assertGraphCoverage(graph: AlignmentGraphSnapshot): void {
	if (
		graph.status !== "fresh" ||
		graph.coverage.nodeCount !== graph.nodes.length ||
		graph.coverage.edgeCount !== graph.edges.length ||
		graph.coverage.projectedRecordCount !== graph.projectedRecordIds.length ||
		graph.coverage.acceptedRecordCount !== graph.projectedRecordIds.length
	) {
		throw new Error("Alignment query graph coverage is invalid.");
	}
}

const QUERY_FAMILY_FIELDS: Readonly<
	Record<AlignmentQueryFamily, readonly string[]>
> = Object.freeze({
	change_context: ["changeId"],
	work_item_readiness: ["planningEpochId", "workItemId"],
	loop_assurance: ["candidateId"],
	knowledge_impact: ["conceptId"],
	delivery_chain: ["changeId"],
	contradictions: ["changeId"],
});

function assertQueryRequest(request: AlignmentQueryRequest): void {
	if (!request || typeof request !== "object" || Array.isArray(request)) {
		throw new Error("Alignment query must be an object.");
	}
	const values = request as unknown as Record<string, unknown>;
	const family = validatedQueryFamily(values.family);
	assertExactKeys(
		request,
		[
			"family",
			"graphSnapshotDigest",
			"maxFacts",
			"depth",
			...QUERY_FAMILY_FIELDS[family],
		],
		"Alignment query",
	);
	assertSha256Digest(values.graphSnapshotDigest, "Alignment query graphSnapshotDigest");
	assertQueryEntityFields(values, family);
	assertQueryBounds(request);
}

function validatedQueryFamily(value: unknown): AlignmentQueryFamily {
	if (typeof value !== "string" || !Object.hasOwn(QUERY_FAMILY_FIELDS, value)) {
		throw new Error(`Alignment query family ${String(value)} is unsupported.`);
	}
	return value as AlignmentQueryFamily;
}

function assertQueryEntityFields(
	values: Readonly<Record<string, unknown>>,
	family: AlignmentQueryFamily,
): void {
	if (family === "contradictions") {
		if (values.changeId !== undefined) {
			assertNonEmptyQueryField(values.changeId, "changeId");
		}
		return;
	}
	for (const field of QUERY_FAMILY_FIELDS[family]) {
		assertNonEmptyQueryField(values[field], field);
	}
}

function assertQueryBounds(request: AlignmentQueryRequest): void {
	if (
		request.maxFacts !== undefined &&
		(!Number.isInteger(request.maxFacts) || request.maxFacts < 1 || request.maxFacts > 200)
	) {
		throw new Error("Alignment query maxFacts must be an integer from 1 to 200.");
	}
	if (
		request.depth !== undefined &&
		(!Number.isInteger(request.depth) || request.depth < 0 || request.depth > 4)
	) {
		throw new Error("Alignment query depth must be an integer from 0 to 4.");
	}
}

function assertNonEmptyQueryField(value: unknown, field: string): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Alignment query ${field} must be a non-empty string.`);
	}
}

function assertSynchronizationStatus(status: SynchronizationStatus): void {
	if (status !== "fresh" && status !== "stale" && status !== "offline") {
		throw new Error(`Alignment query synchronization status ${String(status)} is invalid.`);
	}
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

function canonicalValue<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
