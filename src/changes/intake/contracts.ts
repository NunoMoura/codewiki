import type {Sha256Digest} from "../../utils/canonical-json.ts";
import {
	CHANGE_DEFECT_CATEGORIES,
	CHANGE_DEFECT_CONFIDENCES,
	CHANGE_DEFECT_SEVERITIES,
	type ChangeSecurityProfile,
} from "../defect-profile.ts";

export const CHANGE_INTAKE_MATERIAL_PROTOCOL = Object.freeze({
	id: "codewiki.change-intake-material",
	version: "1.1.0",
	maxCanonicalBytes: 16_384,
	maxAffectedRefs: 16,
	maxSourceRefs: 16,
	maxTopicRefs: 8,
} as const);

export const CHANGE_INTAKE_MATERIAL_TYPES = [
	"user_suggestion",
	"pull_request_finding",
	"worker_discovery",
	"regression_finding",
	"security_scanner_finding",
	"delivery_observation",
	"outcome_finding",
	"knowledge_drift",
] as const;

export const CHANGE_INTAKE_CLAIMED_CATEGORIES = CHANGE_DEFECT_CATEGORIES;
export const CHANGE_INTAKE_CLAIMED_SEVERITIES = CHANGE_DEFECT_SEVERITIES;
export const CHANGE_INTAKE_CLAIMED_CONFIDENCES = CHANGE_DEFECT_CONFIDENCES;

export type ChangeIntakeMaterialType =
	(typeof CHANGE_INTAKE_MATERIAL_TYPES)[number];
export type ChangeIntakeClaimedCategory =
	(typeof CHANGE_INTAKE_CLAIMED_CATEGORIES)[number];
export type ChangeIntakeClaimedSeverity =
	(typeof CHANGE_INTAKE_CLAIMED_SEVERITIES)[number];
export type ChangeIntakeClaimedConfidence =
	(typeof CHANGE_INTAKE_CLAIMED_CONFIDENCES)[number];
export type GitObjectId = string;

export interface ChangeIntakeContent {
	readonly summary: string;
	readonly observedBehavior: string;
	readonly desiredBehavior?: string;
	readonly affectedRefs: readonly string[];
	readonly sourceRefs: readonly string[];
	readonly reproduction?: string;
	readonly claimedCategory?: ChangeIntakeClaimedCategory;
	readonly claimedSeverity?: ChangeIntakeClaimedSeverity;
	readonly claimedConfidence?: ChangeIntakeClaimedConfidence;
	readonly claimedSecurity?: ChangeSecurityProfile;
}

interface ChangeIntakeMaterialBase<TType extends ChangeIntakeMaterialType> {
	readonly protocolId: typeof CHANGE_INTAKE_MATERIAL_PROTOCOL.id;
	readonly protocolVersion: typeof CHANGE_INTAKE_MATERIAL_PROTOCOL.version;
	readonly materialType: TType;
	readonly content: ChangeIntakeContent;
}

export interface UserSuggestionBinding {
	readonly channel: "api" | "cli" | "dashboard" | "pi";
	readonly submissionId: string;
}

export interface UserSuggestionMaterial
	extends ChangeIntakeMaterialBase<"user_suggestion"> {
	readonly binding: UserSuggestionBinding;
}

export interface PullRequestFindingBinding {
	readonly providerId: string;
	readonly repositoryId: string;
	readonly pullRequestId: string;
	readonly headCommit: GitObjectId;
	readonly eventId: string;
	readonly findingId: string;
}

export interface PullRequestFindingMaterial
	extends ChangeIntakeMaterialBase<"pull_request_finding"> {
	readonly binding: PullRequestFindingBinding;
}

export interface WorkerDiscoveryBinding {
	readonly workerReportId: string;
	readonly assignmentOperationId: Sha256Digest;
	readonly workItemClaimOperationId: Sha256Digest;
	readonly baseTree: GitObjectId;
	readonly resultTree: GitObjectId;
}

export interface WorkerDiscoveryMaterial
	extends ChangeIntakeMaterialBase<"worker_discovery"> {
	readonly binding: WorkerDiscoveryBinding;
}

export interface RegressionFindingBinding {
	readonly runId: string;
	readonly traceOperationId: Sha256Digest;
	readonly baseTree: GitObjectId;
	readonly resultTree: GitObjectId;
	readonly findingId: string;
}

export interface RegressionFindingMaterial
	extends ChangeIntakeMaterialBase<"regression_finding"> {
	readonly binding: RegressionFindingBinding;
}

export interface SecurityScannerFindingBinding {
	readonly scannerId: string;
	readonly scannerVersion: string;
	readonly runId: string;
	readonly tree: GitObjectId;
	readonly findingId: string;
}

export interface SecurityScannerFindingMaterial
	extends ChangeIntakeMaterialBase<"security_scanner_finding"> {
	readonly binding: SecurityScannerFindingBinding;
}

export interface DeliveryObservationBinding {
	readonly observationId: string;
	readonly deliveryId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly artifactDigest: Sha256Digest;
	readonly environmentId: string;
}

export interface DeliveryObservationMaterial
	extends ChangeIntakeMaterialBase<"delivery_observation"> {
	readonly binding: DeliveryObservationBinding;
}

export interface OutcomeFindingBinding {
	readonly observationId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly subjectRef: string;
	readonly sourceEvidenceDigest: Sha256Digest;
}

export interface OutcomeFindingMaterial
	extends ChangeIntakeMaterialBase<"outcome_finding"> {
	readonly binding: OutcomeFindingBinding;
}

export interface KnowledgeDriftBinding {
	readonly observationId: string;
	readonly previousSnapshotDigest: Sha256Digest;
	readonly currentSnapshotDigest: Sha256Digest;
	readonly topicRefs: readonly string[];
}

export interface KnowledgeDriftMaterial
	extends ChangeIntakeMaterialBase<"knowledge_drift"> {
	readonly binding: KnowledgeDriftBinding;
}

export type ChangeIntakeMaterial =
	| UserSuggestionMaterial
	| PullRequestFindingMaterial
	| WorkerDiscoveryMaterial
	| RegressionFindingMaterial
	| SecurityScannerFindingMaterial
	| DeliveryObservationMaterial
	| OutcomeFindingMaterial
	| KnowledgeDriftMaterial;
