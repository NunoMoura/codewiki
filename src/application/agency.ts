/**
 * application/agency.ts
 *
 * "Run agency planning" use case.
 * Plans the next bounded agency action from roadmap state, graph cues, and trigger.
 */
import type {
	AgencyMode,
	AgencyTrigger,
	AgencyBudget,
	AgencyScope,
} from "../domain/agency/types.ts";
import type { WikiProject } from "../domain/project/types.ts";
import { readCodewikiState } from "./state.ts";
import type { ReadStatePorts } from "./state.ts";
import type { FileStore, RebuildRunner } from "./ports.ts";

// ---------------------------------------------------------------------------
// Port dependencies
// ---------------------------------------------------------------------------

export interface AgencyPorts extends ReadStatePorts {
	fileStore: FileStore;
	rebuildRunner: RebuildRunner;
}

// ---------------------------------------------------------------------------
// Budget presets
// ---------------------------------------------------------------------------

function budgetForMode(mode: AgencyMode, trigger: AgencyTrigger): AgencyBudget {
	switch (mode) {
		case "observe":
			return { maxWrites: 0, maxCycles: 1, maxWallSeconds: 30, maxTokens: 5000, maxCostUsd: 0.1, maxSessions: 1, risk: "low" };
		case "maintain":
			return { maxWrites: 12, maxCycles: 3, maxWallSeconds: 300, maxTokens: 25000, maxCostUsd: 1, maxSessions: 1, risk: "medium" };
		case "work": {
			if (trigger === "roadmap_end") return { maxWrites: 24, maxCycles: 4, maxWallSeconds: 600, maxTokens: 60000, maxCostUsd: 3, maxSessions: 2, risk: "medium" };
			if (trigger === "sprint_end") return { maxWrites: 16, maxCycles: 3, maxWallSeconds: 480, maxTokens: 40000, maxCostUsd: 2, maxSessions: 2, risk: "medium" };
			return { maxWrites: 8, maxCycles: 2, maxWallSeconds: 240, maxTokens: 20000, maxCostUsd: 1, maxSessions: 1, risk: "medium" };
		}
		default:
			return { maxWrites: 12, maxCycles: 3, maxWallSeconds: 300, maxTokens: 25000, maxCostUsd: 1, maxSessions: 1, risk: "medium" };
	}
}

function configuredBudget(project: WikiProject, scope: AgencyScope, base: AgencyBudget): AgencyBudget {
	const budgets = project.config.codewiki?.agency?.budgets || {};
	return {
		...base,
		...((budgets as any).default || {}),
		...((budgets as any)[scope.kind] || {}),
	};
}

function normalizeScope(input: AgencyScope | undefined, project: WikiProject): AgencyScope {
	const configured = project.config.codewiki?.agency?.default_scope;
	const scope = input || configured || { kind: "roadmap" as const };
	if ((scope.kind === "task" || scope.kind === "sprint") && !scope.id) return { kind: "roadmap" };
	return scope;
}

function taskIdsForScope(scope: AgencyScope, roadmap: Record<string, unknown> | undefined): string[] {
	const openTasks = Array.isArray(roadmap?.ordered_open_task_ids) ? roadmap.ordered_open_task_ids.map(String) : [];
	if (scope.kind === "roadmap") return openTasks;
	if (scope.kind === "task") return scope.id && openTasks.includes(scope.id) ? [scope.id] : [];
	const sprint = (Array.isArray((roadmap as any)?.sprints) ? (roadmap as any).sprints : []).find((item: any) => String(item.id) === scope.id);
	return Array.isArray(sprint?.open_task_ids)
		? sprint.open_task_ids.map(String).filter((taskId: string) => openTasks.includes(taskId))
		: [];
}

function scopeSummary(scope: AgencyScope): string {
	return scope.kind === "roadmap" ? "roadmap" : `${scope.kind}:${scope.id}`;
}

function resolveModeAndTrigger(
	inputMode?: AgencyMode,
	inputTrigger?: AgencyTrigger,
): { mode: AgencyMode; trigger: AgencyTrigger } {
	const trigger = inputTrigger ?? "manual";
	if (inputMode) return { mode: inputMode, trigger };
	switch (trigger) {
		case "task_end":
			return { mode: "work", trigger };
		case "sprint_end":
			return { mode: "work", trigger };
		case "roadmap_end":
			return { mode: "maintain", trigger };
		case "budget_end":
			return { mode: "observe", trigger };
		default:
			return { mode: "observe", trigger };
	}
}

// ---------------------------------------------------------------------------
// Plan next agency action
// ---------------------------------------------------------------------------

