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
	verification: string[];
	workerProfile: string;
	planningAssessment: PlanningWorkAssessment;
	dependsOn: string[];
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
	verification?: string[];
	workerProfile?: string;
	worker_profile?: string;
	planningAssessment?: PlanningWorkAssessmentInput;
	planning_assessment?: PlanningWorkAssessmentInput;
	dependsOn?: string[];
	depends_on?: string[];
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
