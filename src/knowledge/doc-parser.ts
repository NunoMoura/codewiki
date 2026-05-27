import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import yaml from "js-yaml";
import type { WikiProject } from "../project/types.ts";

const H1_RE = /^#\s+(.+)$/m;
const LINK_RE = /\]\(([^)]+)\)/g;
const REPO_PATH_RE =
	/(^|[^A-Za-z0-9_./-])((?:\.codewiki|src|skills|scripts|tests|docs)\/[A-Za-z0-9._~@%+=:,/{}*?-]+|(?:README\.md|package(?:-lock)?\.json|tsconfig\.json)\b)/g;

export interface ParsedDoc {
	path: string; // Relative to repo root
	frontmatter: Record<string, any>;
	body: string;
	title: string;
	summary: string;
	owners: string[];
	tags: string[];
	code_paths: string[];
	spec_paths: string[];
	diagram_refs: string[];
	source_paths: string[];
	doc_type: string;
	links: string[];
}

export function splitFrontmatter(text: string): {
	data: Record<string, any>;
	body: string;
} {
	if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
		return { data: {}, body: text };
	}
	const endMatch = text.match(/\r?\n---\r?\n/);
	if (!endMatch || endMatch.index === undefined) {
		return { data: {}, body: text };
	}
	const end = endMatch.index;
	const raw = text.substring(text.indexOf("\n") + 1, end);
	const body = text.substring(end + endMatch[0].length);

	try {
		const loaded = yaml.load(raw);
		const data = typeof loaded === "object" && loaded !== null ? loaded : {};
		return { data: data as Record<string, any>, body };
	} catch (e) {
		return { data: {}, body };
	}
}

export function extractTitle(
	filePath: string,
	body: string,
	frontmatter: Record<string, any>,
): string {
	if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
		return frontmatter.title.trim();
	}
	const match = H1_RE.exec(body);
	if (match) {
		return match[1].trim();
	}
	const stem = basename(filePath, extname(filePath))
		.replace(/[-_]/g, " ")
		.trim();
	if (stem) {
		return stem
			.split(" ")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
	}
	return basename(filePath);
}

export function classifyDoc(
	repoRoot: string,
	project: WikiProject,
	absolutePath: string,
): string {
	if (
		project.roadmapDocPath &&
		absolutePath === resolve(repoRoot, project.roadmapDocPath)
	) {
		return "roadmap";
	}
	if (absolutePath.startsWith(resolve(repoRoot, project.specsRoot))) {
		return "spec";
	}
	return "doc";
}

export function normalizeLocalLink(
	repoRoot: string,
	sourceRel: string,
	target: string,
): string | null {
	const sourceDir = dirname(resolve(repoRoot, sourceRel));
	const targetPath = resolve(sourceDir, target);
	if (!targetPath.startsWith(resolve(repoRoot))) {
		return null; // Escapes repo
	}
	// Normalizes to posix path
	return relative(repoRoot, targetPath).split("\\").join("/");
}

export function extractLinks(
	repoRoot: string,
	body: string,
	relPath: string,
): string[] {
	const links = new Set<string>();
	let match;
	while ((match = LINK_RE.exec(body)) !== null) {
		const target = match[1].trim();
		if (
			!target ||
			target.startsWith("#") ||
			target.includes("://") ||
			target.startsWith("mailto:")
		) {
			continue;
		}
		const base = target.split("#")[0];
		if (!base) continue;

		const normalized = normalizeLocalLink(repoRoot, relPath, base);
		if (normalized) {
			links.add(normalized);
		}
	}
	return Array.from(links).sort();
}

function normalizeRepoPathRef(raw: string): string {
	return raw
		.trim()
		.replace(/^[`"'(]+/, "")
		.replace(/[`"'),.;:]+$/, "")
		.replace(/\\/g, "/")
		.replace(/^\.\//, "");
}

function sourcePathExists(repoRoot: string, relPath: string): boolean {
	const wildcardIndex = relPath.indexOf("*");
	const candidate =
		wildcardIndex >= 0
			? relPath.slice(0, wildcardIndex).replace(/\/+$/, "")
			: relPath;
	if (!candidate) return false;
	return existsSync(resolve(repoRoot, candidate));
}

export function extractSourcePaths(repoRoot: string, body: string): string[] {
	const refs = new Set<string>();
	let match;
	while ((match = REPO_PATH_RE.exec(body)) !== null) {
		const normalized = normalizeRepoPathRef(match[2] || "");
		if (!normalized || normalized.includes("://")) continue;
		if (sourcePathExists(repoRoot, normalized)) refs.add(normalized);
	}
	return Array.from(refs).sort();
}

function stringList(value: any): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function parseDoc(
	repoRoot: string,
	project: WikiProject,
	absolutePath: string,
): ParsedDoc {
	const text = readFileSync(absolutePath, "utf8");
	const { data: frontmatter, body } = splitFrontmatter(text);

	const relPath = relative(repoRoot, absolutePath).split("\\").join("/");
	const title = extractTitle(absolutePath, body, frontmatter);

	const docType = classifyDoc(repoRoot, project, absolutePath);
	const links = extractLinks(repoRoot, body, relPath);

	return {
		path: relPath,
		frontmatter,
		body,
		title,
		summary: typeof frontmatter.summary === "string" ? frontmatter.summary : "",
		owners: Array.isArray(frontmatter.owners) ? frontmatter.owners : [],
		tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
		code_paths: stringList(frontmatter.code_paths),
		spec_paths: stringList(frontmatter.spec_paths),
		diagram_refs: stringList(frontmatter.diagram_refs),
		source_paths: extractSourcePaths(repoRoot, body),
		doc_type: docType,
		links,
	};
}
