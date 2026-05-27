import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../project/types.ts";
import type { CodewikiArtifactStatusToolInput } from "../../../session/types.ts";
import { executeCodewikiArtifactStatusTool } from "../../../session/artifact-status-tool.ts";
import { stableAgentName } from "../../../application/state-builders.ts";
import { resolveToolProject } from "../../../project/context.ts";
import { codewikiArtifactStatusToolInputSchema } from "../schemas.ts";
import { currentTaskLink } from "../session.ts";
import { refreshStatusDock } from "../ui/manager.ts";

export async function executeCodewikiArtifactStatus(
	_pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext,
	input: CodewikiArtifactStatusToolInput,
) {
	const sessionId = String(ctx.sessionManager?.getSessionId?.() || "session-unknown").trim() || "session-unknown";
	const result = await executeCodewikiArtifactStatusTool(project, input, { sessionId, agentName: stableAgentName(sessionId) });
	ctx.ui.setStatus?.("codewiki-artifacts", result.statusText);
	return result;
}

export function registerCodewikiArtifactStatusTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "codewiki_artifact_status",
		label: "Codewiki Artifact Status",
		description:
			"Inspect or update runtime artifact status for parallel CodeWiki work through the session queue.",
		promptSnippet:
			"Use artifact status to see or mark tasks, paths, builds, and validation refs as available, in-use, waiting, or conflicted.",
		promptGuidelines: [
			"Use this before non-trivial semantic changes when another session may touch overlapping docs, roadmap items, builds, validation reports, or code paths.",
			"Artifact status is runtime coordination evidence, not durable roadmap truth; roadmap tasks, builds, validation, and code remain canonical truth.",
			"Use action=mark to record current session use, wait to queue behind unavailable artifacts, list to inspect holders/waiters, heartbeat to extend, and release when done.",
		],
		parameters: codewikiArtifactStatusToolInputSchema,
		async execute(_toolCallId: string, params: CodewikiArtifactStatusToolInput, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) {
			const project = await resolveToolProject(ctx.cwd, params.repoPath, "codewiki_artifact_status");
			const result = await executeCodewikiArtifactStatus(pi, project, ctx, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.artifact_summary }],
				details: result,
			};
		},
	} as any);
}
