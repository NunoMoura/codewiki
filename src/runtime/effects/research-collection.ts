import type {DecisionCandidate} from "../../loops/decision/candidate.ts";
import type {
	EvidenceCoverage,
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
} from "../../evidence/contracts.ts";
import {
	materializeDecisionResearchCitation,
	type DecisionResearchCitationMaterial,
} from "../../loops/decision/research.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";

export const DECISION_RESEARCH_COLLECTION_PROTOCOL = Object.freeze({
	id: "codewiki.decision.research-collection",
	version: "1.0.0",
} as const);

const MAX_RESEARCH_CITATIONS = 32;
const MAX_RESEARCH_COLLECTION_BYTES = 262_144;
const RESEARCH_COLLECTION_TIMEOUT_MS = 30_000;

export interface DecisionResearchCollectorBinding {
	readonly id: string;
	readonly version: string;
	readonly configurationDigest: Sha256Digest;
}

export interface DecisionResearchCollectionRequest {
	readonly protocol: typeof DECISION_RESEARCH_COLLECTION_PROTOCOL;
	readonly requestDigest: Sha256Digest;
	readonly candidate: DecisionCandidate;
	readonly collector: DecisionResearchCollectorBinding;
	readonly sensitivity: EvidenceSensitivity;
	readonly maximumCitations: number;
	readonly maximumReceiptBytes: number;
	readonly timeoutMs: number;
}

export interface DecisionResearchCollectionReceipt {
	readonly protocol: typeof DECISION_RESEARCH_COLLECTION_PROTOCOL;
	readonly requestDigest: Sha256Digest;
	readonly status: "available" | "partial" | "unavailable";
	readonly citations: readonly DecisionResearchCitationMaterial[];
}

export interface DecisionResearchCollector
	extends DecisionResearchCollectorBinding {
	readonly collect: (input: {
		readonly request: DecisionResearchCollectionRequest;
		readonly signal: AbortSignal;
	}) => Promise<unknown>;
}

export interface DecisionResearchCollectionResult {
	readonly request: DecisionResearchCollectionRequest;
	readonly freshnessBoundary: Sha256Digest;
	readonly status: DecisionResearchCollectionReceipt["status"] | "malformed";
	readonly evidenceRecords: readonly EvidenceRecord<"research_citation">[];
}

export async function collectDecisionResearchEvidence(input: {
	readonly candidate: DecisionCandidate;
	readonly subject: EvidenceSubject;
	readonly collector: DecisionResearchCollector;
	readonly sensitivity: EvidenceSensitivity;
	readonly observedAt: () => string;
	readonly signal: AbortSignal;
}): Promise<DecisionResearchCollectionResult> {
	assertCollector(input.collector);
	assertCollectionSubject({
		candidate: input.candidate,
		subject: input.subject,
	});
	const request = collectionRequest({
		candidate: input.candidate,
		collector: input.collector,
		sensitivity: input.sensitivity,
	});
	let rawReceipt: unknown;
	try {
		rawReceipt = await runBoundedCollection({
			collector: input.collector,
			request,
			signal: input.signal,
		});
	} catch {
		return unavailableCollection({request, observedAt: input.observedAt()});
	}
	const observedAt = input.observedAt();
	let freshnessBoundary = collectionFreshnessBoundary({request, observedAt});
	try {
		const receipt = normalizedReceipt({value: rawReceipt, request});
		const receiptDigest = canonicalJsonDigest(receipt);
		freshnessBoundary = collectionFreshnessBoundary({
			request,
			observedAt,
			receiptDigest,
		});
		const coverage = collectionCoverage(receipt.status);
		const evidenceRecords = receipt.citations.map((material) =>
			materializeDecisionResearchCitation(
				{
					...material,
					provenanceRefs: normalizedProvenanceRefs({
						refs: material.provenanceRefs,
						requestDigest: request.requestDigest,
						receiptDigest,
					}),
				},
				{
					subject: input.subject,
					observedAt,
					producer: {
						kind: "external_service",
						id: input.collector.id,
						version: input.collector.version,
					},
					coverage,
					sensitivity: input.sensitivity,
					freshnessBoundary,
				},
			),
		);
		if (
			new Set(evidenceRecords.map((record) => record.evidenceId)).size !==
			evidenceRecords.length
		) {
			throw new Error("Decision research collection receipt contains duplicate citations.");
		}
		return Object.freeze({
			request,
			freshnessBoundary,
			status: receipt.status,
			evidenceRecords: Object.freeze(evidenceRecords),
		});
	} catch {
		return Object.freeze({
			request,
			freshnessBoundary,
			status: "malformed" as const,
			evidenceRecords: Object.freeze([]),
		});
	}
}

