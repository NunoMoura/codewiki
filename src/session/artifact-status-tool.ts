import type { WikiProject } from "../project/types.ts";
import type { CodewikiArtifactStatusToolInput } from "./types.ts";
import { mutateArtifactStatuses } from "./claims.ts";
import { runRebuild } from "../state/artifacts.ts";

export interface CodewikiArtifactStatusToolContext {
	sessionId: string;
	agentName: string;
}

export async function executeCodewikiArtifactStatusTool(
	project: WikiProject,
	input: CodewikiArtifactStatusToolInput,
	context: CodewikiArtifactStatusToolContext,
) {
	const result = await mutateArtifactStatuses(project, input, context);
	if ((input.refresh ?? true) && result.changed) await runRebuild(project);
	return {
		...result,
		summary: result.artifact_summary,
		statusText: summarizeArtifactStatusForUi(result.artifact_statuses.length, result.waiters?.length || 0, (result.waiters || []).filter((waiter) => waiter.status === "ready").length, result.conflicts.filter((conflict) => conflict.kind === "conflict").length, result.conflicts.filter((conflict) => conflict.kind === "warning").length),
	};
}

export function summarizeArtifactStatusForUi(
	artifactCount: number,
	waiterCount: number,
	readyWaiters: number,
	conflictCount: number,
	warningCount: number,
): string | undefined {
	return artifactCount > 0 || waiterCount > 0
		? `${artifactCount} artifact status(es), ${waiterCount} wait(s), ${readyWaiters} ready, ${conflictCount} conflict(s), ${warningCount} warning(s)`
		: undefined;
}
