/**
 * application/state.ts
 *
 * "Read CodeWiki state" use case.
 * Accepts ports instead of Pi ExtensionContext so any agent harness can call it.
 */
import type { WikiProject } from "../domain/project/types.ts";
import type { RoadmapTaskRecord } from "../domain/roadmap/types.ts";
import type { TaskSessionLinkRecord } from "../domain/session/types.ts";
import type {
	CodewikiStateSection,
	RoadmapStateFile,
	StatusStateFile,
	RoadmapTaskContextPacket,
	RoadmapStateTaskSummary,
} from "../domain/state/types.ts";
import { loadCodewikiStateArtifacts, roadmapApiTaskState, maybeReadTaskContext } from "./state-artifacts.ts";
import { readRoadmapTask } from "./roadmap.ts";
import { findLatestTaskSessionLink } from "../domain/shared/session.ts";
import type { FileStore, RebuildRunner, SessionStore } from "./ports.ts";

// ---------------------------------------------------------------------------
// Section include normalization (was inline in Pi adapter)
// ---------------------------------------------------------------------------

export function buildCodewikiStateInclude(
	include: string[] | undefined,
	taskId: string | undefined,
): CodewikiStateSection[] {
	const base = include?.length ? include : ["repo", "health", "summary"];
	const sections = new Set(base);
	if (taskId) sections.add("task");
	return Array.from(sections) as CodewikiStateSection[];
}

// ---------------------------------------------------------------------------
// Next-action recommendation
// ---------------------------------------------------------------------------

function isOpenRoadmapTaskStatus(status: string | undefined): boolean {
	return status === "todo" || status === "in_progress" || status === "blocked";
}

function activeOpenTaskLink(
	activeLink: TaskSessionLinkRecord | null,
	roadmapState: RoadmapStateFile | null,
): TaskSessionLinkRecord | null {
	if (!activeLink || activeLink.action === "clear") return null;
	const task = roadmapState?.tasks?.[activeLink.taskId];
	return task && isOpenRoadmapTaskStatus(task.status) ? activeLink : null;
}

export function buildCodewikiNextAction(
	statusState: StatusStateFile | null,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): {
	kind: string;
	taskId: string | null;
	reason: string;
	command?: string;
	item_id?: string;
} {
	const openActiveLink = activeOpenTaskLink(activeLink, roadmapState);
	if (openActiveLink) {
		return {
			kind: "resume",
			taskId: openActiveLink.taskId,
			reason: "Active task focus detected in session.",
		};
	}
	const persistedResumeTaskId = String(
		statusState?.resume?.task_id || statusState?.roadmap?.focused_task_id || "",
	).trim();
	if (persistedResumeTaskId && isOpenRoadmapTaskStatus(roadmapState?.tasks?.[persistedResumeTaskId]?.status)) {
		return {
			kind: "resume",
			taskId: persistedResumeTaskId,
			reason: "Persisted task focus detected in CodeWiki state.",
		};
	}
	const statusNextStep = statusState?.next_step as any;
	if (statusNextStep && String(statusNextStep.kind || "").startsWith("reconciliation:")) {
		return {
			kind: String(statusNextStep.kind),
			taskId: null,
			reason: String(statusNextStep.reason || "Graph reconciliation selected next loop."),
			command: String(statusNextStep.command || ""),
			item_id: statusNextStep.item_id,
		};
	}
	const nextTaskId = roadmapState?.views.open_task_ids?.[0];
	if (nextTaskId) {
		return {
			kind: "next_task",
			taskId: nextTaskId,
			reason: "Roadmap has open tasks.",
		};
	}
	if ((statusState?.summary.untracked_specs ?? 0) > 0) {
		return {
			kind: "wiki_drift",
			taskId: null,
			reason: "Wiki drift exists without an open roadmap task.",
		};
	}
	return {
		kind: "none",
		taskId: null,
		reason: "No open roadmap task or urgent wiki drift signal detected.",
	};
}

// ---------------------------------------------------------------------------
// Task detail enrichment
// ---------------------------------------------------------------------------

export function buildCodewikiTaskDetail(
	task: RoadmapTaskRecord,
	runtimeTask: RoadmapStateTaskSummary | null,
	contextPacket: RoadmapTaskContextPacket | null,
): Record<string, unknown> {
	const apiState = roadmapApiTaskState(task, runtimeTask);
	const evidence = runtimeTask?.loop?.evidence ?? null;
	const contextPath =
		runtimeTask?.context_path ?? `.codewiki/roadmap/tasks/${task.id}/context.json`;
	const enrichedContextPacket = {
		version: contextPacket?.version ?? 1,
		generated_at: contextPacket?.generated_at ?? task.updated,
		context_path: contextPacket?.context_path ?? contextPath,
		...(contextPacket ?? {}),
		task: {
			id: task.id,
			title: task.title,
			status: apiState.status,
			priority: task.priority,
			kind: task.kind,
			change_type: task.change_type,
			summary: task.summary,
			labels: task.labels,
			goal: task.goal,
			delta: task.delta,
			...(contextPacket?.task ?? {}),
		},
	};
	return {
		id: task.id,
		title: task.title,
		status: apiState.status,
		priority: task.priority,
		kind: task.kind,
		change_type: task.change_type,
		summary: task.summary,
		labels: task.labels,
		spec_paths: task.spec_paths,
		code_paths: task.code_paths,
		research_ids: task.research_ids,
		goal: task.goal,
		delta: task.delta,
		context_path: contextPath,
		context_packet: enrichedContextPacket,
		latest_evidence: evidence
			? { result: evidence.verdict, summary: evidence.summary }
			: null,
		updated: task.updated,
	};
}

