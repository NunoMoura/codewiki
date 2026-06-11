import { changedPaths, contentProofRefs } from "./evidence.ts";
import type {
	ImplementationChange,
	ImplementationGateInput,
	ImplementationGateIssue,
	ImplementationGateResult,
} from "./types.ts";

export function evaluateImplementationGate(input: ImplementationGateInput): ImplementationGateResult {
	const issues = [
		...coverageIssues(input),
		...unknownPlanningRefIssues(input),
		...changeIssues(input.changes),
		...contentProofIssues(input.changes),
	];
	return {
		passed: issues.length === 0,
		issues,
		coveredPlanningRefs: coveredPlanningRefs(input),
		changeIds: input.changes.map((change) => change.id),
	};
}

export function implementationHasValidationInputs(change: ImplementationChange): boolean {
	return changeIssues([change]).length === 0 && contentProofIssues([change]).length === 0;
}

function coverageIssues(input: ImplementationGateInput): ImplementationGateIssue[] {
	return input.planningRefs.flatMap((planningRef) => {
		if (input.changes.some((change) => change.planningRefs.includes(planningRef))) return [];
		return [{
			code: "missing_planning_coverage" as const,
			planningRef,
			message: `Implementation does not cover planning work ${planningRef}.`,
		}];
	});
}

function unknownPlanningRefIssues(input: ImplementationGateInput): ImplementationGateIssue[] {
	const known = new Set(input.planningRefs);
	return input.changes
		.flatMap((change) => change.planningRefs.map((planningRef) => ({ change, planningRef })))
		.filter(({ planningRef }) => !known.has(planningRef))
		.map(({ change, planningRef }) => ({
			code: "unknown_planning_ref" as const,
			planningRef,
			changeId: change.id,
			message: `Implementation change ${change.id} references unknown planning work ${planningRef}.`,
		}));
}

function changeIssues(changes: ImplementationChange[]): ImplementationGateIssue[] {
	return changes.flatMap((change) => {
		const missing = [
			change.id ? "" : "id",
			change.planningRefs.length ? "" : "planningRefs",
			changedPaths(change).length ? "" : "changedPaths",
			change.checks.length ? "" : "checks",
			change.acceptanceEvidence.length ? "" : "acceptanceEvidence",
		].filter(Boolean);
		if (missing.length === 0) return [];
		return [{
			code: "invalid_change" as const,
			changeId: change.id,
			message: `Implementation change ${change.id || "<missing>"} is missing ${missing.join(", ")}.`,
		}];
	});
}

function contentProofIssues(changes: ImplementationChange[]): ImplementationGateIssue[] {
	return changes.flatMap((change) => {
		if (contentProofRefs(change).length > 0) return [];
		return [{
			code: "missing_content_proof" as const,
			changeId: change.id,
			message: `Implementation change ${change.id} needs commit/tree or working-tree digest proof.`,
		}];
	});
}

function coveredPlanningRefs(input: ImplementationGateInput): string[] {
	return input.planningRefs.filter((planningRef) =>
		input.changes.some((change) => change.planningRefs.includes(planningRef)),
	);
}
