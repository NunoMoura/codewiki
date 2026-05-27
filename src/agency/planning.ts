/**
 * agency/planning.ts
 *
 * "Run agency planning" use case.
 * Plans the next bounded agency action from roadmap state, graph cues, and trigger.
 */
import {
	agencyLevelAllowsContinuation,
	effectiveAgencyPolicy,
	type AgencyMode,
	type AgencyTrigger,
	type AgencyBudget,
	type AgencyScope,
	type EffectiveAgencyPolicy,
} from "./types.ts";
import type { WikiProject } from "../project/types.ts";
import { readCodewikiState } from "../state/reader.ts";
import type { ReadStatePorts } from "../state/reader.ts";
import type { FileStore, RebuildRunner } from "../application/ports.ts";

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
			return {
				maxWrites: 0,
				maxCycles: 1,
				maxWallSeconds: 30,
				maxTokens: 5000,
				maxCostUsd: 0.1,
				maxSessions: 1,
				risk: "low",
			};
		case "maintain":
			return {
				maxWrites: 12,
				maxCycles: 3,
				maxWallSeconds: 300,
				maxTokens: 25000,
				maxCostUsd: 1,
				maxSessions: 1,
				risk: "medium",
			};
		case "work": {
			if (trigger === "roadmap_end")
				return {
					maxWrites: 24,
					maxCycles: 4,
					maxWallSeconds: 600,
					maxTokens: 60000,
					maxCostUsd: 3,
					maxSessions: 2,
					risk: "medium",
				};
			if (trigger === "sprint_end")
				return {
					maxWrites: 16,
					maxCycles: 3,
					maxWallSeconds: 480,
					maxTokens: 40000,
					maxCostUsd: 2,
					maxSessions: 2,
					risk: "medium",
				};
			return {
				maxWrites: 8,
				maxCycles: 2,
				maxWallSeconds: 240,
				maxTokens: 20000,
				maxCostUsd: 1,
				maxSessions: 1,
				risk: "medium",
			};
		}
		default:
			return {
				maxWrites: 12,
				maxCycles: 3,
				maxWallSeconds: 300,
				maxTokens: 25000,
				maxCostUsd: 1,
				maxSessions: 1,
				risk: "medium",
			};
	}
}

function configuredBudget(
	project: WikiProject,
	scope: AgencyScope,
	base: AgencyBudget,
): AgencyBudget {
	const budgets = project.config.codewiki?.agency?.budgets || {};
	return {
		...base,
		...((budgets as any).default || {}),
		...((budgets as any)[scope.kind] || {}),
	};
}

function normalizeScope(
	input: AgencyScope | undefined,
	project: WikiProject,
): AgencyScope {
	const configured = effectiveAgencyPolicy(project.config).default_scope;
	const scope = input || configured || { kind: "roadmap" as const };
	if ((scope.kind === "task" || scope.kind === "sprint") && !scope.id)
		return { kind: "roadmap" };
	return scope;
}

function taskIdsForScope(
	scope: AgencyScope,
	roadmap: Record<string, unknown> | undefined,
): string[] {
	const openTasks = Array.isArray(roadmap?.ordered_open_task_ids)
		? roadmap.ordered_open_task_ids.map(String)
		: [];
	if (scope.kind === "roadmap") return openTasks;
	if (scope.kind === "task")
		return scope.id && openTasks.includes(scope.id) ? [scope.id] : [];
	const sprint = (
		Array.isArray((roadmap as any)?.sprints) ? (roadmap as any).sprints : []
	).find((item: any) => String(item.id) === scope.id);
	return Array.isArray(sprint?.open_task_ids)
		? sprint.open_task_ids
				.map(String)
				.filter((taskId: string) => openTasks.includes(taskId))
		: [];
}

function scopeSummary(scope: AgencyScope): string {
	return scope.kind === "roadmap" ? "roadmap" : `${scope.kind}:${scope.id}`;
}

function approvalBoundaryForTrigger(
	trigger: AgencyTrigger,
): "task" | "sprint" | "roadmap" | null {
	if (trigger === "task_end") return "sprint";
	if (trigger === "sprint_end") return "roadmap";
	if (trigger === "roadmap_end" || trigger === "budget_end") return "roadmap";
	return null;
}

