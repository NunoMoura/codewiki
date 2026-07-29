import { decisionLoopExitDeclaration } from "../decision/exit/index.ts";
import { implementationLoopExitDeclaration } from "../implementation/exit/index.ts";
import { createCheckCatalog } from "../loop-exit/catalog.ts";
import {
	createLoopExitSuite,
	type LoopExitSuite,
} from "../loop-exit/suite.ts";
import { planningLoopExitDeclaration } from "../planning/exit/index.ts";

interface LoopExitRuntime {
	readonly suite: LoopExitSuite;
	readonly catalog: ReturnType<typeof createCheckCatalog>;
}

export const LOOP_EXIT_SUITE = createLoopExitSuite({
	decision: decisionLoopExitDeclaration,
	planning: planningLoopExitDeclaration,
	implementation: implementationLoopExitDeclaration,
});

export function createLoopExitRuntime(): LoopExitRuntime {
	return Object.freeze({
		suite: LOOP_EXIT_SUITE,
		catalog: createCheckCatalog(),
	});
}
