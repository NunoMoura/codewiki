import { parse as parseYaml } from "yaml";
import { pathMatchesPattern } from "./file-structure-map.ts";

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

export function parseSourceMapYaml(source: string): SourceMapContract {
	return sourceMapFromUnknown(parseYaml(source));
}

export function sourceMapFromUnknown(value: unknown): SourceMapContract {
	const document = objectRecord(value);
	return {
		id: text(document.id) || undefined,
		sourceRefs: unique([
			...stringList(document.source_docs),
			...stringList(document.sourceDocs),
		]),
		defaults: defaultsFromUnknown(document.defaults),
		components: componentsFromUnknown(document.components),
	};
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
	return map.components.find((component) => component.id === id);
}

export function validateSourceMap(
	map: SourceMapContract,
	input: SourceMapValidationInput = {},
): SourceMapValidationIssue[] {
	return [
		...duplicateComponentIssues(map),
		...frontmatterIssues(input.markdown || []),
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
				message: `Duplicate source-map component ${component.id}.`,
			}),
		];
	});
}

function frontmatterIssues(
	markdown: SourceMapMarkdownEntry[],
): SourceMapValidationIssue[] {
	return markdown.flatMap((entry) =>
		entry.hasFrontmatter
			? [
					issue("frontmatter_not_allowed", {
						path: entry.path,
						message: `${entry.path} uses frontmatter; KB Markdown must start with body content.`,
					}),
				]
			: [],
	);
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
						message: `Source-map component ${component.id} doc ${component.doc} does not exist.`,
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
							message: `Source-map component ${component.id} source pattern ${pattern} matches no artifact.`,
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
							message: `Source-map component ${component.id} test pattern ${pattern} matches no artifact.`,
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
			message: `Source-map component ${component.id} needs tests or explicit test rationale.`,
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
				message: `Source file ${path} has no source-map owner.`,
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

function defaultsFromUnknown(value: unknown): SourceMapDefaults {
	const defaults = objectRecord(value);
	return {
		inheritance: booleanValue(defaults.inheritance, { fallback: true }),
		maxOwnerDepth: numberValue(
			defaults.max_owner_depth ?? defaults.maxOwnerDepth,
		),
		excluded: unique([
			...stringList(defaults.excluded),
			...stringList(defaults.exclude),
		]),
	};
}

function componentsFromUnknown(value: unknown): SourceMapComponent[] {
	const components = objectRecord(value);
	return Object.entries(components)
		.map(([id, raw]) => componentFromUnknown(id, raw))
		.filter((component) => component.id && component.doc);
}

function componentFromUnknown(id: string, value: unknown): SourceMapComponent {
	const component = objectRecord(value);
	return {
		id,
		doc: text(component.doc),
		sourcePatterns: unique([
			...stringList(component.source),
			...stringList(component.sources),
			...stringList(component.source_patterns),
			...stringList(component.sourcePatterns),
		]),
		testPatterns: unique([
			...stringList(component.tests),
			...stringList(component.test),
			...stringList(component.test_patterns),
			...stringList(component.testPatterns),
		]),
		generatedViews: unique([
			...stringList(component.generated_views),
			...stringList(component.generatedViews),
		]),
		traceEvents: unique([
			...stringList(component.trace_events),
			...stringList(component.traceEvents),
		]),
		role: text(component.role) || undefined,
		testPolicy:
			text(component.test_policy ?? component.testPolicy) || undefined,
		testRationale:
			text(component.test_rationale ?? component.testRationale) || undefined,
	};
}

function matchesAny(path: string, patterns: string[]): boolean {
	return patterns.some((pattern) => pathMatchesPattern(path, pattern));
}

function componentSpecificity(component: SourceMapComponent): number {
	return Math.max(
		0,
		...component.sourcePatterns.map(
			(pattern) => pattern.replace(/\*/g, "").length,
		),
	);
}

function booleanValue(value: unknown, options: { fallback: boolean }): boolean {
	if (typeof value === "boolean") return value;
	const output = text(value).toLowerCase();
	if (output === "true") return true;
	if (output === "false") return false;
	return options.fallback;
}

function numberValue(value: unknown): number | undefined {
	const output = Number(value);
	return Number.isFinite(output) ? output : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
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
