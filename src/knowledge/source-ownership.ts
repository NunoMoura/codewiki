import { isOkfMarkdownPath, normalizeOkfPath } from "./okf.ts";
import { parseOkfDocument } from "./okf-frontmatter.ts";
import {
	sourceMapFromOkfSourceMapExtensions,
	type CodeWikiOkfSourceMapComponent,
	type CodeWikiOkfSourceMapExtensionFields,
	type OkfSourceMapConceptExtension,
} from "./okf-source-map.ts";
import {
	componentsForRefs,
	componentSupportsSourcePath,
	componentSupportsTestPath,
	sourceMapComponentById,
	sourceMapComponentsForPath,
	sourceMapOwnerForPath,
	unknownComponentRefs,
	validateSourceMap,
	type SourceMapComponent,
	type SourceMapContract,
	type SourceMapDefaults,
	type SourceMapValidationInput,
	type SourceMapValidationIssue,
} from "./source-map.ts";
import type { OkfBundleFile } from "./okf-validation.ts";

export interface SourceOwnershipOptions {
	id?: string;
	defaults?: SourceMapDefaults;
	sourceRefs?: string[];
}

export const CODEWIKI_SOURCE_OWNERSHIP_ID = "spec.system.source-ownership";
export const CODEWIKI_SOURCE_OWNERSHIP_REFS = [
	".codewiki/kb/system/components/knowledge.md",
];
export const CODEWIKI_SOURCE_OWNERSHIP_DEFAULTS: SourceMapDefaults = {
	inheritance: true,
	maxOwnerDepth: 2,
	excluded: [
		"node_modules/**",
		".pi/**",
		".git/**",
		"coverage/**",
		"dist/**",
		"**/*.d.ts",
		"**/*.tgz",
	],
};

export type SourceOwnershipMap = SourceMapContract;
export type SourceOwnershipComponent = SourceMapComponent;

export function okfSourceOwnershipExtensionsFromBundle(
	files: OkfBundleFile[],
): OkfSourceMapConceptExtension[] {
	return files
		.filter((file) => isOkfMarkdownPath(file.path))
		.map((file) => ({
			path: normalizeOkfPath(file.path),
			content: file.content,
		}))
		.flatMap((file) => {
			const document = parseOkfDocument(file.path, file.content);
			if (document.kind !== "concept" || !document.frontmatter) return [];
			const fields = sourceOwnershipFieldsFromFrontmatter(document.frontmatter);
			return fields ? [{ path: document.path, fields }] : [];
		})
		.sort((left, right) => left.path.localeCompare(right.path));
}

export function sourceOwnershipMapFromOkfBundle(
	files: OkfBundleFile[],
	options: SourceOwnershipOptions = {},
): SourceOwnershipMap {
	return sourceMapFromOkfSourceMapExtensions({
		extensions: okfSourceOwnershipExtensionsFromBundle(files),
		defaults: options.defaults || CODEWIKI_SOURCE_OWNERSHIP_DEFAULTS,
		sourceRefs: options.sourceRefs || CODEWIKI_SOURCE_OWNERSHIP_REFS,
		id: options.id || CODEWIKI_SOURCE_OWNERSHIP_ID,
	});
}

export function sourceOwnershipOwnerForPath(
	files: OkfBundleFile[],
	path: string,
	options: SourceOwnershipOptions = {},
): SourceOwnershipComponent | undefined {
	return sourceMapOwnerForPath(
		sourceOwnershipMapFromOkfBundle(files, options),
		path,
	);
}

export function sourceOwnershipComponentsForPath(
	files: OkfBundleFile[],
	path: string,
	options: SourceOwnershipOptions = {},
): SourceOwnershipComponent[] {
	return sourceMapComponentsForPath(
		sourceOwnershipMapFromOkfBundle(files, options),
		path,
	);
}

export function sourceOwnershipComponentById(
	files: OkfBundleFile[],
	id: string,
	options: SourceOwnershipOptions = {},
): SourceOwnershipComponent | undefined {
	return sourceMapComponentById(
		sourceOwnershipMapFromOkfBundle(files, options),
		id,
	);
}

export function sourceOwnershipComponentsForRefs(
	files: OkfBundleFile[],
	componentRefs: string[],
	options: SourceOwnershipOptions = {},
): SourceOwnershipComponent[] {
	return componentsForRefs(
		sourceOwnershipMapFromOkfBundle(files, options),
		componentRefs,
	);
}

