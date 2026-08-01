import type {AlignmentGraphProvenanceClass} from "../../change-trace/alignment-graph.ts";
import type {EvidenceAuthority} from "../../evidence/contracts.ts";
import type {Sha256Digest} from "../../utils/canonical-json.ts";
import type {ChangeIntakeMaterialType} from "../intake/contracts.ts";
import type {
	ChangeDefectCategory,
	ChangeDefectConfidence,
	ChangeDefectRegressionStatus,
	ChangeDefectSeverity,
} from "../defect-profile.ts";

export const BACKLOG_TRIAGE_PROJECTION_PROTOCOL = Object.freeze({
	id: "codewiki.backlog-triage-projection",
	version: "1.0.0",
	maxCandidates: 500,
	freshDays: 7,
	staleDays: 30,
} as const);

export const BACKLOG_TRIAGE_QUERY_PROTOCOL = Object.freeze({
	id: "codewiki.backlog-triage-query",
	version: "1.0.0",
	maxResults: 100,
} as const);

export const TRIAGE_LEVELS = Object.freeze([
	"unknown",
	"low",
	"moderate",
	"high",
	"critical",
] as const);
export type TriageLevel = (typeof TRIAGE_LEVELS)[number];

export const TRIAGE_EFFORTS = Object.freeze([
	"unknown",
	"tiny",
	"small",
	"medium",
	"large",
	"extra_large",
] as const);
export type TriageEffort = (typeof TRIAGE_EFFORTS)[number];

export const TRIAGE_REVERSIBILITY = Object.freeze([
	"unknown",
	"easy",
	"moderate",
	"difficult",
	"irreversible",
] as const);
export type TriageReversibility = (typeof TRIAGE_REVERSIBILITY)[number];

export const TRIAGE_CONFIDENCE = Object.freeze([
	"unknown",
	"low",
	"medium",
	"high",
] as const);
export type TriageConfidence = (typeof TRIAGE_CONFIDENCE)[number];

export type TriageAnalysisClass = Extract<
	AlignmentGraphProvenanceClass,
	"deterministic_analysis" | "inferred_analysis"
>;

export interface TriageDimensionBasis {
	readonly authority: EvidenceAuthority | "none";
	readonly analysisClass: TriageAnalysisClass;
	readonly inputProvenanceClasses: readonly AlignmentGraphProvenanceClass[];
	readonly canonicalRefs: readonly string[];
	readonly observedRefs: readonly string[];
	readonly evidenceRefs: readonly string[];
	readonly analysisRefs: readonly string[];
	readonly assumptions: readonly string[];
}

export interface TriageSupportedValue<T> {
	readonly value: T;
	readonly basis: TriageDimensionBasis;
}

export interface TriageDimensions {
	readonly urgency: TriageSupportedValue<TriageLevel>;
	readonly expectedImpact: TriageSupportedValue<TriageLevel>;
	readonly effort: TriageSupportedValue<TriageEffort>;
	readonly riskOfInaction: TriageSupportedValue<TriageLevel>;
	readonly implementationRisk: TriageSupportedValue<TriageLevel>;
	readonly reversibility: TriageSupportedValue<TriageReversibility>;
	readonly confidence: TriageSupportedValue<TriageConfidence>;
	readonly workUnblocked: TriageSupportedValue<number | "unknown">;
	readonly protectedEscalation: TriageSupportedValue<boolean | "unknown">;
}

export interface TriageEstimateInput {
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly workStateDigest: Sha256Digest;
	readonly graphSnapshotDigest: Sha256Digest;
	readonly graphContentDigest: Sha256Digest;
	readonly dimensions: Partial<{
		readonly urgency: TriageSupportedValue<Exclude<TriageLevel, "unknown">>;
		readonly expectedImpact: TriageSupportedValue<Exclude<TriageLevel, "unknown">>;
		readonly effort: TriageSupportedValue<Exclude<TriageEffort, "unknown">>;
		readonly riskOfInaction: TriageSupportedValue<Exclude<TriageLevel, "unknown">>;
		readonly implementationRisk: TriageSupportedValue<Exclude<TriageLevel, "unknown">>;
		readonly reversibility: TriageSupportedValue<Exclude<TriageReversibility, "unknown">>;
		readonly confidence: TriageSupportedValue<Exclude<TriageConfidence, "unknown">>;
		readonly workUnblocked: TriageSupportedValue<number>;
		readonly protectedEscalation: TriageSupportedValue<boolean>;
	}>;
}

