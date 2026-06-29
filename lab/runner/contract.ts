import type { LabLoop } from "./types.ts";

export const LAB_LOOP_CANDIDATE_FILES: Record<LabLoop, string> = {
	decision: "lab/decision/loop.ts",
	planning: "lab/planning/loop.ts",
	implementation: "lab/implementation/loop.ts",
};

export const LAB_LOCKED_EVALUATOR_FILES = [
	"lab/decision/cases.ts",
	"lab/decision/score.ts",
	"lab/planning/cases.ts",
	"lab/planning/score.ts",
	"lab/implementation/cases.ts",
	"lab/implementation/score.ts",
	"lab/pipeline/cases.ts",
	"lab/pipeline/score.ts",
	"lab/pipeline/trace-harness.ts",
	"lab/pipeline/types.ts",
	"lab/program.md",
	"lab/runner/contract.ts",
	"lab/runner/engine.ts",
	"lab/runner/experiment-budget.ts",
	"lab/runner/experiment-runner.ts",
	"lab/runner/graph.ts",
	"lab/runner/judge-calibration.ts",
	"lab/runner/judge-smoke.ts",
	"lab/runner/holdout.ts",
	"lab/runner/holdout-score.ts",
	"lab/runner/objective.ts",
	"lab/runner/score.ts",
	"lab/runner/sealed-check.ts",
	"lab/runner/sealed-template.ts",
	"lab/runner/trace-forge.ts",
	"lab/runner/types.ts",
] as const;

export const LAB_ALLOWED_CANDIDATE_IMPORTS: Record<LabLoop, readonly string[]> =
	{
		decision: [
			"../../src/decision/loop.ts",
			"../../src/decision/types.ts",
			"../runner/types.ts",
		],
		planning: ["../../src/planning/loop.ts", "../runner/types.ts"],
		implementation: [
			"../../src/implementation/loop.ts",
			"../../src/implementation/types.ts",
			"../runner/types.ts",
		],
	};

export const LAB_FORBIDDEN_CANDIDATE_IMPORTS = [
	"fs",
	"node:fs",
	"node:fs/promises",
	"child_process",
	"node:child_process",
	"./cases.ts",
	"./score.ts",
	"../runner/holdout.ts",
	"../runner/holdout-score.ts",
	"../runner/judge-calibration.ts",
	"../runner/experiment-runner.ts",
	"../runner/score.ts",
] as const;

export const LAB_FORBIDDEN_CANDIDATE_TOKENS = [
	"require(",
	"import(",
	"process.",
] as const;
