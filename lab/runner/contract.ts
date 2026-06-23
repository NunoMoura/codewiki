import type { LabLoop } from "./types.ts";

export const LAB_LOOP_CANDIDATE_FILES: Record<LabLoop, string> = {
	decision: "lab/decision/exit.ts",
	planning: "lab/planning/exit.ts",
	implementation: "lab/implementation/exit.ts",
};

export const LAB_LOCKED_EVALUATOR_FILES = [
	"lab/decision/cases.ts",
	"lab/decision/score.ts",
	"lab/planning/cases.ts",
	"lab/planning/score.ts",
	"lab/implementation/cases.ts",
	"lab/implementation/score.ts",
	"lab/runner/contract.ts",
	"lab/runner/engine.ts",
	"lab/runner/score.ts",
	"lab/runner/types.ts",
] as const;

export const LAB_FORBIDDEN_CANDIDATE_IMPORTS = [
	"fs",
	"node:fs",
	"node:fs/promises",
	"child_process",
	"node:child_process",
	"./cases.ts",
	"./score.ts",
	"../runner/score.ts",
] as const;

export const LAB_FORBIDDEN_CANDIDATE_TOKENS = [
	"require(",
	"import(",
	"process.",
] as const;
