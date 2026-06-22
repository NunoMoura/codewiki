export function normalizeTraceRefs(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}

export function invalidTraceRefs(values: string[]): string[] {
	return normalizeTraceRefs(values).filter((ref) => !isCanonicalTraceRef(ref));
}

export function isCanonicalTraceRef(ref: string): boolean {
	const value = ref.trim();
	return (
		/^trace:[A-Za-z0-9._:#/-]+$/.test(value) ||
		/^TRACE-[A-Za-z0-9._:-]+$/.test(value) ||
		value.startsWith("kb:") ||
		value.startsWith(".codewiki/kb/") ||
		value.startsWith("git:") ||
		/^sha256:[A-Fa-f0-9]+$/.test(value) ||
		value.startsWith("src/") ||
		value.startsWith("tests/") ||
		value.startsWith(".pi/") ||
		value.startsWith(".agents/skills/") ||
		/^(README\.md|CHANGELOG\.md|LICENSE|package\.json|package-lock\.json|tsconfig\.json)$/.test(
			value,
		) ||
		/^[A-Fa-f0-9]{6,40}$/.test(value)
	);
}
