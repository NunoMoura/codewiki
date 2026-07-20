import type { PlanningLabInput } from "./loop.ts";

export function planningLabInput(
	overrides: {
		acceptanceCriteria?: string[];
		technicalRequirements?: string[];
		verification?: string[];
		pathScopes?: string[];
	} = {},
): PlanningLabInput {
	return {
		changeIds: ["CHG-planning-lab"],
		sprints: [
			{
				id: "SPR-planning-lab",
				participatingChangeIds: ["CHG-planning-lab"],
				workItemIds: ["WI-planning-lab"],
				rollbackBoundary: "Revert Planning lab Sprint as one boundary.",
			},
		],
		workItems: [
			{
				id: "WI-planning-lab",
				sprintId: "SPR-planning-lab",
				owningChangeId: "CHG-planning-lab",
				technicalRequirements: overrides.technicalRequirements ?? [
					"Preserve Change Trace authority.",
				],
				acceptanceCriteria: overrides.acceptanceCriteria ?? [
					"Portfolio Planning report is appendable.",
				],
				pathScopes: overrides.pathScopes ?? ["src/planning/**"],
				verification: overrides.verification ?? ["npm run test:smoke"],
				dependsOn: [],
			},
		],
		workState: { workItems: [], assignments: [] },
	};
}
