import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodewikiStateToolInput } from "../../../state/types.ts";
import { executeCodewikiStateTool } from "../../../api/tools.ts";
import { resolveToolProject } from "../../../project/context.ts";
import { codewikiStateToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";
import { piStatePorts } from "./ports.ts";

/** Register the wiki_state tool. */
export function registerCodewikiStateTool(pi: any) {
	pi.registerTool({
		name: "wiki_state",
		label: "Codewiki State",
		description:
			"Read graph-first codewiki state, optionally rebuild derived files, and return a structured repo/task/session snapshot",
		promptSnippet:
			"Inspect graph-first codewiki state through one structured read entrypoint",
		promptGuidelines: [
			"Use this as primary agent read tool for repo resolution, health, roadmap summary, focused session, and next-step guidance.",
			"Set refresh=true when derived graph/state files may be stale or missing.",
		],
		parameters: codewikiStateToolInputSchema,
		async execute(_toolCallId: string, params: CodewikiStateToolInput, _signal: any, _onUpdate: any, ctx: ExtensionContext) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "wiki_state");
			const result = await executeCodewikiStateTool(project, params, piStatePorts(ctx));
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result.result,
			};
		},
	});
}
