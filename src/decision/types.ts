import type { AcceptedChangeBundle } from "../changes/accepted-bundle.ts";
import type { ChangeScope } from "../changes/types.ts";
import type { ContentProof } from "../git/content-proof.ts";
import type {
	AcceptanceCriterion,
	AcceptanceCriterionInput,
} from "../planning/types.ts";
import type { ImplementationMode, LoopRouteKind } from "../traces/types.ts";
import type { DecisionEvidencePolicy } from "./policy-profiles.ts";

export const TRACEABILITY_EXEMPTION_VALUES = [
	"generated",
	"runtime",
	"mechanical",
] as const;
export const DECISION_APPROVAL_STATUS_VALUES = [
	"pending",
	"approved",
	"rejected",
	"deferred",
	"edited",
] as const;
export const DECISION_INTENT_KIND_VALUES = [
	"debug",
	"fix",
	"harden",
	"improve",
	"migrate",
	"docs",
	"release",
] as const;
export const DECISION_RECOMMENDATION_VALUES = [
	"approve",
	"reject",
	"defer",
	"ask_user",
] as const;
export const DECISION_EFFORT_VALUES = ["low", "medium", "high"] as const;
export const DECISION_WORK_SCALE_VALUES = [
	"tiny",
	"small",
	"normal",
	"large",
] as const;
export const DECISION_PLANNING_DEPTH_VALUES = ["micro", "standard"] as const;
export const DECISION_ROUTE_TARGET_VALUES = [
	"planning",
	"implementation",
] as const;
export const DECISION_IMPLEMENTATION_MODE_VALUES = [
	"tdd",
	"targeted_checks",
] as const;
export const DECISION_APPROVAL_AUTHORITY_VALUES = [
	"user",
	"maintainer",
	"agent",
] as const;
export const DECISION_AGENT_STANCE_VALUES = [
	"aligned",
	"concerns",
	"reject",
	"needs_clarification",
] as const;

export type TraceabilityExemption =
	(typeof TRACEABILITY_EXEMPTION_VALUES)[number];
export type DecisionApprovalStatus =
	(typeof DECISION_APPROVAL_STATUS_VALUES)[number];
export type DecisionIntentKind = (typeof DECISION_INTENT_KIND_VALUES)[number];
export type DecisionRecommendation =
	(typeof DECISION_RECOMMENDATION_VALUES)[number];
export type DecisionEffort = (typeof DECISION_EFFORT_VALUES)[number];
export type DecisionWorkScale = (typeof DECISION_WORK_SCALE_VALUES)[number];
export type DecisionPlanningDepth =
	(typeof DECISION_PLANNING_DEPTH_VALUES)[number];
export type DecisionRouteTarget = (typeof DECISION_ROUTE_TARGET_VALUES)[number];
export type DecisionImplementationMode =
	(typeof DECISION_IMPLEMENTATION_MODE_VALUES)[number];
export type DecisionApprovalAuthority =
	(typeof DECISION_APPROVAL_AUTHORITY_VALUES)[number];
export type DecisionAgentStance = (typeof DECISION_AGENT_STANCE_VALUES)[number];
export type DecisionRisk = "low" | "medium" | "high" | string;

export interface DecisionAgentAssessmentInput {
	stance?: DecisionAgentStance | string;
	userAlignment?: string;
	projectBenefit?: string;
	rationale?: string;
	concerns?: string[];
}

export interface DecisionAgentAssessment {
	stance: DecisionAgentStance | string;
	userAlignment: string;
	projectBenefit: string;
	rationale: string;
	concerns: string[];
}

export interface DecisionDirectImplementationScopeInput {
	acceptance?: string[];
	acceptanceCriteria?: AcceptanceCriterionInput[];
	componentRefs?: string[];
	pathScopes?: string[];
	verification?: string[];
}

export interface DecisionDirectImplementationScope {
	acceptance: string[];
	acceptanceCriteria: AcceptanceCriterion[];
	componentRefs: string[];
	pathScopes: string[];
	verification: string[];
}

export interface DecisionChangeInput {
	id?: string;
	question?: string;
	kind?: DecisionIntentKind | string;
	policyProfileId?: string;
	currentState?: string;
	desiredState?: string;
	rationale?: string;
	userImpact?: string;
	maintainerImpact?: string;
	effort?: DecisionEffort | string;
	workScale?: DecisionWorkScale | string;
	planningDepth?: DecisionPlanningDepth | string;
	routeTarget?: DecisionRouteTarget | string;
	routeKind?: LoopRouteKind | string;
	routeRationale?: string;
	implementationMode?: ImplementationMode | string;
	directImplementationScope?: DecisionDirectImplementationScopeInput;
	affectedLayers?: string[];
	risk?: DecisionRisk;
	approval?: DecisionApprovalStatus | string;
	approvalAuthority?: DecisionApprovalAuthority | string;
	approvalRef?: string;
	recommendation?: DecisionRecommendation | string;
	recommendationRationale?: string;
	agentAssessment?: DecisionAgentAssessmentInput;
	alternatives?: string[];
	sourceRefs?: string[];
	proofRefs?: string[];
	scope?: ChangeScope;
	traceabilityExemption?: TraceabilityExemption | string;
	noKbImpactReason?: string;
	targetRefs?: string[];
	hypothesis?: string;
	invariant?: string;
	probe?: string;
	expectedSafeBehavior?: string;
	stopCondition?: string;
	reproduction?: string;
	expectedBehavior?: string;
	regressionPlan?: string;
	safetyBoundary?: string;
	failureModes?: string[];
	negativeTestPlan?: string;
	compatibilityImpact?: string;
	currentPain?: string;
	desiredOutcome?: string;
	successSignal?: string;
	nonGoals?: string[];
	sourceBehavior?: string;
	targetBehavior?: string;
	preservedInvariants?: string[];
	equivalenceProof?: string;
	rollbackPlan?: string;
}

