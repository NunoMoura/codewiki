import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WikiProject } from "../project/types.ts";
import type {
	RoadmapSprintRecord,
	RoadmapTaskRecord,
} from "../roadmap/types.ts";
import type { ChangeClaimsFile } from "../session/types.ts";
import type {
	GraphFile,
	RoadmapStateFile,
	RoadmapStateHealth,
	RoadmapStateSprintSummary,
	RoadmapStateTaskSummary,
	StatusStateFile,
} from "./types.ts";
import type { LintIssue, LintReport } from "../gateway/types.ts";
import type { ParsedDoc } from "../knowledge/doc-parser.ts";
import { nowIso } from "../shared/utils.ts";
import { buildChangeClaimState } from "../session/claims.ts";
import { assessRoadmapTaskBoundary } from "../roadmap/task-boundary.ts";
import { effectiveAgencyPolicy } from "../agency/types.ts";

export function sha256Text(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

type StateRecord = Record<string, unknown>;

type StateEvent = StateRecord;
type SpecDoc = StateRecord & { path: string; code_paths?: unknown };
interface SpecRow extends StateRecord {
	path: string;
	drift_status: string;
	code_paths: string[];
	open_tasks?: RoadmapTaskRecord[];
	blocked_tasks?: RoadmapTaskRecord[];
	done_tasks?: RoadmapTaskRecord[];
	issue_counts: { errors: number; warnings: number; total: number };
	revision: StateRecord;
}

type TaskLoopEvidence = NonNullable<
	RoadmapStateTaskSummary["loop"]
>["evidence"];

function isRecord(value: unknown): value is StateRecord {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): StateRecord {
	if (isRecord(value)) return value;
	return {};
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const text = String(item || "").trim();
		if (!text) return [];
		return [text];
	});
}

export function canonicalDigest(value: unknown): string {
	// Simple stable JSON stringify for basic objects
	const stableStringify = (obj: unknown): unknown => {
		if (obj === null || typeof obj !== "object") return obj;
		if (Array.isArray(obj)) return obj.map(stableStringify);
		if (!isRecord(obj)) return obj;
		const record = obj;
		return Object.keys(record)
			.sort()
			.reduce<StateRecord>((result, key) => {
				result[key] = stableStringify(record[key]);
				return result;
			}, {});
	};
	return sha256Text(JSON.stringify(stableStringify(value)));
}

function normalizeScopePath(value: string): string {
	return value
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/^\.codewiki\//, "codewiki/");
}

function pathMatchesScope(path: string, scope: string): boolean {
	const normalizedPath = normalizeScopePath(path);
	const normalizedScope = normalizeScopePath(scope);
	if (!normalizedPath || !normalizedScope) return false;
	if (normalizedScope.endsWith("/**")) {
		const prefix = normalizedScope.slice(0, -3);
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}
	return normalizedPath === normalizedScope;
}

function filterGeneratedPaths(
	paths: string[],
	generatedPaths: string[],
): string[] {
	return paths.filter(
		(path) => !generatedPaths.some((scope) => pathMatchesScope(path, scope)),
	);
}

function isActionableLintIssue(issue: LintIssue): boolean {
	return String(issue?.kind || "") !== "large-doc";
}

export function generatedStatePaths(project: WikiProject): string[] {
	const config = project.config || {};
	let generatedFiles: string[] = [];
	if (Array.isArray(config.generated_files)) {
		generatedFiles = config.generated_files;
	}
	let gatewayGenerated: string[] = [];
	if (Array.isArray(config.codewiki?.gateway?.generated_readonly_paths)) {
		gatewayGenerated = config.codewiki.gateway.generated_readonly_paths;
	}
	return [...generatedFiles, ...gatewayGenerated];
}

export function roadmapTaskStage(status: unknown): string {
	const normalized = String(status || "todo").trim();
	if (normalized === "todo" || normalized === "done") return normalized;
	return "implement";
}

export function isOpenTaskStatus(status: unknown): boolean {
	return ["todo", "in_progress", "blocked"].includes(
		String(status || "").trim(),
	);
}

export function isActiveTaskStatus(status: unknown): boolean {
	return ["in_progress", "blocked"].includes(String(status || "").trim());
}

export function buildTaskLoopState(
	taskId: string,
	_status: string,
	events: StateEvent[],
) {
	let updatedAt = "";
	let evidence: TaskLoopEvidence | undefined;

	events.forEach((event) => {
		if (String(event.task_id || event.taskId || "").trim() !== taskId) return;
		const kind = String(event.kind || "").trim();
		const timestamp = String(event.ts || "").trim();

		if (kind === "task_evidence_recorded") {
			evidence = {
				verdict: String(event.verdict || "pass").trim() || "pass",
				summary: String(event.summary || "").trim(),
				checks_run: stringList(event.checks_run),
				files_touched: stringList(event.files_touched),
				issues: stringList(event.issues),
				updated_at: timestamp,
			};
			updatedAt = timestamp || updatedAt;
		}
	});

	return { updated_at: updatedAt, evidence };
}

export function lintHealth(lintReport: LintReport) {
	let issues: LintIssue[] = [];
	if (Array.isArray(lintReport.issues)) issues = lintReport.issues;
	const errors = issues.filter((i) => String(i.severity) === "error").length;
	const warnings = issues.filter(
		(i) => String(i.severity) === "warning",
	).length;
	let color: RoadmapStateHealth["color"] = "green";
	if (errors > 0) color = "red";
	else if (warnings > 0) color = "yellow";

	return {
		color,
		errors,
		warnings,
		total_issues: issues.length,
	};
}

