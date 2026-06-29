import { runLabExit } from "../runner/engine.ts";
import { DEC_LOSS, scoreLoop } from "../runner/score.ts";
import type { LabLoopScore, LabVerdict } from "../runner/types.ts";
import { decisionCases } from "./cases.ts";
import { decisionLoopCandidate, type DecisionLabInput } from "./loop.ts";

export function evaluateDecisionCandidate(input: DecisionLabInput): LabVerdict {
	return runLabExit({ input, standards: decisionLoopCandidate.standards })
		.verdict;
}

export function scoreDecisionExit(): LabLoopScore {
	return scoreLoop({
		loop: "decision",
		metric: "DEC",
		cases: decisionCases,
		standards: decisionLoopCandidate.standards,
		lossMatrix: DEC_LOSS,
	});
}
