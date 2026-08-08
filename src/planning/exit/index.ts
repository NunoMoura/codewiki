import type { LoopExitDeclaration } from "../../verification/suite.ts";

export const planningLoopExitDeclaration = Object.freeze({
	loop: "planning" as const,
}) satisfies LoopExitDeclaration<"planning">;
