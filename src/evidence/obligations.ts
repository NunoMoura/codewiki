import { Type } from "typebox";
import {
	EVIDENCE_KINDS,
	evidenceSubjectSchema,
} from "./contracts.ts";
import type {
	EvidenceAuthority,
	EvidenceCoverage,
	EvidenceId,
	EvidenceKind,
	EvidenceProducerKind,
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
} from "./contracts.ts";
import { assertValidEvidenceRecord } from "./materialize.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../utils/canonical-json.ts";
import type { Sha256Digest } from "../utils/canonical-json.ts";
import { assertTypeboxSchema } from "../utils/json.ts";

export const EVIDENCE_OBLIGATION_VERSION = "1.0.0" as const;

type EvidenceSubjectBinding =
	| "change_revision"
	| "planning_revision"
	| "candidate"
	| "candidate_source_tree"
	| "candidate_acceptance_requirements";
type EvidenceFreshnessRequirement = "none" | "exact_boundary";
type EvidenceArtifactRequirement =
	| "optional"
	| "required"
	| "available";
type EvidenceContradictionPolicy = "retain" | "indeterminate";
type EvidenceRelation = "supporting" | "contradictory" | "neutral";
type EvidenceObligationStatus = "ready" | "missing" | "indeterminate";

export interface EvidenceObligation {
	readonly id: string;
	readonly version: string;
	readonly kinds: readonly EvidenceKind[];
	readonly producerKinds: readonly EvidenceProducerKind[];
	readonly authorities: readonly EvidenceAuthority[];
	readonly coverages: readonly EvidenceCoverage[];
	readonly sensitivities: readonly EvidenceSensitivity[];
	readonly minimumCount: number;
	readonly subject: EvidenceSubjectBinding;
	readonly freshness: EvidenceFreshnessRequirement;
	readonly artifact: EvidenceArtifactRequirement;
	readonly contradiction: EvidenceContradictionPolicy;
}

interface EvidenceUse {
	readonly evidence: EvidenceRecord;
	readonly relation: EvidenceRelation;
}

type EvidenceExclusionReason =
	| "kind"
	| "producer"
	| "authority"
	| "coverage"
	| "sensitivity"
	| "subject"
	| "freshness"
	| "artifact_missing"
	| "artifact_unavailable";

interface EvidenceExclusion {
	readonly evidenceId: EvidenceId;
	readonly reasons: readonly EvidenceExclusionReason[];
}

interface ReduceEvidenceObligationInput {
	readonly obligation: EvidenceObligation;
	readonly evidence: readonly EvidenceUse[];
	readonly expectedSubject: EvidenceSubject;
	readonly expectedFreshnessBoundary?: string;
	readonly availableArtifactDigests?: readonly Sha256Digest[];
}

