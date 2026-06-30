import { isOkfMarkdownPath, normalizeOkfPath, OKF_VERSION } from "./okf.ts";
import {
	codeWikiOkfBundleFiles,
	codeWikiTraceBoundaryEntries,
} from "./okf-trace-boundary.ts";
import {
	validateOkfBundle,
	type OkfBundleFile,
	type OkfBundleValidationResult,
} from "./okf-validation.ts";

export type OkfCompatibilityScope = "codewiki-kb" | "okf-bundle";

export interface OkfCompatibilityInput {
	files: OkfBundleFile[];
	scope?: OkfCompatibilityScope;
}

export interface OkfCompatibilityResult {
	okfVersion: typeof OKF_VERSION;
	scope: OkfCompatibilityScope;
	files: OkfBundleFile[];
	validation: OkfBundleValidationResult;
	excludedTraceFiles: string[];
}

export function exportCodeWikiOkfBundle(
	input: OkfCompatibilityInput,
): OkfCompatibilityResult {
	return okfCompatibilityResult(input, input.scope || "codewiki-kb");
}

export function validateCodeWikiOkfBundle(
	input: OkfCompatibilityInput,
): OkfCompatibilityResult {
	return okfCompatibilityResult(input, input.scope || "codewiki-kb");
}

export function consumeOkfBundle(
	input: OkfCompatibilityInput,
): OkfCompatibilityResult {
	return okfCompatibilityResult(input, input.scope || "okf-bundle");
}

function okfCompatibilityResult(
	input: OkfCompatibilityInput,
	scope: OkfCompatibilityScope,
): OkfCompatibilityResult {
	const files = okfFilesForScope(input.files, scope);
	return {
		okfVersion: OKF_VERSION,
		scope,
		files,
		validation: validateOkfBundle(files),
		excludedTraceFiles: codeWikiTraceBoundaryEntries(input.files).map(
			(entry) => entry.path,
		),
	};
}

function okfFilesForScope(
	files: OkfBundleFile[],
	scope: OkfCompatibilityScope,
): OkfBundleFile[] {
	return scope === "codewiki-kb"
		? codeWikiOkfBundleFiles(files)
		: okfBundleFiles(files);
}

function okfBundleFiles(files: OkfBundleFile[]): OkfBundleFile[] {
	return files
		.filter((file) => isOkfMarkdownPath(file.path))
		.map((file) => ({
			path: normalizeOkfPath(file.path),
			content: file.content,
		}))
		.sort((left, right) => left.path.localeCompare(right.path));
}
