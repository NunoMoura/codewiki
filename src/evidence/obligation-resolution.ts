import type { EvidenceId } from "./contracts.ts";
import { evidenceDigestFromId } from "./identity.ts";
import type { EvidenceObligation } from "./obligations.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
} from "../utils/canonical-json.ts";
import type { Sha256Digest } from "../utils/canonical-json.ts";
import { assertExactKeys } from "../utils/json.ts";

export type EvidenceObligationStatus = "ready" | "missing" | "indeterminate";
export type EvidenceExclusionReason =
	| "kind"
	| "producer"
	| "authority"
	| "coverage"
	| "sensitivity"
	| "subject"
	| "freshness"
	| "artifact_missing"
	| "artifact_unavailable";

export interface EvidenceExclusion {
	readonly evidenceId: EvidenceId;
	readonly reasons: readonly EvidenceExclusionReason[];
}

export interface EvidenceObligationResolution {
	readonly obligationId: string;
	readonly obligationVersion: string;
	readonly obligationDigest: Sha256Digest;
	readonly status: EvidenceObligationStatus;
	readonly inputEvidenceIds: readonly EvidenceId[];
	readonly eligibleEvidenceIds: readonly EvidenceId[];
	readonly supportingEvidenceIds: readonly EvidenceId[];
	readonly contradictoryEvidenceIds: readonly EvidenceId[];
	readonly neutralEvidenceIds: readonly EvidenceId[];
	readonly excludedEvidence: readonly EvidenceExclusion[];
	readonly duplicateEvidenceIds: readonly EvidenceId[];
	readonly missingCount: number;
	readonly resolutionDigest: Sha256Digest;
}

export function assertValidEvidenceObligationResolution(
	value: unknown,
	expectedObligation?: EvidenceObligation,
): asserts value is EvidenceObligationResolution {
	assertExactKeys(
		value,
		[
			"obligationId",
			"obligationVersion",
			"obligationDigest",
			"status",
			"inputEvidenceIds",
			"eligibleEvidenceIds",
			"supportingEvidenceIds",
			"contradictoryEvidenceIds",
			"neutralEvidenceIds",
			"excludedEvidence",
			"duplicateEvidenceIds",
			"missingCount",
			"resolutionDigest",
		],
		"Evidence obligation resolution",
	);
	const resolution = value as EvidenceObligationResolution;
	assertStableId(resolution.obligationId, "Evidence obligation resolution id");
	assertVersion(
		resolution.obligationVersion,
		"Evidence obligation resolution version",
	);
	assertSha256Digest(
		resolution.obligationDigest,
		"Evidence obligation resolution obligation digest",
	);
	assertSha256Digest(
		resolution.resolutionDigest,
		"Evidence obligation resolution digest",
	);
	if (
		resolution.status !== "ready" &&
		resolution.status !== "missing" &&
		resolution.status !== "indeterminate"
	) {
		throw new Error(
			`Evidence obligation resolution status ${String(resolution.status)} is invalid.`,
		);
	}
	if (!Number.isInteger(resolution.missingCount) || resolution.missingCount < 0) {
		throw new Error("Evidence obligation resolution missingCount is invalid.");
	}
	assertEvidenceIdList(resolution.inputEvidenceIds, "inputEvidenceIds");
	assertEvidenceIdList(resolution.eligibleEvidenceIds, "eligibleEvidenceIds");
	assertEvidenceIdList(resolution.supportingEvidenceIds, "supportingEvidenceIds");
	assertEvidenceIdList(
		resolution.contradictoryEvidenceIds,
		"contradictoryEvidenceIds",
	);
	assertEvidenceIdList(resolution.neutralEvidenceIds, "neutralEvidenceIds");
	assertEvidenceIdList(
		resolution.duplicateEvidenceIds,
		"duplicateEvidenceIds",
	);
	assertEvidenceExclusions(resolution.excludedEvidence);
	assertResolutionAccounting(resolution);
	if (expectedObligation) {
		assertResolutionObligation(resolution, expectedObligation);
	}
	const { resolutionDigest, ...withoutDigest } = resolution;
	const expectedDigest = canonicalJsonDigest(withoutDigest);
	if (resolutionDigest !== expectedDigest) {
		throw new Error(
			`Evidence obligation resolution digest mismatch: expected ${expectedDigest}.`,
		);
	}
}