function collectionRequest(input: {
	readonly candidate: DecisionCandidate;
	readonly collector: DecisionResearchCollectorBinding;
	readonly sensitivity: EvidenceSensitivity;
}): DecisionResearchCollectionRequest {
	const body = {
		protocol: DECISION_RESEARCH_COLLECTION_PROTOCOL,
		candidate: input.candidate,
		collector: {
			id: input.collector.id,
			version: input.collector.version,
			configurationDigest: input.collector.configurationDigest,
		},
		sensitivity: input.sensitivity,
		maximumCitations: MAX_RESEARCH_CITATIONS,
		maximumReceiptBytes: MAX_RESEARCH_COLLECTION_BYTES,
		timeoutMs: RESEARCH_COLLECTION_TIMEOUT_MS,
	};
	return Object.freeze({
		...body,
		requestDigest: canonicalJsonDigest(body),
	}) as DecisionResearchCollectionRequest;
}

async function runBoundedCollection(input: {
	readonly collector: DecisionResearchCollector;
	readonly request: DecisionResearchCollectionRequest;
	readonly signal: AbortSignal;
}): Promise<unknown> {
	const controller = new AbortController();
	let rejectInterruption: ((reason?: unknown) => void) | undefined;
	const interrupted = new Promise<never>(
		(...settlers: [
			(value: never) => void,
			(reason?: unknown) => void,
		]) => {
			rejectInterruption = settlers[1];
		},
	);
	const abort = () => {
		const reason = input.signal.reason ?? new Error("Decision research collection cancelled.");
		controller.abort(reason);
		rejectInterruption?.(reason);
	};
	if (input.signal.aborted) abort();
	else input.signal.addEventListener("abort", abort, {once: true});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>(
		(...settlers: [
			(value: never) => void,
			(reason?: unknown) => void,
		]) => {
			const rejectTimeout = settlers[1];
			timer = setTimeout(() => {
				const reason = new Error("Decision research collection timed out.");
				controller.abort(reason);
				rejectTimeout(reason);
			}, RESEARCH_COLLECTION_TIMEOUT_MS);
		},
	);
	try {
		return await Promise.race([
			input.collector.collect({
				request: input.request,
				signal: controller.signal,
			}),
			interrupted,
			timeout,
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		input.signal.removeEventListener("abort", abort);
	}
}

function normalizedReceipt(input: {
	readonly value: unknown;
	readonly request: DecisionResearchCollectionRequest;
}): DecisionResearchCollectionReceipt {
	const serialized = JSON.stringify(input.value);
	if (
		serialized === undefined ||
		Buffer.byteLength(serialized, "utf8") > MAX_RESEARCH_COLLECTION_BYTES
	) {
		throw new Error("Decision research collection receipt exceeds its byte bound.");
	}
	assertExactKeys(
		input.value,
		["protocol", "requestDigest", "status", "citations"],
		"Decision research collection receipt",
	);
	const receipt = input.value as Record<string, unknown>;
	assertReceiptBinding({receipt, request: input.request});
	assertReceiptStatus(receipt);
	return toCanonicalJsonValue(receipt) as unknown as DecisionResearchCollectionReceipt;
}

function unavailableCollection(input: {
	readonly request: DecisionResearchCollectionRequest;
	readonly observedAt: string;
}): DecisionResearchCollectionResult {
	return Object.freeze({
		request: input.request,
		freshnessBoundary: collectionFreshnessBoundary(input),
		status: "unavailable" as const,
		evidenceRecords: Object.freeze([]),
	});
}

function collectionFreshnessBoundary(input: {
	readonly request: DecisionResearchCollectionRequest;
	readonly observedAt: string;
	readonly receiptDigest?: Sha256Digest;
}): Sha256Digest {
	if (!Number.isFinite(Date.parse(input.observedAt))) {
		throw new Error("Decision research collection observation time is invalid.");
	}
	return canonicalJsonDigest({
		protocol: DECISION_RESEARCH_COLLECTION_PROTOCOL,
		requestDigest: input.request.requestDigest,
		collector: input.request.collector,
		observedAt: input.observedAt,
		...(input.receiptDigest ? {receiptDigest: input.receiptDigest} : {}),
	});
}

function collectionCoverage(
	status: DecisionResearchCollectionReceipt["status"],
): EvidenceCoverage {
	if (status === "available") return "complete";
	if (status === "partial") return "partial";
	return "unknown";
}

function normalizedProvenanceRefs(input: {
	readonly refs: readonly string[];
	readonly requestDigest: Sha256Digest;
	readonly receiptDigest: Sha256Digest;
}): readonly string[] {
	const required = [
		`collector-request:${input.requestDigest}`,
		`collector-receipt:${input.receiptDigest}`,
	];
	return Object.freeze([
		...input.refs,
		...required.filter((ref) => !input.refs.includes(ref)),
	]);
}

function assertCollector(collector: DecisionResearchCollector): void {
	assertExactKeys(
		collector,
		["id", "version", "configurationDigest", "collect"],
		"Decision research collector",
	);
	if (
		typeof collector.id !== "string" ||
		!collector.id.trim() ||
		typeof collector.version !== "string" ||
		!collector.version.trim() ||
		!/^sha256:[0-9a-f]{64}$/.test(collector.configurationDigest) ||
		typeof collector.collect !== "function"
	) {
		throw new Error("Decision research collector binding is invalid.");
	}
}

function assertReceiptBinding(input: {
	readonly receipt: Readonly<Record<string, unknown>>;
	readonly request: DecisionResearchCollectionRequest;
}): void {
	if (
		canonicalJsonDigest(input.receipt.protocol as CanonicalJsonValue) !==
			canonicalJsonDigest(DECISION_RESEARCH_COLLECTION_PROTOCOL) ||
		input.receipt.requestDigest !== input.request.requestDigest ||
		(input.receipt.status !== "available" &&
			input.receipt.status !== "partial" &&
			input.receipt.status !== "unavailable") ||
		!Array.isArray(input.receipt.citations) ||
		input.receipt.citations.length > MAX_RESEARCH_CITATIONS
	) {
		throw new Error("Decision research collection receipt binding is invalid.");
	}
}

function assertReceiptStatus(receipt: Readonly<Record<string, unknown>>): void {
	const citations = receipt.citations as readonly unknown[];
	if (
		(receipt.status === "available" && citations.length === 0) ||
		(receipt.status === "partial" && citations.length === 0) ||
		(receipt.status === "unavailable" && citations.length !== 0)
	) {
		throw new Error("Decision research collection receipt status is contradictory.");
	}
}

function assertCollectionSubject(input: {
	readonly candidate: DecisionCandidate;
	readonly subject: EvidenceSubject;
}): void {
	if (
		input.subject.candidateDigest !== input.candidate.digest ||
		input.subject.changeRefs.length !== 1 ||
		input.subject.changeRefs[0] !== `change:${input.candidate.content.changeId}` ||
		input.subject.changeRevisionDigests.length !== 1 ||
		input.subject.changeRevisionDigests[0] !==
			input.candidate.content.revision.revisionId
	) {
		throw new Error("Decision research collection subject is not the exact Change revision.");
	}
}
