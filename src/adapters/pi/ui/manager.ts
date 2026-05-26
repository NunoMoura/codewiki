import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { WikiProject } from "../../../domain/project/types.ts";
import type { TaskSessionLinkRecord, TaskSessionAction } from "../../../domain/session/types.ts";
import type {
	ActiveStatusPanel,
	ActiveConfigPanel,
	StatusScope,
	ResolvedStatusDockProject,
	StatusPanelSection,
	ConfigPanelSection,
	StatusStateFile,
	RoadmapStateFile,
	RoadmapStateTaskSummary,
	StatusStateAgencyLane,
	StatusStateParallelSession,
	StatusStateAgentRow,
	StatusStateRoadmapColumn,
	StatusStateSpecRow,
	StatusStateChannelRow,
	StatusPanelDetail,
	HomeIssue,
	StatusDockPrefs,
	StatusDockDensity,
	ArchitecturePanelComponent,
} from "../../../domain/state/types.ts";
import type { LintReport } from "../../../validation/types.ts";
import {
	readStatusDockPrefs,
    resolveStatusDockPrefsPath,
} from "../../../application/local/status-dock-prefs.ts";
import {
	resolveStatusDockProject,
	loadProject,
	maybeLoadProject,
    rememberStatusDockProject,
} from "../../../application/project.ts";
import {
	formatError,
	cycleIndex,
    unique,
} from "../../../domain/shared/utils.ts";
import {
    maybeReadJsonSync,
} from "../../../application/local/filesystem.ts";
import {
    padToWidth,
    truncatePlain,
} from "./text.ts";
import { STATUS_DOCK_MODE_VALUES } from "../../../domain/state/types.ts";
import {
	configSectionTabs,
	renderChoiceRow,
	renderPinnedTopPanel,
	statusModeChip,
	healthCircle,
    highlightSelectable,
    statusSectionTabs,
    detailHint,
    kanbanTaskCircle,
    isLiveAnimatedTask,
    roadmapColumnLabel,
    wikiActivityMarker,
} from "./theme.ts";
import { 
    updateTaskLoop, 
    taskLoopEvidenceLine,
    isTaskBlocked,
    taskBoardColumn,
} from "../../../application/roadmap.ts";
import { taskIdCandidates } from "../../../domain/roadmap/task-id.ts";
import { currentTaskLink, setTaskSessionStatusText } from "../session.ts";
import { maybeReadStatusState, maybeReadRoadmapState } from "../../../application/state-artifacts.ts";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { resolve, dirname, basename } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

export const STATUS_DOCK_WIDGET_KEY = "codewiki-status-dock";

// Global state moved from index.ts
export let activeStatusPanelGlobal: ActiveStatusPanel | null = null;
export let activeStatusPanelInputUnsubscribe: (() => void) | null = null;
export let activeConfigPanelClose: (() => void) | null = null;

/**
 * Set the global active status panel.
 */
export function setActiveStatusPanelGlobal(panel: ActiveStatusPanel | null): void {
	activeStatusPanelGlobal = panel;
}
const AGENT_NAME_POOL = [
	"Otter", "Kestrel", "Marten", "Heron", "Fox", "Raven", "Panda", "Lynx",
	"Badger", "Cormorant", "Falcon", "Tern", "Wren", "Puma", "Seal", "Yak"
];

/**
 * Clear the status dock from the UI.
 */
export function clearStatusDock(ctx: ExtensionContext | ExtensionCommandContext): void {
	if (activeStatusPanelInputUnsubscribe) {
		activeStatusPanelInputUnsubscribe();
		activeStatusPanelInputUnsubscribe = null;
	}
	(ctx as ExtensionContext).ui.setStatus("codewiki-status", undefined);
	(ctx as ExtensionContext).ui.setWidget(STATUS_DOCK_WIDGET_KEY, undefined);
	activeStatusPanelGlobal = null;
}

/**
 * UI error handling wrapper.
 */
export async function withUiErrorHandling(
	ctx: ExtensionContext | ExtensionCommandContext,
	action: () => Promise<void>,
): Promise<void> {
	try {
		await action();
	} catch (error) {
		ctx.ui.notify(formatError(error), "error");
	}
}

/**
 * Set the task session status in the UI.
 */
export function setTaskSessionStatus(
	ctx: ExtensionContext | ExtensionCommandContext,
	taskId: string,
	title: string,
	action: TaskSessionAction,
): void {
	setTaskSessionStatusText(ctx, taskId, title, action);
}

/**
 * Queue an audit follow-up message.
 */
export async function queueAudit(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	prompt: string,
): Promise<void> {
	try {
		if (typeof ctx.isIdle === "function" && ctx.isIdle()) {
			pi.sendUserMessage(prompt);
		} else {
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		}
	} catch {
		// Ignore
	}
}

/**
 * Open the configuration panel.
 */
export async function openConfigPanel(
	ctx: ExtensionCommandContext | ExtensionContext,
): Promise<boolean> {
	const ui = ctx.ui as any;
	if (
		typeof ui.setWidget !== "function" ||
		typeof ui.onTerminalInput !== "function"
	)
		return false;

	let currentPrefs = await readStatusDockPrefs();
	const sections: ConfigPanelSection[] = ["summary", "pinning", "gateway"];
	const pinActions = ["browse", "set current", "enter path", "clear"] as const;
	const panelState: ActiveConfigPanel = {
		section: "summary",
		pinActionIndex: 0,
		requestRender: () => { /* set later */ },
		close: () => { /* noop */ },
	};

	const renderWidget = () => {
		ui.setWidget?.(
			"codewiki-config-panel",
			(_tui: any, theme: any) => {
				const innerRender = (width: number): string[] => {
					const summaryIndex = Math.max(
						0,
						STATUS_DOCK_MODE_VALUES.indexOf(currentPrefs.mode),
					);
					const pinActionLabels = [
						"browse",
						"set current",
						"enter path",
						"clear",
					];
					let body: string[];
					if (panelState.section === "summary") {
						body = [
							theme.fg("text", theme.bold("Status summary")),
							"",
							renderChoiceRow(theme, ["auto", "pin", "off"], summaryIndex),
							"",
							theme.fg(
								"muted",
								currentPrefs.mode === "auto"
									? "Follow current repo or last resolved repo."
									: currentPrefs.mode === "pin"
										? "Show pinned repo in footer status."
										: "Hide footer status line.",
							),
						];
					} else if (panelState.section === "gateway") {
						body = [
							theme.fg("text", theme.bold("Context gateway")),
							"",
							theme.fg("text", "Configured in repo-local .codewiki/config.json."),
							theme.fg(
								"muted",
								"Bootstrap creates a read-only gateway by default.",
							),
							theme.fg(
								"muted",
								"Agents should use scripts/codewiki-gateway.mjs for token-light .codewiki exploration.",
							),
							theme.fg(
								"muted",
								"Policy: allow_paths, deny_paths, network, max_stdout_bytes, max_read_bytes.",
							),
						];
					} else {
						body = [
							theme.fg("text", theme.bold("Repo pinning")),
							"",
							renderChoiceRow(
								theme,
								pinActionLabels,
								panelState.pinActionIndex,
							),
							"",
							theme.fg(
								"muted",
								`Pinned repo: ${currentPrefs.pinnedRepoPath ?? "—"}`,
							),
							theme.fg(
								"muted",
								pinActions[panelState.pinActionIndex] === "browse"
									? "Pick from discovered Codewiki repos."
									: pinActions[panelState.pinActionIndex] === "set current"
										? "Use repo-local wiki at current cwd."
										: pinActions[panelState.pinActionIndex] === "enter path"
											? "Enter repo path manually."
											: "Clear pinned repo.",
							),
						];
					}
					return renderPinnedTopPanel(
						"Codewiki Configuration",
						configSectionTabs(theme, panelState.section),
						body,
						"Tab/←/→ section · Enter apply action · Esc close",
						theme,
						width,
						"accent",
					);
				};
				return { render: innerRender, invalidate: () => {} };
			},
			{ placement: "aboveEditor" },
		);
	};

	const close = () => {
		activeConfigPanelClose = null;
		inputUnsub?.();
		ui.setWidget?.("codewiki-config-panel", undefined);
	};
	activeConfigPanelClose?.();
	renderWidget();
	panelState.requestRender = renderWidget;
	panelState.close = close;

	const inputUnsub =
		ui.onTerminalInput?.((data: string) => {
			if (matchesKey(data, "escape") || matchesKey(data, "q")) {
				close();
				return { consume: true };
			}
			if (matchesKey(data, "tab")) {
				panelState.section =
					sections[
						cycleIndex(sections.length, sections.indexOf(panelState.section), 1)
					] ?? panelState.section;
				renderWidget();
				return { consume: true };
			}
			if (matchesKey(data, "left") || matchesKey(data, "right")) {
				const delta = matchesKey(data, "right") ? 1 : -1;
				if (panelState.section === "summary") {
					void (async () => {
						const index = cycleIndex(
							STATUS_DOCK_MODE_VALUES.length,
							STATUS_DOCK_MODE_VALUES.indexOf(currentPrefs.mode),
							delta,
						);
						await applyConfigValueChange(
							"summary-mode",
							statusModeChip(
								STATUS_DOCK_MODE_VALUES[index] ?? currentPrefs.mode,
							),
							ctx,
						);
						currentPrefs = await readStatusDockPrefs();
						renderWidget();
					})().catch((error: unknown) =>
						ctx.ui.notify(
							error instanceof Error ? error.message : String(error),
							"error",
						),
					);
				} else {
					panelState.pinActionIndex = cycleIndex(
						pinActions.length,
						panelState.pinActionIndex,
						delta,
					);
					renderWidget();
				}
				return { consume: true };
			}
			if (
				(matchesKey(data, "enter") || data === " ") &&
				panelState.section === "pinning"
			) {
				void (async () => {
					await applyConfigValueChange(
						"pinned-repo",
						pinActions[panelState.pinActionIndex],
						ctx,
					);
					currentPrefs = await readStatusDockPrefs();
					renderWidget();
				})().catch((error: unknown) =>
					ctx.ui.notify(
						error instanceof Error ? error.message : String(error),
						"error",
					),
				);
				return { consume: true };
			}
			return undefined;
		}) ?? null;

	activeConfigPanelClose = close;
	return true;
}

