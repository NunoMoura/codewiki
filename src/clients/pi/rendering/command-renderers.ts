import { truncateToWidth, visibleWidth } from "./width.ts";
import type { BootstrapResult } from "../../../project/bootstrap.ts";
import { CODEWIKI_DIRECT_COMMANDS } from "../command-catalog.ts";
import type { CodewikiExtensionIdentity } from "../identity.ts";
import type { ProjectExplainView } from "../../../project/explain.ts";
import type { WikiConfigFileResult } from "../../../project/config-file.ts";
import type { RunWikiConfigResult } from "../../../project/config.ts";
import type {ResumeView} from "../../../project-server/queries/projection-types.ts";

export interface CommandRenderOptions {
	width?: number;
	maxColumnWidth?: number;
	minColumnWidth?: number;
	extensionIdentity?: CodewikiExtensionIdentity;
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
		truncateToWidth(`CodeWiki Explain — ${view.title}`, width),
		"",
		truncateToWidth(view.summary || "No summary available.", width),
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
	const identityRows = options.extensionIdentity
		? [
				["Extension", options.extensionIdentity.sourceLabel],
				["Version", options.extensionIdentity.version],
				["Package", options.extensionIdentity.packageRoot || "unknown"],
				["Entry", options.extensionIdentity.entry],
			]
		: [["Extension", "CodeWiki loaded in Pi ✓"]];
	return [
		"✓ CodeWiki ready",
		"",
		"Project",
		"",
		...tableLines(
			["Field", "Value"],
			[
				["Root", result.repoRoot],
				["Project", result.project],
				["State", bootstrapState(result)],
				...identityRows,
				["Mutation", "enabled, guarded by expected-byte checks"],
			],
			options,
		),
		"",
		"Bootstrap",
		"",
		...tableLines(
			["Action", "Count", "Meaning"],
			[
				["Created", String(result.created.length), "New CodeWiki files added"],
				[
					"Updated",
					String(result.updated.length),
					"Existing scaffold files refreshed",
				],
				["Skipped", String(result.skipped.length), "Files already current"],
				[
					"Preserved",
					String(result.preserved.length),
					"Local project files left untouched",
				],
				[
					"Stale",
					String(result.audit.staleRoots.length),
					"Deprecated roots found",
				],
			],
			options,
		),
		...pathTableSection(
			"Preserved files",
			["Path", "Reason"],
			result.preserved.map((path) => [path, preservedReason(path)]),
			options,
		),
		...pathTableSection(
			"Stale roots",
			["Path", "Recommended action"],
			result.audit.staleRoots.map((path) => [
				path,
				"Review or archive; not active CodeWiki state",
			]),
			options,
		),
		"",
		"Next",
		"• You are ready: just start working on the project.",
		"• Ask the agent for the feature, fix, or question you want to tackle.",
		"• Available slash commands:",
		...CODEWIKI_DIRECT_COMMANDS.map(
			(command) => `  /${command.name} — ${command.description}`,
		),
	];
}

function bootstrapState(result: BootstrapResult): string {
	if (result.audit.existing.codewiki)
		return "existing CodeWiki project detected";
	if (result.brownfield) return "brownfield project detected";
	return "new CodeWiki project initialized";
}

function preservedReason(path: string): string {
	if (path === ".codewiki/config.json") return "Existing project config";
	if (path === ".codewiki/kb") return "Local knowledge base";
	if (path === ".codewiki/traces") return "Workflow trace history";
	if (path === ".codewiki/views") return "Disposable generated views";
	return "Existing local project file";
}

function pathTableSection(
	title: string,
	headers: string[],
	rows: string[][],
	options: CommandRenderOptions,
): string[] {
	if (rows.length === 0) return ["", title, "• none"];
	return ["", title, "", ...tableLines(headers, rows, options)];
}

function tableLines(
	headers: string[],
	rows: string[][],
	options: CommandRenderOptions,
): string[] {
	const safeRows = rows.length ? rows : [headers.map(() => "—")];
	const maxColumnWidth = options.maxColumnWidth
		? Math.max(1, options.maxColumnWidth)
		: Number.POSITIVE_INFINITY;
	const widths = fitColumnWidths(
		headers.map((header, index) =>
			Math.min(
				maxColumnWidth,
				Math.max(
					visibleWidth(header),
					...safeRows.map((row) => visibleWidth(row[index] || "")),
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
		truncateToWidth(title, width),
		...items.map((item) => truncateToWidth(`• ${item}`, width)),
	];
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
	const text = truncateToWidth(value, width);
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
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
	if (typeof options.width !== "number" || !Number.isFinite(options.width)) {
		return undefined;
	}
	return Math.max(1, Math.floor(options.width) - 2);
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
