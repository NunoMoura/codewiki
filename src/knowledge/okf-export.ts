import { createCodewikiOperationError } from "../error-handling/operation-errors.ts";
import {
	isOkfMarkdownPath,
	normalizeOkfPath,
	type OkfSupportedVersion,
} from "./okf.ts";
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
	okfVersion: OkfSupportedVersion;
	scope: OkfCompatibilityScope;
	files: OkfBundleFile[];
	validation: OkfBundleValidationResult;
	excludedTraceFiles: string[];
}

export type WikiOkfAction = "validate" | "export" | "consume";

export interface RunWikiOkfInput {
	action?: WikiOkfAction;
	files: OkfBundleFile[];
	scope?: OkfCompatibilityScope;
}

export interface RunWikiOkfResult extends OkfCompatibilityResult {
	action: WikiOkfAction;
}

export function runWikiOkf(input: RunWikiOkfInput): RunWikiOkfResult {
	const action = input.action || "validate";
	const files = requiredFiles(input.files);
	if (action === "validate") {
		return {
			action,
			...validateCodeWikiOkfBundle({
				files,
				scope: input.scope || "codewiki-kb",
			}),
		};
	}
	if (action === "export") {
		return {
			action,
			...exportCodeWikiOkfBundle({
				files,
				scope: input.scope || "codewiki-kb",
			}),
		};
	}
	if (action === "consume") {
		return {
			action,
			...consumeOkfBundle({ files, scope: input.scope || "okf-bundle" }),
		};
	}
	throw createCodewikiOperationError({
		operation: "wiki_okf",
		code: "unsupported_action",
		message: `Unsupported wiki_okf action ${String(action)}.`,
		field: "action",
	});
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
	const validation = validateOkfBundle(files);
	return {
		okfVersion: validation.version,
		scope,
		files,
		validation,
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

function requiredFiles(value: unknown): OkfBundleFile[] {
	if (!Array.isArray(value)) {
		throw createCodewikiOperationError({
			operation: "wiki_okf",
			code: "missing_required",
			message: "wiki_okf requires a files array.",
			field: "files",
		});
	}
	return value.map((file, index) => {
		if (!isBundleFile(file)) {
			throw createCodewikiOperationError({
				operation: "wiki_okf",
				code: "invalid_input",
				message: `wiki_okf files[${index}] must include string path and content fields.`,
				field: "files",
			});
		}
		return file;
	});
}

function isBundleFile(value: unknown): value is OkfBundleFile {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as OkfBundleFile).path === "string" &&
		typeof (value as OkfBundleFile).content === "string"
	);
}