// ---------------------------------------------------------------------------
// Port dependencies for the read-state use case
// ---------------------------------------------------------------------------

export interface ReadStatePorts {
	fileStore: FileStore;
	rebuildRunner: RebuildRunner;
	sessionStore: SessionStore;
}

// ---------------------------------------------------------------------------
// Main use case: read CodeWiki state
// ---------------------------------------------------------------------------

export async function readCodewikiState(
	project: WikiProject,
	opts: {
		include: string[] | undefined;
		taskId: string | undefined;
		refresh: boolean;
	},
	ports: ReadStatePorts,
): Promise<Record<string, unknown>> {
	const include = buildCodewikiStateInclude(opts.include, opts.taskId);
	const artifacts = await loadCodewikiStateArtifacts(project, opts.refresh);
	const activeLink = findLatestTaskSessionLink(ports.sessionStore.getSessionBranch());
	const health = artifacts.statusState?.health ?? {
		color: (artifacts.report?.issues.length ?? 0) > 0 ? "yellow" : "green",
		errors: 0,
		warnings: artifacts.report?.issues.length ?? 0,
		total_issues: artifacts.report?.issues.length ?? 0,
	};
	const activeTaskLink = activeOpenTaskLink(activeLink, artifacts.roadmapState);
	const nextAction = buildCodewikiNextAction(
		artifacts.statusState,
		artifacts.roadmapState,
		activeTaskLink,
	);

	const result: Record<string, unknown> = {
		repo: {
			repo_root: project.root,
			wiki_root: project.docsRoot,
			resolved_from: project.root,
			contract_version: String(
				artifacts.graph?.version ?? artifacts.statusState?.version ?? 0,
			),
			refresh_performed: artifacts.refreshPerformed,
		},
		health,
		summary: {
			open_task_count: artifacts.statusState?.summary.open_task_count ?? 0,
			active_task_ids: artifacts.roadmapState?.views.in_progress_task_ids ?? [],
			blocked_task_ids: artifacts.roadmapState?.views.blocked_task_ids ?? [],
			active_sprint_ids: (artifacts.roadmapState?.views as any)?.active_sprint_ids ?? [],
			next_task_id: nextAction.taskId ?? null,
			unmapped_spec_count: artifacts.statusState?.summary.unmapped_specs ?? 0,
		},
		next_action: nextAction,
	};

	if (include.includes("roadmap")) {
		result.roadmap = {
			ordered_open_task_ids: artifacts.roadmapState?.views.open_task_ids ?? [],
			active_task_ids: artifacts.roadmapState?.views.in_progress_task_ids ?? [],
			blocked_task_ids: artifacts.roadmapState?.views.blocked_task_ids ?? [],
			recent_task_ids: artifacts.roadmapState?.views.recent_task_ids ?? [],
			sprint_ids: (artifacts.roadmapState?.views as any)?.sprint_ids ?? [],
			active_sprint_ids: (artifacts.roadmapState?.views as any)?.active_sprint_ids ?? [],
			sprints: (artifacts.roadmapState?.views as any)?.sprints ?? [],
		};
	}

	if (include.includes("graph")) {
		const graph = artifacts.graph;
		const reconciliation = (graph?.views as any)?.reconciliation || null;
		const gc = (graph?.views as any)?.gc || null;
		const defaultLens = (graph?.views as any)?.lenses?.default || null;
		const hotNodeIds = new Set<string>((gc?.classes?.hot?.task_ids ?? []).map((id: string) => `task:${id}`));
		for (const path of gc?.classes?.hot?.build_paths ?? []) hotNodeIds.add(`build:${path}`);
		for (const path of gc?.classes?.hot?.validation_paths ?? []) hotNodeIds.add(`validation:${path}`);
		for (const id of gc?.classes?.hot?.claim_ids ?? []) hotNodeIds.add(`claim:${id}`);
		result.graph = {
			generated_at: graph?.generated_at ?? null,
			node_count: defaultLens?.families?.length ?? hotNodeIds.size,
			edge_count: defaultLens?.families ? Math.max(0, defaultLens.families.length - 1) : (graph?.edges.filter((edge) => hotNodeIds.has(edge.from) || hotNodeIds.has(edge.to)).length ?? 0),
			doc_count: graph?.nodes.filter((n) => n.kind === "doc" && n.default_hidden !== true).length ?? 0,
			code_path_count: graph?.nodes.filter((n) => n.kind === "code_path" && n.default_hidden !== true).length ?? 0,
			source: defaultLens ? "graph:default-lens" : "graph:hot-default",
			families: defaultLens?.families ?? null,
			badges: defaultLens?.badges ?? null,
			next_action: defaultLens?.next_action ?? null,
			expands_to: defaultLens?.expands_to ?? null,
			claims: (graph?.views as any)?.claims ?? null,
			scope_views: (graph?.views as any)?.scope_views ?? null,
			workflow_cursor: (graph?.views as any)?.workflow_cursor ?? null,
			gc: gc ? {
				policy: gc.policy,
				classes: {
					hot: gc.classes?.hot ?? {},
				},
			} : null,
			reconciliation: reconciliation
				? {
						controller: reconciliation.controller,
						item_count: Array.isArray(reconciliation.items) ? reconciliation.items.length : 0,
						counts_by_loop: reconciliation.counts_by_loop || {},
						next_action: reconciliation.next_action || null,
						layer_states: reconciliation.layer_states || {},
					}
				: null,
		};
	}

	if (include.includes("trace")) {
		result.trace = {
			source: "graph:trace-lens",
			...(artifacts.graph?.views as any)?.lenses?.trace,
		};
	}

	if (include.includes("audit")) {
		result.audit = {
			source: "graph:audit-lens",
			...(artifacts.graph?.views as any)?.lenses?.audit,
		};
	}

	if (include.includes("archive")) {
		const graph = artifacts.graph;
		result.archive = {
			source: "graph:explicit-archive",
			...(graph?.views as any)?.archive,
			gc: {
				cold: (graph?.views as any)?.gc?.classes?.cold ?? {},
				purgeable: (graph?.views as any)?.gc?.classes?.purgeable ?? {},
			},
		};
	}

	if (include.includes("drift")) {
		result.drift = {
			tracked_spec_count: artifacts.statusState?.summary.tracked_specs ?? 0,
			untracked_spec_count: artifacts.statusState?.summary.untracked_specs ?? 0,
			blocked_spec_count: artifacts.statusState?.summary.blocked_specs ?? 0,
			high_risk_spec_paths: artifacts.statusState?.views.top_risky_spec_paths ?? [],
		};
	}

	if (include.includes("session")) {
		result.session = {
			focused_task_id: activeTaskLink?.taskId ?? null,
			updated_at: activeTaskLink?.timestamp ?? null,
			summary: activeTaskLink?.summary || null,
			workflow_cursor: activeTaskLink?.cursor ?? (artifacts.statusState as any)?.workflow_cursor ?? (artifacts.graph?.views as any)?.workflow_cursor ?? null,
			claims: artifacts.statusState?.parallel
				? {
						active_claim_count: artifacts.statusState.parallel.active_claim_count ?? 0,
						warning_count: artifacts.statusState.parallel.claim_warning_count ?? 0,
						conflict_count: artifacts.statusState.parallel.claim_conflict_count ?? 0,
						pending_waiter_count: artifacts.statusState.parallel.claim_pending_wait_count ?? 0,
						ready_waiter_count: artifacts.statusState.parallel.claim_ready_wait_count ?? 0,
						artifact_statuses: artifacts.statusState.parallel.artifact_statuses ?? [],
					}
				: null,
		};
	}

	if (include.includes("claims")) {
		const claimView = (artifacts.graph?.views as any)?.claims;
		result.claims = claimView ?? {
			active_claim_count: artifacts.statusState?.parallel.active_claim_count ?? 0,
			warning_count: artifacts.statusState?.parallel.claim_warning_count ?? 0,
			conflict_count: artifacts.statusState?.parallel.claim_conflict_count ?? 0,
			pending_waiter_count: artifacts.statusState?.parallel.claim_pending_wait_count ?? 0,
			ready_waiter_count: artifacts.statusState?.parallel.claim_ready_wait_count ?? 0,
			claims: artifacts.statusState?.parallel.claims ?? [],
			waiters: artifacts.statusState?.parallel.claim_waiters ?? [],
			conflicts: artifacts.statusState?.parallel.claim_conflicts ?? [],
			artifact_statuses: artifacts.statusState?.parallel.artifact_statuses ?? [],
		};
	}

	if (include.includes("task")) {
		if (!opts.taskId) {
			result.task = null;
		} else {
			const task = await readRoadmapTask(project, opts.taskId);
			if (!task) throw new Error(`Roadmap task not found: ${opts.taskId}`);
			const runtimeTask = artifacts.roadmapState?.tasks?.[task.id] ?? null;
			const contextPacket = await maybeReadTaskContext(project, task.id, runtimeTask);
			result.task = buildCodewikiTaskDetail(task, runtimeTask, contextPacket);
		}
	}

	return result;
}