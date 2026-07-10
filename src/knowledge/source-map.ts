export interface SourceMapDefaults {
	inheritance: boolean;
	maxOwnerDepth?: number;
	excluded: string[];
}

export interface SourceMapComponent {
	id: string;
	doc: string;
	sourcePatterns: string[];
	testPatterns: string[];
	generatedViews: string[];
	traceEvents: string[];
	role?: string;
	testPolicy?: string;
	testRationale?: string;
}

export type ComponentOwnershipMap = SourceMapContract;
export type ComponentOwnership = SourceMapComponent;

export interface SourceMapContract {
	id?: string;
	sourceRefs: string[];
	defaults: SourceMapDefaults;
	components: SourceMapComponent[];
}

export interface SourceMapMarkdownEntry {
	path: string;
	hasFrontmatter: boolean;
}

export type SourceMapValidationIssueCode =
	| "duplicate_component_id"
	| "frontmatter_not_allowed"
	| "missing_component_doc"
	| "missing_source_owner"
	| "missing_source_pattern_artifact"
	| "missing_source_ref"
	| "missing_test_contract"
	| "missing_test_pattern_artifact";

export interface SourceMapValidationIssue {
	code: SourceMapValidationIssueCode;
	message: string;
	path?: string;
	componentId?: string;
	pattern?: string;
}

export interface SourceMapValidationInput {
	artifactPaths?: string[];
	sourcePaths?: string[];
	markdown?: SourceMapMarkdownEntry[];
}

export function sourceMapExcluded(
	map: SourceMapContract,
	path: string,
): boolean {
	return matchesAny(path, map.defaults.excluded);
}

export function sourceMapComponentsForPath(
	map: SourceMapContract,
	path: string,
): SourceMapComponent[] {
	if (sourceMapExcluded(map, path)) return [];
	return map.components.filter((component) =>
		matchesAny(path, component.sourcePatterns),
	);
}

export function sourceMapOwnerForPath(
	map: SourceMapContract,
	path: string,
): SourceMapComponent | undefined {
	return sourceMapComponentsForPath(map, path).sort(
		(left, right) => componentSpecificity(right) - componentSpecificity(left),
	)[0];
}

export function sourceMapComponentById(
	map: SourceMapContract,
	id: string,
): SourceMapComponent | undefined {
	const normalized = normalizeComponentRef(id);
	return map.components.find(
		(component) => normalizeComponentRef(component.id) === normalized,
	);
}

export function componentsForRefs(
	map: SourceMapContract,
	componentRefs: string[],
): SourceMapComponent[] {
	const requested = new Set(componentRefs.map(normalizeComponentRef));
	return map.components.filter((component) =>
		requested.has(normalizeComponentRef(component.id)),
	);
}

export function unknownComponentRefs(
	map: SourceMapContract,
	componentRefs: string[],
): string[] {
	const known = new Set(
		map.components.map((component) => normalizeComponentRef(component.id)),
	);
	return unique(componentRefs).filter(
		(componentRef) => !known.has(normalizeComponentRef(componentRef)),
	);
}

export function componentKbRefs(
	map: SourceMapContract,
	componentRefs: string[],
): string[] {
	return unique(
		componentsForRefs(map, componentRefs).flatMap((component) => [
			component.doc,
		]),
	);
}

export function componentSupportsSourcePath(
	component: SourceMapComponent,
	path: string,
): boolean {
	return matchesAny(path, [component.doc, ...component.sourcePatterns]);
}

export function componentSupportsTestPath(
	component: SourceMapComponent,
	path: string,
): boolean {
	return matchesAny(path, component.testPatterns);
}

export function validateSourceMap(
	map: SourceMapContract,
	input: SourceMapValidationInput = {},
): SourceMapValidationIssue[] {
	void input.markdown;
	return [
		...duplicateComponentIssues(map),
		...artifactIssues(map, input.artifactPaths || []),
		...sourceOwnerIssues(map, input.sourcePaths || []),
	];
}

