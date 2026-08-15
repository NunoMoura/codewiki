import {
	assertValidAlignmentGraphSnapshot,
	type AlignmentGraphCoverage,
	type AlignmentGraphSnapshot,
} from "../../alignment/graph.ts";
import {
	queryAlignmentGraph,
	type AlignmentQueryFact,
	type AlignmentQueryResult,
} from "../../alignment/query.ts";
import type {SynchronizationStatus} from "../../changes/trace/synchronization.ts";
import type {SemanticLoop} from "../contracts.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import type {ExitReport, ResolvedExitPolicy} from "../contracts.ts";
import {assertValidExitReport} from "../results.ts";

export const REPAIR_FRONTIER_PROTOCOL_VERSION = "1.0.0" as const;
export const MAX_REPAIR_FRONTIER_FACTS = 200;
export const MAX_REPAIR_FRONTIER_REFS_PER_KIND = 100;
export const MAX_REPAIR_FRONTIER_CHANGES = 16;

const DEFAULT_MAX_FACTS = 100;
const DEFAULT_MAX_REFS_PER_KIND = 50;
const DEFAULT_DEPTH = 3;
const MAX_ALIGNMENT_QUERY_FACTS = 200;

export interface RepairFrontierCandidateBinding {
	readonly loop: SemanticLoop;
	readonly candidateId: string;
	readonly candidateDigest: Sha256Digest;
	readonly changeIds: readonly string[];
}

export interface RepairFrontierLimits {
	readonly maxFacts: number;
	readonly maxRefsPerKind: number;
	readonly depth: number;
}

export interface RepairFrontierReferences {
	readonly sourceRefs: readonly string[];
	readonly testRefs: readonly string[];
	readonly knowledgeRefs: readonly string[];
	readonly findingLocations: readonly string[];
	readonly evidenceRecordIds: readonly string[];
	readonly checkIds: readonly string[];
	readonly changeIds: readonly string[];
	readonly repairTargets: readonly string[];
}

export type RepairFrontierReferenceKind = keyof RepairFrontierReferences | "underlyingRefs";

export interface RepairFrontierProvenance {
	readonly graphSnapshotDigest: Sha256Digest;
	readonly graphContentDigest: Sha256Digest;
	readonly synchronizationStatus: SynchronizationStatus;
	readonly queryResultDigests: readonly Sha256Digest[];
	readonly underlyingRefs: readonly string[];
	readonly staleFactIds: readonly string[];
}

export interface RepairFrontierCoverage {
	readonly status: "complete" | "partial" | "unavailable";
	readonly graph: AlignmentGraphCoverage;
	readonly requestedRootCount: number;
	readonly foundRootCount: number;
	readonly queryCount: number;
	readonly availableFactCount: number;
	readonly returnedFactCount: number;
	readonly actionableResultCount: number;
	readonly findingCount: number;
	readonly findingLocationCount: number;
	readonly alignedFindingLocationCount: number;
}

export interface RepairFrontierTruncation {
	readonly truncated: boolean;
	readonly queryFacts: boolean;
	readonly facts: boolean;
	readonly referenceKinds: readonly RepairFrontierReferenceKind[];
}

export interface RepairFrontier {
	readonly protocolVersion: typeof REPAIR_FRONTIER_PROTOCOL_VERSION;
	readonly candidate: RepairFrontierCandidateBinding;
	readonly policyDigest: Sha256Digest;
	readonly exitReportDigest: Sha256Digest;
	readonly actionableResultDigests: readonly Sha256Digest[];
	readonly limits: RepairFrontierLimits;
	readonly stale: boolean;
	readonly grantsAuthority: false;
	readonly references: RepairFrontierReferences;
	readonly facts: readonly AlignmentQueryFact[];
	readonly provenance: RepairFrontierProvenance;
	readonly coverage: RepairFrontierCoverage;
	readonly truncation: RepairFrontierTruncation;
	readonly frontierDigest: Sha256Digest;
}

export interface CreateRepairFrontierInput {
	readonly candidate: RepairFrontierCandidateBinding;
	readonly policy: ResolvedExitPolicy;
	readonly report: ExitReport;
	readonly alignmentGraph: AlignmentGraphSnapshot;
	readonly synchronizationStatus: SynchronizationStatus;
	readonly limits?: Partial<RepairFrontierLimits>;
}

