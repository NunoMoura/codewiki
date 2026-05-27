import { readFileSync } from "node:fs";

const SKILL_ASSET_ROOT = new URL("../../skills/codewiki/", import.meta.url);
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export type SkillTemplateValues = Record<string, string | number | boolean | null | undefined>;

export function readSkillAsset(relativePath: string): string {
	const normalized = relativePath.replace(/^\/+/, "");
	const url = new URL(normalized, SKILL_ASSET_ROOT);
	if (!url.href.startsWith(SKILL_ASSET_ROOT.href)) {
		throw new Error(`Skill asset path escapes CodeWiki skill boundary: ${relativePath}`);
	}
	return readFileSync(url, "utf8").replace(/\r\n/g, "\n").trimEnd();
}

export function renderSkillAsset(
	relativePath: string,
	values: SkillTemplateValues,
): string {
	return renderSkillTemplate(readSkillAsset(relativePath), values);
}

export function renderSkillTemplate(
	template: string,
	values: SkillTemplateValues,
): string {
	return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) =>
		String(values[key] ?? ""),
	).trimEnd();
}
