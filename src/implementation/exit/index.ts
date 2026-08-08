import type { LoopExitDeclaration } from "../../verification/suite.ts";

export const implementationLoopExitDeclaration = Object.freeze({
	loop: "implementation" as const,
}) satisfies LoopExitDeclaration<"implementation">;
