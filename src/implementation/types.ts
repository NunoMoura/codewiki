import type { ContentProof } from "../git/content-proof.ts";
import type { ExitDetails } from "../traces/types.ts";

export type CheckStatus = "pass" | "fail" | "blocked" | "not-run";
export type CheckPhase = "red" | "green" | "refactor" | "verify";

export interface CheckResult {
	command: string;
	status: CheckStatus;
	phase?: CheckPhase;
	criterionId?: string;
	exitCode?: number;
	outputRef?: string;
	summary?: string;
}

export interface AcceptanceEvidenceItem {
	criterionId?: string;
	summary: string;
	evidenceRefs: string[];
}

export type ImplementationAssessmentStance =
	| "production_ready"
	| "concerns"
	| "blocked"
	| string;
export type ImplementationUncertaintyOwner =
	| "none"
	| "implementation"
	| "planning"
	| "decision"
	| "user"
	| string;
export type ImplementationApprovalAuthority =
	| "user"
	| "maintainer"
	| "agent"
	| string;

export interface ImplementationQualityAssessmentInput {
	stance?: ImplementationAssessmentStance;
	maintainability?: string;
	simplicity?: string;
	projectStyle?: string;
	project_style?: string;
	errorHandling?: string;
	error_handling?: string;
	uncertainties?: string[];
	uncertaintyOwner?: ImplementationUncertaintyOwner;
	uncertainty_owner?: ImplementationUncertaintyOwner;
	uncertaintyResolution?: string;
	uncertainty_resolution?: string;
	rationale?: string;
	concerns?: string[];
}

export interface ImplementationQualityAssessment {
	stance: ImplementationAssessmentStance;
	maintainability: string;
	simplicity: string;
	projectStyle: string;
	errorHandling: string;
	uncertainties: string[];
	uncertaintyOwner: ImplementationUncertaintyOwner;
	uncertaintyResolution: string;
	rationale: string;
	concerns: string[];
}

export interface SensitiveSurfaceAssessmentInput {
	security?: string;
	privacy?: string;
	accessibility?: string;
	dependencyRisk?: string;
	dependency_risk?: string;
	rationale?: string;
}

export interface SensitiveSurfaceAssessment {
	security: string;
	privacy: string;
	accessibility: string;
	dependencyRisk: string;
	rationale: string;
}

export interface AcceptanceRequirement {
	planningRef: string;
	criterionId: string;
	text: string;
}

export interface PlanningImplementationScope {
	planningRef: string;
	workUnitId: string;
	componentRefs: string[];
	pathScopes: string[];
	verification: string[];
}

export type ImplementationWorkerStatus = "completed" | "blocked" | "failed";
export type ImplementationWorkerClaimStatus = "active" | "released" | "expired";

export interface ImplementationWorkerClaim {
	claimId: string;
	workerId: string;
	workUnitId: string;
	planningRefs: string[];
	refs: string[];
	status: ImplementationWorkerClaimStatus;
	createdAt?: string;
	expiresAt?: string;
}

export interface ImplementationWorkerSummary {
	workerId: string;
	workUnitId: string;
	planningRefs: string[];
	status: ImplementationWorkerStatus;
	claimId?: string;
	message?: string;
	refs: string[];
	sessionId?: string;
	sessionFile?: string;
	proof?: import("./worker-proof.ts").ImplementationWorkerProof;
}

export interface ImplementationChange {
	id: string;
	planningRefs: string[];
	workerId?: string;
	workUnitId?: string;
	claimId?: string;
	sessionId?: string;
	sessionFile?: string;
	codePaths: string[];
	docPaths: string[];
	testPaths: string[];
	checks: string[];
	checkResults: CheckResult[];
	acceptanceEvidence: string[];
	acceptanceEvidenceItems: AcceptanceEvidenceItem[];
	contentProof?: ContentProof;
	implementationAssessment: ImplementationQualityAssessment;
	sensitiveSurfaceAssessment: SensitiveSurfaceAssessment;
	approvalAuthority: ImplementationApprovalAuthority;
	approvalRef?: string;
	publicationRefs: string[];
}

export interface CheckResultInput {
	command?: string;
	status?: CheckStatus | string;
	phase?: CheckPhase | string;
	tddPhase?: CheckPhase | string;
	tdd_phase?: CheckPhase | string;
	criterionId?: string;
	criterion_id?: string;
	exitCode?: number;
	exit_code?: number;
	outputRef?: string;
	output_ref?: string;
	summary?: string;
}

