import type { PlanningWorkItem } from "./types.ts";

export function workItemsConflict(left: PlanningWorkItem, right: PlanningWorkItem): boolean {
	return left.pathScopes.some((scope) => right.pathScopes.includes(scope));
}
