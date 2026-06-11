import type { ImplementationChange } from "./types.ts";

export function implementationHasValidationInputs(
	change: ImplementationChange,
): boolean {
	return Boolean(
		change.id &&
			change.planningRefs.length &&
			change.codePaths.length &&
			change.checks.length,
	);
}
