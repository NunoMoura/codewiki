import type {LoopExitDeclaration} from "../../verification/contracts.ts";

export const planningLoopExitDeclaration = Object.freeze({
	loop: "planning" as const,
}) satisfies LoopExitDeclaration<"planning">;
