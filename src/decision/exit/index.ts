import type { LoopExitDeclaration } from "../../loop-exit/suite.ts";

export const decisionLoopExitDeclaration = Object.freeze({
	loop: "decision" as const,
}) satisfies LoopExitDeclaration<"decision">;