export interface NormalizedTriageEstimate extends TriageEstimateInput {
	readonly estimateDigest: Sha256Digest;
}

export type TriageCandidateStatus =
	| "pending"
	| "deferred"
	| "needs_repair"
	| "escalated"
	| "route_back";

export type DecisionReadiness =
	| "ready"
	| "needs_information"
	| "suspected_duplicate"
	| "suspected_conflict"
	| "sensitive";

export interface TriageDecisionReadiness {
	readonly value: DecisionReadiness;
	readonly reasonCodes: readonly string[];
	readonly missingInformation: readonly string[];
	readonly basis: TriageDimensionBasis;
}

export type TriageOverlapStatus = "unknown" | "possible" | "confirmed";

export interface TriageOverlap {
	readonly status: TriageOverlapStatus;
	readonly changeIds: readonly string[];
	readonly sharedRefs: readonly string[];
	readonly basis: TriageDimensionBasis;
}

export type TriageFreshness = "fresh" | "aging" | "stale";

export interface TriageFreshnessProjection {
	readonly status: TriageFreshness;
	readonly ageDays: number;
	readonly lastObservedAt: string;
	readonly basis: TriageDimensionBasis;
}

export type TriageFairnessBand =
	| "new"
	| "established"
	| "aging"
	| "long_waiting";

export interface TriageFairness {
	readonly band: TriageFairnessBand;
	readonly ageDays: number;
	readonly ageBoostApplied: boolean;
}

export interface TriageFrontier {
	readonly eligible: boolean;
	readonly member: boolean;
	readonly dimensions: readonly ["expected_impact", "effort"];
	readonly reasonCode: string;
}

export interface TriageOrderingReason {
	readonly code: string;
	readonly detail: string;
	readonly refs: readonly string[];
}

export interface TriageDefaultOrdering {
	readonly tier: 1 | 2 | 3 | 4 | 5 | 6;
	readonly reasons: readonly TriageOrderingReason[];
}

export interface TriageDefectSummary {
	readonly profileId: Sha256Digest;
	readonly category: ChangeDefectCategory;
	readonly severity: ChangeDefectSeverity;
	readonly confidence: ChangeDefectConfidence;
	readonly regressionStatus: ChangeDefectRegressionStatus;
	readonly securityClassifications: readonly string[];
	readonly provenanceAuthority: EvidenceAuthority;
}

export interface TriageAffectedScope {
	readonly knowledgeRefs: readonly string[];
	readonly sourceRefs: readonly string[];
	readonly components: readonly string[];
	readonly users: readonly string[];
	readonly owners: readonly string[];
	readonly usersKnown: boolean;
	readonly ownersKnown: boolean;
}

export interface BacklogTriageCandidate {
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly title: string;
	readonly summary: string;
	readonly desiredOutcome: string;
	readonly decisionQuestion: string;
	readonly status: TriageCandidateStatus;
	readonly declaredChangeRisk: TriageLevel;
	readonly sourceKinds: readonly ChangeIntakeMaterialType[];
	readonly sourceProvenanceRefs: readonly string[];
	readonly sourceCorroborationCount: number;
	readonly affectedScope: TriageAffectedScope;
	readonly defect: TriageDefectSummary | null;
	readonly securitySensitivity: "unknown" | "sensitive";
	readonly readiness: TriageDecisionReadiness;
	readonly dimensions: TriageDimensions;
	readonly overlap: TriageOverlap;
	readonly freshness: TriageFreshnessProjection;
	readonly blocksActiveWork: boolean;
	readonly escapedRegression: boolean;
	readonly frontier: TriageFrontier;
	readonly fairness: TriageFairness;
	readonly defaultOrdering: TriageDefaultOrdering;
	readonly candidateDigest: Sha256Digest;
}

