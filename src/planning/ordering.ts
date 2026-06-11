import type { PlanningWorkItem } from "./types.ts";

export function orderWorkItems(items: PlanningWorkItem[]): PlanningWorkItem[] {
	const remaining = new Map(items.map((item) => [item.id, item]));
	const ordered: PlanningWorkItem[] = [];
	while (remaining.size > 0) {
		const ready = readyWorkItems(remaining);
		if (ready.length === 0) return [...ordered, ...sortedWorkItems([...remaining.values()])];
		for (const item of ready) {
			ordered.push(item);
			remaining.delete(item.id);
		}
	}
	return ordered;
}

function readyWorkItems(remaining: Map<string, PlanningWorkItem>): PlanningWorkItem[] {
	const ready: PlanningWorkItem[] = [];
	for (const item of remaining.values()) {
		let allDependenciesResolved = true;
		for (const dependency of item.dependsOn) {
			if (remaining.has(dependency)) allDependenciesResolved = false;
		}
		if (allDependenciesResolved) ready.push(item);
	}
	return sortedWorkItems(ready);
}

function sortedWorkItems(items: PlanningWorkItem[]): PlanningWorkItem[] {
	return [...items].sort(compareWorkItemId);
}

function compareWorkItemId(left: PlanningWorkItem, right: PlanningWorkItem): number {
	return left.id.localeCompare(right.id);
}
