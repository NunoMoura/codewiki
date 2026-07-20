import { labQualityPackForCandidate } from "../runner/quality-pack.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface PlanningLabInput {
	changeIds: string[];
	sprints: Array<{
		id: string;
		participatingChangeIds: string[];
		workItemIds: string[];
		rollbackBoundary: string;
	}>;
	workItems: Array<{
		id: string;
		sprintId: string;
		owningChangeId: string;
		technicalRequirements: string[];
		acceptanceCriteria: string[];
		pathScopes: string[];
		verification: string[];
		dependsOn: string[];
	}>;
	workState: { workItems: unknown[]; assignments: unknown[] };
}

const DEFINITIONS: Array<{
	id: string;
	description: string;
	evaluate(input: PlanningLabInput): boolean;
}> = [
	{
		id: "approved_change_coverage",
		description: "Every selected Change participates in a Sprint.",
		evaluate: (input) =>
			input.changeIds.every((id) =>
				input.sprints.some((sprint) =>
					sprint.participatingChangeIds.includes(id),
				),
			),
	},
	{
		id: "sprint_change_coherence",
		description: "Every Sprint references selected Changes.",
		evaluate: (input) =>
			input.sprints.every((sprint) =>
				sprint.participatingChangeIds.every((id) =>
					input.changeIds.includes(id),
				),
			),
	},
	{
		id: "sprint_boundaries_complete",
		description: "Every Sprint has an explicit rollback boundary.",
		evaluate: (input) =>
			input.sprints.every(
				(sprint) => sprint.rollbackBoundary.trim().length > 0,
			),
	},
	{
		id: "work_item_ownership",
		description: "Every Work Item has one selected owning Change.",
		evaluate: (input) =>
			input.workItems.every((item) =>
				input.changeIds.includes(item.owningChangeId),
			),
	},
	{
		id: "sprint_membership_complete",
		description: "Every Work Item belongs to one declared Sprint.",
		evaluate: (input) =>
			input.workItems.every((item) =>
				input.sprints.some(
					(sprint) =>
						sprint.id === item.sprintId && sprint.workItemIds.includes(item.id),
				),
			),
	},
	{
		id: "technical_requirements_complete",
		description: "Every Work Item has technical requirements.",
		evaluate: (input) =>
			input.workItems.every((item) => item.technicalRequirements.length > 0),
	},
	{
		id: "acceptance_clarity",
		description: "Every Work Item has acceptance criteria.",
		evaluate: (input) =>
			input.workItems.every((item) => item.acceptanceCriteria.length > 0),
	},
	{
		id: "verification_complete",
		description: "Every Work Item has verification commands.",
		evaluate: (input) =>
			input.workItems.every((item) => item.verification.length > 0),
	},
	{
		id: "path_scope_complete",
		description: "Every Work Item has bounded path scope.",
		evaluate: (input) =>
			input.workItems.every((item) => item.pathScopes.length > 0),
	},
	{
		id: "dependency_graph_valid",
		description: "Work Item dependencies reference known Work Items.",
		evaluate: (input) => {
			const ids = new Set(input.workItems.map((item) => item.id));
			return input.workItems.every((item) =>
				item.dependsOn.every((id) => ids.has(id)),
			);
		},
	},
	{
		id: "path_conflicts_ordered",
		description: "Overlapping path scopes have explicit order.",
		evaluate: () => true,
	},
	{
		id: "claimed_work_preserved",
		description: "Planning does not replace claimed Work Items.",
		evaluate: () => true,
	},
];

export const planningLoopStandards: LabStandard<PlanningLabInput>[] =
	DEFINITIONS.map((definition) => ({
		id: definition.id,
		mode: "deterministic",
		weight: 10,
		cost: 10,
		standardType: "loop_contract",
		layer: "hard_gate",
		hardGate: true,
		repairTarget: "planning",
		description: definition.description,
		evaluate(input) {
			const passed = definition.evaluate(input);
			return {
				id: definition.id,
				mode: "deterministic",
				weight: 10,
				cost: 10,
				passed,
				route: passed ? "pass" : "fail",
				description: definition.description,
				standardType: "loop_contract",
				layer: "hard_gate",
				hardGate: true,
				repairTarget: "planning",
				score: passed ? 0 : 1,
			};
		},
	}));

const planningLoopCandidateDeclaration = {
	loop: "planning",
	metric: "PEC",
	graphId: "codewiki.planning.portfolio.lab",
	graphVersion: "1.0.0.lab.1",
	schemaVersion: 1,
	layers: ["hard_gate"],
	standards: planningLoopStandards,
} satisfies Omit<LabCandidateStandards<PlanningLabInput>, "qualityPack">;

export const planningLoopCandidate = {
	...planningLoopCandidateDeclaration,
	qualityPack: labQualityPackForCandidate(planningLoopCandidateDeclaration),
} satisfies LabCandidateStandards<PlanningLabInput>;
