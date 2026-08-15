import type {
	EvidenceArtifact,
	EvidenceCoverage,
	EvidenceProducer,
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
	ResearchCitationPayload,
} from "../../evidence/contracts.ts";
import {EVIDENCE_SCHEMA_VERSION} from "../../evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../evidence/materialize.ts";
import {assertExactKeys} from "../../utils/json.ts";
import type {DecisionCandidate} from "./candidate.ts";

export interface DecisionResearchCitationMaterial {
	readonly artifact?: EvidenceArtifact;
	readonly provenanceRefs: readonly string[];
	readonly payload: ResearchCitationPayload;
}

export interface DecisionResearchCollectionPortInput {
	readonly candidate: DecisionCandidate;
	readonly subject: EvidenceSubject;
	readonly sensitivity: EvidenceSensitivity;
	readonly signal: AbortSignal;
}

export interface DecisionResearchCollectionPortResult {
	readonly freshnessBoundary: string;
	readonly evidenceRecords: readonly EvidenceRecord<"research_citation">[];
}

export type DecisionResearchCollectionPort = (
	input: DecisionResearchCollectionPortInput,
) => Promise<DecisionResearchCollectionPortResult>;

interface DecisionResearchObservationContext {
	readonly subject: EvidenceSubject;
	readonly observedAt: string;
	readonly producer: EvidenceProducer;
	readonly coverage: EvidenceCoverage;
	readonly sensitivity: EvidenceSensitivity;
	readonly freshnessBoundary: string;
}

export function materializeDecisionResearchCitation(
	material: DecisionResearchCitationMaterial,
	context: DecisionResearchObservationContext,
): EvidenceRecord<"research_citation"> {
	assertExactKeys(
		material,
		["artifact", "provenanceRefs", "payload"],
		"Decision research citation material",
	);
	assertExactKeys(
		context,
		[
			"subject",
			"observedAt",
			"producer",
			"coverage",
			"sensitivity",
			"freshnessBoundary",
		],
		"Decision research observation context",
	);
	assertDecisionResearchSubject(context.subject);
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "research_citation",
			...(material.artifact ? {artifact: material.artifact} : {}),
			provenanceRefs: material.provenanceRefs,
			payload: material.payload,
		},
		{
			subject: context.subject,
			observedAt: context.observedAt,
			producer: context.producer,
			authority: "observed",
			coverage: context.coverage,
			freshnessBoundary: context.freshnessBoundary,
			sensitivity: context.sensitivity,
		},
	);
}

export function assertDecisionResearchSubject(subject: EvidenceSubject): void {
	assertExactKeys(
		subject,
		[
			"changeRefs",
			"changeRevisionDigests",
			"candidateDigest",
			"acceptanceRequirementIds",
		],
		"Decision research Evidence subject",
	);
	if (
		subject.changeRefs?.length !== 1 ||
		subject.changeRevisionDigests?.length !== 1 ||
		!subject.candidateDigest
	) {
		throw new Error(
			"Decision research Evidence subject must bind one Change revision and Candidate.",
		);
	}
}
