import { parse as parseYaml } from "yaml";

export interface FileStructureComponent {
	id: string;
	label?: string;
	pathPatterns: string[];
	testPatterns: string[];
	kbRefs: string[];
}

export interface FileStructureMapContract {
	id?: string;
	sourceRefs: string[];
	components: FileStructureComponent[];
}

export function parseFileStructureMapYaml(
	source: string,
): FileStructureMapContract {
	return fileStructureMapFromUnknown(parseYaml(source));
}

function fileStructureMapFromUnknown(value: unknown): FileStructureMapContract {
	const document = objectRecord(value);
	return {
		id: text(document.id) || undefined,
		sourceRefs: unique([
			...stringList(document.source_docs),
			...stringList(document.sourceDocs),
		]),
		components: objectList(document.nodes)
			.filter((node) => text(node.kind) === "component")
			.map(componentFromNode)
			.filter((component) => component.id),
	};
}

export function componentsForRefs(
	map: FileStructureMapContract,
	componentRefs: string[],
): FileStructureComponent[] {
	const requested = new Set(componentRefs.map((ref) => text(ref)));
	return map.components.filter((component) => requested.has(component.id));
}

export function unknownComponentRefs(
	map: FileStructureMapContract,
	componentRefs: string[],
): string[] {
	const known = new Set(map.components.map((component) => component.id));
	return unique(componentRefs).filter(
		(componentRef) => !known.has(componentRef),
	);
}

export function componentKbRefs(
	map: FileStructureMapContract,
	componentRefs: string[],
): string[] {
	return unique(
		componentsForRefs(map, componentRefs).flatMap(
			(component) => component.kbRefs,
		),
	);
}

export function componentSupportsSourcePath(
	component: FileStructureComponent,
	path: string,
): boolean {
	return matchesAnyPattern(path, [
		...component.pathPatterns,
		...component.kbRefs,
	]);
}

export function componentSupportsTestPath(
	component: FileStructureComponent,
	path: string,
): boolean {
	return matchesAnyPattern(path, component.testPatterns);
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
	return patterns.some((pattern) => pathMatchesPattern(path, pattern));
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
	const normalizedPath = artifactPath(path);
	const normalizedPattern = artifactPath(pattern);
	if (!normalizedPath || !normalizedPattern) return false;
	if (normalizedPattern.endsWith("/**")) {
		const root = normalizedPattern.slice(0, -3);
		return normalizedPath === root || normalizedPath.startsWith(`${root}/`);
	}
	if (!normalizedPattern.includes("*"))
		return normalizedPath === normalizedPattern;
	return globSegmentsMatch(
		normalizedPattern.split("/"),
		normalizedPath.split("/"),
	);
}

function componentFromNode(
	node: Record<string, unknown>,
): FileStructureComponent {
	return {
		id: text(node.id),
		label: text(node.label) || undefined,
		pathPatterns: unique([
			...stringList(node.paths),
			...stringList(node.path_patterns),
			...stringList(node.pathPatterns),
		]),
		testPatterns: unique([
			...stringList(node.test_paths),
			...stringList(node.testPatterns),
		]),
		kbRefs: unique([
			...stringList(node.kb_refs),
			...stringList(node.kbRefs),
			text(node.source),
		]),
	};
}

function globSegmentsMatch(pattern: string[], path: string[]): boolean {
	if (pattern.length === 0) return path.length === 0;
	const [head, ...rest] = pattern;
	if (head === "**") {
		return (
			globSegmentsMatch(rest, path) ||
			(path.length > 0 && globSegmentsMatch(pattern, path.slice(1)))
		);
	}
	if (path.length === 0) return false;
	return segmentMatches(head || "", path[0] || "")
		? globSegmentsMatch(rest, path.slice(1))
		: false;
}

function segmentMatches(pattern: string, value: string): boolean {
	if (pattern === "*") return true;
	if (!pattern.includes("*")) return pattern === value;
	const parts = pattern.split("*");
	let offset = 0;
	const first = parts[0] || "";
	if (first && !value.startsWith(first)) return false;
	offset = first.length;
	for (const part of parts.slice(1, -1)) {
		if (!part) continue;
		const index = value.indexOf(part, offset);
		if (index === -1) return false;
		offset = index + part.length;
	}
	const last = parts.at(-1) || "";
	if (!last) return true;
	const index = value.indexOf(last, offset);
	return index !== -1 && value.endsWith(last);
}

function artifactPath(value: string): string {
	const normalized = text(value).replace(/\\/g, "/");
	if (normalized.startsWith("kb:")) {
		return `.codewiki/kb/${normalized.slice(3)}`;
	}
	return normalized.replace(/\/$/, "");
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
