import type {LoopExitDeclaration} from "../../checks/contracts.ts";

export const planningLoopExitDeclaration = Object.freeze({
	loop: "planning" as const,
}) satisfies LoopExitDeclaration<"planning">;

export type PlanningDepth = "micro" | "standard" | string;

export interface AcceptanceCriterion {
	id: string;
	text: string;
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
	changeRefs: string[];
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
