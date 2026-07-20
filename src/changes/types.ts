export const CHANGE_SCHEMA_VERSION = 2;

export const CHANGE_STATUS_VALUES = [
	"pending",
	"deferred",
	"accepted",
	"rejected",
	"withdrawn",
] as const;
export const CHANGE_VALIDATION_STATE_VALUES = [
	"draft",
	"incomplete",
	"valid",
	"invalid",
	"stale",
] as const;
export const CHANGE_KIND_VALUES = [
	"fix",
	"improve",
	"harden",
	"migrate",
	"introduce",
	"remove",
] as const;
export const CHANGE_TYPE_VALUES = [
	"behavior_change",
	"architecture_change",
	"workflow_change",
	"incident_resolution",
	"security_change",
	"documentation_change",
	"dependency_change",
	"release_change",
] as const;
export const CHANGE_SCOPE_VALUES = [
	"product",
	"system",
	"source",
	"documentation",
	"configuration",
	"runtime",
] as const;
export const CHANGE_RISK_VALUES = ["low", "medium", "high"] as const;
export const CHANGE_EFFORT_VALUES = ["low", "medium", "high"] as const;
export const CHANGE_WORK_SCALE_VALUES = [
	"tiny",
	"small",
	"medium",
	"large",
] as const;
export const CHANGE_ORIGIN_VALUES = [
	"user",
	"agent",
	"worker",
	"telemetry",
	"lab",
	"quality_designer",
	"model_router",
] as const;
export const CHANGE_VALIDATION_SEVERITY_VALUES = [
	"information",
	"warning",
	"error",
] as const;
export const CHANGE_ASSESSMENT_STANCE_VALUES = [
	"aligned",
	"concerns",
	"opposed",
] as const;
export const CHANGE_RECOMMENDATION_VALUES = [
	"accept",
	"revise",
	"defer",
	"reject",
] as const;

export type ChangeStatus = (typeof CHANGE_STATUS_VALUES)[number];
export type ChangeValidationState =
	(typeof CHANGE_VALIDATION_STATE_VALUES)[number];
export type ChangeKind = (typeof CHANGE_KIND_VALUES)[number];
export type ChangeType = (typeof CHANGE_TYPE_VALUES)[number];
export type ChangeScope = (typeof CHANGE_SCOPE_VALUES)[number];
export type ChangeRisk = (typeof CHANGE_RISK_VALUES)[number];
export type ChangeEffort = (typeof CHANGE_EFFORT_VALUES)[number];
export type ChangeWorkScale = (typeof CHANGE_WORK_SCALE_VALUES)[number];
export type ChangeOrigin = (typeof CHANGE_ORIGIN_VALUES)[number];
export type ChangeValidationSeverity =
	(typeof CHANGE_VALIDATION_SEVERITY_VALUES)[number];
export type ChangeAssessmentStance =
	(typeof CHANGE_ASSESSMENT_STANCE_VALUES)[number];
export type ChangeRecommendationValue =
	(typeof CHANGE_RECOMMENDATION_VALUES)[number];

export interface ChangeIntent {
	question: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	nonGoals: string[];
	alternatives: string[];
}

export interface ChangeClassification {
	kind: ChangeKind;
	type: ChangeType;
	scope: ChangeScope;
	affectedLayers: string[];
	targetRefs: string[];
}

export interface ChangeImpact {
	user: string;
	maintainer: string;
	compatibility?: string;
}

export interface ChangeEvidence {
	sourceRefs: string[];
	proofRefs: string[];
	reproduction?: string;
	expectedBehavior?: string;
	sourceBehavior?: string;
	targetBehavior?: string;
}

export interface ChangeKnowledgeImpact {
	topicRefs: string[];
	propagationRefs: string[];
	noImpactRationale?: string;
}

export interface ChangeOutcomeContract {
	successSignals: string[];
	evidenceExpectations: string[];
}

export interface ChangeDeliveryConstraints {
	constraints: string[];
	planningQuestions: string[];
}

export interface ChangeSafety {
	risk: ChangeRisk;
	invariants: string[];
	safetyBoundary?: string;
	failureModes: string[];
	rollbackPlan?: string;
	negativeTestPlan?: string;
	regressionPlan?: string;
}

export interface ChangeValidationIssue {
	code: string;
	severity: ChangeValidationSeverity;
	message: string;
	refs: string[];
}

export interface ChangeAssessment {
	actor: string;
	stance: ChangeAssessmentStance;
	rationale: string;
	concerns: string[];
	evidenceRefs: string[];
}

export interface ChangeRecommendation {
	actor: string;
	value: ChangeRecommendationValue;
	rationale: string;
	evidenceRefs: string[];
}

export interface ChangeValidation {
	state: ChangeValidationState;
	issues: ChangeValidationIssue[];
	assessments: ChangeAssessment[];
	recommendations: ChangeRecommendation[];
	validatorVersion?: string;
	validatedRevision?: number;
	validatedDigest?: string;
}

export interface ChangeEstimates {
	effort?: ChangeEffort;
	workScale?: ChangeWorkScale;
}

export interface ChangeDiscoveryContext {
	traceId?: string;
	taskId?: string;
}

export interface ChangeProvenance {
	origin: ChangeOrigin;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	discoveredWhile?: ChangeDiscoveryContext;
}

export interface ChangeStatusTransition {
	changeId: string;
	revision: number;
	contentDigest: string;
	from: ChangeStatus | null;
	to: ChangeStatus;
	changedBy: string;
	changedAt: string;
	reason?: string;
	authority?: string;
	ref?: string;
}

export interface Change {
	schemaVersion: typeof CHANGE_SCHEMA_VERSION;
	id: string;
	revision: number;
	status: ChangeStatus;
	lastStatusTransition?: ChangeStatusTransition;
	intent: ChangeIntent;
	classification: ChangeClassification;
	impact: ChangeImpact;
	knowledge: ChangeKnowledgeImpact;
	outcome: ChangeOutcomeContract;
	delivery: ChangeDeliveryConstraints;
	evidence: ChangeEvidence;
	safety: ChangeSafety;
	validation: ChangeValidation;
	estimates: ChangeEstimates;
	provenance: ChangeProvenance;
}
