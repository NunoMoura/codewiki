import { readFileSync } from "node:fs";

const PROMPT_ASSET_ROOT = new URL("./prompt-assets/", import.meta.url);
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export type PromptTemplateValues = Record<
	string,
	string | number | boolean | null | undefined
>;

export function readPromptAsset(relativePath: string): string {
	const normalized = relativePath.replace(/^\/+/, "");
	const url = new URL(normalized, PROMPT_ASSET_ROOT);
	if (!url.href.startsWith(PROMPT_ASSET_ROOT.href)) {
		throw new Error(
			`CodeWiki prompt asset path escapes package asset boundary: ${relativePath}`,
		);
	}
	return readFileSync(url, "utf8").replace(/\r\n/g, "\n").trimEnd();
}

export function renderPromptAsset(
	relativePath: string,
	values: PromptTemplateValues,
): string {
	return renderPromptTemplate(readPromptAsset(relativePath), values);
}

function renderPromptTemplate(
	template: string,
	values: PromptTemplateValues,
): string {
	return template
		.replace(PLACEHOLDER_PATTERN, (_match, key: string) =>
			String(values[key] ?? ""),
		)
		.trimEnd();
}
