import { Type, type Static, type TSchema } from "typebox";
import type {
	CanonicalJsonValue,
	Sha256Digest,
} from "../utils/canonical-json.ts";
import type { SemanticLoop } from "../semantic-loop.ts";
import {
	changeDefectProfileSchema,
	type ChangeDefectProfile,
} from "../changes/defect-profile.ts";

export const CHANGE_TRACE_PROTOCOL = Object.freeze({
	id: "codewiki.change-trace",
	version: "1.2.0",
	canonicalJson: "codewiki.canonical-json/1.0.0",
} as const);

export const PLANNING_EPOCH_PROTOCOL = Object.freeze({
	id: "codewiki.planning-epoch",
	version: "1.0.0",
	canonicalJson: "codewiki.canonical-json/1.0.0",
} as const);

export const STATE_COMMIT_MANIFEST_PROTOCOL = Object.freeze({
	id: "codewiki.state-commit-manifest",
	version: "1.0.0",
	canonicalJson: "codewiki.canonical-json/1.0.0",
} as const);

export const ARCHIVE_MANIFEST_PROTOCOL = Object.freeze({
	id: "codewiki.archive-manifest",
	version: "1.0.0",
	canonicalJson: "codewiki.canonical-json/1.0.0",
} as const);

export const CHANGE_OPERATION_KINDS = [
	"trace.opened",
	"trace.closed",
	"trace.reopened",
	"change.proposed",
	"change.revised",
	"change.relationship_recorded",
	"change.relationship_superseded",
	"change.merge_recorded",
	"change.split_recorded",
	"change.withdrawal_recorded",
	"change.feedback_recorded",
	"change_claim.acquired",
	"change_claim.released",
	"change_claim.takeover_recorded",
	"loop.attempt_started",
	"loop.attempt_ended",
	"decision.candidate_recorded",
	"planning.candidate_recorded",
	"implementation.candidate_recorded",
	"loop.exit_policy_recorded",
	"evidence.recorded",
	"check.result_recorded",
	"loop.exit_report_recorded",
	"runtime.route_recorded",
	"planning.epoch_bound",
	"work_item_claim.acquired",
	"work_item_claim.released",
	"work_item_claim.takeover_recorded",
	"assignment.dispatched",
	"assignment.cancel_requested",
	"assignment.terminal_recorded",
	"worker.report_recorded",
	"integration.attempt_started",
	"integration.result_recorded",
	"source.branch_merge_recorded",
	"source.branch_push_recorded",
	"review_projection.published",
	"product.publication_recorded",
	"product.release_recorded",
	"delivery.observation_recorded",
	"outcome.observation_recorded",
] as const;

export const PROJECT_OPERATION_KINDS = ["planning.epoch_recorded"] as const;
export type ChangeOperationKind = (typeof CHANGE_OPERATION_KINDS)[number];
export type ProjectOperationKind = (typeof PROJECT_OPERATION_KINDS)[number];
export type ChangeTraceOperationKind = ChangeOperationKind | ProjectOperationKind;

const planningEpochBindingIndex = CHANGE_OPERATION_KINDS.indexOf(
	"planning.epoch_bound",
);
export const CHANGE_TRACE_OPERATION_CATALOG: readonly ChangeTraceOperationKind[] =
	Object.freeze([
		...CHANGE_OPERATION_KINDS.slice(0, planningEpochBindingIndex),
		...PROJECT_OPERATION_KINDS,
		...CHANGE_OPERATION_KINDS.slice(planningEpochBindingIndex),
	]);
export type OperationId = Sha256Digest;
export type PlanningEpochId = Sha256Digest;
export type StateCommitManifestId = Sha256Digest;
export type ArchiveManifestId = Sha256Digest;
export type ChangeRevisionId = Sha256Digest;
export type GitObjectId = string;
export type AuthorityCapability =
	| "trace.lifecycle"
	| "change.intent"
	| "change.relationship"
	| "change.feedback"
	| "change_claim.manage"
	| "loop.record"
	| "planning.bind"
	| "work_item_claim.manage"
	| "assignment.manage"
	| "integration.record"
	| "source.effect"
	| "review.publish"
	| "product.effect"
	| "outcome.observe";

export interface BaseSnapshot {
	readonly remoteStateHead: GitObjectId | null;
	readonly sourceHead: GitObjectId;
	readonly knowledgeDigest: Sha256Digest;
	readonly configDigest: Sha256Digest;
	readonly policyDigest: Sha256Digest;
}

export interface AuthorityBinding {
	readonly actorId: string;
	readonly principalRef: string;
	readonly role: string;
	readonly actorPolicyDigest: Sha256Digest;
	readonly authenticationEvidenceId?: string;
	readonly runtimeProtocolDigest: Sha256Digest;
}

export interface ChangeRequirement {
	readonly id: string;
	readonly statement: string;
}