export interface AcceptanceEvidenceInput {
	criterionId?: string;
	criterion_id?: string;
	summary?: string;
	evidenceRefs?: string[];
	evidence_refs?: string[];
}

export interface ImplementationChangeInput {
	id: string;
	planningRefs?: string[];
	planning_refs?: string[];
	workerId?: string;
	worker_id?: string;
	workUnitId?: string;
	work_unit_id?: string;
	claimId?: string;
	claim_id?: string;
	sessionId?: string;
	session_id?: string;
	sessionFile?: string;
	session_file?: string;
	codePaths?: string[];
	code_paths?: string[];
	docPaths?: string[];
	doc_paths?: string[];
	testPaths?: string[];
	test_paths?: string[];
	checks?: string[];
	checks_run?: string[];
	checkResults?: CheckResultInput[];
	check_results?: CheckResultInput[];
	acceptanceEvidence?: string[];
	acceptance_evidence?: string[];
	acceptanceEvidenceItems?: AcceptanceEvidenceInput[];
	acceptance_evidence_items?: AcceptanceEvidenceInput[];
	contentProof?: ContentProof;
	content_proof?: ContentProof;
	implementationAssessment?: ImplementationQualityAssessmentInput;
	implementation_assessment?: ImplementationQualityAssessmentInput;
	sensitiveSurfaceAssessment?: SensitiveSurfaceAssessmentInput;
	sensitive_surface_assessment?: SensitiveSurfaceAssessmentInput;
	approvalAuthority?: ImplementationApprovalAuthority;
	approval_authority?: ImplementationApprovalAuthority;
	approvalRef?: string;
	approval_ref?: string;
	publicationRefs?: string[];
	publication_refs?: string[];
}

export type ImplementationExitIssueCode =
	| "missing_planning_coverage"
	| "unknown_planning_ref"
	| "worker_failed"
	| "worker_blocked"
	| "missing_worker_claim"
	| "unknown_worker_claim"
	| "inactive_worker_claim"
	| "worker_claim_mismatch"
	| "worker_proof_failed"
	| "worker_proof_conflict"
	| "invalid_change"
	| "missing_check_results"
	| "invalid_check_result"
	| "failed_check"
	| "missing_planned_verification"
	| "missing_package_pack_check"
	| "invalid_tdd_evidence"
	| "missing_tdd_red_evidence"
	| "missing_tdd_green_evidence"
	| "unknown_tdd_criterion"
	| "missing_acceptance_evidence"
	| "invalid_acceptance_evidence"
	| "missing_acceptance_criterion_coverage"
	| "unknown_acceptance_criterion"
	| "missing_component_ref"
	| "unknown_component_ref"
	| "invalid_component_contract"
	| "path_outside_component_scope"
	| "missing_component_test_coverage"
	| "missing_changed_path"
	| "missing_evidence_path"
	| "missing_content_proof"
	| "missing_aggregate_content_proof"
	| "missing_implementation_assessment"
	| "implementation_not_production_ready"
	| "missing_implementation_uncertainty_resolution"
	| "unresolved_implementation_uncertainty"
	| "missing_security_privacy_assessment"
	| "missing_accessibility_assessment"
	| "missing_dependency_risk_assessment"
	| "missing_release_approval"
	| "invalid_release_approval_ref"
	| "duplicate_change_id"
	| "invalid_traceability_ref";

export interface ImplementationExitIssue {
	code: ImplementationExitIssueCode;
	planningRef?: string;
	changeId?: string;
	ref?: string;
	componentRef?: string;
	route?: import("../traces/types.ts").ExitRoute;
	workerId?: string;
	claimId?: string;
	message: string;
}

export interface ImplementationExitInput {
	planningRefs: string[];
	changes: ImplementationChange[];
	acceptanceRequirements?: AcceptanceRequirement[];
	planningScopes?: PlanningImplementationScope[];
	componentMap?: import("../knowledge/file-structure-map.ts").FileStructureMapContract;
	existingPaths?: string[];
	requireTddEvidence?: boolean;
	aggregateContentProof?: ContentProof;
	workerResults?: ImplementationWorkerSummary[];
	workerProofs?: import("./worker-proof.ts").ImplementationWorkerProof[];
	workerProofConflicts?: import("./worker-proof.ts").ImplementationWorkerProofConflict[];
	expectedWorkerBaseSha?: string;
	workerClaims?: ImplementationWorkerClaim[];
}

export interface ImplementationExitResult extends ExitDetails {
	passed: boolean;
	issues: ImplementationExitIssue[];
	coveredPlanningRefs: string[];
	changeIds: string[];
}
