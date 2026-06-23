import { evaluateDecisionExit } from "../../src/decision/exit.ts";
import type {
	DecisionExitOptions,
	DecisionExitResult,
} from "../../src/decision/exit.ts";
import type { DecisionTable } from "../../src/decision/types.ts";
import type {
	LabCandidateStandards,
	LabStandard,
} from "../runner/types.ts";

export interface DecisionLabInput {
	prompt: string;
	decisionTable: DecisionTable;
	options?: DecisionExitOptions;
}

export const decisionExitStandards: LabStandard<DecisionLabInput>[] = [
	{
		id: "production_decision_exit_parity",
		mode: "deterministic",
		weight: 100,
		description:
			"Seed candidate mirrors the current production decision exit until experiments add better weighted standards.",
		evaluate(input) {
			const exit = evaluateDecisionExit(
				input.decisionTable,
				input.options || {},
			);
			return productionExitResult("production_decision_exit_parity", exit);
		},
	},
];

export const decisionExitCandidate = {
	loop: "decision",
	metric: "DEC",
	standards: decisionExitStandards,
} satisfies LabCandidateStandards<DecisionLabInput>;

function productionExitResult(id: string, exit: DecisionExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 100,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production decision exit parity.",
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}
