import type { WikiStateSnapshot } from "../../api/state.ts";
import type { BootstrapResult } from "../../project/bootstrap.ts";
import type { ProjectExplainView } from "../../project/explain.ts";
import type { WikiConfigFileResult } from "../../project/config-file.ts";
import type { RunWikiConfigResult } from "../../project/config.ts";
import type {
	BlockersView,
	QualityView,
	ResumeView,
	WorkQueueItem,
} from "../../views/types.ts";

export type WikiStateCommandView =
	| "summary"
	| "board"
	| "quality"
	| "blockers"
	| "all";

export interface CommandRenderOptions {
	width?: number;
	maxColumnWidth?: number;
	minColumnWidth?: number;
}

export function renderStateCommand(
	snapshot: WikiStateSnapshot,
	view: WikiStateCommandView,
	options: CommandRenderOptions = {},
): string[] {
	if (view === "board") return renderBoard(snapshot.workQueue.items, options);
	if (view === "quality") return renderQuality(snapshot.quality, options);
	if (view === "blockers") return renderBlockers(snapshot.blockers, options);
	if (view === "all") {
		return [
			...renderStateSummary(snapshot, options),
			"",
			...renderBoard(snapshot.workQueue.items, options),
			"",
			...renderQuality(snapshot.quality, options),
			"",
			...renderBlockers(snapshot.blockers, options),
		];
	}
	return renderStateSummary(snapshot, options);
}

export function renderResumeCommand(
	resume: ResumeView | undefined,
	options: CommandRenderOptions = {},
): string[] {
	if (!resume) {
		return [
			"CodeWiki Resume",
			"",
			"Select a trace with --trace to render a resume packet.",
		];
	}
	return [
		"CodeWiki Resume",
		"",
		...tableLines(
			["Next", "Loop", "Active work"],
			[
				[
					resume.nextAction,
					resume.currentLoop || "—",
					resume.activeWorkUnitId || "—",
				],
			],
			options,
		),
		...section(
			"Blockers",
			resume.blockers.length ? resume.blockers : ["none"],
			options,
		),
		...section(
			"Quality",
			resume.qualityBlockers.length ? resume.qualityBlockers : ["all clear"],
			options,
		),
	];
}

export function renderExplainCommand(
	view: ProjectExplainView,
	options: CommandRenderOptions = {},
): string[] {
	const width = renderWidth(options);
	return [
		truncate(`CodeWiki Explain — ${view.title}`, width),
		"",
		truncate(view.summary || "No summary available.", width),
		...view.sections.flatMap((item) =>
			section(item.title, item.items, options),
		),
		...section("Refs", view.refs, options),
	];
}

export function renderConfigCommand(
	result: WikiConfigFileResult | RunWikiConfigResult,
	options: CommandRenderOptions = {},
): string[] {
	return [
		"CodeWiki Config",
		"",
		...tableLines(
			["Project", "Automation", "Workers"],
			[
				[
					result.config.project,
					result.config.runtime.automation,
					String(result.config.runtime.maxWorkers),
				],
			],
			options,
		),
	];
}

export function renderBootstrapCommand(
	result: BootstrapResult,
	options: CommandRenderOptions = {},
): string[] {
	return [
		"CodeWiki Bootstrap",
		"",
		...tableLines(
			["Created", "Updated", "Skipped", "Preserved"],
			[
				[
					String(result.created.length),
					String(result.updated.length),
					String(result.skipped.length),
					String(result.preserved.length),
				],
			],
			options,
		),
		...section(
			"Stale roots",
			result.audit.staleRoots.length ? result.audit.staleRoots : ["none"],
			options,
		),
	];
}

function renderStateSummary(
	snapshot: WikiStateSnapshot,
	options: CommandRenderOptions,
): string[] {
	const queue = snapshot.workQueue.summary;
	return [
		"CodeWiki State",
		"",
		...tableLines(
			["Traces", "Ready", "Blocked", "Done"],
			[
				[
					String(snapshot.traceIds.length),
					String(queue.ready),
					String(queue.blocked),
					String(queue.done),
				],
			],
			options,
		),
		...section(
			"Next",
			[snapshot.resume?.nextAction || "Run /wiki resume."],
			options,
		),
	];
}

function renderBoard(
	items: WorkQueueItem[],
	options: CommandRenderOptions,
): string[] {
	const todo = items
		.filter((item) =>
			["backlog", "waiting", "ready", "blocked"].includes(item.status),
		)
		.map(itemLabel);
	const doing = items
		.filter((item) => item.status === "claimed")
		.map(itemLabel);
	const done = items.filter((item) => item.status === "done").map(itemLabel);
	return ["CodeWiki Board", "", ...boardTable({ todo, doing, done }, options)];
}

