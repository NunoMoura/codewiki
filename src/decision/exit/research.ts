import type {DecisionCandidate} from "./candidate.ts";
import type {
	EvidenceArtifact,
	EvidenceCoverage,
	EvidenceProducer,
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
	ResearchCitationPayload,
} from "../../evidence/contracts.ts";
import { EVIDENCE_SCHEMA_VERSION } from "../../evidence/contracts.ts";
import { materializeEvidenceRecord } from "../../evidence/materialize.ts";
import { reduceEvidenceObligation } from "../../evidence/obligations.ts";
import type { CheckCatalog } from "../../verification/catalog.ts";
import type {
	CheckResult,
	ResolvedExitPolicy,
} from "../../verification/contracts.ts";
import { createCheckResult } from "../../verification/results.ts";
import { assertExactKeys } from "../../utils/json.ts";

const RESEARCH_PROVENANCE_CHECK_ID = "research_provenance_valid";

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

interface DecisionResearchProvenanceInput {
	readonly policy: ResolvedExitPolicy;
	readonly evidence: readonly EvidenceRecord[];
	readonly expectedSubject: EvidenceSubject;
	readonly expectedFreshnessBoundary: string;
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
			...(material.artifact ? { artifact: material.artifact } : {}),
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

export function createDecisionResearchProvenanceExecutor(
	catalog: CheckCatalog,
): (input: DecisionResearchProvenanceInput) => CheckResult {
	const registration = catalog.get(RESEARCH_PROVENANCE_CHECK_ID, "decision");
	if (
		registration?.authority !== "kernel" ||
		registration.check.execution.kind !== "code" ||
		!registration.check.protected
	) {
		throw new Error(
			"Decision research provenance executor requires the protected kernel Check.",
		);
	}
	const check = registration.check;
	const obligation = check.evidenceObligations.find(
		(candidate) => candidate.id === "research-citations",
	);
	if (!obligation || check.evidenceObligations.length !== 1) {
		throw new Error(
			"Decision research provenance Check must declare exactly one research-citations obligation.",
		);
	}

	return (input) => {
		assertExactKeys(
			input,
			[
				"policy",
				"evidence",
				"expectedSubject",
				"expectedFreshnessBoundary",
			],
			"Decision research provenance input",
		);
		if (input.policy.loop !== "decision") {
			throw new Error(
				"Decision research provenance executor requires a Decision policy.",
			);
		}
		assertDecisionResearchSubject(input.expectedSubject);
		const resolution = reduceEvidenceObligation({
			obligation,
			evidence: input.evidence.map((evidence) => ({
				evidence,
				relation: "supporting" as const,
			})),
			expectedSubject: input.expectedSubject,
			expectedFreshnessBoundary: input.expectedFreshnessBoundary,
		});
		if (resolution.status !== "ready") {
			return createCheckResult({
				loop: "decision",
				policy: input.policy,
				check,
				disposition: "indeterminate",
				evidenceResolutions: [resolution],
				findings: [obligationGapFinding(resolution)],
				issueClass: "research_evidence",
				execution: check.execution,
			});
		}

		const byId = new Map(input.evidence.map((evidence) => [evidence.evidenceId, evidence]));
		const findings = resolution.eligibleEvidenceIds.flatMap((evidenceId) => {
			const evidence = byId.get(evidenceId);
			if (!evidence || evidence.kind !== "research_citation") return [];
			const publicationDate = evidence.payload.publicationDate;
			return publicationDate !== undefined &&
				publicationDate > evidence.observedAt.slice(0, 10)
				? [
						`Research citation ${evidenceId} publicationDate ${publicationDate} follows observation ${evidence.observedAt}.`,
					]
				: [];
		});
		return createCheckResult({
			loop: "decision",
			policy: input.policy,
			check,
			disposition: findings.length === 0 ? "satisfied" : "unsatisfied",
			measurement: { shape: "boolean", value: findings.length === 0 },
			evidenceResolutions: [resolution],
			findings,
			...(findings.length > 0
				? { issueClass: "research_provenance" }
				: {}),
			execution: check.execution,
		});
	};
}

export function assertDecisionResearchSubject(subject: EvidenceSubject): void {
	assertExactKeys(
		subject,
		["changeRefs", "changeRevisionDigests", "acceptanceRequirementIds"],
		"Decision research Evidence subject",
	);
	if (
		subject.changeRefs?.length !== 1 ||
		subject.changeRevisionDigests?.length !== 1 ||
		subject.acceptanceRequirementIds?.length !== 0
	) {
		throw new Error(
			"Decision research Evidence subject must bind exactly one Change revision and no acceptance requirements.",
		);
	}
}

function obligationGapFinding(resolution: {
	readonly status: "missing" | "indeterminate" | "ready";
	readonly missingCount: number;
	readonly excludedEvidence: readonly {
		readonly reasons: readonly string[];
	}[];
	readonly duplicateEvidenceIds: readonly string[];
}): string {
	const reasons = [
		...new Set(
			resolution.excludedEvidence.flatMap((evidence) => evidence.reasons),
		),
	].sort((left, right) => left.localeCompare(right));
	return [
		`Decision research evidence is ${resolution.status}`,
		`missing=${resolution.missingCount}`,
		`duplicates=${resolution.duplicateEvidenceIds.length}`,
		`exclusions=${reasons.length > 0 ? reasons.join(",") : "none"}`,
	].join("; ");
}
