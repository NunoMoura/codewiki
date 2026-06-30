import {
	sourceMapOwnerForPath,
	type SourceMapComponent,
	type SourceMapContract,
	type SourceMapDefaults,
} from "./source-map.ts";
import type { OkfFrontmatterValue } from "./okf-frontmatter.ts";
import { normalizeOkfPath } from "./okf.ts";

export const CODEWIKI_OKF_SOURCE_MAP_EXTENSION_KEYS = [
	"codewiki_component",
	"codewiki_components",
	"codewiki_source_patterns",
	"codewiki_test_patterns",
	"codewiki_trace_events",
	"codewiki_generated_views",
	"codewiki_role",
	"codewiki_roles",
	"codewiki_test_policy",
	"codewiki_test_rationale",
	"codewiki_source_map",
] as const;

export interface CodeWikiOkfSourceMapComponent {
	id: string;
	source_patterns: string[];
	test_patterns: string[];
	generated_views?: string[];
	trace_events?: string[];
	role?: string;
	test_policy?: string;
	test_rationale?: string;
}

export interface CodeWikiOkfSourceMapExtensionFields {
	codewiki_component?: string;
	codewiki_components: string[];
	codewiki_source_patterns: string[];
	codewiki_test_patterns: string[];
	codewiki_trace_events?: string[];
	codewiki_generated_views?: string[];
	codewiki_role?: string;
	codewiki_roles?: string[];
	codewiki_test_policy?: string;
	codewiki_test_rationale?: string;
	codewiki_source_map: CodeWikiOkfSourceMapComponent[];
}

export interface OkfSourceMapConceptExtension {
	path: string;
	fields: CodeWikiOkfSourceMapExtensionFields;
}

export function generateOkfSourceMapExtensions(
	map: SourceMapContract,
): OkfSourceMapConceptExtension[] {
	return [...componentsByDoc(map).entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([path, components]) => ({
			path,
			fields: okfSourceMapExtensionFields(components),
		}));
}

export function okfSourceMapExtensionForDoc(
	map: SourceMapContract,
	docPath: string,
): CodeWikiOkfSourceMapExtensionFields | undefined {
	const components = componentsByDoc(map).get(normalizeOkfPath(docPath));
	return components ? okfSourceMapExtensionFields(components) : undefined;
}

export function mergeOkfSourceMapExtension(
	frontmatter: OkfFrontmatterValue,
	fields: CodeWikiOkfSourceMapExtensionFields,
): OkfFrontmatterValue {
	const next: OkfFrontmatterValue = { ...frontmatter };
	for (const key of CODEWIKI_OKF_SOURCE_MAP_EXTENSION_KEYS) delete next[key];
	return { ...next, ...definedObject(fields) };
}

export function sourceMapFromOkfSourceMapExtensions(input: {
	extensions: OkfSourceMapConceptExtension[];
	defaults?: SourceMapDefaults;
	sourceRefs?: string[];
	id?: string;
}): SourceMapContract {
	return {
		id: input.id,
		sourceRefs: uniqueStrings(input.sourceRefs || []),
		defaults: input.defaults || { inheritance: true, excluded: [] },
		components: input.extensions.flatMap(okfExtensionComponents),
	};
}

export function okfSourceMapOwnerForPath(
	extensions: OkfSourceMapConceptExtension[],
	path: string,
	options: { defaults?: SourceMapDefaults } = {},
): SourceMapComponent | undefined {
	return sourceMapOwnerForPath(
		sourceMapFromOkfSourceMapExtensions({
			extensions,
			defaults: options.defaults,
		}),
		path,
	);
}

function componentsByDoc(
	map: SourceMapContract,
): Map<string, SourceMapComponent[]> {
	const output = new Map<string, SourceMapComponent[]>();
	for (const component of map.components) {
		const path = normalizeOkfPath(component.doc);
		output.set(path, [...(output.get(path) || []), component]);
	}
	return output;
}

