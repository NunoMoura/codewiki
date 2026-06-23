import { runLabExit } from "../runner/engine.ts";
import { IEC_LOSS, scoreLoop } from "../runner/score.ts";
import type { LabLoopScore, LabVerdict } from "../runner/types.ts";
import { implementationCases } from "./cases.ts";
import {
	implementationExitStandards,
	type ImplementationLabInput,
} from "./exit.ts";

export function evaluateImplementationCandidate(
	input: ImplementationLabInput,
): LabVerdict {
	return runLabExit({ input, standards: implementationExitStandards }).verdict;
}

export function scoreImplementationExit(): LabLoopScore {
	return scoreLoop({
		loop: "implementation",
		metric: "IEC",
		cases: implementationCases,
		standards: implementationExitStandards,
		evaluate: evaluateImplementationCandidate,
		lossMatrix: IEC_LOSS,
	});
}