export async function applyConfigValueChange(
	kind: "summary-mode" | "pinned-repo",
	value: string,
	ctx: ExtensionCommandContext | ExtensionContext,
): Promise<void> {
    const { writeStatusDockPrefs } = await import("../../../application/local/status-dock-prefs.ts");
	const prefs = await readStatusDockPrefs();
	if (kind === "summary-mode") {
		const cleaned = value.replace(/^[◉◆○]\s*/, "").trim() as any;
		if (STATUS_DOCK_MODE_VALUES.includes(cleaned)) {
			await writeStatusDockPrefs({ ...prefs, mode: cleaned });
		}
	} else if (kind === "pinned-repo") {
		if (value === "clear") {
			await writeStatusDockPrefs({
				...prefs,
				mode: "auto",
				pinnedRepoPath: undefined,
			});
		} else if (value === "set current") {
			const project = await maybeLoadProject(ctx.cwd);
			if (project) {
				await writeStatusDockPrefs({
					...prefs,
					mode: "pin",
					pinnedRepoPath: project.root,
				});
			} else {
				throw new Error("No codewiki project found at current cwd.");
			}
		} else if (value === "enter path") {
			const path = await ctx.ui.input("Enter repo root path:", ctx.cwd);
			if (path) {
				const project = await loadProject(path);
				await writeStatusDockPrefs({
					...prefs,
					mode: "pin",
					pinnedRepoPath: project.root,
				});
			}
		} else if (value === "browse") {
            const nextRoot = await choosePinnedRepoRoot(ctx, prefs);
            if (nextRoot) {
                const project = await loadProject(nextRoot);
				await writeStatusDockPrefs({
					...prefs,
					mode: "pin",
					pinnedRepoPath: project.root,
				});
            }
		}
	}

	const resolved = await resolveStatusDockProject(ctx as any);
	if (resolved) {
		const { currentTaskLink } = await import("../session.ts");
		await refreshStatusDock(resolved.project, ctx, currentTaskLink(ctx), resolved);
	} else {
		clearStatusDock(ctx);
	}
}

/**
 * Refresh the status dock in the UI.
 */
export async function refreshStatusDock(
	project: WikiProject,
	ctx: ExtensionContext | ExtensionCommandContext,
	activeLink: TaskSessionLinkRecord | null = currentTaskLink(ctx),
	resolved: ResolvedStatusDockProject | null = null,
): Promise<void> {
	const ui = ctx.ui as any;
	if (typeof ui.setStatus !== "function") return;
	const prefs = await readStatusDockPrefs();
	if (prefs.mode === "off") {
		ui.setStatus("codewiki-status", undefined);
		return;
	}
	const dockState =
		resolved?.statusState ??
		(await maybeReadStatusState(project.statusStatePath));
	const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
	if (!dockState) {
		ui.setStatus("codewiki-status", undefined);
		return;
	}
	const source = resolved?.source ?? "cwd";
	ui.setStatus(
		"codewiki-status",
		buildStatusSummaryText(
			project,
			dockState,
			roadmapState,
			activeLink,
			source,
		),
	);
	if (
		activeStatusPanelGlobal &&
		activeStatusPanelGlobal.project.root === project.root
	) {
		activeStatusPanelGlobal.activeLink = activeLink;
		activeStatusPanelGlobal.source = source;
		activeStatusPanelGlobal.requestRender?.();
	}
}

/**
 * Build a text summary of the project status.
 */
export function buildStatusText(
	project: WikiProject,
	state: StatusStateFile,
	report: LintReport,
	scope: StatusScope,
	roadmapState: RoadmapStateFile | null = null,
	activeLink: TaskSessionLinkRecord | null = null,
): string {
	const nextStep = resolvedNextStep(state, roadmapState, activeLink);
	const resume = buildResumeSnapshot(state, roadmapState, activeLink);
	const focusedTask =
		activeRoadmapTaskSummary(roadmapState, activeLink) ??
		(resume.taskId ? (roadmapState?.tasks?.[resume.taskId] ?? null) : null);
	const sameTaskAgents = liveAgentRows(state, roadmapState, activeLink, null)
		.filter((row) => focusedTask && row.task_id === focusedTask.id)
		.map((row) => row.name || row.label);
	const lines = [
		`repo ${project.root}`,
		`scope ${scope}`,
		`health ${healthCircle(state.health.color)} errors=${countIssuesBySeverity(report, "error")} warnings=${countIssuesBySeverity(report, "warning")} total=${report.issues.length}`,
		`task ${resume.heading}`,
		`status ${resume.status}`,
		`next ${resume.command || nextStep.command}`,
		`why ${resume.reason}`,
		`gate ${resume.verification}`,
		`evidence ${resume.evidence}`,
		`specs ${(focusedTask?.spec_paths ?? []).slice(0, 6).join(", ") || "—"}`,
		`code ${(focusedTask?.code_paths ?? []).slice(0, 6).join(", ") || "—"}`,
		`agents ${sameTaskAgents.join(", ") || "—"}`,
		`blocked ${(roadmapState?.views?.blocked_task_ids ?? []).join(", ") || "none"}`,
	];
	return lines.join("\n");
}

export function buildStatusSummaryText(
	project: WikiProject,
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	_source: string,
): string {
    const activeTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	const nextStep = resolvedNextStep(state, roadmapState, activeLink);
	const taskLabel = activeTask
		? `${truncatePlain(activeTask.title, 30)}${activeTask.id ? ` · ${activeTask.id}` : ""}`
		: truncatePlain(nextStep.command, 30);
	return `codewiki: ${healthCircle(state.health.color)} · ${project.label} · ${taskLabel}`;
}

export function buildResumeSnapshot(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): {
	heading: string;
	command: string;
	reason: string;
	status: string;
	taskId?: string;
	verification: string;
	evidence: string;
	agency: string;
} {
	const activeTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	const agency = resumeAgencyLane(state);
	if (activeTask) {
		const collisions = parallelTaskCollisions(state, activeTask.id);
		return {
			heading: `${activeTask.id} — ${activeTask.title}`,
			command: `/wiki-resume ${activeTask.id}`,
			taskId: activeTask.id,
			reason:
				collisions.length > 0
					? `Resume focused task (${activeTask.status}) with ${collisions.length} parallel session(s) on same task.`
					: `Resume focused task (${activeTask.status}).`,
			status: activeTask.status,
			verification:
				activeTask.goal?.verification?.[0] ??
				state.resume?.verification ??
				"No explicit verification step yet.",
			evidence: taskLoopEvidenceLine(activeTask),
			agency: agency
				? `${agency.lane.title}: ${agency.freshness.reason}`
				: (state.resume?.agency ?? "No stale agency lane blocks resume."),
		};
	}
	if (state.resume?.heading && state.resume.command) {
		return {
			heading: state.resume.heading,
			command: state.resume.command,
			taskId: state.resume.task_id,
			reason: state.resume.reason,
			status: state.resume.status ?? "in_progress",
			verification: state.resume.verification,
			evidence: state.resume.evidence ?? "No closure evidence recorded yet.",
			agency: state.resume.agency,
		};
	}
	if (agency) {
		return {
			heading: agency.lane.title,
			command: agency.lane.recommendation.command,
			reason: `Resume from stale agency lane (${agency.freshness.basis}).`,
			status: "in_progress",
			verification: agency.lane.recommendation.reason,
			evidence: "No closure evidence recorded yet.",
			agency: agency.freshness.reason,
		};
	}
	return {
		heading: summarizeRoadmapFocus(roadmapState, activeLink),
		command: state.next_step.command,
		reason: state.next_step.reason,
		status: "in_progress",
		verification: "No urgent verification cue.",
		evidence: "No closure evidence recorded yet.",
		agency: "All agency lanes currently fresh.",
	};
}

// Logic helpers
export function countIssuesBySeverity(report: LintReport, severity: string): number {
	return report.issues.filter((issue) => issue.severity === severity).length;
}

export function activeRoadmapTaskSummary(
	state: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): RoadmapStateTaskSummary | null {
	const activeId = state
		? resolveRoadmapStateTaskId(state, activeLink?.taskId)
		: null;
	const activeTask = activeId && state ? state.tasks[activeId] : null;
	return activeTask && isOpenRoadmapTask(activeTask) ? activeTask : null;
}

export function resolvedNextStep(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): { command: string; reason: string } {
	const resume = buildResumeSnapshot(state, roadmapState, activeLink);
	return {
		command: resume.command,
		reason: resume.reason,
	};
}

