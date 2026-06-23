export type LabLoop = "decision" | "planning" | "implementation";
export type LabMetric = "DEC" | "PEC" | "IEC";
export type LabVerdict = "pass" | "fail" | "block";
export type LabStandardMode = "deterministic" | "agent" | "user";

export interface LabStandardResult {
	id: string;
	mode: LabStandardMode;
	weight: number;
	passed: boolean;
	route: LabVerdict;
	description: string;
	message?: string;
}

export interface LabStandard<TInput> {
	id: string;
	mode: LabStandardMode;
	weight: number;
	description: string;
	evaluate(input: TInput): LabStandardResult | boolean;
}

export interface LabCandidateStandards<TInput> {
	loop: LabLoop;
	metric: LabMetric;
	standards: LabStandard<TInput>[];
}

export interface LabExitResult {
	verdict: LabVerdict;
	weightedScore: number;
	metWeight: number;
	totalWeight: number;
	standards: LabStandardResult[];
}

export interface LabCase<TInput> {
	id: string;
	loop: LabLoop;
	description: string;
	input: TInput;
	expected: LabVerdict;
	weight: number;
}

export interface LabCaseScore {
	id: string;
	loop: LabLoop;
	expected: LabVerdict;
	observed: LabVerdict;
	weight: number;
	loss: number;
	maxLoss: number;
	correct: boolean;
	falsePass: boolean;
	expectedPassRegression: boolean;
}

export interface LabLoopScore {
	loop: LabLoop;
	metric: LabMetric;
	score: number;
	routeQuality: number;
	cases: LabCaseScore[];
	caseCount: number;
	falsePasses: number;
	expectedPassRegressions: number;
	standardCounts: Record<LabStandardMode, number>;
}
