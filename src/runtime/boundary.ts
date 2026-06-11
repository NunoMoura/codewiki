import type { RuntimeBoundary } from "./types.ts";

export function createRuntimeBoundary(boundary: RuntimeBoundary): RuntimeBoundary {
	return { ...boundary, sourceRefs: [...boundary.sourceRefs] };
}
