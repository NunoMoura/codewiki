import { runLabExit } from "../runner/engine.ts";
import { DEC_LOSS, scoreLoop } from "../runner/score.ts";
import type { LabLoopScore, LabVerdict } from "../runner/types.ts";
import { decisionCases } from "./cases.ts";
import { decisionExitStandards, type DecisionLabInput } from "./exit.ts";

export function evaluateDecisionCandidate(input: DecisionLabInput): LabVerdict {
	return runLabExit({ input, standards: decisionExitStandards }).verdict;
}

export function scoreDecisionExit(): LabLoopScore {
	return scoreLoop({
		loop: "decision",
		metric: "DEC",
		cases: decisionCases,
		standards: decisionExitStandards,
		evaluate: evaluateDecisionCandidate,
		lossMatrix: DEC_LOSS,
	});
}
