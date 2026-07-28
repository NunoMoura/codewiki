import type { LoopExitDeclaration } from "../../loop-exit/suite.ts";

export const implementationLoopExitDeclaration = Object.freeze({
	loop: "implementation" as const,
}) satisfies LoopExitDeclaration<"implementation">;
