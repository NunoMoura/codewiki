export type PlanningDepth = "micro" | "standard" | string;

export type PlanningResolutionKind =
	| "work-unit"
	| "deferred"
	| "already-implemented"
	| "route-back"
	| "knowledge-only"
	| "non-executable";

export interface AcceptanceCriterion {
	id: string;
	text: string;
}

export interface AcceptanceCriterionInput {
	id?: string;
	text?: string;
}

export type PlanningAssessmentStance =
	| "worker_ready"
	| "needs_split"
	| "concerns"
	| string;
export type PlanningWorkUnitSize =
	| "right_sized"
	| "too_large"
	| "too_small"
	| string;

export type PlanningUncertaintyOwner =
	| "none"
	| "planning"
	| "decision"
	| "user"
	| string;

export type PlanningTriggerKind =
	| "schedule"
	| "trigger"
	| "hook"
	| "manual"
	| string;
export type PlanningTriggerRunMode = "new_trace" | string;
export type PlanningTriggerConcurrency =
	| "skip_if_active"
	| "queue"
	| "replace"
	| string;

export interface PlanningTrigger {
	id: string;
	kind: PlanningTriggerKind;
	runMode: PlanningTriggerRunMode;
	concurrency: PlanningTriggerConcurrency;
	runKeyTemplate: string;
	owner: string;
	trigger: string;
	refs: string[];
}

export interface PlanningTriggerInput {
	id?: string;
	kind?: PlanningTriggerKind;
	runMode?: PlanningTriggerRunMode;
	concurrency?: PlanningTriggerConcurrency;
	runKeyTemplate?: string;
	owner?: string;
	trigger?: string;
	refs?: string[];
}

export interface PlanningWorkAssessmentInput {
	stance?: PlanningAssessmentStance;
	workUnitSize?: PlanningWorkUnitSize;
	work_unit_size?: PlanningWorkUnitSize;
	rightSizing?: string;
	right_sizing?: string;
	independence?: string;
	implementationReadiness?: string;
	implementation_readiness?: string;
	uncertainties?: string[];
	uncertaintyOwner?: PlanningUncertaintyOwner;
	uncertainty_owner?: PlanningUncertaintyOwner;
	uncertaintyResolution?: string;
	uncertainty_resolution?: string;
	rationale?: string;
	concerns?: string[];
}

export interface PlanningWorkAssessment {
	stance: PlanningAssessmentStance;
	workUnitSize: PlanningWorkUnitSize;
	rightSizing: string;
	independence: string;
	implementationReadiness: string;
	uncertainties: string[];
	uncertaintyOwner: PlanningUncertaintyOwner;
	uncertaintyResolution: string;
	rationale: string;
	concerns: string[];
}

export interface PlanningWorkItem {
	id: string;
	title: string;
	decisionRefs: string[];
	outcome: string;
	technicalRequirements: string[];
	acceptance: string[];
	acceptanceCriteria: AcceptanceCriterion[];
	componentRefs: string[];
	pathScopes: string[];
	planningDepth: PlanningDepth;
	verification: string[];
	workerProfile: string;
	planningAssessment: PlanningWorkAssessment;
	dependsOn: string[];
	trigger?: PlanningTrigger;
}

export interface PlanningWorkItemInput {
	id: string;
	title?: string;
	decisionRefs?: string[];
	decision_refs?: string[];
	outcome?: string;
	technicalRequirements?: string[];
	technical_requirements?: string[];
	acceptance?: string[];
	acceptanceCriteria?: AcceptanceCriterionInput[];
	acceptance_criteria?: AcceptanceCriterionInput[];
	componentRefs?: string[];
	component_refs?: string[];
	pathScopes?: string[];
	path_scopes?: string[];
	planningDepth?: PlanningDepth;
	planning_depth?: PlanningDepth;
	verification?: string[];
	workerProfile?: string;
	worker_profile?: string;
	planningAssessment?: PlanningWorkAssessmentInput;
	planning_assessment?: PlanningWorkAssessmentInput;
	dependsOn?: string[];
	depends_on?: string[];
	trigger?: PlanningTriggerInput;
}

export interface PlanningDecisionResolution {
	decisionRef: string;
	kind: PlanningResolutionKind | string;
	workUnitIds: string[];
	evidenceRefs: string[];
	owner?: string;
	trigger?: string;
	rationale?: string;
}

export interface PlanningDecisionResolutionInput {
	decisionRef?: string;
	decision_ref?: string;
	kind?: PlanningResolutionKind | string;
	resolution?: PlanningResolutionKind | string;
	workUnitIds?: string[];
	work_unit_ids?: string[];
	evidenceRefs?: string[];
	evidence_refs?: string[];
	owner?: string;
	trigger?: string;
	rationale?: string;
}