export function agencyLaneFreshness(
	lane: StatusStateAgencyLane,
	now = new Date(),
): {
	status: "fresh" | "stale";
	basis: "revision" | "work" | "time" | "unknown";
	ageHours: number;
	reason: string;
} {
	const checkedAt = Date.parse(lane.checked_at);
	const ageHours = Number.isFinite(checkedAt)
		? Math.max(0, (now.getTime() - checkedAt) / 36e5)
		: Number.POSITIVE_INFINITY;
	if (lane.freshness?.status === "stale") {
		return {
			status: "stale",
			basis: "revision",
			ageHours,
			reason: lane.freshness.reason || "revision anchor changed",
		};
	}
	const workReasons: string[] = [];
	if ((lane.risky_spec_paths?.length ?? 0) > 0)
		workReasons.push(`${lane.risky_spec_paths.length} risky spec(s)`);
	if ((lane.open_task_ids?.length ?? 0) > 0)
		workReasons.push(`${lane.open_task_ids.length} open task(s)`);
	if ((lane.stats?.untracked_specs ?? 0) > 0)
		workReasons.push(`${lane.stats.untracked_specs} untracked spec(s)`);
	if ((lane.stats?.blocked_specs ?? 0) > 0)
		workReasons.push(`${lane.stats.blocked_specs} blocked spec(s)`);
	if (workReasons.length > 0) {
		return {
			status: "stale",
			basis: "work",
			ageHours,
			reason: `work changed: ${workReasons.join(", ")}`,
		};
	}
	const fallbackMaxAgeHours = Math.max(
		1,
		lane.fallback_max_age_hours ?? lane.interval_hours,
	);
	if (!Number.isFinite(checkedAt)) {
		return {
			status: "stale",
			basis: "unknown",
			ageHours,
			reason: "missing agency check timestamp",
		};
	}
	if (ageHours > fallbackMaxAgeHours) {
		return {
			status: "stale",
			basis: "time",
			ageHours,
			reason: `fallback max age ${fallbackMaxAgeHours}h exceeded`,
		};
	}
	return {
		status: "fresh",
		basis: "work",
		ageHours,
		reason: "no relevant work change detected",
	};
}

export function summarizeAgency(
	state: StatusStateFile,
	now = new Date(),
): {
	total: number;
	stale: number;
	work: number;
	time: number;
	summary: string;
} {
	const lanes = state.agency?.lanes ?? [];
	const freshness = lanes.map((lane) => agencyLaneFreshness(lane, now));
	const stale = freshness.filter((item) => item.status === "stale").length;
	const work = freshness.filter(
		(item) => item.status === "stale" && item.basis === "work",
	).length;
	const time = freshness.filter(
		(item) => item.status === "stale" && item.basis === "time",
	).length;
	if (lanes.length === 0)
		return {
			total: 0, stale: 0, work: 0, time: 0, summary: "no agency lanes"
		};
	if (stale === 0)
		return {
			total: lanes.length, stale: 0, work: 0, time: 0, summary: `${lanes.length}/${lanes.length} fresh`
		};
    return {
        total: lanes.length,
        stale,
        work,
        time,
        summary: `${stale}/${lanes.length} stale (${work} work, ${time} time)`
    };
}

export function resolveRoadmapStateTaskId(
	state: RoadmapStateFile,
	taskId: string | undefined,
): string | null {
	if (!taskId) return null;
	for (const candidate of taskIdCandidates(taskId)) {
		if (state.tasks[candidate]) return candidate;
	}
	return null;
}

export function isOpenRoadmapTask(task: RoadmapStateTaskSummary | undefined): boolean {
	return (
		!!task &&
		[
			"todo", "in_progress", "blocked"
		].includes(task.status)
	);
}

export function roadmapWorkingSetTaskIds(
	state: RoadmapStateFile,
	activeLink: TaskSessionLinkRecord | null,
): string[] {
	const activeId = resolveRoadmapStateTaskId(state, activeLink?.taskId);
	const activeTask = activeId ? state.tasks[activeId] : undefined;
	return unique([
		...(isOpenRoadmapTask(activeTask) ? [activeId as string] : []),
		...(state.views.in_progress_task_ids ?? []),
		...(state.views.todo_task_ids ?? []),
		...(state.views.blocked_task_ids ?? []),
	]).filter((taskId) => !!state.tasks[taskId]);
}

export function formatRoadmapWorkingSetLine(
	task: RoadmapStateTaskSummary,
	activeId: string | null,
	index: number,
): string {
	if (task.id === activeId && isOpenRoadmapTask(task))
		return `- Focused: ${task.id} — ${task.title}`;
	if (isTaskBlocked(task)) return `- Blocked: ${task.id} — ${task.title}`;
	const stage = taskBoardColumn(task);
	if (stage === "implement") return `- Implement: ${task.id} — ${task.title}`;
	if (index === 0) return `- Next: ${task.id} — ${task.title}`;
	return `- Todo: ${task.id} — ${task.title}`;
}

export function buildRoadmapWorkingSetLines(
	state: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	limit = 3,
): string[] {
	if (!state) return ["- none"];
	const activeId = resolveRoadmapStateTaskId(state, activeLink?.taskId);
	const ids = roadmapWorkingSetTaskIds(state, activeLink);
	if (ids.length === 0) {
		const doneCount = state.summary.status_counts.done ?? 0;
		return [doneCount > 0 ? `- Roadmap clear: ${doneCount} done` : "- none"];
	}
	const visible = ids
		.slice(0, limit)
		.map((taskId) => state.tasks[taskId])
		.filter(Boolean) as RoadmapStateTaskSummary[];
	const lines = visible.map((task, index) =>
		formatRoadmapWorkingSetLine(task, activeId, index),
	);
	const overflow = ids.length - visible.length;
	if (overflow > 0) lines.push(`- ... and ${overflow} more open task(s)`);
	return lines;
}

export function summarizeRoadmapFocus(
	state: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): string {
	const line = buildRoadmapWorkingSetLines(state, activeLink, 1)[0] ?? "- none";
	return line.replace(/^-\s*/, "");
}

export function resumeAgencyLane(state: StatusStateFile): {
	lane: StatusStateAgencyLane;
	freshness: ReturnType<typeof agencyLaneFreshness>;
} | null {
	for (const lane of state.agency?.lanes ?? []) {
		const freshness = agencyLaneFreshness(lane);
		if (freshness.status === "stale" && freshness.basis === "work")
			return { lane, freshness };
	}
	for (const lane of state.agency?.lanes ?? []) {
		const freshness = agencyLaneFreshness(lane);
		if (freshness.status === "stale") return { lane, freshness };
	}
	return null;
}

export function parallelTaskCollisions(
	state: StatusStateFile,
	taskId: string | null | undefined,
	currentSessionIdValue?: string | null,
): StatusStateParallelSession[] {
	const normalizedTaskId = taskId?.trim();
	if (!normalizedTaskId) return [];
	return (state.parallel?.sessions ?? []).filter(
		(session) =>
			session.task_id === normalizedTaskId &&
			session.session_id !== currentSessionIdValue,
	);
}


export function stableAgentNameFromSessionId(sessionId: string): string {
	let hash = 0;
	for (const ch of sessionId) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
	return AGENT_NAME_POOL[hash % AGENT_NAME_POOL.length] ?? "Agent";
}

export function uniqueAgentName(base: string, used: Map<string, number>): string {
	const count = (used.get(base) ?? 0) + 1;
	used.set(base, count);
	return count === 1 ? base : `${base} ${count}`;
}

export function liveAgentRows(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	sessionId: string | null,
): StatusStateAgentRow[] {
	const deduped = unique((state.agents?.rows ?? []).map((row) => row.id))
		.map((id) => (state.agents?.rows ?? []).find((row) => row.id === id)!)
		.filter(Boolean);
	const rows = [...deduped];
	if (
		activeLink?.taskId &&
		sessionId &&
		!rows.some((row) => row.session_id === sessionId)
	) {
		const task = roadmapState?.tasks?.[activeLink.taskId] ?? null;
		rows.unshift({
			id: `session:${sessionId}`,
			label: stableAgentNameFromSessionId(sessionId),
			name: stableAgentNameFromSessionId(sessionId),
			task_id: activeLink.taskId,
			task_title: task?.title ?? activeLink.summary ?? "",
			mode: "manual",
			status: "active",
			last_action: activeLink.summary || activeLink.action,
			constraint: "Live Pi session context",
			session_id: sessionId,
		});
	}
	const usedNames = new Map<string, number>();
	return rows.map((row) => {
		const baseName =
			row.name ||
			row.label ||
			(row.session_id ? stableAgentNameFromSessionId(row.session_id) : "Agent");
		const name = uniqueAgentName(baseName, usedNames);
		return { ...row, name, label: name };
	});
}

export function currentSessionId(
	ctx: ExtensionContext | ExtensionCommandContext,
): string | null {
	try {
		const manager = (
			ctx as { sessionManager?: { getSessionId?: () => string } }
		).sessionManager;
		if (typeof manager?.getSessionId === "function") {
			const sessionId = manager.getSessionId();
			if (typeof sessionId === "string" && sessionId.trim())
				return sessionId.trim();
		}
        return null;
	} catch {
		return null;
	}
}

export function openStatusPanelDetail(
	panelState: ActiveStatusPanel,
	detail: StatusPanelDetail,
): void {
	panelState.detail = detail.actions?.length
		? { ...detail, selectedActionIndex: detail.selectedActionIndex ?? 0 }
		: detail;
	panelState.requestRender?.();
}

export function nextStatusPanelSection(
	section: StatusPanelSection,
): StatusPanelSection {
	if (section === "home") return "product";
	if (section === "product") return "system";
	if (section === "system") return "roadmap";
	if (section === "roadmap") return "graph";
	return "home";
}

