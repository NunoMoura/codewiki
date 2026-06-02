import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { executeCodewikiRuntimeTool } from "../../../api/tools.ts";
import { resolveToolProject } from "../../../project/context.ts";
import { stableAgentName } from "../../../state/builders.ts";
import { codewikiRuntimeToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";
import { piAgencyPorts, piSessionToolPorts } from "./ports.ts";
import { codewikiToolMetadata } from "./surface.ts";

function artifactStatusText(result: any): string | undefined {
	for (const operation of result.operations || []) {
		if (operation.primitive !== "wiki_artifact_status") continue;
		const statusText = operation.result?.statusText;
		if (statusText) return String(statusText);
	}
	return undefined;
}

export function registerCodewikiRuntimeTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "wiki_runtime",
		label: "CodeWiki Runtime",
		description:
			"Normal CodeWiki runtime workflow tool for session focus, leases, wait/wake, context boundaries, agency scheduling, and lifecycle/archive coordination.",
		promptSnippet:
			"Use wiki_runtime for session focus, leases, wait/wake, context boundaries, agency scheduling, and lifecycle/archive coordination.",
		promptGuidelines: [
			"Use this as the normal runtime tool for session focus, artifact leases, waiting/waking, bounded agency scheduling, and post-commit archive/GC coordination.",
			"Runtime state is coordination evidence, not roadmap truth; use wiki_plan or wiki_implement for durable roadmap/build evidence.",
			"Use action='mark'/'wait'/'release' for artifact status, action='focus'/'note'/'clear' for session focus, agency input for bounded scheduling, and gc input for archive coordination.",
			"Do not call low-level wiki_session, wiki_artifact_status, wiki_agency, or wiki_gc for normal runtime work unless expert compatibility behavior is explicitly required.",
		],
		parameters: codewikiRuntimeToolInputSchema,
		...codewikiToolMetadata("wiki_runtime"),
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
				"wiki_runtime",
			);
			const sessionId =
				String(
					ctx.sessionManager?.getSessionId?.() || "session-unknown",
				).trim() || "session-unknown";
			const result = await executeCodewikiRuntimeTool(project, params, {
				session: piSessionToolPorts(pi, ctx),
				artifactStatus: { sessionId, agentName: stableAgentName(sessionId) },
				agency: piAgencyPorts(ctx),
			});
			const statusText = artifactStatusText(result);
			if (statusText) ctx.ui.setStatus?.("codewiki-artifacts", statusText);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);
}
