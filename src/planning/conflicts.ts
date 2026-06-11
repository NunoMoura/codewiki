import type { PlanningWorkItem } from "./types.ts";

export interface PlanningConflict {
	leftId: string;
	rightId: string;
	pathScopes: string[];
}

export function workItemsConflict(left: PlanningWorkItem, right: PlanningWorkItem): boolean {
	return conflictPathScopes(left, right).length > 0 && !orderedByDependency(left, right);
}

export function planningConflicts(items: PlanningWorkItem[]): PlanningConflict[] {
	const conflicts: PlanningConflict[] = [];
	for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
			const left = items[leftIndex];
			const right = items[rightIndex];
			const pathScopes = conflictPathScopes(left, right);
			if (pathScopes.length > 0 && !orderedByDependency(left, right)) {
				conflicts.push({ leftId: left.id, rightId: right.id, pathScopes });
			}
		}
	}
	return conflicts;
}

function conflictPathScopes(left: PlanningWorkItem, right: PlanningWorkItem): string[] {
	const rightScopes = new Set(right.pathScopes);
	return left.pathScopes.filter((scope) => rightScopes.has(scope));
}

function orderedByDependency(left: PlanningWorkItem, right: PlanningWorkItem): boolean {
	return left.dependsOn.includes(right.id) || right.dependsOn.includes(left.id);
}