export function buildRoadmapTaskDetail(
	task: RoadmapStateTaskSummary,
): StatusPanelDetail {
	const goal = task.goal ?? {} as NonNullable<RoadmapStateTaskSummary["goal"]>;
	const acceptance = (goal.acceptance ?? []).slice(0, 3);
	const verification = (goal.verification ?? []).slice(0, 3);
	const specs = (task.spec_paths ?? []).slice(0, 4);
	const code = (task.code_paths ?? []).slice(0, 4);
	const lines = [
		`Status: ${task.status}`,
		`Priority: ${task.priority}`,
		`Blocked: ${isTaskBlocked(task) ? "yes" : "no"}`,
		"",
		task.summary || "No summary.",
		"",
		`Outcome: ${goal.outcome || "—"}`,
		...(acceptance.length > 0
			? ["Success signals:", ...acceptance.map((item: string) => `- ${item}`), ""]
			: []),
		...(verification.length > 0
			? ["Verification:", ...verification.map((item: string) => `- ${item}`), ""]
			: []),
		`Specs: ${specs.join(", ") || "—"}`,
		`Code: ${code.join(", ") || "—"}`,
		`Evidence: ${taskLoopEvidenceLine(task) || "—"}`,
	];
	return {
		kind: "roadmap",
		taskId: task.id,
		title: `${task.id} — ${task.title}`,
		actions: [
			{ id: "resume", label: "Resume" },
			{ id: "block", label: "Block" },
		],
		lines,
	};
}

export async function runChannelDetailEditor(
	ui: any,
	panelState: ActiveStatusPanel,
	existing: StatusStateChannelRow | null,
	channelRows: StatusStateChannelRow[],
): Promise<void> {
	ui.setWidget?.(STATUS_DOCK_WIDGET_KEY, undefined);
	const label = (
		await ui.input?.("Channel label", existing?.label ?? "")
	)?.trim();
	if (!label) {
		panelState.requestRender?.();
		return;
	}
	const kind =
		(await ui.input?.("Channel kind", existing?.kind ?? "manual"))?.trim() ||
		"manual";
	const target =
		(await ui.input?.("Channel target", existing?.target ?? ""))?.trim() || "";
	const description =
		(
			await ui.input?.("Channel description", existing?.description ?? "")
		)?.trim() || undefined;
	const nextRows = [
		...channelRows.filter((row) => row.id !== existing?.id),
		{
			id: existing?.id ?? `channel:${Date.now()}`,
			label,
			kind,
			target,
			status: existing?.status ?? "active",
			scope: existing?.scope ?? "user",
			description,
			last_delivery_at: existing?.last_delivery_at,
			error: existing?.error,
		},
	];
	await writeStoredChannels(nextRows as StatusStateChannelRow[]);
	panelState.detail = null;
	panelState.requestRender?.();
}

export function resolveChannelStorePath(): string {
	const prefsPath = resolveStatusDockPrefsPath();
	return resolve(dirname(prefsPath), "codewiki-channels.json");
}

