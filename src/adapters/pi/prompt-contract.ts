import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { maybeLoadProject } from "../../project/context.ts";
import type { WikiProject } from "../../project/types.ts";

export const CODEWIKI_SYSTEM_CONTRACT_MARKER = "## CodeWiki system contract";

export function buildCodewikiSystemPromptContract(
	project?: WikiProject | null,
): string {
	const projectLabel = project?.label ? ` for ${project.label}` : "";
	return `${CODEWIKI_SYSTEM_CONTRACT_MARKER}${projectLabel}

This repository has an active CodeWiki contract. Apply these invariants before semantic work:
- Normal agent workflow tools are wiki_state, wiki_decide, wiki_plan, wiki_implement, wiki_gate, and wiki_runtime.
- Use wiki_state for repo status, roadmap focus, graph health, and next action when CodeWiki state may affect the task.
- Treat .codewiki/kb/** as canonical knowledge, .codewiki/roadmap/queue.json as canonical roadmap truth, and source/tests/Git proof as implementation truth.
- Do not hand-edit generated views such as .codewiki/index_graph.json or .codewiki/roadmap/tasks/**; rebuild them through CodeWiki tools.
- Treat .codewiki/session/** and .codewiki/runtime/** as operational coordination state, not durable product truth.
- Route semantic changes through decision -> planning -> implementation -> validation evidence; use focused CodeWiki skills for loop details when needed.
- Use wiki_runtime before non-trivial overlapping edits for leases/wait-wake/session focus and release claims when done.
- Use wiki_state, /wiki resume, or CodeWiki source refs instead of chat-history archaeology for continuation; low-level wiki_* primitives are compatibility/expert aliases, not the normal surface.
- Keep detailed loop policy in the CodeWiki skills; this prompt is only the small always-on contract.`;
}

export function appendCodewikiSystemPromptContract(
	systemPrompt: string,
	project?: WikiProject | null,
): string {
	if (systemPrompt.includes(CODEWIKI_SYSTEM_CONTRACT_MARKER))
		return systemPrompt;
	return `${systemPrompt}\n\n${buildCodewikiSystemPromptContract(project)}`;
}

export function installCodewikiPromptContract(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event: any, ctx: any) => {
		const cwd =
			event?.systemPromptOptions?.cwd ||
			ctx?.cwd ||
			ctx?.workspaceRoot ||
			process.cwd();
		const project = await maybeLoadProject({
			cwd,
			workspaceRoot: ctx?.workspaceRoot,
			ui: ctx?.ui,
		});
		if (!project) return undefined;
		return {
			systemPrompt: appendCodewikiSystemPromptContract(
				String(event?.systemPrompt || ""),
				project,
			),
		};
	});
}