export function buildRoadmapState(
	_project: WikiProject,
	entries: RoadmapTaskRecord[],
	graph: GraphFile,
	lintReport: LintReport,
	events: StateEvent[] = [],
	sprints: RoadmapSprintRecord[] = [],
): RoadmapStateFile {
	const graphViews = graph.views || {};
	const graphRoadmap = graphViews.roadmap || {};
	const ordered = entries.flatMap((item) => {
		const id = String(item.id || "").trim();
		if (!id) return [];
		return [id];
	});
	let graphSprints: RoadmapStateSprintSummary[] = sprints;
	if (Array.isArray(graphRoadmap.sprints)) graphSprints = graphRoadmap.sprints;

	const statusCounts: Record<string, number> = {};
	const priorityCounts: Record<string, number> = {};
	const tasks: Record<string, RoadmapStateTaskSummary> = {};

	entries.forEach((item) => {
		const itemRecord = item as unknown as StateRecord;
		const status = item.status || "todo";
		const priority = String(item.priority || "medium");
		statusCounts[status] = (statusCounts[status] || 0) + 1;
		priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;

		const taskId = String(item.id || "").trim();
		if (!taskId) return;

		const goal = item.goal || {
			outcome: "",
			acceptance: [],
			non_goals: [],
			verification: [],
		};
		const boundary = assessRoadmapTaskBoundary(item);
		tasks[taskId] = {
			id: taskId,
			title: String(item.title || taskId).trim(),
			status,
			priority,
			kind: String(item.kind || "task").trim(),
			change_type:
				String(item.change_type || itemRecord.change_class || "").trim() ||
				undefined,
			summary: String(item.summary || "").trim(),
			labels: stringList(item.labels),
			goal: {
				outcome: String(goal.outcome || "").trim(),
				acceptance: stringList(goal.acceptance),
				non_goals: stringList(goal.non_goals),
				verification: stringList(goal.verification),
			},
			spec_paths: stringList(item.spec_paths),
			code_paths: stringList(item.code_paths),
			updated: String(item.updated || "").trim(),
			boundary: {
				executable: boundary.executable,
				container: boundary.container,
				reasons: boundary.reasons,
			},
			context_path: `.codewiki/roadmap/tasks/${taskId}/context.json`,
			loop: buildTaskLoopState(taskId, status, events),
		};
	});

	const sortedEntries = [...entries].sort((a, b) => {
		const statusOrder: Record<string, number> = {
			in_progress: 1,
			blocked: 2,
			todo: 3,
			done: 4,
			cancelled: 5,
		};
		const p1 = statusOrder[String(a.status || "todo")] || 99;
		const p2 = statusOrder[String(b.status || "todo")] || 99;
		if (p1 !== p2) return p1 - p2;
		return String(a.id || "").localeCompare(String(b.id || ""));
	});

	const recentEntries = [...entries].sort((a, b) => {
		const d1 = String(a.updated || "");
		const d2 = String(b.updated || "");
		if (d1 !== d2) return d2.localeCompare(d1);
		return String(b.id || "").localeCompare(String(a.id || ""));
	});

	const blockedTaskIds = sortedEntries.flatMap((t) => {
		if (!t.id) return [];
		const status = String(t.status || "todo").trim();
		const loopVerdict = String(
			tasks[t.id]?.loop?.evidence?.verdict || "",
		).trim();
		if (status === "blocked" || loopVerdict === "blocked") return [t.id];
		return [];
	});

	const openTaskIds = sortedEntries.flatMap((t) => {
		if (isOpenTaskStatus(t.status)) return [t.id];
		return [];
	});
	const inProgressIds = sortedEntries.flatMap((t) => {
		if (isActiveTaskStatus(t.status)) return [t.id];
		return [];
	});
	const todoIds = sortedEntries.flatMap((t) => {
		if (String(t.status) === "todo") return [t.id];
		return [];
	});
	const containerTaskIds = openTaskIds.filter(
		(taskId) => tasks[taskId]?.boundary?.container === true,
	);
	const executableOpenTaskIds = openTaskIds.filter(
		(taskId) => tasks[taskId]?.boundary?.executable !== false,
	);
	const executableInProgressIds = inProgressIds.filter((taskId) =>
		executableOpenTaskIds.includes(taskId),
	);
	const executableTodoIds = todoIds.filter((taskId) =>
		executableOpenTaskIds.includes(taskId),
	);

	return {
		version: 2,
		generated_at: nowIso(),
		health: lintHealth(lintReport),
		source: {
			task_context_root: ".codewiki/roadmap/tasks",
		},
		summary: {
			task_count: entries.length,
			open_count: openTaskIds.length,
			sprint_count: graphSprints.length,
			active_sprint_count: (graphRoadmap.active_sprint_ids || []).length,
			status_counts: graphRoadmap.status_counts || statusCounts,
			priority_counts: priorityCounts,
		},
		views: {
			ordered_task_ids: ordered,
			open_task_ids: openTaskIds,
			executable_open_task_ids: executableOpenTaskIds,
			container_task_ids: containerTaskIds,
			sprint_ids:
				graphRoadmap.sprint_ids || graphSprints.map((sprint) => sprint.id),
			active_sprint_ids:
				graphRoadmap.active_sprint_ids ||
				graphSprints.flatMap((sprint) => {
					if (["closed", "cancelled"].includes(String(sprint.status)))
						return [];
					return [sprint.id];
				}),
			sprints: graphSprints,
			in_progress_task_ids: inProgressIds,
			executable_in_progress_task_ids: executableInProgressIds,
			todo_task_ids: todoIds,
			executable_todo_task_ids: executableTodoIds,
			blocked_task_ids: blockedTaskIds,
			done_task_ids: sortedEntries.flatMap((t) => {
				if (String(t.status) === "done") return [t.id];
				return [];
			}),
			cancelled_task_ids:
				graphRoadmap.cancelled_task_ids ||
				sortedEntries.flatMap((t) => {
					if (String(t.status) === "cancelled") return [t.id];
					return [];
				}),
			recent_task_ids:
				graphRoadmap.recent_task_ids || recentEntries.map((t) => t.id),
		},
		tasks,
	};
}

export function compactCodeArea(codePaths: string[]): string {
	const cleaned = codePaths.map((v) => String(v).trim()).filter(Boolean);
	if (cleaned.length === 0) return "—";
	if (cleaned.length === 1) return cleaned[0];
	const areas: string[] = [];
	cleaned.forEach((path) => {
		const head = path.split("/")[0];
		if (!areas.includes(head)) areas.push(head);
	});
	if (areas.length === 1) return `${areas[0]} +${cleaned.length - 1} more`;
	const visible = areas.slice(0, 2);
	let suffix = "";
	if (areas.length > visible.length) {
		suffix = ` +${areas.length - visible.length} more`;
	}
	return visible.join(", ") + suffix;
}

export function pathStartsWithAny(path: string, prefixes: string[]): boolean {
	return prefixes.some((prefix) => path.startsWith(prefix));
}

export function specGroup(path: string, project: WikiProject): string {
	const specsRoot =
		project.config.specs_root || project.docsRoot || ".codewiki/kb";
	const PRODUCT_SPEC_PREFIX = `${specsRoot}/product/`;
	const CLIENTS_SPEC_PREFIXES = [`${specsRoot}/ux/`];
	if (path.startsWith(PRODUCT_SPEC_PREFIX)) return "product";
	if (pathStartsWithAny(path, CLIENTS_SPEC_PREFIXES)) return "clients";
	return "system";
}

export function specRequiresCodeMapping(
	path: string,
	project: WikiProject,
): boolean {
	const specsRoot =
		project.config.specs_root || project.docsRoot || ".codewiki/kb";
	const SYSTEM_SPEC_PREFIX = `${specsRoot}/system/`;
	if (!path.startsWith(SYSTEM_SPEC_PREFIX)) return false;
	if (path.startsWith(`${SYSTEM_SPEC_PREFIX}diagrams/`)) return false;
	// Top-level system overview is an index, not a code boundary spec
	if (path === `${SYSTEM_SPEC_PREFIX}overview.md`) return false;
	return true;
}

export function barState(label: string, value: number, total: number) {
	const safeTotal = Math.max(total, 0);
	let percent = 100;
	if (safeTotal > 0) percent = Math.round((value / safeTotal) * 100);
	return {
		label,
		value: Math.floor(value),
		total: Math.floor(total),
		percent,
	};
}

export function unique(values: string[]): string[] {
	const seen: string[] = [];
	values.forEach((value) => {
		const text = String(value).trim();
		if (text && !seen.includes(text)) seen.push(text);
	});
	return seen;
}

export function laneStats(rows: StateRecord[]) {
	let aligned = 0,
		tracked = 0,
		untracked = 0,
		blocked = 0,
		unmapped = 0;
	rows.forEach((row) => {
		const drift = String(row.drift_status || "aligned");
		if (drift === "aligned") aligned++;
		else if (drift === "tracked") tracked++;
		else if (drift === "untracked") untracked++;
		else if (drift === "blocked") blocked++;
		else if (drift === "unmapped") unmapped++;
	});
	return {
		total_specs: rows.length,
		aligned_specs: aligned,
		tracked_specs: tracked,
		untracked_specs: untracked,
		blocked_specs: blocked,
		unmapped_specs: unmapped,
	};
}

