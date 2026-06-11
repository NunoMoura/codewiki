import type { ContentProof } from "../git/content-proof.ts";

export interface ImplementationChange {
	id: string;
	planningRefs: string[];
	codePaths: string[];
	docPaths: string[];
	testPaths: string[];
	checks: string[];
	acceptanceEvidence: string[];
	contentProof?: ContentProof;
	publicationRefs: string[];
}

export interface ImplementationChangeInput {
	id: string;
	planningRefs?: string[];
	planning_refs?: string[];
	codePaths?: string[];
	code_paths?: string[];
	docPaths?: string[];
	doc_paths?: string[];
	testPaths?: string[];
	test_paths?: string[];
	checks?: string[];
	checks_run?: string[];
	acceptanceEvidence?: string[];
	acceptance_evidence?: string[];
	contentProof?: ContentProof;
	content_proof?: ContentProof;
	publicationRefs?: string[];
	publication_refs?: string[];
}

export type ImplementationGateIssueCode =
	| "missing_planning_coverage"
	| "unknown_planning_ref"
	| "invalid_change"
	| "missing_content_proof";

export interface ImplementationGateIssue {
	code: ImplementationGateIssueCode;
	planningRef?: string;
	changeId?: string;
	message: string;
}

export interface ImplementationGateInput {
	planningRefs: string[];
	changes: ImplementationChange[];
}

export interface ImplementationGateResult {
	passed: boolean;
	issues: ImplementationGateIssue[];
	coveredPlanningRefs: string[];
	changeIds: string[];
}
