import type { WorktreeRef } from "../git/worktrees.ts";
import { pathMatchesPattern } from "../knowledge/file-structure-map.ts";
import type { WorkQueueItem, WorkQueueView } from "../views/types.ts";

type RuntimeDispatchHoldReason = "capacity" | "path_conflict";

export interface RuntimeDispatchItem {
	workUnitId: string;
	traceId: string;
	title: string;
	planningRefs: string[];
	componentRefs: string[];
	pathScopes: string[];
	traceRefs: string[];
	worktree?: WorktreeRef;
	sourceEventId?: string;
}

export interface RuntimeDispatchHeldItem extends RuntimeDispatchItem {
	reason: RuntimeDispatchHoldReason;
	conflictsWith?: string;
}

export interface RuntimeDispatchPlan {
	maxWorkers: number;
	activeClaims: RuntimeDispatchItem[];
	availableSlots: number;
	dispatch: RuntimeDispatchItem[];
	held: RuntimeDispatchHeldItem[];
}

export function planRuntimeDispatch(
	queue: WorkQueueView,
	options: { maxWorkers?: number } = {},
): RuntimeDispatchPlan {
	const maxWorkers = Math.max(0, options.maxWorkers ?? 1);
	const activeClaims = queue.items
		.filter((item) => item.kind === "work-unit" && item.status === "claimed")
		.map(dispatchItem);
	const availableSlots = Math.max(0, maxWorkers - activeClaims.length);
	const plan: RuntimeDispatchPlan = {
		maxWorkers,
		activeClaims,
		availableSlots,
		dispatch: [],
		held: [],
	};
	const occupied = [...activeClaims];
	for (const item of readyWorkUnits(queue)) {
		const candidate = dispatchItem(item);
		const conflict = firstPathConflict(candidate, occupied);
		if (conflict) {
			plan.held.push({
				...candidate,
				reason: "path_conflict",
				conflictsWith: conflict.workUnitId,
			});
			continue;
		}
		if (plan.dispatch.length >= availableSlots) {
			plan.held.push({ ...candidate, reason: "capacity" });
			continue;
		}
		plan.dispatch.push(candidate);
		occupied.push(candidate);
	}
	return plan;
}

function readyWorkUnits(queue: WorkQueueView): WorkQueueItem[] {
	return queue.items.filter(
		(item) => item.kind === "work-unit" && item.status === "ready",
	);
}

function dispatchItem(item: WorkQueueItem): RuntimeDispatchItem {
	return {
		workUnitId: item.id,
		traceId: item.traceId,
		title: item.title,
		planningRefs: [...item.planningRefs],
		componentRefs: [...item.componentRefs],
		pathScopes: [...item.pathScopes],
		traceRefs: [...item.traceRefs],
		...(item.sourceEventId ? { sourceEventId: item.sourceEventId } : {}),
	};
}

function firstPathConflict(
	candidate: RuntimeDispatchItem,
	occupied: RuntimeDispatchItem[],
): RuntimeDispatchItem | undefined {
	return occupied.find((item) => pathScopesConflict(candidate, item));
}

function pathScopesConflict(
	left: RuntimeDispatchItem,
	right: RuntimeDispatchItem,
): boolean {
	return left.pathScopes.some((leftScope) =>
		right.pathScopes.some((rightScope) => scopesOverlap(leftScope, rightScope)),
	);
}

function scopesOverlap(left: string, right: string): boolean {
	const leftPath = normalizePathScope(left);
	const rightPath = normalizePathScope(right);
	if (!leftPath || !rightPath) return false;
	if (leftPath === rightPath) return true;
	if (pathMatchesPattern(leftPath, rightPath)) return true;
	if (pathMatchesPattern(rightPath, leftPath)) return true;
	return rootsOverlap(globRoot(leftPath), globRoot(rightPath));
}

function rootsOverlap(left: string, right: string): boolean {
	if (!left || !right) return false;
	return (
		left === right ||
		left.startsWith(`${right}/`) ||
		right.startsWith(`${left}/`)
	);
}

function globRoot(pathScope: string): string {
	const wildcardIndex = pathScope.indexOf("*");
	if (wildcardIndex === -1) return pathScope;
	const root = pathScope.slice(0, wildcardIndex);
	return root.replace(/\/[^/]*$/, "").replace(/\/$/, "");
}

function normalizePathScope(pathScope: string): string {
	return pathScope
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "");
}
