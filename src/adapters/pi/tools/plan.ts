import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { executeCodewikiPlanTool } from "../../../api/tools.ts";
import { resolveToolProject } from "../../../project/context.ts";
import { codewikiPlanToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";
import { piTaskPorts } from "./ports.ts";
import { codewikiToolMetadata } from "./surface.ts";

export function registerCodewikiPlanTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "wiki_plan",
		label: "CodeWiki Plan",
		description:
			"Normal CodeWiki planning workflow tool for roadmap/sprint alignment and planning-build creation.",
		promptSnippet:
			"Use wiki_plan for roadmap/sprint alignment and planning_build creation.",
		promptGuidelines: [
			"Use this as the normal planning-loop tool after an accepted decision_build needs executable roadmap work.",
			"Create or update tasks, update sprint metadata, and write planning_build evidence through this wrapper.",
			"Do not create umbrella tasks; use sprint metadata for related executable cohorts.",
			"Do not call low-level wiki_roadmap or wiki_build for normal planning work unless expert compatibility behavior is explicitly required.",
		],
		parameters: codewikiPlanToolInputSchema,
		...codewikiToolMetadata("wiki_plan"),
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
				"wiki_plan",
			);
			const result = await executeCodewikiPlanTool(project, params, {
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
