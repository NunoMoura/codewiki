import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodewikiResumeContextToolInput } from "../../../state/types.ts";
import { executeCodewikiResumeContextTool } from "../../../state/resume-tool.ts";
import { resolveToolProject } from "../../../project/context.ts";
import { codewikiResumeContextToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";

/** Register the codewiki_resume_context tool. */
export function registerCodewikiResumeContextTool(pi: any) {
	pi.registerTool({
		name: "codewiki_resume_context",
		label: "Codewiki Resume Context",
		description:
			"Build a high-signal CodeWiki resume context packet for a fresh or current session from graph, roadmap, task context, and evidence refs.",
		promptSnippet:
			"Build CodeWiki resume context from source refs instead of relying on chat history, Pi compaction, or VCC recall.",
		promptGuidelines: [
			"Use when context is noisy, stale, token-heavy, or when a fresh session or soft context refresh should start from CodeWiki source truth.",
			"Prefer this over VCC recall or generic chat-history compaction for normal CodeWiki continuation; Pi adapters may inject this packet through CodeWiki-owned compaction.",
			"The tool returns a bounded prompt packet and does not create a new session; Pi uses the same packet for /wiki-resume --new and CodeWiki-owned soft context refresh.",
		],
		parameters: codewikiResumeContextToolInputSchema,
		async execute(_toolCallId: string, params: CodewikiResumeContextToolInput, _signal: any, _onUpdate: any, ctx: ExtensionContext) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_resume_context");
			const result = await executeCodewikiResumeContextTool(project, params, {
				activeLink: currentTaskLink(ctx),
				sessionId: String(ctx.sessionManager?.getSessionId?.() || "resume-context-tool"),
			});
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.result.prompt || result.summary }],
				details: result.result,
			};
		},
	});
}
