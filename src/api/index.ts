export const CODEWIKI_EXTENSION_AVAILABLE = true as const;

export * from "./state.ts";
export * from "./wiki-archive.ts";
export * from "./wiki-config.ts";
export * from "./wiki-decide.ts";
export { runWikiImplement } from "./wiki-implement.ts";
export type {
	ImplementationEvidenceSubmission,
	RunWikiImplementInput,
	RunWikiImplementResult,
	WikiImplementMode,
	WikiImplementReviewEvidenceResult,
} from "./wiki-implement.ts";
export { runWikiChange } from "./wiki-change.ts";
export type {
	RunWikiChangeInput,
	RunWikiChangeResult,
	WikiChangeSummary,
	WikiChangeOperation,
} from "./wiki-change.ts";
export * from "./wiki-okf.ts";
export { runWikiPlan } from "./wiki-plan.ts";
export type {
	PlanningEpochReport,
	RunWikiPlanInput,
	RunWikiPlanResult,
	WikiPlanMode,
} from "./wiki-plan.ts";
export * from "./wiki-runtime.ts";
export type {
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationWorkerClaim,
} from "../implementation/types.ts";
export type { ImplementationWorkerReportInput } from "../implementation/workers.ts";
export type {
	ImplementationWorkerProof,
	ImplementationWorkerProofConflict,
	ImplementationWorkerProofInput,
} from "../implementation/worker-proof.ts";
export type {
	SourceMapComponent,
	SourceMapContract,
	SourceMapDefaults,
	SourceMapMarkdownEntry,
	SourceMapValidationInput,
	SourceMapValidationIssue,
	SourceMapValidationIssueCode,
} from "../knowledge/source-map.ts";
export type { ContentProof } from "../git/content-proof.ts";
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
} from "../evidence/contracts.ts";
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
} from "../changes/types.ts";
export type { ChangeRecord } from "../changes/records.ts";
export {
	CHANGE_DEFECT_PROFILE_PROTOCOL,
	normalizeChangeDefectProfile,
	normalizeChangeSecurityProfile,
} from "../changes/defect-profile.ts";
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
} from "../changes/defect-profile.ts";
export {
	CHANGE_INTAKE_MATERIAL_PROTOCOL,
	CHANGE_INTAKE_MATERIAL_TYPES,
} from "../changes/intake/contracts.ts";
export {
	normalizeChangeIntakeContent,
	normalizeChangeIntakeMaterial,
} from "../changes/intake/normalize.ts";
export * from "../changes/triage/contracts.ts";
export {
	buildBacklogTriageProjection,
	type BuildBacklogTriageProjectionInput,
} from "../changes/triage/projection.ts";
export {queryBacklogTriage} from "../changes/triage/query.ts";
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
} from "../changes/intake/producers.ts";
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
} from "../changes/intake/producers.ts";
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
} from "../changes/intake/contracts.ts";
export type {
	ChangeQuery,
	ChangeStore,
	ChangeStoreSnapshot,
} from "../changes/store.ts";
export type {
	GitStatusSnapshot,
	GitStatusSnapshotInput,
	RuntimeWorktreeGitInputs,
} from "../git/status.ts";
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
} from "../git/worktrees.ts";
export type { DecisionCandidateProposal } from "../decision/candidate-proposal.ts";
export type {
	ImplementationAcceptanceEvidenceCandidate,
	ImplementationArchiveDispositionCandidate,
	ImplementationAssessmentCandidate,
	ImplementationCandidateContent,
	ImplementationCommandResultCandidate,
	ImplementationEvidenceCandidate,
	ImplementationSensitiveSurfaceCandidate,
} from "../implementation/candidate-content.ts";
export type {
	PlanningCandidateContent,
	PlanningSprintCandidate,
	PlanningWorkItemCandidate,
} from "../planning/candidate-content.ts";
export type { ProjectSnapshot } from "../project/snapshot.ts";
export type { RuntimeWorkUnitClaimPolicyDecision } from "../runtime/policy.ts";
export * from "../runtime/coordinator/project-coordinator.ts";
export {
	CHANGE_INTAKE_RUNTIME_PROTOCOL,
	createChangeIntakeRuntime,
} from "../runtime/change-intake.ts";
export type {
	AuthenticatedChangeIntakeSource,
	ChangeIntakeAuthenticationRequest,
	ChangeIntakeCommand,
	ChangeIntakeCorrelationRequest,
	ChangeIntakeReceipt,
	ChangeIntakeRuntime,
	ChangeIntakeSourceAuthenticator,
	ChangeIntakeSourceCorrelator,
} from "../runtime/change-intake.ts";
export { runRuntimeSemanticExecutor } from "../runtime/semantic-executor.ts";
export type {
	RunRuntimeSemanticExecutorInput,
	RunRuntimeSemanticExecutorResult,
	RuntimeDecisionContext,
	RuntimeDecisionInvocation,
	RuntimeImplementationContext,
	RuntimeImplementationInvocation,
	RuntimePlanningContext,
	RuntimePlanningInvocation,
	RuntimeSemanticAdapters,
	RuntimeSemanticContext,
	RuntimeSemanticMode,
	RuntimeSemanticOutcome,
} from "../runtime/semantic-executor.ts";
export type {
	CreateRuntimeHandoffManifestOptions,
	RuntimeHandoffAction,
	RuntimeHandoffCompletionContract,
	RuntimeHandoffManifest,
	RuntimeHandoffReleaseInstructions,
	RuntimeHandoffRuntimeResult,
	RuntimeHandoffWorker,
} from "../runtime/handoff.ts";
export type {
	TraceCloseReleaseNotes,
	TraceReleaseNoteChange,
	TraceReleaseNoteCheck,
} from "../traces/release-notes.ts";
export type { TraceEvent, TraceRecord } from "../traces/types.ts";
export { buildProjectWorkState } from "../work-state/project.ts";
export { buildWorkState } from "../work-state/projector.ts";
export type {
	WorkState,
	WorkStateAssignment,
	WorkStateBlocker,
	WorkStateChange,
	WorkStateSprint,
	WorkStateWorkItem,
} from "../work-state/types.ts";
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
} from "../views/types.ts";
