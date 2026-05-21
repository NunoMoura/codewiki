import type { WikiProject } from "../../domain/project/types.ts";
import type { CodewikiStateToolInput } from "../../domain/state/types.ts";
import { readCodewikiState } from "../state.ts";

export interface CodewikiStateToolPorts {
	fileStore: unknown;
	rebuildRunner: unknown;
	sessionStore: unknown;
}

export async function executeCodewikiStateTool(
	project: WikiProject,
	input: CodewikiStateToolInput,
	ports: CodewikiStateToolPorts,
) {
	const result = await readCodewikiState(project, {
		include: input.include,
		taskId: input.taskId,
		refresh: input.refresh ?? false,
	}, ports as any);
	return {
		summary: formatCodewikiStateSummary(project, result),
		result,
	};
}

export function formatCodewikiStateSummary(
	project: WikiProject,
	result: any,
): string {
	const repo = result.repo;
	const summary = result.summary;
	const health = result.health;
	const session = result.session;
	const nextAction = result.next_action;

	const parts = [
		`Codewiki State: ${project.label} [${repo.contract_version}]`,
		`Health: ${health.color} (${health.errors} errors, ${health.warnings} warnings)`,
		`Roadmap: open ${summary.open_task_count}; next ${nextAction.taskId ?? "none"}; unmapped ${summary.unmapped_spec_count}`,
	];

	if (session?.focused_task_id) {
		parts.push(`Session: focusing on ${session.focused_task_id}`);
	}
	const claims = result.claims || result.graph?.claims || session?.claims;
	if (claims) {
		parts.push(`Artifacts: in-use ${claims.active_claim_count ?? 0}; warnings ${claims.warning_count ?? 0}; conflicts ${claims.conflict_count ?? 0}`);
	}

	parts.push(`Next Action [${nextAction.kind}]: ${nextAction.reason}`);
	if (nextAction.taskId) parts.push(`Suggested task: ${nextAction.taskId}`);

	return parts.join("\n");
}
