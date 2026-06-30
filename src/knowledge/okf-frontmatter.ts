import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
	okfConceptId,
	okfDocumentKind,
	normalizeOkfPath,
	type OkfDocumentKind,
} from "./okf.ts";

export type OkfFrontmatterValue = Record<string, unknown>;

export interface OkfFrontmatterBlock {
	frontmatter: OkfFrontmatterValue;
	frontmatterText: string;
	body: string;
}

export interface OkfFrontmatterParseFailure {
	message: string;
}

export interface OkfDocument {
	path: string;
	kind: OkfDocumentKind;
	conceptId?: string;
	frontmatter?: OkfFrontmatterValue;
	frontmatterText?: string;
	body: string;
}

export interface SerializeOkfDocumentInput {
	frontmatter: OkfFrontmatterValue;
	body: string;
}

export function splitOkfFrontmatter(
	source: string,
): OkfFrontmatterBlock | undefined {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return undefined;
	const frontmatterText = match[1] || "";
	return {
		frontmatter: parseOkfFrontmatter(frontmatterText),
		frontmatterText,
		body: source.slice(match[0].length),
	};
}

export function parseOkfFrontmatter(source: string): OkfFrontmatterValue {
	const parsed = parseYaml(source) ?? {};
	if (!isPlainRecord(parsed)) {
		throw new Error("OKF frontmatter must be a YAML mapping.");
	}
	return parsed;
}

export function parseOkfDocument(path: string, source: string): OkfDocument {
	const normalizedPath = normalizeOkfPath(path);
	const block = splitOkfFrontmatter(source);
	return {
		path: normalizedPath,
		kind: okfDocumentKind(normalizedPath),
		conceptId: okfConceptId(normalizedPath),
		frontmatter: block?.frontmatter,
		frontmatterText: block?.frontmatterText,
		body: block?.body ?? source,
	};
}

export function tryParseOkfDocument(
	path: string,
	source: string,
): OkfDocument | OkfFrontmatterParseFailure {
	try {
		return parseOkfDocument(path, source);
	} catch (error) {
		return { message: error instanceof Error ? error.message : String(error) };
	}
}

export function serializeOkfDocument(input: SerializeOkfDocumentInput): string {
	const yaml = stringifyYaml(input.frontmatter, { lineWidth: 0 }).trimEnd();
	return `---\n${yaml}\n---\n${input.body}`;
}

export function okfFrontmatterString(
	frontmatter: OkfFrontmatterValue,
	key: string,
): string | undefined {
	const value = frontmatter[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function okfFrontmatterStringList(
	frontmatter: OkfFrontmatterValue,
	key: string,
): string[] | undefined {
	const value = frontmatter[key];
	if (!Array.isArray(value)) return undefined;
	return value.filter((item): item is string => typeof item === "string");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
