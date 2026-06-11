import type { SourceRef } from "../shared/types.ts";

export interface PlanningWorkItem {
	id: string;
	decisionRefs: SourceRef[];
	outcome: string;
	acceptance: string[];
}
