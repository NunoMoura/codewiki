import type { CodewikiRenderComponent } from "../types.ts";
import { truncateToWidth } from "./width.ts";

export const CODEWIKI_COMMAND_MESSAGE_TYPE = "codewiki.command";
const DASHBOARD_CTA_PREFIX = "▸ Click to open CodeWiki dashboard: ";

export function renderCodewikiCommandMessage(
	message: unknown,
	_options: unknown,
	theme: unknown,
): CodewikiRenderComponent {
	const details = record(record(message).details);
	const lines = arrayOfStrings(details.lines);
	const outputLines =
		lines.length > 0 ? lines : textContent(record(message).content).split("\n");
	return linesComponent(outputLines, theme);
}

function linesComponent(
	lines: string[],
	theme: unknown,
): CodewikiRenderComponent {
	return {
		render: (width: number) =>
			lines.map((line) => truncateToWidth(colorText(theme, line), width)),
		invalidate: () => undefined,
	};
}

function colorText(theme: unknown, text: string): string {
	const fg = record(theme).fg;
	if (typeof fg !== "function") return text;
	try {
		if (text.startsWith(DASHBOARD_CTA_PREFIX)) {
			const url = text.slice(DASHBOARD_CTA_PREFIX.length);
			return `${String(fg("text", DASHBOARD_CTA_PREFIX))}${String(
				fg("accent", url),
			)}`;
		}
		return String(fg("text", text));
	} catch {
		return text;
	}
}

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => record(item))
		.filter((item) => item.type === "text")
		.map((item) => (typeof item.text === "string" ? item.text : ""))
		.join("\n");
}

function arrayOfStrings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}
