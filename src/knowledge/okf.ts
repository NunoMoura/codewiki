import { basename } from "node:path/posix";

export const OKF_VERSION = "0.1" as const;
export const OKF_RESERVED_FILENAMES = ["index.md", "log.md"] as const;

export type OkfReservedFilename = (typeof OKF_RESERVED_FILENAMES)[number];
export type OkfDocumentKind = "concept" | "index" | "log";

export interface OkfMarkdownLink {
	label: string;
	target: string;
	start: number;
	end: number;
}

export function normalizeOkfPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function isOkfMarkdownPath(path: string): boolean {
	return normalizeOkfPath(path).endsWith(".md");
}

export function okfReservedFilename(
	path: string,
): OkfReservedFilename | undefined {
	const name = basename(normalizeOkfPath(path));
	return OKF_RESERVED_FILENAMES.includes(name as OkfReservedFilename)
		? (name as OkfReservedFilename)
		: undefined;
}

export function isOkfReservedPath(path: string): boolean {
	return Boolean(okfReservedFilename(path));
}

export function okfDocumentKind(path: string): OkfDocumentKind {
	const reserved = okfReservedFilename(path);
	if (reserved === "index.md") return "index";
	if (reserved === "log.md") return "log";
	return "concept";
}

export function okfConceptId(path: string): string | undefined {
	const normalized = normalizeOkfPath(path);
	if (!normalized.endsWith(".md") || isOkfReservedPath(normalized))
		return undefined;
	return normalized.slice(0, -".md".length);
}

export function isOkfRootIndexPath(path: string): boolean {
	return normalizeOkfPath(path) === "index.md";
}

export function extractOkfMarkdownLinks(markdown: string): OkfMarkdownLink[] {
	const links: OkfMarkdownLink[] = [];
	const pattern = /(?<!!)\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	for (const match of markdown.matchAll(pattern)) {
		links.push({
			label: match[1] || "",
			target: match[2] || "",
			start: match.index || 0,
			end: (match.index || 0) + match[0].length,
		});
	}
	return links;
}
