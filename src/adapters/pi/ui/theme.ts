import type { WikiProject } from "../../../domain/project/types.ts";
import type { TaskSessionLinkRecord } from "../../../domain/session/types.ts";
import type {
	RoadmapStateFile,
	RoadmapStateTaskSummary,
	StatusDockDensity,
	StatusDockMode,
	StatusStateSpecRow,
	StatusDockPrefs,
	StatusPanelSection,
	ConfigPanelSection,
	StatusStateAgentRow,
} from "../../../domain/state/types.ts";
import type { LintReport } from "../../../validation/types.ts";
import { basename } from "node:path";
import { padToWidth, truncatePlain } from "./text.ts";

import {
	roadmapTaskStage,
	taskBoardColumn,
	isTaskBlocked,
} from "../../../application/roadmap.ts";

export {
	roadmapTaskStage,
	taskBoardColumn,
	isTaskBlocked,
};

export function kanbanTaskCircle(
	task: RoadmapStateTaskSummary,
	activeLink: TaskSessionLinkRecord | null,
	tick: number,
): string {
	if (isTaskBlocked(task)) return "🔴";
	if (taskBoardColumn(task) === "done") return "🟢";
	if (isLiveAnimatedTask(task, activeLink)) return activeSpinnerFrame(tick);
	if (taskBoardColumn(task) === "todo") return "⚪";
	return "🟡";
}

export function statusModeChip(mode: StatusDockMode): string {
	return mode === "auto" ? "◉ auto" : mode === "pin" ? "◆ pin" : "○ off";
}

export function densityChip(density: StatusDockDensity): string {
	return density === "minimal"
		? "◔ minimal"
		: density === "standard"
			? "◑ standard"
			: "◕ full";
}

export function statusColor(report: LintReport): "green" | "yellow" | "red" {
	if (report.counts.error > 0) return "red";
	if (report.counts.warning > 0) return "yellow";
	return "green";
}

export function statusLevel(report: LintReport): "info" | "warning" | "error" {
	if (report.counts.error > 0) return "error";
	if (report.counts.warning > 0) return "warning";
	return "info";
}

export function roadmapHealthThemeColor(
	health: "green" | "yellow" | "red" | string,
): string {
	if (health === "green") return "success";
	if (health === "yellow") return "warning";
	if (health === "red") return "error";
	return "text";
}

export function driftThemeColor(
	status: StatusStateSpecRow["drift_status"],
): string {
	if (status === "aligned") return "success";
	if (status === "tracked") return "info";
	if (status === "untracked") return "warning";
	if (status === "blocked") return "error";
	if (status === "unmapped") return "text-dim";
	return "text";
}

export function driftIcon(status: StatusStateSpecRow["drift_status"]): string {
	if (status === "aligned") return "✓";
	if (status === "tracked") return "◑";
	if (status === "untracked") return "○";
	if (status === "blocked") return "!";
	if (status === "unmapped") return "?";
	return " ";
}

export function activeSpinnerFrame(tick: number): string {
	const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	return (
		frames[((tick % frames.length) + frames.length) % frames.length] ?? "⠧"
	);
}

export function isLiveAnimatedTask(
	task: RoadmapStateTaskSummary,
	activeLink: TaskSessionLinkRecord | null,
): boolean {
	return (
		task.status === "in_progress" ||
		(activeLink?.action !== "clear" && activeLink?.action !== "done")
	);
}

export function roadmapColumnLabel(status: string): string {
	if (status === "todo") return "Todo";
	if (status === "done") return "Done";
	return "Implement";
}

export function formatStatusConfigSummary(prefs: StatusDockPrefs): string {
	return [
		"Codewiki config",
		`Summary mode: ${prefs.mode}`,
		`Panel density: ${prefs.density}`,
		`Pinned repo: ${prefs.pinnedRepoPath ?? "—"}`,
		`Last repo: ${prefs.lastRepoPath ?? "—"}`,
		"Panel toggle: alt+w",
	].join("\n");
}

export function repoShortLabel(path: string | undefined): string {
	if (!path) return "—";
	return `${basename(path)} · ${truncatePlain(path, 28)}`;
}