export async function planAgency(
	project: WikiProject,
	opts: {
		mode?: AgencyMode;
		trigger?: AgencyTrigger;
		dryRun: boolean;
		scope?: AgencyScope;
		budget?: Partial<AgencyBudget>;
	},
	ports: AgencyPorts,
): Promise<{
	summary: string;
	mode: AgencyMode;
	trigger: AgencyTrigger;
	budget: AgencyBudget;
	cycles: Array<Record<string, unknown>>;
	stop: Record<string, unknown>;
	policy: Record<string, unknown>;
	bounded_context: Record<string, unknown>;
}> {
	const resolved = resolveModeAndTrigger(opts.mode, opts.trigger);
	const mode = resolved.mode;
	const trigger = resolved.trigger;
	const scope = normalizeScope(opts.scope, project);
	const base = configuredBudget(project, scope, budgetForMode(mode, trigger));
	const budget: AgencyBudget = opts.budget ? { ...base, ...opts.budget } : base;
	const dryRun = opts.dryRun ?? true;

	const state = await readCodewikiState(project, {
		include: ["summary", "roadmap", "drift", "session", "graph"],
		refresh: mode !== "observe" && (budget.maxWrites ?? 0) > 0 && !dryRun,
		taskId: undefined,
	}, ports);

	const health = state.health as Record<string, unknown> | undefined;
	const summaryState = state.summary as Record<string, unknown> | undefined;
	const roadmap = state.roadmap as Record<string, unknown> | undefined;
	const openTasks = taskIdsForScope(scope, roadmap);
	const nextTask: string | null = openTasks[0] ?? null;
	const graph = state.graph as Record<string, any> | undefined;
	const gc = graph?.gc || {};
	const parallelism = project.config.codewiki?.agency?.parallelism || {};
	const maxSessions = Math.max(1, Number(budget.maxSessions ?? parallelism.max_sessions ?? 1));
	const claims = graph?.claims || {};
	const canSpawnSessions = scope.kind === "sprint"
		&& Boolean(parallelism.session_per_sprint)
		&& maxSessions > 1
		&& Number(claims.conflict_count || 0) === 0;

	const needsViewRefresh = Boolean(
		((health?.total_issues as number | undefined) ?? 0) ||
		((summaryState?.unmapped_spec_count as number | undefined) ?? 0),
	);

	// Build trigger-aware action plan
	const cycles: Array<Record<string, unknown>> = [];
	const stop: Record<string, unknown> = { condition: "", reason: "", completed: false };

	if (mode === "observe") {
		cycles.push({
			cycle: 1,
			action: "report",
			summary: trigger === "budget_end"
				? "Budget exhausted. Reporting current state for handoff."
				: `Reporting CodeWiki state (trigger: ${trigger}, scope: ${scopeSummary(scope)}).`,
			scope,
			next_task: nextTask,
			open_tasks: openTasks,
			gc_hot_counts: gc?.classes?.hot ? Object.fromEntries(Object.entries(gc.classes.hot).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])) : {},
		});
		stop.condition = "Observation complete.";
		stop.reason = "Observe mode — no writes permitted.";
	} else if (mode === "maintain") {
		if (needsViewRefresh) {
			cycles.push({
				cycle: 1,
				action: "refresh_views",
				summary: "Graph/views stale or lint issues present. Rebuild needed.",
			});
		} else if (trigger === "roadmap_end") {
			cycles.push({
				cycle: 1,
				action: "audit_roadmap",
				summary: `Roadmap-end trigger: audit scoped open tasks for relevance (${scopeSummary(scope)}).`,
				scope,
				open_tasks: openTasks,
			});
		} else {
			cycles.push({
				cycle: 1,
				action: "audit_graph",
				summary: `Running scoped graph/validation audit (${scopeSummary(scope)}).`,
				scope,
				gc_policy: gc?.policy || {},
			});
		}
		stop.condition = "Maintenance complete.";
		stop.reason = "Maintain mode budget reached.";
	} else {
		// work mode
		if (!nextTask) {
			cycles.push({
				cycle: 1,
				action: "report",
				summary: trigger === "task_end"
					? `No open tasks remaining in ${scopeSummary(scope)}.`
					: `No open tasks in ${scopeSummary(scope)}. Nothing to plan.`,
				scope,
			});
			stop.condition = "No open tasks.";
			stop.reason = "Roadmap empty.";
			stop.completed = true;
		} else {
			cycles.push({
				cycle: 1,
				action: trigger === "sprint_end" ? "sprint_review" : "task_advance",
				summary: trigger === "sprint_end"
					? `Sprint-end trigger: review ${scopeSummary(scope)}, checkpoint, and close hot artifacts. Next: ${nextTask}.`
					: `Next task in ${scopeSummary(scope)}: ${nextTask}. Load roadmap item, linked builds, and specs; execute implementation loop.`,
				scope,
				next_task: nextTask,
				open_tasks: openTasks,
				recommended_next_loop: trigger === "sprint_end" ? "decision" : "implementation",
				session_spawn_plan: canSpawnSessions ? {
					mode: "plan-only",
					max_sessions: maxSessions,
					reason: "Config enables session_per_sprint and active claims report no conflicts.",
					task_ids: openTasks.slice(0, maxSessions),
					require_claims: parallelism.require_claims !== false,
				} : {
					mode: "disabled",
					reason: scope.kind !== "sprint" ? "Scope is not sprint." : maxSessions <= 1 ? "Budget allows only one session." : "Claims conflict or config disabled session_per_sprint.",
				},
			});
			stop.condition = "Work cycle planned.";
			stop.reason = dryRun ? "Dry-run — no execution." : "Ready for execution.";
			stop.next_task = nextTask;
		}
	}

	return {
		summary: `Agency [${trigger}]: ${mode} mode, scope ${scopeSummary(scope)}. ${cycles[0]?.summary ?? "No action."}`,
		mode,
		trigger,
		budget,
		cycles,
		stop,
		policy: {
			risk: budget.risk ?? "low",
			allowWrites: (budget.maxWrites ?? 0) > 0 && !dryRun,
			maxWrites: budget.maxWrites ?? 0,
			maxCycles: budget.maxCycles ?? 1,
			maxTokens: budget.maxTokens ?? 0,
			maxCostUsd: budget.maxCostUsd ?? 0,
			maxSessions,
			scope,
			trigger,
		},
		bounded_context: {
			token_budget: budget.maxTokens ?? 0,
			cost_budget_usd: budget.maxCostUsd ?? 0,
			mode,
			trigger,
			scope,
			next_task: nextTask,
			open_tasks: openTasks,
			action: cycles[0]?.action ?? "none",
		},
	};
}