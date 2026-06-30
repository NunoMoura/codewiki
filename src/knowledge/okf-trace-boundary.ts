import { normalizeOkfPath } from "./okf.ts";
import type { OkfBundleFile } from "./okf-validation.ts";

export const CODEWIKI_KB_ROOT = ".codewiki/kb/";
export const CODEWIKI_TRACE_ROOT = ".codewiki/traces/";

export type CodeWikiOkfBoundaryKind =
	| "okf_kb_markdown"
	| "trace_jsonl"
	| "trace_other"
	| "outside_codewiki_okf";

export interface CodeWikiOkfBoundaryEntry {
	path: string;
	kind: CodeWikiOkfBoundaryKind;
}

export function classifyCodeWikiOkfBoundary(
	path: string,
): CodeWikiOkfBoundaryEntry {
	const normalized = normalizeCodeWikiBoundaryPath(path);
	if (normalized.startsWith(CODEWIKI_TRACE_ROOT)) {
		return {
			path: normalized,
			kind: normalized.endsWith(".jsonl") ? "trace_jsonl" : "trace_other",
		};
	}
	if (normalized.startsWith(CODEWIKI_KB_ROOT) && normalized.endsWith(".md")) {
		return { path: normalized, kind: "okf_kb_markdown" };
	}
	return { path: normalized, kind: "outside_codewiki_okf" };
}

export function isCodeWikiOkfKnowledgePath(path: string): boolean {
	return classifyCodeWikiOkfBoundary(path).kind === "okf_kb_markdown";
}

export function isCodeWikiTraceJsonlPath(path: string): boolean {
	return classifyCodeWikiOkfBoundary(path).kind === "trace_jsonl";
}

export function codeWikiOkfBundleFiles(
	files: OkfBundleFile[],
): OkfBundleFile[] {
	return files
		.filter((file) => isCodeWikiOkfKnowledgePath(file.path))
		.map((file) => ({
			path: codeWikiKbRelativePath(file.path),
			content: file.content,
		}))
		.sort((left, right) => left.path.localeCompare(right.path));
}

export function codeWikiTraceBoundaryEntries(
	files: { path: string }[],
): CodeWikiOkfBoundaryEntry[] {
	return files
		.map((file) => classifyCodeWikiOkfBoundary(file.path))
		.filter((entry) =>
			entry.kind === "trace_jsonl" || entry.kind === "trace_other"
		)
		.sort((left, right) => left.path.localeCompare(right.path));
}

export function codeWikiKbRelativePath(path: string): string {
	const normalized = normalizeCodeWikiBoundaryPath(path);
	return normalized.startsWith(CODEWIKI_KB_ROOT)
		? normalized.slice(CODEWIKI_KB_ROOT.length)
		: normalized;
}

function normalizeCodeWikiBoundaryPath(path: string): string {
	return normalizeOkfPath(path).replace(/^\.\//, "");
}
