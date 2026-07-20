import { RuntimeReactor } from "./reactor.ts";

const reactors = new Map<string, RuntimeReactor>();

export function runtimeReactorFor(repoRoot: string): RuntimeReactor {
	const existing = reactors.get(repoRoot);
	if (existing) return existing;
	const reactor = new RuntimeReactor(repoRoot);
	reactors.set(repoRoot, reactor);
	return reactor;
}

export function releaseRuntimeReactor(repoRoot?: string): void {
	if (repoRoot) {
		reactors.delete(repoRoot);
		return;
	}
	reactors.clear();
}
