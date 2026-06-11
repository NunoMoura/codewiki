import type { AgencyMode, AgencyToolInput, AgencyTrigger } from "./types.ts";
import type { WikiProject } from "../project/types.ts";
import { planAgency } from "./planning.ts";
import type { RuntimeSessionBoundaryPort } from "../runtime/ports.ts";
import { runCodewikiRuntimeStep } from "../runtime/runner.ts";

export interface CodewikiAgencyToolPorts {
	fileStore: unknown;
	rebuildRunner: unknown;
	sessionStore: unknown;
	sessionBoundary?: RuntimeSessionBoundaryPort;
}

export async function executeCodewikiAgencyTool(
	project: WikiProject,
	input: AgencyToolInput,
	ports: CodewikiAgencyToolPorts,
) {
	const dryRun = input.dryRun ?? true;
	const result = await planAgency(
		project,
		{
			mode: input.mode ? (input.mode as AgencyMode) : undefined,
			trigger: input.trigger ? (input.trigger as AgencyTrigger) : undefined,
			dryRun,
			scope: input.scope,
			budget: input.budget,
		},
		ports as any,
	);

	const runtime =
		dryRun || result.mode !== "work"
			? {
					executed: false,
					status: "skipped",
					action: dryRun ? "dry_run" : "mode_skip",
					summary: dryRun
						? "CodeWiki runtime skipped because dryRun is enabled."
						: "CodeWiki runtime only executes in work mode.",
					scopes: [],
					budget_used: {
						cycles: 0,
						writes: 0,
						sessions: 0,
						wall_seconds: 0,
						tokens_estimate: 0,
					},
					workflow_efficiency: {
						user_interruptions_avoided: 0,
						user_interruptions_required: 0,
						manual_commands_avoided: 0,
						manual_commands_required: 0,
						session_boundaries_used: 0,
						platform_limited_steps: [],
						notes: [],
					},
					events: [],
				}
			: await runCodewikiRuntimeStep(project, result, ports as any);

	return {
		...result,
		budget: result.budget as unknown as Record<string, unknown>,
		agency_bounded_context: result.bounded_context,
		runtime,
		bounded_context: buildThinkCodeContextPlan(
			result.mode as any,
			String(result.cycles[0]?.action ?? "report"),
			project,
		),
	};
}

export function buildThinkCodeContextPlan(
	mode: string,
	action: string,
	project: WikiProject,
): Record<string, unknown> {
	const script = [
		'tc_emit "{\\"kind\\":\\"codewiki-context\\",\\"source\\":\\"think-code\\"}"',
		"tc_context .codewiki/index_graph.json .codewiki/roadmap/queue.json 2>/dev/null || true",
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
			writes:
				"staged-only; apply requires separate think_code_apply and CodeWiki policy approval",
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