function duplicateComponentIssues(
	map: SourceMapContract,
): SourceMapValidationIssue[] {
	const seen = new Set<string>();
	return map.components.flatMap((component) => {
		if (!seen.has(component.id)) {
			seen.add(component.id);
			return [];
		}
		return [
			issue("duplicate_component_id", {
				componentId: component.id,
				message: `Duplicate source ownership component ${component.id}.`,
			}),
		];
	});
}

function artifactIssues(
	map: SourceMapContract,
	artifactPaths: string[],
): SourceMapValidationIssue[] {
	if (artifactPaths.length === 0) return [];
	return [
		...map.sourceRefs.flatMap((path) =>
			artifactPathExists(artifactPaths, path)
				? []
				: [
						issue("missing_source_ref", {
							path,
							message: `Source-map source doc ${path} does not exist.`,
						}),
					],
		),
		...map.components.flatMap((component) =>
			componentArtifactIssues(component, artifactPaths),
		),
	];
}

function componentArtifactIssues(
	component: SourceMapComponent,
	artifactPaths: string[],
): SourceMapValidationIssue[] {
	return [
		...(artifactPathExists(artifactPaths, component.doc)
			? []
			: [
					issue("missing_component_doc", {
						componentId: component.id,
						path: component.doc,
						message: `Source ownership component ${component.id} doc ${component.doc} does not exist.`,
					}),
				]),
		...missingPatternIssues(component, artifactPaths),
		...missingTestContractIssues(component),
	];
}

function missingPatternIssues(
	component: SourceMapComponent,
	artifactPaths: string[],
): SourceMapValidationIssue[] {
	return [
		...component.sourcePatterns.flatMap((pattern) =>
			patternMatchesArtifacts(artifactPaths, pattern)
				? []
				: [
						issue("missing_source_pattern_artifact", {
							componentId: component.id,
							pattern,
							message: `Source ownership component ${component.id} source pattern ${pattern} matches no artifact.`,
						}),
					],
		),
		...component.testPatterns.flatMap((pattern) =>
			patternMatchesArtifacts(artifactPaths, pattern) || component.testRationale
				? []
				: [
						issue("missing_test_pattern_artifact", {
							componentId: component.id,
							pattern,
							message: `Source ownership component ${component.id} test pattern ${pattern} matches no artifact.`,
						}),
					],
		),
	];
}

function missingTestContractIssues(
	component: SourceMapComponent,
): SourceMapValidationIssue[] {
	if (component.testPatterns.length > 0 || component.testRationale) return [];
	return [
		issue("missing_test_contract", {
			componentId: component.id,
			message: `Source ownership component ${component.id} needs tests or explicit test rationale.`,
		}),
	];
}

function sourceOwnerIssues(
	map: SourceMapContract,
	sourcePaths: string[],
): SourceMapValidationIssue[] {
	return sourcePaths.flatMap((path) => {
		if (sourceMapExcluded(map, path) || sourceMapOwnerForPath(map, path)) {
			return [];
		}
		return [
			issue("missing_source_owner", {
				path,
				message: `Source file ${path} has no OKF source owner.`,
			}),
		];
	});
}

function artifactPathExists(artifactPaths: string[], path: string): boolean {
	return artifactPaths.some((artifactPath) =>
		pathMatchesPattern(artifactPath, path),
	);
}

function patternMatchesArtifacts(
	artifactPaths: string[],
	pattern: string,
): boolean {
	return artifactPaths.some((artifactPath) =>
		pathMatchesPattern(artifactPath, pattern),
	);
}

function issue(
	code: SourceMapValidationIssueCode,
	input: Omit<SourceMapValidationIssue, "code">,
): SourceMapValidationIssue {
	return { code, ...input };
}

function matchesAny(path: string, patterns: string[]): boolean {
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
	if (!normalizedPattern.includes("*")) {
		return normalizedPath === normalizedPattern;
	}
	return globSegmentsMatch(
		normalizedPattern.split("/"),
		normalizedPath.split("/"),
	);
}

function componentSpecificity(component: SourceMapComponent): number {
	return Math.max(
		0,
		...component.sourcePatterns.map(
			(pattern) => pattern.replace(/\*/g, "").length,
		),
	);
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

function normalizeComponentRef(value: string): string {
	const normalized = text(value);
	return normalized.startsWith("component.")
		? normalized.slice("component.".length)
		: normalized;
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
