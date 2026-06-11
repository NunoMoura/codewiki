import type { ImplementationChange } from "./types.ts";

export function implementationEvidenceRefs(change: ImplementationChange): string[] {
	return [...change.codePaths, ...change.testPaths, ...change.checks];
}
