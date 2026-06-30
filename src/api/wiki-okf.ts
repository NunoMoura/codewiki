import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import {
	consumeOkfBundle,
	exportCodeWikiOkfBundle,
	validateCodeWikiOkfBundle,
	type OkfCompatibilityResult,
	type OkfCompatibilityScope,
} from "../knowledge/okf-export.ts";
import type { OkfBundleFile } from "../knowledge/okf-validation.ts";

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
	throw createCodewikiApiError({
		operation: "wiki_okf",
		code: "unsupported_action",
		message: `Unsupported wiki_okf action ${String(action)}.`,
		field: "action",
	});
}

function requiredFiles(value: unknown): OkfBundleFile[] {
	if (!Array.isArray(value)) {
		throw createCodewikiApiError({
			operation: "wiki_okf",
			code: "missing_required",
			message: "wiki_okf requires a files array.",
			field: "files",
		});
	}
	return value.map((file, index) => {
		if (!isBundleFile(file)) {
			throw createCodewikiApiError({
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