interface ReferenceSelection {
	readonly references: RepairFrontierReferences;
	readonly underlyingRefs: readonly string[];
	readonly truncatedKinds: readonly RepairFrontierReferenceKind[];
}

interface RepairFrontierContext {
	readonly candidate: RepairFrontierCandidateBinding;
	readonly limits: RepairFrontierLimits;
	readonly actionableResults: ExitReport["checkResults"];
	readonly queries: readonly AlignmentQueryResult[];
	readonly availableFacts: readonly AlignmentQueryFact[];
	readonly facts: readonly AlignmentQueryFact[];
	readonly findingLocations: readonly string[];
}

export function createRepairFrontier(
	input: CreateRepairFrontierInput,
): RepairFrontier {
	const context = repairFrontierContext(input);
	const referenceSelection = selectReferences({
		facts: context.facts,
		queries: context.queries,
		candidate: context.candidate,
		actionableResults: context.actionableResults,
		findingLocations: context.findingLocations,
		maxRefsPerKind: context.limits.maxRefsPerKind,
	});
	const body = repairFrontierBody(input, context, referenceSelection);
	return canonicalValue({...body, frontierDigest: canonicalJsonDigest(body)});
}

function repairFrontierContext(
	input: CreateRepairFrontierInput,
): RepairFrontierContext {
	assertValidExitReport(input.report, input.policy);
	assertValidAlignmentGraphSnapshot(input.alignmentGraph);
	const candidate = normalizeCandidate(input.candidate);
	if (
		candidate.loop !== input.report.loop ||
		candidate.candidateDigest !== input.report.candidateDigest
	) {
		throw new Error("Repair Frontier Candidate does not match Exit Report.");
	}
	const limits = normalizeLimits(input.limits);
	assertCandidateGraphBinding(input.alignmentGraph, candidate);
	const actionableResults = input.report.checkResults.filter(
		(result) => result.status === "fail" || result.status === "indeterminate",
	);
	if (actionableResults.length === 0) {
		throw new Error(
			"Repair Frontier requires at least one failed or indeterminate Check Result.",
		);
	}
	const queries = alignmentQueries(input, candidate, limits.depth);
	const availableFacts = uniqueFacts(queries.flatMap((query) => query.facts));
	const directSeeds = directSeedValues(candidate, actionableResults);
	const facts = [...availableFacts]
		.sort((left, right) => compareRankedFacts(left, right, directSeeds))
		.slice(0, limits.maxFacts);
	const findingLocations = sortedUnique(
		actionableResults.flatMap((result) =>
			result.findings.flatMap((finding) =>
				finding.location ? [finding.location.ref] : [],
			),
		),
	);
	return {
		candidate,
		limits,
		actionableResults,
		queries,
		availableFacts,
		facts,
		findingLocations,
	};
}

function repairFrontierBody(
	input: CreateRepairFrontierInput,
	context: RepairFrontierContext,
	references: ReferenceSelection,
) {
	const queryFactsTruncated = context.queries.some((query) => query.truncated);
	const factsTruncated = context.facts.length < context.availableFacts.length;
	const requestedRootCount = context.queries.length;
	const foundRootCount = context.queries.filter((query) => query.rootFound).length;
	const alignedFindingLocationCount = context.findingLocations.filter((location) =>
		locationIsAligned(location, context.availableFacts),
	).length;
	const truncation = {
		truncated:
			queryFactsTruncated || factsTruncated || references.truncatedKinds.length > 0,
		queryFacts: queryFactsTruncated,
		facts: factsTruncated,
		referenceKinds: references.truncatedKinds,
	};
	const staleFactIds = sortedUnique(
		context.facts.flatMap((fact) =>
			fact.attributes.stale === true ? [fact.id] : [],
		),
	);
	const coverageStatus = repairFrontierCoverageStatus({
		requestedRootCount,
		foundRootCount,
		findingLocationCount: context.findingLocations.length,
		alignedFindingLocationCount,
		truncated: truncation.truncated,
	});
	return {
		protocolVersion: REPAIR_FRONTIER_PROTOCOL_VERSION,
		candidate: context.candidate,
		policyDigest: assertSha256Digest(input.policy.policyDigest, "Policy digest"),
		exitReportDigest: assertSha256Digest(input.report.reportDigest, "Exit Report digest"),
		actionableResultDigests: context.actionableResults
			.map((result) => assertSha256Digest(result.resultDigest, "Check Result digest"))
			.sort(compareText),
		limits: context.limits,
		stale: input.synchronizationStatus !== "fresh" || staleFactIds.length > 0,
		grantsAuthority: false as const,
		references: references.references,
		facts: context.facts,
		provenance: {
			graphSnapshotDigest: input.alignmentGraph.graphSnapshotDigest,
			graphContentDigest: input.alignmentGraph.graphContentDigest,
			synchronizationStatus: input.synchronizationStatus,
			queryResultDigests: context.queries.map((query) => query.resultDigest),
			underlyingRefs: references.underlyingRefs,
			staleFactIds,
		},
		coverage: {
			status: coverageStatus,
			graph: input.alignmentGraph.coverage,
			requestedRootCount,
			foundRootCount,
			queryCount: context.queries.length,
			availableFactCount: context.availableFacts.length,
			returnedFactCount: context.facts.length,
			actionableResultCount: context.actionableResults.length,
			findingCount: context.actionableResults.reduce(
				(count, result) => count + result.findings.length,
				0,
			),
			findingLocationCount: context.findingLocations.length,
			alignedFindingLocationCount,
		},
		truncation,
	};
}