export interface ChangeRevisionContent {
	readonly title: string;
	readonly summary: string;
	readonly desiredOutcome: string;
	readonly acceptanceRequirements: readonly ChangeRequirement[];
	readonly constraints: readonly string[];
	readonly nonGoals: readonly string[];
	readonly knowledgeRefs: readonly string[];
	readonly sourceRefs: readonly string[];
	readonly defectProfile?: ChangeDefectProfile;
	readonly risk: "unknown" | "low" | "moderate" | "high" | "critical";
}

export interface ChangeRevision {
	readonly revisionId: ChangeRevisionId;
	readonly content: ChangeRevisionContent;
}

export interface ChangeBinding {
	readonly changeId: string;
	readonly revisionId: ChangeRevisionId;
	readonly tailOperationId: OperationId;
}

const requiredTextSchema = Type.String({
	minLength: 1,
	maxLength: 16_384,
	pattern: "\\S",
});
const shortTextSchema = Type.String({
	minLength: 1,
	maxLength: 512,
	pattern: "\\S",
});
const idSchema = Type.String({
	minLength: 1,
	maxLength: 256,
	pattern: "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$",
});
const changeIdSchema = Type.String({
	minLength: 5,
	maxLength: 132,
	pattern: "^CHG-[A-Za-z0-9][A-Za-z0-9._-]*$",
});
const refSchema = Type.String({ minLength: 1, maxLength: 2_048, pattern: "\\S" });
const digestSchema = Type.Unsafe<Sha256Digest>(
	Type.String({pattern: "^sha256:[0-9a-f]{64}$"}),
);
const gitObjectIdSchema = Type.String({ pattern: "^[0-9a-f]{40}([0-9a-f]{24})?$" });
const nullableGitObjectIdSchema = Type.Union([gitObjectIdSchema, Type.Null()]);
const timestampSchema = Type.String({
	pattern:
		"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
});
const idListSchema = Type.Array(idSchema, { maxItems: 512 });
const refListSchema = Type.Array(refSchema, { maxItems: 512 });
const textListSchema = Type.Array(requiredTextSchema, { maxItems: 512 });
const operationIdListSchema = Type.Array(digestSchema, { maxItems: 4_096 });
const semanticLoopSchema = Type.Union([
	Type.Literal("decision"),
	Type.Literal("planning"),
	Type.Literal("implementation"),
]);
const closureReasonSchema = Type.Union([
	Type.Literal("completed"),
	Type.Literal("withdrawn"),
	Type.Literal("superseded"),
	Type.Literal("merged"),
	Type.Literal("split"),
	Type.Literal("abandoned"),
]);
const changeClaimPurposeSchema = Type.Union([
	Type.Literal("decision"),
	Type.Literal("planning"),
	Type.Literal("implementation"),
	Type.Literal("integration"),
	Type.Literal("review"),
	Type.Literal("effect"),
]);
const productEffectStatusSchema = Type.Union([
	Type.Literal("completed"),
	Type.Literal("failed"),
	Type.Literal("unavailable"),
]);

export const baseSnapshotSchema = Type.Object(
	{
		remoteStateHead: nullableGitObjectIdSchema,
		sourceHead: gitObjectIdSchema,
		knowledgeDigest: digestSchema,
		configDigest: digestSchema,
		policyDigest: digestSchema,
	},
	{ additionalProperties: false },
);

export const authorityBindingSchema = Type.Object(
	{
		actorId: idSchema,
		principalRef: refSchema,
		role: idSchema,
		actorPolicyDigest: digestSchema,
		authenticationEvidenceId: Type.Optional(idSchema),
		runtimeProtocolDigest: digestSchema,
	},
	{ additionalProperties: false },
);

const changeRequirementSchema = Type.Object(
	{id: idSchema, statement: requiredTextSchema},
	{ additionalProperties: false },
);

export const changeRevisionContentSchema = Type.Object(
	{
		title: shortTextSchema,
		summary: requiredTextSchema,
		desiredOutcome: requiredTextSchema,
		acceptanceRequirements: Type.Array(changeRequirementSchema, {
			minItems: 1,
			maxItems: 256,
		}),
		constraints: textListSchema,
		nonGoals: textListSchema,
		knowledgeRefs: refListSchema,
		sourceRefs: refListSchema,
		defectProfile: Type.Optional(changeDefectProfileSchema),
		risk: Type.Union([
			Type.Literal("unknown"),
			Type.Literal("low"),
			Type.Literal("moderate"),
			Type.Literal("high"),
			Type.Literal("critical"),
		]),
	},
	{ additionalProperties: false },
);

export const changeRevisionSchema = Type.Object(
	{revisionId: digestSchema, content: changeRevisionContentSchema},
	{ additionalProperties: false },
);

export const changeBindingSchema = Type.Object(
	{
		changeId: changeIdSchema,
		revisionId: digestSchema,
		tailOperationId: digestSchema,
	},
	{ additionalProperties: false },
);

const inlineSemanticArtifactSchema = Type.Object(
	{
		id: idSchema,
		digest: digestSchema,
		schemaVersion: idSchema,
		artifact: Type.Unsafe<CanonicalJsonValue>(
			Type.Object({}, {additionalProperties: true}),
		),
	},
	{ additionalProperties: false },
);

