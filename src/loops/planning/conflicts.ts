import type { PlanningWorkUnit } from "./types.ts";

export interface PlanningConflict {
	leftId: string;
	rightId: string;
	pathScopes: string[];
}

export function workUnitsConflict(
	left: PlanningWorkUnit,
	right: PlanningWorkUnit,
): boolean {
	return (
		conflictPathScopes(left, right).length > 0 &&
		!orderedByDependency(left, right)
	);
}

export function planningConflicts(
	items: PlanningWorkUnit[],
): PlanningConflict[] {
	const conflicts: PlanningConflict[] = [];
	for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < items.length;
			rightIndex += 1
		) {
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

function conflictPathScopes(
	left: PlanningWorkUnit,
	right: PlanningWorkUnit,
): string[] {
	const conflicts: string[] = [];
	for (const leftScope of left.pathScopes) {
		for (const rightScope of right.pathScopes) {
			const overlap = overlappingScope(leftScope, rightScope);
			if (overlap) conflicts.push(overlap);
		}
	}
	return unique(conflicts);
}

function overlappingScope(left: string, right: string): string | undefined {
	const leftPath = normalizePathScope(left);
	const rightPath = normalizePathScope(right);
	if (!leftPath || !rightPath) return undefined;
	if (leftPath === rightPath) return leftPath;
	if (rightPath.startsWith(`${leftPath}/`)) return leftPath;
	if (leftPath.startsWith(`${rightPath}/`)) return rightPath;
	return undefined;
}

function orderedByDependency(
	left: PlanningWorkUnit,
	right: PlanningWorkUnit,
): boolean {
	return left.dependsOn.includes(right.id) || right.dependsOn.includes(left.id);
}

function normalizePathScope(pathScope: string): string {
	return pathScope.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