export function assertValidRepairFrontier(
	frontier: RepairFrontier,
	input: CreateRepairFrontierInput,
): void {
	assertExactKeys(
		frontier,
		[
			"protocolVersion",
			"candidate",
			"policyDigest",
			"exitReportDigest",
			"actionableResultDigests",
			"limits",
			"stale",
			"grantsAuthority",
			"references",
			"facts",
			"provenance",
			"coverage",
			"truncation",
			"frontierDigest",
		],
		"Repair Frontier",
	);
	if (frontier.protocolVersion !== REPAIR_FRONTIER_PROTOCOL_VERSION) {
		throw new Error(
			`Unsupported Repair Frontier protocol version ${String(frontier.protocolVersion)}.`,
		);
	}
	assertSha256Digest(frontier.frontierDigest, "Repair Frontier digest");
	const {frontierDigest, ...body} = frontier;
	if (frontierDigest !== canonicalJsonDigest(body)) {
		throw new Error("Repair Frontier digest does not match content.");
	}
	const expected = createRepairFrontier(input);
	if (canonicalJson(frontier) !== canonicalJson(expected)) {
		throw new Error("Repair Frontier does not match its bound report and Alignment snapshot.");
	}
}

function alignmentQueries(
	input: CreateRepairFrontierInput,
	candidate: RepairFrontierCandidateBinding,
	depth: number,
): AlignmentQueryResult[] {
	return [
		queryAlignmentGraph(
			input.alignmentGraph,
			{
				family: "loop_assurance",
				candidateId: candidate.candidateId,
				graphSnapshotDigest: input.alignmentGraph.graphSnapshotDigest,
				maxFacts: MAX_ALIGNMENT_QUERY_FACTS,
				depth,
			},
			input.synchronizationStatus,
		),
		...candidate.changeIds.map((changeId) =>
			queryAlignmentGraph(
				input.alignmentGraph,
				{
					family: "change_context",
					changeId,
					graphSnapshotDigest: input.alignmentGraph.graphSnapshotDigest,
					maxFacts: MAX_ALIGNMENT_QUERY_FACTS,
					depth,
				},
				input.synchronizationStatus,
			),
		),
	];
}

function normalizeCandidate(
	candidate: RepairFrontierCandidateBinding,
): RepairFrontierCandidateBinding {
	assertExactKeys(
		candidate,
		["loop", "candidateId", "candidateDigest", "changeIds"],
		"Repair Frontier Candidate",
	);
	if (!(["decision", "planning", "implementation"] as const).includes(candidate.loop)) {
		throw new Error("Repair Frontier Candidate loop is invalid.");
	}
	const loop = candidate.loop;
	const candidateId = boundedText(candidate.candidateId, "Candidate id", 512);
	const candidateDigest = assertSha256Digest(candidate.candidateDigest, "Candidate digest");
	if (!Array.isArray(candidate.changeIds)) {
		throw new Error("Repair Frontier Candidate changeIds must be an array.");
	}
	if (
		candidate.changeIds.length === 0 ||
		candidate.changeIds.length > MAX_REPAIR_FRONTIER_CHANGES
	) {
		throw new Error(
			`Repair Frontier Candidate must bind between 1 and ${MAX_REPAIR_FRONTIER_CHANGES} Changes.`,
		);
	}
	const changeIds = sortedUnique(
		candidate.changeIds.map((changeId) => boundedText(changeId, "Change id", 256)),
	);
	if (changeIds.length !== candidate.changeIds.length) {
		throw new Error("Repair Frontier Candidate changeIds must be unique.");
	}
	return canonicalValue({loop, candidateId, candidateDigest, changeIds});
}

