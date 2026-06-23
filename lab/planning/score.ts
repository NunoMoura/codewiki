import { runLabExit } from "../runner/engine.ts";
import { PEC_LOSS, scoreLoop } from "../runner/score.ts";
import type { LabLoopScore, LabVerdict } from "../runner/types.ts";
import { planningCases } from "./cases.ts";
import { planningExitCandidate, type PlanningLabInput } from "./exit.ts";

export function evaluatePlanningCandidate(input: PlanningLabInput): LabVerdict {
	return runLabExit({ input, standards: planningExitCandidate.standards })
		.verdict;
}

export function scorePlanningExit(): LabLoopScore {
	return scoreLoop({
		loop: "planning",
		metric: "PEC",
		cases: planningCases,
		standards: planningExitCandidate.standards,
		evaluate: evaluatePlanningCandidate,
		lossMatrix: PEC_LOSS,
	});
}
