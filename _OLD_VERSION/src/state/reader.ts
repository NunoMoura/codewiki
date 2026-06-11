/**
 * state/reader.ts
 *
 * "Read CodeWiki state" use case.
 * Accepts ports instead of Pi ExtensionContext so any agent harness can call it.
 */
import type { WikiProject } from "../project/types.ts";
import type { RoadmapTaskRecord } from "../roadmap/types.ts";
import type { TaskSessionLinkRecord } from "../session/types.ts";
import { CODEWIKI_STATE_LENS_VALUES } from "./types.ts";
import type {
	CodewikiStateLensFocus,
	CodewikiStateLensId,
	CodewikiStateSection,
	GraphFile,
	RoadmapStateFile,
	StatusStateFile,
	RoadmapTaskContextPacket,
	RoadmapStateTaskSummary,
} from "./types.ts";
import {
	loadCodewikiStateArtifacts,
	roadmapApiTaskState,
	maybeReadTaskContext,
} from "./artifacts.ts";
import { readRoadmapTask } from "../roadmap/store.ts";
import { findLatestTaskSessionLink } from "../session/links.ts";
import type {
	FileStore,
	RebuildRunner,
	SessionStore,
} from "../shared/ports.ts";
import { unique } from "../shared/utils.ts";

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

function recordOrNull(value: unknown): Record<string, unknown> | null {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function recordField(
	record: Record<string, unknown> | null | undefined,
	key: string,
): Record<string, unknown> | null {
	return recordOrNull(record?.[key]);
}

function arrayField(
	record: Record<string, unknown> | null | undefined,
	key: string,
): unknown[] | null {
	const value = record?.[key];
	return Array.isArray(value) ? value : null;
}

function stringArrayField(
	record: Record<string, unknown> | null | undefined,
	key: string,
): string[] {
	return (arrayField(record, key) ?? [])
		.map((value) => String(value || "").trim())
		.filter(Boolean);
}

function normalizeStateLensId(value: unknown): CodewikiStateLensId | null {
	const raw = String(value || "").trim();
	if (!raw) return null;
	const normalized = raw.toLowerCase().replace(/_/g, "-");
	const aliases: Record<string, CodewikiStateLensId> = {
		default: "status",
		roadmap: "task",
		tasks: "task",
		sprints: "sprint",
		gate: "validation",
		proof: "validation",
		claims: "runtime",
		automation: "automation-readiness",
	};
	const candidate = aliases[normalized] || normalized;
	if (CODEWIKI_STATE_LENS_VALUES.includes(candidate as CodewikiStateLensId)) {
		return candidate as CodewikiStateLensId;
	}
	throw new Error(`Unknown CodeWiki state lens: ${raw}`);
}

function selectedStateLens(opts: {
	view?: unknown;
	lens?: unknown;
}): CodewikiStateLensId | null {
	const view = normalizeStateLensId(opts.view);
	const lens = normalizeStateLensId(opts.lens);
	if (view && lens && view !== lens) {
		throw new Error(`Conflicting CodeWiki state view/lens: ${view} vs ${lens}`);
	}
	return lens || view;
}

function stringList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => String(item || "").trim()).filter(Boolean);
	}
	const single = String(value || "").trim();
	return single ? [single] : [];
}

function normalizeLensFocus(opts: {
	taskId?: string;
	focus?: CodewikiStateLensFocus;
	ref?: string;
	refs?: string[];
	include?: string[] | undefined;
}): CodewikiStateLensFocus {
	const focus = recordOrNull(opts.focus) || {};
	const refs = unique([
		...stringList(opts.ref),
		...stringList(opts.refs),
		...stringList(focus.ref),
		...stringList(focus.refs),
		...stringList(focus.path),
		...stringList(focus.paths),
	]);
	return {
		...focus,
		taskId:
			String(opts.taskId || focus.taskId || focus.task_id || "").trim() ||
			undefined,
		sprintId:
			String(focus.sprintId || focus.sprint_id || "").trim() ||
			refs.find((ref) => /^SPRINT-/.test(ref)) ||
			undefined,
		refs,
		include: opts.include || [],
	};
}

function taskIdFromFocus(
	focus: CodewikiStateLensFocus,
	fallback: string | null,
): string | null {
	return (
		String(focus.taskId || focus.task_id || "").trim() ||
		stringList(focus.refs).find((ref) => /^TASK-/.test(ref)) ||
		fallback ||
		null
	);
}

