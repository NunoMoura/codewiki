import type { AgencyMode, AgencyToolInput, AgencyTrigger } from "./types.ts";
import type { WikiProject } from "../domain/project/types.ts";
import { planAgency } from "./planning.ts";

export interface CodewikiAgencyToolPorts {
	fileStore: unknown;
	rebuildRunner: unknown;
	sessionStore: unknown;
}

export async function executeCodewikiAgencyTool(
	project: WikiProject,
	input: AgencyToolInput,
	ports: CodewikiAgencyToolPorts,
) {
	const result = await planAgency(project, {
		mode: input.mode ? (input.mode as AgencyMode) : undefined,
		trigger: input.trigger ? (input.trigger as AgencyTrigger) : undefined,
		dryRun: input.dryRun ?? true,
		scope: input.scope,
		budget: input.budget,
	}, ports as any);

	return {
		...result,
		budget: result.budget as unknown as Record<string, unknown>,
		bounded_context: buildThinkCodeContextPlan(result.mode as any, String(result.cycles[0]?.action ?? "report"), project),
	};
}

export function buildThinkCodeContextPlan(
	mode: string,
	action: string,
	project: WikiProject,
): Record<string, unknown> {
	const script = [
		'tc_emit "{\\"kind\\":\\"codewiki-context\\",\\"source\\":\\"think-code\\"}"',
		'tc_context .codewiki/index_graph.json .codewiki/roadmap/queue.json 2>/dev/null || true',
		'tc_grep --json "stale|unmapped|blocked|TASK-" .codewiki/index_graph.json .codewiki/roadmap/queue.json 2>/dev/null || true',
	].join("\n");
	return {
		preferred_executor: "think_code_run",
		availability: "optional",
		mode,
		action,
		goal: "Create compact CodeWiki context or validate graph/view cues without loading raw wiki trees into parent context.",
		think_code: {
			policyPath: "think-code.policy.json",
			script,
			writes: "staged-only; apply requires separate think_code_apply and CodeWiki policy approval",
		},
		fallback: {
			executor: "native-codewiki",
			steps: [
				"read .codewiki/index_graph.json and .codewiki/roadmap/queue.json for graph state and work truth",
				"read linked KB/code paths only when exact source is required",
				"use scripts/codewiki-gateway.mjs pack/tree/manifest for compact reads",
			],
		},
		non_goals: [
			"Do not require ThinkCode for CodeWiki operation.",
			"Do not let ThinkCode mutate generated views directly.",
		],
		root: project.root,
	};
}
