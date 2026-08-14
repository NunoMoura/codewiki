import { createHash } from "node:crypto";
import type { LoopQualityStandardResult } from "../changes/trace/types.ts";
import {
	uiPreviewTargetBindingValidationIssues,
	type UiPreviewTargetBinding,
} from "../preview/binding.ts";
import type { WorkState } from "../work-state/types.ts";

export const PLANNING_PORTFOLIO_GRAPH_ID = "codewiki.planning.portfolio";
export const PLANNING_PORTFOLIO_GRAPH_VERSION = "1.0.0";

export interface SprintPlanInput {
	id: string;
	goal: string;
	participatingChangeIds: string[];
	workItemIds: string[];
	rollbackBoundary: string;
	dependsOn: string[];
	integrationRefs: string[];
	uiPreviewTargets?: UiPreviewTargetBinding[];
}

export interface PortfolioWorkItemInput {
	id: string;
	sprintId: string;
	owningChangeId: string;
	contributingChangeIds: string[];
	title: string;
	outcome: string;
	technicalRequirements: string[];
	acceptanceCriteria: string[];
	componentRefs: string[];
	pathScopes: string[];
	verification: string[];
	workerProfile: string;
	dependsOn: string[];
}

export interface EvaluatePortfolioPlanningInput {
	changeIds: string[];
	sprints: SprintPlanInput[];
	workItems: PortfolioWorkItemInput[];
	workState: WorkState;
}

export interface PortfolioPlanningQualityResult {
	graph: {
		id: typeof PLANNING_PORTFOLIO_GRAPH_ID;
		version: typeof PLANNING_PORTFOLIO_GRAPH_VERSION;
		hash: string;
	};
	standards: LoopQualityStandardResult[];
	passed: boolean;
	qualityRef: string;
}

interface StandardDefinition {
	id: string;
	description: string;
	evaluate(input: EvaluatePortfolioPlanningInput): {
		status: "met" | "unmet";
		message?: string;
		refs?: string[];
	};
}

const DEFINITIONS: StandardDefinition[] = [
	definition(
		"approved_change_coverage",
		"Every runtime-selected approved Change is covered.",
		approvedCoverage,
	),
	definition(
		"sprint_coherence",
		"Sprints have bounded goals, participants, and work.",
		sprintCoherence,
	),
	definition(
		"sprint_boundaries_complete",
		"Every Sprint defines an explicit rollback boundary.",
		(input) =>
			input.sprints.every((sprint) => hasText(sprint.rollbackBoundary))
				? met()
				: unmet("Every Sprint needs a rollback boundary."),
	),
	definition(
		"work_item_ownership",
		"Every Work Item has exactly one owning Change.",
		workOwnership,
	),
	definition(
		"acceptance_clarity",
		"Work Item outcomes and acceptance criteria are explicit.",
		(input) =>
			input.workItems.every(
				(item) => hasText(item.outcome) && item.acceptanceCriteria.length > 0,
			)
				? met()
				: unmet("Every Work Item needs outcome and acceptance criteria."),
	),
	definition(
		"technical_requirements_complete",
		"Technical requirements are explicit.",
		(input) =>
			input.workItems.every((item) => item.technicalRequirements.length > 0)
				? met()
				: unmet("Every Work Item needs technical requirements."),
	),
	definition(
		"verification_complete",
		"Verification is explicit for every Work Item.",
		(input) =>
			input.workItems.every((item) => item.verification.length > 0)
				? met()
				: unmet("Every Work Item needs verification."),
	),
	definition(
		"source_ownership_aligned",
		"Component and path ownership scopes are explicit.",
		(input) =>
			input.workItems.every(
				(item) => item.componentRefs.length > 0 && item.pathScopes.length > 0,
			)
				? met()
				: unmet("Every Work Item needs component refs and path scopes."),
	),
	definition(
		"dependencies_valid",
		"Sprint and Work Item dependencies exist and are acyclic.",
		dependencyQuality,
	),
	definition(
		"path_conflicts_ordered",
		"Overlapping Work Item paths are ordered.",
		pathConflictQuality,
	),
	definition(
		"claimed_work_stable",
		"Planning does not overwrite active claimed Work Items.",
		claimedWorkQuality,
	),
	definition(
		"integration_safe",
		"Shared Sprints declare integration refs.",
		integrationQuality,
	),
	definition(
		"ui_preview_targets_valid",
		"UI preview targets freeze canonical target/profile digests and accountable work.",
		previewTargetQuality,
	),
];