import type { GitCache } from "../project/local/git-cache.ts";

export function previousAgencyLane(
	previousStatus: unknown,
	laneId: string,
): StateRecord | null {
	const previousRecord = recordOrEmpty(previousStatus);
	const agency = recordOrEmpty(previousRecord.agency);
	let lanes: unknown[] = [];
	if (Array.isArray(agency.lanes)) lanes = agency.lanes;
	return (
		(lanes.find(
			(lane) => isRecord(lane) && String(lane.id).trim() === laneId,
		) as StateRecord | undefined) || null
	);
}

export function getTaskRevision(task: unknown): StateRecord {
	const record = recordOrEmpty(task);
	if (isRecord(record.revision)) return record.revision;
	return { digest: canonicalDigest(task) };
}

function docSourceRevision(
	repoRoot: string,
	doc: ParsedDoc | StateRecord,
): StateRecord {
	const docRecord = doc as unknown as StateRecord;
	const existing = recordOrEmpty(docRecord.revision);
	if (String(existing.digest || "").trim()) return existing;
	const path = String(doc?.path || "").trim();
	const body = String(doc?.body || "");
	let source = body;
	if (!source && path) {
		try {
			source = readFileSync(join(repoRoot, path), "utf8");
		} catch {
			source = JSON.stringify({
				path,
				title: doc?.title || "",
				summary: doc?.summary || "",
			});
		}
	}
	return { digest: sha256Text(source), basis: "source_content" };
}

export function laneRevisionAnchor(
	repoRoot: string,
	gitCache: GitCache,
	rowPaths: string[],
	codePaths: string[],
	openTaskIds: string[],
	specRowsByPath: Record<string, StateRecord>,
	roadmapEntries: Array<RoadmapTaskRecord | StateRecord>,
	roadmapRelPath: string,
	generatedPaths: string[] = [],
) {
	const sourceCodePaths = filterGeneratedPaths(codePaths, generatedPaths);
	const tasksById: Record<string, RoadmapTaskRecord | StateRecord> = {};
	roadmapEntries.forEach((task) => {
		const id = String(task.id || "").trim();
		if (id) tasksById[id] = task;
	});

	const specDigests: Record<string, string> = {};
	rowPaths.forEach((path) => {
		const revision = recordOrEmpty(specRowsByPath[path]?.revision);
		specDigests[path] = String(revision.digest || "").trim();
	});

	const taskDigests: Record<string, string> = {};
	openTaskIds.forEach((taskId) => {
		if (tasksById[taskId]) {
			taskDigests[taskId] = String(
				getTaskRevision(tasksById[taskId])?.digest || "",
			).trim();
		}
	});

	const codeDigests: Record<string, string> = {};
	sourceCodePaths.forEach((path) => {
		const absPath = join(repoRoot, path);
		if (existsSync(absPath) && statSync(absPath).isFile()) {
			codeDigests[path] = sha256Text(readFileSync(absPath, "utf-8"));
		}
	});

	const gitPaths = [...rowPaths, ...sourceCodePaths, roadmapRelPath];
	const gitAnchor = gitCache.buildAnchor(gitPaths);

	const anchor: StateRecord = {
		git: gitAnchor,
		spec_digest: canonicalDigest(specDigests),
		task_digest: canonicalDigest(taskDigests),
		code_digest: canonicalDigest(codeDigests),
	};
	anchor.digest = canonicalDigest(anchor);
	return anchor;
}

export function laneFreshness(
	anchor: StateRecord,
	previousLane: StateRecord | null,
	checkedAt: string,
) {
	if (!previousLane) {
		return {
			status: "fresh",
			basis: "revision",
			checked_at: checkedAt,
			reason: "no previous agency anchor; current revision captured",
			stale_state_guidance:
				"Resume normally; future spec, task, or mapped code revision changes will mark this lane stale.",
		};
	}
	const previousAnchor = recordOrEmpty(previousLane.revision);
	const changed: string[] = [];
	["spec_digest", "task_digest", "code_digest"].forEach((key) => {
		if (String(anchor[key] || "") !== String(previousAnchor[key] || "")) {
			changed.push(key.replace("_digest", ""));
		}
	});
	if (changed.length > 0) {
		return {
			status: "stale",
			basis: "revision",
			checked_at: checkedAt,
			reason: `revision changed: ${changed.join(", ")}`,
			stale_state_guidance:
				"Re-run status or resume implementation before trusting prior drift analysis.",
		};
	}
	return {
		status: "fresh",
		basis: "revision",
		checked_at: checkedAt,
		reason: "revision anchors unchanged since previous agency",
		stale_state_guidance:
			"Prior drift analysis remains correlated with current spec, task, and mapped code revisions.",
	};
}

export function buildAgencyLane(
	repoRoot: string,
	gitCache: GitCache,
	roadmapRelPath: string,
	laneId: string,
	title: string,
	cadence: string,
	fallbackMaxAgeHours: number,
	triggers: string[],
	specPaths: string[],
	specRowsByPath: Record<string, StateRecord>,
	roadmapEntries: Array<RoadmapTaskRecord | StateRecord>,
	recommendation: StateRecord,
	previousStatus: unknown,
	generatedPaths: string[] = [],
) {
	const rows = specPaths.flatMap((p) => {
		const row = specRowsByPath[p];
		if (!row) return [];
		return [row];
	});
	const rowPaths = rows.flatMap((r) => {
		const rowPath = String(r.path || "").trim();
		if (!rowPath) return [];
		return [rowPath];
	});

	const allCodePaths = rows.flatMap((row) => stringList(row.code_paths));
	const codePaths = unique(allCodePaths);

	const openTaskIds: string[] = [];
	roadmapEntries.forEach((task) => {
		const taskId = String(task.id || "").trim();
		if (!taskId || !isOpenTaskStatus(task.status)) return;

		const taskSpecPaths = stringList(task.spec_paths);
		const taskCodePaths = stringList(task.code_paths);

		const specIntersection = taskSpecPaths.some((p: string) =>
			rowPaths.includes(p),
		);
		const codeIntersection = taskCodePaths.some((p: string) =>
			codePaths.includes(p),
		);

		if (specIntersection || codeIntersection) {
			openTaskIds.push(taskId);
		}
	});

	const checkedAt = nowIso();
	const normalizedOpenTaskIds = unique(openTaskIds);
	const revision = laneRevisionAnchor(
		repoRoot,
		gitCache,
		rowPaths,
		codePaths,
		normalizedOpenTaskIds,
		specRowsByPath,
		roadmapEntries,
		roadmapRelPath,
		generatedPaths,
	);
	const prevLane = previousAgencyLane(previousStatus, laneId);

	return {
		id: laneId,
		title,
		cadence,
		freshness_basis: "work-first",
		fallback_max_age_hours: fallbackMaxAgeHours,
		interval_hours: fallbackMaxAgeHours,
		triggers,
		checked_at: checkedAt,
		revision,
		freshness: laneFreshness(revision, prevLane, checkedAt),
		spec_paths: rowPaths,
		code_paths: codePaths,
		code_area: compactCodeArea(codePaths),
		open_task_ids: normalizedOpenTaskIds,
		risky_spec_paths: rowPaths.filter(
			(p) => String(specRowsByPath[p]?.drift_status || "aligned") !== "aligned",
		),
		stats: laneStats(rows),
		recommendation,
	};
}