export function unknownSourceOwnershipRefs(
	files: OkfBundleFile[],
	componentRefs: string[],
	options: SourceOwnershipOptions = {},
): string[] {
	return unknownComponentRefs(
		sourceOwnershipMapFromOkfBundle(files, options),
		componentRefs,
	);
}

export function sourceOwnershipSupportsSourcePath(
	component: SourceOwnershipComponent,
	path: string,
): boolean {
	return componentSupportsSourcePath(component, path);
}

export function sourceOwnershipSupportsTestPath(
	component: SourceOwnershipComponent,
	path: string,
): boolean {
	return componentSupportsTestPath(component, path);
}

export function validateSourceOwnershipFromOkfBundle(
	files: OkfBundleFile[],
	input: SourceMapValidationInput = {},
	options: SourceOwnershipOptions = {},
): SourceMapValidationIssue[] {
	return validateSourceMap(
		sourceOwnershipMapFromOkfBundle(files, options),
		input,
	);
}

function sourceOwnershipFieldsFromFrontmatter(
	frontmatter: Record<string, unknown>,
): CodeWikiOkfSourceMapExtensionFields | undefined {
	const structured = structuredComponents(frontmatter.codewiki_source_map);
	const singleComponent = stringValue(frontmatter.codewiki_component);
	const components = uniqueStrings([
		...optional(singleComponent),
		...stringList(frontmatter.codewiki_components),
		...structured.map((component) => component.id),
	]);
	const sourcePatterns = uniqueStrings([
		...stringList(frontmatter.codewiki_source_patterns),
		...structured.flatMap((component) => component.source_patterns),
	]);
	if (components.length === 0 && sourcePatterns.length === 0) return undefined;
	const testPatterns = uniqueStrings([
		...stringList(frontmatter.codewiki_test_patterns),
		...structured.flatMap((component) => component.test_patterns),
	]);
	const traceEvents = uniqueStrings([
		...stringList(frontmatter.codewiki_trace_events),
		...structured.flatMap((component) => component.trace_events || []),
	]);
	const generatedViews = uniqueStrings([
		...stringList(frontmatter.codewiki_generated_views),
		...structured.flatMap((component) => component.generated_views || []),
	]);
	const roles = stringList(frontmatter.codewiki_roles);
	return {
		...(singleComponent ? { codewiki_component: singleComponent } : {}),
		codewiki_components: components,
		codewiki_source_patterns: sourcePatterns,
		codewiki_test_patterns: testPatterns,
		...(traceEvents.length ? { codewiki_trace_events: traceEvents } : {}),
		...(generatedViews.length
			? { codewiki_generated_views: generatedViews }
			: {}),
		...(stringValue(frontmatter.codewiki_role)
			? { codewiki_role: stringValue(frontmatter.codewiki_role) }
			: {}),
		...(roles.length ? { codewiki_roles: roles } : {}),
		...(stringValue(frontmatter.codewiki_test_policy)
			? { codewiki_test_policy: stringValue(frontmatter.codewiki_test_policy) }
			: {}),
		...(stringValue(frontmatter.codewiki_test_rationale)
			? {
					codewiki_test_rationale: stringValue(
						frontmatter.codewiki_test_rationale,
					),
				}
			: {}),
		codewiki_source_map: structured,
	};
}

function structuredComponents(value: unknown): CodeWikiOkfSourceMapComponent[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const record = objectRecord(item);
		const id = stringValue(record.id);
		if (!id) return [];
		const generatedViews = stringList(record.generated_views);
		const traceEvents = stringList(record.trace_events);
		return [
			{
				id,
				...(stringValue(record.doc) ? { doc: stringValue(record.doc) } : {}),
				source_patterns: stringList(record.source_patterns),
				test_patterns: stringList(record.test_patterns),
				...(generatedViews.length ? { generated_views: generatedViews } : {}),
				...(traceEvents.length ? { trace_events: traceEvents } : {}),
				...(stringValue(record.role) ? { role: stringValue(record.role) } : {}),
				...(stringValue(record.test_policy)
					? { test_policy: stringValue(record.test_policy) }
					: {}),
				...(stringValue(record.test_rationale)
					? { test_rationale: stringValue(record.test_rationale) }
					: {}),
			},
		];
	});
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function optional(value: string | undefined): string[] {
	return value ? [value] : [];
}

function uniqueStrings(values: readonly string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