export function statusSectionTabs(
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	active: StatusPanelSection,
): string {
	const tabs: Array<{ key: StatusPanelSection; label: string }> = [
		{ key: "home", label: "Status" },
		{ key: "product", label: "Product" },
		{ key: "system", label: "System" },
		{ key: "roadmap", label: "Board" },
		{ key: "graph", label: "Graph" },
	];
	return tabs
		.map((tab) =>
			tab.key === active
				? theme.bold(theme.fg("accent", `[${tab.label}]`))
				: theme.fg("text", tab.label),
		)
		.join(theme.fg("muted", " · "));
}

export function configSectionTabs(
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	active: ConfigPanelSection,
): string {
	const tabs: Array<{ key: ConfigPanelSection; label: string }> = [
		{ key: "summary", label: "Summary" },
		{ key: "pinning", label: "Pinning" },
		{ key: "gateway", label: "Gateway" },
	];
	return tabs
		.map((tab) =>
			tab.key === active
				? theme.bold(theme.fg("accent", `[${tab.label}]`))
				: theme.fg("text", tab.label),
		)
		.join(theme.fg("muted", " · "));
}

export function renderChoiceRow(
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	options: string[],
	activeIndex: number,
): string {
	return options
		.map((option, index) =>
			index === activeIndex
				? theme.bold(theme.fg("accent", `[${option}]`))
				: theme.fg("text", option),
		)
		.join(theme.fg("muted", "  "));
}

export function highlightSelectable(
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	text: string,
	selected: boolean,
): string {
	return selected
		? theme.bold(theme.fg("accent", text))
		: theme.fg("text", text);
}

export function detailHint(detail: any): string {
	if (!detail) return "—";
	return detail.title || "—";
}

export function healthCircle(color: string): string {
	if (color === "green") return "🟢";
	if (color === "yellow") return "🟡";
	if (color === "red") return "🔴";
	return "⚪";
}

export function frameDockLines(
	lines: string[],
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	width: number,
	borderColor: string = "accent",
): string[] {
	const top = theme.fg(borderColor, `┌${"─".repeat(width - 2)}┐`);
	const bottom = theme.fg(borderColor, `└${"─".repeat(width - 2)}┘`);
	const side = theme.fg(borderColor, "│");

	return [
		top,
		...lines.map((line) => {
			if (line === "__SEP__")
				return theme.fg(borderColor, `├${"─".repeat(width - 2)}┤`);
			return `${side} ${padToWidth(line, width - 4)} ${side}`;
		}),
		bottom,
	];
}

export function renderPinnedTopPanel(
	title: string,
	tabsLine: string,
	bodyLines: string[],
	footerLine: string,
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	width: number,
	titleColor: string = "accent",
): string[] {
	const innerWidth = Math.max(44, width - 4);
	return frameDockLines(
		[
			"",
			truncatePlain(theme.bold(theme.fg(titleColor, title)), innerWidth),
			"",
			truncatePlain(tabsLine, innerWidth),
			"",
			"__SEP__",
			"",
			...bodyLines.map((line) => truncatePlain(line, innerWidth)),
			"",
			"__SEP__",
			"",
			truncatePlain(theme.fg("muted", footerLine), innerWidth),
			"",
		],
		theme,
		width,
		"accent",
	);
}

export function statusDockHeaderLabel(
	project: WikiProject,
	source: string,
	health: string,
): string {
	const sourceIcon = source === "pinned" ? "📌" : "📂";
	return `${sourceIcon} ${project.label} · ${health}`;
}

export function wikiActivityMarker(
	row: StatusStateSpecRow,
	activeLink: TaskSessionLinkRecord | null,
	_roadmapState: RoadmapStateFile | null,
	tick: number,
): string {
	if (activeLink?.taskId && row.path.includes(activeLink.taskId)) return activeSpinnerFrame(tick);
	return driftIcon(row.drift_status);
}

export function agentStatusCircle(status: StatusStateAgentRow["status"]): string {
	if (status === "done") return "🟢";
	if (status === "blocked") return "🔴";
	if (status === "active" || status === "waiting") return "🟡";
	return "⚪";
}