export async function writeStoredChannels(
	rows: StatusStateChannelRow[],
): Promise<void> {
	const path = resolveChannelStorePath();
    const { writeFile, mkdir } = await import("node:fs/promises");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify({ rows }, null, 2)}\n`, "utf8");
}

export function readStoredChannelsSync(): StatusStateChannelRow[] {
	const path = resolveChannelStorePath();
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as {
			rows?: StatusStateChannelRow[];
		};
		return Array.isArray(raw.rows)
			? raw.rows.filter((row) => row && typeof row.id === "string")
			: [];
	} catch {
		return [];
	}
}

export function liveChannelRows(state: StatusStateFile): StatusStateChannelRow[] {
	const rows = [...(state.channels?.rows ?? []), ...readStoredChannelsSync()];
	return unique(rows.map((row) => row.id))
		.map((id) => rows.find((row) => row.id === id)!)
		.filter(Boolean);
}

export async function discoverPinRepoChoices(
	ctx: ExtensionCommandContext | ExtensionContext,
	prefs: StatusDockPrefs,
): Promise<Array<{ root: string; label: string }>> {
    const { findWikiRootsBelow } = await import("../../../project-root.ts");
	const roots = new Set<string>();
	const localProject = await maybeLoadProject(ctx.cwd);
	if (localProject) roots.add(localProject.root);
	for (const root of await findWikiRootsBelow(ctx.cwd, {
		maxDepth: 5,
		maxResults: 24,
	}))
		roots.add(root);
	if (prefs.lastRepoPath) roots.add(prefs.lastRepoPath);
	if (prefs.pinnedRepoPath) roots.add(prefs.pinnedRepoPath);
	const projects = await Promise.all(
		[...roots].map(async (root) => {
			const project = await maybeLoadProject(root);
			if (!project) return null;
			const tags = [
				project.root === prefs.pinnedRepoPath ? "PINNED" : "",
				project.root === localProject?.root ? "CURRENT" : "",
			]
				.filter(Boolean)
				.join(", ");
			const tagPrefix = tags ? `[${tags}] ` : "";
			return {
				root: project.root,
				label: `${tagPrefix}${project.label} · ${basename(project.root)} · ${truncateToWidth(project.root, 52)}`,
			};
		}),
	);
	return projects
		.filter((item): item is { root: string; label: string } => !!item)
		.sort((a, b) => a.label.localeCompare(b.label));
}

export async function choosePinnedRepoRoot(
	ctx: ExtensionCommandContext | ExtensionContext,
	prefs: StatusDockPrefs,
): Promise<string | null> {
	const choices = await discoverPinRepoChoices(ctx, prefs);
	if (choices.length === 0) {
		ctx.ui.notify(
			"No nearby wiki repos found to browse. Use 'enter path' to pin a repo manually.",
			"warning",
		);
		return null;
	}
	if (choices.length === 1) return choices[0]!.root;
	const labels = choices.map((choice) => choice.label);
	const picked = await ctx.ui.select(
		"Choose Codewiki repo to pin (CURRENT = cwd repo, PINNED = active pin)",
		labels,
	);
	if (!picked) return null;
	return choices.find((choice) => choice.label === picked)?.root ?? null;
}

export function wikiMarkdownPreview(project: WikiProject, path: string): string[] {
	try {
		const fullPath = resolve(project.root, path);
		const content = readFileSync(fullPath, "utf8");
		return content
			.split("\n")
			.filter((line) => line.trim().length > 0 && !line.startsWith("#"))
			.slice(0, 5)
			.map((line) => truncatePlain(line.replace(/^[*-]\s*/, "• "), 60));
	} catch {
		return [];
	}
}

export function readArchitecturePanelData(project: WikiProject): {
	mermaid: string[];
	components: ArchitecturePanelComponent[];
} {
	const components: ArchitecturePanelComponent[] = [];
	const mermaid: string[] = [];
	try {
		const data = JSON.parse(
			readFileSync(
				resolve(project.root, ".codewiki/views/system/architecture.json"),
				"utf8",
			),
		);
		if (Array.isArray(data.components)) {
			components.push(...data.components);
		}
	} catch {
		// Ignore
	}
	try {
		mermaid.push(
			...readFileSync(
				resolve(project.root, ".codewiki/views/system/architecture.mmd"),
				"utf8",
			).split("\n"),
		);
	} catch {
		// Ignore
	}
	return { mermaid, components };
}

export function readSystemDiagramCatalog(project: WikiProject): Array<{ id: string; title: string; kind: string; path: string; purpose: string }> {
	const dir = resolve(project.root, ".codewiki/kb/system/diagrams");
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => /\.ya?ml$/i.test(name))
		.sort((a, b) => diagramCatalogRank(a) - diagramCatalogRank(b) || a.localeCompare(b))
		.map((name) => {
			const path = `.codewiki/kb/system/diagrams/${name}`;
			const raw = readFileSync(resolve(dir, name), "utf8");
			return {
				id: frontmatterLikeYaml(raw, "id") || path,
				title: frontmatterLikeYaml(raw, "title") || basename(name, ".yaml"),
				kind: frontmatterLikeYaml(raw, "kind") || "diagram",
				path,
				purpose: frontmatterLikeYaml(raw, "purpose") || "System diagram raw data.",
			};
		});
}

function diagramCatalogRank(name: string): number {
	const order = ["context-map", "component-map", "key-flow", "data-model", "state-lifecycle"];
	const index = order.findIndex((item) => name.startsWith(item));
	return index >= 0 ? index : order.length;
}

function frontmatterLikeYaml(raw: string, key: string): string | null {
	const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(raw);
	return match ? match[1].trim().replace(/^['\"]|['\"]$/g, "") : null;
}

export function readGraphPanelData(project: WikiProject): {
	stats: Record<string, number>;
	nextAction: any;
	scopeLines: string[];
	dagEdges: Array<{ label: string; from: string; to: string }>;
	issues: string[];
} {
	const graph = maybeReadJsonSync<any>(project.graphPath) || {};
	const views = graph.views || {};
	const reconciliation = views.reconciliation || {};
	const scopeViews = views.scope_views || {};
	const edges = Array.isArray(graph.edges) ? graph.edges : [];
	const dagEdges = edges
		.filter((edge: any) => String(edge.kind || "").startsWith("build_"))
		.slice(0, 24)
		.map((edge: any) => ({ label: String(edge.kind || "edge"), from: String(edge.from || ""), to: String(edge.to || "") }));
	const sprintViews = Object.values(scopeViews.sprints || {}) as any[];
	return {
		stats: {
			nodes: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
			edges: Array.isArray(graph.edges) ? graph.edges.length : 0,
			build_edges: dagEdges.length,
			reconciliation_items: Array.isArray(reconciliation.items) ? reconciliation.items.length : 0,
		},
		nextAction: reconciliation.next_action || views.workflow_cursor || {},
		scopeLines: [
			`roadmap open=${scopeViews.roadmap?.open_task_ids?.length || 0} tasks=${scopeViews.roadmap?.task_ids?.length || 0}`,
			...sprintViews.slice(0, 6).map((sprint: any) => `${sprint.id} ${sprint.status} open=${sprint.open_task_ids?.length || 0} tasks=${sprint.task_ids?.length || 0}`),
		],
		dagEdges,
		issues: Array.isArray(reconciliation.items)
			? reconciliation.items.slice(0, 8).map((item: any) => `${item.next_loop || "observe"}: ${item.reason || item.source_id || item.id}`)
			: [],
	};
}

export function readDiffTablePanelData(project: WikiProject): {
	rows: Array<{ tableId: string; rowId: string; status: string; current: string; desired: string; risk: string; source: string; alternatives: string[]; readOnly: boolean }>;
	summary: string;
} {
	const rows: Array<{ tableId: string; rowId: string; status: string; current: string; desired: string; risk: string; source: string; alternatives: string[]; readOnly: boolean }> = [];
	const runtimePath = resolve(project.root, ".codewiki/runtime/diff-tables.json");
	const runtime = maybeReadJsonSync<any>(runtimePath);
	for (const table of Array.isArray(runtime?.tables) ? runtime.tables : []) {
		if (String(table.status || "pending") !== "pending") continue;
		for (const row of Array.isArray(table.rows) ? table.rows : []) rows.push({
			tableId: String(table.id || ""),
			rowId: String(row.id || ""),
			status: String(row.user_action || "pending"),
			current: String(row.current_state || ""),
			desired: String(row.desired_state || ""),
			risk: String(row.risk || "medium"),
			source: String(table.summary || table.id || "pending"),
			alternatives: Array.isArray(row.alternatives) ? row.alternatives.map(String) : [],
			readOnly: false,
		});
	}
	const decisionDir = resolve(project.root, ".codewiki/builds/decision");
	if (rows.length === 0 && existsSync(decisionDir)) {
		for (const file of readdirSync(decisionDir).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, 3)) {
			const build = maybeReadJsonSync<any>(resolve(decisionDir, file));
			for (const row of Array.isArray(build?.diff_table) ? build.diff_table : []) rows.push({
				tableId: file,
				rowId: String(row.id || ""),
				status: String(row.user_action || "pending"),
				current: String(row.current_state || ""),
				desired: String(row.desired_state || ""),
				risk: String(row.risk || "medium"),
				source: String(build?.summary || file),
				alternatives: Array.isArray(row.alternatives) ? row.alternatives.map(String) : [],
				readOnly: true,
			});
		}
	}
	return { rows, summary: rows.some((row) => !row.readOnly) ? "Pending decision diff table" : "Latest accepted decision diff rows (read-only)" };
}

export function updateRuntimeDiffRow(project: WikiProject, tableId: string, rowId: string, action: "approved" | "rejected" | "deferred" | "edited", alternative?: string): boolean {
	const path = resolve(project.root, ".codewiki/runtime/diff-tables.json");
	const data = maybeReadJsonSync<any>(path) || { version: 1, tables: [] };
	const table = Array.isArray(data.tables) ? data.tables.find((item: any) => String(item.id) === tableId) : null;
	const row = table && Array.isArray(table.rows) ? table.rows.find((item: any) => String(item.id) === rowId) : null;
	if (!row) return false;
	row.user_action = action;
	if (alternative) row.alternatives = [...(Array.isArray(row.alternatives) ? row.alternatives : []), alternative];
	data.updated_at = new Date().toISOString();
	table.updated_at = data.updated_at;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
	return true;
}

export function renderStatusDetailWindow(
	title: string,
	section: StatusPanelSection,
	detail: StatusPanelDetail,
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	width: number,
): string[] {
	const actionRow = detail.actions?.length
		? [
				renderChoiceRow(
					theme,
					detail.actions.map((action) => action.label),
					Math.max(0, detail.selectedActionIndex ?? 0),
				),
				"",
			]
		: [];
	return renderPinnedTopPanel(
		title,
		statusSectionTabs(theme, section),
		[
			theme.bold(theme.fg("accent", detail.title ?? "Details")),
			"",
			...actionRow,
			...(detail.lines ?? []),
		],
		detailHint(detail),
		theme,
		width,
		"accent",
	);
}

export function renderHomeTab(
	_project: WikiProject,
	state: StatusStateFile,
	report: LintReport,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	panelState: ActiveStatusPanel,
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	width: number,
): string[] {
	const activeTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	const resume = buildResumeSnapshot(state, roadmapState, activeLink);
	const issues = buildHomeIssues(state, report, roadmapState, activeLink);
	panelState.homeIssueIndex = Math.min(
		Math.max(0, panelState.homeIssueIndex),
		Math.max(0, issues.length - 1),
	);
	const readiness =
		state.health.color === "green"
			? "clear"
			: state.health.color === "yellow"
				? "needs attention"
				: "blocked";
	const blockedCount = roadmapState?.views?.blocked_task_ids?.length ?? 0;
	const statusFactors = [
		`Checks: errors=${countIssuesBySeverity(report, "error")} warnings=${countIssuesBySeverity(report, "warning")}`,
		`Tasks: ${state.summary.open_task_count} open · ${state.summary.done_task_count} done · ${blockedCount} blocked`,
		`Knowledge: ${state.summary.aligned_specs}/${state.summary.total_specs} aligned · ${state.summary.unmapped_specs} unmapped`,
		`Claims: ${state.parallel?.active_claim_count ?? 0} active · ${state.parallel?.claim_conflict_count ?? 0} conflict(s)`,
		`Graph: drift=${(state as any).reconciliation?.item_count ?? 0} · stale=${state.agency?.lanes?.filter((lane) => lane.freshness?.status === "stale").length ?? 0}`,
	];
	const lines = [
		theme.bold(theme.fg("accent", "Status")),
		`${healthCircle(state.health.color)} ${state.health.color.toUpperCase()} · ${readiness}`,
		...statusFactors.map((factor) => theme.fg("muted", `- ${factor}`)),
		"",
		theme.bold(theme.fg("accent", "Focus")),
		activeTask ? activeTask.title : resume.heading,
		theme.fg(
			"muted",
			activeTask
				? `${taskStatusLabel(activeTask.status)} · ${activeTask.id}`
				: `Next: ${resume.reason}`,
		),
		"",
		theme.bold(theme.fg("accent", "Next action")),
		truncatePlain(state.next_step?.reason || resume.reason || resume.command, Math.max(20, width - 4)),
		"",
		theme.bold(theme.fg("accent", "Issues")),
	];
	for (const [index, issue] of issues.entries()) {
		const selected = index === panelState.homeIssueIndex;
		lines.push(
			highlightSelectable(
				theme,
				`${selected ? "▸" : " "} ${homeIssueLabel(issue.severity)} · ${truncatePlain(issue.title, Math.max(12, width - 18))}`,
				selected,
			),
		);
		lines.push(
			theme.fg(
				"muted",
				truncatePlain(
					`Recommended: ${issue.recommended}`,
					Math.max(12, width - 4),
				),
			),
		);
	}
	return lines;
}

export function taskStatusLabel(status: string): string {
	if (status === "in_progress") return "In progress";
	return status ? status[0]!.toUpperCase() + status.slice(1).replace(/_/g, " ") : "Todo";
}

export function homeIssueLabel(severity: HomeIssue["severity"]): string {
	if (severity === "blocker") return "Blocker";
	if (severity === "warning") return "Needs attention";
	return "OK";
}

export function buildHomeIssues(
	state: StatusStateFile,
	report: LintReport,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): HomeIssue[] {
	const issues: HomeIssue[] = [];
	const activeTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	for (const taskId of roadmapState?.views?.blocked_task_ids ?? []) {
		const task = roadmapState?.tasks?.[taskId];
		if (!task) continue;
		issues.push({
			severity: "blocker",
			title: `${task.title} is blocked`,
			impact: "Production progress is paused until this work is unblocked.",
			recommended:
				taskLoopEvidenceLine(task) ||
				"Clarify the blocker in chat and choose the next step.",
			detail: [
				`Work item: ${task.id}`,
				`State: ${task.status}`,
				`Why it matters: Production progress is paused until this work is unblocked.`,
			],
		});
	}
	const errorCount = countIssuesBySeverity(report, "error");
	const warningCount = countIssuesBySeverity(report, "warning");
	if (errorCount > 0 || warningCount > 0) {
		const topIssue = report.issues[0];
		issues.push({
			severity: errorCount > 0 ? "blocker" : "warning",
			title: "Project knowledge needs attention",
			impact:
				errorCount > 0
					? "Codewiki found a blocking inconsistency in the project knowledge base."
					: "Codewiki found project knowledge that should be cleaned up before release.",
			recommended:
				topIssue?.message ||
				"Review the reported issue and let codewiki update the knowledge base.",
			detail: [
				`Issues: ${errorCount} blocker(s), ${warningCount} warning(s)`,
				...(topIssue
					? [`First issue: ${topIssue.path} — ${topIssue.message}`]
					: []),
			],
		});
	}
	if (activeTask && !activeTask.loop?.evidence) {
		issues.push({
			severity: "warning",
			title: "Current work still needs proof",
			impact:
				"The active work should not be treated as production-ready before independent checking.",
			recommended:
				activeTask.goal?.verification?.[0] ||
				"Run an independent check and record the result before closing the work.",
			detail: [
				`Work item: ${activeTask.id}`,
				`Current status: ${taskStatusLabel(activeTask.status)}`,
				`Recommended: ${activeTask.goal?.verification?.[0] || "Run an independent check and record the result."}`,
			],
		});
	}
	const activeTaskId = activeTask?.id ?? activeLink?.taskId;
	const collisions = parallelTaskCollisions(
		state,
		activeTaskId,
		activeStatusPanelGlobal?.sessionId,
	);
	if (collisions.length > 0) {
		issues.push({
			severity: "warning",
			title: "Multiple sessions are touching the same work",
			impact:
				"Parallel work can overwrite decisions or duplicate implementation effort.",
			recommended:
				"Let one session own the work or explicitly split the responsibility in chat.",
			detail: collisions.map(
				(session) =>
					`${session.title || session.task_id} · ${session.session_id}`,
			),
		});
	}
	if (issues.length === 0) {
		issues.push({
			severity: "info",
			title: "No blocking issues detected",
			impact:
				"Codewiki does not see an immediate blocker in the deterministic status data.",
			recommended:
				"Continue the current work and verify it independently before treating it as production-ready.",
			detail: [
				"No blockers found in roadmap, project knowledge, or active session state.",
			],
		});
	}
	return issues.slice(0, 4);
}

export function buildHomeProductionPath(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): string[] {
	const activeTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	const hasOpenWork =
		(roadmapState?.summary.open_count ?? state.summary.open_task_count) > 0;
	const hasUnreadyKnowledge =
		state.summary.untracked_specs > 0 || state.summary.blocked_specs > 0;
	return [
		hasUnreadyKnowledge
			? "Needs attention · Project understanding"
			: "Ready · Project understanding",
		activeTask
			? `Active · ${taskStatusLabel(activeTask.status)}`
			: hasOpenWork
				? "Active · Work remains open"
				: "Ready · No open work detected",
		activeTask?.loop?.evidence
			? "Ready · Latest work has recorded proof"
			: "Waiting · Independent check",
	];
}

export function readLiveStatusPanelSnapshot(
	project: WikiProject,
	activeLink: TaskSessionLinkRecord | null,
): {
	state: StatusStateFile;
	report: LintReport;
	roadmapState: RoadmapStateFile | null;
} | null {
	const indexGraph = maybeReadJsonSync<any>(project.graphPath);
	const state = indexGraph?.lenses?.status ?? maybeReadJsonSync<StatusStateFile>(project.statusStatePath);
	const report = indexGraph?.lenses?.lint ?? maybeReadJsonSync<LintReport>(project.lintPath);
	const roadmapState = indexGraph?.lenses?.roadmap ?? maybeReadJsonSync<RoadmapStateFile>(
		project.roadmapStatePath,
	);
	if (!state || !report) return null;
	if (activeStatusPanelGlobal) activeStatusPanelGlobal.activeLink = activeLink;
	return { state, report, roadmapState };
}

export function renderStatusPanelLines(
	project: WikiProject,
	state: StatusStateFile,
	report: LintReport,
	_scope: StatusScope,
	_density: StatusDockDensity,
	section: StatusPanelSection,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	_source: string,
	_prefs: StatusDockPrefs,
	panelState: ActiveStatusPanel,
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	width: number,
): string[] {
	const roadmapColumns = liveRoadmapColumns(state, roadmapState);
	const agentRows = liveAgentRows(
		state,
		roadmapState,
		activeLink,
		panelState.sessionId,
	);
	const title = project.label;
	const body: string[] = [];
	const perColumnLimit = 5;

	if (panelState.detail) {
		return renderStatusDetailWindow(
			title,
			section,
			panelState.detail,
			theme,
			width,
		);
	}

	if (section === "home") {
		body.push(
			...renderHomeTab(
				project,
				state,
				report,
				roadmapState,
				activeLink,
				panelState,
				theme,
				width,
			),
		);
	}

	if (section === "product") {
		const productPathOrder = [
			".codewiki/kb/product/users/maintainers.md",
			".codewiki/kb/product/users/agents.md",
			".codewiki/kb/product/users/package-authors.md",
			".codewiki/kb/product/users/external-users.md",
			".codewiki/kb/product/stories/intent.md",
			".codewiki/kb/product/stories/navigation.md",
			".codewiki/kb/product/stories/automation.md",
			".codewiki/kb/product/stories/drift.md",
			".codewiki/kb/product/uis/control-room.md",
			".codewiki/kb/product/uis/status-panel.md",
			".codewiki/kb/product/uis/board.md",
			".codewiki/kb/product/uis/graph-navigation.md",
		];
		const productRows = productPathOrder
			.map((path) => state.specs.find((row) => row.path === path))
			.filter((row): row is StatusStateSpecRow => Boolean(row));
		panelState.wikiRowIndex = Math.min(
			Math.max(0, panelState.wikiRowIndex),
			Math.max(0, productRows.length - 1),
		);
		body.push(theme.bold(theme.fg("accent", "Product")));
		for (const [index, row] of productRows.entries()) {
			const selected = index === panelState.wikiRowIndex;
			body.push(
				highlightSelectable(
					theme,
					`${selected ? "▸" : " "} ${wikiActivityMarker(row, activeLink, roadmapState, panelState.animationTick)} ${row.title || row.path}`,
					selected,
				),
			);
			body.push(theme.fg("muted", row.path));
			body.push(theme.fg("muted", truncatePlain(row.summary || row.note || "—", Math.max(12, width - 4))));
			body.push("");
		}
	}

	if (section === "system") {
		const architecture = readArchitecturePanelData(project);
		const diagrams = readSystemDiagramCatalog(project);
		panelState.wikiRowIndex = Math.min(
			Math.max(0, panelState.wikiRowIndex),
			Math.max(0, Math.max(diagrams.length, architecture.components.length) - 1),
		);
		body.push(theme.bold(theme.fg("accent", "Diagrams")));
		if (diagrams.length === 0) body.push(theme.fg("muted", "No diagram YAML found under .codewiki/kb/system/diagrams."));
		for (const [index, diagram] of diagrams.slice(0, 5).entries()) {
			const selected = index === panelState.wikiRowIndex;
			body.push(highlightSelectable(theme, `${selected ? "▸" : " "} ${diagram.title}`, selected));
			body.push(theme.fg("muted", truncatePlain(`${diagram.kind} · ${diagram.path}`, Math.max(12, width - 4))));
		}
		body.push("");
		body.push(theme.bold(theme.fg("accent", "Components")));
		if (architecture.components.length === 0) body.push(theme.fg("muted", "No architecture components found."));
		for (const [index, component] of architecture.components.slice(0, 8).entries()) {
			const selected = diagrams.length === 0 && index === panelState.wikiRowIndex;
			body.push(
				highlightSelectable(
					theme,
					`${selected ? "▸" : " "} ${component.label || component.id}`,
					selected,
				),
			);
			body.push(theme.fg("muted", truncatePlain(`${component.path || "—"}${component.summary ? ` · ${component.summary}` : ""}`, Math.max(12, width - 4))));
		}
	}

	if (section === "roadmap") {
		panelState.roadmapColumnIndex = Math.min(
			Math.max(0, panelState.roadmapColumnIndex),
			Math.max(0, roadmapColumns.length - 1),
		);
		const activeColumn = roadmapColumns[panelState.roadmapColumnIndex];
		const activeTaskIds = activeColumn?.task_ids ?? [];
		panelState.roadmapRowIndex = Math.min(
			Math.max(0, panelState.roadmapRowIndex),
			Math.max(0, activeTaskIds.length - 1),
		);
		const rowOffset = Math.max(
			0,
			panelState.roadmapRowIndex - (perColumnLimit - 1),
		);
		const agentByTaskId = new Map(
			agentRows
				.filter((row) => row.task_id)
				.map((row) => [row.task_id, row.name || row.label]),
		);
		const columnWidth = Math.max(
			16,
			Math.floor((Math.max(84, width) - 16) / 5),
		);
		const columnSeparator = theme.fg("muted", " │ ");
		const headerRow = roadmapColumns
			.map((column) =>
				padToWidth(
					theme.bold(theme.fg("accent", roadmapColumnLabel(column.id))),
					columnWidth,
				),
			)
			.join(columnSeparator);
		const dividerRow = roadmapColumns
			.map(() =>
				padToWidth(
					theme.fg("muted", "─".repeat(Math.max(8, columnWidth - 1))),
					columnWidth,
				),
			)
			.join(columnSeparator);
		body.push(headerRow);
		body.push(dividerRow);
		const columnLines = roadmapColumns.map((column, columnIndex) => {
			const lines: string[] = [];
			const start =
				columnIndex === panelState.roadmapColumnIndex ? rowOffset : 0;
			const visibleTaskIds = column.task_ids.slice(
				start,
				start + perColumnLimit,
			);
			if (visibleTaskIds.length === 0) {
				lines.push(theme.fg("muted", "—"));
				return lines;
			}
			for (const [visibleIndex, taskId] of visibleTaskIds.entries()) {
				const absoluteIndex = start + visibleIndex;
				const task = roadmapState?.tasks?.[taskId];
				if (!task) continue;
				const selected =
					columnIndex === panelState.roadmapColumnIndex &&
					absoluteIndex === panelState.roadmapRowIndex;
				const owner = agentByTaskId.get(task.id) ?? "Unassigned";
				const verification = task.goal?.verification?.[0];
				const cue = isTaskBlocked(task)
					? taskLoopEvidenceLine(task) || verification || "Waiting"
					: taskLoopEvidenceLine(task) ||
						verification ||
						taskStatusLabel(task.status);
				lines.push(
					highlightSelectable(
						theme,
						`${selected ? "▸" : " "} ${kanbanTaskCircle(task, activeLink, panelState.animationTick)} ${truncatePlain(task.title, Math.max(8, columnWidth - 4))}`,
						selected,
					),
				);
				lines.push(
					theme.fg(
						"muted",
						truncatePlain(`${owner} · ${task.id}`, columnWidth),
					),
				);
				lines.push(theme.fg("muted", truncatePlain(cue, columnWidth)));
				lines.push("");
			}
			if (column.task_ids.length > start + visibleTaskIds.length)
				lines.push(
					theme.fg(
						"muted",
						`… ${column.task_ids.length - (start + visibleTaskIds.length)} more`,
					),
				);
			return lines;
		});
		const maxLines = Math.max(...columnLines.map((lines) => lines.length));
		for (let index = 0; index < maxLines; index += 1)
			body.push(
				columnLines
					.map((lines) => padToWidth(lines[index] ?? "", columnWidth))
					.join(columnSeparator),
			);
	}

	if (section === "graph") {
		const graph = readGraphPanelData(project);
		const rows = [...graph.scopeLines, ...graph.dagEdges.map((edge) => `${edge.label}: ${edge.from} → ${edge.to}`), ...graph.issues.map((issue) => `drift: ${issue}`)];
		panelState.graphRowIndex = Math.min(Math.max(0, panelState.graphRowIndex ?? 0), Math.max(0, rows.length - 1));
		body.push(theme.bold(theme.fg("accent", "Graph scope + DAG")));
		body.push(theme.fg("muted", `nodes=${graph.stats.nodes} edges=${graph.stats.edges} build_edges=${graph.stats.build_edges} reconciliation=${graph.stats.reconciliation_items}`));
		body.push(theme.fg("muted", `next=${graph.nextAction.command || graph.nextAction.active_loop || "observe"}`));
		body.push("");
		for (const [index, row] of rows.slice(0, 18).entries()) {
			const selected = index === panelState.graphRowIndex;
			body.push(highlightSelectable(theme, `${selected ? "▸" : " "} ${truncatePlain(row, Math.max(12, width - 4))}`, selected));
		}
		if (!rows.length) body.push(theme.fg("muted", "Graph has no scoped rows yet."));
	}

	if (section === "diff") {
		const diff = readDiffTablePanelData(project);
		panelState.diffRowIndex = Math.min(Math.max(0, panelState.diffRowIndex ?? 0), Math.max(0, diff.rows.length - 1));
		body.push(theme.bold(theme.fg("accent", "Feedback diff table")));
		body.push(theme.fg("muted", diff.summary));
		body.push(theme.fg("muted", "a approve · x reject · d defer · p alternative · Enter details"));
		body.push("");
		for (const [index, row] of diff.rows.slice(0, 12).entries()) {
			const selected = index === panelState.diffRowIndex;
			const mode = row.readOnly ? "ro" : "edit";
			body.push(highlightSelectable(theme, `${selected ? "▸" : " "} ${row.status} [${row.risk}/${mode}] ${truncatePlain(row.desired, Math.max(12, width - 24))}`, selected));
			body.push(theme.fg("muted", truncatePlain(`${row.tableId}/${row.rowId} · ${row.current}`, Math.max(12, width - 4))));
			if (row.alternatives.length) body.push(theme.fg("muted", truncatePlain(`alts: ${row.alternatives.join(" | ")}`, Math.max(12, width - 4))));
		}
		if (!diff.rows.length) body.push(theme.fg("muted", "No pending or accepted diff rows found."));
	}

	return renderPinnedTopPanel(
		title,
		statusSectionTabs(theme, section),
		body,
		detailHint(null),
		theme,
		width,
		"accent",
	);
}

export async function openStatusPanel(
	_pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext | ExtensionCommandContext,
	scope: StatusScope,
	activeLink: TaskSessionLinkRecord | null,
	source: string,
	onState?: (state: ActiveStatusPanel | null) => void,
	initialSection: StatusPanelSection = "home",
): Promise<boolean> {
	const ui = ctx.ui as any;
	if (
		typeof ui.setWidget !== "function" ||
		typeof ui.onTerminalInput !== "function"
	)
		return false;
	const prefs = await readStatusDockPrefs();
	const panelState: ActiveStatusPanel = {
		project: project as any,
		source,
		scope,
		density: prefs.density,
		section: initialSection,
		activeLink,
		sessionId: currentSessionId(ctx) ?? "",
		homeIssueIndex: 0,
		wikiColumnIndex: 0,
		wikiRowIndex: 0,
		roadmapColumnIndex: 0,
		roadmapRowIndex: 0,
		graphRowIndex: 0,
		diffRowIndex: 0,
		agentRowIndex: 0,
		channelRowIndex: 0,
		detail: null,
		animationTick: 0,
		animationTimer: null,
	};

	const renderWidget = () => {
		ui.setWidget?.(STATUS_DOCK_WIDGET_KEY, (_tui: any, theme: any) => ({
			render: (width: number) => {
				const snapshot = readLiveStatusPanelSnapshot(
					panelState.project,
					panelState.activeLink,
				);
				const livePrefs =
					maybeReadJsonSync<StatusDockPrefs>(resolveStatusDockPrefsPath()) ??
					prefs;
				panelState.density = livePrefs.density;
				if (!snapshot) {
					return renderPinnedTopPanel(
						panelState.project.label,
						statusSectionTabs(theme, panelState.section),
						[
							theme.fg(
								"muted",
								"Live status data missing. Run /wiki-bootstrap or rebuild metadata.",
							),
						],
						"Tab section · arrows move · Enter details · r repo · Alt+W close",
						theme,
						width,
						"accent",
					);
				}
				return renderStatusPanelLines(
					panelState.project,
					snapshot.state,
					snapshot.report,
					panelState.scope,
					panelState.density,
					panelState.section,
					snapshot.roadmapState,
					panelState.activeLink,
					panelState.source,
					livePrefs,
					panelState,
					theme,
					width,
				);
			},
			invalidate: () => {},
		}));
	};

	const close = () => {
		activeStatusPanelInputUnsubscribe?.();
		activeStatusPanelInputUnsubscribe = null;
		if (panelState.animationTimer) clearInterval(panelState.animationTimer);
		panelState.animationTimer = null;
		ui.setWidget?.(STATUS_DOCK_WIDGET_KEY, undefined);
		activeStatusPanelGlobal = null;
		onState?.(null);
	};

	activeConfigPanelClose?.();
	panelState.requestRender = renderWidget;
	panelState.close = close;
	activeStatusPanelGlobal = panelState;
	onState?.(panelState);
	renderWidget();
	const hasActiveAnimation = (() => {
		const snapshot = readLiveStatusPanelSnapshot(
			panelState.project,
			panelState.activeLink,
		);
		const activeTaskId = panelState.activeLink?.taskId?.trim();
		const activeTask = activeTaskId
			? snapshot?.roadmapState?.tasks?.[activeTaskId]
			: null;
		return (
			!!activeTask && isLiveAnimatedTask(activeTask, panelState.activeLink)
		);
	})();
	if (hasActiveAnimation) {
		panelState.animationTimer = setInterval(() => {
			if (!activeStatusPanelGlobal) return;
			panelState.animationTick = (panelState.animationTick + 1) % 10;
			renderWidget();
		}, 120);
		(panelState.animationTimer as any).unref?.();
	}

	activeStatusPanelInputUnsubscribe?.();
	activeStatusPanelInputUnsubscribe =
		ui.onTerminalInput?.((data: string) => {
			if (!activeStatusPanelGlobal) return undefined;
			const snapshot = readLiveStatusPanelSnapshot(
				panelState.project,
				panelState.activeLink,
			);
			const roadmapColumns = snapshot
				? liveRoadmapColumns(snapshot.state, snapshot.roadmapState)
				: [];

			if (matchesKey(data, "escape") || matchesKey(data, "q")) {
				if (panelState.detail) {
					panelState.detail = null;
					renderWidget();
					return { consume: true };
				}
				close();
				return { consume: true };
			}
			if (matchesKey(data, "tab")) {
				panelState.detail = null;
				panelState.section = nextStatusPanelSection(panelState.section);
				renderWidget();
				return { consume: true };
			}
			if (
				panelState.detail?.actions?.length &&
				(matchesKey(data, "left") || matchesKey(data, "right"))
			) {
				const actionCount = panelState.detail.actions.length;
				panelState.detail.selectedActionIndex = cycleIndex(
					actionCount,
					panelState.detail.selectedActionIndex ?? 0,
					matchesKey(data, "right") ? 1 : -1,
				);
				renderWidget();
				return { consume: true };
			}
			if (
				!panelState.detail &&
				(matchesKey(data, "left") ||
					matchesKey(data, "right") ||
					matchesKey(data, "up") ||
					matchesKey(data, "down"))
			) {
				if (panelState.section === "home") {
					const issueCount = snapshot
						? buildHomeIssues(
								snapshot.state,
								snapshot.report,
								snapshot.roadmapState,
								panelState.activeLink,
							).length
						: 1;
					if (matchesKey(data, "up"))
						panelState.homeIssueIndex = Math.max(
							0,
							panelState.homeIssueIndex - 1,
						);
					if (matchesKey(data, "down"))
						panelState.homeIssueIndex = Math.min(
							Math.max(0, issueCount - 1),
							panelState.homeIssueIndex + 1,
						);
				} else if (panelState.section === "product" || panelState.section === "system") {
					if (matchesKey(data, "up") || matchesKey(data, "left"))
						panelState.wikiRowIndex = Math.max(0, panelState.wikiRowIndex - 1);
					if (matchesKey(data, "down") || matchesKey(data, "right"))
						panelState.wikiRowIndex += 1;
				} else if (panelState.section === "roadmap") {
					if (matchesKey(data, "left"))
						panelState.roadmapColumnIndex = cycleIndex(
							Math.max(1, roadmapColumns.length),
							panelState.roadmapColumnIndex,
							-1,
						);
					if (matchesKey(data, "right"))
						panelState.roadmapColumnIndex = cycleIndex(
							Math.max(1, roadmapColumns.length),
							panelState.roadmapColumnIndex,
							1,
						);
					if (matchesKey(data, "up"))
						panelState.roadmapRowIndex = Math.max(
							0,
							panelState.roadmapRowIndex - 1,
						);
					if (matchesKey(data, "down")) panelState.roadmapRowIndex += 1;
				} else if (panelState.section === "graph") {
					if (matchesKey(data, "up") || matchesKey(data, "left")) panelState.graphRowIndex = Math.max(0, (panelState.graphRowIndex ?? 0) - 1);
					if (matchesKey(data, "down") || matchesKey(data, "right")) panelState.graphRowIndex = (panelState.graphRowIndex ?? 0) + 1;
				} else if (panelState.section === "diff") {
					if (matchesKey(data, "up") || matchesKey(data, "left")) panelState.diffRowIndex = Math.max(0, (panelState.diffRowIndex ?? 0) - 1);
					if (matchesKey(data, "down") || matchesKey(data, "right")) panelState.diffRowIndex = (panelState.diffRowIndex ?? 0) + 1;
				}
				renderWidget();
				return { consume: true };
			}
			if (!panelState.detail && panelState.section === "diff" && ["a", "x", "d", "p"].includes(data.toLowerCase())) {
				const diff = readDiffTablePanelData(panelState.project);
				const row = diff.rows[panelState.diffRowIndex ?? 0];
				if (!row || row.readOnly) {
					ui.notify?.("No editable pending diff row selected.", "warning");
					return { consume: true };
				}
				if (data.toLowerCase() === "p") {
					void (async () => {
						const alternative = (await ui.input?.("Alternative desired state", row.desired))?.trim();
						if (alternative) updateRuntimeDiffRow(panelState.project, row.tableId, row.rowId, "edited", alternative);
						renderWidget();
					})().catch((error: unknown) => ui.notify?.(error instanceof Error ? error.message : String(error), "error"));
					return { consume: true };
				}
				const action = data.toLowerCase() === "a" ? "approved" : data.toLowerCase() === "x" ? "rejected" : "deferred";
				updateRuntimeDiffRow(panelState.project, row.tableId, row.rowId, action as any);
				renderWidget();
				return { consume: true };
			}
			if (data.toLowerCase() === "r") {
				void (async () => {
					const nextRoot = await choosePinnedRepoRoot(
						ctx,
						await readStatusDockPrefs(),
					);
					if (!nextRoot) return;
					panelState.project = (await loadProject(nextRoot)) as any;
					panelState.source = "pinned";
					panelState.activeLink = currentTaskLink(ctx);
					panelState.detail = null;
					await rememberStatusDockProject(panelState.project);
					renderWidget();
				})().catch((error: unknown) =>
					ctx.ui.notify(
						error instanceof Error ? error.message : String(error),
						"error",
					),
				);
				return { consume: true };
			}
			if (matchesKey(data, "enter") || data === " ") {
				if (!snapshot) return { consume: true };
				if (
					panelState.detail?.kind === "roadmap" &&
					panelState.detail.taskId &&
					panelState.detail.actions?.length
				) {
					const selectedAction =
						panelState.detail.actions[
							panelState.detail.selectedActionIndex ?? 0
						]?.id;
					if (selectedAction === "resume") {
                        // TODO: call wiki-resume command
                        ctx.ui.notify("Use /wiki-resume " + panelState.detail.taskId, "info");
						return { consume: true };
					}
					if (selectedAction === "block") {
						void (async () => {
							const task =
								snapshot.roadmapState?.tasks?.[panelState.detail?.taskId ?? ""];
							if (!task) return;
							const summary =
								(
									await ui.input?.(
										"Block reason",
										taskLoopEvidenceLine(task) ||
											"Blocked from status detail pane.",
									)
								)?.trim() || "Blocked from status detail pane.";
							await updateTaskLoop(panelState.project, {
								taskId: task.id,
								action: "block",
								summary,
							});
							panelState.detail = buildRoadmapTaskDetail(
								(
									await maybeReadRoadmapState(
										panelState.project.roadmapStatePath,
									)
								)?.tasks?.[task.id] ?? task,
							);
							await refreshStatusDock(
								panelState.project,
								ctx,
								currentTaskLink(ctx),
							);
							renderWidget();
						})().catch((error: unknown) =>
							ui.notify(
								error instanceof Error ? error.message : String(error),
								"error",
							),
						);
						return { consume: true };
					}
				}
				if (panelState.section === "home") {
					const issues = buildHomeIssues(
						snapshot.state,
						snapshot.report,
						snapshot.roadmapState,
						panelState.activeLink,
					);
					const issue = issues[panelState.homeIssueIndex];
					if (issue)
						openStatusPanelDetail(panelState, {
							kind: "home",
							title: issue.title,
							lines: [
								`Impact: ${issue.impact}`,
								`Recommended: ${issue.recommended}`,
								"",
								...issue.detail,
							],
						});
				} else if (panelState.section === "product") {
					const productPathOrder = [
						".codewiki/kb/product/users/maintainers.md",
						".codewiki/kb/product/users/agents.md",
						".codewiki/kb/product/users/package-authors.md",
						".codewiki/kb/product/users/external-users.md",
						".codewiki/kb/product/stories/intent.md",
						".codewiki/kb/product/stories/navigation.md",
						".codewiki/kb/product/stories/automation.md",
						".codewiki/kb/product/stories/drift.md",
						".codewiki/kb/product/uis/control-room.md",
						".codewiki/kb/product/uis/status-panel.md",
						".codewiki/kb/product/uis/board.md",
						".codewiki/kb/product/uis/graph-navigation.md",
					];
                    const productRows = productPathOrder
                        .map((path) => snapshot.state.specs.find((row) => row.path === path))
                        .filter((row): row is StatusStateSpecRow => Boolean(row));
					const row = productRows[panelState.wikiRowIndex];
					if (row) {
						const preview = wikiMarkdownPreview(panelState.project, row.path);
						openStatusPanelDetail(panelState, {
							kind: "wiki",
							title: row.title || row.path,
							lines: [`Spec: ${row.path}`, "", row.summary || row.note || "No extra detail.", ...(preview.length ? ["", "Markdown preview:", ...preview] : [])],
						});
					}
				} else if (panelState.section === "system") {
					const diagrams = readSystemDiagramCatalog(panelState.project);
					const diagram = diagrams[panelState.wikiRowIndex];
					if (diagram) {
						openStatusPanelDetail(panelState, {
							kind: "diagram",
							title: diagram.title,
							lines: [`Diagram: ${diagram.kind}`, `Spec: ${diagram.path}`, "", diagram.purpose],
						});
					} else {
						const architecture = readArchitecturePanelData(panelState.project);
						const component = architecture.components[panelState.wikiRowIndex];
						if (component?.path) {
							const preview = wikiMarkdownPreview(panelState.project, component.path);
							openStatusPanelDetail(panelState, {
								kind: "wiki",
								title: component.label || component.id,
								lines: [`Component: ${component.id}`, `Spec: ${component.path}`, "", component.summary || "No summary.", ...(preview.length ? ["", "Markdown preview:", ...preview] : [])],
							});
						}
					}
				} else if (panelState.section === "roadmap") {
					const taskId =
						roadmapColumns[panelState.roadmapColumnIndex]?.task_ids?.[
							panelState.roadmapRowIndex
						];
					const task = taskId ? snapshot.roadmapState?.tasks?.[taskId] : null;
					if (task)
						openStatusPanelDetail(panelState, buildRoadmapTaskDetail(task));
				} else if (panelState.section === "graph") {
					const graph = readGraphPanelData(panelState.project);
					const rows = [...graph.scopeLines, ...graph.dagEdges.map((edge) => `${edge.label}: ${edge.from} → ${edge.to}`), ...graph.issues.map((issue) => `drift: ${issue}`)];
					const line = rows[panelState.graphRowIndex ?? 0];
					if (line) openStatusPanelDetail(panelState, { kind: "graph", title: "Graph row", lines: [line, "", `Next: ${graph.nextAction.command || graph.nextAction.active_loop || "observe"}`] });
				} else if (panelState.section === "diff") {
					const diff = readDiffTablePanelData(panelState.project);
					const row = diff.rows[panelState.diffRowIndex ?? 0];
					if (row) openStatusPanelDetail(panelState, { kind: "diff", title: `${row.tableId}/${row.rowId}`, lines: [`Status: ${row.status}${row.readOnly ? " (read-only)" : ""}`, `Risk: ${row.risk}`, "", `Current: ${row.current}`, "", `Desired: ${row.desired}`, ...(row.alternatives.length ? ["", "Alternatives:", ...row.alternatives] : [])] });
				}
				renderWidget();
				return { consume: true };
			}
			return undefined;
		}) ?? null;

	return true;
}

export function liveRoadmapColumns(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
): StatusStateRoadmapColumn[] {
	const seededColumns: StatusStateRoadmapColumn[] = (
		state.roadmap?.columns?.length
			? state.roadmap.columns
			: [
					{ id: "todo", label: "Todo", task_ids: [] },
					{ id: "implement", label: "Implement", task_ids: [] },
					{ id: "done", label: "Done", task_ids: [] },
				]
	).map((column) => ({ ...column, task_ids: [...(column.task_ids ?? [])] }));
	const orderedTaskIds = roadmapState?.views?.ordered_task_ids ?? [];
	if (orderedTaskIds.length === 0) return seededColumns;
	const columns = seededColumns.map((column) => ({
		...column,
		task_ids: [] as string[],
	}));
	for (const taskId of orderedTaskIds) {
		const task = roadmapState?.tasks?.[taskId];
		if (!task || task.status === "cancelled") continue;
		const stage = taskBoardColumn(task);
		const column = columns.find((item) => item.id === stage) ?? columns[0]!;
		column.task_ids.push(task.id);
	}
	return columns;
}
