import type { CodewikiExtensionApi } from "../types.ts";

export const codewikiPromptHooksAvailable = true as const;
export const CODEWIKI_PROMPT_MARKER = "<!-- codewiki-prompt-v1 -->";

export const CODEWIKI_PROMPT_GUIDELINES = [
	"CodeWiki OS truth: .codewiki/kb/** is design truth; .codewiki/traces/TRACE-*.jsonl is workflow/state truth; generated views and renderers are disposable.",
	"Use internal wiki_state for trace-backed context, then wiki_decide, wiki_plan, or wiki_implement for semantic loop work; do not shell out to the transitional source CLI.",
	"There are exactly three semantic loops: decision, planning, and implementation. Runtime is backend/host coordination only, not a fourth loop or normal agent tool.",
	"User-facing progress is pipeline-first: eligible Pi TUI sessions open the Work Pipeline dashboard automatically; /wiki-dashboard reopens or stops it, and legacy grouped /codewiki namespaces are not public UX.",
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