export function evidenceObligationStatus(input: {
	readonly obligation: EvidenceObligation;
	readonly supportingCount: number;
	readonly duplicateCount: number;
	readonly eligibleContradictionCount: number;
	readonly potentiallyRelevant: boolean;
}): EvidenceObligationStatus {
	if (input.duplicateCount > 0) return "indeterminate";
	if (
		input.obligation.contradiction === "indeterminate" &&
		input.eligibleContradictionCount > 0
	) {
		return "indeterminate";
	}
	if (input.supportingCount >= input.obligation.minimumCount) return "ready";
	return input.potentiallyRelevant ? "indeterminate" : "missing";
}

function assertStableId(value: unknown, label: string): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
	) {
		throw new Error(`${label} is invalid.`);
	}
}

function assertVersion(value: unknown, label: string): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(value)
	) {
		throw new Error(`${label} is invalid.`);
	}
}

function assertEvidenceIdList(
	values: readonly EvidenceId[],
	label: string,
): void {
	if (!Array.isArray(values)) {
		throw new Error(`Evidence obligation resolution ${label} must be an array.`);
	}
	for (const value of values) evidenceDigestFromId(value);
	assertSortedUniqueList(values, `Evidence obligation resolution ${label}`);
}

function assertEvidenceExclusions(values: readonly EvidenceExclusion[]): void {
	if (!Array.isArray(values)) {
		throw new Error(
			"Evidence obligation resolution excludedEvidence must be an array.",
		);
	}
	const ids: EvidenceId[] = [];
	for (const [index, value] of values.entries()) {
		assertExactKeys(
			value,
			["evidenceId", "reasons"],
			`Evidence obligation resolution excludedEvidence ${index}`,
		);
		evidenceDigestFromId(value.evidenceId);
		if (!Array.isArray(value.reasons) || value.reasons.length === 0) {
			throw new Error(
				`Evidence obligation resolution excludedEvidence ${index} requires reasons.`,
			);
		}
		for (const reason of value.reasons) {
			if (!EVIDENCE_EXCLUSION_REASONS.has(reason)) {
				throw new Error(
					`Evidence obligation resolution exclusion reason ${String(reason)} is invalid.`,
				);
			}
		}
		assertSortedUniqueList(
			value.reasons,
			`Evidence obligation resolution excludedEvidence ${index} reasons`,
		);
		ids.push(value.evidenceId);
	}
	assertSortedUniqueList(ids, "Evidence obligation resolution excludedEvidence ids");
}

function assertResolutionAccounting(
	resolution: EvidenceObligationResolution,
): void {
	const input = new Set(resolution.inputEvidenceIds);
	const eligible = new Set(resolution.eligibleEvidenceIds);
	const supporting = new Set(resolution.supportingEvidenceIds);
	const contradictory = new Set(resolution.contradictoryEvidenceIds);
	const neutral = new Set(resolution.neutralEvidenceIds);
	const excluded = new Set(
		resolution.excludedEvidence.map((entry) => entry.evidenceId),
	);
	const duplicate = new Set(resolution.duplicateEvidenceIds);
	assertSubset(eligible, input, "eligible Evidence");
	assertSubset(supporting, eligible, "supporting Evidence");
	assertSubset(contradictory, input, "contradictory Evidence");
	assertSubset(neutral, eligible, "neutral Evidence");
	assertSubset(excluded, input, "excluded Evidence");
	assertSubset(duplicate, input, "duplicate Evidence");
	assertDisjoint(eligible, excluded, "eligible and excluded Evidence");
	assertDisjoint(eligible, duplicate, "eligible and duplicate Evidence");
	assertDisjoint(excluded, duplicate, "excluded and duplicate Evidence");
	assertDisjoint(supporting, contradictory, "supporting and contradictory Evidence");
	assertDisjoint(supporting, neutral, "supporting and neutral Evidence");
	assertDisjoint(contradictory, neutral, "contradictory and neutral Evidence");
	for (const evidenceId of eligible) {
		if (
			!supporting.has(evidenceId) &&
			!contradictory.has(evidenceId) &&
			!neutral.has(evidenceId)
		) {
			throw new Error(
				`Evidence obligation resolution eligible Evidence ${evidenceId} is unclassified.`,
			);
		}
	}
	for (const evidenceId of input) {
		const accountCount =
			Number(eligible.has(evidenceId)) +
			Number(excluded.has(evidenceId)) +
			Number(duplicate.has(evidenceId));
		if (accountCount !== 1) {
			throw new Error(
				`Evidence obligation resolution input Evidence ${evidenceId} is not accounted exactly once.`,
			);
		}
	}
}