function agencyContinuationAllowed(
	policy: EffectiveAgencyPolicy,
	trigger: AgencyTrigger,
): boolean {
	const boundary = approvalBoundaryForTrigger(trigger);
	if (!boundary) return true;
	if (trigger === "roadmap_end" || trigger === "budget_end") return false;
	return agencyLevelAllowsContinuation(policy.level, boundary);
}

export function agencyHardStopReasons(input: {
	policy: EffectiveAgencyPolicy;
	trigger: AgencyTrigger;
	health: Record<string, unknown> | undefined;
	claims: Record<string, unknown>;
	nextStep: Record<string, unknown> | undefined;
	budget: AgencyBudget;
}): string[] {
	const reasons: string[] = [];
	if (!agencyContinuationAllowed(input.policy, input.trigger)) {
		reasons.push(
			`approval cadence boundary reached for agency level ${input.policy.level}`,
		);
	}
	if (
		hasStopGate(input.policy, "artifact_conflict") &&
		Number(input.claims.conflict_count || 0) > 0
	) {
		reasons.push("artifact conflict gate active");
	}
	if (
		hasStopGate(input.policy, "validation_block") &&
		Number(input.health?.errors || 0) > 0
	) {
		reasons.push("validation/blocking health gate active");
	}
	if (
		hasStopGate(input.policy, "semantic_decision") &&
		nextActionMatches(input.nextStep, [/\bdecision\b/i, /semantic/i])
	) {
		reasons.push("semantic decision gate active");
	}
	if (
		hasStopGate(input.policy, "risk_escalation") &&
		String(input.budget.risk || "medium") === "high" &&
		input.policy.level === "roadmap"
	) {
		reasons.push("risk escalation gate active");
	}
	if (
		hasStopGate(input.policy, "publication") &&
		nextActionMatches(input.nextStep, [
			/\bpublication\b/i,
			/\bpublish\b/i,
			/\brelease\b/i,
			/\bpush\b/i,
			/\bremote\b/i,
		])
	) {
		reasons.push("publication gate active");
	}
	if (
		hasStopGate(input.policy, "destructive_action") &&
		nextActionMatches(input.nextStep, [
			/\bdestructive\b/i,
			/\bdelete\b/i,
			/\bpurge\b/i,
			/\bdrop\b/i,
			/\bdestroy\b/i,
		])
	) {
		reasons.push("destructive action gate active");
	}
	if (
		hasStopGate(input.policy, "unsafe_reset_boundary") &&
		nextActionMatches(input.nextStep, [
			/unsafe[_ -]?reset/i,
			/reset boundary/i,
			/pending messages/i,
			/adapter cannot/i,
			/source-backed kickoff/i,
			/auto-pickup skipped/i,
		])
	) {
		reasons.push("unsafe reset boundary gate active");
	}
	return reasons;
}

function hasStopGate(policy: EffectiveAgencyPolicy, gate: string): boolean {
	return policy.stop_gates.includes(gate);
}