function normalizeLimits(
	limits: Partial<RepairFrontierLimits> | undefined,
): RepairFrontierLimits {
	const maxFacts = boundedInteger({
		value: limits?.maxFacts,
		fallback: DEFAULT_MAX_FACTS,
		minimum: 1,
		maximum: MAX_REPAIR_FRONTIER_FACTS,
		label: "Repair Frontier maxFacts",
	});
	const maxRefsPerKind = boundedInteger({
		value: limits?.maxRefsPerKind,
		fallback: DEFAULT_MAX_REFS_PER_KIND,
		minimum: 1,
		maximum: MAX_REPAIR_FRONTIER_REFS_PER_KIND,
		label: "Repair Frontier maxRefsPerKind",
	});
	const depth = boundedInteger({
		value: limits?.depth,
		fallback: DEFAULT_DEPTH,
		minimum: 0,
		maximum: 4,
		label: "Repair Frontier depth",
	});
	return canonicalValue({maxFacts, maxRefsPerKind, depth});
}

function assertCandidateGraphBinding(
	graph: AlignmentGraphSnapshot,
	candidate: RepairFrontierCandidateBinding,
): void {
	const node = graph.nodes.find((entry) => entry.id === `candidate:${candidate.candidateId}`);
	if (node && node.attributes.digest !== candidate.candidateDigest) {
		throw new Error("Repair Frontier Candidate digest does not match Alignment Graph.");
	}
}

function directSeedValues(
	candidate: RepairFrontierCandidateBinding,
	results: ExitReport["checkResults"],
): readonly string[] {
	return sortedUnique([
		candidate.candidateId,
		`candidate:${candidate.candidateId}`,
		...candidate.changeIds,
		...candidate.changeIds.map((changeId) => `change:${changeId}`),
		...results.flatMap((result) => [
			result.checkId,
			...result.evidenceRecordIds,
			...result.findings.flatMap((finding) => [
				...(finding.code ? [finding.code] : []),
				...(finding.location ? [finding.location.ref] : []),
			]),
		]),
	]);
}

function uniqueFacts(facts: readonly AlignmentQueryFact[]): AlignmentQueryFact[] {
	const byId = new Map<string, AlignmentQueryFact>();
	for (const fact of facts) byId.set(`${fact.kind}:${fact.id}`, fact);
	return [...byId.values()];
}

function compareRankedFacts(
	left: AlignmentQueryFact,
	right: AlignmentQueryFact,
	seeds: readonly string[],
): number {
	return factRank(left, seeds) - factRank(right, seeds) || factKey(left).localeCompare(factKey(right));
}

function factRank(fact: AlignmentQueryFact, seeds: readonly string[]): number {
	const values = [fact.id, fact.label, fact.from, fact.to].filter(
		(value): value is string => typeof value === "string",
	);
	if (values.some((value) => seeds.some((seed) => relatedRef(value, seed)))) return 0;
	if (
		[
			"source_path",
			"test_path",
			"knowledge",
			"knowledge_concept",
			"knowledge_source",
			"candidate",
			"change",
			"check_result",
			"evidence",
			"exit_report",
		].includes(fact.type)
	) {
		return 1;
	}
	return fact.kind === "edge" ? 2 : 3;
}