function assertResolutionObligation(
	resolution: EvidenceObligationResolution,
	obligation: EvidenceObligation,
): void {
	const obligationDigest = canonicalJsonDigest(obligation);
	if (
		resolution.obligationId !== obligation.id ||
		resolution.obligationVersion !== obligation.version ||
		resolution.obligationDigest !== obligationDigest
	) {
		throw new Error(
			`Evidence obligation resolution does not match obligation ${obligation.id}@${obligation.version}.`,
		);
	}
	const expectedMissingCount = Math.max(
		0,
		obligation.minimumCount - resolution.supportingEvidenceIds.length,
	);
	if (resolution.missingCount !== expectedMissingCount) {
		throw new Error(
			`Evidence obligation resolution ${obligation.id} missingCount mismatch: expected ${expectedMissingCount}.`,
		);
	}
	const eligible = new Set(resolution.eligibleEvidenceIds);
	const eligibleContradictionCount = resolution.contradictoryEvidenceIds.filter(
		(evidenceId) => eligible.has(evidenceId),
	).length;
	const potentiallyRelevant = resolution.excludedEvidence.some(
		(entry) =>
			!entry.reasons.includes("kind") && !entry.reasons.includes("subject"),
	);
	const expectedStatus = evidenceObligationStatus({
		obligation,
		supportingCount: resolution.supportingEvidenceIds.length,
		duplicateCount: resolution.duplicateEvidenceIds.length,
		eligibleContradictionCount,
		potentiallyRelevant,
	});
	if (resolution.status !== expectedStatus) {
		throw new Error(
			`Evidence obligation resolution ${obligation.id} status mismatch: expected ${expectedStatus}.`,
		);
	}
}

function assertSubset(
	values: ReadonlySet<EvidenceId>,
	container: ReadonlySet<EvidenceId>,
	label: string,
): void {
	for (const value of values) {
		if (!container.has(value)) {
			throw new Error(`Evidence obligation resolution ${label} is not a subset.`);
		}
	}
}

function assertDisjoint(
	left: ReadonlySet<EvidenceId>,
	right: ReadonlySet<EvidenceId>,
	label: string,
): void {
	for (const value of left) {
		if (right.has(value)) {
			throw new Error(`Evidence obligation resolution ${label} must be disjoint.`);
		}
	}
}

function assertSortedUniqueList(
	values: readonly string[],
	label: string,
): void {
	let previous: string | undefined;
	for (const value of values) {
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`${label} contains an invalid value.`);
		}
		if (previous !== undefined && value <= previous) {
			throw new Error(`${label} must be sorted and unique.`);
		}
		previous = value;
	}
}

const EVIDENCE_EXCLUSION_REASONS = new Set<EvidenceExclusionReason>([
	"kind",
	"producer",
	"authority",
	"coverage",
	"sensitivity",
	"subject",
	"freshness",
	"artifact_missing",
	"artifact_unavailable",
]);