export const PLANNING_PORTFOLIO_QUALITY_STANDARDS = DEFINITIONS.map(
	({ id, description }) => ({
		id,
		description,
		mode: "deterministic" as const,
		method: "deterministic" as const,
	}),
);

export const PLANNING_PORTFOLIO_GRAPH_HASH = `sha256:${createHash("sha256")
	.update(
		JSON.stringify(
			DEFINITIONS.map(({ id, description }) => ({ id, description })),
		),
	)
	.digest("hex")}`;

export function evaluatePortfolioPlanning(
	input: EvaluatePortfolioPlanningInput,
): PortfolioPlanningQualityResult {
	const standards = DEFINITIONS.map((item) => {
		const result = item.evaluate(input);
		return {
			id: item.id,
			status: result.status,
			mode: "deterministic" as const,
			description: item.description,
			...(result.message ? { message: result.message } : {}),
			...(result.refs?.length ? { refs: unique(result.refs) } : {}),
			graphId: PLANNING_PORTFOLIO_GRAPH_ID,
			graphVersion: PLANNING_PORTFOLIO_GRAPH_VERSION,
			graphHash: PLANNING_PORTFOLIO_GRAPH_HASH,
			method: "deterministic",
			gate: "hard",
			score: result.status === "met" ? 100 : 0,
			scoreThreshold: 100,
			repairTarget: item.id,
		} satisfies LoopQualityStandardResult;
	});
	const qualityRef = `sha256:${createHash("sha256")
		.update(JSON.stringify(standards))
		.digest("hex")}`;
	return {
		graph: {
			id: PLANNING_PORTFOLIO_GRAPH_ID,
			version: PLANNING_PORTFOLIO_GRAPH_VERSION,
			hash: PLANNING_PORTFOLIO_GRAPH_HASH,
		},
		standards,
		passed: standards.every((entry) => entry.status === "met"),
		qualityRef,
	};
}

function approvedCoverage(input: EvaluatePortfolioPlanningInput) {
	const covered = new Set(
		input.sprints.flatMap((sprint) => sprint.participatingChangeIds),
	);
	const missing = input.changeIds.filter((id) => !covered.has(id));
	const unknown = [...covered].filter((id) => !input.changeIds.includes(id));
	return missing.length === 0 && unknown.length === 0
		? met(input.changeIds.map((id) => `change:${id}`))
		: unmet(
				`Planning coverage mismatch; missing ${missing.join(", ") || "none"}, unknown ${unknown.join(", ") || "none"}.`,
			);
}

function sprintCoherence(input: EvaluatePortfolioPlanningInput) {
	const workIds = new Set(input.workItems.map((item) => item.id));
	const valid =
		input.sprints.length > 0 &&
		input.sprints.every(
			(sprint) =>
				hasText(sprint.id) &&
				hasText(sprint.goal) &&
				sprint.participatingChangeIds.length > 0 &&
				sprint.workItemIds.length > 0 &&
				sprint.workItemIds.every((id) => workIds.has(id)),
		);
	return valid
		? met(input.sprints.map((sprint) => `sprint:${sprint.id}`))
		: unmet("Every Sprint needs goal, participants, and known Work Items.");
}

function workOwnership(input: EvaluatePortfolioPlanningInput) {
	const horizon = new Set(input.changeIds);
	const sprints = new Map(input.sprints.map((sprint) => [sprint.id, sprint]));
	const valid =
		input.workItems.length > 0 &&
		input.workItems.every((item) => {
			const sprint = sprints.get(item.sprintId);
			return (
				horizon.has(item.owningChangeId) &&
				item.contributingChangeIds.every(
					(id) => horizon.has(id) && id !== item.owningChangeId,
				) &&
				Boolean(sprint?.participatingChangeIds.includes(item.owningChangeId)) &&
				Boolean(sprint?.workItemIds.includes(item.id))
			);
		});
	return valid
		? met(input.workItems.map((item) => `work:${item.id}`))
		: unmet("Work Item ownership or Sprint membership is invalid.");
}

