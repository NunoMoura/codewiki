import type { SemanticLoop } from "../semantic-loop.ts";

export interface LoopExitDeclaration<
	Loop extends SemanticLoop = SemanticLoop,
> {
	readonly loop: Loop;
}

export interface LoopExitSuite {
	readonly decision: LoopExitDeclaration<"decision">;
	readonly planning: LoopExitDeclaration<"planning">;
	readonly implementation: LoopExitDeclaration<"implementation">;
}

export function createLoopExitSuite(input: LoopExitSuite): LoopExitSuite {
	assertLoopDeclaration(input.decision, "decision");
	assertLoopDeclaration(input.planning, "planning");
	assertLoopDeclaration(input.implementation, "implementation");
	return Object.freeze({
		decision: Object.freeze({ loop: "decision" }),
		planning: Object.freeze({ loop: "planning" }),
		implementation: Object.freeze({ loop: "implementation" }),
	});
}

function assertLoopDeclaration(
	declaration: LoopExitDeclaration | undefined,
	expected: SemanticLoop,
): void {
	if (declaration?.loop !== expected) {
		throw new Error(
			`Loop exit declaration ${expected} must declare loop ${expected}.`,
		);
	}
}
