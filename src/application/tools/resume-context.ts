import type { WikiProject } from "../../project/types.ts";
import type { TaskSessionLinkRecord } from "../../session/types.ts";
import type { CodewikiResumeContextToolInput } from "../../domain/state/types.ts";
import { buildCodewikiResumeContext } from "../resume-context.ts";

export interface CodewikiResumeContextToolPorts {
	activeLink?: TaskSessionLinkRecord | null;
	sessionId?: string | null;
}

export async function executeCodewikiResumeContextTool(
	project: WikiProject,
	input: CodewikiResumeContextToolInput,
	ports: CodewikiResumeContextToolPorts = {},
) {
	const result = await buildCodewikiResumeContext(project, {
		requestedTaskId: input.taskId,
		followUpIntent: input.followUpIntent,
		activeLink: ports.activeLink ?? null,
		sessionId: ports.sessionId ?? "resume-context-tool",
		refresh: input.refresh ?? true,
	});
	return {
		summary: formatCodewikiResumeContextSummary(result),
		result,
	};
}

export function formatCodewikiResumeContextSummary(result: Awaited<ReturnType<typeof buildCodewikiResumeContext>>): string {
	if (!result.task) {
		return `${result.project_label}: no artifact-available roadmap task for CodeWiki resume context. ${result.evidence}`;
	}
	return [
		`Codewiki Resume Context: ${result.project_label}`,
		`Task: ${result.task.id} — ${result.task.title}`,
		`Selection: ${result.selection.source}`,
		`Preflight: ${result.preflight.color} (${result.preflight.errors} errors, ${result.preflight.warnings} warnings)`,
		`Context: ${result.context_path ?? "fallback prompt context"}`,
	].join("\n");
}