const changeRelationshipSchema = Type.Object(
	{
		type: Type.Union([
			Type.Literal("depends_on"),
			Type.Literal("constrains"),
			Type.Literal("refines"),
			Type.Literal("realizes"),
			Type.Literal("verifies"),
			Type.Literal("supersedes"),
			Type.Literal("derived_from"),
			Type.Literal("overlaps"),
			Type.Literal("blocks"),
			Type.Literal("discovered_from"),
		]),
		sourceRevisionId: digestSchema,
		targetChangeId: changeIdSchema,
		targetRevisionId: digestSchema,
		rationale: requiredTextSchema,
		provenanceRefs: refListSchema,
	},
	{ additionalProperties: false },
);

const candidatePayloadSchema = Type.Object(
	{
		attemptOperationId: digestSchema,
		candidate: inlineSemanticArtifactSchema,
		observedBaseDigest: digestSchema,
	},
	{ additionalProperties: false },
);

const traceOpenedPayloadSchema = Type.Object(
	{
		origin: Type.Union([Type.Literal("user"), Type.Literal("discovered")]),
		provenanceRefs: refListSchema,
	},
	{ additionalProperties: false },
);
const traceClosedPayloadSchema = Type.Object(
	{
		reason: closureReasonSchema,
		finalRouteOperationId: Type.Optional(digestSchema),
	},
	{ additionalProperties: false },
);
const traceReopenedPayloadSchema = Type.Object(
	{
		archiveManifestId: digestSchema,
		archivedTailOperationId: digestSchema,
		closureOperationId: digestSchema,
		reason: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const changeProposedPayloadSchema = Type.Object(
	{
		revision: changeRevisionSchema,
		intakeMaterial: Type.Optional(inlineSemanticArtifactSchema),
		provenance: Type.Object(
			{
				kind: Type.Union([Type.Literal("user"), Type.Literal("discovered")]),
				refs: refListSchema,
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);
const changeRevisedPayloadSchema = Type.Object(
	{
		previousRevisionId: digestSchema,
		revision: changeRevisionSchema,
		reason: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const changeRelationshipRecordedPayloadSchema = Type.Object(
	{relationshipId: digestSchema, relationship: changeRelationshipSchema},
	{ additionalProperties: false },
);
const changeRelationshipSupersededPayloadSchema = Type.Object(
	{
		relationshipOperationId: digestSchema,
		replacementOperationId: Type.Optional(digestSchema),
		reason: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const changeMergeRecordedPayloadSchema = Type.Object(
	{
		mergeId: digestSchema,
		role: Type.Union([Type.Literal("source"), Type.Literal("result")]),
		sources: Type.Array(changeBindingSchema, { minItems: 2, maxItems: 64 }),
		result: changeBindingSchema,
		rationale: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const changeSplitRecordedPayloadSchema = Type.Object(
	{
		splitId: digestSchema,
		role: Type.Union([Type.Literal("source"), Type.Literal("result")]),
		source: changeBindingSchema,
		results: Type.Array(changeBindingSchema, { minItems: 2, maxItems: 64 }),
		rationale: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const changeWithdrawalRecordedPayloadSchema = Type.Object(
	{revisionId: digestSchema, reason: requiredTextSchema},
	{ additionalProperties: false },
);
const changeFeedbackRecordedPayloadSchema = Type.Object(
	{
		revisionId: digestSchema,
		intakeMaterial: Type.Optional(inlineSemanticArtifactSchema),
		classification: Type.Union([
			Type.Literal("clarification"),
			Type.Literal("concern"),
			Type.Literal("request"),
			Type.Literal("outcome"),
		]),
		summary: requiredTextSchema,
		provenanceRefs: refListSchema,
	},
	{ additionalProperties: false },
);
const changeClaimAcquiredPayloadSchema = Type.Object(
	{
		revisionId: digestSchema,
		purpose: changeClaimPurposeSchema,
	},
	{ additionalProperties: false },
);
const claimReleasedPayloadSchema = Type.Object(
	{
		claimOperationId: digestSchema,
		reason: Type.Union([
			Type.Literal("completed"),
			Type.Literal("cancelled"),
			Type.Literal("superseded"),
			Type.Literal("withdrawn"),
		]),
	},
	{ additionalProperties: false },
);
const changeClaimTakeoverPayloadSchema = Type.Object(
	{
		priorClaimOperationId: digestSchema,
		revisionId: digestSchema,
		purpose: changeClaimPurposeSchema,
		reason: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const loopAttemptStartedPayloadSchema = Type.Object(
	{
		loop: semanticLoopSchema,
		changeRevisionId: digestSchema,
		loopProtocolDigest: digestSchema,
		routeId: idSchema,
		privateAttemptDigest: Type.Optional(digestSchema),
	},
	{ additionalProperties: false },
);
const loopAttemptEndedPayloadSchema = Type.Object(
	{
		attemptOperationId: digestSchema,
		status: Type.Union([
			Type.Literal("passed"),
			Type.Literal("failed"),
			Type.Literal("indeterminate"),
			Type.Literal("cancelled"),
			Type.Literal("stale"),
		]),
		exitReportId: Type.Optional(idSchema),
		routeOperationId: Type.Optional(digestSchema),
	},
	{ additionalProperties: false },
);
const loopExitPolicyPayloadSchema = Type.Object(
	{
		attemptOperationId: digestSchema,
		candidateId: idSchema,
		policy: inlineSemanticArtifactSchema,
	},
	{ additionalProperties: false },
);
const evidenceRecordedPayloadSchema = Type.Object(
	{
		attemptOperationId: digestSchema,
		candidateId: Type.Optional(idSchema),
		evidence: inlineSemanticArtifactSchema,
		evidenceKind: idSchema,
		authority: Type.Union([
			Type.Literal("asserted"),
			Type.Literal("observed"),
			Type.Literal("verified"),
			Type.Literal("approved"),
		]),
		coverage: Type.Union([
			Type.Literal("complete"),
			Type.Literal("partial"),
			Type.Literal("unknown"),
		]),
	},
	{ additionalProperties: false },
);
const checkResultRecordedPayloadSchema = Type.Object(
	{
		attemptOperationId: digestSchema,
		candidateId: idSchema,
		result: inlineSemanticArtifactSchema,
		checkId: idSchema,
		checkVersion: idSchema,
		status: Type.Union([
			Type.Literal("passed"),
			Type.Literal("failed"),
			Type.Literal("indeterminate"),
			Type.Literal("excluded"),
		]),
		evidenceRecordIds: idListSchema,
		evidenceInputDigest: digestSchema,
	},
	{ additionalProperties: false },
);
const loopExitReportRecordedPayloadSchema = Type.Object(
	{
		attemptOperationId: digestSchema,
		candidateId: idSchema,
		report: inlineSemanticArtifactSchema,
		status: Type.Union([
			Type.Literal("passed"),
			Type.Literal("failed"),
			Type.Literal("indeterminate"),
		]),
		resultIds: idListSchema,
	},
	{ additionalProperties: false },
);
const runtimeRouteRecordedPayloadSchema = Type.Object(
	{
		attemptOperationId: digestSchema,
		exitReportId: idSchema,
		route: Type.Union([
			Type.Literal("decision"),
			Type.Literal("planning"),
			Type.Literal("implementation"),
			Type.Literal("repair"),
			Type.Literal("waiting"),
			Type.Literal("escalation"),
			Type.Literal("complete"),
			Type.Literal("withdrawn"),
		]),
		reasonCode: idSchema,
		runtimeRoute: inlineSemanticArtifactSchema,
		targetChangeId: Type.Optional(changeIdSchema),
	},
	{ additionalProperties: false },
);
const planningEpochBoundPayloadSchema = Type.Object(
	{
		planningEpochId: digestSchema,
		participantRevisionId: digestSchema,
		planningCandidateId: idSchema,
		exitReportId: idSchema,
		workItemIds: idListSchema,
	},
	{ additionalProperties: false },
);
const workItemClaimAcquiredPayloadSchema = Type.Object(
	{
		planningEpochId: digestSchema,
		workItemId: idSchema,
		assignmentAttemptId: idSchema,
		workerId: idSchema,
		workbenchId: idSchema,
		sourceBase: gitObjectIdSchema,
		scopeDigest: digestSchema,
		budgetDigest: digestSchema,
		obligationDigest: digestSchema,
	},
	{ additionalProperties: false },
);
const workItemClaimTakeoverPayloadSchema = Type.Object(
	{
		priorClaimOperationId: digestSchema,
		planningEpochId: digestSchema,
		workItemId: idSchema,
		assignmentAttemptId: idSchema,
		workerId: idSchema,
		workbenchId: idSchema,
		sourceBase: gitObjectIdSchema,
		scopeDigest: digestSchema,
		budgetDigest: digestSchema,
		obligationDigest: digestSchema,
		reason: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const assignmentDispatchedPayloadSchema = Type.Object(
	{
		claimOperationId: digestSchema,
		planningEpochId: digestSchema,
		workItemId: idSchema,
		assignmentAttemptId: idSchema,
		workerId: idSchema,
		workbenchId: idSchema,
		sourceBase: gitObjectIdSchema,
		scopeDigest: digestSchema,
		budgetDigest: digestSchema,
		obligationDigest: digestSchema,
	},
	{ additionalProperties: false },
);
const assignmentCancelRequestedPayloadSchema = Type.Object(
	{assignmentOperationId: digestSchema, reason: requiredTextSchema},
	{ additionalProperties: false },
);
const assignmentTerminalRecordedPayloadSchema = Type.Object(
	{
		assignmentOperationId: digestSchema,
		status: Type.Union([
			Type.Literal("completed"),
			Type.Literal("blocked"),
			Type.Literal("failed"),
			Type.Literal("cancelled"),
		]),
		workerReportEvidenceId: Type.Optional(idSchema),
		resultTreeDigest: Type.Optional(digestSchema),
		reason: requiredTextSchema,
	},
	{ additionalProperties: false },
);
const workerReportRecordedPayloadSchema = Type.Object(
	{
		assignmentOperationId: digestSchema,
		claimOperationId: digestSchema,
		workerReportEvidenceId: idSchema,
		reportDigest: digestSchema,
		reportRef: refSchema,
	},
	{ additionalProperties: false },
);
const integrationAttemptStartedPayloadSchema = Type.Object(
	{
		assignmentOperationIds: operationIdListSchema,
		baseCommit: gitObjectIdSchema,
		targetRef: refSchema,
		sourceCandidateIds: idListSchema,
	},
	{ additionalProperties: false },
);
const integrationResultRecordedPayloadSchema = Type.Object(
	{
		integrationAttemptOperationId: digestSchema,
		status: Type.Union([
			Type.Literal("integrated"),
			Type.Literal("conflict"),
			Type.Literal("failed"),
			Type.Literal("cancelled"),
		]),
		resultCommit: Type.Optional(gitObjectIdSchema),
		resultTreeDigest: Type.Optional(digestSchema),
		integrationEvidenceId: Type.Optional(idSchema),
		conflictRefs: refListSchema,
	},
	{ additionalProperties: false },
);
const sourceBranchMergeRecordedPayloadSchema = Type.Object(
	{
		integrationAttemptOperationId: digestSchema,
		targetRef: refSchema,
		baseCommit: gitObjectIdSchema,
		resultCommit: gitObjectIdSchema,
		resultTreeDigest: digestSchema,
		providerReceiptRef: Type.Optional(refSchema),
	},
	{ additionalProperties: false },
);
const sourceBranchPushRecordedPayloadSchema = Type.Object(
	{
		targetRef: refSchema,
		expectedRemoteHead: nullableGitObjectIdSchema,
		sourceCommit: gitObjectIdSchema,
		observedRemoteHead: gitObjectIdSchema,
		receiptEvidenceId: idSchema,
	},
	{ additionalProperties: false },
);
const reviewProjectionPublishedPayloadSchema = Type.Object(
	{
		candidateId: idSchema,
		sourceTreeDigest: digestSchema,
		providerId: idSchema,
		providerRef: refSchema,
		headCommit: gitObjectIdSchema,
		publicationEvidenceId: idSchema,
	},
	{ additionalProperties: false },
);
const productPublicationRecordedPayloadSchema = Type.Object(
	{
		candidateId: idSchema,
		artifactDigest: digestSchema,
		channel: idSchema,
		receiptEvidenceId: idSchema,
		status: productEffectStatusSchema,
	},
	{ additionalProperties: false },
);
const productReleaseRecordedPayloadSchema = Type.Object(
	{
		publicationOperationId: Type.Optional(digestSchema),
		version: idSchema,
		artifactDigest: digestSchema,
		channel: idSchema,
		receiptEvidenceId: idSchema,
		status: productEffectStatusSchema,
	},
	{ additionalProperties: false },
);
const deliveryObservationRecordedPayloadSchema = Type.Object(
	{
		effect: Type.Union([
			Type.Literal("push"),
			Type.Literal("product_publication"),
			Type.Literal("release"),
			Type.Literal("deployment"),
		]),
		subjectOperationId: digestSchema,
		status: Type.Union([
			Type.Literal("completed"),
			Type.Literal("failed"),
			Type.Literal("unavailable"),
		]),
		evidenceId: idSchema,
		targetRef: refSchema,
	},
	{ additionalProperties: false },
);
const outcomeObservationRecordedPayloadSchema = Type.Object(
	{
		deliveryOperationId: Type.Optional(digestSchema),
		status: Type.Union([
			Type.Literal("positive"),
			Type.Literal("negative"),
			Type.Literal("mixed"),
			Type.Literal("unknown"),
		]),
		evidenceId: idSchema,
		obligationId: Type.Optional(idSchema),
	},
	{ additionalProperties: false },
);

export const changeOperationPayloadSchemas = Object.freeze({
	"trace.opened": traceOpenedPayloadSchema,
	"trace.closed": traceClosedPayloadSchema,
	"trace.reopened": traceReopenedPayloadSchema,
	"change.proposed": changeProposedPayloadSchema,
	"change.revised": changeRevisedPayloadSchema,
	"change.relationship_recorded": changeRelationshipRecordedPayloadSchema,
	"change.relationship_superseded": changeRelationshipSupersededPayloadSchema,
	"change.merge_recorded": changeMergeRecordedPayloadSchema,
	"change.split_recorded": changeSplitRecordedPayloadSchema,
	"change.withdrawal_recorded": changeWithdrawalRecordedPayloadSchema,
	"change.feedback_recorded": changeFeedbackRecordedPayloadSchema,
	"change_claim.acquired": changeClaimAcquiredPayloadSchema,
	"change_claim.released": claimReleasedPayloadSchema,
	"change_claim.takeover_recorded": changeClaimTakeoverPayloadSchema,
	"loop.attempt_started": loopAttemptStartedPayloadSchema,
	"loop.attempt_ended": loopAttemptEndedPayloadSchema,
	"decision.candidate_recorded": candidatePayloadSchema,
	"planning.candidate_recorded": candidatePayloadSchema,
	"implementation.candidate_recorded": candidatePayloadSchema,
	"loop.exit_policy_recorded": loopExitPolicyPayloadSchema,
	"evidence.recorded": evidenceRecordedPayloadSchema,
	"check.result_recorded": checkResultRecordedPayloadSchema,
	"loop.exit_report_recorded": loopExitReportRecordedPayloadSchema,
	"runtime.route_recorded": runtimeRouteRecordedPayloadSchema,
	"planning.epoch_bound": planningEpochBoundPayloadSchema,
	"work_item_claim.acquired": workItemClaimAcquiredPayloadSchema,
	"work_item_claim.released": claimReleasedPayloadSchema,
	"work_item_claim.takeover_recorded": workItemClaimTakeoverPayloadSchema,
	"assignment.dispatched": assignmentDispatchedPayloadSchema,
	"assignment.cancel_requested": assignmentCancelRequestedPayloadSchema,
	"assignment.terminal_recorded": assignmentTerminalRecordedPayloadSchema,
	"worker.report_recorded": workerReportRecordedPayloadSchema,
	"integration.attempt_started": integrationAttemptStartedPayloadSchema,
	"integration.result_recorded": integrationResultRecordedPayloadSchema,
	"source.branch_merge_recorded": sourceBranchMergeRecordedPayloadSchema,
	"source.branch_push_recorded": sourceBranchPushRecordedPayloadSchema,
	"review_projection.published": reviewProjectionPublishedPayloadSchema,
	"product.publication_recorded": productPublicationRecordedPayloadSchema,
	"product.release_recorded": productReleaseRecordedPayloadSchema,
	"delivery.observation_recorded": deliveryObservationRecordedPayloadSchema,
	"outcome.observation_recorded": outcomeObservationRecordedPayloadSchema,
} satisfies Readonly<Record<ChangeOperationKind, TSchema>>);

export type ChangeOperationPayload<K extends ChangeOperationKind> = Static<
	(typeof changeOperationPayloadSchemas)[K]
>;

export interface ChangeOperationBody<
	K extends ChangeOperationKind = ChangeOperationKind,
> {
	readonly protocol: typeof CHANGE_TRACE_PROTOCOL;
	readonly changeId: string;
	readonly kind: K;
	readonly kindVersion: "1.0.0";
	readonly parents: readonly OperationId[];
	readonly baseSnapshot: BaseSnapshot;
	readonly authorityBinding: AuthorityBinding;
	readonly recordedAt: string;
	readonly preStateDigest: Sha256Digest;
	readonly postStateDigest: Sha256Digest;
	readonly payload: ChangeOperationPayload<K>;
}

export interface CanonicalChangeOperation<
	K extends ChangeOperationKind = ChangeOperationKind,
> {
	readonly operationId: OperationId;
	readonly body: ChangeOperationBody<K>;
}

export const changeOperationBodySchema = Type.Object(
	{
		protocol: Type.Object(
			{
				id: Type.Literal(CHANGE_TRACE_PROTOCOL.id),
				version: Type.Literal(CHANGE_TRACE_PROTOCOL.version),
				canonicalJson: Type.Literal(CHANGE_TRACE_PROTOCOL.canonicalJson),
			},
			{ additionalProperties: false },
		),
		changeId: changeIdSchema,
		kind: Type.Union(CHANGE_OPERATION_KINDS.map((kind) => Type.Literal(kind))),
		kindVersion: Type.Literal("1.0.0"),
		parents: operationIdListSchema,
		baseSnapshot: baseSnapshotSchema,
		authorityBinding: authorityBindingSchema,
		recordedAt: timestampSchema,
		preStateDigest: digestSchema,
		postStateDigest: digestSchema,
		payload: Type.Unknown(),
	},
	{ additionalProperties: false },
);

export const canonicalChangeOperationSchema = Type.Object(
	{operationId: digestSchema, body: changeOperationBodySchema},
	{ additionalProperties: false },
);

export const planningAcceptanceRequirementSchema = Type.Object(
	{
		id: idSchema,
		statement: requiredTextSchema,
		evidenceObligationIds: idListSchema,
		checkIds: idListSchema,
	},
	{ additionalProperties: false },
);
export const planningScopeSchema = Type.Object(
	{
		sourcePaths: refListSchema,
		knowledgeRefs: refListSchema,
		componentRefs: refListSchema,
	},
	{ additionalProperties: false },
);
export const planningWorkbenchSchema = Type.Object(
	{
		profileId: idSchema,
		toolIds: idListSchema,
		skillIds: idListSchema,
		contextRefs: refListSchema,
		budgetDigest: digestSchema,
	},
	{ additionalProperties: false },
);
export const planningIntegrationSchema = Type.Object(
	{
		targetRef: refSchema,
		requiredCheckIds: idListSchema,
		rollbackStrategy: requiredTextSchema,
		reviewRequired: Type.Boolean(),
	},
	{ additionalProperties: false },
);
export const planningSprintSchema = Type.Object(
	{
		id: idSchema,
		goal: requiredTextSchema,
		participantChangeIds: Type.Array(changeIdSchema, { minItems: 1, maxItems: 256 }),
		workItemIds: Type.Array(idSchema, { minItems: 1, maxItems: 512 }),
		dependsOnSprintIds: idListSchema,
		integrationBoundary: requiredTextSchema,
	},
	{ additionalProperties: false },
);
export const planningWorkItemSchema = Type.Object(
	{
		id: idSchema,
		sprintId: idSchema,
		title: shortTextSchema,
		outcome: requiredTextSchema,
		owningChange: changeBindingSchema,
		contributingChanges: Type.Array(changeBindingSchema, { maxItems: 256 }),
		dependsOnWorkItemIds: idListSchema,
		acceptanceRequirements: Type.Array(planningAcceptanceRequirementSchema, {
			minItems: 1,
			maxItems: 256,
		}),
		scope: planningScopeSchema,
		workbench: planningWorkbenchSchema,
		integration: planningIntegrationSchema,
	},
	{ additionalProperties: false },
);
export const activeWorkDispositionSchema = Type.Object(
	{
		workItemId: idSchema,
		disposition: Type.Union([
			Type.Literal("preserve"),
			Type.Literal("pause"),
			Type.Literal("migrate"),
			Type.Literal("cancel"),
			Type.Literal("block"),
			Type.Literal("route_back"),
		]),
		activeAssignmentOperationId: Type.Optional(digestSchema),
		replacementWorkItemId: Type.Optional(idSchema),
		reason: requiredTextSchema,
	},
	{ additionalProperties: false },
);

export interface PlanningEpochBody {
	readonly protocol: typeof PLANNING_EPOCH_PROTOCOL;
	readonly kind: "planning.epoch_recorded";
	readonly kindVersion: "1.0.0";
	readonly recordedAt: string;
	readonly baseSnapshot: BaseSnapshot & {readonly workStateDigest: Sha256Digest};
	readonly authorityBinding: AuthorityBinding;
	readonly planningCandidateId: string;
	readonly exitReportId: string;
	readonly participants: readonly ChangeBinding[];
	readonly sprints: readonly Static<typeof planningSprintSchema>[];
	readonly workItems: readonly Static<typeof planningWorkItemSchema>[];
	readonly activeWorkDispositions: readonly Static<
		typeof activeWorkDispositionSchema
	>[];
	readonly safeExecutionFrontier: readonly string[];
	readonly globalWorkItemGraphDigest: Sha256Digest;
}

export interface PlanningEpochRecord {
	readonly operationId: PlanningEpochId;
	readonly body: PlanningEpochBody;
}

export const planningEpochBodySchema = Type.Object(
	{
		protocol: Type.Object(
			{
				id: Type.Literal(PLANNING_EPOCH_PROTOCOL.id),
				version: Type.Literal(PLANNING_EPOCH_PROTOCOL.version),
				canonicalJson: Type.Literal(PLANNING_EPOCH_PROTOCOL.canonicalJson),
			},
			{ additionalProperties: false },
		),
		kind: Type.Literal("planning.epoch_recorded"),
		kindVersion: Type.Literal("1.0.0"),
		recordedAt: timestampSchema,
		baseSnapshot: Type.Object(
			{
				remoteStateHead: nullableGitObjectIdSchema,
				sourceHead: gitObjectIdSchema,
				knowledgeDigest: digestSchema,
				configDigest: digestSchema,
				policyDigest: digestSchema,
				workStateDigest: digestSchema,
			},
			{ additionalProperties: false },
		),
		authorityBinding: authorityBindingSchema,
		planningCandidateId: idSchema,
		exitReportId: idSchema,
		participants: Type.Array(changeBindingSchema, { minItems: 1, maxItems: 256 }),
		sprints: Type.Array(planningSprintSchema, { minItems: 1, maxItems: 256 }),
		workItems: Type.Array(planningWorkItemSchema, { minItems: 1, maxItems: 2_048 }),
		activeWorkDispositions: Type.Array(activeWorkDispositionSchema, {
			maxItems: 2_048,
		}),
		safeExecutionFrontier: idListSchema,
		globalWorkItemGraphDigest: digestSchema,
	},
	{ additionalProperties: false },
);
export const planningEpochRecordSchema = Type.Object(
	{operationId: digestSchema, body: planningEpochBodySchema},
	{ additionalProperties: false },
);

export interface ChangedTraceTail {
	readonly changeId: string;
	readonly previousTail: OperationId | null;
	readonly nextTail: OperationId;
}
export interface StateCommitManifestBody {
	readonly protocol: typeof STATE_COMMIT_MANIFEST_PROTOCOL;
	readonly previousStateHead: GitObjectId | null;
	readonly operationIds: readonly OperationId[];
	readonly changedTraceTails: readonly ChangedTraceTail[];
	readonly batchDigest: Sha256Digest;
}
export interface StateCommitManifest {
	readonly manifestId: StateCommitManifestId;
	readonly body: StateCommitManifestBody;
}

const changedTraceTailSchema = Type.Object(
	{
		changeId: changeIdSchema,
		previousTail: Type.Union([digestSchema, Type.Null()]),
		nextTail: digestSchema,
	},
	{ additionalProperties: false },
);
export const stateCommitManifestBodySchema = Type.Object(
	{
		protocol: Type.Object(
			{
				id: Type.Literal(STATE_COMMIT_MANIFEST_PROTOCOL.id),
				version: Type.Literal(STATE_COMMIT_MANIFEST_PROTOCOL.version),
				canonicalJson: Type.Literal(STATE_COMMIT_MANIFEST_PROTOCOL.canonicalJson),
			},
			{ additionalProperties: false },
		),
		previousStateHead: nullableGitObjectIdSchema,
		operationIds: Type.Array(digestSchema, { minItems: 1, maxItems: 4_096 }),
		changedTraceTails: Type.Array(changedTraceTailSchema, {
			minItems: 1,
			maxItems: 2_048,
		}),
		batchDigest: digestSchema,
	},
	{ additionalProperties: false },
);
export const stateCommitManifestSchema = Type.Object(
	{manifestId: digestSchema, body: stateCommitManifestBodySchema},
	{ additionalProperties: false },
);

export interface ArchiveSegment {
	readonly index: number;
	readonly digest: Sha256Digest;
	readonly byteLength: number;
	readonly operationCount: number;
	readonly rootOperationId: OperationId;
	readonly tailOperationId: OperationId;
}
export interface ArchiveManifestBody {
	readonly protocol: typeof ARCHIVE_MANIFEST_PROTOCOL;
	readonly changeId: string;
	readonly sourceStateHead: GitObjectId;
	readonly previousArchiveHead: GitObjectId | null;
	readonly segments: readonly ArchiveSegment[];
	readonly rootOperationId: OperationId;
	readonly tailOperationId: OperationId;
	readonly closureOperationId: OperationId;
	readonly closureReason:
		| "completed"
		| "withdrawn"
		| "superseded"
		| "merged"
		| "split"
		| "abandoned";
	readonly integrationOperationIds: readonly OperationId[];
	readonly deliveryOperationIds: readonly OperationId[];
	readonly outcomeOperationIds: readonly OperationId[];
	readonly acceptedStateCommits: readonly GitObjectId[];
}
export interface ArchiveManifest {
	readonly manifestId: ArchiveManifestId;
	readonly body: ArchiveManifestBody;
}

const archiveSegmentSchema = Type.Object(
	{
		index: Type.Integer({ minimum: 0 }),
		digest: digestSchema,
		byteLength: Type.Integer({ minimum: 1 }),
		operationCount: Type.Integer({ minimum: 1 }),
		rootOperationId: digestSchema,
		tailOperationId: digestSchema,
	},
	{ additionalProperties: false },
);
export const archiveManifestBodySchema = Type.Object(
	{
		protocol: Type.Object(
			{
				id: Type.Literal(ARCHIVE_MANIFEST_PROTOCOL.id),
				version: Type.Literal(ARCHIVE_MANIFEST_PROTOCOL.version),
				canonicalJson: Type.Literal(ARCHIVE_MANIFEST_PROTOCOL.canonicalJson),
			},
			{ additionalProperties: false },
		),
		changeId: changeIdSchema,
		sourceStateHead: gitObjectIdSchema,
		previousArchiveHead: nullableGitObjectIdSchema,
		segments: Type.Array(archiveSegmentSchema, { minItems: 1, maxItems: 4_096 }),
		rootOperationId: digestSchema,
		tailOperationId: digestSchema,
		closureOperationId: digestSchema,
		closureReason: closureReasonSchema,
		integrationOperationIds: operationIdListSchema,
		deliveryOperationIds: operationIdListSchema,
		outcomeOperationIds: operationIdListSchema,
		acceptedStateCommits: Type.Array(gitObjectIdSchema, { minItems: 1, maxItems: 4_096 }),
	},
	{ additionalProperties: false },
);
export const archiveManifestSchema = Type.Object(
	{manifestId: digestSchema, body: archiveManifestBodySchema},
	{ additionalProperties: false },
);

export interface CanonicalInlineSemanticArtifact {
	readonly id: string;
	readonly digest: Sha256Digest;
	readonly schemaVersion: string;
	readonly artifact: CanonicalJsonValue;
}

export interface OperationAdmissionRequest {
	readonly operationId: OperationId;
	readonly kind: ChangeTraceOperationKind;
	readonly capability: AuthorityCapability;
	readonly authorityBinding: AuthorityBinding;
	readonly baseSnapshot: BaseSnapshot;
}

export type AuthorityEvaluator = (
	request: OperationAdmissionRequest,
) => boolean;

export type CanonicalProtocolDocument =
	| CanonicalChangeOperation
	| PlanningEpochRecord
	| StateCommitManifest
	| ArchiveManifest;

export type CanonicalPayloadValue = CanonicalJsonValue;
export type ProtocolSemanticLoop = SemanticLoop;
