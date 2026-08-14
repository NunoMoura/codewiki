import { dirname, join, normalize } from "node:path/posix";
import {
	mergeAlignmentGraphProvenance,
	type AlignmentGraphEdge,
	type AlignmentGraphFactProvenance,
	type AlignmentGraphNode,
	type AlignmentGraphSnapshot,
} from "./graph.ts";
import {
	analyzeOkfV02Document,
	CODEWIKI_AUTHORED_RELATIONSHIP_TYPES,
	type CodeWikiAuthoredRelationship,
	type OkfLifecycleStatus,
	type OkfTrustTier,
} from "../knowledge/okf-v02.ts";
import {
	extractOkfMarkdownLinks,
	isOkfMarkdownPath,
	isOkfReservedPath,
	normalizeOkfPath,
	okfConceptId,
} from "../knowledge/okf.ts";
import {
	okfConceptDocuments,
	type OkfBundleFile,
} from "../knowledge/okf-validation.ts";
import {okfSourceOwnershipExtensionsFromBundle} from "../knowledge/source-ownership.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import { compareText } from "../changes/trace/order.ts";

export interface KnowledgeAlignmentConcept {
	readonly conceptId: string;
	readonly path: string;
	readonly authority: "accepted" | "imported";
	readonly type: string;
	readonly title: string;
	readonly status: OkfLifecycleStatus;
	readonly trustTier: OkfTrustTier;
	readonly stale: boolean | null;
	readonly markdownReferences: readonly string[];
	readonly sourceResources: readonly string[];
	readonly relationships: readonly CodeWikiAuthoredRelationship[];
	readonly sourcePatterns: readonly string[];
	readonly testPatterns: readonly string[];
}

export interface KnowledgeAlignmentProjection {
	readonly knowledgeDigest: Sha256Digest;
	readonly concepts: readonly KnowledgeAlignmentConcept[];
}

export interface CreateKnowledgeAlignmentProjectionInput {
	readonly knowledgeDigest: Sha256Digest;
	readonly files: readonly OkfBundleFile[];
	readonly authority: "accepted" | "imported";
	readonly today?: string;
	readonly bundleRefPrefix?: string;
	readonly conceptIdPrefix?: string;
}

export function createKnowledgeAlignmentProjection(
	input: CreateKnowledgeAlignmentProjectionInput,
): KnowledgeAlignmentProjection {
	assertSha256Digest(input.knowledgeDigest, "knowledgeDigest");
	const files = [...input.files];
	const ownershipByPath = new Map(
		okfSourceOwnershipExtensionsFromBundle(files).map((entry) => [
			entry.path,
			entry.fields,
		]),
	);
	const conceptIdPrefix = input.conceptIdPrefix ?? "kb:";
	const concepts = okfConceptDocuments(files).map((document) => {
		const profile = analyzeOkfV02Document(document, {today: input.today});
		const ownership = ownershipByPath.get(document.path);
		const sourcePatterns = sortedUnique([
			...(ownership?.codewiki_source_patterns ?? []),
			...(ownership?.codewiki_source_map.flatMap(
				(component) => component.source_patterns,
			) ?? []),
		]);
		const testPatterns = sortedUnique([
			...(ownership?.codewiki_test_patterns ?? []),
			...(ownership?.codewiki_source_map.flatMap(
				(component) => component.test_patterns,
			) ?? []),
		]);
		return canonicalValue<KnowledgeAlignmentConcept>({
			conceptId: qualifyConceptId(document.conceptId ?? "", conceptIdPrefix),
			path: underlyingKnowledgeRef(document.path, input.bundleRefPrefix),
			authority: input.authority,
			type: profile.type,
			title: profile.title ?? document.conceptId ?? document.path,
			status: profile.status,
			trustTier: profile.trustTier,
			stale: profile.stale,
			markdownReferences: markdownKnowledgeReferences(
				document.path,
				document.body,
				conceptIdPrefix,
			),
			sourceResources: sortedUnique(
				profile.sources.map((source) => source.resource),
			),
			relationships: profile.relationships.map((relationship) => ({
				...relationship,
				target: qualifyConceptId(relationship.target, conceptIdPrefix),
			})),
			sourcePatterns,
			testPatterns,
		});
	});
	assertUniqueConcepts(concepts);
	return canonicalValue({
		knowledgeDigest: input.knowledgeDigest,
		concepts: concepts.sort((left, right) =>
			compareText(left.conceptId, right.conceptId),
		),
	});
}

