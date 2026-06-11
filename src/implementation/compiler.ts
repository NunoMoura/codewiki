import type { ImplementationChange } from "./types.ts";

export function compileImplementation(
	change: ImplementationChange,
): ImplementationChange {
	return {
		...change,
		planningRefs: [...change.planningRefs],
		codePaths: [...change.codePaths],
		testPaths: [...change.testPaths],
		checks: [...change.checks],
	};
}
