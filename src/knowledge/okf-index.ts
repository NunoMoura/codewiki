import { basename, dirname } from "node:path/posix";
import {
	isOkfMarkdownPath,
	OKF_VERSION,
	okfDocumentKind,
	normalizeOkfPath,
} from "./okf.ts";
import {
	okfFrontmatterString,
	parseOkfDocument,
	type OkfDocument,
} from "./okf-frontmatter.ts";
import type { OkfBundleFile } from "./okf-validation.ts";

export interface OkfIndexEntry {
	title: string;
	path: string;
	description: string;
	kind: "concept" | "directory";
	conceptCount?: number;
}

export interface OkfDirectoryIndex {
	path: string;
	directory: string;
	content: string;
	concepts: OkfIndexEntry[];
	directories: OkfIndexEntry[];
}

export interface GenerateOkfDirectoryIndexOptions {
	directory?: string;
	title?: string;
	includeRootVersion?: boolean;
}

export interface GenerateOkfLogInput {
	title?: string;
	date: string;
	entries: OkfLogEntry[];
}

export interface OkfLogEntry {
	kind: string;
	text: string;
}

export function generateOkfDirectoryIndex(
	files: OkfBundleFile[],
	options: GenerateOkfDirectoryIndexOptions = {},
): OkfDirectoryIndex {
	const directory = normalizeOkfDirectory(options.directory || "");
	const documents = conceptDocuments(files);
	const concepts = directConceptEntries(documents, directory);
	const directories = childDirectoryEntries(documents, directory);
	const content = renderOkfDirectoryIndex({
		directory,
		title: options.title,
		concepts,
		directories,
		includeRootVersion: options.includeRootVersion === true,
	});
	return {
		path: directory ? `${directory}/index.md` : "index.md",
		directory,
		content,
		concepts,
		directories,
	};
}

export function generateOkfDirectoryIndexes(
	files: OkfBundleFile[],
	directories: string[] = ["", "product", "system"],
): OkfDirectoryIndex[] {
	return directories.map((directory) =>
		generateOkfDirectoryIndex(files, {
			directory,
			includeRootVersion: normalizeOkfDirectory(directory) === "",
		}),
	);
}

export function generateOkfLog(input: GenerateOkfLogInput): string {
	return [
		`# ${input.title || "Directory Update Log"}`,
		"",
		`## ${input.date}`,
		...input.entries.map(
			(entry) => `* **${entry.kind}**: ${entry.text.trim()}`,
		),
		"",
	].join("\n");
}

function renderOkfDirectoryIndex(input: {
	directory: string;
	title?: string;
	concepts: OkfIndexEntry[];
	directories: OkfIndexEntry[];
	includeRootVersion: boolean;
}): string {
	const lines: string[] = [];
	if (input.includeRootVersion) {
		lines.push("---", `okf_version: "${OKF_VERSION}"`, "---");
	}
	lines.push(`# ${input.title || indexTitle(input.directory)}`, "");
	if (input.concepts.length > 0) {
		lines.push("## Concepts", "");
		for (const entry of input.concepts) lines.push(renderIndexEntry(entry));
		lines.push("");
	}
	if (input.directories.length > 0) {
		lines.push("## Directories", "");
		for (const entry of input.directories) lines.push(renderIndexEntry(entry));
		lines.push("");
	}
	if (input.concepts.length === 0 && input.directories.length === 0) {
		lines.push("No concepts in this directory yet.", "");
	}
	return `${lines.join("\n").trimEnd()}\n`;
}

function directConceptEntries(
	documents: OkfDocument[],
	directory: string,
): OkfIndexEntry[] {
	return documents
		.filter((document) => okfDocumentDirectory(document.path) === directory)
		.map((document) => ({
			title: documentTitle(document),
			path: relativePathFromDirectory(directory, document.path),
			description: documentDescription(document),
			kind: "concept" as const,
		}))
		.sort(compareEntries);
}

function childDirectoryEntries(
	documents: OkfDocument[],
	directory: string,
): OkfIndexEntry[] {
	const childCounts = new Map<string, number>();
	for (const document of documents) {
		const child = childDirectoryFor(document.path, directory);
		if (!child) continue;
		childCounts.set(child, (childCounts.get(child) || 0) + 1);
	}
	return Array.from(childCounts.entries())
		.map(([child, count]) => ({
			title: titleFromPathSegment(basename(child)),
			path: `${basename(child)}/`,
			description: `${count} ${count === 1 ? "concept" : "concepts"} under \`${child}/\`.`,
			kind: "directory" as const,
			conceptCount: count,
		}))
		.sort(compareEntries);
}

function conceptDocuments(files: OkfBundleFile[]): OkfDocument[] {
	return files
		.filter((file) => isOkfMarkdownPath(file.path))
		.map((file) => ({
			path: normalizeOkfPath(file.path),
			content: file.content,
		}))
		.filter((file) => okfDocumentKind(file.path) === "concept")
		.map((file) => parseOkfDocument(file.path, file.content));
}

function normalizeOkfDirectory(directory: string): string {
	return normalizeOkfPath(directory)
		.replace(/\/index\.md$/, "")
		.replace(/\/$/, "");
}

function okfDocumentDirectory(path: string): string {
	const parent = dirname(normalizeOkfPath(path));
	return parent === "." ? "" : parent;
}

function childDirectoryFor(path: string, directory: string): string | undefined {
	const normalized = normalizeOkfPath(path);
	const rest = directory ? normalized.slice(directory.length + 1) : normalized;
	if (directory && !normalized.startsWith(`${directory}/`)) return undefined;
	const parts = rest.split("/");
	if (parts.length < 2) return undefined;
	return directory ? `${directory}/${parts[0]}` : parts[0];
}

function relativePathFromDirectory(directory: string, path: string): string {
	return directory ? normalizeOkfPath(path).slice(directory.length + 1) : path;
}

function documentTitle(document: OkfDocument): string {
	return (
		okfFrontmatterString(document.frontmatter || {}, "title") ||
		document.body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
		titleFromPathSegment(basename(document.path, ".md"))
	);
}

function documentDescription(document: OkfDocument): string {
	return (
		okfFrontmatterString(document.frontmatter || {}, "description") ||
		documentTitle(document)
	);
}

function indexTitle(directory: string): string {
	return directory
		? `${titleFromPathSegment(basename(directory))} Knowledge Index`
		: "CodeWiki Knowledge Index";
}

function titleFromPathSegment(segment: string): string {
	return segment
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map(titleWord)
		.join(" ");
}

function titleWord(value: string): string {
	const acronym = new Map([
		["api", "API"],
		["kb", "KB"],
		["okf", "OKF"],
		["ui", "UI"],
		["uis", "UIs"],
	]);
	return acronym.get(value.toLowerCase()) ||
		`${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function renderIndexEntry(entry: OkfIndexEntry): string {
	return `* [${escapeMarkdownLabel(entry.title)}](${entry.path}) - ${entry.description}`;
}

function escapeMarkdownLabel(value: string): string {
	return value.replace(/]/g, "\\]").replace(/\s+/g, " ").trim();
}

function compareEntries(left: OkfIndexEntry, right: OkfIndexEntry): number {
	return (
		left.title.localeCompare(right.title) || left.path.localeCompare(right.path)
	);
}
