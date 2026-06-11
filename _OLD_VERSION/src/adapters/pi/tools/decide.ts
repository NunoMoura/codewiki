import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { executeCodewikiDecideTool } from "../../../api/tools.ts";
import { resolveToolProject } from "../../../project/context.ts";
import { codewikiDecideToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";
import { codewikiToolMetadata } from "./surface.ts";

export function registerCodewikiDecideTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "wiki_decide",
		label: "CodeWiki Decide",
		description:
			"Normal CodeWiki decision workflow tool for decision rows, approvals, KB mappings, and decision-build creation.",
		promptSnippet:
			"Use wiki_decide for decision rows, approvals, KB mappings, and decision_build creation.",
		promptGuidelines: [
			"Use this as the normal decision-loop tool after user intent or semantic requirements need approval.",
			"Use row_actions to approve/reject/defer/edit pending decision-table rows, then create a decision_build with row_to_kb_mappings and propagation evidence.",
			"Do not call low-level wiki_decision_table or wiki_build for normal decision work unless expert compatibility behavior is explicitly required.",
		],
		parameters: codewikiDecideToolInputSchema,
		...codewikiToolMetadata("wiki_decide"),
		async execute(
			_toolCallId: string,
			params: any,
			_signal: unknown,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"wiki_decide",
			);
			const result = await executeCodewikiDecideTool(project, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);
}
