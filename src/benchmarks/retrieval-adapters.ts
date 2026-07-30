import type { AlignmentGraphSnapshot } from "../change-trace/alignment-graph.ts";
import type { KnowledgeAlignmentProjection } from "../change-trace/alignment-knowledge.ts";
import {
	queryAlignmentGraph,
	type AlignmentQueryRequest,
} from "../change-trace/alignment-query.ts";
import type { SynchronizationStatus } from "../change-trace/synchronization.ts";
import { compareText } from "../change-trace/order.ts";
import type { Sha256Digest } from "../utils/canonical-json.ts";
import type {
	AlignmentRetrievalAdapter,
	AlignmentRetrievalMethod,
	AlignmentRetrievalRequest,
} from "./alignment-retrieval.ts";

interface AlignmentBenchmarkCorpusDocument {
	readonly ref: string;
	readonly text: string;
}

interface CreatePlainSearchRetrievalAdapterInput {
	readonly snapshotDigest: Sha256Digest;
	readonly documents: readonly AlignmentBenchmarkCorpusDocument[];
}

export function createPlainSearchRetrievalAdapter(
	input: CreatePlainSearchRetrievalAdapterInput,
): AlignmentRetrievalAdapter {
	return lexicalAdapter("plain_search", input.snapshotDigest, input.documents);
}

interface CreateOkfSourceProjectionRetrievalAdapterInput {
	readonly snapshotDigest: Sha256Digest;
	readonly projection: KnowledgeAlignmentProjection;
}

export function createOkfSourceProjectionRetrievalAdapter(
	input: CreateOkfSourceProjectionRetrievalAdapterInput,
): AlignmentRetrievalAdapter {
	const documents = input.projection.concepts.flatMap((concept) => {
		const commonText = [
			concept.conceptId,
			concept.title,
			concept.type,
			concept.status,
			concept.trustTier,
			...concept.markdownReferences,
			...concept.relationships.flatMap((relationship) => [
				relationship.type,
				relationship.target,
				relationship.rationale,
			]),
		].join(" ");
		return [
			concept.path,
			...concept.sourcePatterns,
			...concept.testPatterns,
			...concept.sourceResources,
		].map((ref) => ({ref, text: `${commonText} ${ref}`}));
	});
	return lexicalAdapter(
		"okf_source_projection",
		input.snapshotDigest,
		documents,
	);
}

interface CreateAlignmentGraphRetrievalAdapterInput {
	readonly graph: AlignmentGraphSnapshot;
	readonly synchronizationStatus: SynchronizationStatus;
	readonly requests: Readonly<Record<string, AlignmentQueryRequest>>;
}

export function createAlignmentGraphRetrievalAdapter(
	input: CreateAlignmentGraphRetrievalAdapterInput,
): AlignmentRetrievalAdapter {
	return {
		method: "alignment_graph",
		available: true,
		retrieve: (request) => {
			assertAdapterSnapshot(request, input.graph.graphSnapshotDigest);
			const graphRequest = input.requests[request.caseId];
			if (!graphRequest) {
				throw new Error(`Alignment Graph benchmark case ${request.caseId} has no query.`);
			}
			const result = queryAlignmentGraph(
				input.graph,
				{
					...graphRequest,
					graphSnapshotDigest: request.snapshotDigest,
					maxFacts: Math.min(200, Math.max(request.maxResults * 4, 20)),
				},
				input.synchronizationStatus,
			);
			const semanticRefs = result.facts.flatMap((fact) =>
				fact.kind === "node" &&
				(fact.type === "source_path" || fact.type === "test_path") &&
				fact.label
					? [fact.label]
					: [],
			);
			return {
				refs: unique([...semanticRefs, ...result.underlyingRefs]).slice(
					0,
					request.maxResults,
				),
			};
		},
	};
}

interface RecordedAlignmentRetrieval {
	readonly snapshotDigest: Sha256Digest;
	readonly refsByCase: Readonly<Record<string, readonly string[]>>;
}

export function createRecordedAlignmentRetrievalAdapter(
	method: "pi_lens" | "graphify",
	recording: RecordedAlignmentRetrieval,
): AlignmentRetrievalAdapter {
	return {
		method,
		available: true,
		retrieve: (request) => {
			assertAdapterSnapshot(request, recording.snapshotDigest);
			const refs = recording.refsByCase[request.caseId];
			if (!refs) {
				throw new Error(`${method} recording has no case ${request.caseId}.`);
			}
			return {refs: refs.slice(0, request.maxResults)};
		},
	};
}

export function createUnavailableAlignmentRetrievalAdapter(
	method: AlignmentRetrievalMethod,
	reason: string,
): AlignmentRetrievalAdapter {
	return {
		method,
		available: false,
		unavailableReason: reason,
		retrieve: () => {
			throw new Error(`${method} is unavailable: ${reason}`);
		},
	};
}

function lexicalAdapter(
	method: "plain_search" | "okf_source_projection",
	snapshotDigest: Sha256Digest,
	documents: readonly AlignmentBenchmarkCorpusDocument[],
): AlignmentRetrievalAdapter {
	const corpus = documents.map((document) => ({
		...document,
		tokens: tokens(document.text),
	}));
	return {
		method,
		available: true,
		retrieve: (request) => {
			assertAdapterSnapshot(request, snapshotDigest);
			const queryTokens = new Set(tokens(request.query).keys());
			return {
				refs: corpus
					.map((document) => ({
						ref: document.ref,
						score: lexicalScore(queryTokens, document.tokens),
					}))
					.filter((entry) => entry.score > 0)
					.sort(
						(left, right) =>
							right.score - left.score || compareText(left.ref, right.ref),
					)
					.map((entry) => entry.ref)
					.filter((ref, index, refs) => refs.indexOf(ref) === index)
					.slice(0, request.maxResults),
			};
		},
	};
}

function lexicalScore(
	queryTokens: ReadonlySet<string>,
	documentTokens: ReadonlyMap<string, number>,
): number {
	let score = 0;
	for (const token of queryTokens) score += documentTokens.get(token) ?? 0;
	return score;
}

function tokens(text: string): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const token of text.toLowerCase().match(/[a-z\d_]+/g) ?? []) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}
	return counts;
}

function assertAdapterSnapshot(
	request: AlignmentRetrievalRequest,
	expected: Sha256Digest,
): void {
	if (request.snapshotDigest !== expected) {
		throw new Error("Alignment retrieval adapter snapshot does not match benchmark.");
	}
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}
