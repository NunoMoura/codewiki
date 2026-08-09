import type { CodewikiExtensionApi } from "../types.ts";

export const codewikiPromptHooksAvailable = true as const;
export const CODEWIKI_PROMPT_MARKER = "<!-- codewiki-prompt-v1 -->";

export const CODEWIKI_PROMPT_GUIDELINES = [
	".codewiki/kb/** owns design; one JSONL Change Trace owns each Change; source/tests/Git own implementation proof; WorkState/views are disposable. Frontend Changes read .codewiki/kb/product/DESIGN.md and declare Knowledge/UI refs.",
	"Use internal wiki_state and obey runtimeReaction. wiki_attention reads; only explicit user /wiki-select command starts Decision. Never select from caller state or shell.",
	"Exactly three semantic loops exist: Decision approves Change revisions, Planning creates Sprints and owned Work Items across approved Changes, and Implementation accepts realization. Runtime is their supervised outer loop, not a fourth semantic loop or agent mega-tool.",
	"Eligible Pi TUI sessions open the Work Pipeline dashboard automatically; /wiki-dashboard reopens or stops it. Legacy grouped /codewiki namespaces are not public UX.",
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
