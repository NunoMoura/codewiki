import type { SourceRef } from "../shared/types.ts";

export interface ImplementationChange {
	id: string;
	planningRefs: SourceRef[];
	codePaths: string[];
	testPaths: string[];
	checks: string[];
}
