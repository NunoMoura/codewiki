export interface ImplementationChange {
	id: string;
	planningRefs: string[];
	codePaths: string[];
	testPaths: string[];
	checks: string[];
}