function sprintIdFromFocus(focus: CodewikiStateLensFocus): string | null {
	return (
		String(focus.sprintId || focus.sprint_id || "").trim() ||
		stringList(focus.refs).find((ref) => /^SPRINT-/.test(ref)) ||
		null
	);
}

function relGraphPath(project: WikiProject): string {
	return project.graphPath.replace(`${project.root}/`, "");
}

function recordMatchesRefs(record: unknown, refs: string[]): boolean {
	if (refs.length === 0) return true;
	const text = JSON.stringify(record);
	return refs.some((ref) => text.includes(ref));
}

function compactRecordsByRefs(
	records: unknown[],
	refs: string[],
	limit: number,
): { rows: unknown[]; omitted: number } {
	const filtered = records.filter((record) => recordMatchesRefs(record, refs));
	return {
		rows: filtered.slice(0, limit),
		omitted: Math.max(0, filtered.length - limit),
	};
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
	if (
		persistedResumeTaskId &&
		isOpenRoadmapTaskStatus(
			roadmapState?.tasks?.[persistedResumeTaskId]?.status,
		)
	) {
		return {
			kind: "resume",
			taskId: persistedResumeTaskId,
			reason: "Persisted task focus detected in CodeWiki state.",
		};
	}
	const statusNextStep = statusState?.next_step;
	if (
		statusNextStep &&
		String(statusNextStep.kind || "").startsWith("reconciliation:")
	) {
		return {
			kind: String(statusNextStep.kind),
			taskId: null,
			reason: String(
				statusNextStep.reason || "Graph reconciliation selected next loop.",
			),
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
		runtimeTask?.context_path ??
		`.codewiki/roadmap/tasks/${task.id}/context.json`;
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

type LoadedCodewikiStateArtifacts = Awaited<
	ReturnType<typeof loadCodewikiStateArtifacts>
>;

function graphLens(
	graph: GraphFile | null,
	lensId: CodewikiStateLensId,
): Record<string, unknown> {
	const lenses = recordOrNull(graph?.views?.lenses);
	const lens = recordOrNull(lenses?.[lensId]);
	return lens || {};
}

function graphLensData(lens: Record<string, unknown>): Record<string, unknown> {
	return recordField(lens, "data") || {};
}

function latestValidationSignal(graph: GraphFile | null): unknown {
	const lens = graphLens(graph, "validation");
	const data = graphLensData(lens);
	return (arrayField(data, "validation_reports") || [])[0] || null;
}

function stateNextSafeAction(nextAction: {
	kind: string;
	taskId: string | null;
	reason: string;
	command?: string;
	item_id?: string;
}): Record<string, unknown> {
	return {
		kind: nextAction.kind,
		task_id: nextAction.taskId,
		reason: nextAction.reason,
		command: nextAction.command || null,
		item_id: nextAction.item_id || null,
	};
}

function buildStateLensBlockers(
	artifacts: LoadedCodewikiStateArtifacts,
	health: RoadmapStateFile["health"],
	baseLens: Record<string, unknown>,
): Record<string, unknown>[] {
	const blockers: Record<string, unknown>[] = [];
	if (health.errors > 0) {
		blockers.push({
			kind: "health_errors",
			count: health.errors,
			summary: "Generated state reports health errors.",
		});
	}
	const blockedTaskIds = artifacts.roadmapState?.views.blocked_task_ids || [];
	if (blockedTaskIds.length > 0) {
		blockers.push({
			kind: "blocked_tasks",
			count: blockedTaskIds.length,
			refs: blockedTaskIds.slice(0, 8),
		});
	}
	const graphClaims = recordOrNull(artifacts.graph?.views?.claims);
	const conflictCount = Number(
		graphClaims?.conflict_count ||
			artifacts.statusState?.parallel.claim_conflict_count ||
			0,
	);
	if (conflictCount > 0) {
		blockers.push({
			kind: "runtime_coordination_conflict",
			count: conflictCount,
			summary: "Artifact-status conflicts exist.",
		});
	}
	for (const blocker of arrayField(baseLens, "blockers") || []) {
		const record = recordOrNull(blocker);
		if (record) blockers.push(record);
	}
	return blockers;
}

function focusedLensSourceRefs(
	project: WikiProject,
	artifacts: LoadedCodewikiStateArtifacts,
	baseLens: Record<string, unknown>,
	focus: CodewikiStateLensFocus,
): string[] {
	return unique([
		project.roadmapPath,
		project.statusStatePath,
		relGraphPath(project),
		...stringArrayField(baseLens, "source_refs"),
		...stringList(focus.refs),
		...(artifacts.statusState?.resume?.task_id
			? [
					`.codewiki/roadmap/tasks/${artifacts.statusState.resume.task_id}/context.json`,
				]
			: []),
	]);
}

function stateLensFreshness(
	artifacts: LoadedCodewikiStateArtifacts,
	sourceRefs: string[],
): Record<string, unknown> {
	return {
		status: artifacts.graph ? "fresh" : "missing",
		generated_at:
			artifacts.graph?.generated_at ||
			artifacts.statusState?.generated_at ||
			null,
		basis: "generated_graph_and_canonical_source_refs",
		refresh_performed: artifacts.refreshPerformed,
		source_ref_count: sourceRefs.length,
		stale_when:
			"canonical roadmap, knowledge, build, validation, session, code, or test refs change without rebuild",
	};
}

function stateLensExpansionHints(
	lensId: CodewikiStateLensId,
	sourceRefs: string[],
): Record<string, unknown>[] {
	return [
		{
			kind: "source_refs",
			summary: "Read these canonical refs before changing semantic state.",
			refs: sourceRefs.slice(0, 10),
			omitted_ref_count: Math.max(0, sourceRefs.length - 10),
		},
		{
			kind: "lens_expansion",
			lens: lensId,
			summary:
				"Use focus.taskId, focus.sprintId, ref, refs, or include filters for a narrower follow-up read.",
		},
	];
}

function statusLensData(
	artifacts: LoadedCodewikiStateArtifacts,
	health: RoadmapStateFile["health"],
	baseData: Record<string, unknown>,
): Record<string, unknown> {
	return {
		...baseData,
		health,
		summary: artifacts.statusState?.summary || null,
		roadmap: artifacts.statusState?.roadmap || null,
		active_focus: artifacts.statusState?.resume || null,
		latest_validation: latestValidationSignal(artifacts.graph),
	};
}

async function taskLensData(
	project: WikiProject,
	artifacts: LoadedCodewikiStateArtifacts,
	focus: CodewikiStateLensFocus,
	nextTaskId: string | null,
	baseData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const taskId = taskIdFromFocus(focus, nextTaskId);
	let taskDetail: Record<string, unknown> | null = null;
	if (taskId) {
		const task = await readRoadmapTask(project, taskId);
		if (task) {
			const runtimeTask = artifacts.roadmapState?.tasks?.[task.id] ?? null;
			const contextPacket = await maybeReadTaskContext(
				project,
				task.id,
				runtimeTask,
			);
			taskDetail = buildCodewikiTaskDetail(task, runtimeTask, contextPacket);
		}
	}
	return {
		...baseData,
		focus_task_id: taskId,
		task: taskDetail,
	};
}

function sprintLensData(
	artifacts: LoadedCodewikiStateArtifacts,
	focus: CodewikiStateLensFocus,
	baseData: Record<string, unknown>,
): Record<string, unknown> {
	const sprintId = sprintIdFromFocus(focus);
	const generatedSprints = (arrayField(baseData, "sprints") || [])
		.map(recordOrNull)
		.filter((sprint): sprint is Record<string, unknown> => Boolean(sprint));
	const sprints = artifacts.roadmapState?.views.sprints?.length
		? artifacts.roadmapState.views.sprints
		: generatedSprints;
	const sprint = sprintId
		? sprints.find((candidate) => String(candidate.id || "") === sprintId) ||
			null
		: null;
	const taskIds = sprint
		? stringList((sprint as Record<string, unknown>).task_ids)
		: [];
	const generatedTaskData = graphLensData(graphLens(artifacts.graph, "task"));
	const generatedTasks = (arrayField(generatedTaskData, "tasks") || [])
		.map(recordOrNull)
		.filter((task): task is Record<string, unknown> => Boolean(task));
	const tasks: unknown[] = [];
	for (const taskId of taskIds) {
		const task = artifacts.roadmapState?.tasks?.[taskId];
		if (task) {
			tasks.push(task);
			continue;
		}
		const generatedTask = generatedTasks.find(
			(candidate) => String(candidate.id || "") === taskId,
		);
		if (generatedTask) tasks.push(generatedTask);
	}
	return {
		...baseData,
		focus_sprint_id: sprintId,
		sprint,
		tasks,
	};
}

function traceLensData(
	baseLens: Record<string, unknown>,
	focus: CodewikiStateLensFocus,
): Record<string, unknown> {
	const refs = stringList(focus.refs);
	const requirementRows = compactRecordsByRefs(
		arrayField(baseLens, "requirement_rows") || [],
		refs,
		8,
	);
	const buildRefs = compactRecordsByRefs(
		arrayField(baseLens, "build_refs") || [],
		refs,
		8,
	);
	return {
		requirement_rows: requirementRows.rows,
		build_refs: buildRefs.rows,
		semantic_change_gaps: (
			arrayField(baseLens, "semantic_change_gaps") || []
		).slice(0, 8),
		canonical_source_refs: stringArrayField(
			baseLens,
			"canonical_source_refs",
		).slice(0, 16),
		omitted_counts: {
			requirement_rows: requirementRows.omitted,
			build_refs: buildRefs.omitted,
		},
	};
}

function validationLensData(
	artifacts: LoadedCodewikiStateArtifacts,
	baseData: Record<string, unknown>,
): Record<string, unknown> {
	return {
		...baseData,
		graph_validation: artifacts.graph?.views?.validation || null,
		recent_reports: arrayField(baseData, "validation_reports") || [],
	};
}

function runtimeLensData(
	artifacts: LoadedCodewikiStateArtifacts,
	baseData: Record<string, unknown>,
): Record<string, unknown> {
	const parallel = artifacts.statusState?.parallel;
	return {
		...baseData,
		parallel: parallel
			? {
					active_session_count: parallel.active_session_count,
					collision_task_ids: parallel.collision_task_ids,
					active_claim_count: parallel.active_claim_count || 0,
					claim_conflict_count: parallel.claim_conflict_count || 0,
				}
			: null,
		claims: artifacts.graph?.views?.claims || null,
	};
}

function automationLensData(
	artifacts: LoadedCodewikiStateArtifacts,
	baseData: Record<string, unknown>,
	blockers: Record<string, unknown>[],
	nextTaskId: string | null,
	focus: CodewikiStateLensFocus,
): Record<string, unknown> {
	const readiness = recordOrNull(artifacts.graph?.views?.automation_readiness);
	const taskId = String(
		focus.taskId ||
			focus.task_id ||
			nextTaskId ||
			readiness?.selected_task_id ||
			"",
	).trim();
	const sprintId = String(focus.sprintId || focus.sprint_id || "").trim();
	const tasks = recordField(readiness, "tasks") || {};
	const sprints = recordField(readiness, "sprints") || {};
	const focusedTask = taskId ? recordOrNull(tasks[taskId]) : null;
	const focusedSprint = sprintId ? recordOrNull(sprints[sprintId]) : null;
	return {
		...baseData,
		ready: Boolean(recordField(readiness, "next_action")?.safe_to_schedule),
		state: readiness?.state || baseData.state || "missing",
		selected_task_id: readiness?.selected_task_id || nextTaskId,
		ready_task_ids: stringArrayField(readiness, "runnable_task_ids")
			.concat(stringArrayField(readiness, "retryable_task_ids"))
			.concat(stringArrayField(readiness, "promotable_task_ids"))
			.slice(0, 8),
		runnable_task_ids: stringArrayField(readiness, "runnable_task_ids").slice(
			0,
			8,
		),
		retryable_task_ids: stringArrayField(readiness, "retryable_task_ids").slice(
			0,
			8,
		),
		promotable_task_ids: stringArrayField(
			readiness,
			"promotable_task_ids",
		).slice(0, 8),
		waiting_task_ids: stringArrayField(readiness, "waiting_task_ids").slice(
			0,
			8,
		),
		blocked_task_ids: stringArrayField(readiness, "blocked_task_ids").slice(
			0,
			8,
		),
		ambiguous_task_ids: stringArrayField(readiness, "ambiguous_task_ids").slice(
			0,
			8,
		),
		stop_reasons: unique([
			...stringArrayField(readiness, "stop_reasons"),
			...blockers.map((blocker) => String(blocker.kind || "")).filter(Boolean),
		]),
		next_action:
			readiness?.next_action ||
			baseData.next_action ||
			baseData.next_safe_action ||
			null,
		task: focusedTask,
		sprint: focusedSprint,
		agency: artifacts.statusState?.agency?.summary || null,
		contract: readiness
			? {
					version: readiness.version,
					contract_version: readiness.contract_version,
					generated_at: readiness.generated_at,
					expires_at: readiness.expires_at,
				}
			: null,
	};
}

function systemLensData(
	artifacts: LoadedCodewikiStateArtifacts,
	baseData: Record<string, unknown>,
): Record<string, unknown> {
	const systemSection = artifacts.statusState?.wiki.sections.find(
		(section) => section.id === "system",
	);
	return {
		...baseData,
		system_diagrams: artifacts.graph?.views?.system_diagrams || null,
		wiki_section: systemSection || null,
	};
}

function productLensData(
	artifacts: LoadedCodewikiStateArtifacts,
	baseData: Record<string, unknown>,
): Record<string, unknown> {
	const productSection = artifacts.statusState?.wiki.sections.find(
		(section) => section.id === "product",
	);
	return {
		...baseData,
		wiki_section: productSection || null,
	};
}

async function focusedStateLensData(
	project: WikiProject,
	lensId: CodewikiStateLensId,
	artifacts: LoadedCodewikiStateArtifacts,
	health: RoadmapStateFile["health"],
	focus: CodewikiStateLensFocus,
	nextTaskId: string | null,
	baseLens: Record<string, unknown>,
	blockers: Record<string, unknown>[],
): Promise<Record<string, unknown>> {
	const baseData = graphLensData(baseLens);
	if (lensId === "status") return statusLensData(artifacts, health, baseData);
	if (lensId === "resume") {
		return {
			...baseData,
			resume: artifacts.statusState?.resume || null,
			workflow_cursor:
				artifacts.statusState?.workflow_cursor ||
				artifacts.graph?.views?.workflow_cursor ||
				null,
		};
	}
	if (lensId === "trace") return traceLensData(baseLens, focus);
	if (lensId === "task") {
		return taskLensData(project, artifacts, focus, nextTaskId, baseData);
	}
	if (lensId === "sprint") return sprintLensData(artifacts, focus, baseData);
	if (lensId === "validation") return validationLensData(artifacts, baseData);
	if (lensId === "runtime") return runtimeLensData(artifacts, baseData);
	if (lensId === "automation-readiness") {
		return automationLensData(artifacts, baseData, blockers, nextTaskId, focus);
	}
	if (lensId === "system") return systemLensData(artifacts, baseData);
	return productLensData(artifacts, baseData);
}

async function buildCodewikiFocusedStateLens(
	project: WikiProject,
	lensId: CodewikiStateLensId,
	artifacts: LoadedCodewikiStateArtifacts,
	health: RoadmapStateFile["health"],
	nextAction: ReturnType<typeof buildCodewikiNextAction>,
	opts: {
		include: string[] | undefined;
		taskId: string | undefined;
		focus?: CodewikiStateLensFocus;
		ref?: string;
		refs?: string[];
	},
): Promise<Record<string, unknown>> {
	const focus = normalizeLensFocus(opts);
	const baseLens = graphLens(artifacts.graph, lensId);
	const sourceRefs = focusedLensSourceRefs(project, artifacts, baseLens, focus);
	const blockers = buildStateLensBlockers(artifacts, health, baseLens);
	const omittedCounts = {
		...(recordField(baseLens, "omitted_counts") || {}),
		source_refs: Math.max(0, sourceRefs.length - 10),
	};
	const nextSafeAction = stateNextSafeAction(nextAction);
	return {
		version: 1,
		id: lensId,
		view: lensId,
		source: baseLens.source || `state:${lensId}-lens`,
		focus,
		source_refs: sourceRefs,
		omitted_counts: omittedCounts,
		next_action: nextSafeAction,
		next_safe_action: nextSafeAction,
		blockers,
		freshness: stateLensFreshness(artifacts, sourceRefs),
		expansion_hints: stateLensExpansionHints(lensId, sourceRefs),
		data: await focusedStateLensData(
			project,
			lensId,
			artifacts,
			health,
			focus,
			nextAction.taskId,
			baseLens,
			blockers,
		),
		invariant: "generated_lens_not_canonical_truth",
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
		view?: CodewikiStateLensId;
		lens?: CodewikiStateLensId;
		focus?: CodewikiStateLensFocus;
		ref?: string;
		refs?: string[];
	},
	ports: ReadStatePorts,
): Promise<Record<string, unknown>> {
	const include = buildCodewikiStateInclude(opts.include, opts.taskId);
	const artifacts = await loadCodewikiStateArtifacts(project, opts.refresh);
	const activeLink = findLatestTaskSessionLink(
		ports.sessionStore.getSessionBranch(),
	);
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

	const requestedLens = selectedStateLens({
		view: opts.view,
		lens: opts.lens,
	});

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
			active_sprint_ids: artifacts.roadmapState?.views.active_sprint_ids ?? [],
			next_task_id: nextAction.taskId ?? null,
			unmapped_spec_count: artifacts.statusState?.summary.unmapped_specs ?? 0,
		},
		next_action: nextAction,
	};

	if (requestedLens) {
		result.lens = await buildCodewikiFocusedStateLens(
			project,
			requestedLens,
			artifacts,
			health,
			nextAction,
			{
				include: opts.include,
				taskId: opts.taskId,
				focus: opts.focus,
				ref: opts.ref,
				refs: opts.refs,
			},
		);
	}

	if (include.includes("roadmap")) {
		result.roadmap = {
			ordered_open_task_ids: artifacts.roadmapState?.views.open_task_ids ?? [],
			active_task_ids: artifacts.roadmapState?.views.in_progress_task_ids ?? [],
			blocked_task_ids: artifacts.roadmapState?.views.blocked_task_ids ?? [],
			recent_task_ids: artifacts.roadmapState?.views.recent_task_ids ?? [],
			sprint_ids: artifacts.roadmapState?.views.sprint_ids ?? [],
			active_sprint_ids: artifacts.roadmapState?.views.active_sprint_ids ?? [],
			sprints: artifacts.roadmapState?.views.sprints ?? [],
		};
	}

	if (include.includes("graph")) {
		const graph = artifacts.graph;
		const graphViews = graph?.views;
		const reconciliation = graphViews?.reconciliation ?? null;
		const gc = graphViews?.gc ?? null;
		const defaultLens = graphViews?.lenses?.default ?? null;
		const gcClasses = recordOrNull(gc?.classes);
		const hotClass = recordField(gcClasses, "hot");
		const defaultFamilies = arrayField(defaultLens, "families");
		const hotNodeIds = new Set<string>(
			stringArrayField(hotClass, "task_ids").map((id) => `task:${id}`),
		);
		for (const path of stringArrayField(hotClass, "build_paths")) {
			hotNodeIds.add(`build:${path}`);
		}
		for (const path of stringArrayField(hotClass, "validation_paths")) {
			hotNodeIds.add(`validation:${path}`);
		}
		for (const id of stringArrayField(hotClass, "claim_ids")) {
			hotNodeIds.add(`claim:${id}`);
		}
		result.graph = {
			generated_at: graph?.generated_at ?? null,
			node_count: defaultFamilies?.length ?? hotNodeIds.size,
			edge_count: defaultFamilies
				? Math.max(0, defaultFamilies.length - 1)
				: (graph?.edges.filter(
						(edge) => hotNodeIds.has(edge.from) || hotNodeIds.has(edge.to),
					).length ?? 0),
			doc_count:
				graph?.nodes.filter(
					(n) => n.kind === "doc" && n.default_hidden !== true,
				).length ?? 0,
			code_path_count:
				graph?.nodes.filter(
					(n) => n.kind === "code_path" && n.default_hidden !== true,
				).length ?? 0,
			source: defaultLens ? "graph:default-lens" : "graph:hot-default",
			families: defaultFamilies,
			badges: recordField(defaultLens, "badges"),
			next_action: defaultLens?.next_action ?? null,
			expands_to: defaultLens?.expands_to ?? null,
			claims: graphViews?.claims ?? null,
			scope_views: graphViews?.scope_views ?? null,
			automation_readiness: graphViews?.automation_readiness ?? null,
			workflow_cursor: graphViews?.workflow_cursor ?? null,
			file_structure: graphViews?.file_structure ?? null,
			gc: gc
				? {
						policy: gc.policy,
						classes: {
							hot: gc.classes?.hot ?? {},
						},
					}
				: null,
			reconciliation: reconciliation
				? {
						controller: reconciliation.controller,
						item_count: arrayField(reconciliation, "items")?.length ?? 0,
						counts_by_loop: recordField(reconciliation, "counts_by_loop") ?? {},
						next_action: reconciliation.next_action ?? null,
						layer_states: recordField(reconciliation, "layer_states") ?? {},
					}
				: null,
		};
	}

	if (include.includes("trace")) {
		result.trace = {
			source: "graph:trace-lens",
			...(artifacts.graph?.views?.lenses?.trace ?? {}),
		};
	}

	if (include.includes("audit")) {
		result.audit = {
			source: "graph:audit-lens",
			...(artifacts.graph?.views?.lenses?.audit ?? {}),
		};
	}

	if (include.includes("archive")) {
		const graph = artifacts.graph;
		result.archive = {
			source: "graph:explicit-archive",
			...(graph?.views?.archive ?? {}),
			gc: {
				cold: graph?.views?.gc?.classes?.cold ?? {},
				purgeable: graph?.views?.gc?.classes?.purgeable ?? {},
			},
		};
	}

	if (include.includes("drift")) {
		result.drift = {
			tracked_spec_count: artifacts.statusState?.summary.tracked_specs ?? 0,
			untracked_spec_count: artifacts.statusState?.summary.untracked_specs ?? 0,
			blocked_spec_count: artifacts.statusState?.summary.blocked_specs ?? 0,
			high_risk_spec_paths:
				artifacts.statusState?.views.top_risky_spec_paths ?? [],
			file_structure:
				artifacts.statusState?.file_structure ??
				artifacts.graph?.views?.file_structure ??
				null,
		};
	}

	if (include.includes("session")) {
		result.session = {
			focused_task_id: activeTaskLink?.taskId ?? null,
			updated_at: activeTaskLink?.timestamp ?? null,
			summary: activeTaskLink?.summary || null,
			workflow_cursor:
				activeTaskLink?.cursor ??
				artifacts.statusState?.workflow_cursor ??
				artifacts.graph?.views?.workflow_cursor ??
				null,
			claims: artifacts.statusState?.parallel
				? {
						active_claim_count:
							artifacts.statusState.parallel.active_claim_count ?? 0,
						warning_count:
							artifacts.statusState.parallel.claim_warning_count ?? 0,
						conflict_count:
							artifacts.statusState.parallel.claim_conflict_count ?? 0,
						pending_waiter_count:
							artifacts.statusState.parallel.claim_pending_wait_count ?? 0,
						ready_waiter_count:
							artifacts.statusState.parallel.claim_ready_wait_count ?? 0,
						artifact_statuses:
							artifacts.statusState.parallel.artifact_statuses ?? [],
					}
				: null,
		};
	}

	if (include.includes("claims")) {
		const claimView = artifacts.graph?.views?.claims;
		result.claims = claimView ?? {
			active_claim_count:
				artifacts.statusState?.parallel.active_claim_count ?? 0,
			warning_count: artifacts.statusState?.parallel.claim_warning_count ?? 0,
			conflict_count: artifacts.statusState?.parallel.claim_conflict_count ?? 0,
			pending_waiter_count:
				artifacts.statusState?.parallel.claim_pending_wait_count ?? 0,
			ready_waiter_count:
				artifacts.statusState?.parallel.claim_ready_wait_count ?? 0,
			claims: artifacts.statusState?.parallel.claims ?? [],
			waiters: artifacts.statusState?.parallel.claim_waiters ?? [],
			conflicts: artifacts.statusState?.parallel.claim_conflicts ?? [],
			artifact_statuses:
				artifacts.statusState?.parallel.artifact_statuses ?? [],
		};
	}

	if (include.includes("task")) {
		if (!opts.taskId) {
			result.task = null;
		} else {
			const task = await readRoadmapTask(project, opts.taskId);
			if (!task) throw new Error(`Roadmap task not found: ${opts.taskId}`);
			const runtimeTask = artifacts.roadmapState?.tasks?.[task.id] ?? null;
			const contextPacket = await maybeReadTaskContext(
				project,
				task.id,
				runtimeTask,
			);
			result.task = buildCodewikiTaskDetail(task, runtimeTask, contextPacket);
		}
	}

	return result;
}
