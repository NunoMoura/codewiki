import type { LabVerdict } from "../runner/types.ts";
import type { TraceRecord } from "../../src/traces/types.ts";

export interface PipelineFact {
	id: string;
	text: string;
}

export interface PipelineDecisionArtifact {
	rowId: string;
	refs: string[];
	facts: string[];
}

export interface PipelinePlanningWorkItemArtifact {
	id: string;
	decisionRefs: string[];
	pathScopes: string[];
	acceptanceCriteria: string[];
	facts: string[];
}

export interface PipelinePlanningArtifact {
	refs: string[];
	workItems: PipelinePlanningWorkItemArtifact[];
}

export interface PipelineImplementationChangeArtifact {
	id: string;
	workItemRefs: string[];
	acceptanceCovered: string[];
	evidenceRefs: string[];
	facts: string[];
}

export interface PipelineImplementationArtifact {
	refs: string[];
	changes: PipelineImplementationChangeArtifact[];
}

export interface PipelineCaseInput {
	traceId: string;
	userIntent: string;
	expectedFacts: PipelineFact[];
	decision: PipelineDecisionArtifact;
	planning: PipelinePlanningArtifact;
	implementation: PipelineImplementationArtifact;
}

export interface PipelineCase {
	id: string;
	description: string;
	input: PipelineCaseInput;
	expected: LabVerdict;
	weight: number;
}

export interface PipelineTraceHarnessResult {
	records: TraceRecord[];
	decisionEventId: string;
	planningEventId: string;
	implementationEventId: string;
}

export interface PipelineEvaluationIssue {
	id: string;
	message: string;
	severity: "error" | "warning";
}

export interface PipelineCaseScore {
	id: string;
	expected: LabVerdict;
	observed: LabVerdict;
	weight: number;
	score: number;
	loss: number;
	maxLoss: number;
	correct: boolean;
	falsePass: boolean;
	expectedPassRegression: boolean;
	issues: PipelineEvaluationIssue[];
}

export interface PipelineScore {
	metric: "PCE";
	score: number;
	caseCount: number;
	falsePasses: number;
	expectedPassRegressions: number;
	cases: PipelineCaseScore[];
}
