import type { LabCase } from "../runner/types.ts";
import { planningLabInput } from "./fixture.ts";
import type { PlanningLabInput } from "./loop.ts";

export const planningCases: LabCase<PlanningLabInput>[] = [
	{
		id: "valid-portfolio-plan",
		loop: "planning",
		description:
			"Approved Change receives coherent Sprint and owned Work Item.",
		input: planningLabInput(),
		expected: "pass",
		weight: 15,
	},
	{
		id: "missing-acceptance-criteria",
		loop: "planning",
		description:
			"Work Item without acceptance criteria fails Planning quality.",
		input: planningLabInput({ acceptanceCriteria: [] }),
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "acceptance_clarity",
				failureClass: "contract",
			},
		],
	},
	{
		id: "missing-technical-requirements",
		loop: "planning",
		description: "Work Item without technical requirements fails.",
		input: planningLabInput({ technicalRequirements: [] }),
		expected: "fail",
		weight: 10,
		expectedFailures: [
			{
				standardId: "technical_requirements_complete",
				failureClass: "scope",
			},
		],
	},
	{
		id: "missing-verification",
		loop: "planning",
		description: "Work Item without verification fails Planning quality.",
		input: planningLabInput({ verification: [] }),
		expected: "fail",
		weight: 10,
		expectedFailures: [
			{
				standardId: "verification_complete",
				failureClass: "evidence",
			},
		],
	},
];
