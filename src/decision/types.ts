import type { SourceRef } from "../shared/types.ts";

export interface DecisionRecord {
	id: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	risks: string[];
	sourceRefs: SourceRef[];
}
