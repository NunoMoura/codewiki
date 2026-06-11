import type { PlanningWorkItem } from "./types.ts";

export function orderWorkItems(items: PlanningWorkItem[]): PlanningWorkItem[] {
	return [...items].sort((left, right) => left.id.localeCompare(right.id));
}
