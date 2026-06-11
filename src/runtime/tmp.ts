export type TmpCleanupBoundary = "loop-gate-pass" | "superseding-run" | "trace-close";

export function traceTmpPath(traceId: string, loop?: string): string {
	return [".codewiki", "runtime", "tmp", traceId, loop].filter(Boolean).join("/");
}
