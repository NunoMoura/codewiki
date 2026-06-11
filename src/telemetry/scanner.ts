const traceFilePattern = /(^|\/)TRACE-[^/]+\.jsonl$/;

export function isTraceFile(path: string): boolean {
	const normalized = path.replaceAll("\\", "/");
	return traceFilePattern.test(normalized);
}
