import { runLabExit } from "../runner/engine.ts";
import { IEC_LOSS, scoreLoop } from "../runner/score.ts";
import type { LabLoopScore, LabVerdict } from "../runner/types.ts";
import { implementationCases } from "./cases.ts";
import {
	implementationExitCandidate,
	type ImplementationLabInput,
} from "./exit.ts";

export function evaluateImplementationCandidate(
	input: ImplementationLabInput,
): LabVerdict {
	return runLabExit({ input, standards: implementationExitCandidate.standards })
		.verdict;
}

export function scoreImplementationExit(): LabLoopScore {
	return scoreLoop({
		loop: "implementation",
		metric: "IEC",
		cases: implementationCases,
		standards: implementationExitCandidate.standards,
		evaluate: evaluateImplementationCandidate,
		lossMatrix: IEC_LOSS,
	});
}