function okfSourceMapExtensionFields(
	components: SourceMapComponent[],
): CodeWikiOkfSourceMapExtensionFields {
	const ordered = [...components].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const componentIds = ordered.map((component) => component.id);
	const roles = uniqueStrings(ordered.flatMap((component) => optional(component.role)));
	const testPolicies = uniqueStrings(
		ordered.flatMap((component) => optional(component.testPolicy)),
	);
	const testRationales = uniqueStrings(
		ordered.flatMap((component) => optional(component.testRationale)),
	);
	return definedObject({
		codewiki_component: componentIds.length === 1 ? componentIds[0] : undefined,
		codewiki_components: componentIds,
		codewiki_source_patterns: uniqueStrings(
			ordered.flatMap((component) => component.sourcePatterns),
		),
		codewiki_test_patterns: uniqueStrings(
			ordered.flatMap((component) => component.testPatterns),
		),
		codewiki_trace_events: uniqueStrings(
			ordered.flatMap((component) => component.traceEvents),
		),
		codewiki_generated_views: uniqueStrings(
			ordered.flatMap((component) => component.generatedViews),
		),
		codewiki_role: roles.length === 1 ? roles[0] : undefined,
		codewiki_roles: roles.length > 1 ? roles : undefined,
		codewiki_test_policy:
			testPolicies.length === 1 ? testPolicies[0] : undefined,
		codewiki_test_rationale:
			testRationales.length === 1 ? testRationales[0] : undefined,
		codewiki_source_map: ordered.map(okfComponentExtension),
	});
}

function okfComponentExtension(
	component: SourceMapComponent,
): CodeWikiOkfSourceMapComponent {
	return definedObject({
		id: component.id,
		source_patterns: component.sourcePatterns,
		test_patterns: component.testPatterns,
		generated_views: component.generatedViews,
		trace_events: component.traceEvents,
		role: component.role,
		test_policy: component.testPolicy,
		test_rationale: component.testRationale,
	});
}

function okfExtensionComponents(
	extension: OkfSourceMapConceptExtension,
): SourceMapComponent[] {
	const structured = sourceMapComponentsFromStructuredExtension(extension);
	if (structured.length > 0) return structured;
	const fields = extension.fields;
	return sourceMapComponentsFromFlatExtension(extension.path, fields);
}

function sourceMapComponentsFromStructuredExtension(
	extension: OkfSourceMapConceptExtension,
): SourceMapComponent[] {
	return extension.fields.codewiki_source_map.flatMap((component) => {
		if (!component.id) return [];
		return [
			{
				id: component.id,
				doc: normalizeOkfPath(extension.path),
				sourcePatterns: uniqueStrings(component.source_patterns),
				testPatterns: uniqueStrings(component.test_patterns),
				generatedViews: uniqueStrings(component.generated_views || []),
				traceEvents: uniqueStrings(component.trace_events || []),
				role: component.role,
				testPolicy: component.test_policy,
				testRationale: component.test_rationale,
			},
		];
	});
}

function sourceMapComponentsFromFlatExtension(
	path: string,
	fields: CodeWikiOkfSourceMapExtensionFields,
): SourceMapComponent[] {
	const ids = fields.codewiki_component
		? [fields.codewiki_component]
		: fields.codewiki_components;
	return ids.flatMap((id) => {
		if (!id) return [];
		return [
			{
				id,
				doc: normalizeOkfPath(path),
				sourcePatterns: uniqueStrings(fields.codewiki_source_patterns),
				testPatterns: uniqueStrings(fields.codewiki_test_patterns),
				generatedViews: uniqueStrings(fields.codewiki_generated_views || []),
				traceEvents: uniqueStrings(fields.codewiki_trace_events || []),
				role: fields.codewiki_role,
				testPolicy: fields.codewiki_test_policy,
				testRationale: fields.codewiki_test_rationale,
			},
		];
	});
}

function definedObject<T extends object>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) =>
			Array.isArray(entry) ? entry.length > 0 : entry !== undefined,
		),
	) as T;
}

function optional(value: string | undefined): string[] {
	return value ? [value] : [];
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
	return Array.from(
		new Set((values || []).map((value) => value.trim()).filter(Boolean)),
	);
}
