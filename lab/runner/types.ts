export type LabLoop = "decision" | "planning" | "implementation";
export type LabLoopMetric = "DEC" | "PEC" | "IEC";
export type LabMetric = LabLoopMetric | "PCE" | "HCE";
export type LabVerdict = "pass" | "fail" | "block";
export type LabFailureClass =
	| "contract"
	| "specificity"
	| "traceability"
	| "authority"
	| "scope"
	| "evidence"
	| "verification"
	| "production_readiness"
	| string;
export type LabStandardMode = "deterministic" | "agent" | "user";
export type LabQualityStandardMethod =
	| "deterministic"
	| "agent_self_assessment"
	| "model_judge"
	| "human_authority"
	| "external_evidence";
export type LabQualityStandardType =
	| "loop_contract"
	| "security"
	| "maintainability"
	| "robustness"
	| "project_fit"
	| "user_value"
	| "scope_control"
	| "reversibility"
	| "evidence_quality"
	| "trace_fidelity"
	| "pipeline_carryover"
	| "risk_authority";
export type LabQualityLayer =
	| "hard_gate"
	| "input_contract"
	| "trace_fidelity"
	| "coverage"
	| "specificity"
	| "scope_control"
	| "evidence_quality"
	| "risk_authority"
	| "project_fit"
	| "repairability"
	| "pipeline_carryover"
	| "exit_loss";
export type LabRepairTarget = LabLoop | "kb" | "source" | "tests" | "trace";

export interface LabQualityEvidence {
	kind: string;
	ref: string;
	summary?: string;
}

export interface LabStandardResult {
	id: string;
	mode: LabStandardMode;
	weight: number;
	passed: boolean;
	route: LabVerdict;
	description: string;
	method?: LabQualityStandardMethod;
	standardType?: LabQualityStandardType;
	layer?: LabQualityLayer;
	score?: number;
	cost?: number;
	loss?: number;
	hardGate?: boolean;
	repairTarget?: LabRepairTarget;
	evidence?: LabQualityEvidence[];
	message?: string;
}

export interface LabStandard<TInput> {
	id: string;
	mode: LabStandardMode;
	weight: number;
	description: string;
	method?: LabQualityStandardMethod;
	standardType?: LabQualityStandardType;
	layer?: LabQualityLayer;
	cost?: number;
	hardGate?: boolean;
	repairTarget?: LabRepairTarget;
	evaluate(input: TInput): LabStandardResult | boolean;
}

export interface LabCandidateStandards<TInput> {
	loop: LabLoop;
	metric: LabLoopMetric;
	graphId: string;
	graphVersion: string;
	schemaVersion: number;
	layers: LabQualityLayer[];
	standards: LabStandard<TInput>[];
}

export interface LabExitResult {
	verdict: LabVerdict;
	weightedScore: number;
	metWeight: number;
	totalWeight: number;
	loss: number;
	maxLoss: number;
	normalizedLoss: number;
	lossThreshold: number;
	standards: LabStandardResult[];
}

export interface LabExpectedFailure {
	standardId: string;
	failureClass: LabFailureClass;
}

export interface LabCase<TInput> {
	id: string;
	loop: LabLoop;
	description: string;
	input: TInput;
	expected: LabVerdict;
	weight: number;
	expectedFailures?: LabExpectedFailure[];
}

export interface LabCaseScore {
	id: string;
	loop: LabLoop;
	expected: LabVerdict;
	observed: LabVerdict;
	weight: number;
	loss: number;
	maxLoss: number;
	routeLoss: number;
	reasonLoss: number;
	correct: boolean;
	routeCorrect: boolean;
	reasonCorrect: boolean;
	falsePass: boolean;
	expectedPassRegression: boolean;
	expectedFailures: LabExpectedFailure[];
	observedFailureStandards: string[];
	missedExpectedFailures: LabExpectedFailure[];
}

export interface LabLoopScore {
	loop: LabLoop;
	metric: LabMetric;
	score: number;
	routeQuality: number;
	reasonQuality: number;
	cases: LabCaseScore[];
	caseCount: number;
	falsePasses: number;
	expectedPassRegressions: number;
	standardCounts: Record<LabStandardMode, number>;
}
