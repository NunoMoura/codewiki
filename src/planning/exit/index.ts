import type { LoopExitDeclaration } from "../../loop-exit/suite.ts";

export const planningLoopExitDeclaration = Object.freeze({
	loop: "planning" as const,
}) satisfies LoopExitDeclaration<"planning">;
