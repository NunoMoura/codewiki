import { evaluateImplementationExit } from "../../src/implementation/exit.ts";
import type {
	ImplementationExitInput,
	ImplementationExitResult,
} from "../../src/implementation/types.ts";
import type { LabStandard } from "../runner/types.ts";

export interface ImplementationLabInput {
	plan: unknown;
	implementation: ImplementationExitInput;
}

export const implementationExitStandards: LabStandard<ImplementationLabInput>[] =
	[
		{
			id: "production_implementation_exit_parity",
			mode: "deterministic",
			weight: 100,
			description:
				"Seed candidate mirrors the current production implementation exit until experiments add better weighted standards.",
			evaluate(input) {
				const exit = evaluateImplementationExit(input.implementation);
				return productionExitResult(
					"production_implementation_exit_parity",
					exit,
				);
			},
		},
	];

function productionExitResult(id: string, exit: ImplementationExitResult) {
	return {
		id,
		mode: "deterministic" as const,
		weight: 100,
		passed: exit.verdict === "pass",
		route: exit.verdict,
		description: "Production implementation exit parity.",
		...(exit.issues.length > 0
			? { message: exit.issues.map((issue) => issue.message).join(" ") }
			: {}),
	};
}
