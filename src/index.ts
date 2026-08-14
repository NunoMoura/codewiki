export const CODEWIKI_EXTENSION_AVAILABLE = true as const;

export {
	CLIENT_KINDS,
	CLIENT_SERVER_PROTOCOL,
	serverTransportDeduplicationDigest,
	normalizeClientServerCommand,
	normalizeClientServerEvent,
	normalizeClientServerOperation,
	normalizeClientServerQuery,
	normalizeClientServerQueryResult,
	runtimeSemanticIdempotencyDigest,
	type ClientServerActorContext,
	type ClientServerCommandEnvelope,
	type ClientServerCoverage,
	type ClientServerEventEnvelope,
	type ClientKind,
	type ClientServerOperationEnvelope,
	type ClientServerOperationStatus,
	type ClientServerQueryEnvelope,
	type ClientServerQueryResultEnvelope,
	type ClientServerRequestContext,
	type ClientServerSnapshotContext,
	type ClientServerTransportContext,
} from "./protocol/client-server.ts";
export {
	DEFAULT_WIKI_CONFIG,
	resolveWikiConfig,
	validateWikiConfig,
	type PartialHostConfig,
	type PartialQualityConfig,
	type PartialRuntimeConfig,
	type PartialWikiConfig,
	type WikiApprovalPolicyConfig,
	type WikiConfig,
	type WikiConfigAgencyLevel,
	type WikiConfigApprovalCadence,
	type WikiConfigAutomationMode,
	type WikiConfigRiskAction,
	type WikiConfigWorktreeIsolation,
	type WikiHostConfig,
	type WikiQualityConfig,
	type WikiQualityJudgeConfig,
	type WikiQualityReviewConfig,
	type WikiRetentionConfig,
	type WikiRuntimeBudgetConfig,
	type WikiRuntimeConfig,
} from "./project/config.ts";
export type {
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationWorkerClaim,
} from "./implementation/types.ts";
export type { ImplementationWorkerReportInput } from "./implementation/workers.ts";
export type {
	ImplementationWorkerProof,
	ImplementationWorkerProofConflict,
	ImplementationWorkerProofInput,
} from "./implementation/worker-proof.ts";
export type {
	SourceMapComponent,
	SourceMapContract,
	SourceMapDefaults,
	SourceMapMarkdownEntry,
	SourceMapValidationInput,
	SourceMapValidationIssue,
	SourceMapValidationIssueCode,
} from "./knowledge/source-map.ts";
export type { ContentProof } from "./git/content-proof.ts";
export type {
	ApprovalReceiptPayload,
	ApprovalReceiptProvider,
	CommandExecutionPayload,
	DeliveryAttestationPayload,
	EvidenceArtifact,
	EvidenceAuthority,
	EvidenceCoverage,
	EvidenceId,
	EvidenceKind,
	EvidenceMaterial,
	EvidenceMeasurement,
	EvidencePayloadByKind,
	EvidenceProducer,
	EvidenceProducerKind,
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
	IntegrationProofPayload,
	ModelAssessmentPayload,
	OutcomeObservationPayload,
	ResearchCitationPayload,
	SourceObservationPayload,
	UiCaptureArtifact,
	UiCapturePayload,
	WorkerReportPayload,
} from "./evidence/contracts.ts";
export type {
	Change,
	ChangeAssessment,
	ChangeClassification,
	ChangeDeliveryConstraints,
	ChangeEvidence,
	ChangeIntent,
	ChangeKnowledgeImpact,
	ChangeOutcomeContract,
	ChangeRecommendation,
	ChangeStatus,
	ChangeStatusTransition,
	ChangeValidation,
} from "./changes/types.ts";
export type { ChangeRecord } from "./changes/records.ts";
export {
	CHANGE_DEFECT_PROFILE_PROTOCOL,
	normalizeChangeDefectProfile,
	normalizeChangeSecurityProfile,
} from "./changes/defect-profile.ts";
export type {
	ChangeCvssReference,
	ChangeDefectCategory,
	ChangeDefectConfidence,
	ChangeDefectExposure,
	ChangeDefectLikelihood,
	ChangeDefectProfile,
	ChangeDefectProfileProvenance,
	ChangeDefectRegressionStatus,
	ChangeDefectReproducibility,
	ChangeDefectSeverity,
	ChangeKevReference,
	ChangeSarifReference,
	ChangeSecurityClassification,
	ChangeSecurityIdentifier,
	ChangeSecurityIdentifierScheme,
	ChangeSecurityProfile,
} from "./changes/defect-profile.ts";
export {
	CHANGE_INTAKE_MATERIAL_PROTOCOL,
	CHANGE_INTAKE_MATERIAL_TYPES,
} from "./changes/intake/contracts.ts";
export {
	normalizeChangeIntakeContent,
	normalizeChangeIntakeMaterial,
} from "./changes/intake/normalize.ts";
export * from "./changes/triage/contracts.ts";
export {
	buildBacklogTriageProjection,
	type BuildBacklogTriageProjectionInput,
} from "./changes/triage/projection.ts";
export { queryBacklogTriage } from "./changes/triage/query.ts";
export {
	createDeliveryObservationMaterial,
	createDeliveryObservationMaterialFromEvidence,
	createKnowledgeDriftMaterial,
	createKnowledgeDriftMaterialFromIssue,
	createOutcomeFindingMaterial,
	createOutcomeFindingMaterialFromEvidence,
	createPullRequestFindingMaterial,
	createRegressionFindingMaterial,
	createSecurityScannerFindingMaterial,
	createUserSuggestionMaterial,
	createWorkerDiscoveryMaterial,
	createWorkerReportDiscoveryMaterials,
} from "./changes/intake/producers.ts";
export type {
	DeliveryEvidenceProducerInput,
	DeliveryObservationProducerInput,
	KnowledgeDriftIssueProducerInput,
	KnowledgeDriftProducerInput,
	OutcomeEvidenceProducerInput,
	OutcomeFindingProducerInput,
	PullRequestFindingProducerInput,
	RegressionFindingProducerInput,
	SecurityScannerFindingProducerInput,
	UserSuggestionProducerInput,
	WorkerDiscoveryProducerInput,
	WorkerReportDiscoveryProducerInput,
} from "./changes/intake/producers.ts";
export type {
	ChangeIntakeClaimedCategory,
	ChangeIntakeClaimedConfidence,
	ChangeIntakeClaimedSeverity,
	ChangeIntakeContent,
	ChangeIntakeMaterial,
	ChangeIntakeMaterialType,
	DeliveryObservationBinding,
	DeliveryObservationMaterial,
	KnowledgeDriftBinding,
	KnowledgeDriftMaterial,
	OutcomeFindingBinding,
	OutcomeFindingMaterial,
	PullRequestFindingBinding,
	PullRequestFindingMaterial,
	RegressionFindingBinding,
	RegressionFindingMaterial,
	SecurityScannerFindingBinding,
	SecurityScannerFindingMaterial,
	UserSuggestionBinding,
	UserSuggestionMaterial,
	WorkerDiscoveryBinding,
	WorkerDiscoveryMaterial,
} from "./changes/intake/contracts.ts";
export type {
	ChangeQuery,
	ChangeStore,
	ChangeStoreSnapshot,
} from "./changes/store.ts";
export type {
	GitStatusSnapshot,
	GitStatusSnapshotInput,
	RuntimeWorktreeGitInputs,
} from "./git/status.ts";
export type {
	ExecuteRuntimeWorktreeCommandsOptions,
	RuntimeWorktreePlan,
	WorktreeCommand,
	WorktreeCommandExecutionRecord,
	WorktreeCommandExecutionResult,
	WorktreeCommandRunner,
	WorktreeCommandStep,
	WorktreeProcessCommand,
	WorktreeRef,
} from "./git/worktrees.ts";
export type { DecisionCandidateProposal } from "./decision/candidate-proposal.ts";
export type {
	ImplementationAcceptanceEvidenceCandidate,
	ImplementationArchiveDispositionCandidate,
	ImplementationAssessmentCandidate,
	ImplementationCandidateContent,
	ImplementationCommandResultCandidate,
	ImplementationEvidenceCandidate,
	ImplementationSensitiveSurfaceCandidate,
} from "./implementation/candidate-content.ts";
export type {
	PlanningCandidateContent,
	PlanningSprintCandidate,
	PlanningWorkItemCandidate,
} from "./planning/candidate-content.ts";
export type { ProjectSnapshot } from "./project/snapshot.ts";
export type { RuntimeWorkUnitClaimPolicyDecision } from "./runtime/claims/policy.ts";
export type {
	TraceCloseReleaseNotes,
	TraceReleaseNoteChange,
	TraceReleaseNoteCheck,
} from "./changes/trace/release-notes.ts";
export type { TraceEvent, TraceRecord } from "./changes/trace/types.ts";
export { buildProjectWorkState } from "./work-state/project.ts";
export { buildWorkState } from "./work-state/projector.ts";
export type {
	WorkState,
	WorkStateAssignment,
	WorkStateBlocker,
	WorkStateChange,
	WorkStateSprint,
	WorkStateWorkItem,
} from "./work-state/types.ts";
export type {
	BlockersView,
	ConflictsView,
	ResumeView,
	StatusView,
	TraceBoardView,
	TraceQueueView,
	TriggersView,
	WorkPlanView,
	WorkQueueView,
} from "./views/types.ts";
export * from "./changes/trace/index.ts";
export * from "./alignment/graph.ts";
export * from "./alignment/knowledge.ts";
export * from "./alignment/query.ts";
export * from "./knowledge/codewiki-kb-profile.ts";
export * from "./knowledge/system-diagrams.ts";
export * from "./execution/ports.ts";
export * from "./protocol/client-pairing.ts";
export {
	SERVER_OIDC_AUTHENTICATION_PROTOCOL,
	serverOidcIdentity,
	verifyServerOidcAuthentication,
	type ServerOidcAuthenticationAdapter,
	type ServerOidcClaims,
	type ServerOidcIdentity,
	type VerifiedServerOidcAuthentication,
} from "./server/authentication/oidc.ts";
export {
	normalizeServerAuthenticationAssertion,
	verifyServerAuthentication,
	type ServerAuthenticationAdapter,
	type ServerAuthenticationAssertion,
	type ServerAuthenticationProof,
} from "./server/authentication/proof.ts";
export {
	SERVER_PAIRING_ENDPOINTS,
	issueAuthorizedClientPairing,
	revokeAuthorizedClientPairing,
	type AuthorizedClientPairingTransition,
	type ServerPairingAuthorizationAdapter,
	type ServerPairingAuthorizationCommand,
	type ServerPairingAuthorizationContext,
} from "./server/pairing/authorization.ts";
export {
	SERVER_REPOSITORY_ACCESS_PROTOCOL,
	checkServerProviderRepositoryAccess,
	type ServerRepositoryAccess,
	type ServerRepositoryAccessAdapter,
	type ServerRepositoryAccessAdapterRequest,
	type ServerRepositoryAccessObservation,
	type VerifiedServerRepositoryAccess,
} from "./server/repository-access/check.ts";
export * from "./server/registry/enrollment.ts";
export * from "./server/registry/state.ts";
export * from "./server/sessions/contracts.ts";
export * from "./server/sessions/state.ts";
export * from "./verification/custom-checks/index.ts";
export {
	EXIT_OUTCOME_PROTOCOL_VERSION,
	REPAIR_BRIEF_PROTOCOL_VERSION,
	REPAIR_BUNDLE_PROTOCOL_VERSION,
	REPAIR_EXECUTION_INVOCATION_PROTOCOL_VERSION,
	assertValidExitOutcome,
	assertValidRepairBrief,
	assertValidRepairBundle,
	assertValidRepairExecutionInvocation,
	createExitOutcome,
	createRepairBrief,
	createRepairBundle,
	createRepairExecutionInvocation,
	type CreateExitOutcomeInput,
	type CreateRepairGuidanceInput,
	type ExitOutcome,
	type ExitOutcomeRuntimeRouteReference,
	type MatchedRepairProfile,
	type RepairBrief,
	type RepairBriefContext,
	type RepairBundle,
	type RepairBundleCoverage,
	type RepairFindingSignal,
	type RepairGuidanceDigests,
	type RepairGuidanceLimits,
	type RepairGuidanceTruncation,
	type RepairExecutionInvocation,
	type RepairResultSignal,
} from "./verification/repair-bundle.ts";
export {
	MAX_REPAIR_FRONTIER_CHANGES,
	MAX_REPAIR_FRONTIER_FACTS,
	MAX_REPAIR_FRONTIER_REFS_PER_KIND,
	REPAIR_FRONTIER_PROTOCOL_VERSION,
	assertValidRepairFrontier,
	createRepairFrontier,
	type CreateRepairFrontierInput,
	type RepairFrontier,
	type RepairFrontierCandidateBinding,
	type RepairFrontierCoverage,
	type RepairFrontierLimits,
	type RepairFrontierProvenance,
	type RepairFrontierReferenceKind,
	type RepairFrontierReferences,
	type RepairFrontierTruncation,
} from "./verification/repair-frontier.ts";
export {
	MAX_REPAIR_PROFILES_PER_CHECK,
	REPAIR_PROFILE_PROTOCOL_VERSION,
	assertResolvedRepairProfiles,
	defaultRepairProfiles,
	matchRepairProfiles,
	normalizeRepairProfileEntries,
	overlayResolvedRepairProfiles,
	repairProfileSetDigest,
	resolveRepairProfiles,
	type MatchRepairProfilesInput,
	type RepairProfileEntry,
	type RepairProfileLayer,
	type RepairProfileMatch,
	type RepairProfileOutcome,
	type RepairProfileSource,
	type RepairProfileSourceLayer,
	type RepairRouteRecommendation,
	type ResolvedRepairProfile,
} from "./verification/repair-profiles.ts";
export * from "./verification/verification-capabilities.ts";
export {
	CHECK_INVOCATION_PROTOCOL_ID,
	CHECK_INVOCATION_PROTOCOL_VERSION,
	CHECK_INVOCATION_SCHEMA,
	MAX_CHECK_INVOCATION_BYTES,
	CHECK_OBSERVATION_PROTOCOL_ID,
	CHECK_OBSERVATION_PROTOCOL_VERSION,
	CHECK_OBSERVATION_SCHEMA,
	MAX_CHECK_OBSERVATION_BYTES,
	MAX_CHECK_FINDINGS,
	assertValidCheckInvocation,
	createCheckInvocation,
	createLoopExitSuite,
	normalizeCheckObservation,
	type CheckInvocation,
	type CheckInvocationCandidate,
	type CheckInvocationCheckBinding,
	type CheckInvocationContext,
	type CheckInvocationContextItem,
	type CheckInvocationContextSection,
	type CheckInvocationCoverageStatus,
	type CheckInvocationPolicyBinding,
	type CheckObservation,
	type CheckObservationFinding,
	type CheckObservationOutcome,
	type CheckObservationRepairProposal,
	type CreateCheckInvocationInput,
	type LoopExitDeclaration,
	type LoopExitSuite,
	type NormalizeCheckObservationInput,
} from "./verification/contracts.ts";
export {
	admitCheckObservation,
	assembleCheckInvocation,
	type AdmitCheckObservationInput,
	type AssembleCheckInvocationInput,
} from "./verification/protocol.ts";
export {
	VERIFICATION_PROJECTION,
	projectVerificationState,
	type CandidateVerificationProjection,
	type ProjectVerificationProjection,
	type ProjectVerificationProjectionOptions,
	type VerificationCheckProjection,
	type VerificationPolicyProjection,
	type VerificationProjectionCoverage,
	type VerificationProjectionStatus,
	type VerificationReportProjection,
} from "./verification/projection.ts";
export * from "./verification/standard-evidence-checks.ts";
export * from "./verification/standard-evidence-executor.ts";
export * from "./verification/security-collectors.ts";
export * from "./evidence/adapters/sarif.ts";
export * from "./evidence/adapters/junit.ts";
export * from "./evidence/adapters/coverage.ts";
export * from "./evidence/adapters/provider-check-receipt.ts";
export * from "./evidence/adapters/cyclonedx.ts";
export * from "./evidence/adapters/spdx.ts";
export * from "./evidence/adapters/pact.ts";
export * from "./evidence/adapters/openapi.ts";
export * from "./evidence/adapters/materialization.ts";
export {
	materializeDecisionApprovalReceipt,
	materializeDecisionResidualRiskApprovalReceipt,
} from "./decision/exit/evidence.ts";
export {
	DECISION_RESEARCH_COLLECTION_PROTOCOL,
	collectDecisionResearchEvidence,
	type DecisionResearchCollectionReceipt,
	type DecisionResearchCollectionRequest,
	type DecisionResearchCollectionResult,
	type DecisionResearchCollector,
	type DecisionResearchCollectorBinding,
} from "./runtime/effects/research-collection.ts";
export {
	createDecisionGitAdmission,
	type DecisionGitAdmission,
	type DecisionGitAdmissionOptions,
} from "./runtime/admission/git.ts";
export {
	DECISION_CANDIDATE_PRODUCTION_PROTOCOL,
	assertNativeDecisionCandidateProductionRequest,
	createNativeDecisionAttemptExecutor,
	type NativeDecisionAttemptExecutorOptions,
	type NativeDecisionAttemptResult,
	type NativeDecisionCandidateProducer,
	type NativeDecisionCandidateProductionRequest,
	type NativeDecisionEvaluationInput,
	type NativeDecisionExitRuntimeBinding,
} from "./runtime/coordinator/decision-attempt.ts";
export {
	commitNativeDecisionOperationSequence,
	createNativeDecisionOperationSequence,
	type CommitNativeDecisionOperationSequenceInput,
	type NativeDecisionCommitReceipt,
	type CreateNativeDecisionOperationsInput,
	type NativeDecisionOperationSequence,
} from "./runtime/effects/decision-operations.ts";