export interface DecisionChange {
	id: string;
	question: string;
	kind: DecisionIntentKind | string;
	policyProfileId: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	userImpact: string;
	maintainerImpact: string;
	effort: DecisionEffort | string;
	workScale: DecisionWorkScale | string;
	planningDepth: DecisionPlanningDepth | string;
	routeTarget: DecisionRouteTarget | string;
	routeKind: LoopRouteKind | string;
	routeRationale: string;
	implementationMode?: ImplementationMode | string;
	directImplementationScope: DecisionDirectImplementationScope;
	affectedLayers: string[];
	risk: DecisionRisk;
	approval: DecisionApprovalStatus;
	approvalAuthority: DecisionApprovalAuthority | string;
	approvalRef?: string;
	recommendation: DecisionRecommendation | string;
	recommendationRationale: string;
	agentAssessment: DecisionAgentAssessment;
	alternatives: string[];
	sourceRefs: string[];
	proofRefs: string[];
	scope: ChangeScope;
	traceabilityExemption?: TraceabilityExemption | string;
	noKbImpactReason?: string;
	targetRefs: string[];
	hypothesis?: string;
	invariant?: string;
	probe?: string;
	expectedSafeBehavior?: string;
	stopCondition?: string;
	reproduction?: string;
	expectedBehavior?: string;
	regressionPlan?: string;
	safetyBoundary?: string;
	failureModes: string[];
	negativeTestPlan?: string;
	compatibilityImpact?: string;
	currentPain?: string;
	desiredOutcome?: string;
	successSignal?: string;
	nonGoals: string[];
	sourceBehavior?: string;
	targetBehavior?: string;
	preservedInvariants: string[];
	equivalenceProof?: string;
	rollbackPlan?: string;
}

export interface SprintBoundaryAssessmentInput {
	stance?: "coherent" | "split_required" | string;
	rationale?: string;
}

export interface SprintBoundaryAssessment {
	stance: "coherent" | "split_required" | string;
	rationale: string;
}

export interface SprintBoundaryInput {
	accountableGoal?: string;
	knowledgeTopics?: string[];
	noKnowledgeImpactReason?: string;
	dependencies?: string[];
	rollbackBoundary?: string;
	assessment?: SprintBoundaryAssessmentInput;
}

export interface SprintBoundary {
	accountableGoal: string;
	knowledgeTopics: string[];
	noKnowledgeImpactReason?: string;
	dependencies: string[];
	rollbackBoundary: string;
	assessment: SprintBoundaryAssessment;
}

export interface SprintProposalInput {
	id?: string;
	summary?: string;
	sourceRefs?: string[];
	changes?: DecisionChangeInput[];
	sprintBoundary?: SprintBoundaryInput;
	createdAt?: string;
	updatedAt?: string;
}

export interface SprintProposal {
	id: string;
	summary: string;
	sourceRefs: string[];
	changes: DecisionChange[];
	sprintBoundary?: SprintBoundary;
	createdAt: string;
	updatedAt: string;
}

export interface KnowledgeDelta {
	updatedRefs: string[];
	sections: string[];
	beforeDigest?: string;
	afterDigest?: string;
	noImpactReason?: string;
	summary?: string;
}

export interface CurrentStatePacket {
	summary: string;
	refs: string[];
	observedAt?: string;
	contentProof?: ContentProof;
}

export interface ApprovedChangePolicyProfile {
	changeId: string;
	policyProfileId: string;
	pipelineProfileId: string;
	loopQualityProfileId: string;
	evidencePolicy: DecisionEvidencePolicy;
}

export interface ActiveTraceGoal {
	traceId: string;
	title?: string;
	status: string;
	decisionRefs: string[];
	pathScopes: string[];
	blockers?: string[];
}

export interface DecisionOutput {
	id: string;
	traceId: string;
	acceptedChangeBundle?: AcceptedChangeBundle;
	proposalId: string;
	summary: string;
	approvedChangeIds: string[];
	requirementIds: string[];
	policyProfiles?: ApprovedChangePolicyProfile[];
	sprintBoundary?: SprintBoundary;
	knowledgeDelta: KnowledgeDelta;
	currentStatePacket: CurrentStatePacket;
	refs: string[];
	createdAt: string;
}

export type DecisionChangeAction =
	| "accept"
	| "reject"
	| "defer"
	| "alternative"
	| "edit";

export interface DecisionChangeActionInput {
	changeId: string;
	action: DecisionChangeAction;
	change?: DecisionChangeInput;
	alternative?: string;
}

export interface DecisionChangeActionFailure {
	changeId: string;
	action: string;
	error: string;
}