export function latestPersistedFocusTaskId(
	events: StateEvent[],
	roadmapState: RoadmapStateFile,
): string {
	const tasks = roadmapState.tasks || {};
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		const kind = String(event?.kind || "").trim();
		if (kind !== "task_session_link" && kind !== "roadmap_task_session_link")
			continue;
		const action = String(event.action || "focus").trim() || "focus";
		if (action === "clear") return "";
		const taskId = String(event.task_id || event.taskId || "").trim();
		if (!taskId) continue;
		const task = tasks[taskId];
		if (task && isOpenTaskStatus(task.status)) return taskId;
	}
	return "";
}

export function buildResumeState(
	roadmapState: RoadmapStateFile,
	agencyLanes: StateRecord[],
	nextStep: StateRecord,
	persistedFocusTaskId = "",
): StateRecord {
	const views = roadmapState.views || {};
	const tasks = roadmapState.tasks || {};
	const inProgressIds =
		views.executable_in_progress_task_ids || views.in_progress_task_ids || [];
	const todoIds = views.executable_todo_task_ids || views.todo_task_ids || [];
	let persistedTask: RoadmapStateTaskSummary | null = null;
	if (persistedFocusTaskId) persistedTask = tasks[persistedFocusTaskId] || null;
	const persistedExecutable =
		persistedTask &&
		isOpenTaskStatus(persistedTask.status) &&
		persistedTask.boundary?.executable !== false;
	let openTaskId = [...inProgressIds, ...todoIds, ""][0];
	if (persistedExecutable) openTaskId = persistedFocusTaskId;
	let task: RoadmapStateTaskSummary | null = null;
	if (openTaskId) task = tasks[openTaskId] || null;

	if (task) {
		const goal = task.goal || {
			outcome: "",
			acceptance: [],
			non_goals: [],
			verification: [],
		};
		let verification: string[] = [];
		if (Array.isArray(goal.verification)) verification = goal.verification;
		const loop = task.loop || { updated_at: "" };
		const evidence = loop.evidence || { verdict: "", summary: "" };
		const evidenceParts = [String(evidence.summary || "").trim()].filter(
			Boolean,
		);
		let checksRun: string[] = [];
		if (Array.isArray(evidence.checks_run)) checksRun = evidence.checks_run;
		let issues: string[] = [];
		if (Array.isArray(evidence.issues)) issues = evidence.issues;

		if (checksRun.length) evidenceParts.push(`${checksRun.length} check(s)`);
		if (issues.length) evidenceParts.push(`${issues.length} issue(s)`);

		const evidenceText =
			evidenceParts.join(" · ") || "No closure evidence recorded yet.";
		const status = String(task.status || "todo").trim();

		let reasonPrefix = "Resume roadmap task";
		if (openTaskId === persistedFocusTaskId) {
			reasonPrefix = "Resume persisted task focus";
		}
		return {
			source: "task",
			task_id: openTaskId,
			lane_id: "",
			heading: `${openTaskId} — ${String(task.title || "").trim()}`
				.replace(/—\s*$/, "")
				.trim(),
			command: `/wiki-resume ${openTaskId}`,
			reason: `${reasonPrefix} (${status}).`,
			status,
			verification: verification[0] || "No explicit verification step yet.",
			evidence: evidenceText,
			agency: "Roadmap task should stay grounded in current agency cues.",
		};
	}

	const staleLane = agencyLanes.find((lane) => {
		const freshness = recordOrEmpty(lane.freshness);
		const stats = recordOrEmpty(lane.stats);
		const riskySpecCount = stringList(lane.risky_spec_paths).length;
		const openTaskCount = stringList(lane.open_task_ids).length;
		return (
			freshness.status === "stale" ||
			riskySpecCount > 0 ||
			openTaskCount > 0 ||
			Number(stats.untracked_specs || 0) > 0 ||
			Number(stats.blocked_specs || 0) > 0
		);
	});

	if (staleLane) {
		const recommendation = recordOrEmpty(staleLane.recommendation);
		const freshness = recordOrEmpty(staleLane.freshness);
		const riskySpecCount = stringList(staleLane.risky_spec_paths).length;
		const openTaskCount = stringList(staleLane.open_task_ids).length;
		return {
			source: "agency",
			task_id: "",
			lane_id: String(staleLane.id || "").trim(),
			heading: String(staleLane.title || "").trim(),
			command: String(recommendation.command || "").trim(),
			reason: "Resume from stale agency lane.",
			status: "in_progress",
			verification: String(recommendation.reason || "").trim(),
			evidence: "No closure evidence recorded yet.",
			agency:
				String(freshness.stale_state_guidance || "").trim() ||
				`${riskySpecCount} risky spec(s) and ${openTaskCount} open task(s).`,
		};
	}

	return {
		source: "next_step",
		task_id: "",
		lane_id: "",
		heading: "Roadmap clear",
		command: String(nextStep.command || "").trim(),
		reason: String(nextStep.reason || "").trim(),
		status: "in_progress",
		verification: "No urgent verification cue.",
		evidence: "No closure evidence recorded yet.",
		agency: "All agency lanes currently fresh.",
	};
}

const AGENT_NAME_POOL = [
	"Otter",
	"Kestrel",
	"Marten",
	"Heron",
	"Fox",
	"Raven",
	"Panda",
	"Lynx",
	"Badger",
	"Cormorant",
	"Falcon",
	"Tern",
	"Wren",
	"Puma",
	"Seal",
	"Yak",
	"Ibis",
	"Manta",
	"Orca",
	"Puffin",
	"Sable",
	"Swift",
	"Wolf",
	"Quail",
	"Mole",
	"Bison",
	"Gecko",
	"Jaguar",
	"Koala",
	"Narwhal",
	"Robin",
	"Stoat",
];

export function stableAgentName(sessionId: string): string {
	let value = 0;
	for (let i = 0; i < sessionId.length; i++) {
		value = (value * 33 + sessionId.charCodeAt(i)) >>> 0;
	}
	return AGENT_NAME_POOL[value % AGENT_NAME_POOL.length];
}

export function assignAgentNames(sessionIds: string[]): Record<string, string> {
	const used: Record<string, number> = {};
	const assigned: Record<string, string> = {};
	[...sessionIds].sort().forEach((sessionId) => {
		const base = stableAgentName(sessionId);
		const count = (used[base] || 0) + 1;
		used[base] = count;
		assigned[sessionId] = base;
		if (count !== 1) assigned[sessionId] = `${base} ${count}`;
	});
	return assigned;
}

interface ParallelSessionRow extends StateRecord {
	session_id: string;
	task_id: string;
	action: string;
	timestamp: string;
	title: string;
	summary: string;
	agent_name?: string;
}

interface ParallelSessionState extends StateRecord {
	generated_at: string;
	active_session_count: number;
	collision_task_ids: string[];
	sessions: ParallelSessionRow[];
}

