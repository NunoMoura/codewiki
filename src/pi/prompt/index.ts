import type { CodewikiExtensionApi } from "../types.ts";

export const codewikiPromptHooksAvailable = true as const;
export const CODEWIKI_PROMPT_MARKER = "<!-- codewiki-prompt-v1 -->";

export const CODEWIKI_PROMPT_GUIDELINES = [
	"Use registered wiki_* tools for CodeWiki work when they are available; do not shell out to the transitional source CLI for normal agent workflow.",
	"Use /wiki for user-facing commands; there is no public /codewiki namespace.",
	"Treat .codewiki/kb/** as design truth and .codewiki/traces/TRACE-*.jsonl as workflow/state truth.",
	"Keep exactly three semantic loops: decision, planning, and implementation. Runtime is outer coordination only.",
	'Prefer focused state reads such as wiki_state { view: "board" } or /wiki state --board when full state is unnecessary.',
	"Renderer output is UI-only; never treat rendered tables as hidden workflow truth.",
] as const;

export function renderCodewikiPromptInstructions(): string {
	return [
		CODEWIKI_PROMPT_MARKER,
		"## CodeWiki Pi guidance",
		"",
		...CODEWIKI_PROMPT_GUIDELINES.map((guideline) => `- ${guideline}`),
	].join("\n");
}

export function registerCodewikiPromptHooks(pi: CodewikiExtensionApi): void {
	if (typeof pi.on !== "function") return;
	pi.on("before_agent_start", (event: Record<string, unknown>) => {
		const systemPrompt = stringValue(event.systemPrompt);
		const instructions = renderCodewikiPromptInstructions();
		if (systemPrompt.includes(CODEWIKI_PROMPT_MARKER)) return {};
		return {
			systemPrompt: systemPrompt
				? `${systemPrompt}\n\n${instructions}`
				: instructions,
		};
	});
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}
