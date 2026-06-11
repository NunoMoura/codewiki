export type PlanningResolutionKind =
	| "work-unit"
	| "deferred"
	| "already-implemented"
	| "route-back"
	| "knowledge-only"
	| "non-executable";

export interface PlanningWorkItem {
	id: string;
	title: string;
	decisionRefs: string[];
	outcome: string;
	acceptance: string[];
	pathScopes: string[];
	verification: string[];
	dependsOn: string[];
}

export interface PlanningWorkItemInput {
	id: string;
	title?: string;
	decisionRefs?: string[];
	decision_refs?: string[];
	outcome?: string;
	acceptance?: string[];
	pathScopes?: string[];
	path_scopes?: string[];
	verification?: string[];
	dependsOn?: string[];
	depends_on?: string[];
}

export interface PlanningDecisionResolution {
	decisionRef: string;
	kind: PlanningResolutionKind;
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
