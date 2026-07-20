export type EvidencePolicyClass =
	| "source"
	| "test"
	| "docs"
	| "operational"
	| "review";

export interface ImplementationEvidencePolicy {
	id: string;
	requiredClasses: EvidencePolicyClass[];
	requiredReviewPacks: string[];
	acceptanceLinksRequired: boolean;
	allowFastCacheForAcceptance: boolean;
}