function selectReferences(input: {
	readonly facts: readonly AlignmentQueryFact[];
	readonly queries: readonly AlignmentQueryResult[];
	readonly candidate: RepairFrontierCandidateBinding;
	readonly actionableResults: ExitReport["checkResults"];
	readonly findingLocations: readonly string[];
	readonly maxRefsPerKind: number;
}): ReferenceSelection {
	const all: Record<RepairFrontierReferenceKind, readonly string[]> = {
		sourceRefs: factLabels(input.facts, "source_path"),
		testRefs: factLabels(input.facts, "test_path"),
		knowledgeRefs: knowledgeRefs(input.facts),
		findingLocations: input.findingLocations,
		evidenceRecordIds: sortedUnique(
			input.actionableResults.flatMap((result) => result.evidenceRecordIds),
		),
		checkIds: sortedUnique(input.actionableResults.map((result) => result.checkId)),
		changeIds: input.candidate.changeIds,
		repairTargets: sortedUnique(
			input.actionableResults.map((result) => result.repairTarget),
		),
		underlyingRefs: sortedUnique(
			input.queries.flatMap((query) => query.underlyingRefs),
		),
	};
	const truncatedKinds = (Object.keys(all) as RepairFrontierReferenceKind[]).filter(
		(kind) => all[kind].length > input.maxRefsPerKind,
	);
	const selected = Object.fromEntries(
		Object.entries(all).map(([kind, values]) => [
			kind,
			(values as readonly string[]).slice(0, input.maxRefsPerKind),
		]),
	) as unknown as Record<RepairFrontierReferenceKind, readonly string[]>;
	return {
		references: {
			sourceRefs: selected.sourceRefs,
			testRefs: selected.testRefs,
			knowledgeRefs: selected.knowledgeRefs,
			findingLocations: selected.findingLocations,
			evidenceRecordIds: selected.evidenceRecordIds,
			checkIds: selected.checkIds,
			changeIds: selected.changeIds,
			repairTargets: selected.repairTargets,
		},
		underlyingRefs: selected.underlyingRefs,
		truncatedKinds: truncatedKinds.sort(compareText),
	};
}

function factLabels(facts: readonly AlignmentQueryFact[], type: string): string[] {
	return sortedUnique(
		facts.flatMap((fact) => (fact.type === type && fact.label ? [fact.label] : [])),
	);
}

function knowledgeRefs(facts: readonly AlignmentQueryFact[]): string[] {
	return sortedUnique(
		facts.flatMap((fact) => {
			if (!["knowledge", "knowledge_concept", "knowledge_source"].includes(fact.type)) {
				return [];
			}
			const conceptId = fact.attributes.conceptId;
			return [typeof conceptId === "string" ? conceptId : (fact.label ?? fact.id)];
		}),
	);
}

function locationIsAligned(
	location: string,
	facts: readonly AlignmentQueryFact[],
): boolean {
	return facts.some(
		(fact) =>
			(fact.type === "source_path" || fact.type === "test_path") &&
			fact.label !== null &&
			relatedPath(location, fact.label),
	);
}

function relatedRef(left: string, right: string): boolean {
	return left === right || left.includes(right) || right.includes(left);
}

function relatedPath(location: string, pattern: string): boolean {
	if (location === pattern) return true;
	const staticPrefix = pattern.split(/[?*[]/u, 1)[0].replace(/\/$/u, "");
	return staticPrefix.length > 0 && location.startsWith(staticPrefix);
}

function repairFrontierCoverageStatus(input: {
	readonly requestedRootCount: number;
	readonly foundRootCount: number;
	readonly findingLocationCount: number;
	readonly alignedFindingLocationCount: number;
	readonly truncated: boolean;
}): RepairFrontierCoverage["status"] {
	if (input.foundRootCount === 0) return "unavailable";
	if (
		input.foundRootCount < input.requestedRootCount ||
		input.alignedFindingLocationCount < input.findingLocationCount ||
		input.truncated
	) {
		return "partial";
	}
	return "complete";
}

function boundedInteger(input: {
	readonly value: number | undefined;
	readonly fallback: number;
	readonly minimum: number;
	readonly maximum: number;
	readonly label: string;
}): number {
	const selected = input.value ?? input.fallback;
	if (
		!Number.isInteger(selected) ||
		selected < input.minimum ||
		selected > input.maximum
	) {
		throw new Error(
			`${input.label} must be an integer from ${input.minimum} to ${input.maximum}.`,
		);
	}
	return selected;
}

function boundedText(value: unknown, label: string, maximum: number): string {
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const trimmed = value.trim();
	if (trimmed !== value || trimmed.length === 0 || trimmed.length > maximum) {
		throw new Error(`${label} must contain 1 to ${maximum} trimmed characters.`);
	}
	return trimmed;
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

function factKey(fact: AlignmentQueryFact): string {
	return `${fact.kind}:${fact.id}`;
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function canonicalValue<T>(value: T): T {
	return toCanonicalJsonValue(value) as T;
}