interface EvidenceObligationResolution {
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

interface AdmittedReduction {
	readonly obligation: EvidenceObligation;
	readonly uses: readonly EvidenceUse[];
	readonly expectedSubject: EvidenceSubject;
	readonly freshnessBoundary?: string;
	readonly availableArtifacts: ReadonlySet<string>;
	readonly inputEvidenceIds: readonly EvidenceId[];
	readonly duplicateEvidenceIds: readonly EvidenceId[];
}

interface ClassifiedEvidence {
	readonly eligibleEvidenceIds: EvidenceId[];
	readonly supportingEvidenceIds: EvidenceId[];
	readonly contradictoryEvidenceIds: EvidenceId[];
	readonly eligibleContradictoryCount: number;
	readonly neutralEvidenceIds: EvidenceId[];
	readonly excludedEvidence: EvidenceExclusion[];
	readonly potentiallyRelevant: boolean;
}

const idSchema = Type.String({
	minLength: 1,
	maxLength: 256,
	pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
});
const versionSchema = Type.String({
	minLength: 1,
	maxLength: 128,
	pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$",
});
const obligationSchema = Type.Object(
	{
		id: idSchema,
		version: versionSchema,
		kinds: Type.Array(
			Type.Union(EVIDENCE_KINDS.map((kind) => Type.Literal(kind))),
			{ minItems: 1, maxItems: EVIDENCE_KINDS.length },
		),
		producerKinds: Type.Array(
			Type.Union([
				Type.Literal("runtime"),
				Type.Literal("worker"),
				Type.Literal("model"),
				Type.Literal("user"),
				Type.Literal("external_service"),
			]),
			{ minItems: 1, maxItems: 5 },
		),
		authorities: Type.Array(
			Type.Union([
				Type.Literal("asserted"),
				Type.Literal("observed"),
				Type.Literal("verified"),
				Type.Literal("approved"),
			]),
			{ minItems: 1, maxItems: 4 },
		),
		coverages: Type.Array(
			Type.Union([
				Type.Literal("complete"),
				Type.Literal("partial"),
				Type.Literal("unknown"),
			]),
			{ minItems: 1, maxItems: 3 },
		),
		sensitivities: Type.Array(
			Type.Union([
				Type.Literal("public"),
				Type.Literal("project"),
				Type.Literal("private"),
			]),
			{ minItems: 1, maxItems: 3 },
		),
		minimumCount: Type.Integer({ minimum: 1, maximum: 256 }),
		subject: Type.Union([
			Type.Literal("change_revision"),
			Type.Literal("planning_revision"),
			Type.Literal("candidate"),
			Type.Literal("candidate_source_tree"),
			Type.Literal("candidate_acceptance_requirements"),
		]),
		freshness: Type.Union([
			Type.Literal("none"),
			Type.Literal("exact_boundary"),
		]),
		artifact: Type.Union([
			Type.Literal("optional"),
			Type.Literal("required"),
			Type.Literal("available"),
		]),
		contradiction: Type.Union([
			Type.Literal("retain"),
			Type.Literal("indeterminate"),
		]),
	},
	{ additionalProperties: false },
);

export function createEvidenceObligation(
	input: EvidenceObligation,
): EvidenceObligation {
	assertTypeboxSchema(obligationSchema, input, "Evidence obligation");
	return toCanonicalJsonValue({
		...input,
		kinds: sortedUnique(input.kinds, "Evidence obligation kind"),
		producerKinds: sortedUnique(
			input.producerKinds,
			"Evidence obligation producer kind",
		),
		authorities: sortedUnique(
			input.authorities,
			"Evidence obligation authority",
		),
		coverages: sortedUnique(
			input.coverages,
			"Evidence obligation coverage",
		),
		sensitivities: sortedUnique(
			input.sensitivities,
			"Evidence obligation sensitivity",
		),
	}) as unknown as EvidenceObligation;
}

export function reduceEvidenceObligation(
	input: ReduceEvidenceObligationInput,
): EvidenceObligationResolution {
	const admitted = admitReductionInput(input);
	const classified = classifyEvidence(admitted);
	const status = obligationStatus({
		obligation: admitted.obligation,
		supportingCount: classified.supportingEvidenceIds.length,
		duplicateCount: admitted.duplicateEvidenceIds.length,
		eligibleContradictionCount: classified.eligibleContradictoryCount,
		potentiallyRelevant: classified.potentiallyRelevant,
	});
	const withoutDigest = {
		obligationId: admitted.obligation.id,
		obligationVersion: admitted.obligation.version,
		obligationDigest: canonicalJsonDigest(admitted.obligation),
		status,
		inputEvidenceIds: admitted.inputEvidenceIds,
		eligibleEvidenceIds: classified.eligibleEvidenceIds,
		supportingEvidenceIds: classified.supportingEvidenceIds,
		contradictoryEvidenceIds: classified.contradictoryEvidenceIds,
		neutralEvidenceIds: classified.neutralEvidenceIds,
		excludedEvidence: classified.excludedEvidence,
		duplicateEvidenceIds: admitted.duplicateEvidenceIds,
		missingCount: Math.max(
			0,
			admitted.obligation.minimumCount - classified.supportingEvidenceIds.length,
		),
	};
	return toCanonicalJsonValue({
		...withoutDigest,
		resolutionDigest: canonicalJsonDigest(withoutDigest),
	}) as unknown as EvidenceObligationResolution;
}

function admitReductionInput(
	input: ReduceEvidenceObligationInput,
): AdmittedReduction {
	assertExactKeys(
		input,
		[
			"obligation",
			"evidence",
			"expectedSubject",
			"expectedFreshnessBoundary",
			"availableArtifactDigests",
		],
		"Evidence obligation reducer input",
	);
	const obligation = createEvidenceObligation(input.obligation);
	assertTypeboxSchema(
		evidenceSubjectSchema,
		input.expectedSubject,
		"Evidence obligation expected subject",
	);
	assertExpectedSubject(obligation.subject, input.expectedSubject);
	const uses = admittedEvidenceUses(input.evidence);
	return {
		obligation,
		uses,
		expectedSubject: input.expectedSubject,
		freshnessBoundary: expectedFreshnessBoundary(
			obligation,
			input.expectedFreshnessBoundary,
		),
		availableArtifacts: new Set(
			digests(input.availableArtifactDigests ?? [], "available artifact digest"),
		),
		inputEvidenceIds: sortedUniqueValues(
			uses.map((use) => use.evidence.evidenceId),
		),
		duplicateEvidenceIds: duplicateIds(uses),
	};
}

function classifyEvidence(input: AdmittedReduction): ClassifiedEvidence {
	const duplicated = new Set(input.duplicateEvidenceIds);
	const uniqueUses = input.uses.filter(
		(use) => !duplicated.has(use.evidence.evidenceId),
	);
	const excludedEvidence: EvidenceExclusion[] = [];
	const eligibleEvidenceIds: EvidenceId[] = [];
	const supportingEvidenceIds: EvidenceId[] = [];
	const eligibleContradictoryIds: EvidenceId[] = [];
	const neutralEvidenceIds: EvidenceId[] = [];
	let potentiallyRelevant = false;

	for (const use of uniqueUses) {
		const reasons = exclusionReasons(use.evidence, input);
		if (!reasons.includes("kind") && !reasons.includes("subject")) {
			potentiallyRelevant = true;
		}
		if (reasons.length > 0) {
			excludedEvidence.push({ evidenceId: use.evidence.evidenceId, reasons });
			continue;
		}
		eligibleEvidenceIds.push(use.evidence.evidenceId);
		if (use.relation === "supporting") {
			supportingEvidenceIds.push(use.evidence.evidenceId);
		} else if (use.relation === "contradictory") {
			eligibleContradictoryIds.push(use.evidence.evidenceId);
		} else {
			neutralEvidenceIds.push(use.evidence.evidenceId);
		}
	}
	return {
		eligibleEvidenceIds: sortedUniqueValues(eligibleEvidenceIds),
		supportingEvidenceIds: sortedUniqueValues(supportingEvidenceIds),
		contradictoryEvidenceIds: sortedUniqueValues(
			input.uses.flatMap((use) =>
				use.relation === "contradictory" ? [use.evidence.evidenceId] : [],
			),
		),
		eligibleContradictoryCount: eligibleContradictoryIds.length,
		neutralEvidenceIds: sortedUniqueValues(neutralEvidenceIds),
		excludedEvidence: excludedEvidence
			.sort((left, right) => compareText(left.evidenceId, right.evidenceId))
			.map((entry) => ({
				...entry,
				reasons: [...entry.reasons].sort(compareText),
			})),
		potentiallyRelevant,
	};
}

function admittedEvidenceUses(values: readonly EvidenceUse[]): EvidenceUse[] {
	if (!Array.isArray(values)) {
		throw new Error("Evidence obligation evidence must be an array.");
	}
	return values
		.map((use, index) => {
			assertExactKeys(use, ["evidence", "relation"], `Evidence use ${index}`);
			assertValidEvidenceRecord(use.evidence);
			if (
				use.relation !== "supporting" &&
				use.relation !== "contradictory" &&
				use.relation !== "neutral"
			) {
				throw new Error(`Evidence use ${index} relation is invalid.`);
			}
			return use;
		})
		.sort((left, right) => {
			const byId = compareText(
				left.evidence.evidenceId,
				right.evidence.evidenceId,
			);
			return byId || compareText(left.relation, right.relation);
		});
}

function exclusionReasons(
	evidence: EvidenceRecord,
	input: AdmittedReduction,
): EvidenceExclusionReason[] {
	const { obligation } = input;
	const reasons: EvidenceExclusionReason[] = [];
	if (!obligation.kinds.includes(evidence.kind)) reasons.push("kind");
	if (!obligation.producerKinds.includes(evidence.producer.kind)) {
		reasons.push("producer");
	}
	if (!obligation.authorities.includes(evidence.authority)) {
		reasons.push("authority");
	}
	if (!obligation.coverages.includes(evidence.coverage)) reasons.push("coverage");
	if (!obligation.sensitivities.includes(evidence.sensitivity)) {
		reasons.push("sensitivity");
	}
	if (
		!subjectMatches(obligation.subject, evidence.subject, input.expectedSubject)
	) {
		reasons.push("subject");
	}
	if (
		obligation.freshness === "exact_boundary" &&
		evidence.freshnessBoundary !== input.freshnessBoundary
	) {
		reasons.push("freshness");
	}
	const artifactDigests = evidenceArtifactDigests(evidence);
	if (obligation.artifact !== "optional" && artifactDigests.length === 0) {
		reasons.push("artifact_missing");
	} else if (
		obligation.artifact === "available" &&
		artifactDigests.some((digest) => !input.availableArtifacts.has(digest))
	) {
		reasons.push("artifact_unavailable");
	}
	return reasons;
}

function subjectMatches(
	binding: EvidenceSubjectBinding,
	actual: EvidenceSubject,
	expected: EvidenceSubject,
): boolean {
	switch (binding) {
		case "change_revision":
			return (
			equalTextSets(actual.changeRefs, expected.changeRefs) &&
			equalTextSets(
				actual.changeRevisionDigests,
				expected.changeRevisionDigests,
			)
		);
		case "planning_revision":
			return actual.planningRevisionDigest === expected.planningRevisionDigest;
		case "candidate":
			return actual.candidateDigest === expected.candidateDigest;
		case "candidate_source_tree":
			return (
				actual.candidateDigest === expected.candidateDigest &&
				actual.sourceTreeDigest === expected.sourceTreeDigest
			);
		case "candidate_acceptance_requirements":
			return (
				actual.candidateDigest === expected.candidateDigest &&
				equalTextSets(
					actual.acceptanceRequirementIds,
					expected.acceptanceRequirementIds,
				)
			);
		default:
			return false;
	}
}

function assertExpectedSubject(
	binding: EvidenceSubjectBinding,
	subject: EvidenceSubject,
): void {
	if (
		(binding === "candidate" ||
			binding === "candidate_source_tree" ||
			binding === "candidate_acceptance_requirements") &&
		!subject.candidateDigest
	) {
		throw new Error(`Evidence obligation subject ${binding} requires candidateDigest.`);
	}
	if (binding === "candidate_source_tree" && !subject.sourceTreeDigest) {
		throw new Error(
			"Evidence obligation subject candidate_source_tree requires sourceTreeDigest.",
		);
	}
	if (binding === "planning_revision" && !subject.planningRevisionDigest) {
		throw new Error(
			"Evidence obligation subject planning_revision requires planningRevisionDigest.",
		);
	}
	if (
		binding === "candidate_acceptance_requirements" &&
		subject.acceptanceRequirementIds.length === 0
	) {
		throw new Error(
			"Evidence obligation subject candidate_acceptance_requirements requires acceptanceRequirementIds.",
		);
	}
}

function expectedFreshnessBoundary(
	obligation: EvidenceObligation,
	value: string | undefined,
): string | undefined {
	if (obligation.freshness === "none") {
		if (value !== undefined) {
			throw new Error(
				`Evidence obligation ${obligation.id} does not accept expectedFreshnessBoundary.`,
			);
		}
		return undefined;
	}
	if (!value?.trim()) {
		throw new Error(
			`Evidence obligation ${obligation.id} requires expectedFreshnessBoundary.`,
		);
	}
	return value;
}

function evidenceArtifactDigests(evidence: EvidenceRecord): Sha256Digest[] {
	const values: Sha256Digest[] = [];
	if (evidence.artifact) values.push(evidence.artifact.digest);
	switch (evidence.kind) {
		case "ui_capture":
			values.push(...evidence.payload.captures.map((capture) => capture.digest));
			break;
		case "approval_receipt":
			values.push(...evidence.payload.captureDigests);
			break;
		case "delivery_attestation":
			if (evidence.payload.artifactDigest) {
				values.push(evidence.payload.artifactDigest);
			}
			break;
		default:
			break;
	}
	return sortedUniqueValues(values);
}

function obligationStatus(input: {
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

function duplicateIds(uses: readonly EvidenceUse[]): EvidenceId[] {
	const counts = new Map<EvidenceId, number>();
	for (const use of uses) {
		counts.set(
			use.evidence.evidenceId,
			(counts.get(use.evidence.evidenceId) ?? 0) + 1,
		);
	}
	return [...counts.entries()]
		.flatMap(([id, count]) => (count > 1 ? [id] : []))
		.sort(compareText);
}

function digests(values: readonly string[], label: string): Sha256Digest[] {
	const normalized = sortedUnique(values, label);
	return normalized.map((value) => assertSha256Digest(value, label));
}

function sortedUnique<T extends string>(
	values: readonly T[],
	label: string,
): T[] {
	const normalized = values.map((value) => value.trim());
	if (normalized.some((value) => !value)) {
		throw new Error(`${label} cannot be blank.`);
	}
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${label} values must be unique.`);
	}
	return normalized.sort(compareText) as T[];
}

function sortedUniqueValues<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort(compareText);
}

function equalTextSets(left: readonly string[], right: readonly string[]): boolean {
	const normalizedLeft = sortedUniqueValues(left);
	const normalizedRight = sortedUniqueValues(right);
	return (
		normalizedLeft.length === normalizedRight.length &&
		normalizedLeft.every((value, index) => value === normalizedRight[index])
	);
}

function assertExactKeys(
	value: unknown,
	allowed: readonly string[],
	label: string,
): void {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const allowedKeys = new Set(allowed);
	const extras: string[] = [];
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !allowedKeys.has(key)) {
			extras.push(String(key));
		}
	}
	extras.sort(compareText);
	if (extras.length > 0) {
		throw new Error(`${label} received unsupported fields: ${extras.join(", ")}.`);
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
