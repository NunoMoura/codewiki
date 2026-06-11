import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { executeCodewikiImplementTool } from "../../../api/tools.ts";
import { resolveToolProject } from "../../../project/context.ts";
import { codewikiImplementToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";
import { piTaskPorts } from "./ports.ts";
import { codewikiToolMetadata } from "./surface.ts";

export function registerCodewikiImplementTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "wiki_implement",
		label: "CodeWiki Implement",
		description:
			"Normal CodeWiki implementation workflow tool for task-scoped evidence and implementation-build creation.",
		promptSnippet:
			"Use wiki_implement to record TDD/code evidence and create implementation_build artifacts.",
		promptGuidelines: [
			"Use normal file/code edit tools for source changes; wiki_implement records task-scoped evidence after or around those edits.",
			"Record test design, code-change evidence, checks_run, acceptance_mapping, and closure_brief in implementation_build data.",
			"Use roadmap evidence for builder progress, but do not close tasks from builder context when fresh validation is required.",
			"Do not call low-level wiki_roadmap or wiki_build for normal implementation evidence unless expert compatibility behavior is explicitly required.",
		],
		parameters: codewikiImplementToolInputSchema,
		...codewikiToolMetadata("wiki_implement"),
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
				"wiki_implement",
			);
			const result = await executeCodewikiImplementTool(project, params, {
				roadmap: piTaskPorts(),
			});
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);
}
