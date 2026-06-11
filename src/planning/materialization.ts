import type { PlanningWorkItem } from "./types.ts";

export function materializesDecisionRef(item: PlanningWorkItem, decisionRef: string): boolean {
	return item.decisionRefs.includes(decisionRef);
}