export interface BacklogTriageProjectionBinding {
	readonly remoteStateHead: string;
	readonly sourceHead: string;
	readonly knowledgeDigest: Sha256Digest;
	readonly configDigest: Sha256Digest;
	readonly policyDigest: Sha256Digest;
	readonly workStateDigest: Sha256Digest;
	readonly graphSnapshotDigest: Sha256Digest;
	readonly graphContentDigest: Sha256Digest;
}

export interface BacklogTriageProjectionCoverage {
	readonly totalChangeCount: number;
	readonly eligibleChangeCount: number;
	readonly projectedCandidateCount: number;
	readonly estimateCount: number;
	readonly unknownDimensionCount: number;
	readonly graphFactCount: number;
	readonly knowledgeConceptCount: number;
	readonly sourceOwnershipCount: number;
	readonly truncated: boolean;
}

export interface BacklogTriageProjection {
	readonly protocol: typeof BACKLOG_TRIAGE_PROJECTION_PROTOCOL;
	readonly asOf: string;
	readonly binding: BacklogTriageProjectionBinding;
	readonly candidates: readonly BacklogTriageCandidate[];
	readonly coverage: BacklogTriageProjectionCoverage;
	readonly projectionDigest: Sha256Digest;
}

export const TRIAGE_ORDERINGS = Object.freeze([
	"default",
	"urgency",
	"risk_of_inaction",
	"expected_impact",
	"effort",
	"decision_readiness",
	"confidence",
	"work_unblocked",
	"newest",
	"oldest",
] as const);
export type TriageOrdering = (typeof TRIAGE_ORDERINGS)[number];

export interface BacklogTriageQueryFilters {
	readonly changeIds?: readonly string[];
	readonly statuses?: readonly TriageCandidateStatus[];
	readonly sourceKinds?: readonly ChangeIntakeMaterialType[];
	readonly readiness?: readonly DecisionReadiness[];
	readonly knowledgeRefs?: readonly string[];
	readonly components?: readonly string[];
	readonly categories?: readonly ChangeDefectCategory[];
	readonly severities?: readonly ChangeDefectSeverity[];
	readonly securitySensitivity?: readonly ("unknown" | "sensitive")[];
	readonly regressionStatuses?: readonly ChangeDefectRegressionStatus[];
	readonly urgency?: readonly TriageLevel[];
	readonly riskOfInaction?: readonly TriageLevel[];
	readonly efforts?: readonly TriageEffort[];
	readonly impacts?: readonly TriageLevel[];
	readonly confidence?: readonly TriageConfidence[];
	readonly overlap?: readonly TriageOverlapStatus[];
	readonly freshness?: readonly TriageFreshness[];
	readonly blocksActiveWork?: boolean;
	readonly frontier?: boolean;
	readonly minimumAgeDays?: number;
	readonly maximumAgeDays?: number;
}

export interface BacklogTriageQueryRequest {
	readonly protocol: typeof BACKLOG_TRIAGE_QUERY_PROTOCOL;
	readonly projectionDigest: Sha256Digest;
	readonly filters?: BacklogTriageQueryFilters;
	readonly orderBy?: TriageOrdering;
	readonly limit?: number;
}

export interface BacklogTriageQueryItem {
	readonly rank: number;
	readonly candidate: BacklogTriageCandidate;
	readonly orderingReasons: readonly TriageOrderingReason[];
}

export interface BacklogTriageQueryCoverage {
	readonly projectedCandidateCount: number;
	readonly matchedCandidateCount: number;
	readonly returnedCandidateCount: number;
	readonly truncated: boolean;
}

export interface BacklogTriageQueryResult {
	readonly protocol: typeof BACKLOG_TRIAGE_QUERY_PROTOCOL;
	readonly projectionDigest: Sha256Digest;
	readonly workStateDigest: Sha256Digest;
	readonly graphSnapshotDigest: Sha256Digest;
	readonly graphContentDigest: Sha256Digest;
	readonly orderBy: TriageOrdering;
	readonly queryDigest: Sha256Digest;
	readonly items: readonly BacklogTriageQueryItem[];
	readonly coverage: BacklogTriageQueryCoverage;
	readonly resultDigest: Sha256Digest;
}
