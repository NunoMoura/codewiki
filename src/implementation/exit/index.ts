import type {LoopExitDeclaration} from "../../verification/contracts.ts";

export const implementationLoopExitDeclaration = Object.freeze({
	loop: "implementation" as const,
}) satisfies LoopExitDeclaration<"implementation">;
