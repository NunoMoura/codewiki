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
} from "./loops/implementation/types.ts";
export type { ImplementationWorkerReportInput } from "./loops/implementation/workers.ts";
export type {
	ImplementationWorkerProof,
	ImplementationWorkerProofConflict,
	ImplementationWorkerProofInput,
} from "./loops/implementation/worker-proof.ts";
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
export type { DecisionCandidateProposal } from "./loops/decision/candidate-proposal.ts";
export type {
	ImplementationAcceptanceEvidenceCandidate,
	ImplementationArchiveDispositionCandidate,
	ImplementationAssessmentCandidate,
	ImplementationCandidateContent,
	ImplementationCommandResultCandidate,
	ImplementationEvidenceCandidate,
	ImplementationSensitiveSurfaceCandidate,
} from "./loops/implementation/candidate-content.ts";
export type {
	PlanningCandidateContent,
	PlanningSprintCandidate,
	PlanningWorkItemCandidate,
} from "./loops/planning/candidate-content.ts";
export {
	REVIEW_ATTEMPT_SCHEMA_VERSION,
	admitReviewEvidence,
	assertReviewEvidenceRecords,
	createReviewAttempt,
	reviewFeedbackFromGate,
	reviewSubjectFromAttempt,
	type CreateReviewAttemptInput,
	type ReviewAttempt,
	type ReviewEvidenceSubmission,
	type ReviewFeedbackItem,
	type ReviewProviderReceiptBinding,
} from "./loops/review/contracts.ts";
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
	TraceBoardView,
	WorkPlanView,
	WorkQueueView,
} from "./work-state/projection-types.ts";
export type {
	ResumeView,
	StatusView,
	TraceQueueView,
	TriggersView,
} from "./runtime/queries/projection-types.ts";
export * from "./changes/trace/index.ts";
export * from "./alignment/graph.ts";
export * from "./alignment/knowledge.ts";
export * from "./alignment/query.ts";
export * from "./knowledge/codewiki-kb-profile.ts";
export * from "./knowledge/system-diagrams.ts";
export * from "./execution/ports.ts";
export * from "./execution/supervisor/node-process-launcher.ts";
export * from "./execution/supervisor/supervisor.ts";
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
export * from "./checks/contracts.ts";
export * from "./checks/cache.ts";
export * from "./checks/identity.ts";
export * from "./checks/protocol.ts";
export * from "./checks/results.ts";
export * from "./checks/runner.ts";
export * from "./checks/index.ts";
export * from "./checks/packs/index.ts";
export * from "./execution/checks/code.ts";
export * from "./execution/checks/model.ts";
export * from "./work-state/checks.ts";
export * from "./execution/security/collectors.ts";
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
	type NativeDecisionGateBinding,
} from "./runtime/coordinator/decision-attempt.ts";
export {
	commitNativeDecisionOperationSequence,
	commitReviewOperationSequence,
	createNativeDecisionOperationSequence,
	createReviewOperationSequence,
	type CommitNativeDecisionOperationSequenceInput,
	type CommitReviewOperationSequenceInput,
	type CreateNativeDecisionOperationsInput,
	type CreateReviewOperationsInput,
	type NativeDecisionCommitReceipt,
	type NativeDecisionOperationSequence,
	type ReviewCommitReceipt,
	type ReviewOperationSequence,
} from "./runtime/effects/gate-operations.ts";
export {
	createReviewGate,
	deriveReviewLifecycleTransition,
	type CreateReviewGateInput,
	type ReviewGateRun,
	type ReviewLifecycleTransition,
	type RunReviewGateInput,
} from "./runtime/lifecycle/gates.ts";