export function buildParallelSessionState(
	events: StateEvent[],
	_roadmapState: RoadmapStateFile,
): ParallelSessionState {
	const latestBySession: Record<string, ParallelSessionRow> = {};
	events.forEach((event) => {
		const kind = String(event.kind || "").trim();
		if (kind !== "task_session_link" && kind !== "roadmap_task_session_link")
			return;
		const sessionId = String(event.session_id || "").trim();
		const taskId = String(event.task_id || event.taskId || "").trim();
		const timestamp = String(event.ts || "").trim();
		const action = String(event.action || "focus").trim() || "focus";

		if (!sessionId || !timestamp) return;
		if (action === "clear") {
			delete latestBySession[sessionId];
			return;
		}
		if (!taskId) return;

		latestBySession[sessionId] = {
			session_id: sessionId,
			task_id: taskId,
			action,
			timestamp,
			title: String(event.title || "").trim(),
			summary: String(event.summary || "").trim(),
		};
	});

	const sessions = Object.values(latestBySession).sort((a, b) => {
		const d1 = String(a.timestamp || "");
		const d2 = String(b.timestamp || "");
		if (d1 !== d2) return d2.localeCompare(d1);
		return String(b.session_id || "").localeCompare(String(a.session_id || ""));
	});

	const agentNames = assignAgentNames(
		sessions.flatMap((s) => {
			const sessionId = String(s.session_id).trim();
			if (!sessionId) return [];
			return [sessionId];
		}),
	);
	sessions.forEach((item) => {
		item.agent_name = agentNames[item.session_id] || "Agent";
	});

	const counts: Record<string, number> = {};
	sessions.forEach((item) => {
		const taskId = item.task_id;
		if (taskId) counts[taskId] = (counts[taskId] || 0) + 1;
	});

	const collisionTaskIds = Object.keys(counts)
		.filter((id) => counts[id] > 1)
		.sort();

	return {
		generated_at: nowIso(),
		active_session_count: sessions.length,
		collision_task_ids: collisionTaskIds,
		sessions: sessions.slice(0, 8),
	};
}

