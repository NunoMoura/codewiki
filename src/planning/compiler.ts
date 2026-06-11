import type { PlanningWorkItem } from "./types.ts";

export function compilePlan(items: PlanningWorkItem[]): PlanningWorkItem[] {
	return items.map((item) => ({
		...item,
		decisionRefs: [...item.decisionRefs],
		acceptance: [...item.acceptance],
	}));
}