function renderQuality(
	quality: QualityView | undefined,
	options: CommandRenderOptions,
): string[] {
	if (!quality) {
		return [
			"CodeWiki Quality",
			"",
			"Select a trace with --trace to render loop quality.",
		];
	}
	return [
		"CodeWiki Quality",
		"",
		...tableLines(
			["Loop", "Met", "Unmet", "Blocked"],
			(["decision", "planning", "implementation"] as const).map((loop) => [
				loop,
				String(quality.summary[loop].met),
				String(quality.summary[loop].unmet + quality.summary[loop].missing),
				String(quality.summary[loop].blocked),
			]),
			options,
		),
		...section(
			"Blockers",
			quality.blockers.length ? quality.blockers : ["none"],
			options,
		),
	];
}

function renderBlockers(
	blockers: BlockersView | undefined,
	options: CommandRenderOptions,
): string[] {
	const items = blockers?.blockers || [];
	return [
		"CodeWiki Blockers",
		"",
		...tableLines(
			["Kind", "Owner", "Message"],
			items.length
				? items.map((item) => [item.kind, item.ownerRef, item.message])
				: [["—", "—", "none"]],
			options,
		),
	];
}

function boardTable(
	columns: {
		todo: string[];
		doing: string[];
		done: string[];
	},
	options: CommandRenderOptions,
): string[] {
	const height = Math.max(
		1,
		columns.todo.length,
		columns.doing.length,
		columns.done.length,
	);
	const rows = Array.from({ length: height }, (_, index) => [
		columns.todo[index] || "",
		columns.doing[index] || "",
		columns.done[index] || "",
	]);
	return tableLines(["To do", "Doing", "Done"], rows, options);
}

function tableLines(
	headers: string[],
	rows: string[][],
	options: CommandRenderOptions,
): string[] {
	const safeRows = rows.length ? rows : [headers.map(() => "—")];
	const maxColumnWidth = Math.max(1, options.maxColumnWidth ?? 34);
	const widths = fitColumnWidths(
		headers.map((header, index) =>
			Math.min(
				maxColumnWidth,
				Math.max(
					visibleLength(header),
					...safeRows.map((row) => visibleLength(row[index] || "")),
				),
			),
		),
		options,
	);
	return [
		border("┌", "┬", "┐", widths),
		rowLine(headers, widths),
		border("├", "┼", "┤", widths),
		...safeRows.map((row) => rowLine(row, widths)),
		border("└", "┴", "┘", widths),
	];
}

function section(
	title: string,
	items: string[],
	options: CommandRenderOptions,
): string[] {
	const width = renderWidth(options);
	return [
		"",
		truncate(title, width),
		...items.map((item) => truncate(`• ${item}`, width)),
	];
}

function itemLabel(item: WorkQueueItem): string {
	return `${item.id} ${item.title}`.trim();
}

function border(left: string, join: string, right: string, widths: number[]) {
	return `${left}${widths.map((width) => "─".repeat(width + 2)).join(join)}${right}`;
}

function rowLine(row: string[], widths: number[]): string {
	return `│ ${widths
		.map((width, index) => padCell(row[index] || "", width))
		.join(" │ ")} │`;
}

function padCell(value: string, width: number): string {
	const text = truncate(value, width);
	return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function fitColumnWidths(
	inputWidths: number[],
	options: CommandRenderOptions,
): number[] {
	const width = renderWidth(options);
	if (!width) return inputWidths;
	const overhead = inputWidths.length * 3 + 1;
	const available = width - overhead;
	if (available <= 0) return inputWidths.map(() => 1);
	const minWidth = Math.max(
		1,
		Math.min(
			options.minColumnWidth ?? 3,
			Math.floor(available / inputWidths.length),
		),
	);
	const widths = [...inputWidths];
	while (sum(widths) > available) {
		let widestIndex = -1;
		for (let index = 0; index < widths.length; index++) {
			if (widths[index] <= minWidth) continue;
			if (widestIndex === -1 || widths[index] > widths[widestIndex]) {
				widestIndex = index;
			}
		}
		if (widestIndex === -1) break;
		widths[widestIndex] -= 1;
	}
	return widths;
}

function renderWidth(options: CommandRenderOptions): number | undefined {
	return typeof options.width === "number" && Number.isFinite(options.width)
		? Math.max(1, Math.floor(options.width))
		: undefined;
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function truncate(value: string, width: number | undefined): string {
	if (width === undefined) return value;
	if (width < 1) return "";
	if (visibleLength(value) <= width) return value;
	return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function visibleLength(value: string): number {
	return value.length;
}
