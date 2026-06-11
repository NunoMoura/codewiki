export interface DecisionRecord {
	id: string;
	question: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	risks: string[];
	sourceRefs: string[];
}
