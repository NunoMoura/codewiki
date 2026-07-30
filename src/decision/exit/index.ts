import type { LoopExitDeclaration } from "../../loop-exit/suite.ts";

export * from "./candidate.ts";
export * from "./code-executors.ts";
export * from "./runtime.ts";

export const decisionLoopExitDeclaration = Object.freeze({
	loop: "decision" as const,
}) satisfies LoopExitDeclaration<"decision">;
