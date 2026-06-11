import type { PlanningWorkItem } from "./types.ts";

export function planningItemIsExecutable(item: PlanningWorkItem): boolean {
	return Boolean(item.id && item.decisionRefs.length && item.outcome && item.acceptance.length);
}