function nextActionMatches(
	nextStep: Record<string, unknown> | undefined,
	patterns: RegExp[],
): boolean {
	if (!nextStep) return false;
	const haystack = [
		nextStep.kind,
		nextStep.reason,
		nextStep.command,
		nextStep.item_id,
	]
		.map((value) => String(value || ""))
		.join("\n");
	return patterns.some((pattern) => pattern.test(haystack));
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

	const state = await readCodewikiState(
		project,
		{
			include: ["summary", "roadmap", "drift", "session", "graph"],
			refresh: mode !== "observe" && (budget.maxWrites ?? 0) > 0 && !dryRun,
			taskId: undefined,
		},
		ports,
	);

	const health = state.health as Record<string, unknown> | undefined;
	const summaryState = state.summary as Record<string, unknown> | undefined;
	const roadmap = state.roadmap as Record<string, unknown> | undefined;
	const openTasks = taskIdsForScope(scope, roadmap);
	const nextTask: string | null = openTasks[0] ?? null;
	const graph = state.graph as Record<string, any> | undefined;
	const nextAction = state.next_action as Record<string, unknown> | undefined;
	const agencyPolicy = effectiveAgencyPolicy(project.config);
	const gc = graph?.gc || {};
	const parallelism = project.config.codewiki?.agency?.parallelism || {};
	const maxSessions = Math.max(
		1,
		Number(budget.maxSessions ?? parallelism.max_sessions ?? 1),
	);
	const claims = graph?.claims || {};
	const hardStops = agencyHardStopReasons({
		policy: agencyPolicy,
		trigger,
		health,
		claims,
		nextStep: nextAction,
		budget,
	});
	const canSpawnSessions =
		scope.kind === "sprint" &&
		Boolean(parallelism.session_per_sprint) &&
		maxSessions > 1 &&
		Number(claims.conflict_count || 0) === 0;

	const needsViewRefresh = Boolean(
		((health?.total_issues as number | undefined) ?? 0) ||
			((summaryState?.unmapped_spec_count as number | undefined) ?? 0),
	);

	// Build trigger-aware action plan
	const cycles: Array<Record<string, unknown>> = [];
	const stop: Record<string, unknown> = {
		condition: "",
		reason: "",
		completed: false,
	};

	if (mode === "observe") {
		cycles.push({
			cycle: 1,
			action: "report",
			summary:
				trigger === "budget_end"
					? "Budget exhausted. Reporting current state for handoff."
					: `Reporting CodeWiki state (trigger: ${trigger}, scope: ${scopeSummary(scope)}).`,
			scope,
			next_task: nextTask,
			open_tasks: openTasks,
			gc_hot_counts: gc?.classes?.hot
				? Object.fromEntries(
						Object.entries(gc.classes.hot).map(([key, value]) => [
							key,
							Array.isArray(value) ? value.length : 0,
						]),
					)
				: {},
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
		if (hardStops.length > 0) {
			cycles.push({
				cycle: 1,
				action: "stop",
				summary: `Agency stop gate reached (${hardStops.join("; ")}).`,
				scope,
				next_task: nextTask,
				open_tasks: openTasks,
				hard_stop_reasons: hardStops,
			});
			stop.condition = "Hard stop gate reached.";
			stop.reason = hardStops.join("; ");
			stop.completed = false;
		} else if (!nextTask) {
			cycles.push({
				cycle: 1,
				action: "report",
				summary:
					trigger === "task_end"
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
				summary:
					trigger === "sprint_end"
						? `Sprint-end trigger: review ${scopeSummary(scope)}, checkpoint, and close hot artifacts. Next: ${nextTask}.`
						: `Next task in ${scopeSummary(scope)}: ${nextTask}. Load roadmap item, linked builds, and specs; execute implementation loop.`,
				scope,
				next_task: nextTask,
				open_tasks: openTasks,
				recommended_next_loop:
					trigger === "sprint_end" ? "decision" : "implementation",
				session_spawn_plan: canSpawnSessions
					? {
							mode: "plan-only",
							max_sessions: maxSessions,
							reason:
								"Config enables session_per_sprint and active claims report no conflicts.",
							task_ids: openTasks.slice(0, maxSessions),
							require_claims: parallelism.require_claims !== false,
						}
					: {
							mode: "disabled",
							reason:
								scope.kind !== "sprint"
									? "Scope is not sprint."
									: maxSessions <= 1
										? "Budget allows only one session."
										: "Claims conflict or config disabled session_per_sprint.",
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
			allowWrites:
				(budget.maxWrites ?? 0) > 0 && !dryRun && hardStops.length === 0,
			maxWrites: budget.maxWrites ?? 0,
			maxCycles: budget.maxCycles ?? 1,
			maxTokens: budget.maxTokens ?? 0,
			maxCostUsd: budget.maxCostUsd ?? 0,
			maxSessions,
			scope,
			trigger,
			agency_level: agencyPolicy.level,
			approval_cadence: agencyPolicy.approval_cadence,
			continuation_allowed: hardStops.length === 0,
			hard_stop_gates: agencyPolicy.stop_gates,
			hard_stop_reasons: hardStops,
			context_reset: agencyPolicy.context_reset,
		},
		bounded_context: {
			token_budget: budget.maxTokens ?? 0,
			cost_budget_usd: budget.maxCostUsd ?? 0,
			mode,
			trigger,
			scope,
			agency_level: agencyPolicy.level,
			approval_cadence: agencyPolicy.approval_cadence,
			context_reset_auto_pickup:
				agencyPolicy.context_reset.enabled &&
				agencyPolicy.context_reset.auto_pickup,
			next_task: nextTask,
			open_tasks: openTasks,
			action: cycles[0]?.action ?? "none",
		},
	};
}