function dependencyQuality(input: EvaluatePortfolioPlanningInput) {
	const sprintIds = new Set(input.sprints.map((sprint) => sprint.id));
	const workIds = new Set(input.workItems.map((item) => item.id));
	if (
		input.sprints.some((sprint) =>
			sprint.dependsOn.some((id) => !sprintIds.has(id)),
		)
	) {
		return unmet("Sprint dependency references unknown Sprint.");
	}
	if (
		input.workItems.some((item) =>
			item.dependsOn.some((id) => !workIds.has(id)),
		)
	) {
		return unmet("Work Item dependency references unknown Work Item.");
	}
	return hasCycle(input.sprints.map((item) => [item.id, item.dependsOn])) ||
		hasCycle(input.workItems.map((item) => [item.id, item.dependsOn]))
		? unmet("Planning dependencies contain a cycle.")
		: met();
}

function pathConflictQuality(input: EvaluatePortfolioPlanningInput) {
	for (let leftIndex = 0; leftIndex < input.workItems.length; leftIndex += 1) {
		const left = input.workItems[leftIndex];
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < input.workItems.length;
			rightIndex += 1
		) {
			const right = input.workItems[rightIndex];
			if (!pathsOverlap(left.pathScopes, right.pathScopes)) continue;
			if (
				!left.dependsOn.includes(right.id) &&
				!right.dependsOn.includes(left.id)
			) {
				return unmet(
					`Overlapping Work Items ${left.id} and ${right.id} need explicit ordering.`,
				);
			}
		}
	}
	return met();
}

function claimedWorkQuality(input: EvaluatePortfolioPlanningInput) {
	const activeIds = new Set(
		input.workState.workItems
			.filter(
				(item) =>
					!item.implemented &&
					input.workState.assignments.some(
						(assignment) =>
							assignment.workItemId === item.id &&
							!["completed", "failed", "released"].includes(assignment.status),
					),
			)
			.map((item) => item.id),
	);
	const collisions = input.workItems.filter((item) => activeIds.has(item.id));
	return collisions.length === 0
		? met()
		: unmet(
				`Planning cannot replace claimed Work Items: ${collisions.map((item) => item.id).join(", ")}.`,
			);
}

function previewTargetQuality(input: EvaluatePortfolioPlanningInput) {
	for (const sprint of input.sprints) {
		for (const target of sprint.uiPreviewTargets || []) {
			if (uiPreviewTargetBindingValidationIssues(target).length > 0) {
				return unmet(`Sprint ${sprint.id} has an invalid UI preview target.`);
			}
			if (
				target.workItemIds.some((id) => !sprint.workItemIds.includes(id)) ||
				target.contributingChangeIds.some(
					(id) => !sprint.participatingChangeIds.includes(id),
				)
			) {
				return unmet(
					`Sprint ${sprint.id} UI preview target correlation is outside Sprint authority.`,
				);
			}
		}
	}
	return met(
		input.sprints.flatMap((sprint) =>
			(sprint.uiPreviewTargets || []).map(
				(target) =>
					`ui-preview-target:${target.targetId}@${target.targetDigest}`,
			),
		),
	);
}

function integrationQuality(input: EvaluatePortfolioPlanningInput) {
	const invalid = input.sprints.filter(
		(sprint) =>
			sprint.participatingChangeIds.length > 1 &&
			sprint.integrationRefs.length === 0,
	);
	return invalid.length === 0
		? met()
		: unmet(
				`Multi-Change Sprints need integration refs: ${invalid.map((sprint) => sprint.id).join(", ")}.`,
			);
}

function hasCycle(entries: Array<[string, string[]]>): boolean {
	const dependencies = new Map(entries);
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): boolean => {
		if (visiting.has(id)) return true;
		if (visited.has(id)) return false;
		visiting.add(id);
		if ((dependencies.get(id) || []).some(visit)) return true;
		visiting.delete(id);
		visited.add(id);
		return false;
	};
	return [...dependencies.keys()].some(visit);
}

function pathsOverlap(left: string[], right: string[]): boolean {
	return left.some((leftPath) =>
		right.some(
			(rightPath) =>
				leftPath === rightPath ||
				leftPath.startsWith(`${rightPath}/`) ||
				rightPath.startsWith(`${leftPath}/`),
		),
	);
}

function definition(
	id: string,
	description: string,
	evaluate: StandardDefinition["evaluate"],
): StandardDefinition {
	return { id, description, evaluate };
}

function met(refs: string[] = []) {
	return { status: "met" as const, ...(refs.length ? { refs } : {}) };
}

function unmet(message: string) {
	return { status: "unmet" as const, message };
}

function hasText(value: string | undefined): boolean {
	return Boolean(value?.trim());
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