export function buildStatusState(
	project: WikiProject,
	repoRoot: string,
	gitCache: GitCache,
	docs: ParsedDoc[],
	graph: GraphFile,
	roadmapEntries: RoadmapTaskRecord[],
	lintReport: LintReport,
	roadmapState: RoadmapStateFile,
	events: StateEvent[],
	previousStatus: unknown,
	claims?: ChangeClaimsFile,
): StatusStateFile {
	const health = lintHealth(lintReport);

	const docByPath: Record<string, ParsedDoc> = {};
	docs.forEach((doc) => {
		const path = String(doc.path || "").trim();
		if (path) docByPath[path] = doc;
	});

	const graphDocCodePaths: Record<string, string[]> = {};
	(graph.edges || []).forEach((edge) => {
		if (String(edge.kind || "").trim() !== "doc_code_path") return;
		const source = String(edge.from || "").trim();
		const target = String(edge.to || "").trim();
		if (!source.startsWith("doc:") || !target.startsWith("code:")) return;
		const sourcePath = source.replace("doc:", "");
		const targetPath = target.replace("code:", "");
		if (!graphDocCodePaths[sourcePath]) graphDocCodePaths[sourcePath] = [];
		graphDocCodePaths[sourcePath].push(targetPath);
	});

	const graphSpecDocs: SpecDoc[] = [];
	(graph.nodes || []).forEach((node) => {
		if (
			String(node.kind || "").trim() !== "doc" ||
			String(node.doc_type || "").trim() !== "spec"
		)
			return;
		const path = String(node.path || "").trim();
		if (!path) return;
		const doc = docByPath[path];
		const docRecord = (doc || {}) as unknown as StateRecord;
		let docCodePaths: string[] = [];
		if (Array.isArray(doc?.code_paths)) docCodePaths = doc.code_paths;

		let mergedCodePaths = docCodePaths.flatMap((value) => {
			const text = String(value).trim();
			if (!text) return [];
			return [text];
		});
		if (graphDocCodePaths[path] && graphDocCodePaths[path].length > 0) {
			mergedCodePaths = graphDocCodePaths[path];
		}

		graphSpecDocs.push({
			...docRecord,
			path,
			title: String(node.title || doc?.title || path).trim(),
			summary: String(doc?.summary || node.summary || "").trim(),
			doc_type: "spec",
			code_paths: unique(mergedCodePaths),
			revision: docSourceRevision(repoRoot, {
				...docRecord,
				path,
				revision: node.revision || docRecord.revision || {},
			}),
		});
	});

	let specDocs: SpecDoc[] = graphSpecDocs;
	if (graphSpecDocs.length === 0) {
		specDocs = docs.flatMap((doc) => {
			if (doc.doc_type !== "spec") return [];
			return [
				{
					...(doc as unknown as StateRecord),
					path: String(doc.path || "").trim(),
					revision: docSourceRevision(repoRoot, doc),
				},
			];
		});
	}
	specDocs = specDocs.sort((a, b) =>
		String(a.path || "").localeCompare(String(b.path || "")),
	);

	let issues: LintIssue[] = [];
	if (Array.isArray(lintReport.issues)) issues = lintReport.issues;
	const openTasksBySpec: Record<string, RoadmapTaskRecord[]> = {};
	const blockedTasksBySpec: Record<string, RoadmapTaskRecord[]> = {};
	const doneTasksBySpec: Record<string, RoadmapTaskRecord[]> = {};

	roadmapEntries.forEach((task) => {
		const specPaths = stringList(task.spec_paths);
		const status = String(task.status || "todo");
		specPaths.forEach((specPath) => {
			if (status === "blocked") {
				if (!blockedTasksBySpec[specPath]) blockedTasksBySpec[specPath] = [];
				blockedTasksBySpec[specPath].push(task);
			} else if (isOpenTaskStatus(status)) {
				if (!openTasksBySpec[specPath]) openTasksBySpec[specPath] = [];
				openTasksBySpec[specPath].push(task);
			} else if (status === "done") {
				if (!doneTasksBySpec[specPath]) doneTasksBySpec[specPath] = [];
				doneTasksBySpec[specPath].push(task);
			}
		});
	});

	const specRows: SpecRow[] = [];
	const counts: Record<string, number> = {
		aligned: 0,
		tracked: 0,
		untracked: 0,
		blocked: 0,
		unmapped: 0,
	};
	const riskyPaths: string[] = [];

	const roadmapSortKey = (task: RoadmapTaskRecord) => {
		const statusOrder: Record<string, number> = {
			in_progress: 1,
			blocked: 2,
			todo: 3,
			done: 4,
			cancelled: 5,
		};
		const p1 = statusOrder[String(task.status || "todo")] || 99;
		return `${p1.toString().padStart(3, "0")}_${String(task.id || "")}`;
	};

	specDocs.forEach((doc) => {
		const path = String(doc.path || "").trim();
		const codePaths = stringList(doc.code_paths);
		const relatedIssues = issues.filter((issue) => {
			if (!isActionableLintIssue(issue)) return false;
			const issuePath = String(issue.path || "").trim();
			return issuePath === path || issuePath === path.replace("wiki/", "docs/");
		});

		const issueErrors = relatedIssues.filter(
			(i) => String(i.severity) === "error",
		).length;
		const issueWarnings = relatedIssues.filter(
			(i) => String(i.severity) === "warning",
		).length;

		const openTasks = (openTasksBySpec[path] || []).sort((a, b) =>
			roadmapSortKey(a).localeCompare(roadmapSortKey(b)),
		);
		const blockedTasks = (blockedTasksBySpec[path] || []).sort((a, b) =>
			roadmapSortKey(a).localeCompare(roadmapSortKey(b)),
		);
		const doneTasks = (doneTasksBySpec[path] || []).sort((a, b) =>
			roadmapSortKey(a).localeCompare(roadmapSortKey(b)),
		);

		const requiresMapping = specRequiresCodeMapping(path, project);

		let driftStatus = "aligned";
		let primaryTask = null;
		let note = "no deterministic drift signals";

		if (blockedTasks.length > 0 && openTasks.length === 0) {
			driftStatus = "blocked";
			primaryTask = blockedTasks[0];
			note = `blocked by ${primaryTask.id || "task"}`;
		} else if (openTasks.length > 0) {
			driftStatus = "tracked";
			primaryTask = openTasks[0];
			note = `tracked by ${primaryTask.id || "task"}`;
		} else if (codePaths.length === 0 && requiresMapping) {
			driftStatus = "unmapped";
			primaryTask = null;
			note = "no mapped code area";
		} else if (relatedIssues.length > 0) {
			driftStatus = "untracked";
			primaryTask = null;
			const issueTotal = issueErrors + issueWarnings;
			let issuePlural = "";
			if (issueTotal !== 1) issuePlural = "s";
			note = `${issueTotal} deterministic issue${issuePlural} with no open roadmap task`;
		} else {
			driftStatus = "aligned";
			primaryTask = null;
			if (doneTasks.length > 0) primaryTask = doneTasks[0];
		}

		counts[driftStatus] = (counts[driftStatus] || 0) + 1;
		if (driftStatus !== "aligned") riskyPaths.push(path);
		const relatedTaskIds = [
			...openTasks,
			...blockedTasks,
			...doneTasks,
		].flatMap((task) => {
			const taskId = String(task.id || "").trim();
			if (!taskId) return [];
			return [taskId];
		});
		let primaryTaskSummary = null;
		if (primaryTask) {
			primaryTaskSummary = {
				id: String(primaryTask.id || "").trim(),
				status: String(primaryTask.status || "").trim(),
				title: String(primaryTask.title || "").trim(),
			};
		}

		specRows.push({
			path,
			title: String(doc.title || path).trim(),
			summary: String(doc.summary || "").trim(),
			drift_status: driftStatus,
			code_paths: codePaths,
			code_area: compactCodeArea(codePaths),
			issue_counts: {
				errors: issueErrors,
				warnings: issueWarnings,
				total: issueErrors + issueWarnings,
			},
			related_task_ids: relatedTaskIds,
			primary_task: primaryTaskSummary,
			revision: docSourceRevision(repoRoot, doc),
			note,
		});
	});

	const statusOrder: Record<string, number> = {
		untracked: 0,
		blocked: 1,
		tracked: 2,
		unmapped: 3,
		aligned: 4,
	};
	const riskySpecs = specRows.sort((a, b) => {
		const o1 = statusOrder[String(a.drift_status || "aligned")] || 99;
		const o2 = statusOrder[String(b.drift_status || "aligned")] || 99;
		if (o1 !== o2) return o1 - o2;
		return String(a.path || "").localeCompare(String(b.path || ""));
	});

	const specRowsByPath: Record<string, SpecRow> = {};
	specRows.forEach((row) => {
		specRowsByPath[row.path] = row;
	});

	const mappingTargetSpecs = specRows.filter((row) =>
		specRequiresCodeMapping(row.path, project),
	);
	const totalSpecs = mappingTargetSpecs.length;
	const mappedSpecs = mappingTargetSpecs.filter(
		(row) => String(row.drift_status) !== "unmapped",
	).length;

	const driftTotal =
		(counts.tracked || 0) + (counts.untracked || 0) + (counts.blocked || 0);
	const trackedTotal = (counts.tracked || 0) + (counts.blocked || 0);
	const taskSummary = roadmapState.summary || {};
	const taskStatusCounts = taskSummary.status_counts || {};

	const specsRoot =
		project.config.specs_root || project.docsRoot || ".codewiki/kb";
	const PRODUCT_SPEC_PREFIX = `${specsRoot}/product/`;
	const SYSTEM_SPEC_PREFIX = `${specsRoot}/system/`;
	const CLIENTS_SPEC_PREFIXES = [`${specsRoot}/ux/`];

	const productSpecPaths = specRows.flatMap((row) => {
		if (!row.path.startsWith(PRODUCT_SPEC_PREFIX)) return [];
		return [row.path];
	});
	const systemSpecPaths = specRows.flatMap((row) => {
		if (!row.path.startsWith(SYSTEM_SPEC_PREFIX)) return [];
		return [row.path];
	});
	const uxSpecPaths = specRows.flatMap((row) => {
		if (!pathStartsWithAny(row.path, CLIENTS_SPEC_PREFIXES)) return [];
		return [row.path];
	});
	const generatedPaths = generatedStatePaths(project);

	const agencyLanes = [
		buildAgencyLane(
			repoRoot,
			gitCache,
			project.roadmapPath,
			"product_system",
			"Product ↔ System",
			"low",
			24,
			[
				"spec_change:product",
				"spec_change:system",
				"task_close:architecture",
				"manual_review",
			],
			unique([...productSpecPaths, ...systemSpecPaths]),
			specRowsByPath,
			roadmapEntries,
			{
				kind: "state",
				command: "wiki_state",
				reason:
					"Strategic intent drift should be inspected through backend state lenses.",
			},
			previousStatus,
			generatedPaths,
		),
		buildAgencyLane(
			repoRoot,
			gitCache,
			project.roadmapPath,
			"system_code",
			"System ↔ Code",
			"high",
			1,
			[
				"spec_change:system",
				"code_change:mapped",
				"task_progress",
				"rebuild_complete",
				"pre_close_check",
			],
			unique(systemSpecPaths),
			specRowsByPath,
			roadmapEntries,
			{
				kind: "implement",
				command: "/wiki-resume",
				reason:
					"Implementation drift should be checked most frequently against owning system specs.",
			},
			previousStatus,
			generatedPaths,
		),
		buildAgencyLane(
			repoRoot,
			gitCache,
			project.roadmapPath,
			"product_system_ux",
			"Product + System ↔ UX",
			"medium",
			6,
			[
				"spec_change:product",
				"spec_change:system",
				"spec_change:ux",
				"code_change:ux_surface",
				"manual_review",
			],
			unique([...productSpecPaths, ...systemSpecPaths, ...uxSpecPaths]),
			specRowsByPath,
			roadmapEntries,
			{
				kind: "state",
				command: "wiki_state",
				reason:
					"User-facing drift should be inspected through backend state lenses.",
			},
			previousStatus,
			generatedPaths,
		),
	];

	let reconciliation: StateRecord | null = null;
	if (isRecord(graph.views?.reconciliation)) {
		reconciliation = graph.views.reconciliation;
	}
	let reconciliationAction: StateRecord | null = null;
	if (isRecord(reconciliation?.next_action)) {
		reconciliationAction = reconciliation.next_action;
	}
	let nextStep: StateRecord;
	if (
		reconciliationAction &&
		String(reconciliationAction.loop || "observe") !== "observe"
	) {
		nextStep = {
			kind: `reconciliation:${String(reconciliationAction.loop)}`,
			command: String(
				reconciliationAction.command || "Run reconciliation gateway",
			),
			reason: String(
				reconciliationAction.reason ||
					"Graph reconciliation state selected the next compiler loop.",
			),
			item_id: reconciliationAction.item_id,
		};
	} else if (counts.untracked > 0) {
		nextStep = {
			kind: "state",
			command: "wiki_state",
			reason: `${counts.untracked} untracked spec drift needs inspection through backend state lenses.`,
		};
	} else if (counts.blocked > 0 || (taskStatusCounts.blocked || 0) > 0) {
		nextStep = {
			kind: "state",
			command: "wiki_state",
			reason:
				"Blocked drift exists; inspect constraints in backend state before resuming implementation.",
		};
	} else if (
		(
			roadmapState.views?.executable_in_progress_task_ids ||
			roadmapState.views?.in_progress_task_ids ||
			[]
		).length
	) {
		const taskId = (roadmapState.views?.executable_in_progress_task_ids ||
			roadmapState.views.in_progress_task_ids)[0];
		nextStep = {
			kind: "code",
			command: `/wiki-resume ${taskId}`,
			reason:
				"Roadmap already covers current executable delta; continue in-progress implementation.",
		};
	} else if (
		(
			roadmapState.views?.executable_todo_task_ids ||
			roadmapState.views?.todo_task_ids ||
			[]
		).length
	) {
		const taskId = (roadmapState.views?.executable_todo_task_ids ||
			roadmapState.views.todo_task_ids)[0];
		nextStep = {
			kind: "code",
			command: `/wiki-resume ${taskId}`,
			reason: "Roadmap is ready; continue with the next executable task.",
		};
	} else {
		nextStep = {
			kind: "observe",
			command: "Observe — roadmap clear",
			reason: "No open deterministic drift requires action right now.",
		};
	}

	const agencyPolicy = effectiveAgencyPolicy(project.config);
	const agencySummary = {
		lane_count: agencyLanes.length,
		freshness_basis: "work-first",
		level: agencyPolicy.level,
		approval_cadence: agencyPolicy.approval_cadence,
		context_reset_auto_pickup:
			agencyPolicy.context_reset.enabled &&
			agencyPolicy.context_reset.auto_pickup,
		high_cadence_lane_ids: agencyLanes.flatMap((lane) => {
			if (lane.cadence !== "high") return [];
			return [String(lane.id || "")];
		}),
		medium_cadence_lane_ids: agencyLanes.flatMap((lane) => {
			if (lane.cadence !== "medium") return [];
			return [String(lane.id || "")];
		}),
		low_cadence_lane_ids: agencyLanes.flatMap((lane) => {
			if (lane.cadence !== "low") return [];
			return [String(lane.id || "")];
		}),
	};

	const parallel = buildParallelSessionState(events, roadmapState);
	const claimState = buildChangeClaimState(
		claims || { version: 1, updated_at: "", next_sequence: 1, claims: [] },
	);
	parallel.active_claim_count = claimState.active_claim_count;
	parallel.claim_warning_count = claimState.warning_count;
	parallel.claim_conflict_count = claimState.conflict_count;
	parallel.claim_pending_wait_count = claimState.pending_waiter_count;
	parallel.claim_ready_wait_count = claimState.ready_waiter_count;
	parallel.claim_pending_wake_count = claimState.pending_wake_count;
	parallel.claims = claimState.claims.slice(0, 12);
	parallel.claim_waiters = claimState.waiters.slice(0, 12);
	parallel.claim_wake_notifications = claimState.wake_notifications.slice(
		0,
		12,
	);
	parallel.claim_conflicts = claimState.conflicts.slice(0, 12);
	parallel.artifact_statuses = (claimState.artifact_statuses || []).slice(
		0,
		24,
	);
	parallel.artifact_status = {
		in_use_count: claimState.active_claim_count,
		warning_count: claimState.warning_count,
		conflict_count: claimState.conflict_count,
		waiting_count: claimState.pending_waiter_count,
		ready_waiter_count: claimState.ready_waiter_count,
	};
	const persistedFocusTaskId = latestPersistedFocusTaskId(events, roadmapState);
	const resume = buildResumeState(
		roadmapState,
		agencyLanes,
		nextStep,
		persistedFocusTaskId,
	);
	const graphViews = graph.views || {};
	let fileStructure: StateRecord | null = null;
	if (isRecord(graphViews.file_structure))
		fileStructure = graphViews.file_structure;
	const fileStructureCounts = recordOrEmpty(fileStructure?.counts);
	let fileStructureActionableDrift = 0;
	if (Array.isArray(fileStructure?.actionable_entries)) {
		fileStructureActionableDrift = fileStructure.actionable_entries.length;
	}
	let fileStructureStatus: StateRecord | null = null;
	if (fileStructure) {
		let intendedPathCount = 0;
		if (Array.isArray(fileStructure.intended_paths)) {
			intendedPathCount = fileStructure.intended_paths.length;
		}
		let currentPathCount = 0;
		if (Array.isArray(fileStructure.current_paths)) {
			currentPathCount = fileStructure.current_paths.length;
		}
		let targetPathCount = 0;
		if (Array.isArray(fileStructure.target_paths)) {
			targetPathCount = fileStructure.target_paths.length;
		}
		let approvedMigrationDeltaPaths: string[] = [];
		if (Array.isArray(fileStructure.approved_migration_deltas)) {
			approvedMigrationDeltaPaths =
				fileStructure.approved_migration_deltas.flatMap((entry) => {
					if (!isRecord(entry)) return [];
					const entryPath = String(entry.path || "").trim();
					if (!entryPath) return [];
					return [entryPath];
				});
		}
		fileStructureStatus = {
			version: fileStructure.version,
			source: fileStructure.source,
			map_path: fileStructure.map_path,
			available: fileStructure.available,
			counts: fileStructureCounts,
			path_rule_counts: {
				intended: intendedPathCount,
				current: currentPathCount,
				target: targetPathCount,
			},
			approved_migration_delta_paths: approvedMigrationDeltaPaths,
			actionable_entries: fileStructure.actionable_entries || [],
			parse_issues: fileStructure.parse_issues || [],
		};
	}
	let decisionPropagation: StateRecord | null = null;
	if (isRecord(graphViews.decision_propagation)) {
		decisionPropagation = graphViews.decision_propagation;
	}
	let decisionPropagationStatus: StateRecord | null = null;
	if (decisionPropagation) {
		let residuals: unknown[] = [];
		if (Array.isArray(decisionPropagation.residuals)) {
			residuals = decisionPropagation.residuals.slice(0, 20);
		}
		decisionPropagationStatus = {
			version: decisionPropagation.version,
			model: decisionPropagation.model,
			checked_decision_count: Number(
				decisionPropagation.checked_decision_count || 0,
			),
			row_count: Number(decisionPropagation.row_count || 0),
			residual_count: Number(decisionPropagation.residual_count || 0),
			residuals,
		};
	}
	let semanticExecutionClosureStatus: StateRecord | null = null;
	if (isRecord(graphViews.semantic_execution_closure)) {
		const closure = graphViews.semantic_execution_closure;
		const summary = isRecord(closure.summary) ? closure.summary : {};
		semanticExecutionClosureStatus = {
			version: closure.version,
			model: closure.model,
			invariant: closure.invariant,
			summary: {
				approved_row_count: Number(summary.approved_row_count || 0),
				complete_row_count: Number(summary.complete_row_count || 0),
				gap_count: Number(summary.gap_count || 0),
				deviation_count: Number(summary.deviation_count || 0),
				remaining_risk_count: Number(summary.remaining_risk_count || 0),
			},
			gaps: Array.isArray(closure.gaps) ? closure.gaps.slice(0, 20) : [],
			deviations: Array.isArray(closure.deviations)
				? closure.deviations.slice(0, 20)
				: [],
		};
	}
	let activeLoop = "observe";
	let expectedOutput = "observation";
	if (String(nextStep.kind || "observe") === "code") {
		activeLoop = "implementation";
		expectedOutput = "implementation_build";
	}
	const activeSprintId = (roadmapState.views?.active_sprint_ids || [])[0];
	let workflowScope: StateRecord = { kind: "roadmap" };
	if (activeSprintId) workflowScope = { kind: "sprint", id: activeSprintId };
	else if (resume.task_id) workflowScope = { kind: "task", id: resume.task_id };
	const workflowCursor = graphViews.workflow_cursor || {
		active_loop: activeLoop,
		reason: String(nextStep.reason || ""),
		expected_output: expectedOutput,
		exit_gate: "validation pass or no drift",
		scope: workflowScope,
	};

	const wikiSections: Record<
		string,
		{ id: string; label: string; rows: StateRecord[] }
	> = {
		product: { id: "product", label: "Product", rows: [] },
		system: { id: "system", label: "System", rows: [] },
		clients: { id: "clients", label: "Clients", rows: [] },
	};
	riskySpecs.forEach((row) => {
		wikiSections[specGroup(row.path, project)].rows.push(row);
	});

	const roadmapColumns: Array<{
		id: string;
		label: string;
		task_ids: string[];
	}> = [
		{ id: "todo", label: "Todo", task_ids: [] },
		{ id: "implement", label: "Implement", task_ids: [] },
		{ id: "done", label: "Done", task_ids: [] },
	];
	const roadmapTasks = roadmapState.tasks || {};
	let orderedTaskIds: string[] = [];
	if (Array.isArray(roadmapState.views?.ordered_task_ids)) {
		orderedTaskIds = roadmapState.views.ordered_task_ids;
	}
	orderedTaskIds.forEach((taskId) => {
		const task = roadmapTasks[taskId];
		if (!task || task.status === "cancelled") return;
		const stage = roadmapTaskStage(task.status);
		const col = roadmapColumns.find((c) => c.id === stage) || roadmapColumns[0];
		col.task_ids.push(task.id);
	});

	const resetAutoPickup =
		agencyPolicy.context_reset.enabled &&
		agencyPolicy.context_reset.auto_pickup;
	let resetAutoPickupLabel = "off";
	if (resetAutoPickup) resetAutoPickupLabel = "on";
	const direction = [
		nextStep.reason,
		`Parallel sessions: ${parallel.active_session_count} active, ${parallel.collision_task_ids.length} collision task(s), ${claimState.active_claim_count} artifact(s) in-use, ${claimState.conflict_count} artifact conflict(s), ${claimState.pending_waiter_count} waiting, ${claimState.ready_waiter_count} ready.`,
		`Agency policy: level=${agencyPolicy.level}, approval=${agencyPolicy.approval_cadence}, reset_auto_pickup=${resetAutoPickupLabel}.`,
		`Agency lanes: ${agencySummary.lane_count} work-first (high=${agencySummary.high_cadence_lane_ids.length}, medium=${agencySummary.medium_cadence_lane_ids.length}, low=${agencySummary.low_cadence_lane_ids.length}).`,
		`Mapped specs: ${mappedSpecs}/${totalSpecs}.`,
	];
	if (driftTotal > 0) {
		direction.push(`Tracked drift coverage: ${trackedTotal}/${driftTotal}.`);
	} else {
		direction.push("No tracked spec drift is open.");
	}
	if (fileStructure) {
		direction.push(
			`File-structure drift: ${fileStructureActionableDrift} actionable item(s), ${fileStructureCounts.approved_migration_delta || 0} approved migration delta(s).`,
		);
	}
	if (decisionPropagationStatus?.residual_count) {
		direction.push(
			`Decision propagation gaps: ${decisionPropagationStatus.residual_count} accepted row/question mapping(s) need planning before unrelated implementation or close.`,
		);
	}

	return {
		version: 1,
		generated_at: nowIso(),
		project: {
			name: project.config.project_name || "project",
			docs_root: project.docsRoot,
			roadmap_path: project.roadmapPath,
		},
		health,
		summary: {
			total_specs: totalSpecs,
			mapped_specs: mappedSpecs,
			aligned_specs: counts.aligned || 0,
			tracked_specs: counts.tracked || 0,
			untracked_specs: counts.untracked || 0,
			blocked_specs: counts.blocked || 0,
			unmapped_specs: counts.unmapped || 0,
			task_count: roadmapEntries.length,
			open_task_count: (roadmapState.views?.open_task_ids || []).length,
			done_task_count: (roadmapState.views?.done_task_ids || []).length,
			file_structure_actionable_drift: fileStructureActionableDrift,
			file_structure_approved_migration_deltas:
				fileStructureCounts.approved_migration_delta || 0,
		},
		bars: {
			tracked_drift: barState("Tracked Drift", trackedTotal, driftTotal),
			roadmap_done: barState(
				"Roadmap Done",
				(roadmapState.views?.done_task_ids || []).length,
				roadmapEntries.length,
			),
			spec_mapping: barState("Spec Mapping", mappedSpecs, totalSpecs),
		},
		views: {
			risky_spec_paths: riskyPaths,
			top_risky_spec_paths: riskyPaths.slice(0, 10),
			open_task_ids: roadmapState.views?.open_task_ids || [],
			sprint_ids: roadmapState.views?.sprint_ids || [],
			active_sprint_ids: roadmapState.views?.active_sprint_ids || [],
		},
		next_step: nextStep,
		workflow_cursor: workflowCursor,
		gc: graphViews.gc || {},
		direction,
		file_structure: fileStructureStatus,
		decision_propagation: decisionPropagationStatus,
		semantic_execution_closure: semanticExecutionClosureStatus,
		specs: specRows,
		agency: {
			generated_at: nowIso(),
			summary: agencySummary,
			policy: agencyPolicy,
			lanes: agencyLanes,
		},
		resume,
		parallel,
		wiki: {
			rows: specRows,
			sections: Object.values(wikiSections),
		},
		roadmap: {
			focused_task_id:
				persistedFocusTaskId ||
				(roadmapState.views?.executable_in_progress_task_ids ||
					roadmapState.views?.in_progress_task_ids ||
					[])[0] ||
				"",
			blocked_task_ids: roadmapState.views?.blocked_task_ids || [],
			in_progress_task_ids: roadmapState.views?.in_progress_task_ids || [],
			next_task_id:
				String(resume.task_id || "") ||
				(roadmapState.views?.executable_todo_task_ids ||
					roadmapState.views?.todo_task_ids ||
					[])[0] ||
				"",
			sprint_ids: roadmapState.views?.sprint_ids || [],
			active_sprint_ids: roadmapState.views?.active_sprint_ids || [],
			sprints: roadmapState.views?.sprints || [],
			columns: roadmapColumns,
		},
		agents: {
			rows: parallel.sessions.map((s) => ({
				id: String(s.session_id || ""),
				label: String(s.agent_name || "Agent"),
				name: String(s.agent_name || "Agent"),
				task_id: String(s.task_id || ""),
				task_title: String((roadmapState.tasks || {})[s.task_id]?.title || ""),
				mode: "manual",
				status: "active",
				last_action: String(s.action || "focus"),
				constraint: "",
				session_id: String(s.session_id || ""),
			})),
		},
		channels: {
			add_label: "Add channel",
			rows: [],
		},
	} as unknown as StatusStateFile;
}
