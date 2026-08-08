import type { LoopExitDeclaration } from "../../verification/suite.ts";

export * from "./candidate.ts";
export * from "./code-executors.ts";
export * from "./evidence.ts";
export * from "./model-checks.ts";
export * from "./runtime.ts";

export const decisionLoopExitDeclaration = Object.freeze({
	loop: "decision" as const,
}) satisfies LoopExitDeclaration<"decision">;