function markdownKnowledgeReferences(
	documentPath: string,
	body: string,
	conceptIdPrefix: string,
): string[] {
	return sortedUnique(
		extractOkfMarkdownLinks(body).flatMap((link) => {
			const target = link.target.split(/[?#]/, 1)[0];
			if (
				!target ||
				/^[a-z][a-z\d+.-]*:/i.test(target) ||
				target.startsWith("//")
			) {
				return [];
			}
			const resolved = normalizeOkfPath(
				normalize(
					target.startsWith("/")
						? target
						: join(dirname(documentPath), target),
				),
			);
			if (
				resolved.startsWith("../") ||
				!isOkfMarkdownPath(resolved) ||
				isOkfReservedPath(resolved)
			) {
				return [];
			}
			const targetConceptId = okfConceptId(resolved);
			return targetConceptId
				? [qualifyConceptId(targetConceptId, conceptIdPrefix)]
				: [];
		}),
	);
}

function qualifyConceptId(conceptId: string, prefix: string): string {
	if (!conceptId) throw new Error("Knowledge concept ID must not be empty.");
	return conceptId.startsWith(prefix) || /^[a-z][a-z\d+.-]*:/i.test(conceptId)
		? conceptId
		: `${prefix}${conceptId}`;
}

function underlyingKnowledgeRef(path: string, prefix: string | undefined): string {
	return prefix ? normalizeOkfPath(join(prefix, path)) : normalizeOkfPath(path);
}

function assertUniqueConcepts(concepts: readonly KnowledgeAlignmentConcept[]): void {
	const ids = concepts.map((concept) => concept.conceptId);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Knowledge alignment concept IDs must be unique.");
	}
	for (const concept of concepts) {
		if (
			![concept.conceptId, concept.path, concept.type, concept.title].every(
				isNonEmptyText,
			) ||
			(concept.authority !== "accepted" && concept.authority !== "imported") ||
			!(["draft", "stable", "deprecated"] as const).includes(concept.status) ||
			!(
				["unverified", "machine-confirmed", "human-reviewed"] as const
			).includes(concept.trustTier) ||
			(concept.stale !== null && typeof concept.stale !== "boolean")
		) {
			throw new Error(`Knowledge alignment concept ${concept.conceptId} is invalid.`);
		}
		for (const values of [
			concept.markdownReferences,
			concept.sourceResources,
			concept.sourcePatterns,
			concept.testPatterns,
		]) {
			if (!values.every(isNonEmptyText)) {
				throw new Error(
					`Knowledge alignment concept ${concept.conceptId} has an invalid reference.`,
				);
			}
		}
		concept.relationships.forEach(assertAuthoredRelationship);
	}
}

function isNonEmptyText(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

function uniqueRelationships(
	relationships: readonly CodeWikiAuthoredRelationship[],
): CodeWikiAuthoredRelationship[] {
	return [
		...new Map(
			relationships.map((relationship) => [
				`${relationship.type}\u0000${relationship.target}\u0000${relationship.rationale}`,
				relationship,
			]),
		).values(),
	].sort((left, right) =>
		compareText(
			`${left.type}:${left.target}:${left.rationale}`,
			`${right.type}:${right.target}:${right.rationale}`,
		),
	);
}

export function augmentAlignmentGraphWithKnowledge(
	graph: AlignmentGraphSnapshot,
	projection: KnowledgeAlignmentProjection,
): AlignmentGraphSnapshot {
	assertSha256Digest(projection.knowledgeDigest, "knowledgeDigest");
	assertUniqueConcepts(projection.concepts);
	if (
		graph.coverage.knowledgeConceptCount > 0 ||
		graph.coverage.authoredRelationshipCount > 0 ||
		graph.coverage.sourceOwnershipCount > 0
	) {
		throw new Error("Alignment Graph Knowledge augmentation requires an operation-only base.");
	}
	if (projection.knowledgeDigest !== graph.baseBinding.knowledgeDigest) {
		throw new Error("Knowledge projection digest does not match Alignment Graph base.");
	}
	const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
	const edges = new Map(graph.edges.map((edge) => [edge.factId, edge]));
	let authoredRelationshipCount = 0;
	let sourceOwnershipCount = 0;
	for (const concept of [...projection.concepts].sort((left, right) =>
		compareText(left.conceptId, right.conceptId),
	)) {
		const counts = projectKnowledgeConcept(nodes, edges, concept);
		authoredRelationshipCount += counts.authoredRelationshipCount;
		sourceOwnershipCount += counts.sourceOwnershipCount;
	}
	const sortedNodes = [...nodes.values()].sort((left, right) =>
		compareText(left.id, right.id),
	);
	const sortedEdges = [...edges.values()].sort((left, right) =>
		compareText(left.factId, right.factId),
	);
	return canonicalValue({
		...graph,
		graphContentDigest: canonicalJsonDigest({nodes: sortedNodes, edges: sortedEdges}),
		nodes: sortedNodes,
		edges: sortedEdges,
		coverage: {
			...graph.coverage,
			knowledgeConceptCount: projection.concepts.length,
			authoredRelationshipCount,
			sourceOwnershipCount,
			nodeCount: sortedNodes.length,
			edgeCount: sortedEdges.length,
		},
	});
}

interface KnowledgeConceptProjectionCounts {
	readonly authoredRelationshipCount: number;
	readonly sourceOwnershipCount: number;
}

interface KnowledgeConceptProjectionContext {
	readonly nodes: Map<string, AlignmentGraphNode>;
	readonly edges: Map<Sha256Digest, AlignmentGraphEdge>;
	readonly conceptNode: string;
	readonly provenance: AlignmentGraphFactProvenance;
}

function projectKnowledgeConcept(
	nodes: Map<string, AlignmentGraphNode>,
	edges: Map<Sha256Digest, AlignmentGraphEdge>,
	concept: KnowledgeAlignmentConcept,
): KnowledgeConceptProjectionCounts {
	const provenance = knowledgeProvenance(concept);
	const conceptNode = knowledgeConceptNodeId(concept.conceptId);
	const context = {nodes, edges, conceptNode, provenance};
	projectKnowledgeConceptIdentity(context, concept);
	const authoredRelationshipCount = projectKnowledgeConceptRelations(
		context,
		concept,
	);
	projectKnowledgeConceptSources(context, concept);
	const sourceOwnershipCount = projectKnowledgeConceptOwnership(context, concept);
	return {authoredRelationshipCount, sourceOwnershipCount};
}

function projectKnowledgeConceptIdentity(
	context: KnowledgeConceptProjectionContext,
	concept: KnowledgeAlignmentConcept,
): void {
	addNode(context.nodes, {
		id: context.conceptNode,
		type: "knowledge_concept",
		label: concept.title,
		attributes: {
			conceptId: concept.conceptId,
			conceptType: concept.type,
			status: concept.status,
			trustTier: concept.trustTier,
			stale: concept.stale,
		},
		provenance: context.provenance,
	});
	const aliasNode = `knowledge:${concept.conceptId}`;
	addNode(context.nodes, {
		id: aliasNode,
		type: "knowledge",
		label: concept.conceptId,
		attributes: {},
		provenance: context.provenance,
	});
	addEdge(context.edges, {
		type: "knowledge_ref_resolves_to",
		from: aliasNode,
		to: context.conceptNode,
		provenance: context.provenance,
	});
}

function projectKnowledgeConceptRelations(
	context: KnowledgeConceptProjectionContext,
	concept: KnowledgeAlignmentConcept,
): number {
	for (const target of sortedUnique(concept.markdownReferences)) {
		ensureKnowledgeReference(context.nodes, target, context.provenance);
		addEdge(context.edges, {
			type: "references",
			from: context.conceptNode,
			to: knowledgeConceptNodeId(target),
			provenance: context.provenance,
		});
	}
	const relationships = uniqueRelationships(concept.relationships);
	for (const relationship of relationships) {
		ensureKnowledgeReference(context.nodes, relationship.target, context.provenance);
		addEdge(context.edges, {
			type: relationship.type,
			from: context.conceptNode,
			to: knowledgeConceptNodeId(relationship.target),
			provenance: context.provenance,
			attributes: {rationale: relationship.rationale},
		});
	}
	return relationships.length;
}

function projectKnowledgeConceptSources(
	context: KnowledgeConceptProjectionContext,
	concept: KnowledgeAlignmentConcept,
): void {
	for (const resource of sortedUnique(concept.sourceResources)) {
		const sourceNode = `knowledge_source:${resource}`;
		addNode(context.nodes, {
			id: sourceNode,
			type: "knowledge_source",
			label: resource,
			attributes: {},
			provenance: context.provenance,
		});
		addEdge(context.edges, {
			type: "derived_from",
			from: context.conceptNode,
			to: sourceNode,
			provenance: context.provenance,
		});
	}
}

function projectKnowledgeConceptOwnership(
	context: KnowledgeConceptProjectionContext,
	concept: KnowledgeAlignmentConcept,
): number {
	const ownership = [
		...sortedUnique(concept.sourcePatterns).map((path) => ({
			path,
			nodeType: "source_path" as const,
			edgeType: "source_realizes_knowledge" as const,
		})),
		...sortedUnique(concept.testPatterns).map((path) => ({
			path,
			nodeType: "test_path" as const,
			edgeType: "test_verifies_knowledge" as const,
		})),
	];
	for (const item of ownership) {
		addOwnershipFact(context.nodes, context.edges, {
			conceptNode: context.conceptNode,
			path: item.path,
			nodeType: item.nodeType,
			edgeType: item.edgeType,
			provenance: context.provenance,
		});
	}
	return ownership.length;
}

interface AddOwnershipFactInput {
	readonly conceptNode: string;
	readonly path: string;
	readonly nodeType: "source_path" | "test_path";
	readonly edgeType: "source_realizes_knowledge" | "test_verifies_knowledge";
	readonly provenance: AlignmentGraphFactProvenance;
}

function addOwnershipFact(
	nodes: Map<string, AlignmentGraphNode>,
	edges: Map<Sha256Digest, AlignmentGraphEdge>,
	input: AddOwnershipFactInput,
): void {
	const pathNode = `${input.nodeType}:${input.path}`;
	addNode(nodes, {
		id: pathNode,
		type: input.nodeType,
		label: input.path,
		attributes: {},
		provenance: input.provenance,
	});
	addEdge(edges, {
		type: input.edgeType,
		from: pathNode,
		to: input.conceptNode,
		provenance: input.provenance,
	});
}

function ensureKnowledgeReference(
	nodes: Map<string, AlignmentGraphNode>,
	conceptId: string,
	provenance: AlignmentGraphFactProvenance,
): void {
	const id = knowledgeConceptNodeId(conceptId);
	if (nodes.has(id)) return;
	addNode(nodes, {
		id,
		type: "knowledge_reference",
		label: conceptId,
		attributes: {conceptId},
		provenance,
	});
}

function addNode(
	nodes: Map<string, AlignmentGraphNode>,
	input: AlignmentGraphNode,
): void {
	const normalized = canonicalValue<AlignmentGraphNode>(input);
	const existing = nodes.get(normalized.id);
	if (!existing) {
		nodes.set(normalized.id, normalized);
		return;
	}
	if (
		existing.type !== normalized.type ||
		existing.label !== normalized.label ||
		canonicalJsonDigest(existing.attributes) !==
			canonicalJsonDigest(normalized.attributes)
	) {
		if (existing.type === "knowledge_reference" && normalized.type === "knowledge_concept") {
			nodes.set(normalized.id, {
				...normalized,
				provenance: mergeAlignmentGraphProvenance(
					existing.provenance,
					normalized.provenance,
				),
			});
			return;
		}
		throw new Error(`Knowledge Alignment Graph node ${normalized.id} conflicts.`);
	}
	nodes.set(normalized.id, {
		...existing,
		provenance: mergeAlignmentGraphProvenance(
			existing.provenance,
			normalized.provenance,
		),
	});
}

interface AddKnowledgeEdgeInput {
	readonly type: string;
	readonly from: string;
	readonly to: string;
	readonly provenance: AlignmentGraphFactProvenance;
	readonly attributes?: Readonly<Record<string, CanonicalJsonValue>>;
}

function addEdge(
	edges: Map<Sha256Digest, AlignmentGraphEdge>,
	input: AddKnowledgeEdgeInput,
): void {
	const body = canonicalValue<Omit<AlignmentGraphEdge, "factId">>({
		type: input.type,
		from: input.from,
		to: input.to,
		attributes: input.attributes ?? {},
		provenance: input.provenance,
	});
	const edge = canonicalValue<AlignmentGraphEdge>({
		...body,
		factId: canonicalJsonDigest(body),
	});
	edges.set(edge.factId, edge);
}

function knowledgeProvenance(
	concept: KnowledgeAlignmentConcept,
): AlignmentGraphFactProvenance {
	return canonicalValue({
		class:
			concept.authority === "accepted" ? "canonical_binding" : "observed_binding",
		canonicalRefs: concept.authority === "accepted" ? [concept.path] : [],
		observedRefs: concept.authority === "imported" ? [concept.path] : [],
		analysisRefs: [],
	});
}

function assertAuthoredRelationship(
	relationship: CodeWikiAuthoredRelationship,
): void {
	if (!CODEWIKI_AUTHORED_RELATIONSHIP_TYPES.includes(relationship.type)) {
		throw new Error(`Authored Knowledge relationship ${relationship.type} is unsupported.`);
	}
}

function knowledgeConceptNodeId(conceptId: string): string {
	return `knowledge-concept:${conceptId}`;
}

function canonicalValue<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
