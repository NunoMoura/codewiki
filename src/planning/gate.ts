import { planningConflicts } from "./conflicts.ts";
import { workItemsForDecisionRef } from "./materialization.ts";
import type { PlanningDecisionResolution, PlanningWorkItem } from "./types.ts";

export type PlanningGateIssueCode =
	| "missing_decision_coverage"
	| "unknown_decision_ref"
	| "invalid_work_item"
	| "invalid_resolution"
	| "path_conflict";

export interface PlanningGateIssue {
	code: PlanningGateIssueCode;
	decisionRef?: string;
	workItemId?: string;
	message: string;
}

export interface PlanningGateInput {
	decisionRefs: string[];
	workItems: PlanningWorkItem[];
	resolutions: PlanningDecisionResolution[];
}

export interface PlanningGateResult {
	passed: boolean;
	issues: PlanningGateIssue[];
	coveredDecisionRefs: string[];
	workUnitIds: string[];
}

export function evaluatePlanningGate(input: PlanningGateInput): PlanningGateResult {
	const issues = [
		...coverageIssues(input),
		...unknownDecisionRefIssues(input),
		...workItemIssues(input.workItems),
		...resolutionIssues(input.resolutions),
		...conflictIssues(input.workItems),
	];
	return {
		passed: issues.length === 0,
		issues,
		coveredDecisionRefs: coveredDecisionRefs(input),
		workUnitIds: input.workItems.map((item) => item.id),
	};
}

export function planningItemIsExecutable(item: PlanningWorkItem): boolean {
	return workItemIssues([item]).length === 0;
}

function coverageIssues(input: PlanningGateInput): PlanningGateIssue[] {
	return input.decisionRefs.flatMap((decisionRef) => {
		const workItems = workItemsForDecisionRef(input.workItems, decisionRef);
		const resolutions = input.resolutions.filter((resolution) => resolution.decisionRef === decisionRef);
		if (workItems.length || resolutions.length) return [];
		return [{
			code: "missing_decision_coverage" as const,
			decisionRef,
			message: `Planning does not cover decision ${decisionRef}.`,
		}];
	});
}

function unknownDecisionRefIssues(input: PlanningGateInput): PlanningGateIssue[] {
	const known = new Set(input.decisionRefs);
	return [...input.workItems.flatMap((item) => item.decisionRefs), ...input.resolutions.map((item) => item.decisionRef)]
		.filter((decisionRef) => !known.has(decisionRef))
		.map((decisionRef) => ({
			code: "unknown_decision_ref" as const,
			decisionRef,
			message: `Planning references unknown decision ${decisionRef}.`,
		}));
}

function workItemIssues(items: PlanningWorkItem[]): PlanningGateIssue[] {
	return items.flatMap((item) => {
		const missing = [
			item.id ? "" : "id",
			item.decisionRefs.length ? "" : "decisionRefs",
			item.outcome ? "" : "outcome",
			item.acceptance.length ? "" : "acceptance",
			item.pathScopes.length ? "" : "pathScopes",
		].filter(Boolean);
		if (missing.length === 0) return [];
		return [{
			code: "invalid_work_item" as const,
			workItemId: item.id,
			message: `Planning work item ${item.id || "<missing>"} is missing ${missing.join(", ")}.`,
		}];
	});
}

function resolutionIssues(resolutions: PlanningDecisionResolution[]): PlanningGateIssue[] {
	return resolutions.flatMap((resolution) => {
		const missing = requiredResolutionFields(resolution);
		if (missing.length === 0) return [];
		return [{
			code: "invalid_resolution" as const,
			decisionRef: resolution.decisionRef,
			message: `Planning resolution for ${resolution.decisionRef} is missing ${missing.join(", ")}.`,
		}];
	});
}

function requiredResolutionFields(resolution: PlanningDecisionResolution): string[] {
	if (resolution.kind === "work-unit") return resolution.workUnitIds.length ? [] : ["workUnitIds"];
	if (resolution.kind === "deferred") {
		return [
			resolution.owner ? "" : "owner",
			resolution.trigger ? "" : "trigger",
			resolution.rationale ? "" : "rationale",
			resolution.evidenceRefs.length ? "" : "evidenceRefs",
		].filter(Boolean);
	}
	return resolution.evidenceRefs.length ? [] : ["evidenceRefs"];
}

function conflictIssues(items: PlanningWorkItem[]): PlanningGateIssue[] {
	return planningConflicts(items).map((conflict) => ({
		code: "path_conflict" as const,
		workItemId: conflict.leftId,
		message: `Planning work items ${conflict.leftId} and ${conflict.rightId} overlap on ${conflict.pathScopes.join(", ")}.`,
	}));
}

function coveredDecisionRefs(input: PlanningGateInput): string[] {
	return input.decisionRefs.filter(
		(decisionRef) =>
			workItemsForDecisionRef(input.workItems, decisionRef).length > 0 ||
			input.resolutions.some((resolution) => resolution.decisionRef === decisionRef),
	);
}
