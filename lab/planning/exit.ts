import { evaluatePlanningExit } from "../../src/planning/exit.ts";
import type {
	PlanningExitInput,
	PlanningExitResult,
} from "../../src/planning/exit.ts";
import type { LabCandidateStandards, LabStandard } from "../runner/types.ts";

export interface PlanningLabInput {
	decisions: unknown[];
	plan: PlanningExitInput;
}

export const planningExitStandards: LabStandard<PlanningLabInput>[] = [
	{
		id: "production_planning_exit_parity",
		mode: "deterministic",
		weight: 100,
		description:
			"Seed candidate mirrors the current production planning exit until experiments add better weighted standards.",
		evaluate(input) {
			const exit = evaluatePlanningExit(input.plan);
			return productionExitResult("production_planning_exit_parity", exit);
		},
	},
];

export const planningExitCandidate = {
	loop: "planning",
	metric: "PEC",
	standards: planningExitStandards,
} satisfies LabCandidateStandards<PlanningLabInput>;

function productionExitResult(id: string, exit: PlanningExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 100,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production planning exit parity.",
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}
