import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import {
	access,
	appendFile,
	mkdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import {
	DynamicBorder,
	getMarkdownTheme,
	getSettingsListTheme,
} from "@mariozechner/pi-coding-agent";
import {
	Container,
	Markdown,
	matchesKey,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";
import { registerBootstrapFeatures } from "./bootstrap";
import {
	type ActiveConfigPanel,
	type ActiveStatusPanel,
	CODEWIKI_STATE_SECTION_VALUES,
	type CodeDriftScopeConfig,
	type CodewikiSessionToolInput,
	type CodewikiStateSection,
	type CodewikiStateToolInput,
	type CodewikiTaskEvidenceInput,
	type CodewikiTaskPatchInput,
	type CodewikiTaskToolInput,
	type ConfigPanelSection,
	codewikiSessionToolInputSchema,
	codewikiStateToolInputSchema,
	codewikiTaskToolInputSchema,
	type DocsConfig,
	type GraphFile,
	type LintReport,
	type ResolvedStatusDockProject,
	ROADMAP_PRIORITY_VALUES,
	ROADMAP_STATUS_VALUES,
	type RoadmapFile,
	type RoadmapPriority,
	type RoadmapStateFile,
	type RoadmapStateHealth,
	type RoadmapStateTaskSummary,
	type RoadmapStatus,
	type RoadmapTaskContextPacket,
	type RoadmapTaskGoal,
	type RoadmapTaskInput,
	type RoadmapTaskRecord,
	type RoadmapTaskUpdateInput,
	type ScopeConfig,
	STATUS_DOCK_DENSITY_VALUES,
	STATUS_DOCK_MODE_VALUES,
	STATUS_SCOPE_VALUES,
	type StatusDockDensity,
	type StatusDockMode,
	type StatusDockPrefs,
	type StatusPanelDetail,
	type StatusPanelSection,
	type StatusScope,
	type StatusStateAgentRow,
	type StatusStateBar,
	type StatusStateChannelRow,
	type StatusStateFile,
	type StatusStateHeartbeatLane,
	type StatusStateParallelSession,
	type StatusStateRoadmapColumn,
	type StatusStateSpecRow,
	type StatusStateWikiSection,
	TASK_EVIDENCE_RESULT_VALUES,
	TASK_PHASE_VALUES,
	TASK_SESSION_ACTION_VALUES,
	type TaskEvidenceResult,
	type TaskLoopUpdateInput,
	type TaskPhase,
	type TaskSessionAction,
	type TaskSessionLinkInput,
	type TaskSessionLinkRecord,
	TOOL_TASK_STATUS_VALUES,
	type ToolTaskStatus,
	type WikiProject,
} from "./contracts";
import { withLockedPaths } from "./mutation-queue";
import {
	findWikiRootsBelow,
	PREFERRED_WIKI_CONFIG_RELATIVE_PATH,
	requireWikiRoot,
	resolveWikiConfigPath,
} from "./project-root";

const execFileAsync = promisify(execFile);
const DEFAULT_DOCS_ROOT = "wiki";
const DEFAULT_SPECS_ROOT = "wiki";
const DEFAULT_EVIDENCE_ROOT = ".wiki/evidence";
const DEFAULT_INDEX_PATH: string | null = null;
const DEFAULT_ROADMAP_PATH = ".wiki/roadmap.json";
const DEFAULT_ROADMAP_DOC_PATH: string | null = null;
const DEFAULT_ROADMAP_EVENTS_PATH = ".wiki/roadmap-events.jsonl";
const DEFAULT_META_ROOT = ".wiki";
const DEFAULT_REBUILD_SCRIPT = "scripts/rebuild_docs_meta.py";
const GENERATED_METADATA_FILES = [
	"graph.json",
	"lint.json",
	"roadmap-state.json",
	"status-state.json",
	"roadmap/index.json",
	"roadmap/state.json",
	"roadmap/events.jsonl",
] as const;
const TASK_SESSION_LINK_CUSTOM_TYPE = "codewiki.task-link";
const STATUS_DOCK_WIDGET_KEY = "codewiki-status-dock";
const STATUS_SUMMARY_STATUS_KEY = "codewiki-status";
const STATUS_DOCK_MAX_VISIBLE_SPECS = 3;
const STATUS_DOCK_MAX_VISIBLE_TASKS = 2;
const STATUS_DOCK_PREFS_VERSION = 1;
const STATUS_DOCK_PREFS_ENV = "PI_CODEWIKI_STATUS_PREFS_PATH";
let activeStatusPanelGlobal: ActiveStatusPanel | null = null;
let activeStatusPanelInputUnsubscribe: (() => void) | null = null;
let activeConfigPanelClose: (() => void) | null = null;
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
] as const;
const COMMAND_PREFIX = "wiki";
const CANONICAL_TASK_ID_PREFIX = "TASK";
const LEGACY_TASK_ID_PREFIX = "ROADMAP";
const TASK_ID_PATTERN = /^(TASK|ROADMAP)-(\d+)$/;
export default function codewikiExtension(pi: ExtensionAPI) {
	registerBootstrapFeatures(pi);
	let activeStatusPanel: ActiveStatusPanel | null = activeStatusPanelGlobal;

	pi.on("turn_start", async (_event, ctx) => {
		const resolved = await resolveStatusDockProject(ctx);
		if (!resolved) {
			clearStatusDock(ctx);
			return;
		}
		await withUiErrorHandling(ctx, async () => {
			await refreshStatusDock(
				resolved.project,
				ctx,
				currentTaskLink(ctx),
				resolved,
			);
		});
	});

	pi.on("session_start", async (_event, ctx) => {
		const resolved = await resolveStatusDockProject(ctx);
		if (!resolved) {
			ctx.ui.setStatus("codewiki-task", undefined);
			clearStatusDock(ctx);
			return;
		}

		await withUiErrorHandling(ctx, async () => {
			const active = currentTaskLink(ctx);
			if (!active) {
				ctx.ui.setStatus("codewiki-task", undefined);
				await refreshStatusDock(resolved.project, ctx, active, resolved);
				return;
			}
			const task = await readRoadmapTask(resolved.project, active.taskId);
			if (task) setTaskSessionStatus(ctx, task.id, task.title, active.action);
			await refreshStatusDock(resolved.project, ctx, active, resolved);
		});
	});

	pi.registerCommand(`${COMMAND_PREFIX}-config`, {
		description:
			"Configure Codewiki status summary and panel behavior. Usage: /wiki-config [show|auto|pin|off|minimal|standard|full] [repo-path]",
		getArgumentCompletions: (prefix) =>
			completeCommandOptions(prefix, [
				"show",
				...STATUS_DOCK_MODE_VALUES,
				...STATUS_DOCK_DENSITY_VALUES,
			]),
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				const input = parseConfigCommandInput(args);
				const prefs = await readStatusDockPrefs();
				if (input.kind === "show") {
					const resolved = await resolveStatusDockProject(ctx, {
						allowWhenOff: true,
					});
					if (resolved) {
						await rememberStatusDockProject(resolved.project);
						await refreshStatusDock(
							resolved.project,
							ctx,
							currentTaskLink(ctx),
							resolved,
						);
					}
					const opened = await openConfigPanel(ctx);
					if (!opened) {
						if (!resolved) {
							ctx.ui.notify(
								`No codewiki project resolved. Use /${COMMAND_PREFIX}-bootstrap first or work inside a repo with .wiki/config.json.`,
								"warning",
							);
							return;
						}
						ctx.ui.notify(formatStatusConfigSummary(prefs), "info");
					}
					return;
				}
				if (input.density) {
					const nextPrefs = { ...prefs, density: input.density };
					await writeStatusDockPrefs(nextPrefs);
					if (activeStatusPanel) {
						activeStatusPanel.density = input.density;
						activeStatusPanel.requestRender?.();
					}
					const resolved = await resolveStatusDockProject(ctx);
					if (resolved)
						await refreshStatusDock(
							resolved.project,
							ctx,
							currentTaskLink(ctx),
							resolved,
						);
					else clearStatusDock(ctx);
					ctx.ui.notify(
						`Status panel density set to ${input.density}.`,
						"info",
					);
					return;
				}
				if (input.mode === "off") {
					const nextPrefs = { ...prefs, mode: "off" as StatusDockMode };
					await writeStatusDockPrefs(nextPrefs);
					clearStatusDock(ctx);
					ctx.ui.notify("Status summary hidden.", "info");
					return;
				}
				if (input.mode === "auto") {
					const nextPrefs = { ...prefs, mode: "auto" as StatusDockMode };
					await writeStatusDockPrefs(nextPrefs);
					const resolved = await resolveStatusDockProject(ctx);
					if (resolved)
						await refreshStatusDock(
							resolved.project,
							ctx,
							currentTaskLink(ctx),
							resolved,
						);
					else clearStatusDock(ctx);
					ctx.ui.notify("Status summary set to auto mode.", "info");
					return;
				}
				const project = await resolveCommandProject(
					ctx,
					input.pathArg,
					`${COMMAND_PREFIX}-config`,
				);
				const nextPrefs = {
					...prefs,
					mode: "pin" as StatusDockMode,
					pinnedRepoPath: project.root,
				};
				await writeStatusDockPrefs(nextPrefs);
				await refreshStatusDock(project, ctx, currentTaskLink(ctx), {
					project,
					statusState: await maybeReadStatusState(project.statusStatePath),
					source: "pinned",
				});
				ctx.ui.notify(`Status summary pinned to ${project.root}.`, "info");
			});
		},
	});

	pi.registerCommand(`${COMMAND_PREFIX}-status`, {
		description:
			"Open Codewiki project status panel. Usage: /wiki-status [repo-path]",
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				const pathArg = args.trim() || null;
				const project = pathArg
					? await resolveCommandProject(
							ctx,
							pathArg,
							`${COMMAND_PREFIX}-status`,
						)
					: (await resolveStatusDockProject(ctx, { allowWhenOff: true }))
							?.project;
				const source: "cwd" | "pinned" = pathArg
					? "cwd"
					: ((await resolveStatusDockProject(ctx, { allowWhenOff: true }))
							?.source ?? "cwd");
				if (!project) {
					ctx.ui.notify(
						`No codewiki project resolved. Use /${COMMAND_PREFIX}-bootstrap first or work inside a repo with .wiki/config.json.`,
						"warning",
					);
					return;
				}
				await rememberStatusDockProject(project);
				await refreshStatusDock(project, ctx, currentTaskLink(ctx));
				const opened = await openStatusPanel(
					pi,
					project,
					ctx,
					"both",
					currentTaskLink(ctx),
					source,
					(activeStatusPanelRef) => {
						activeStatusPanel = activeStatusPanelRef;
						activeStatusPanelGlobal = activeStatusPanelRef;
					},
					"wiki",
				);
				if (!opened) {
					const state = await maybeReadStatusState(project.statusStatePath);
					const report = await maybeReadJson<LintReport>(project.lintPath);
					const roadmapState = await maybeReadRoadmapState(
						project.roadmapStatePath,
					);
					if (state && report)
						ctx.ui.notify(
							buildStatusText(
								project,
								state,
								report,
								"both",
								roadmapState,
								currentTaskLink(ctx),
							),
							"info",
						);
					else
						ctx.ui.notify(
							"Custom UI unavailable. Use codewiki_state output or configure Pi UI mode.",
							"warning",
						);
				}
			});
		},
	});

	pi.registerShortcut("alt+w", {
		description: "Toggle Codewiki status panel",
		handler: async (ctx) => {
			await withUiErrorHandling(ctx, async () => {
				if (activeStatusPanel?.close) {
					activeStatusPanel.close();
					activeStatusPanel = activeStatusPanelGlobal;
					return;
				}
				const resolved = await resolveStatusDockProject(ctx, {
					allowWhenOff: true,
				});
				if (!resolved) {
					ctx.ui.notify(
						`No codewiki project resolved. Use /${COMMAND_PREFIX}-bootstrap first or work inside a repo with .wiki/config.json.`,
						"warning",
					);
					return;
				}
				await rememberStatusDockProject(resolved.project);
				await refreshStatusDock(
					resolved.project,
					ctx,
					currentTaskLink(ctx),
					resolved,
				);
				const opened = await openStatusPanel(
					pi,
					resolved.project,
					ctx,
					"both",
					currentTaskLink(ctx),
					resolved.source,
					(activeStatusPanelRef) => {
						activeStatusPanel = activeStatusPanelRef;
						activeStatusPanelGlobal = activeStatusPanelRef;
					},
				);
				if (!opened)
					ctx.ui.notify(
						"Custom UI unavailable. Use codewiki_state output or configure Pi UI mode.",
						"warning",
					);
			});
		},
	});

	pi.registerCommand(`${COMMAND_PREFIX}-resume`, {
		description:
			"Resume roadmap work from current task focus or next open task. Usage: /wiki-resume [TASK-###] [repo-path]",
		handler: async (args, ctx) => {
			await withUiErrorHandling(ctx, async () => {
				await runResumeCommand(pi, "wiki-resume", args, ctx);
			});
		},
	});

	pi.registerTool({
		name: "codewiki_state",
		label: "Codewiki State",
		description:
			"Read graph-first codewiki state, optionally rebuild derived files, and return a structured repo/task/session snapshot",
		promptSnippet:
			"Inspect graph-first codewiki state through one structured read entrypoint",
		promptGuidelines: [
			"Use this as primary agent read tool for repo resolution, health, roadmap summary, focused session, and next-step guidance.",
			"Set refresh=true when derived graph/state files may be stale or missing.",
		],
		parameters: codewikiStateToolInputSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"codewiki_state",
			);
			const result = await readCodewikiState(project, ctx, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [
					{ type: "text", text: formatCodewikiStateSummary(project, result) },
				],
				details: result,
			};
		},
	} as any);

	pi.registerTool({
		name: "codewiki_task",
		label: "Codewiki Task",
		description:
			"Create, update, close, or cancel roadmap tasks through one canonical task mutation tool",
		promptSnippet:
			"Mutate canonical roadmap task truth through one create/update/close/cancel entrypoint",
		promptGuidelines: [
			"Use this for all canonical roadmap task mutation: create tasks, update metadata, append evidence, close work, or cancel work.",
			"Prefer evidence.result='pass'|'fail'|'block' when advancing lifecycle with structured execution evidence.",
			"Use action='close' or action='cancel' instead of patching status directly when intent is final closure.",
		],
		parameters: codewikiTaskToolInputSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"codewiki_task",
			);
			const result = await executeCodewikiTask(pi, project, ctx, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);

	pi.registerTool({
		name: "codewiki_session",
		label: "Codewiki Session",
		description:
			"Manage runtime session focus and notes for codewiki without mutating canonical roadmap truth",
		promptSnippet:
			"Manage runtime codewiki session focus and notes separately from canonical roadmap task state",
		promptGuidelines: [
			"Use this when current Pi session focus changes or when you need runtime notes linked to current work.",
			"This tool should not be used to close, cancel, or otherwise mutate canonical roadmap truth.",
		],
		parameters: codewikiSessionToolInputSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const project = await resolveToolProject(
				ctx.cwd,
				params.repoPath,
				"codewiki_session",
			);
			const result = await executeCodewikiSession(pi, project, ctx, params);
			await refreshStatusDock(project, ctx, currentTaskLink(ctx));
			return {
				content: [{ type: "text", text: result.summary }],
				details: result,
			};
		},
	} as any);
}

async function withUiErrorHandling(
	ctx: ExtensionContext,
	action: () => Promise<void>,
): Promise<void> {
	try {
		await action();
	} catch (error) {
		ctx.ui.notify(formatError(error), "error");
	}
}

async function queueAudit(
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
		// Ignore in smoke tests or non-standard execution contexts.
	}
}

function completeCommandOptions(
	prefix: string,
	options: readonly string[],
): { value: string; label: string }[] | null {
	const items = options.filter((item) => item.startsWith(prefix));
	return items.length > 0
		? items.map((value) => ({ value, label: value }))
		: null;
}

function parseConfigCommandInput(args: string):
	| { kind: "show" }
	| {
			kind: "set";
			mode?: StatusDockMode;
			density?: StatusDockDensity;
			pathArg: string | null;
	  } {
	const tokens = splitCommandArgs(args);
	const option = tokens[0] as
		| "show"
		| StatusDockMode
		| StatusDockDensity
		| undefined;
	if (!option || option === "show") return { kind: "show" };
	const rest = joinCommandArgs(tokens.slice(1));
	if (STATUS_DOCK_MODE_VALUES.includes(option as StatusDockMode)) {
		return { kind: "set", mode: option as StatusDockMode, pathArg: rest };
	}
	if (STATUS_DOCK_DENSITY_VALUES.includes(option as StatusDockDensity)) {
		return { kind: "set", density: option as StatusDockDensity, pathArg: rest };
	}
	throw new Error(
		"Invalid wiki-config option. Use show, auto, pin, off, minimal, standard, or full.",
	);
}

function formatStatusConfigSummary(prefs: StatusDockPrefs): string {
	return [
		"Codewiki config",
		`Summary mode: ${prefs.mode}`,
		`Panel density: ${prefs.density}`,
		`Pinned repo: ${prefs.pinnedRepoPath ?? "—"}`,
		`Last repo: ${prefs.lastRepoPath ?? "—"}`,
		"Panel toggle: alt+w",
	].join("\n");
}

function statusModeChip(mode: StatusDockMode): string {
	return mode === "auto" ? "◉ auto" : mode === "pin" ? "◆ pin" : "○ off";
}

function densityChip(density: StatusDockDensity): string {
	return density === "minimal"
		? "◔ minimal"
		: density === "standard"
			? "◑ standard"
			: "◕ full";
}

function repoShortLabel(path: string | undefined): string {
	if (!path) return "—";
	return `${basename(path)} · ${truncateToWidth(path, 28)}`;
}

function configPinnedRepoLabel(prefs: StatusDockPrefs): string {
	return repoShortLabel(prefs.pinnedRepoPath);
}

function cycleIndex(length: number, current: number, delta: number): number {
	if (length <= 0) return 0;
	return (current + delta + length) % length;
}

function statusSectionTabs(
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	active: StatusPanelSection,
): string {
	const tabs: Array<{ key: StatusPanelSection; label: string }> = [
		{ key: "home", label: "Home" },
		{ key: "wiki", label: "Wiki" },
		{ key: "roadmap", label: "Roadmap" },
		{ key: "agents", label: "Agents" },
		{ key: "channels", label: "Channels" },
	];
	return tabs
		.map((tab) =>
			tab.key === active
				? theme.bold(theme.fg("accent", `[${tab.label}]`))
				: theme.fg("text", tab.label),
		)
		.join(theme.fg("muted", " · "));
}

function renderChoiceRow(
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

function highlightSelectable(
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

function detailHint(detail: StatusPanelDetail | null): string {
	if (!detail)
		return "Tab section · arrows move · Enter details · r repo · Alt+W close";
	if (detail.actions?.length) return "Esc back · ←/→ action · Enter run";
	return detail.kind === "channel-add" || detail.kind === "channel-edit"
		? "Esc back · Enter edit/save"
		: "Esc back";
}

function renderStatusDetailWindow(
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
			theme.bold(theme.fg("accent", detail.title)),
			"",
			...actionRow,
			...detail.lines,
		],
		detailHint(detail),
		theme,
		width,
		"accent",
	);
}

function openStatusPanelDetail(
	panelState: ActiveStatusPanel,
	detail: StatusPanelDetail,
): void {
	panelState.detail = detail.actions?.length
		? { ...detail, selectedActionIndex: detail.selectedActionIndex ?? 0 }
		: detail;
	panelState.requestRender?.();
}

function nextStatusPanelSection(
	section: StatusPanelSection,
): StatusPanelSection {
	if (section === "home") return "wiki";
	if (section === "wiki") return "roadmap";
	if (section === "roadmap") return "agents";
	if (section === "agents") return "channels";
	return "home";
}

function buildRoadmapTaskDetail(
	task: RoadmapStateTaskSummary,
): StatusPanelDetail {
	const acceptance = (task.goal.acceptance ?? []).slice(0, 3);
	const verification = (task.goal.verification ?? []).slice(0, 3);
	const specs = (task.spec_paths ?? []).slice(0, 4);
	const code = (task.code_paths ?? []).slice(0, 4);
	const lines = [
		`Status: ${task.status}`,
		`Phase: ${taskLoopPhase(task)}`,
		`Priority: ${task.priority}`,
		`Blocked: ${isTaskBlocked(task) ? "yes" : "no"}`,
		"",
		task.summary || "No summary.",
		"",
		`Outcome: ${task.goal.outcome || "—"}`,
		...(acceptance.length > 0
			? ["Success signals:", ...acceptance.map((item) => `- ${item}`), ""]
			: []),
		...(verification.length > 0
			? ["Verification:", ...verification.map((item) => `- ${item}`), ""]
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

async function runChannelDetailEditor(
	ui: {
		setWidget?: (
			key: string,
			content:
				| ((
						tui: any,
						theme: any,
				  ) => { render: (width: number) => string[]; invalidate: () => void })
				| undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		) => void;
		input?: (
			label: string,
			initialValue?: string,
		) => Promise<string | undefined>;
		notify: (message: string, level?: string) => void;
	},
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
	await writeStoredChannels(nextRows);
	panelState.detail = null;
	panelState.requestRender?.();
}

function configSectionTabs(
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

function buildConfigItems(prefs: StatusDockPrefs): SettingItem[] {
	return [
		{
			id: "summary-mode",
			label: "Status summary · visibility",
			description:
				"Controls the ambient one-line summary. auto = follow current repo or last resolved repo, pin = always show pinned repo, off = hide summary.",
			currentValue: statusModeChip(prefs.mode),
			values: STATUS_DOCK_MODE_VALUES.map((mode) => statusModeChip(mode)),
		},
		{
			id: "panel-density",
			label: "Status panel · density",
			description:
				"Controls how much detail Alt+W shows in the live status panel.",
			currentValue: densityChip(prefs.density),
			values: STATUS_DOCK_DENSITY_VALUES.map((density) => densityChip(density)),
		},
		{
			id: "pinned-repo",
			label: `Repo pinning · target (${configPinnedRepoLabel(prefs)})`,
			description:
				"Open repo-pinning actions. Browse detected repos, pin current repo, enter a path, or clear the pin.",
			currentValue: "actions…",
		},
	];
}

async function discoverPinRepoChoices(
	ctx: ExtensionCommandContext | ExtensionContext,
	prefs: StatusDockPrefs,
): Promise<Array<{ root: string; label: string }>> {
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

async function choosePinnedRepoRoot(
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

async function applyConfigValueChange(
	id: string,
	newValue: string,
	ctx: ExtensionCommandContext | ExtensionContext,
): Promise<void> {
	const prefs = await readStatusDockPrefs();
	if (id === "summary-mode") {
		const nextMode =
			STATUS_DOCK_MODE_VALUES.find(
				(mode) => statusModeChip(mode) === newValue,
			) ?? prefs.mode;
		const nextPrefs = { ...prefs, mode: nextMode };
		await writeStatusDockPrefs(nextPrefs);
		const resolved = await resolveStatusDockProject(ctx);
		if (resolved)
			await refreshStatusDock(
				resolved.project,
				ctx,
				currentTaskLink(ctx),
				resolved,
			);
		else clearStatusDock(ctx);
		ctx.ui.notify(`Summary visibility set to ${nextMode}.`, "info");
		return;
	}
	if (id === "panel-density") {
		const nextDensity =
			STATUS_DOCK_DENSITY_VALUES.find(
				(density) => densityChip(density) === newValue,
			) ?? prefs.density;
		const nextPrefs = { ...prefs, density: nextDensity };
		await writeStatusDockPrefs(nextPrefs);
		if (activeStatusPanelGlobal) {
			activeStatusPanelGlobal.density = nextDensity;
			activeStatusPanelGlobal.requestRender?.();
		}
		const resolved = await resolveStatusDockProject(ctx);
		if (resolved)
			await refreshStatusDock(
				resolved.project,
				ctx,
				currentTaskLink(ctx),
				resolved,
			);
		else clearStatusDock(ctx);
		ctx.ui.notify(`Status panel density set to ${nextDensity}.`, "info");
		return;
	}
	if (id === "pinned-repo") {
		if (newValue === "clear") {
			const nextPrefs = {
				...prefs,
				pinnedRepoPath: undefined,
				mode: prefs.mode === "pin" ? ("auto" as StatusDockMode) : prefs.mode,
			};
			await writeStatusDockPrefs(nextPrefs);
			const resolved = await resolveStatusDockProject(ctx);
			if (resolved)
				await refreshStatusDock(
					resolved.project,
					ctx,
					currentTaskLink(ctx),
					resolved,
				);
			else clearStatusDock(ctx);
			ctx.ui.notify("Pinned repo cleared.", "info");
			return;
		}
		let targetPath: string | undefined;
		if (newValue === "set current") {
			const currentProject = await maybeLoadProject(ctx.cwd);
			if (!currentProject) {
				ctx.ui.notify(
					"No repo-local wiki found at current cwd. Use 'enter path' to pin another repo.",
					"warning",
				);
				return;
			}
			targetPath = currentProject.root;
		}
		if (newValue === "browse") {
			targetPath = (await choosePinnedRepoRoot(ctx, prefs)) ?? undefined;
			if (!targetPath) return;
		}
		if (newValue === "enter path") {
			targetPath = (
				await ctx.ui.input("Pin Codewiki repo", prefs.pinnedRepoPath ?? ctx.cwd)
			)?.trim();
			if (!targetPath) return;
		}
		if (!targetPath) return;
		const project = await resolveCommandProject(
			ctx as ExtensionCommandContext,
			targetPath,
			`${COMMAND_PREFIX}-config`,
		);
		const nextPrefs = {
			...prefs,
			mode: "pin" as StatusDockMode,
			pinnedRepoPath: project.root,
		};
		await writeStatusDockPrefs(nextPrefs);
		await refreshStatusDock(project, ctx, currentTaskLink(ctx), {
			project,
			statusState: await maybeReadStatusState(project.statusStatePath),
			source: "pinned",
		});
		ctx.ui.notify(`Status summary pinned to ${project.root}.`, "info");
	}
}

async function openConfigPanel(
	ctx: ExtensionCommandContext | ExtensionContext,
): Promise<boolean> {
	const ui = ctx.ui as {
		setWidget?: (
			key: string,
			content:
				| ((
						tui: any,
						theme: any,
				  ) => { render: (width: number) => string[]; invalidate: () => void })
				| undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		) => void;
		onTerminalInput?: (
			handler: (
				data: string,
			) => { consume?: boolean; data?: string } | undefined,
		) => () => void;
	};
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
	};

	const renderChoiceRow = (
		theme: any,
		options: string[],
		activeIndex: number,
	) =>
		options
			.map((option, index) =>
				index === activeIndex
					? theme.bold(theme.fg("accent", `[${option}]`))
					: theme.fg("text", option),
			)
			.join(theme.fg("muted", "  "));

	const renderWidget = () => {
		ui.setWidget?.(
			"codewiki-config-panel",
			(_tui, theme) => {
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
							theme.fg("text", "Configured in repo-local .wiki/config.json."),
							theme.fg(
								"muted",
								"Bootstrap creates a read-only gateway by default.",
							),
							theme.fg(
								"muted",
								"Agents should use scripts/codewiki-gateway.mjs for token-light .wiki exploration.",
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
		ui.onTerminalInput?.((data) => {
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

interface DriftContext {
	selfInclude: string[];
	selfExclude: string[];
	docsScope: string[];
	docsExclude: string[];
	repoDocs: string[];
	codeScope: string[];
}

function buildDriftContext(
	project: WikiProject,
	graph: GraphFile | null,
): DriftContext {
	const selfScope =
		project.config.codewiki?.self_drift_scope ?? defaultSelfDriftScope(project);
	const selfInclude = unique(selfScope.include ?? []);
	const selfExclude = unique(selfScope.exclude ?? []);
	const docsScope = unique(
		project.config.codewiki?.code_drift_scope?.docs ??
			defaultCodeDriftDocsScope(project),
	);
	const docsExclude = unique(
		project.config.codewiki?.self_drift_scope?.exclude ??
			defaultSelfDriftScope(project).exclude ??
			[],
	);
	const repoDocs = unique(
		project.config.codewiki?.code_drift_scope?.repo_docs ?? ["README.md"],
	);
	const configCode = unique(
		project.config.codewiki?.code_drift_scope?.code ?? [],
	);
	const graphCode = unique(graph?.views?.code?.paths ?? []);
	const codeScope = unique([...configCode, ...graphCode]);
	return {
		selfInclude,
		selfExclude,
		docsScope,
		docsExclude,
		repoDocs,
		codeScope,
	};
}

function countIssuesBySeverity(report: LintReport, severity: string): number {
	return report.issues.filter((issue) => issue.severity === severity).length;
}

function statusColor(report: LintReport): "green" | "yellow" | "red" {
	if (countIssuesBySeverity(report, "error") > 0) return "red";
	if (report.issues.length > 0) return "yellow";
	return "green";
}

function statusLevel(report: LintReport): "info" | "warning" | "error" {
	const color = statusColor(report);
	if (color === "red") return "error";
	if (color === "yellow") return "warning";
	return "info";
}

async function maybeReadRoadmapState(
	path: string,
): Promise<RoadmapStateFile | null> {
	return maybeReadJson<RoadmapStateFile>(path);
}

function resolveTaskContextPath(
	project: WikiProject,
	taskId: string,
	runtimeTask?: RoadmapStateTaskSummary | null,
): string {
	return resolve(
		project.root,
		runtimeTask?.context_path ?? `.wiki/roadmap/tasks/${taskId}/context.json`,
	);
}

async function maybeReadTaskContext(
	project: WikiProject,
	taskId: string,
	runtimeTask?: RoadmapStateTaskSummary | null,
): Promise<RoadmapTaskContextPacket | null> {
	return maybeReadJson<RoadmapTaskContextPacket>(
		resolveTaskContextPath(project, taskId, runtimeTask),
	);
}

async function maybeReadStatusState(
	path: string,
): Promise<StatusStateFile | null> {
	return maybeReadJson<StatusStateFile>(path);
}

async function maybeReadGraph(path: string): Promise<GraphFile | null> {
	return maybeReadJson<GraphFile>(path);
}

function currentTaskLink(
	ctx: ExtensionContext | ExtensionCommandContext,
): TaskSessionLinkRecord | null {
	const manager = (ctx as { sessionManager?: { getBranch?: () => unknown[] } })
		.sessionManager;
	if (typeof manager?.getBranch !== "function") return null;
	try {
		return findLatestTaskSessionLink(manager.getBranch());
	} catch {
		return null;
	}
}

function resolveRoadmapStateTaskId(
	state: RoadmapStateFile,
	taskId: string | undefined,
): string | null {
	if (!taskId) return null;
	for (const candidate of taskIdCandidates(taskId)) {
		if (state.tasks[candidate]) return candidate;
	}
	return null;
}

function isOpenRoadmapTask(task: RoadmapStateTaskSummary | undefined): boolean {
	return (
		!!task &&
		[
			"todo",
			"research",
			"implement",
			"verify",
			"in_progress",
			"blocked",
		].includes(task.status)
	);
}

function isActiveLoopRoadmapStatus(status: RoadmapStatus): boolean {
	return ["research", "implement", "verify", "in_progress", "blocked"].includes(
		status,
	);
}

function roadmapHealthThemeColor(
	color: RoadmapStateHealth["color"],
): "success" | "warning" | "error" {
	if (color === "red") return "error";
	if (color === "yellow") return "warning";
	return "success";
}

function roadmapWorkingSetTaskIds(
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

function formatRoadmapWorkingSetLine(
	task: RoadmapStateTaskSummary,
	activeId: string | null,
	index: number,
): string {
	if (task.id === activeId && isOpenRoadmapTask(task))
		return `- Focused: ${task.id} — ${task.title}`;
	if (isTaskBlocked(task)) return `- Blocked: ${task.id} — ${task.title}`;
	const stage = taskBoardColumn(task);
	if (stage === "implement") return `- Implement: ${task.id} — ${task.title}`;
	if (stage === "verify") return `- Verify: ${task.id} — ${task.title}`;
	if (index === 0) return `- Next: ${task.id} — ${task.title}`;
	return `- Todo: ${task.id} — ${task.title}`;
}

function buildRoadmapWorkingSetLines(
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

function summarizeRoadmapFocus(
	state: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): string {
	const line = buildRoadmapWorkingSetLines(state, activeLink, 1)[0] ?? "- none";
	return line.replace(/^-\s*/, "");
}

function activeRoadmapTaskSummary(
	state: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): RoadmapStateTaskSummary | null {
	const activeId = state
		? resolveRoadmapStateTaskId(state, activeLink?.taskId)
		: null;
	const activeTask = activeId && state ? state.tasks[activeId] : null;
	return activeTask && isOpenRoadmapTask(activeTask) ? activeTask : null;
}

function resumeHeartbeatLane(state: StatusStateFile): {
	lane: StatusStateHeartbeatLane;
	freshness: ReturnType<typeof heartbeatLaneFreshness>;
} | null {
	for (const lane of state.heartbeat?.lanes ?? []) {
		const freshness = heartbeatLaneFreshness(lane);
		if (freshness.status === "stale" && freshness.basis === "work")
			return { lane, freshness };
	}
	for (const lane of state.heartbeat?.lanes ?? []) {
		const freshness = heartbeatLaneFreshness(lane);
		if (freshness.status === "stale") return { lane, freshness };
	}
	return null;
}

function currentSessionId(
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
		const directSessionId = (ctx as { sessionId?: string }).sessionId;
		if (typeof directSessionId === "string" && directSessionId.trim())
			return directSessionId.trim();
		const nestedSessionId = (ctx as { session?: { id?: string } }).session?.id;
		if (typeof nestedSessionId === "string" && nestedSessionId.trim())
			return nestedSessionId.trim();
		return null;
	} catch {
		return null;
	}
}

function parallelTaskCollisions(
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

const TASK_PHASE_DRIVERS: Record<
	TaskPhase,
	{
		passTo: TaskPhase | "done";
		failTo: TaskPhase;
		blockTo: TaskPhase;
		guidance: string;
	}
> = {
	implement: {
		passTo: "verify",
		failTo: "implement",
		blockTo: "implement",
		guidance:
			"Make the smallest coherent change that closes the task delta against specs and roadmap truth.",
	},
	verify: {
		passTo: "done",
		failTo: "implement",
		blockTo: "verify",
		guidance:
			"Run checks, review evidence, and prove the change is ready to land in done.",
	},
};

function normalizeTaskPhaseValue(
	value: string | null | undefined,
	fallback: TaskPhase = "implement",
): TaskPhase {
	const phase = value?.trim();
	return phase === "verify"
		? "verify"
		: phase === "implement" || phase === "research"
			? "implement"
			: fallback;
}

function roadmapTaskStage(
	status: RoadmapStatus | string | null | undefined,
	loopPhase?: string | null,
): "todo" | TaskPhase | "done" {
	const normalizedStatus = status?.trim();
	if (normalizedStatus === "todo") return "todo";
	if (normalizedStatus === "research") return "implement";
	if (normalizedStatus === "implement" || normalizedStatus === "verify")
		return normalizedStatus;
	if (normalizedStatus === "done") return "done";
	if (normalizedStatus === "in_progress" || normalizedStatus === "blocked")
		return normalizeTaskPhaseValue(loopPhase, "implement");
	return "todo";
}

function taskLoopPhase(
	task: RoadmapStateTaskSummary | null | undefined,
): string {
	const stage = roadmapTaskStage(task?.status, task?.loop?.phase);
	if (stage === "todo") return "implement";
	if (stage === "done") return "done";
	return normalizeTaskPhaseValue(task?.loop?.phase, stage);
}

function taskBoardColumn(
	task: RoadmapStateTaskSummary,
): "todo" | TaskPhase | "done" {
	return roadmapTaskStage(task.status, task.loop?.phase);
}

function isTaskBlocked(
	task: RoadmapStateTaskSummary | null | undefined,
): boolean {
	return (
		task?.status === "blocked" || task?.loop?.evidence?.verdict === "blocked"
	);
}

function taskLoopEvidenceLine(
	task: RoadmapStateTaskSummary | null | undefined,
): string {
	const evidence = task?.loop?.evidence;
	if (!evidence) return "No closure evidence recorded yet.";
	const parts = [evidence.summary || evidence.verdict].filter(Boolean);
	if (evidence.checks_run.length > 0)
		parts.push(`${evidence.checks_run.length} check(s)`);
	if (evidence.issues.length > 0)
		parts.push(`${evidence.issues.length} issue(s)`);
	return parts.join(" · ") || "Evidence recorded.";
}

function phaseLabel(phase: string): string {
	if (phase === "todo") return "todo";
	if (phase === "research") return "research";
	if (phase === "done") return "done";
	return phase || "implement";
}

function buildResumeSnapshot(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): {
	heading: string;
	command: string;
	reason: string;
	phase: string;
	taskId?: string;
	verification: string;
	evidence: string;
	heartbeat: string;
} {
	const activeTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	const heartbeat = resumeHeartbeatLane(state);
	if (activeTask) {
		const collisions = parallelTaskCollisions(state, activeTask.id);
		const phase = taskLoopPhase(activeTask);
		return {
			heading: `${activeTask.id} — ${activeTask.title}`,
			command: `/wiki-resume ${activeTask.id}`,
			taskId: activeTask.id,
			reason:
				collisions.length > 0
					? `Resume focused task (${activeTask.status} · ${phaseLabel(phase)}) with ${collisions.length} parallel session(s) on same task.`
					: `Resume focused task (${activeTask.status} · ${phaseLabel(phase)}).`,
			phase,
			verification:
				activeTask.goal.verification[0] ??
				state.resume?.verification ??
				"No explicit verification step yet.",
			evidence: taskLoopEvidenceLine(activeTask),
			heartbeat: heartbeat
				? `${heartbeat.lane.title}: ${heartbeat.freshness.reason}`
				: (state.resume?.heartbeat ?? "No stale heartbeat lane blocks resume."),
		};
	}
	if (state.resume?.heading && state.resume.command) {
		return {
			heading: state.resume.heading,
			command: state.resume.command,
			taskId: state.resume.task_id,
			reason: state.resume.reason,
			phase: state.resume.phase ?? "implement",
			verification: state.resume.verification,
			evidence: state.resume.evidence ?? "No closure evidence recorded yet.",
			heartbeat: state.resume.heartbeat,
		};
	}
	if (heartbeat) {
		return {
			heading: heartbeat.lane.title,
			command: heartbeat.lane.recommendation.command,
			reason: `Resume from stale heartbeat lane (${heartbeat.freshness.basis}).`,
			phase: "implement",
			verification: heartbeat.lane.recommendation.reason,
			evidence: "No closure evidence recorded yet.",
			heartbeat: heartbeat.freshness.reason,
		};
	}
	return {
		heading: summarizeRoadmapFocus(roadmapState, activeLink),
		command: state.next_step.command,
		reason: state.next_step.reason,
		phase: "implement",
		verification: "No urgent verification cue.",
		evidence: "No closure evidence recorded yet.",
		heartbeat: "All heartbeat lanes currently fresh.",
	};
}

function driftThemeColor(
	status: StatusStateSpecRow["drift_status"],
): "success" | "warning" | "error" | "muted" {
	if (status === "aligned") return "success";
	if (status === "tracked") return "warning";
	if (status === "untracked") return "error";
	if (status === "blocked") return "warning";
	return "muted";
}

function driftIcon(status: StatusStateSpecRow["drift_status"]): string {
	if (status === "aligned") return "🟢";
	if (status === "tracked") return "🟡";
	if (status === "untracked") return "🔴";
	if (status === "blocked") return "🔴";
	return "⚪";
}

function wikiActivityMarker(
	row: StatusStateSpecRow,
	activeLink: TaskSessionLinkRecord | null,
	roadmapState: RoadmapStateFile | null,
	tick: number,
): string {
	const activeTaskId = activeLink?.taskId?.trim();
	const activeTask = activeTaskId ? roadmapState?.tasks?.[activeTaskId] : null;
	const activeSpecPaths = new Set(
		(activeTask?.spec_paths ?? [])
			.map((value) => String(value).trim())
			.filter(Boolean),
	);
	if (
		activeTaskId &&
		activeTask &&
		isLiveAnimatedTask(activeTask, activeLink) &&
		(row.primary_task?.id === activeTaskId || activeSpecPaths.has(row.path))
	)
		return activeSpinnerFrame(tick);
	return driftIcon(row.drift_status);
}

function healthCircle(color: string): string {
	if (color === "green") return "🟢";
	if (color === "yellow") return "🟡";
	if (color === "red") return "🔴";
	return "⚪";
}

function agentStatusCircle(status: StatusStateAgentRow["status"]): string {
	if (status === "done") return "🟢";
	if (status === "blocked") return "🔴";
	if (status === "active" || status === "waiting") return "🟡";
	return "⚪";
}

function activeSpinnerFrame(tick: number): string {
	const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	return (
		frames[((tick % frames.length) + frames.length) % frames.length] ?? "⠧"
	);
}

function isLiveAnimatedTask(
	task: RoadmapStateTaskSummary,
	activeLink: TaskSessionLinkRecord | null,
): boolean {
	return (
		!!activeLink?.taskId &&
		activeLink.taskId === task.id &&
		["research", "implement", "verify", "in_progress", "blocked"].includes(
			task.status,
		)
	);
}

function kanbanTaskCircle(
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

function wikiTalkableSection(path: string): {
	id: "product" | "system" | "clients";
	label: "Product" | "System" | "Clients";
} {
	if (
		path.startsWith("wiki/product/") ||
		path.startsWith(".wiki/knowledge/product/")
	)
		return { id: "product", label: "Product" };
	if (
		path.startsWith("wiki/ux/") ||
		path.startsWith("wiki/clients/") ||
		path.startsWith(".wiki/knowledge/ux/") ||
		path.startsWith(".wiki/knowledge/clients/")
	)
		return { id: "clients", label: "Clients" };
	return { id: "system", label: "System" };
}

function liveWikiSections(state: StatusStateFile): StatusStateWikiSection[] {
	if (state.wiki?.sections?.length) return state.wiki.sections;
	const buckets: Record<string, StatusStateWikiSection> = {
		product: { id: "product", label: "Product", rows: [] },
		system: { id: "system", label: "System", rows: [] },
		clients: { id: "clients", label: "Clients", rows: [] },
	};
	for (const row of liveWikiRows(state)) {
		const group = wikiTalkableSection(row.path);
		buckets[group.id].rows.push(row);
	}
	return [buckets.product, buckets.system, buckets.clients].filter(
		(section) => section.rows.length > 0,
	);
}

function stableAgentNameFromSessionId(sessionId: string): string {
	let hash = 0;
	for (const ch of sessionId) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
	return AGENT_NAME_POOL[hash % AGENT_NAME_POOL.length] ?? "Agent";
}

function uniqueAgentName(base: string, used: Map<string, number>): string {
	const count = (used.get(base) ?? 0) + 1;
	used.set(base, count);
	return count === 1 ? base : `${base} ${count}`;
}

function roadmapColumnLabel(phase: string): string {
	if (phase === "todo") return "Todo";
	if (phase === "research") return "Research";
	if (phase === "verify") return "Verify";
	if (phase === "done") return "Done";
	return "Implement";
}

function liveRoadmapColumns(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
): StatusStateRoadmapColumn[] {
	const seededColumns: StatusStateRoadmapColumn[] = (
		state.roadmap?.columns?.length
			? state.roadmap.columns
			: [
					{ id: "todo", label: "Todo", task_ids: [] },
					{ id: "research", label: "Research", task_ids: [] },
					{ id: "implement", label: "Implement", task_ids: [] },
					{ id: "verify", label: "Verify", task_ids: [] },
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

function barThemeColor(
	kind: keyof StatusStateFile["bars"],
	bar: StatusStateBar,
): "success" | "warning" | "error" {
	if (kind === "tracked_drift") {
		if (bar.total === 0 || bar.percent >= 100) return "success";
		if (bar.value === 0) return "error";
		return "warning";
	}
	if (bar.total === 0 || bar.percent >= 80) return "success";
	if (bar.percent >= 50) return "warning";
	return "error";
}

function padToWidth(text: string, width: number): string {
	const safeWidth = Math.max(0, width);
	const truncated = truncateToWidth(text, safeWidth);
	const padding = Math.max(0, safeWidth - visibleWidth(truncated));
	return `${truncated}${" ".repeat(padding)}`;
}

function truncatePlain(text: string, width: number): string {
	return truncateToWidth(text, Math.max(0, width));
}

function renderProgressBar(
	theme: { fg: (color: string, text: string) => string },
	label: string,
	bar: StatusStateBar,
	width: number,
	kind: keyof StatusStateFile["bars"],
): string {
	const color = barThemeColor(kind, bar);
	const meterWidth = 10;
	const filled = Math.max(
		0,
		Math.min(meterWidth, Math.round((bar.percent / 100) * meterWidth)),
	);
	const meter = `${"█".repeat(filled)}${"░".repeat(meterWidth - filled)}`;
	const line = `${label.padEnd(14)} [ ${String(bar.percent).padStart(3)}% ${meter} ] ${bar.value}/${bar.total}`;
	return truncateToWidth(theme.fg(color, line), width);
}

function liveWikiRows(state: StatusStateFile): StatusStateSpecRow[] {
	return state.wiki?.rows?.length ? state.wiki.rows : state.specs;
}

function liveRoadmapSummary(
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): {
	focusedTask: RoadmapStateTaskSummary | null;
	blockedTasks: RoadmapStateTaskSummary[];
	inProgressTasks: RoadmapStateTaskSummary[];
	nextTask: RoadmapStateTaskSummary | null;
} {
	const focusedTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	const blockedIds =
		state.roadmap?.blocked_task_ids ??
		roadmapState?.views?.blocked_task_ids ??
		[];
	const inProgressIds =
		state.roadmap?.in_progress_task_ids ??
		roadmapState?.views?.in_progress_task_ids ??
		[];
	const nextTaskId =
		state.roadmap?.next_task_id ||
		roadmapState?.views?.todo_task_ids?.[0] ||
		roadmapState?.views?.in_progress_task_ids?.[0] ||
		"";
	return {
		focusedTask,
		blockedTasks: blockedIds
			.map((taskId) => roadmapState?.tasks?.[taskId])
			.filter(Boolean) as RoadmapStateTaskSummary[],
		inProgressTasks: inProgressIds
			.map((taskId) => roadmapState?.tasks?.[taskId])
			.filter(
				(task): task is RoadmapStateTaskSummary =>
					Boolean(task) && (!focusedTask || task.id !== focusedTask.id),
			),
		nextTask: nextTaskId ? (roadmapState?.tasks?.[nextTaskId] ?? null) : null,
	};
}

function actionStatus(
	action: string,
): "active" | "blocked" | "waiting" | "done" | "idle" {
	if (action === "blocked") return "blocked";
	if (action === "complete") return "done";
	if (action === "spawn") return "waiting";
	if (action === "focus" || action === "progress") return "active";
	return "idle";
}

function liveAgentRows(
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
			status: actionStatus(activeLink.action),
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

function resolveChannelStorePath(): string {
	const prefsPath = resolveStatusDockPrefsPath();
	return resolve(dirname(prefsPath), "codewiki-channels.json");
}

async function readStoredChannels(): Promise<StatusStateChannelRow[]> {
	const path = resolveChannelStorePath();
	if (!(await pathExists(path))) return [];
	try {
		const raw = JSON.parse(await readFile(path, "utf8")) as {
			rows?: StatusStateChannelRow[];
		};
		return Array.isArray(raw.rows)
			? raw.rows.filter((row) => row && typeof row.id === "string")
			: [];
	} catch {
		return [];
	}
}

function readStoredChannelsSync(): StatusStateChannelRow[] {
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

async function writeStoredChannels(
	rows: StatusStateChannelRow[],
): Promise<void> {
	const path = resolveChannelStorePath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify({ rows }, null, 2)}\n`, "utf8");
}

function liveChannelRows(state: StatusStateFile): StatusStateChannelRow[] {
	const rows = [...(state.channels?.rows ?? []), ...readStoredChannelsSync()];
	return unique(rows.map((row) => row.id))
		.map((id) => rows.find((row) => row.id === id)!)
		.filter(Boolean);
}

function resolvedNextStep(
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

function heartbeatLaneFreshness(
	lane: StatusStateHeartbeatLane,
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
			reason: "missing heartbeat check timestamp",
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

function staleHeartbeatLanes(
	state: StatusStateFile,
	now = new Date(),
): StatusStateHeartbeatLane[] {
	return (state.heartbeat?.lanes ?? []).filter(
		(lane) => heartbeatLaneFreshness(lane, now).status === "stale",
	);
}

function summarizeHeartbeat(
	state: StatusStateFile,
	now = new Date(),
): {
	total: number;
	stale: number;
	work: number;
	time: number;
	summary: string;
} {
	const lanes = state.heartbeat?.lanes ?? [];
	const freshness = lanes.map((lane) => heartbeatLaneFreshness(lane, now));
	const stale = freshness.filter((item) => item.status === "stale").length;
	const work = freshness.filter(
		(item) => item.status === "stale" && item.basis === "work",
	).length;
	const time = freshness.filter(
		(item) => item.status === "stale" && item.basis === "time",
	).length;
	if (lanes.length === 0)
		return {
			total: 0,
			stale: 0,
			work: 0,
			time: 0,
			summary: "no heartbeat lanes",
		};
	if (stale === 0)
		return {
			total: lanes.length,
			stale: 0,
			work: 0,
			time: 0,
			summary: `${lanes.length}/${lanes.length} fresh`,
		};
	const reasonParts = [
		work > 0 ? `${work} work` : "",
		time > 0 ? `${time} age` : "",
	]
		.filter(Boolean)
		.join(", ");
	return {
		total: lanes.length,
		stale,
		work,
		time,
		summary: `${stale}/${lanes.length} stale${reasonParts ? ` (${reasonParts})` : ""}`,
	};
}

function statusDockHeaderLabel(
	project: WikiProject,
	source: "cwd" | "pinned",
	health: RoadmapStateHealth["color"],
): string {
	const sourceLabel = source === "pinned" ? ` @ ${project.root}` : "";
	return (
		`${project.label}${sourceLabel}`.trimEnd() + `  ${health.toUpperCase()}`
	);
}

function topRiskSpecs(
	state: StatusStateFile,
	limit: number,
): StatusStateSpecRow[] {
	return state.specs
		.filter((spec) => spec.drift_status !== "aligned")
		.slice(0, limit);
}

function renderDockRiskLines(
	state: StatusStateFile,
	theme: { fg: (color: string, text: string) => string },
	width: number,
	limit: number,
): string[] {
	const specs = topRiskSpecs(state, limit);
	if (specs.length === 0)
		return [truncateToWidth(theme.fg("success", "Risks          none"), width)];
	return specs.map((spec) => {
		const taskLabel = spec.primary_task?.id ?? "—";
		const text = `${driftIcon(spec.drift_status)} ${spec.title}  |  ${spec.code_area}  |  ${taskLabel}`;
		return truncateToWidth(
			theme.fg(driftThemeColor(spec.drift_status), text),
			width,
		);
	});
}

function renderDockTaskLines(
	state: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	theme: { fg: (color: string, text: string) => string },
	width: number,
	limit: number,
): string[] {
	const lines = buildRoadmapWorkingSetLines(state, activeLink, limit);
	return lines.map((line) =>
		truncateToWidth(theme.fg("muted", line.replace(/^- /, "")), width),
	);
}

function buildDockSection(
	title: string,
	rows: string[],
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	innerWidth: number,
): string[] {
	const titleLine = theme.bold(theme.fg("accent", title));
	return [titleLine, ...rows.map((row) => truncateToWidth(row, innerWidth))];
}

function frameDockLines(
	lines: string[],
	theme: { fg: (color: string, text: string) => string },
	width: number,
	borderColor: string = "accent",
): string[] {
	const innerWidth = Math.max(24, width - 2);
	const border = (text: string) => theme.fg(borderColor, text);
	const top = border(`┌${"─".repeat(innerWidth)}┐`);
	const bottom = border(`└${"─".repeat(innerWidth)}┘`);
	const separator = border(`├${"─".repeat(innerWidth)}┤`);
	const framed = [top];

	lines.forEach((line, index) => {
		if (line === "__SEP__") {
			if (index !== 0 && index !== lines.length - 1) framed.push(separator);
			return;
		}
		framed.push(`${border("│")}${padToWidth(line, innerWidth)}${border("│")}`);
	});

	framed.push(bottom);
	return framed;
}

function renderPinnedTopPanel(
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
			truncateToWidth(theme.bold(theme.fg(titleColor, title)), innerWidth),
			"",
			truncateToWidth(tabsLine, innerWidth),
			"",
			"__SEP__",
			"",
			...bodyLines.map((line) => truncateToWidth(line, innerWidth)),
			"",
			"__SEP__",
			"",
			truncateToWidth(theme.fg("muted", footerLine), innerWidth),
			"",
		],
		theme,
		width,
		"accent",
	);
}

function renderStatusDockLines(
	project: WikiProject,
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	prefs: StatusDockPrefs,
	source: "cwd" | "pinned",
	theme: {
		fg: (color: string, text: string) => string;
		bold: (text: string) => string;
	},
	width: number,
): string[] {
	const color = roadmapHealthThemeColor(state.health.color);
	const nextStep = resolvedNextStep(state, roadmapState, activeLink);
	const heartbeat = summarizeHeartbeat(state);
	const resume = buildResumeSnapshot(state, roadmapState, activeLink);
	const parallel = state.parallel;
	const innerWidth = Math.max(24, width - 4);
	const sections: string[] = [
		truncateToWidth(
			theme.bold(
				theme.fg(
					color,
					`Code Wiki Status · ${statusDockHeaderLabel(project, source, state.health.color)}`,
				),
			),
			innerWidth,
		),
	];

	if (prefs.density !== "minimal") {
		sections.push("__SEP__");
		sections.push(
			...buildDockSection(
				"Metrics",
				[
					renderProgressBar(
						theme,
						"Tracked drift",
						state.bars.tracked_drift,
						innerWidth,
						"tracked_drift",
					),
					renderProgressBar(
						theme,
						"Roadmap done",
						state.bars.roadmap_done,
						innerWidth,
						"roadmap_done",
					),
					...(prefs.density === "full"
						? [
								renderProgressBar(
									theme,
									"Spec mapping",
									state.bars.spec_mapping,
									innerWidth,
									"spec_mapping",
								),
							]
						: []),
				],
				theme,
				innerWidth,
			),
		);

		sections.push("__SEP__");
		sections.push(
			...buildDockSection(
				"Specs",
				renderDockRiskLines(
					state,
					theme,
					innerWidth,
					STATUS_DOCK_MAX_VISIBLE_SPECS,
				),
				theme,
				innerWidth,
			),
		);

		if (prefs.density === "full") {
			sections.push("__SEP__");
			sections.push(
				...buildDockSection(
					"Tasks",
					renderDockTaskLines(
						roadmapState,
						activeLink,
						theme,
						innerWidth,
						STATUS_DOCK_MAX_VISIBLE_TASKS,
					),
					theme,
					innerWidth,
				),
			);
		}
	}

	sections.push("__SEP__");
	sections.push(
		...buildDockSection(
			"Resume",
			[
				theme.fg("accent", `Focus  ${resume.heading}`),
				theme.fg("muted", `Command  ${resume.command}`),
				theme.fg("muted", `Phase  ${phaseLabel(resume.phase)}`),
				theme.fg("muted", `Verify  ${resume.verification}`),
				...(heartbeat.total > 0
					? [
							theme.fg(
								heartbeat.stale > 0 ? "warning" : "muted",
								`Heartbeats  ${heartbeat.summary}`,
							),
						]
					: []),
				...(parallel
					? [
							theme.fg(
								(parallel.collision_task_ids?.length ?? 0) > 0
									? "warning"
									: "muted",
								`Parallel  ${parallel.active_session_count} session(s), ${parallel.collision_task_ids?.length ?? 0} collision(s)`,
							),
						]
					: []),
				...(prefs.density === "full"
					? [theme.fg("muted", resume.heartbeat)]
					: []),
			],
			theme,
			innerWidth,
		),
	);

	return frameDockLines(sections, theme, width);
}

function buildStatusSummaryText(
	project: WikiProject,
	state: StatusStateFile,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	_source: "cwd" | "pinned",
): string {
	const activeTask = activeRoadmapTaskSummary(roadmapState, activeLink);
	const nextStep = resolvedNextStep(state, roadmapState, activeLink);
	const taskLabel = activeTask
		? `${truncatePlain(activeTask.title, 30)}${activeTask.id ? ` · ${activeTask.id}` : ""}`
		: truncatePlain(nextStep.command, 30);
	return `codewiki: ${healthCircle(state.health.color)} · ${project.label} · ${taskLabel}`;
}

function maybeReadJsonSync<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

function readLiveStatusPanelSnapshot(
	project: WikiProject,
	activeLink: TaskSessionLinkRecord | null,
): {
	state: StatusStateFile;
	report: LintReport;
	roadmapState: RoadmapStateFile | null;
} | null {
	const state = maybeReadJsonSync<StatusStateFile>(project.statusStatePath);
	const report = maybeReadJsonSync<LintReport>(project.lintPath);
	const roadmapState = maybeReadJsonSync<RoadmapStateFile>(
		project.roadmapStatePath,
	);
	if (!state || !report) return null;
	if (activeStatusPanelGlobal) activeStatusPanelGlobal.activeLink = activeLink;
	return { state, report, roadmapState };
}

interface HomeIssue {
	severity: "blocker" | "warning" | "info";
	title: string;
	impact: string;
	recommended: string;
	detail: string[];
}

function phaseUserLabel(phase: string): string {
	if (phase === "research") return "Design";
	if (phase === "implement" || phase === "in_progress") return "Build";
	if (phase === "verify") return "Check";
	if (phase === "done") return "Done";
	return phase ? phase[0]!.toUpperCase() + phase.slice(1) : "Design";
}

function homeIssueLabel(severity: HomeIssue["severity"]): string {
	if (severity === "blocker") return "Blocker";
	if (severity === "warning") return "Needs attention";
	return "OK";
}

function buildHomeIssues(
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
				`State: ${task.status} · ${phaseUserLabel(taskLoopPhase(task))}`,
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
				activeTask.goal.verification[0] ||
				"Run an independent check and record the result before closing the work.",
			detail: [
				`Work item: ${activeTask.id}`,
				`Current phase: ${phaseUserLabel(taskLoopPhase(activeTask))}`,
				`Recommended: ${activeTask.goal.verification[0] || "Run an independent check and record the result."}`,
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

function buildHomeProductionPath(
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
			? `Active · ${phaseUserLabel(taskLoopPhase(activeTask))}`
			: hasOpenWork
				? "Active · Work remains open"
				: "Ready · No open work detected",
		activeTask?.loop?.evidence
			? "Ready · Latest work has recorded proof"
			: "Waiting · Independent check",
	];
}

function renderHomeTab(
	project: WikiProject,
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
			? "Production path looks clear"
			: state.health.color === "yellow"
				? "Not production-ready yet"
				: "Blocked before production";
	const currentState = activeTask
		? `${activeTask.title} is in ${phaseUserLabel(taskLoopPhase(activeTask)).toLowerCase()}. ${issues[0]?.title ?? "No blocking issue detected."}`
		: `${resume.heading}. ${issues[0]?.title ?? "No blocking issue detected."}`;
	const lines = [
		theme.bold(theme.fg("accent", "Current state")),
		truncatePlain(`${readiness}. ${currentState}`, Math.max(20, width - 4)),
		"",
		theme.bold(theme.fg("accent", "Being done now")),
		activeTask ? activeTask.title : resume.heading,
		theme.fg(
			"muted",
			activeTask
				? `${phaseUserLabel(taskLoopPhase(activeTask))} · ${activeTask.id}`
				: `Next: ${resume.reason}`,
		),
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
	lines.push("");
	lines.push(theme.bold(theme.fg("accent", "Production path")));
	lines.push(...buildHomeProductionPath(state, roadmapState, activeLink));
	return lines;
}

function renderStatusPanelLines(
	project: WikiProject,
	state: StatusStateFile,
	report: LintReport,
	_scope: StatusScope,
	_density: StatusDockDensity,
	section: StatusPanelSection,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
	_source: "cwd" | "pinned",
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
	const channelRows = liveChannelRows(state);
	const wikiSections = liveWikiSections(state);
	const title = `${project.label} | ${healthCircle(state.health.color)}`;
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

	if (section === "wiki") {
		panelState.wikiColumnIndex = Math.min(
			Math.max(0, panelState.wikiColumnIndex),
			Math.max(0, wikiSections.length - 1),
		);
		const activeSection = wikiSections[panelState.wikiColumnIndex];
		const activeRows = activeSection?.rows ?? [];
		panelState.wikiRowIndex = Math.min(
			Math.max(0, panelState.wikiRowIndex),
			Math.max(0, activeRows.length - 1),
		);
		const rowOffset = Math.max(
			0,
			panelState.wikiRowIndex - (perColumnLimit - 1),
		);
		const columnWidth = Math.max(
			24,
			Math.floor((Math.max(72, width) - 10) / 3),
		);
		const columnSeparator = theme.fg("muted", " │ ");
		const headerRow = wikiSections
			.map((wikiSection, columnIndex) =>
				padToWidth(
					theme.bold(theme.fg("accent", wikiSection.label)),
					columnWidth,
				),
			)
			.join(columnSeparator);
		const dividerRow = wikiSections
			.map(() =>
				padToWidth(
					theme.fg("muted", "─".repeat(Math.max(8, columnWidth - 1))),
					columnWidth,
				),
			)
			.join(columnSeparator);
		body.push(headerRow);
		body.push(dividerRow);
		const columnLines = wikiSections.map((wikiSection, columnIndex) => {
			const lines: string[] = [];
			const visibleRows = wikiSection.rows.slice(
				columnIndex === panelState.wikiColumnIndex ? rowOffset : 0,
				(columnIndex === panelState.wikiColumnIndex ? rowOffset : 0) +
					perColumnLimit,
			);
			if (visibleRows.length === 0) {
				lines.push(theme.fg("muted", "—"));
				return lines;
			}
			for (const [visibleIndex, row] of visibleRows.entries()) {
				const absoluteIndex =
					(columnIndex === panelState.wikiColumnIndex ? rowOffset : 0) +
					visibleIndex;
				const selected =
					columnIndex === panelState.wikiColumnIndex &&
					absoluteIndex === panelState.wikiRowIndex;
				lines.push(
					highlightSelectable(
						theme,
						`${selected ? "▸" : " "} ${wikiActivityMarker(row, activeLink, roadmapState, panelState.animationTick)} ${truncatePlain(row.title || row.path, Math.max(10, columnWidth - 4))}`,
						selected,
					),
				);
				lines.push(
					theme.fg(
						"muted",
						truncatePlain(
							`${row.path}${row.primary_task?.id ? ` · ${row.primary_task.id}` : ""}`,
							columnWidth,
						),
					),
				);
				lines.push(
					theme.fg(
						"muted",
						truncatePlain(
							row.note || row.summary || "No deterministic drift note.",
							columnWidth,
						),
					),
				);
				lines.push("");
			}
			if (
				wikiSection.rows.length >
				(columnIndex === panelState.wikiColumnIndex ? rowOffset : 0) +
					visibleRows.length
			)
				lines.push(
					theme.fg(
						"muted",
						`… ${wikiSection.rows.length - ((columnIndex === panelState.wikiColumnIndex ? rowOffset : 0) + visibleRows.length)} more`,
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
				const cue = isTaskBlocked(task)
					? taskLoopEvidenceLine(task) || task.goal.verification[0] || "Waiting"
					: task.loop?.phase === "verify"
						? task.goal.verification[0] ||
							taskLoopEvidenceLine(task) ||
							"Verify"
						: taskLoopEvidenceLine(task) ||
							task.goal.verification[0] ||
							phaseLabel(taskLoopPhase(task));
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

	if (section === "agents") {
		panelState.agentRowIndex = Math.min(
			Math.max(0, panelState.agentRowIndex),
			Math.max(0, agentRows.length - 1),
		);
		if (agentRows.length === 0)
			body.push(theme.fg("muted", "No active agent rows yet."));
		for (const [index, row] of agentRows.slice(0, 8).entries()) {
			const selected = index === panelState.agentRowIndex;
			body.push(
				highlightSelectable(
					theme,
					`${selected ? "▸" : " "} ${agentStatusCircle(row.status)} ${row.name || row.label} | ${row.task_title || "No task"}${row.task_id ? ` - ${row.task_id}` : ""}`,
					selected,
				),
			);
			body.push(
				theme.fg(
					"muted",
					`${row.mode} · ${row.last_action || "No recent action."}`,
				),
			);
			body.push(theme.fg("muted", row.constraint || "No explicit constraint."));
			body.push("");
		}
		body.push(
			theme.fg(
				"muted",
				`Parallel sessions: ${state.parallel?.active_session_count ?? 0} active · ${state.parallel?.collision_task_ids?.length ?? 0} collision(s)`,
			),
		);
	}

	if (section === "channels") {
		const channelItems = [
			{
				id: "__add__",
				label: state.channels?.add_label || "Add channel",
				kind: "action",
				target: "",
				status: "",
				scope: "user",
				description: "Create a new delivery channel.",
			} as StatusStateChannelRow,
			...channelRows,
		];
		panelState.channelRowIndex = Math.min(
			Math.max(0, panelState.channelRowIndex),
			Math.max(0, channelItems.length - 1),
		);
		for (const [index, row] of channelItems.entries()) {
			const selected = index === panelState.channelRowIndex;
			body.push(
				highlightSelectable(
					theme,
					`${selected ? "▸" : " "} ${index === 0 ? `[ ${row.label} ]` : `${row.label}${row.target ? ` · ${row.target}` : ""}`}`,
					selected,
				),
			);
			if (index === 0)
				body.push(
					theme.fg("muted", "Open channel detail pane to create a new route."),
				);
			else
				body.push(
					theme.fg(
						"muted",
						`${row.description || row.status || row.kind}${row.last_delivery_at ? ` · ${row.last_delivery_at}` : ""}${row.error ? ` · ${row.error}` : ""}`,
					),
				);
			body.push("");
		}
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

async function openStatusPanel(
	pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext | ExtensionCommandContext,
	scope: StatusScope,
	activeLink: TaskSessionLinkRecord | null,
	source: "cwd" | "pinned",
	onState?: (state: ActiveStatusPanel | null) => void,
	initialSection: StatusPanelSection = "home",
): Promise<boolean> {
	const ui = ctx.ui as {
		setWidget?: (
			key: string,
			content:
				| ((
						tui: any,
						theme: any,
				  ) => { render: (width: number) => string[]; invalidate: () => void })
				| undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		) => void;
		onTerminalInput?: (
			handler: (
				data: string,
			) => { consume?: boolean; data?: string } | undefined,
		) => () => void;
		input?: (
			label: string,
			initialValue?: string,
		) => Promise<string | undefined>;
		notify: (message: string, level?: string) => void;
	};
	if (
		typeof ui.setWidget !== "function" ||
		typeof ui.onTerminalInput !== "function"
	)
		return false;
	const prefs = await readStatusDockPrefs();
	const sections: StatusPanelSection[] = [
		"home",
		"wiki",
		"roadmap",
		"agents",
		"channels",
	];
	const panelState: ActiveStatusPanel = {
		project,
		source,
		scope,
		density: prefs.density,
		section: initialSection,
		activeLink,
		sessionId: currentSessionId(ctx),
		homeIssueIndex: 0,
		wikiColumnIndex: 0,
		wikiRowIndex: 0,
		roadmapColumnIndex: 0,
		roadmapRowIndex: 0,
		agentRowIndex: 0,
		channelRowIndex: 0,
		detail: null,
		animationTick: 0,
		animationTimer: null,
	};

	const renderWidget = () => {
		ui.setWidget?.(STATUS_DOCK_WIDGET_KEY, (_tui, theme) => ({
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
						`${panelState.project.label} | ⚪`,
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
		panelState.animationTimer.unref?.();
	}

	activeStatusPanelInputUnsubscribe?.();
	activeStatusPanelInputUnsubscribe =
		ui.onTerminalInput?.((data) => {
			if (!activeStatusPanelGlobal) return undefined;
			const snapshot = readLiveStatusPanelSnapshot(
				panelState.project,
				panelState.activeLink,
			);
			const wikiSections = snapshot ? liveWikiSections(snapshot.state) : [];
			const roadmapColumns = snapshot
				? liveRoadmapColumns(snapshot.state, snapshot.roadmapState)
				: [];
			const agentRows = snapshot
				? liveAgentRows(
						snapshot.state,
						snapshot.roadmapState,
						panelState.activeLink,
						panelState.sessionId,
					)
				: [];
			const channelRows = snapshot ? liveChannelRows(snapshot.state) : [];
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
				} else if (panelState.section === "wiki") {
					if (matchesKey(data, "left"))
						panelState.wikiColumnIndex = cycleIndex(
							Math.max(1, wikiSections.length),
							panelState.wikiColumnIndex,
							-1,
						);
					if (matchesKey(data, "right"))
						panelState.wikiColumnIndex = cycleIndex(
							Math.max(1, wikiSections.length),
							panelState.wikiColumnIndex,
							1,
						);
					if (matchesKey(data, "up"))
						panelState.wikiRowIndex = Math.max(0, panelState.wikiRowIndex - 1);
					if (matchesKey(data, "down")) panelState.wikiRowIndex += 1;
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
				} else if (panelState.section === "agents") {
					if (matchesKey(data, "up"))
						panelState.agentRowIndex = Math.max(
							0,
							panelState.agentRowIndex - 1,
						);
					if (matchesKey(data, "down"))
						panelState.agentRowIndex = Math.min(
							Math.max(0, agentRows.length - 1),
							panelState.agentRowIndex + 1,
						);
				} else if (panelState.section === "channels") {
					if (matchesKey(data, "up"))
						panelState.channelRowIndex = Math.max(
							0,
							panelState.channelRowIndex - 1,
						);
					if (matchesKey(data, "down"))
						panelState.channelRowIndex = Math.min(
							channelRows.length,
							panelState.channelRowIndex + 1,
						);
				}
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
					panelState.project = await loadProject(nextRoot);
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
						const taskId = panelState.detail.taskId;
						panelState.detail = null;
						close();
						void runResumeCommand(
							pi,
							"wiki-resume",
							taskId,
							ctx as ExtensionCommandContext,
						).catch((error: unknown) =>
							ui.notify(
								error instanceof Error ? error.message : String(error),
								"error",
							),
						);
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
								phase: normalizeTaskPhaseValue(
									taskLoopPhase(task),
									"implement",
								),
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
				if (
					panelState.detail?.kind === "channel-add" ||
					panelState.detail?.kind === "channel-edit"
				) {
					void runChannelDetailEditor(
						ui,
						panelState,
						panelState.detail?.channelId
							? (channelRows.find(
									(row) => row.id === panelState.detail?.channelId,
								) ?? null)
							: null,
						channelRows,
					).catch((error: unknown) =>
						ui.notify(
							error instanceof Error ? error.message : String(error),
							"error",
						),
					);
					return { consume: true };
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
				} else if (panelState.section === "wiki") {
					const selectedSection = wikiSections[panelState.wikiColumnIndex];
					const row = selectedSection?.rows?.[panelState.wikiRowIndex];
					if (row)
						openStatusPanelDetail(panelState, {
							kind: "wiki",
							title: row.title || row.path,
							lines: [
								`Spec: ${row.path}`,
								`Task: ${row.primary_task?.id ?? "—"}`,
								`Code: ${row.code_area || "—"}`,
								"",
								row.summary || row.note || "No extra detail.",
							],
						});
				} else if (panelState.section === "roadmap") {
					const taskId =
						roadmapColumns[panelState.roadmapColumnIndex]?.task_ids?.[
							panelState.roadmapRowIndex
						];
					const task = taskId ? snapshot.roadmapState?.tasks?.[taskId] : null;
					if (task)
						openStatusPanelDetail(panelState, buildRoadmapTaskDetail(task));
				} else if (panelState.section === "agents") {
					const row = agentRows[panelState.agentRowIndex];
					if (row)
						openStatusPanelDetail(panelState, {
							kind: "agent",
							title: row.name || row.label,
							lines: [
								`Task: ${row.task_title || "No task"}${row.task_id ? ` - ${row.task_id}` : ""}`,
								`Mode: ${row.mode}`,
								`Status: ${row.status}`,
								"",
								row.last_action || "No recent action.",
								"",
								row.constraint || "No explicit constraint.",
							],
						});
				} else if (panelState.section === "channels") {
					if (panelState.channelRowIndex === 0)
						openStatusPanelDetail(panelState, {
							kind: "channel-add",
							title: "Add channel",
							actions: [{ id: "edit", label: "Create" }],
							lines: [
								"Create a new channel route.",
								"",
								"Press Enter to fill label, kind, target, and description.",
							],
						});
					else {
						const row = channelRows[panelState.channelRowIndex - 1];
						if (row)
							openStatusPanelDetail(panelState, {
								kind: "channel-edit",
								title: row.label,
								channelId: row.id,
								actions: [{ id: "edit", label: "Edit" }],
								lines: [
									`Target: ${row.target || "—"}`,
									`Kind: ${row.kind}`,
									`Status: ${row.status}`,
									"",
									row.description || "No description.",
									"",
									"Press Enter to edit this channel.",
								],
							});
					}
				}
				renderWidget();
				return { consume: true };
			}
			return undefined;
		}) ?? null;

	return true;
}

function clearStatusDock(
	ctx: ExtensionContext | ExtensionCommandContext,
): void {
	const ui = ctx.ui as {
		setWidget?: (
			key: string,
			content: undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		) => void;
		setStatus?: (key: string, value: string | undefined) => void;
	};
	activeStatusPanelInputUnsubscribe?.();
	activeStatusPanelInputUnsubscribe = null;
	activeStatusPanelGlobal = null;
	if (typeof ui.setWidget === "function")
		ui.setWidget(STATUS_DOCK_WIDGET_KEY, undefined);
	if (typeof ui.setStatus === "function")
		ui.setStatus(STATUS_SUMMARY_STATUS_KEY, undefined);
}

async function refreshStatusDock(
	project: WikiProject,
	ctx: ExtensionContext | ExtensionCommandContext,
	activeLink: TaskSessionLinkRecord | null = currentTaskLink(ctx),
	resolved: ResolvedStatusDockProject | null = null,
): Promise<void> {
	const ui = ctx.ui as {
		setStatus?: (key: string, value: string | undefined) => void;
	};
	if (typeof ui.setStatus !== "function") return;
	const prefs = await readStatusDockPrefs();
	if (prefs.mode === "off") {
		ui.setStatus(STATUS_SUMMARY_STATUS_KEY, undefined);
		return;
	}
	const dockState =
		resolved?.statusState ??
		(await maybeReadStatusState(project.statusStatePath));
	const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
	if (!dockState) {
		ui.setStatus(STATUS_SUMMARY_STATUS_KEY, undefined);
		return;
	}
	const source = resolved?.source ?? "cwd";
	ui.setStatus(
		STATUS_SUMMARY_STATUS_KEY,
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

function formatTableRow(columns: string[], widths: number[]): string {
	return columns
		.map((value, index) =>
			padToWidth(truncatePlain(value, widths[index] ?? 0), widths[index] ?? 0),
		)
		.join(" | ");
}

function formatStatusSpecRow(
	spec: StatusStateSpecRow,
	widths: number[],
): string {
	const task = spec.primary_task
		? `${spec.primary_task.id} ${spec.primary_task.status}`
		: "—";
	return formatTableRow(
		[
			spec.title || spec.path,
			`${driftIcon(spec.drift_status)} ${spec.drift_status}`,
			spec.code_area,
			task,
		],
		widths,
	);
}

function buildStatusText(
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
		`phase ${phaseLabel(resume.phase)}`,
		`next ${resume.command || nextStep.command}`,
		`why ${resume.reason}`,
		`verify ${resume.verification}`,
		`evidence ${resume.evidence}`,
		`specs ${(focusedTask?.spec_paths ?? []).slice(0, 6).join(", ") || "—"}`,
		`code ${(focusedTask?.code_paths ?? []).slice(0, 6).join(", ") || "—"}`,
		`agents ${sameTaskAgents.join(", ") || "—"}`,
		`blocked ${(roadmapState?.views?.blocked_task_ids ?? []).join(", ") || "none"}`,
	];
	return lines.join("\n");
}

function defaultStatusDockPrefs(): StatusDockPrefs {
	return {
		version: STATUS_DOCK_PREFS_VERSION,
		mode: "auto",
		density: "standard",
	};
}

function resolveStatusDockPrefsPath(): string {
	const override = process.env[STATUS_DOCK_PREFS_ENV]?.trim();
	if (override) return resolve(override);
	const home = process.env.HOME?.trim();
	if (home) return resolve(home, ".pi", "agent", "codewiki-status.json");
	return resolve(".pi", "agent", "codewiki-status.json");
}

async function readStatusDockPrefs(): Promise<StatusDockPrefs> {
	const path = resolveStatusDockPrefsPath();
	if (!(await pathExists(path))) return defaultStatusDockPrefs();
	try {
		const raw = JSON.parse(
			await readFile(path, "utf8"),
		) as Partial<StatusDockPrefs>;
		const mode = STATUS_DOCK_MODE_VALUES.includes(raw.mode as StatusDockMode)
			? (raw.mode as StatusDockMode)
			: "auto";
		const density = STATUS_DOCK_DENSITY_VALUES.includes(
			raw.density as StatusDockDensity,
		)
			? (raw.density as StatusDockDensity)
			: "standard";
		const pinnedRepoPath =
			typeof raw.pinnedRepoPath === "string" && raw.pinnedRepoPath.trim()
				? raw.pinnedRepoPath.trim()
				: undefined;
		const lastRepoPath =
			typeof raw.lastRepoPath === "string" && raw.lastRepoPath.trim()
				? raw.lastRepoPath.trim()
				: undefined;
		return {
			version: STATUS_DOCK_PREFS_VERSION,
			mode,
			density,
			pinnedRepoPath,
			lastRepoPath,
		};
	} catch {
		return defaultStatusDockPrefs();
	}
}

async function writeStatusDockPrefs(prefs: StatusDockPrefs): Promise<void> {
	const path = resolveStatusDockPrefsPath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		`${JSON.stringify({ ...prefs, version: STATUS_DOCK_PREFS_VERSION }, null, 2)}\n`,
		"utf8",
	);
}

async function rememberStatusDockProject(
	project: WikiProject,
	prefs: StatusDockPrefs | null = null,
): Promise<void> {
	const current = prefs ?? (await readStatusDockPrefs());
	if (current.lastRepoPath === project.root) return;
	await writeStatusDockPrefs({ ...current, lastRepoPath: project.root });
}

async function resolveStatusDockProject(
	ctx: ExtensionContext | ExtensionCommandContext,
	options?: { allowWhenOff?: boolean },
): Promise<ResolvedStatusDockProject | null> {
	const prefs = await readStatusDockPrefs();
	if (prefs.mode === "off" && !options?.allowWhenOff) return null;
	const localProject = await maybeLoadProject(ctx.cwd);
	if (localProject) {
		await rememberStatusDockProject(localProject, prefs);
		return {
			project: localProject,
			statusState: await maybeReadStatusState(localProject.statusStatePath),
			source: "cwd",
		};
	}
	const fallbackRoots = unique([
		...(prefs.mode === "pin" && prefs.pinnedRepoPath
			? [prefs.pinnedRepoPath]
			: []),
		...(prefs.lastRepoPath ? [prefs.lastRepoPath] : []),
	]);
	for (const root of fallbackRoots) {
		const fallbackProject = await maybeLoadProject(root);
		if (!fallbackProject) continue;
		await rememberStatusDockProject(fallbackProject, prefs);
		return {
			project: fallbackProject,
			statusState: await maybeReadStatusState(fallbackProject.statusStatePath),
			source: "pinned",
		};
	}
	return null;
}

function promptContextFiles(project: WikiProject): string[] {
	return [
		`- ${project.configPath}`,
		...(project.indexPath ? [`- ${project.indexPath}`] : []),
		`- ${project.roadmapPath}`,
		...(project.roadmapDocPath ? [`- ${project.roadmapDocPath}`] : []),
		`- ${project.graphPath.replace(`${project.root}/`, "")}`,
		`- ${project.lintPath.replace(`${project.root}/`, "")}`,
		`- ${project.roadmapStatePath.replace(`${project.root}/`, "")}`,
		`- ${project.statusStatePath.replace(`${project.root}/`, "")}`,
	];
}

function graphSpecCodePaths(
	graph: GraphFile | null,
	specPath: string,
): string[] {
	if (!graph) return [];
	const docNodeId = `doc:${specPath}`;
	return unique(
		(graph.edges ?? [])
			.filter(
				(edge) => edge.kind === "doc_code_path" && edge.from === docNodeId,
			)
			.map((edge) => edge.to.replace(/^code:/, "")),
	);
}

function renderSpecPromptMap(graph: GraphFile | null): string[] {
	const graphSpecs = (graph?.nodes ?? [])
		.filter(
			(node) => node.kind === "doc" && node.doc_type === "spec" && node.path,
		)
		.map((node) => ({
			path: node.path as string,
			title: node.title,
			code_paths: graphSpecCodePaths(graph, node.path as string),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
	if (graphSpecs.length === 0) return ["- none"];
	return graphSpecs.map((spec) => {
		const codePaths = unique(spec.code_paths ?? []);
		return `- ${spec.title ?? spec.path} | ${spec.path} | code=${codePaths.length > 0 ? codePaths.join(", ") : "none mapped"}`;
	});
}

function renderScopeForPrompt(
	scope: StatusScope,
	drift: DriftContext,
): string[] {
	if (scope === "docs") {
		return [
			"Docs drift scope:",
			...renderScope("Include", drift.selfInclude),
			...renderScope("Exclude", drift.selfExclude),
		];
	}
	if (scope === "code") {
		return [
			"Docs scope:",
			...renderScope("Include", drift.docsScope),
			...renderScope("Exclude", drift.docsExclude),
			"Additional repository docs:",
			...renderList(drift.repoDocs),
			"Implementation scope:",
			...renderList(
				drift.codeScope.length > 0
					? drift.codeScope
					: [
							"Use code paths referenced by live specs; no explicit code scope configured.",
						],
			),
		];
	}
	return [
		"Docs drift scope:",
		...renderScope("Include", drift.selfInclude),
		...renderScope("Exclude", drift.selfExclude),
		"Code comparison scope:",
		...renderScope("Docs include", drift.docsScope),
		...renderScope("Docs exclude", drift.docsExclude),
		"Additional repository docs:",
		...renderList(drift.repoDocs),
		"Implementation scope:",
		...renderList(
			drift.codeScope.length > 0
				? drift.codeScope
				: [
						"Use code paths referenced by live specs; no explicit code scope configured.",
					],
		),
	];
}

function compactDigest(value: unknown): string {
	const text = typeof value === "string" ? value : "";
	return text ? text.slice(0, 12) : "—";
}

function contextRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function contextStringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => String(item).trim()).filter(Boolean)
		: [];
}

function renderTaskContextForPrompt(
	packet: RoadmapTaskContextPacket | null,
): string[] {
	if (!packet) return [];
	const budget = contextRecord(packet.budget);
	const revision = contextRecord(packet.revision);
	const taskRevision = contextRecord(revision.task);
	const gitRevision = contextRecord(revision.git);
	const code = contextRecord(packet.code);
	const codePaths = contextStringList(code.paths);
	const specs = Array.isArray(packet.specs) ? packet.specs : [];
	const evidence = contextRecord(packet.evidence);
	return [
		"Compact task context packet:",
		`- Path: ${packet.context_path}`,
		`- Budget: ${budget.target_tokens ?? 6000} tokens; ${budget.policy ?? "Use packet first; expand listed files only when needed."}`,
		`- Revision: task=${compactDigest(taskRevision.digest)} spec=${compactDigest(revision.spec_digest)} code=${compactDigest(revision.code_digest)} git=${compactDigest(gitRevision.head)} dirty=${gitRevision.dirty === true ? "yes" : "no"}`,
		...(specs.length > 0
			? [
					"Spec contracts:",
					...specs.slice(0, 8).map((item) => {
						const spec = contextRecord(item);
						const specRevision = contextRecord(spec.revision);
						return `- ${spec.path ?? "unknown"} | ${spec.title ?? "Untitled"} | ${spec.summary ?? ""} | digest=${compactDigest(specRevision.digest)}`;
					}),
				]
			: []),
		...(codePaths.length > 0
			? [
					"Code expansion paths:",
					...codePaths.slice(0, 12).map((path) => `- ${path}`),
				]
			: []),
		...(evidence.summary
			? [
					"Latest evidence:",
					`- ${evidence.verdict ?? "progress"}: ${evidence.summary}`,
				]
			: []),
		"Expansion rule: read only listed specs/code/evidence when packet is insufficient, stale, or exact implementation detail is required.",
	];
}

function codePrompt(
	project: WikiProject,
	graph: GraphFile | null,
	report: LintReport,
	task: RoadmapTaskRecord,
	phase = "implement",
	evidence = "No closure evidence recorded yet.",
	taskContext: RoadmapTaskContextPacket | null = null,
): string {
	const drift = buildDriftContext(project, graph);
	const taskContextLines = renderTaskContextForPrompt(taskContext);
	const fallbackContextLines = [
		...renderScopeForPrompt("both", drift),
		"Context files:",
		...promptContextFiles(project),
		"Spec map:",
		...renderSpecPromptMap(graph),
	];
	return [
		`Implement roadmap task ${task.id} for ${project.label}.`,
		`Task title: ${task.title}.`,
		`Task status: ${task.status}.`,
		`Task priority: ${task.priority}.`,
		`Task kind: ${task.kind}.`,
		`Task summary: ${task.summary}.`,
		`Deterministic task phase: ${phase}.`,
		`Latest evidence summary: ${evidence}.`,
		...(task.goal.outcome ? [`Task outcome: ${task.goal.outcome}.`] : []),
		...(task.goal.acceptance.length > 0
			? [
					"Task success signals:",
					...task.goal.acceptance.map((item) => `- ${item}`),
				]
			: []),
		...(task.goal.non_goals.length > 0
			? ["Task non-goals:", ...task.goal.non_goals.map((item) => `- ${item}`)]
			: []),
		...(task.goal.verification.length > 0
			? [
					"Task verification steps:",
					...task.goal.verification.map((item) => `- ${item}`),
				]
			: []),
		`Deterministic preflight color: ${statusColor(report)}.`,
		...(taskContextLines.length > 0 ? taskContextLines : fallbackContextLines),
		"Task delta:",
		`- Desired: ${task.delta.desired}`,
		`- Current: ${task.delta.current}`,
		`- Closure: ${task.delta.closure}`,
		...(task.spec_paths.length > 0
			? ["Task spec paths:", ...task.spec_paths.map((path) => `- ${path}`)]
			: []),
		...(task.code_paths.length > 0
			? ["Task code paths:", ...task.code_paths.map((path) => `- ${path}`)]
			: []),
		...(task.research_ids.length > 0
			? [
					"Task research ids:",
					...task.research_ids.map((researchId) => `- ${researchId}`),
				]
			: []),
		"Rules:",
		`- follow the deterministic task phase: ${TASK_PHASE_DRIVERS.implement.guidance} ${TASK_PHASE_DRIVERS.verify.guidance}`,
		"- if current phase is implement, build context through the gateway or compact task packet first, then change code or wiki surgically against specs and roadmap truth",
		"- during implement, use lint, typecheck, tests, runtime feedback, and Pi-lens as short-cycle correction signals for mechanical code quality",
		"- if current phase is verify, use fresh-context alignment validation: check user intent, knowledge, architecture, code, evidence, and intra-layer coherence before recommending done",
		"- codewiki verify should judge alignment/coherence; do not reduce it to linting or typechecking",
		"- gather research only when uncertainty or unsupported claims require new evidence",
		"- implement according to specs and roadmap; surface drift instead of silently choosing code over wiki",
		"- keep public UX focused on wiki-bootstrap, wiki-status, wiki-config, and wiki-resume, while Alt+W toggles the live status panel",
		"- do not create a separate user-facing wiki-edit command; update roadmap/wiki artifacts automatically when user intent requires it",
		"- if intended design must change, update wiki docs and code consistently",
		"- if this task finishes, blocks, or needs evidence recorded, use codewiki_task to persist canonical task truth",
		"- if follow-up delta appears that is not already tracked, use codewiki_task action=create",
		"- rebuild generated outputs before finishing",
		"- rerun deterministic status before summarizing",
		"Output format:",
		"- Changes made",
		"- Task status recommendation: todo|implement|verify|done|blocked",
		"- Wiki updates made automatically, if any",
		"- Remaining risks or follow-ups",
	].join("\n");
}

async function resolveToolProject(
	startDir: string,
	repoPath: string | undefined,
	toolName: string,
): Promise<WikiProject> {
	if (repoPath) {
		const requestedPath = resolve(startDir, repoPath);
		try {
			const project = await loadProject(requestedPath);
			await rememberStatusDockProject(project);
			return project;
		} catch (error) {
			throw new Error(
				`${toolName}: could not resolve repoPath ${requestedPath}. ${formatError(error)}`,
			);
		}
	}

	try {
		const project = await loadProject(startDir);
		await rememberStatusDockProject(project);
		return project;
	} catch {
		const prefs = await readStatusDockPrefs();
		const fallbackRoots = unique([
			...(prefs.mode === "pin" && prefs.pinnedRepoPath
				? [prefs.pinnedRepoPath]
				: []),
			...(prefs.lastRepoPath ? [prefs.lastRepoPath] : []),
		]);
		for (const root of fallbackRoots) {
			const project = await maybeLoadProject(root);
			if (!project) continue;
			await rememberStatusDockProject(project, prefs);
			return project;
		}
		throw new Error(
			[
				`${toolName}: no repo-local wiki found from ${startDir}.`,
				"codewiki tools are available globally, but each run mutates one repo-local wiki.",
				`Retry with repoPath set to the target repo root, or any path inside that repo.`,
			].join(" "),
		);
	}
}

async function resolveCommandProject(
	ctx: ExtensionCommandContext,
	pathArg: string | null,
	commandName: string,
): Promise<WikiProject> {
	if (pathArg) {
		const requestedPath = resolve(ctx.cwd, pathArg);
		try {
			const project = await loadProject(requestedPath);
			await rememberStatusDockProject(project);
			return project;
		} catch (error) {
			throw new Error(
				`${commandName}: could not resolve repo path ${requestedPath}. ${formatError(error)}`,
			);
		}
	}

	try {
		const project = await loadProject(ctx.cwd);
		await rememberStatusDockProject(project);
		return project;
	} catch {
		const candidates = await findWikiRootsBelow(ctx.cwd);
		if (candidates.length > 0) {
			const pickedRoot = await pickCommandProjectRoot(
				ctx,
				commandName,
				candidates,
			);
			if (pickedRoot) {
				const project = await loadProject(pickedRoot);
				await rememberStatusDockProject(project);
				return project;
			}
		}
		throw new Error(buildGlobalCommandHelp(ctx.cwd, commandName, candidates));
	}
}

async function pickCommandProjectRoot(
	ctx: ExtensionCommandContext,
	commandName: string,
	roots: string[],
): Promise<string | null> {
	if (!ctx.hasUI || typeof ctx.ui.custom !== "function") return null;
	const items = roots.map((root) => ({
		value: root,
		label: basename(root) || root,
		description: root,
	}));

	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const container = new Container();
		const border = new DynamicBorder((s: string) => theme.fg("accent", s));
		container.addChild(border);
		container.addChild(
			new Text(
				theme.fg(
					"accent",
					theme.bold(`Choose wiki project for /${commandName}`),
				),
				1,
				0,
			),
		);
		container.addChild(
			new Text(
				theme.fg(
					"muted",
					`${items.length} candidate repo(s) found below ${ctx.cwd}`,
				),
				1,
				0,
			),
		);

		const selectList = new SelectList(
			items,
			Math.min(Math.max(items.length, 4), 12),
			{
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) =>
					theme.fg(
						"muted",
						truncateToWidth(
							text,
							Math.max((tui?.terminal?.columns ?? 100) - 8, 20),
						),
					),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		);
		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);
		container.addChild(selectList);
		container.addChild(
			new Text(
				theme.fg(
					"dim",
					"Type to filter • ↑↓ choose repo • Enter select • Esc cancel",
				),
				1,
				0,
			),
		);
		container.addChild(border);

		return {
			render: () => container.render(tui?.terminal?.columns ?? 100),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

function buildGlobalCommandHelp(
	cwd: string,
	commandName: string,
	candidates: string[],
): string {
	const lines = [
		`No repo-local wiki found from ${cwd}.`,
		"codewiki commands are loaded globally, but each run targets one repo-local wiki.",
		`Try one of these: cd into the repo, run /${commandName} /path/to/repo, or use the picker in UI mode.`,
	];
	if (candidates.length > 0) {
		lines.push(
			"Candidate repos below current cwd:",
			...candidates.slice(0, 8).map((root) => `- ${root}`),
		);
	} else {
		lines.push(
			`No ${PREFERRED_WIKI_CONFIG_RELATIVE_PATH} or .docs/config.json found below current cwd.`,
		);
	}
	return lines.join("\n");
}

async function rebuildAndSummarize(
	projectOrCwd: WikiProject | string,
): Promise<{ text: string; issueCount: number; report: LintReport }> {
	const project =
		typeof projectOrCwd === "string"
			? await loadProject(projectOrCwd)
			: projectOrCwd;
	await runRebuild(project);
	const report = await readJson<LintReport>(project.lintPath);
	const kinds = Object.entries(report.counts)
		.map(([kind, count]) => `${kind}=${count}`)
		.join(" ");
	const issueCount = report.issues.length;
	const text =
		issueCount === 0
			? `${project.label}: rebuild ok. 0 issues. Generated ${report.generated_at}`
			: `${project.label}: rebuild ok. ${issueCount} issue(s). ${kinds || ""}`.trim();
	return { text, issueCount, report };
}

async function readStatus(projectOrCwd: WikiProject | string): Promise<string> {
	const project =
		typeof projectOrCwd === "string"
			? await loadProject(projectOrCwd)
			: projectOrCwd;
	const statusState = await maybeReadStatusState(project.statusStatePath);
	const report = await maybeReadJson<LintReport>(project.lintPath);
	const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
	if (!report || !statusState)
		return `Wiki: ${project.label}\nRoot: ${project.root}\nGenerated metadata missing. Run /wiki-bootstrap first, then /wiki-status to regenerate derived state.`;
	return buildStatusText(project, statusState, report, "both", roadmapState);
}

function normalizeTaskPhaseOrNull(
	value: string | null | undefined,
): TaskPhase | null {
	if (!value) return null;
	return (TASK_PHASE_VALUES as readonly string[]).includes(value)
		? (value as TaskPhase)
		: null;
}

function roadmapApiTaskState(
	task: { status: RoadmapStatus },
	runtimeTask?: RoadmapStateTaskSummary | null,
): { status: ToolTaskStatus; phase: TaskPhase | null } {
	if (task.status === "todo") return { status: "todo", phase: null };
	if (task.status === "blocked") return { status: "blocked", phase: null };
	if (task.status === "done") return { status: "done", phase: null };
	if (task.status === "cancelled") return { status: "cancelled", phase: null };
	if (task.status === "in_progress") {
		return {
			status: "in_progress",
			phase: normalizeTaskPhaseOrNull(runtimeTask?.loop?.phase),
		};
	}
	return {
		status: "in_progress",
		phase: normalizeTaskPhaseOrNull(task.status),
	};
}

function mapToolTaskStatusToRoadmapStatus(
	status: ToolTaskStatus,
	phase: TaskPhase | null,
): RoadmapStatus {
	switch (status) {
		case "todo":
			return "todo";
		case "blocked":
			return "blocked";
		case "done":
			return "done";
		case "cancelled":
			return "cancelled";
		case "in_progress":
			return phase ?? "in_progress";
	}
}

function buildCodewikiStateInclude(
	include: CodewikiStateSection[] | undefined,
	taskId: string | undefined,
): CodewikiStateSection[] {
	const sections = include?.length
		? include
		: (["summary", "roadmap", "session"] as CodewikiStateSection[]);
	return unique(
		taskId ? [...sections, "task"] : sections,
	) as CodewikiStateSection[];
}

async function loadCodewikiStateArtifacts(
	project: WikiProject,
	refresh: boolean,
): Promise<{
	refreshPerformed: boolean;
	report: LintReport | null;
	statusState: StatusStateFile | null;
	roadmapState: RoadmapStateFile | null;
	graph: GraphFile | null;
}> {
	let refreshPerformed = false;
	if (refresh) {
		await runRebuild(project);
		refreshPerformed = true;
	}
	let report = await maybeReadJson<LintReport>(project.lintPath);
	let statusState = await maybeReadStatusState(project.statusStatePath);
	let roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
	let graph = await maybeReadJson<GraphFile>(project.graphPath);
	if (!report || !statusState || !roadmapState || !graph) {
		if (!refreshPerformed) {
			await runRebuild(project);
			refreshPerformed = true;
			report = await maybeReadJson<LintReport>(project.lintPath);
			statusState = await maybeReadStatusState(project.statusStatePath);
			roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
			graph = await maybeReadJson<GraphFile>(project.graphPath);
		}
	}
	return { refreshPerformed, report, statusState, roadmapState, graph };
}

function buildCodewikiNextAction(
	statusState: StatusStateFile | null,
	roadmapState: RoadmapStateFile | null,
	activeLink: TaskSessionLinkRecord | null,
): {
	kind: "resume_task" | "review_blocker" | "create_task" | "none";
	taskId?: string;
	reason: string;
} {
	const focusedTask = activeLink?.taskId
		? (roadmapState?.tasks?.[activeLink.taskId] ?? null)
		: null;
	const focusedTaskId =
		focusedTask && !isClosedRoadmapStatus(focusedTask.status)
			? focusedTask.id
			: null;
	if (focusedTaskId) {
		return {
			kind: "resume_task",
			taskId: focusedTaskId,
			reason: `Current Pi session is focused on ${focusedTaskId}.`,
		};
	}
	const activeTaskId = roadmapState?.views.in_progress_task_ids?.[0];
	if (activeTaskId) {
		return {
			kind: "resume_task",
			taskId: activeTaskId,
			reason: `Roadmap already has active work on ${activeTaskId}.`,
		};
	}
	const todoTaskId = roadmapState?.views.todo_task_ids?.[0];
	if (todoTaskId) {
		return {
			kind: "resume_task",
			taskId: todoTaskId,
			reason: `Next todo task is ${todoTaskId}.`,
		};
	}
	const blockedTaskId = roadmapState?.views.blocked_task_ids?.[0];
	if (blockedTaskId) {
		return {
			kind: "review_blocker",
			taskId: blockedTaskId,
			reason: `Blocked task ${blockedTaskId} needs attention.`,
		};
	}
	if (
		(statusState?.summary.untracked_specs ?? 0) > 0 ||
		(statusState?.summary.unmapped_specs ?? 0) > 0
	) {
		return {
			kind: "create_task",
			reason: "Wiki drift exists without an open roadmap task.",
		};
	}
	return {
		kind: "none",
		reason: "No open roadmap task or urgent wiki drift signal detected.",
	};
}

function buildCodewikiTaskDetail(
	task: RoadmapTaskRecord,
	runtimeTask: RoadmapStateTaskSummary | null,
	contextPacket: RoadmapTaskContextPacket | null,
) {
	const apiState = roadmapApiTaskState(task, runtimeTask);
	const evidence = runtimeTask?.loop?.evidence ?? null;
	const contextPath =
		runtimeTask?.context_path ?? `.wiki/roadmap/tasks/${task.id}/context.json`;
	const enrichedContextPacket = {
		version: contextPacket?.version ?? 1,
		generated_at: contextPacket?.generated_at ?? task.updated,
		context_path: contextPacket?.context_path ?? contextPath,
		...(contextPacket ?? {}),
		task: {
			id: task.id,
			title: task.title,
			status: apiState.status,
			phase: apiState.phase,
			priority: task.priority,
			kind: task.kind,
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
		phase: apiState.phase,
		priority: task.priority,
		kind: task.kind,
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
			? {
					result: evidence.verdict,
					summary: evidence.summary,
					checks_run: evidence.checks_run,
					files_touched: evidence.files_touched,
					issues: evidence.issues,
					updated_at: evidence.updated_at,
				}
			: null,
		updated: task.updated,
	};
}

async function readCodewikiState(
	project: WikiProject,
	ctx: ExtensionContext,
	input: CodewikiStateToolInput,
) {
	const include = buildCodewikiStateInclude(input.include, input.taskId);
	const artifacts = await loadCodewikiStateArtifacts(
		project,
		input.refresh ?? false,
	);
	const activeLink = currentTaskLink(ctx);
	const health = artifacts.statusState?.health ?? {
		color: (artifacts.report?.issues.length ?? 0) > 0 ? "yellow" : "green",
		errors: 0,
		warnings: artifacts.report?.issues.length ?? 0,
		total_issues: artifacts.report?.issues.length ?? 0,
	};
	const nextAction = buildCodewikiNextAction(
		artifacts.statusState,
		artifacts.roadmapState,
		activeLink,
	);
	const result: Record<string, unknown> = {
		repo: {
			repo_root: project.root,
			wiki_root: project.docsRoot,
			resolved_from: input.repoPath?.trim() || project.root,
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
		};
	}
	if (include.includes("graph")) {
		const graph = artifacts.graph;
		result.graph = {
			generated_at: graph?.generated_at ?? null,
			node_count: graph?.nodes.length ?? 0,
			edge_count: graph?.edges.length ?? 0,
			doc_count: graph?.nodes.filter((node) => node.kind === "doc").length ?? 0,
			code_path_count:
				graph?.nodes.filter((node) => node.kind === "code_path").length ?? 0,
			source: "graph",
		};
	}
	if (include.includes("drift")) {
		result.drift = {
			tracked_spec_count: artifacts.statusState?.summary.tracked_specs ?? 0,
			untracked_spec_count: artifacts.statusState?.summary.untracked_specs ?? 0,
			blocked_spec_count: artifacts.statusState?.summary.blocked_specs ?? 0,
			high_risk_spec_paths:
				artifacts.statusState?.views.top_risky_spec_paths ?? [],
		};
	}
	if (include.includes("session")) {
		result.session = {
			focused_task_id:
				activeLink?.action === "clear" ? null : (activeLink?.taskId ?? null),
			updated_at: activeLink?.timestamp ?? null,
			summary: activeLink?.summary || null,
		};
	}
	if (include.includes("task")) {
		if (!input.taskId) {
			result.task = null;
		} else {
			const task = await readRoadmapTask(project, input.taskId);
			if (!task) throw new Error(`Roadmap task not found: ${input.taskId}`);
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

function formatCodewikiStateSummary(
	project: WikiProject,
	result: Record<string, unknown>,
): string {
	const summary = (result.summary ?? {}) as {
		open_task_count?: number;
		next_task_id?: string | null;
		unmapped_spec_count?: number;
	};
	const nextAction = (result.next_action ?? {}) as {
		reason?: string;
	};
	return `${project.label}: open ${summary.open_task_count ?? 0}; next ${summary.next_task_id ?? "none"}; unmapped specs ${summary.unmapped_spec_count ?? 0}. ${nextAction.reason ?? ""}`.trim();
}

function hasCodewikiTaskPatchChanges(
	patch: CodewikiTaskPatchInput | undefined,
): patch is CodewikiTaskPatchInput {
	return Boolean(
		patch &&
			(patch.title !== undefined ||
				patch.priority !== undefined ||
				patch.kind !== undefined ||
				patch.summary !== undefined ||
				patch.status !== undefined ||
				patch.phase !== undefined ||
				patch.spec_paths !== undefined ||
				patch.code_paths !== undefined ||
				patch.research_ids !== undefined ||
				patch.labels !== undefined ||
				patch.goal?.outcome !== undefined ||
				patch.goal?.acceptance !== undefined ||
				patch.goal?.non_goals !== undefined ||
				patch.goal?.verification !== undefined ||
				patch.delta?.desired !== undefined ||
				patch.delta?.current !== undefined ||
				patch.delta?.closure !== undefined),
	);
}

function buildRoadmapTaskUpdateFromCodewikiPatch(
	task: RoadmapTaskRecord,
	runtimeTask: RoadmapStateTaskSummary | null,
	patch: CodewikiTaskPatchInput,
): RoadmapTaskUpdateInput {
	if (
		patch.phase !== undefined &&
		patch.status &&
		patch.status !== "in_progress"
	) {
		throw new Error(
			"Task phase can only be set when status is omitted or 'in_progress'.",
		);
	}
	const currentState = roadmapApiTaskState(task, runtimeTask);
	const requestedStatus =
		patch.status ??
		(patch.phase !== undefined ? "in_progress" : currentState.status);
	const requestedPhase =
		patch.phase === undefined ? currentState.phase : patch.phase;
	return {
		taskId: task.id,
		title: patch.title,
		priority: patch.priority,
		kind: patch.kind,
		summary: patch.summary,
		status: mapToolTaskStatusToRoadmapStatus(requestedStatus, requestedPhase),
		spec_paths: patch.spec_paths,
		code_paths: patch.code_paths,
		research_ids: patch.research_ids,
		labels: patch.labels,
		goal: patch.goal,
		delta: patch.delta,
	};
}

async function appendCodewikiTaskEvidence(
	project: WikiProject,
	task: RoadmapTaskRecord,
	evidence: CodewikiTaskEvidenceInput,
	refresh = true,
): Promise<void> {
	await withLockedPaths(
		[
			resolve(project.root, project.eventsPath),
			...(refresh ? rebuildTargetPaths(project) : []),
		],
		async () => {
			await appendTaskEvidenceEvent(project, task, {
				verdict: evidence.result ?? "progress",
				summary: evidence.summary.trim(),
				checks_run: unique(evidence.checks_run ?? []),
				files_touched: unique(evidence.files_touched ?? []),
				issues: unique(evidence.issues ?? []),
			});
			if (refresh) await runRebuildUnlocked(project);
		},
	);
}

function summarizeCodewikiTaskAction(result: {
	action: string;
	canonical_task_ids: string[];
	task?: { id: string; status: ToolTaskStatus; phase: TaskPhase | null } | null;
	evidence_recorded: boolean;
	created?: Array<{ id: string }>;
	reused?: Array<{ id: string }>;
}): string {
	if (result.action === "create") {
		const created = result.created?.map((entry) => entry.id) ?? [];
		const reused = result.reused?.map((entry) => entry.id) ?? [];
		const parts = [];
		if (created.length > 0) parts.push(`created ${created.join(", ")}`);
		if (reused.length > 0) parts.push(`reused ${reused.join(", ")}`);
		return parts.length > 0
			? `codewiki task: ${parts.join("; ")}`
			: "codewiki task: no task changes";
	}
	if (!result.task) return `codewiki task: ${result.action} complete`;
	const phase = result.task.phase ? ` / ${result.task.phase}` : "";
	const evidence = result.evidence_recorded ? "; evidence recorded" : "";
	return `codewiki task: ${result.task.id} -> ${result.task.status}${phase}${evidence}`;
}

async function executeCodewikiTask(
	pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext,
	input: CodewikiTaskToolInput,
) {
	const refresh = input.refresh ?? true;
	if (input.action === "clear-archive") {
		if (!input.summary?.trim()) {
			throw new Error(
				"codewiki_task clear-archive requires summary confirmation.",
			);
		}
		const archivePath = roadmapArchivePath(project);
		await withLockedPaths([archivePath], async () => {
			await mkdir(dirname(archivePath), { recursive: true });
			const compressed = archivePath.endsWith(".gz");
			await writeFile(archivePath, compressed ? gzipSync("") : "", "utf8");
		});
		await appendProjectEvent(project, {
			ts: nowIso(),
			kind: "roadmap_archive_cleared",
			title: "Cleared roadmap archive",
			summary: input.summary.trim(),
			path: archivePath.replace(`${project.root}/`, ""),
		});
		if (refresh) await runRebuild(project);
		return {
			action: "clear-archive" as const,
			changed: true,
			archive_path: archivePath.replace(`${project.root}/`, ""),
			summary: `codewiki task: cleared roadmap archive ${archivePath.replace(`${project.root}/`, "")}`,
		};
	}
	if (input.action === "create") {
		if (!input.tasks?.length)
			throw new Error("codewiki_task create requires tasks.");
		const result = await appendRoadmapTasks(pi, project, ctx, input.tasks, {
			refresh,
		});
		const details = {
			action: "create" as const,
			changed: result.created.length > 0,
			canonical_task_ids: [...result.created, ...result.reused].map(
				(task) => task.id,
			),
			created: result.created.map((task) => ({
				id: task.id,
				title: task.title,
				status: roadmapApiTaskState(task).status,
			})),
			reused: result.reused.map((task) => ({
				id: task.id,
				title: task.title,
				status: roadmapApiTaskState(task).status,
			})),
			evidence_recorded: false,
			summary: "",
		};
		details.summary = summarizeCodewikiTaskAction(details);
		return details;
	}
	if (!input.taskId?.trim()) {
		throw new Error(`codewiki_task ${input.action} requires taskId.`);
	}
	if (input.action === "cancel") {
		if (!input.summary?.trim()) {
			throw new Error("codewiki_task cancel requires summary.");
		}
	}
	if (
		input.action === "update" &&
		!hasCodewikiTaskPatchChanges(input.patch) &&
		!input.evidence
	) {
		throw new Error("codewiki_task update requires patch or evidence.");
	}
	if (
		input.action === "update" &&
		input.evidence?.result &&
		["pass", "fail", "block"].includes(input.evidence.result) &&
		input.patch?.status !== undefined
	) {
		throw new Error(
			"Use evidence.result pass/fail/block without patch.status; lifecycle evidence owns the status transition.",
		);
	}
	const existingTask = await readRoadmapTask(project, input.taskId);
	if (!existingTask) throw new Error(`Roadmap task not found: ${input.taskId}`);
	let runtimeState = await maybeReadRoadmapState(project.roadmapStatePath);
	let runtimeTask = runtimeState?.tasks?.[existingTask.id] ?? null;
	let latestTask = existingTask;
	let changed = false;
	let evidenceRecorded = false;

	if (input.action === "close") {
		const closeResult = await updateRoadmapTask(
			project,
			{
				taskId: existingTask.id,
				status: "done",
				summary: input.summary,
			},
			{ refresh: false },
		);
		latestTask = closeResult.task;
		changed = true;
		if (input.evidence) {
			await appendCodewikiTaskEvidence(
				project,
				latestTask,
				input.evidence,
				false,
			);
			evidenceRecorded = true;
		}
	} else if (input.action === "cancel") {
		const cancelResult = await updateRoadmapTask(
			project,
			{
				taskId: existingTask.id,
				status: "cancelled",
				summary: input.summary,
			},
			{ refresh: false },
		);
		latestTask = cancelResult.task;
		changed = true;
	} else {
		if (hasCodewikiTaskPatchChanges(input.patch)) {
			const patchUpdate = buildRoadmapTaskUpdateFromCodewikiPatch(
				latestTask,
				runtimeTask,
				input.patch,
			);
			if (hasRoadmapTaskUpdateFields(patchUpdate)) {
				const patchResult = await updateRoadmapTask(project, patchUpdate, {
					refresh: false,
				});
				latestTask = patchResult.task;
				changed = true;
				runtimeState = await maybeReadRoadmapState(project.roadmapStatePath);
				runtimeTask = runtimeState?.tasks?.[latestTask.id] ?? null;
			}
		}
		if (input.evidence) {
			if (
				input.evidence.result === "pass" ||
				input.evidence.result === "fail" ||
				input.evidence.result === "block"
			) {
				if (input.patch?.phase === null) {
					throw new Error(
						"Lifecycle evidence cannot run with patch.phase=null; provide a concrete phase or omit it.",
					);
				}
				await updateTaskLoop(
					project,
					{
						taskId: latestTask.id,
						action: input.evidence.result,
						phase: input.patch?.phase ?? undefined,
						summary: input.evidence.summary,
						checks_run: input.evidence.checks_run,
						files_touched: input.evidence.files_touched,
						issues: input.evidence.issues,
					},
					{ refresh: false },
				);
				evidenceRecorded = true;
				changed = true;
				const reloadedTask = await readRoadmapTask(project, latestTask.id);
				if (reloadedTask) latestTask = reloadedTask;
			} else {
				await appendCodewikiTaskEvidence(
					project,
					latestTask,
					input.evidence,
					false,
				);
				evidenceRecorded = true;
			}
		}
	}
	if (refresh && (changed || evidenceRecorded)) await runRebuild(project);
	const finalRoadmapState = await maybeReadRoadmapState(
		project.roadmapStatePath,
	);
	const finalRuntimeTask =
		finalRoadmapState?.tasks?.[latestTask.id] ?? runtimeTask;
	const finalContextPacket = await maybeReadTaskContext(
		project,
		latestTask.id,
		finalRuntimeTask,
	);
	const finalState = buildCodewikiTaskDetail(
		latestTask,
		finalRuntimeTask,
		finalContextPacket,
	);
	const result = {
		action: input.action,
		changed,
		canonical_task_ids: [latestTask.id],
		task: {
			id: finalState.id,
			title: finalState.title,
			status: finalState.status,
			phase: finalState.phase,
			updated: finalState.updated,
		},
		evidence_recorded: evidenceRecorded,
		summary: "",
		created: undefined,
		reused: undefined,
	};
	result.summary = summarizeCodewikiTaskAction(result);
	return result;
}

function buildCodewikiSessionSummary(result: {
	action: "focus" | "note" | "clear";
	session: { focused_task_id: string | null };
}): string {
	if (result.action === "clear") return "codewiki session: focus cleared";
	if (!result.session.focused_task_id)
		return `codewiki session: ${result.action} recorded`;
	return `codewiki session: ${result.action} ${result.session.focused_task_id}`;
}

async function executeCodewikiSession(
	pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext,
	input: CodewikiSessionToolInput,
) {
	if (input.action === "clear") {
		const active = currentTaskLink(ctx);
		if (!active) {
			return {
				action: "clear" as const,
				session: {
					focused_task_id: null,
					updated_at: nowIso(),
					summary: input.summary?.trim() || null,
				},
				renamed: false,
				summary: buildCodewikiSessionSummary({
					action: "clear",
					session: { focused_task_id: null },
				}),
			};
		}
		await linkTaskSession(
			pi,
			project,
			ctx,
			{
				taskId: active.taskId,
				action: "clear",
				summary:
					input.summary?.trim() ||
					`Cleared current Pi session focus from ${active.taskId}.`,
				setSessionName: false,
			},
			{ refresh: true },
		);
		const result = {
			action: "clear" as const,
			session: {
				focused_task_id: null,
				updated_at: nowIso(),
				summary: input.summary?.trim() || null,
			},
			renamed: false,
			summary: "",
		};
		result.summary = buildCodewikiSessionSummary(result);
		return result;
	}
	const taskId = input.taskId?.trim() || currentTaskLink(ctx)?.taskId;
	if (!taskId) {
		throw new Error(
			`codewiki_session ${input.action} requires taskId or an active focused task.`,
		);
	}
	const summary =
		input.summary?.trim() ||
		(input.action === "focus"
			? `Focused current Pi session on ${taskId}.`
			: `Recorded runtime session note for ${taskId}.`);
	const result = await linkTaskSession(
		pi,
		project,
		ctx,
		{
			taskId,
			action: input.action,
			summary,
			filesTouched: unique(input.files_touched ?? []),
			spawnedTaskIds: [],
			setSessionName:
				input.action === "focus" ? (input.setSessionName ?? false) : false,
		},
		{ refresh: true },
	);
	const sessionResult = {
		action: input.action,
		session: {
			focused_task_id:
				input.action === "focus" || input.action === "note"
					? result.taskId
					: null,
			updated_at: nowIso(),
			summary,
		},
		renamed: input.action === "focus" ? Boolean(input.setSessionName) : false,
		summary: "",
	};
	sessionResult.summary = buildCodewikiSessionSummary(sessionResult);
	return sessionResult;
}

async function browseRoadmap(
	project: WikiProject,
	roadmap: RoadmapFile,
	ctx: ExtensionCommandContext,
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(formatRoadmapSnapshot(project, roadmap), "info");
		return;
	}

	while (true) {
		const selectedTaskId = await selectRoadmapTask(project, roadmap, ctx);
		if (!selectedTaskId) return;
		const task = roadmap.tasks[selectedTaskId];
		if (!task) continue;
		await showRoadmapTask(project, roadmap, task, ctx);
	}
}

async function selectRoadmapTask(
	project: WikiProject,
	roadmap: RoadmapFile,
	ctx: ExtensionCommandContext,
): Promise<string | null> {
	const items = buildRoadmapSelectItems(roadmap);
	if (items.length === 0) {
		ctx.ui.notify(
			`${project.label}: no roadmap tasks found in ${project.roadmapPath}`,
			"warning",
		);
		return null;
	}
	const counts = formatRoadmapCounts(roadmap);

	return ctx.ui.custom<string | null>(
		(tui, theme, _kb, done) => {
			const container = new Container();
			const border = new DynamicBorder((s: string) => theme.fg("accent", s));

			container.addChild(border);
			container.addChild(
				new Text(
					theme.fg("accent", theme.bold(`Roadmap — ${project.label}`)),
					1,
					0,
				),
			);
			container.addChild(
				new Text(
					theme.fg("muted", `${items.length} task(s) • ${counts}`),
					1,
					0,
				),
			);

			const selectList = new SelectList(
				items,
				Math.min(Math.max(items.length, 6), 14),
				{
					selectedPrefix: (text) => theme.fg("accent", text),
					selectedText: (text) => theme.fg("accent", text),
					description: (text) => theme.fg("muted", text),
					scrollInfo: (text) => theme.fg("dim", text),
					noMatch: (text) => theme.fg("warning", text),
				},
			);
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);
			container.addChild(selectList);

			container.addChild(
				new Text(
					theme.fg(
						"dim",
						"Type to filter • ↑↓ navigate • Enter inspect • Esc close",
					),
					1,
					0,
				),
			);
			container.addChild(border);

			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "88%",
				maxHeight: "78%",
				margin: 1,
			},
		},
	);
}

async function showRoadmapTask(
	project: WikiProject,
	roadmap: RoadmapFile,
	task: RoadmapTaskRecord,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const text = formatRoadmapTaskText(project, roadmap, task);
	if (!ctx.hasUI) {
		ctx.ui.notify(text, "info");
		return;
	}

	await ctx.ui.custom<void>(
		(_tui, theme, _kb, done) => {
			const container = new Container();
			const border = new DynamicBorder((s: string) => theme.fg("accent", s));
			const mdTheme = getMarkdownTheme();

			container.addChild(border);
			container.addChild(
				new Text(
					theme.fg("accent", theme.bold(`${task.id} — ${task.title}`)),
					1,
					0,
				),
			);
			container.addChild(new Markdown(text, 1, 1, mdTheme));
			container.addChild(
				new Text(
					theme.fg("dim", "Press Enter or Esc to return to the roadmap"),
					1,
					0,
				),
			);
			container.addChild(border);

			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					if (matchesKey(data, "enter") || matchesKey(data, "escape")) done();
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "88%",
				maxHeight: "82%",
				margin: 1,
			},
		},
	);
}

function buildRoadmapSelectItems(roadmap: RoadmapFile): SelectItem[] {
	return roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task))
		.map((task) => ({
			value: task.id,
			label: `${task.id} [${task.status}] ${task.title}`,
			description: `${task.priority} • ${task.kind} • ${task.summary}`,
		}));
}

function formatRoadmapCounts(roadmap: RoadmapFile): string {
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task));
	const counts = countBy(ordered.map((task) => task.status));
	return (
		Object.entries(counts)
			.map(([key, value]) => `${key}=${value}`)
			.join(" ") || "no tasks"
	);
}

function normalizeRequestedTaskId(args: string): string | null {
	const trimmed = args.trim();
	return trimmed ? trimmed : null;
}

function normalizeCodeArgs(args: string): {
	requestedTaskId: string | null;
	pathArg: string | null;
} {
	const tokens = splitCommandArgs(args);
	if (tokens.length === 0) return { requestedTaskId: null, pathArg: null };

	const first = tokens[0];
	const last = tokens[tokens.length - 1];
	if (isRoadmapTaskToken(first)) {
		return {
			requestedTaskId: first,
			pathArg: joinCommandArgs(tokens.slice(1)),
		};
	}
	if (tokens.length > 1 && isRoadmapTaskToken(last)) {
		return {
			requestedTaskId: last,
			pathArg: joinCommandArgs(tokens.slice(0, -1)),
		};
	}
	return { requestedTaskId: null, pathArg: joinCommandArgs(tokens) };
}

async function runResumeCommand(
	pi: ExtensionAPI,
	commandName: "wiki-resume",
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const { requestedTaskId, pathArg } = normalizeCodeArgs(args);
	const project = await resolveCommandProject(ctx, pathArg, commandName);
	const summary = await rebuildAndSummarize(project);
	const graph = await maybeReadGraph(project.graphPath);
	const roadmap = await readRoadmapFile(
		resolve(project.root, project.roadmapPath),
	);
	const task = resolveImplementationTask(
		roadmap,
		currentTaskLink(ctx),
		requestedTaskId,
	);
	if (!task) {
		ctx.ui.notify(
			`${project.label}: no open roadmap task available for /${commandName}. Open /wiki-status or use Alt+W if you need a different direction.`,
			"warning",
		);
		await refreshStatusDock(project, ctx, currentTaskLink(ctx));
		return;
	}
	let resumedTask = task;
	let roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
	let runtimeTask = roadmapState?.tasks?.[task.id] ?? null;
	const initialPhase = taskLoopPhase(runtimeTask);
	const desiredStatus: RoadmapStatus =
		task.status === "todo" || task.status === "research"
			? "implement"
			: task.status === "in_progress" || task.status === "blocked"
				? normalizeTaskPhaseValue(initialPhase, "implement")
				: task.status;
	if (desiredStatus !== task.status) {
		resumedTask = (
			await updateRoadmapTask(project, {
				taskId: task.id,
				status: desiredStatus,
			})
		).task;
		roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
		runtimeTask = roadmapState?.tasks?.[task.id] ?? null;
	}
	const selectionReason = describeResumeSelection(
		roadmap,
		currentTaskLink(ctx),
		requestedTaskId,
		resumedTask,
	);
	const action: TaskSessionAction =
		requestedTaskId || currentTaskLink(ctx)?.taskId !== resumedTask.id
			? "focus"
			: "progress";
	const sessionSummary =
		action === "focus"
			? `Focused roadmap work on ${resumedTask.id} through /${commandName}.`
			: `Resumed roadmap work on ${resumedTask.id} through /${commandName}.`;
	await linkTaskSession(pi, project, ctx, {
		taskId: resumedTask.id,
		action,
		summary: sessionSummary,
		setSessionName: false,
	});
	const activeLink: TaskSessionLinkRecord = {
		taskId: resumedTask.id,
		action,
		summary: sessionSummary,
		filesTouched: [],
		spawnedTaskIds: [],
		timestamp: nowIso(),
	};
	const phase = taskLoopPhase(runtimeTask);
	const evidence = taskLoopEvidenceLine(runtimeTask);
	await appendTaskPhaseEvent(
		project,
		resumedTask,
		"task_phase_started",
		phase,
		{
			summary: `Queued ${phaseLabel(phase)} through /${commandName}.`,
		},
	);
	await runRebuild(project);
	const refreshedRoadmapState = await maybeReadRoadmapState(
		project.roadmapStatePath,
	);
	const refreshedRuntimeTask =
		refreshedRoadmapState?.tasks?.[resumedTask.id] ?? null;
	const taskContext = await maybeReadTaskContext(
		project,
		resumedTask.id,
		refreshedRuntimeTask,
	);
	const refreshedGraph = (await maybeReadGraph(project.graphPath)) ?? graph;
	ctx.ui.notify(
		`${project.label}: queued ${phaseLabel(phase)} for ${resumedTask.id} — ${resumedTask.title}. ${selectionReason} Deterministic preflight is ${statusColor(summary.report)}.`,
		statusLevel(summary.report),
	);
	await refreshStatusDock(project, ctx, activeLink);
	await queueAudit(
		pi,
		ctx,
		codePrompt(
			project,
			refreshedGraph,
			summary.report,
			resumedTask,
			phase,
			evidence,
			taskContext,
		),
	);
}

function parseEnumAndPath<T extends string>(
	args: string,
	values: readonly T[],
	defaultValue: T,
): { value: T; pathArg: string | null } {
	const tokens = splitCommandArgs(args);
	if (tokens.length === 0) return { value: defaultValue, pathArg: null };

	const first = tokens[0] as T;
	const last = tokens[tokens.length - 1] as T;
	if ((values as readonly string[]).includes(first)) {
		return { value: first, pathArg: joinCommandArgs(tokens.slice(1)) };
	}
	if (tokens.length > 1 && (values as readonly string[]).includes(last)) {
		return { value: last, pathArg: joinCommandArgs(tokens.slice(0, -1)) };
	}
	return { value: defaultValue, pathArg: joinCommandArgs(tokens) };
}

function splitCommandArgs(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function joinCommandArgs(tokens: string[]): string | null {
	const value = tokens.join(" ").trim();
	return value ? value : null;
}

function isRoadmapTaskToken(value: string): boolean {
	return /^(TASK|ROADMAP)-\d+$/i.test(value);
}

function resolveImplementationTask(
	roadmap: RoadmapFile,
	activeLink: TaskSessionLinkRecord | null,
	requestedTaskId: string | null,
): RoadmapTaskRecord | null {
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task));
	const activeTask = activeLink
		? resolveRoadmapTask(roadmap, activeLink.taskId)
		: null;
	const linkedActiveLoopTask =
		activeTask && isActiveLoopRoadmapStatus(activeTask.status)
			? activeTask
			: null;
	const activeWorkTask =
		linkedActiveLoopTask ??
		ordered.find((task) => isActiveLoopRoadmapStatus(task.status));

	if (requestedTaskId) {
		const requestedTask = resolveRoadmapTask(roadmap, requestedTaskId);
		if (!requestedTask)
			throw new Error(`Roadmap task not found: ${requestedTaskId}`);
		if (isClosedRoadmapStatus(requestedTask.status))
			throw new Error(`Roadmap task already closed: ${requestedTask.id}`);
		if (
			requestedTask.status === "todo" &&
			activeWorkTask &&
			activeWorkTask.id !== requestedTask.id
		) {
			throw new Error(
				`Roadmap task ${requestedTask.id} cannot start yet. ${activeWorkTask.id} is still active in ${activeWorkTask.status}; resume or finish active loop work first.`,
			);
		}
		return requestedTask;
	}

	if (activeWorkTask) return activeWorkTask;
	if (activeTask && !isClosedRoadmapStatus(activeTask.status))
		return activeTask;
	const todoTask = ordered.find((task) => task.status === "todo");
	if (todoTask) return todoTask;
	return null;
}

function describeResumeSelection(
	roadmap: RoadmapFile,
	activeLink: TaskSessionLinkRecord | null,
	requestedTaskId: string | null,
	task: RoadmapTaskRecord,
): string {
	if (requestedTaskId) return `User requested ${task.id} explicitly.`;
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((item): item is RoadmapTaskRecord => Boolean(item));
	const activeTask = activeLink
		? resolveRoadmapTask(roadmap, activeLink.taskId)
		: null;
	const hasOtherTodo = ordered.some(
		(item) => item.status === "todo" && item.id !== task.id,
	);
	if (activeTask?.id === task.id && isActiveLoopRoadmapStatus(task.status)) {
		return hasOtherTodo
			? `Continuing session-focused ${task.status} work before opening next todo task.`
			: `Continuing session-focused ${task.status} work.`;
	}
	if (isActiveLoopRoadmapStatus(task.status)) {
		return hasOtherTodo
			? `Continuing active ${task.status} work before opening next todo task.`
			: `Continuing active ${task.status} work.`;
	}
	return task.status === "todo"
		? "No active loop work found; starting next todo task in implement."
		: `Continuing ${task.status} work.`;
}

function formatRoadmapSnapshot(
	project: WikiProject,
	roadmap: RoadmapFile,
): string {
	const ordered = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task));
	const lines = [
		`Roadmap: ${project.label}`,
		`Path: ${project.roadmapPath}`,
		`Tasks: ${ordered.length} (${formatRoadmapCounts(roadmap)})`,
		"",
	];
	for (const task of ordered.slice(0, 10)) {
		lines.push(`${task.id} [${task.status}] ${task.title}`);
	}
	if (ordered.length > 10) lines.push(`... ${ordered.length - 10} more`);
	return lines.join("\n");
}

function formatRoadmapTaskText(
	project: WikiProject,
	roadmap: RoadmapFile,
	task: RoadmapTaskRecord,
): string {
	const position = roadmap.order.indexOf(task.id);
	const lines = [
		`# ${task.id} — ${task.title}`,
		"",
		`- Wiki: ${project.label}`,
		`- Status: \`${task.status}\``,
		`- Priority: \`${task.priority}\``,
		`- Kind: \`${task.kind}\``,
		`- Position: ${position >= 0 ? `${position + 1}/${roadmap.order.length}` : "untracked"}`,
	];

	if (task.labels.length > 0)
		lines.push(
			`- Labels: ${task.labels.map((label) => `\`${label}\``).join(", ")}`,
		);
	lines.push("", "## Summary", "", task.summary);

	if (
		task.goal.outcome ||
		task.goal.acceptance.length > 0 ||
		task.goal.non_goals.length > 0 ||
		task.goal.verification.length > 0
	) {
		lines.push("", "## Goal", "");
		if (task.goal.outcome) lines.push(`- Outcome: ${task.goal.outcome}`);
		if (task.goal.acceptance.length > 0)
			lines.push(
				"- Success signals:",
				...task.goal.acceptance.map((item) => `  - ${item}`),
			);
		if (task.goal.non_goals.length > 0)
			lines.push(
				"- Non-goals:",
				...task.goal.non_goals.map((item) => `  - ${item}`),
			);
		if (task.goal.verification.length > 0)
			lines.push(
				"- Verification:",
				...task.goal.verification.map((item) => `  - ${item}`),
			);
	}

	lines.push("", "## Delta", "");
	lines.push(`- Desired: ${task.delta.desired}`);
	lines.push(`- Current: ${task.delta.current}`);
	lines.push(`- Closure: ${task.delta.closure}`);

	if (task.spec_paths.length > 0) {
		lines.push(
			"",
			"## Spec paths",
			"",
			...task.spec_paths.map((path) => `- \`${path}\``),
		);
	}
	if (task.code_paths.length > 0) {
		lines.push(
			"",
			"## Code paths",
			"",
			...task.code_paths.map((path) => `- \`${path}\``),
		);
	}
	if (task.research_ids.length > 0) {
		lines.push(
			"",
			"## Research ids",
			"",
			...task.research_ids.map((researchId) => `- \`${researchId}\``),
		);
	}

	lines.push(
		"",
		"## Next step",
		"",
		`Use internal task-session linking when the current Pi session is centered on ${task.id}.`,
	);
	return lines.join("\n");
}

async function runRebuild(project: WikiProject): Promise<void> {
	return withLockedPaths(rebuildTargetPaths(project), async () => {
		await runRebuildUnlocked(project);
	});
}

async function runRebuildUnlocked(project: WikiProject): Promise<void> {
	const configuredCommand = sanitizeCommand(
		project.config.codewiki?.rebuild_command,
	);
	const commands = configuredCommand
		? uniqueCommands([
				configuredCommand,
				...pythonAliasFallback(configuredCommand),
			])
		: await detectRebuildCommands(project.root);

	if (commands.length === 0) {
		throw new Error(
			`No rebuild command configured. Add codewiki.rebuild_command to ${PREFERRED_WIKI_CONFIG_RELATIVE_PATH} or provide ${DEFAULT_REBUILD_SCRIPT}.`,
		);
	}

	let lastError: unknown;
	for (const command of commands) {
		try {
			await execFileAsync(command[0], command.slice(1), {
				cwd: project.root,
				timeout: 120_000,
			});
			return;
		} catch (error) {
			lastError = error;
		}
	}

	throw new Error(`Rebuild failed: ${formatError(lastError)}`);
}

function rebuildTargetPaths(project: WikiProject): string[] {
	return [
		...(project.indexPath ? [resolve(project.root, project.indexPath)] : []),
		...(project.roadmapDocPath
			? [resolve(project.root, project.roadmapDocPath)]
			: []),
		resolve(project.root, project.eventsPath),
		...GENERATED_METADATA_FILES.map((fileName) =>
			resolve(project.root, project.metaRoot, fileName),
		),
	];
}

function roadmapMutationTargetPaths(project: WikiProject): string[] {
	return [
		resolve(project.root, project.roadmapPath),
		resolve(project.root, project.eventsPath),
		resolve(project.root, project.roadmapEventsPath),
		...rebuildTargetPaths(project),
	];
}

async function detectRebuildCommands(root: string): Promise<string[][]> {
	const scriptPath = resolve(root, DEFAULT_REBUILD_SCRIPT);
	if (!(await pathExists(scriptPath))) return [];
	return [
		["python3", DEFAULT_REBUILD_SCRIPT],
		["python", DEFAULT_REBUILD_SCRIPT],
	];
}

async function maybeLoadProject(startDir: string): Promise<WikiProject | null> {
	try {
		return await loadProject(startDir);
	} catch {
		return null;
	}
}

async function loadProject(startDir: string): Promise<WikiProject> {
	const root = await requireWikiRoot(startDir);
	const configPath = await resolveWikiConfigPath(root);
	if (!configPath) {
		throw new Error(
			`No ${PREFERRED_WIKI_CONFIG_RELATIVE_PATH} found at wiki root ${root}. Run /wiki-bootstrap first.`,
		);
	}

	const config = await readJson<DocsConfig>(configPath);
	const docsRoot = normalizeRelativePath(config.wiki_root ?? DEFAULT_DOCS_ROOT);
	const specsRoot = normalizeRelativePath(
		config.specs_root ?? DEFAULT_SPECS_ROOT,
	);
	const researchRoot = normalizeRelativePath(
		config.evidence_root ?? config.research_root ?? DEFAULT_EVIDENCE_ROOT,
	);
	const indexPath = optionalRelativePath(
		config.index_path ?? DEFAULT_INDEX_PATH,
	);
	const roadmapPath = normalizeRelativePath(
		config.roadmap_path ?? DEFAULT_ROADMAP_PATH,
	);
	const roadmapDocPath = optionalRelativePath(
		config.roadmap_doc_path ?? DEFAULT_ROADMAP_DOC_PATH,
	);
	const roadmapEventsPath = normalizeRelativePath(
		config.roadmap_events_path ?? DEFAULT_ROADMAP_EVENTS_PATH,
	);
	const metaRoot = normalizeRelativePath(config.meta_root ?? DEFAULT_META_ROOT);
	const label = config.codewiki?.name ?? config.project_name ?? basename(root);

	return {
		root,
		label,
		config,
		docsRoot,
		specsRoot,
		researchRoot,
		indexPath,
		roadmapPath,
		roadmapDocPath,
		metaRoot,
		configPath,
		lintPath: resolve(root, metaRoot, "lint.json"),
		graphPath: resolve(root, metaRoot, "graph.json"),
		eventsPath: resolve(root, metaRoot, "events.jsonl"),
		roadmapEventsPath,
		roadmapStatePath: resolve(root, metaRoot, "roadmap-state.json"),
		statusStatePath: resolve(root, metaRoot, "status-state.json"),
	};
}

async function appendRoadmapTasks(
	pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext,
	tasks: RoadmapTaskInput[],
	options: { refresh?: boolean } = {},
): Promise<{ created: RoadmapTaskRecord[]; reused: RoadmapTaskRecord[] }> {
	if (tasks.length === 0) throw new Error("No roadmap tasks provided.");

	return withLockedPaths(roadmapMutationTargetPaths(project), async () => {
		const roadmapPath = resolve(project.root, project.roadmapPath);
		const roadmap = await readRoadmapFile(roadmapPath);
		const createdAt = todayIso();
		const nextId = createTaskIdAllocator(Object.keys(roadmap.tasks));
		const created: RoadmapTaskRecord[] = [];
		const reused: RoadmapTaskRecord[] = [];

		for (const input of tasks) {
			const duplicate = findLikelyDuplicateRoadmapTask(roadmap, input);
			if (duplicate) {
				const coordinated = isClosedRoadmapStatus(duplicate.status)
					? applyRoadmapTaskUpdate(
							duplicate,
							{ taskId: duplicate.id, status: "todo" },
							createdAt,
						)
					: duplicate;
				roadmap.tasks[coordinated.id] = coordinated;
				reused.push(coordinated);
				continue;
			}
			const task = normalizeRoadmapTask(input, nextId, createdAt);
			roadmap.tasks[task.id] = task;
			roadmap.order.push(task.id);
			created.push(task);
		}
		roadmap.updated = nowIso();

		await writeJsonFile(roadmapPath, roadmap);
		if (created.length > 0) {
			await appendRoadmapHistoryEvent(project, "append", created);
			await appendRoadmapEvent(project, "append", created);
		}
		if (reused.length > 0) {
			await appendRoadmapHistoryEvent(project, "update", reused);
			await appendRoadmapEvent(project, "update", reused);
		}
		const sessionId = currentSessionId(ctx);
		for (const task of created) {
			const link: TaskSessionLinkRecord = {
				taskId: task.id,
				action: "spawn",
				summary: `Spawned task ${task.id} in current Pi session.`,
				filesTouched: [],
				spawnedTaskIds: [],
				timestamp: nowIso(),
			};
			await recordTaskSessionLinkUnlocked(pi, ctx, task, link);
			await appendTaskSessionEvent(project, task, link, sessionId);
		}
		for (const task of reused) {
			const link: TaskSessionLinkRecord = {
				taskId: task.id,
				action: "focus",
				summary: `Reused tracked roadmap task ${task.id} instead of creating duplicate work.`,
				filesTouched: [],
				spawnedTaskIds: [],
				timestamp: nowIso(),
			};
			await recordTaskSessionLinkUnlocked(pi, ctx, task, link);
			await appendTaskSessionEvent(project, task, link, sessionId);
		}
		if (options.refresh ?? true) await runRebuildUnlocked(project);
		return { created, reused };
	});
}

async function updateRoadmapTask(
	project: WikiProject,
	input: RoadmapTaskUpdateInput,
	options: { refresh?: boolean } = {},
): Promise<{ action: "update" | "close"; task: RoadmapTaskRecord }> {
	if (!hasRoadmapTaskUpdateFields(input))
		throw new Error("No roadmap task changes provided.");

	return withLockedPaths(roadmapMutationTargetPaths(project), async () => {
		const roadmapPath = resolve(project.root, project.roadmapPath);
		const roadmap = await readRoadmapFile(roadmapPath);
		const existing = resolveRoadmapTask(roadmap, input.taskId);
		if (!existing) throw new Error(`Roadmap task not found: ${input.taskId}`);

		const updatedTask = applyRoadmapTaskUpdate(existing, input, todayIso());
		const action =
			isClosedRoadmapStatus(existing.status) ||
			!isClosedRoadmapStatus(updatedTask.status)
				? "update"
				: "close";

		if (action === "close") {
			await assertTaskCloseable(project, updatedTask.id);
		}

		roadmap.tasks[updatedTask.id] = updatedTask;
		roadmap.updated = nowIso();

		await writeJsonFile(roadmapPath, roadmap);
		if (action === "close") {
			await appendTaskEvidenceEvent(project, updatedTask, {
				verdict: "pass",
				summary:
					input.summary?.trim() ||
					updatedTask.summary ||
					`Closed ${updatedTask.id}.`,
				checks_run: updatedTask.goal.verification,
				files_touched: updatedTask.code_paths,
				issues: [],
			});
		}
		await appendRoadmapHistoryEvent(project, action, [updatedTask]);
		await appendRoadmapEvent(project, action, [updatedTask]);
		if (options.refresh ?? true) await runRebuildUnlocked(project);
		return { action, task: updatedTask };
	});
}

function overlapCount(
	left: string[] | undefined,
	right: string[] | undefined,
): number {
	const leftSet = new Set(
		(left ?? []).map((item) => item.trim()).filter(Boolean),
	);
	let count = 0;
	for (const item of right ?? []) {
		const normalized = item.trim();
		if (normalized && leftSet.has(normalized)) count += 1;
	}
	return count;
}

function normalizeTaskTitleKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function findLikelyDuplicateRoadmapTask(
	roadmap: RoadmapFile,
	input: RoadmapTaskInput,
): RoadmapTaskRecord | null {
	const titleKey = normalizeTaskTitleKey(input.title);
	const rankedTasks = roadmap.order
		.map((taskId) => roadmap.tasks[taskId])
		.filter((task): task is RoadmapTaskRecord => Boolean(task))
		.sort(
			(left, right) =>
				Number(isClosedRoadmapStatus(left.status)) -
				Number(isClosedRoadmapStatus(right.status)),
		);
	let best: { task: RoadmapTaskRecord; score: number } | null = null;
	for (const task of rankedTasks) {
		const titleMatches =
			normalizeTaskTitleKey(task.title) === titleKey && titleKey;
		const labelOverlap = overlapCount(task.labels, input.labels);
		if (!titleMatches && labelOverlap === 0) continue;
		if (!titleMatches && isClosedRoadmapStatus(task.status)) continue;
		let score = 0;
		if (titleMatches) score += 6;
		if (task.kind === input.kind) score += 1;
		score += overlapCount(task.spec_paths, input.spec_paths) * 2;
		score += overlapCount(task.code_paths, input.code_paths);
		score += labelOverlap * 2;
		if (score >= 6 && (!best || score > best.score)) best = { task, score };
	}
	return best?.task ?? null;
}

function normalizeRoadmapTask(
	task: RoadmapTaskInput,
	nextId: () => string,
	today: string,
): RoadmapTaskRecord {
	const title = task.title.trim();
	const kind = task.kind.trim();
	const summary = task.summary.trim();
	if (!title) throw new Error("Roadmap task title is required.");
	if (!kind) throw new Error(`Roadmap task '${title}' is missing kind.`);
	if (!summary) throw new Error(`Roadmap task '${title}' is missing summary.`);

	return {
		id: nextId(),
		title,
		status: normalizeRoadmapStatus(task.status),
		priority: normalizeRoadmapPriority(task.priority),
		kind,
		summary,
		spec_paths: unique(task.spec_paths ?? []),
		code_paths: unique(task.code_paths ?? []),
		research_ids: unique(task.research_ids ?? []),
		labels: unique(task.labels ?? []),
		goal: normalizeRoadmapTaskGoal(task.goal, summary),
		delta: {
			desired: task.delta?.desired?.trim() ?? "",
			current: task.delta?.current?.trim() ?? "",
			closure: task.delta?.closure?.trim() ?? "",
		},
		created: today,
		updated: today,
	};
}

function applyRoadmapTaskUpdate(
	task: RoadmapTaskRecord,
	input: RoadmapTaskUpdateInput,
	today: string,
): RoadmapTaskRecord {
	return {
		...task,
		title:
			input.title === undefined
				? task.title
				: requireNonEmptyTrimmed(input.title, `Roadmap task ${task.id} title`),
		status:
			input.status === undefined
				? task.status
				: normalizeRoadmapStatus(input.status),
		priority:
			input.priority === undefined
				? task.priority
				: normalizeRoadmapPriority(input.priority),
		kind:
			input.kind === undefined
				? task.kind
				: requireNonEmptyTrimmed(input.kind, `Roadmap task ${task.id} kind`),
		summary:
			input.summary === undefined
				? task.summary
				: requireNonEmptyTrimmed(
						input.summary,
						`Roadmap task ${task.id} summary`,
					),
		spec_paths:
			input.spec_paths === undefined
				? task.spec_paths
				: unique(input.spec_paths),
		code_paths:
			input.code_paths === undefined
				? task.code_paths
				: unique(input.code_paths),
		research_ids:
			input.research_ids === undefined
				? task.research_ids
				: unique(input.research_ids),
		labels: input.labels === undefined ? task.labels : unique(input.labels),
		goal:
			input.goal === undefined
				? task.goal
				: {
						outcome:
							input.goal.outcome === undefined
								? task.goal.outcome
								: input.goal.outcome.trim(),
						acceptance:
							input.goal.acceptance === undefined
								? task.goal.acceptance
								: unique(input.goal.acceptance),
						non_goals:
							input.goal.non_goals === undefined
								? task.goal.non_goals
								: unique(input.goal.non_goals),
						verification:
							input.goal.verification === undefined
								? task.goal.verification
								: unique(input.goal.verification),
					},
		delta: {
			desired:
				input.delta?.desired === undefined
					? task.delta.desired
					: input.delta.desired.trim(),
			current:
				input.delta?.current === undefined
					? task.delta.current
					: input.delta.current.trim(),
			closure:
				input.delta?.closure === undefined
					? task.delta.closure
					: input.delta.closure.trim(),
		},
		updated: today,
	};
}

function hasRoadmapTaskUpdateFields(input: RoadmapTaskUpdateInput): boolean {
	return (
		input.title !== undefined ||
		input.status !== undefined ||
		input.priority !== undefined ||
		input.kind !== undefined ||
		input.summary !== undefined ||
		input.spec_paths !== undefined ||
		input.code_paths !== undefined ||
		input.research_ids !== undefined ||
		input.labels !== undefined ||
		input.goal?.outcome !== undefined ||
		input.goal?.acceptance !== undefined ||
		input.goal?.non_goals !== undefined ||
		input.goal?.verification !== undefined ||
		input.delta?.desired !== undefined ||
		input.delta?.current !== undefined ||
		input.delta?.closure !== undefined
	);
}

function normalizeRoadmapTaskGoal(
	goal?: Partial<RoadmapTaskGoal>,
	fallbackSummary = "Complete the roadmap task.",
): RoadmapTaskGoal {
	const outcome = goal?.outcome?.trim() || fallbackSummary.trim();
	return {
		outcome,
		acceptance: unique(goal?.acceptance ?? []),
		non_goals: unique(goal?.non_goals ?? []),
		verification: unique(
			goal?.verification?.length
				? goal.verification
				: ["Record implementation or verification evidence before closing."],
		),
	};
}

function requireNonEmptyTrimmed(value: string, fieldLabel: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error(`${fieldLabel} is required.`);
	return trimmed;
}

function isClosedRoadmapStatus(status: RoadmapStatus): boolean {
	return status === "done" || status === "cancelled";
}

function normalizeRoadmapStatus(status: string | undefined): RoadmapStatus {
	if (!status) return "todo";
	if ((ROADMAP_STATUS_VALUES as readonly string[]).includes(status))
		return status as RoadmapStatus;
	throw new Error(`Invalid roadmap status: ${status}`);
}

function normalizeRoadmapPriority(priority: string): RoadmapPriority {
	if ((ROADMAP_PRIORITY_VALUES as readonly string[]).includes(priority))
		return priority as RoadmapPriority;
	throw new Error(`Invalid roadmap priority: ${priority}`);
}

function createTaskIdAllocator(existingIds: string[]): () => string {
	let counter = existingIds
		.map((id) => parseTaskIdSequence(id))
		.filter((value): value is number => value !== null)
		.reduce((max, value) => Math.max(max, value), 0);

	return () => {
		counter += 1;
		return formatTaskId(counter);
	};
}

function resolveRoadmapTask(
	roadmap: RoadmapFile,
	requestedId: string,
): RoadmapTaskRecord | null {
	for (const candidate of taskIdCandidates(requestedId)) {
		const task = roadmap.tasks[candidate];
		if (task) return task;
	}
	return null;
}

function taskIdCandidates(taskId: string): string[] {
	const trimmed = taskId.trim();
	if (!trimmed) return [];
	const upper = trimmed.toUpperCase();
	const sequence = parseTaskIdSequence(upper);
	if (sequence === null) return unique([trimmed, upper]);
	return unique([
		trimmed,
		upper,
		formatTaskId(sequence),
		formatLegacyTaskId(sequence),
	]);
}

function parseTaskIdSequence(taskId: string): number | null {
	const match = TASK_ID_PATTERN.exec(taskId.trim().toUpperCase());
	if (!match) return null;
	return Number.parseInt(match[2], 10);
}

function formatTaskId(sequence: number): string {
	return `${CANONICAL_TASK_ID_PREFIX}-${String(sequence).padStart(3, "0")}`;
}

function formatLegacyTaskId(sequence: number): string {
	return `${LEGACY_TASK_ID_PREFIX}-${String(sequence).padStart(3, "0")}`;
}

async function linkTaskSession(
	pi: ExtensionAPI,
	project: WikiProject,
	ctx: ExtensionContext | ExtensionCommandContext,
	input: TaskSessionLinkInput,
	options: { refresh?: boolean } = {},
): Promise<{ taskId: string; title: string; action: TaskSessionAction }> {
	const task = await readRoadmapTask(project, input.taskId);
	if (!task) throw new Error(`Roadmap task not found: ${input.taskId}`);
	const link = normalizeTaskSessionLinkInput(input);
	await withLockedPaths(
		[
			resolve(project.root, project.eventsPath),
			...((options.refresh ?? true) ? rebuildTargetPaths(project) : []),
		],
		async () => {
			await recordTaskSessionLinkUnlocked(pi, ctx, task, link);
			await appendTaskSessionEvent(project, task, link, currentSessionId(ctx));
			if (options.refresh ?? true) await runRebuildUnlocked(project);
		},
	);
	return {
		taskId: task.id,
		title: task.title,
		action: normalizeTaskSessionAction(input.action),
	};
}

async function recordTaskSessionLinkUnlocked(
	pi: ExtensionAPI,
	ctx: ExtensionContext | ExtensionCommandContext,
	task: RoadmapTaskRecord,
	input: TaskSessionLinkInput | TaskSessionLinkRecord,
): Promise<void> {
	if (!hasSessionManager(ctx)) return;

	const link =
		"timestamp" in input ? input : normalizeTaskSessionLinkInput(input);
	const shouldSetSessionName =
		("setSessionName" in input ? input.setSessionName : undefined) ??
		link.action === "focus";
	if (shouldSetSessionName) {
		try {
			pi.setSessionName(`${task.id} ${task.title}`);
		} catch {
			// Ignore in tests or non-standard execution contexts.
		}
	}
	try {
		pi.appendEntry(TASK_SESSION_LINK_CUSTOM_TYPE, {
			taskId: task.id,
			action: link.action,
			summary: link.summary,
			filesTouched: link.filesTouched,
			spawnedTaskIds: link.spawnedTaskIds,
		});
	} catch {
		// Ignore in tests or non-standard execution contexts.
	}

	if (link.action === "clear") {
		ctx.ui.setStatus("codewiki-task", undefined);
		return;
	}
	setTaskSessionStatus(ctx, task.id, task.title, link.action);
}

async function updateTaskLoop(
	project: WikiProject,
	input: TaskLoopUpdateInput & { repoPath?: string },
	options: { refresh?: boolean } = {},
): Promise<{
	taskId: string;
	title: string;
	action: "pass" | "fail" | "block";
	phase: string;
	nextPhase: string;
	roadmapStatus: RoadmapStatus;
}> {
	const task = await readRoadmapTask(project, input.taskId);
	if (!task) throw new Error(`Roadmap task not found: ${input.taskId}`);

	return withLockedPaths(roadmapMutationTargetPaths(project), async () => {
		const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
		const runtimeTask = roadmapState?.tasks?.[task.id] ?? null;
		const phase = normalizeTaskPhaseValue(
			input.phase ?? taskLoopPhase(runtimeTask),
			"implement",
		);
		const driver = TASK_PHASE_DRIVERS[phase];
		const action = input.action;
		const kind =
			action === "pass"
				? "task_phase_passed"
				: action === "fail"
					? "task_phase_failed"
					: "task_phase_blocked";
		const nextPhase =
			action === "pass"
				? driver.passTo
				: action === "fail"
					? driver.failTo
					: driver.blockTo;

		const roadmapPath = resolve(project.root, project.roadmapPath);
		const roadmap = await readRoadmapFile(roadmapPath);
		const existing = resolveRoadmapTask(roadmap, task.id);
		if (!existing) throw new Error(`Roadmap task not found: ${task.id}`);
		const currentStage = roadmapTaskStage(
			existing.status,
			runtimeTask?.loop?.phase,
		);
		const nextStatus: RoadmapStatus =
			action === "pass"
				? nextPhase === "done"
					? "done"
					: nextPhase
				: action === "fail"
					? nextPhase
					: currentStage === "todo"
						? phase
						: currentStage;
		const syncedTask =
			existing.status === nextStatus
				? existing
				: applyRoadmapTaskUpdate(
						existing,
						{ taskId: existing.id, status: nextStatus },
						todayIso(),
					);
		roadmap.tasks[syncedTask.id] = syncedTask;
		roadmap.updated = nowIso();
		await writeJsonFile(roadmapPath, roadmap);
		if (syncedTask !== existing) {
			await appendRoadmapHistoryEvent(project, "update", [syncedTask]);
			await appendRoadmapEvent(project, "update", [syncedTask]);
		}

		await appendTaskPhaseEvent(project, syncedTask, kind, phase, {
			summary: input.summary?.trim() ?? "",
			issues: unique(input.issues ?? []),
		});
		if (
			input.summary ||
			(input.checks_run?.length ?? 0) > 0 ||
			(input.files_touched?.length ?? 0) > 0 ||
			(input.issues?.length ?? 0) > 0
		) {
			await appendTaskEvidenceEvent(project, syncedTask, {
				verdict: action === "block" ? "blocked" : action,
				summary: input.summary?.trim() ?? `${phaseLabel(phase)} ${action}`,
				checks_run: unique(input.checks_run ?? []),
				files_touched: unique(input.files_touched ?? []),
				issues: unique(input.issues ?? []),
			});
		}
		if (options.refresh ?? true) await runRebuildUnlocked(project);
		return {
			taskId: syncedTask.id,
			title: syncedTask.title,
			action,
			phase,
			nextPhase,
			roadmapStatus: syncedTask.status,
		};
	});
}

function normalizeTaskSessionLinkInput(
	input: TaskSessionLinkInput,
): TaskSessionLinkRecord {
	return {
		taskId: input.taskId.trim(),
		action: normalizeTaskSessionAction(input.action),
		summary: input.summary?.trim() ?? "",
		filesTouched: unique(input.filesTouched ?? []),
		spawnedTaskIds: unique(input.spawnedTaskIds ?? []),
		timestamp: nowIso(),
	};
}

function normalizeTaskSessionAction(
	action: string | undefined,
): TaskSessionAction {
	if (!action) return "focus";
	if ((TASK_SESSION_ACTION_VALUES as readonly string[]).includes(action))
		return action as TaskSessionAction;
	throw new Error(`Invalid task session action: ${action}`);
}

async function readRoadmapTask(
	project: WikiProject,
	taskId: string,
): Promise<RoadmapTaskRecord | null> {
	const roadmap = await readRoadmapFile(
		resolve(project.root, project.roadmapPath),
	);
	return resolveRoadmapTask(roadmap, taskId);
}

function hasSessionManager(
	ctx: ExtensionContext | ExtensionCommandContext,
): boolean {
	const manager = (
		ctx as {
			sessionManager?: {
				getSessionId?: () => string;
				getBranch?: () => unknown[];
			};
		}
	).sessionManager;
	return (
		typeof manager?.getSessionId === "function" ||
		typeof manager?.getBranch === "function"
	);
}

function parseTaskSessionLinkEntry(
	entry: unknown,
): TaskSessionLinkRecord | null {
	const value = entry as {
		type?: string;
		customType?: string;
		timestamp?: string;
		data?: {
			taskId?: string;
			action?: string;
			summary?: string;
			filesTouched?: string[];
			spawnedTaskIds?: string[];
		};
	};
	if (
		value?.type !== "custom" ||
		value.customType !== TASK_SESSION_LINK_CUSTOM_TYPE ||
		!value.data?.taskId
	)
		return null;
	try {
		return {
			taskId: String(value.data.taskId),
			action: normalizeTaskSessionAction(value.data.action),
			summary: typeof value.data.summary === "string" ? value.data.summary : "",
			filesTouched: Array.isArray(value.data.filesTouched)
				? unique(value.data.filesTouched)
				: [],
			spawnedTaskIds: Array.isArray(value.data.spawnedTaskIds)
				? unique(value.data.spawnedTaskIds)
				: [],
			timestamp:
				typeof value.timestamp === "string" ? value.timestamp : nowIso(),
		};
	} catch {
		return null;
	}
}

function findLatestTaskSessionLink(
	entries: unknown[] | null | undefined,
): TaskSessionLinkRecord | null {
	if (!Array.isArray(entries) || entries.length === 0) return null;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const parsed = parseTaskSessionLinkEntry(entries[index]);
		if (!parsed) continue;
		if (parsed.action === "clear") return null;
		return parsed;
	}
	return null;
}

function setTaskSessionStatus(
	ctx: ExtensionContext | ExtensionCommandContext,
	taskId: string,
	title: string,
	action: TaskSessionAction,
): void {
	ctx.ui.setStatus("codewiki-task", `${taskId} ${action} — ${title}`);
}

async function appendRoadmapEvent(
	project: WikiProject,
	action: string,
	tasks: RoadmapTaskRecord[],
): Promise<void> {
	const eventPath = resolve(project.root, project.eventsPath);
	const prefix = await jsonlAppendPrefix(eventPath);
	const titles = tasks.map((task) => `${task.id} ${task.title}`).join("; ");
	const event = JSON.stringify({
		ts: nowIso(),
		kind: `roadmap_${action}`,
		title: `${roadmapMutationVerb(action)} ${tasks.length} roadmap task(s)`,
		summary: titles,
	});
	await appendFile(eventPath, `${prefix}${event}\n`, "utf8");
}

async function appendProjectEvent(
	project: WikiProject,
	payload: Record<string, unknown>,
): Promise<void> {
	const eventPath = resolve(project.root, project.eventsPath);
	const prefix = await jsonlAppendPrefix(eventPath);
	await appendFile(eventPath, `${prefix}${JSON.stringify(payload)}\n`, "utf8");
}

async function appendTaskSessionEvent(
	project: WikiProject,
	task: RoadmapTaskRecord,
	link: TaskSessionLinkRecord,
	sessionId: string | null,
): Promise<void> {
	if (!sessionId) return;
	await appendProjectEvent(project, {
		ts: link.timestamp,
		kind: "task_session_link",
		session_id: sessionId,
		task_id: task.id,
		action: link.action,
		title: task.title,
		summary: link.summary,
		files_touched: link.filesTouched,
		spawned_task_ids: link.spawnedTaskIds,
	});
}

async function appendTaskPhaseEvent(
	project: WikiProject,
	task: RoadmapTaskRecord,
	kind:
		| "task_phase_started"
		| "task_phase_passed"
		| "task_phase_failed"
		| "task_phase_blocked",
	phase: string,
	extra: { summary?: string; issues?: string[] } = {},
): Promise<void> {
	await appendProjectEvent(project, {
		ts: nowIso(),
		kind,
		task_id: task.id,
		phase,
		title: task.title,
		summary: extra.summary ?? "",
		issues: extra.issues ?? [],
	});
}

async function appendTaskEvidenceEvent(
	project: WikiProject,
	task: RoadmapTaskRecord,
	evidence: {
		verdict: string;
		summary: string;
		checks_run?: string[];
		files_touched?: string[];
		issues?: string[];
	},
): Promise<void> {
	await appendProjectEvent(project, {
		ts: nowIso(),
		kind: "task_evidence_recorded",
		task_id: task.id,
		verdict: evidence.verdict,
		summary: evidence.summary,
		checks_run: evidence.checks_run ?? [],
		files_touched: evidence.files_touched ?? [],
		issues: evidence.issues ?? [],
	});
}

async function assertTaskCloseable(
	project: WikiProject,
	taskId: string,
): Promise<void> {
	const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
	const runtimeTask = roadmapState?.tasks?.[taskId];
	const phase = taskLoopPhase(runtimeTask);
	if (phase !== "verify" && runtimeTask?.status !== "done") {
		throw new Error(
			`Roadmap task ${taskId} is not ready to close yet. Current phase is ${phaseLabel(phase)}; advance through verify first.`,
		);
	}
}

async function appendRoadmapHistoryEvent(
	project: WikiProject,
	action: string,
	tasks: RoadmapTaskRecord[],
): Promise<void> {
	const historyPath = resolve(project.root, project.roadmapEventsPath);
	const prefix = await jsonlAppendPrefix(historyPath);
	const lines = tasks.map((task) =>
		JSON.stringify({
			ts: nowIso(),
			action,
			id: task.id,
			title: task.title,
			status: task.status,
			priority: task.priority,
		}),
	);
	await appendFile(historyPath, `${prefix}${lines.join("\n")}\n`, "utf8");
}

async function jsonlAppendPrefix(path: string): Promise<string> {
	if (!(await pathExists(path))) return "";
	const raw = await readFile(path, "utf8");
	return raw.length > 0 && !raw.endsWith("\n") ? "\n" : "";
}

function formatRoadmapAppendSummary(
	project: WikiProject,
	tasks: RoadmapTaskRecord[],
	reused: RoadmapTaskRecord[] = [],
): string {
	const parts: string[] = [];
	if (tasks.length > 0)
		parts.push(
			`appended ${tasks.length} roadmap task(s) — ${tasks.map((task) => task.id).join(", ")}`,
		);
	if (reused.length > 0)
		parts.push(
			`reused ${reused.length} existing task(s) — ${reused.map((task) => task.id).join(", ")}`,
		);
	return `${project.label}: ${parts.join("; ")} in ${project.roadmapPath}`;
}

function formatRoadmapUpdateSummary(
	project: WikiProject,
	task: RoadmapTaskRecord,
	action: "update" | "close",
): string {
	return `${project.label}: ${roadmapMutationVerb(action).toLowerCase()} roadmap task ${task.id} in ${project.roadmapPath}`;
}

function formatTaskLoopUpdateSummary(
	project: WikiProject,
	result: {
		taskId: string;
		title: string;
		action: "pass" | "fail" | "block";
		phase: string;
		nextPhase: string;
		roadmapStatus: RoadmapStatus;
	},
): string {
	return `${project.label}: recorded ${result.action} for ${result.taskId} at ${phaseLabel(result.phase)}; next phase ${phaseLabel(result.nextPhase)}; roadmap ${result.roadmapStatus}.`;
}

function roadmapMutationVerb(action: string): string {
	if (action === "append") return "Appended";
	if (action === "close") return "Closed";
	return "Updated";
}

function nowIso(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function todayIso(): string {
	return nowIso().slice(0, 10);
}

async function readRoadmapFile(path: string): Promise<RoadmapFile> {
	if (!(await pathExists(path))) {
		return { version: 1, updated: nowIso(), order: [], tasks: {} };
	}
	const data = await readJson<RoadmapFile>(path);
	const rawTasks =
		typeof data.tasks === "object" && data.tasks ? data.tasks : {};
	const tasks = Object.fromEntries(
		Object.entries(rawTasks).map(([taskId, task]) => {
			const record = (task ?? {}) as Partial<RoadmapTaskRecord>;
			return [
				taskId,
				{
					id:
						typeof record.id === "string" && record.id.trim()
							? record.id
							: taskId,
					title: typeof record.title === "string" ? record.title : taskId,
					status: normalizeRoadmapStatus(record.status),
					priority: normalizeRoadmapPriority(record.priority),
					kind: typeof record.kind === "string" ? record.kind : "task",
					summary: typeof record.summary === "string" ? record.summary : "",
					spec_paths: unique(
						Array.isArray(record.spec_paths) ? record.spec_paths : [],
					),
					code_paths: unique(
						Array.isArray(record.code_paths) ? record.code_paths : [],
					),
					research_ids: unique(
						Array.isArray(record.research_ids) ? record.research_ids : [],
					),
					labels: unique(Array.isArray(record.labels) ? record.labels : []),
					goal: normalizeRoadmapTaskGoal(
						record.goal,
						String(record.summary ?? ""),
					),
					delta: {
						desired:
							typeof record.delta?.desired === "string"
								? record.delta.desired
								: "",
						current:
							typeof record.delta?.current === "string"
								? record.delta.current
								: "",
						closure:
							typeof record.delta?.closure === "string"
								? record.delta.closure
								: "",
					},
					created:
						typeof record.created === "string" && record.created.trim()
							? record.created
							: todayIso(),
					updated:
						typeof record.updated === "string" && record.updated.trim()
							? record.updated
							: todayIso(),
				} satisfies RoadmapTaskRecord,
			];
		}),
	);
	return {
		version: data.version ?? 1,
		updated: data.updated ?? nowIso(),
		order: Array.isArray(data.order) ? data.order.filter(Boolean) : [],
		tasks,
	};
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

async function maybeReadJson<T>(path: string): Promise<T | null> {
	if (!(await pathExists(path))) return null;
	return readJson<T>(path);
}

async function readLastEventLine(path: string): Promise<string | null> {
	if (!(await pathExists(path))) return null;
	const raw = await readFile(path, "utf8");
	const lines = raw.trim().split(/\r?\n/).filter(Boolean);
	if (lines.length === 0) return null;
	try {
		const event = JSON.parse(lines[lines.length - 1]) as {
			ts?: string;
			title?: string;
		};
		return [event.ts, event.title].filter(Boolean).join(" | ") || null;
	} catch {
		return lines[lines.length - 1];
	}
}

function defaultSelfDriftScope(project: WikiProject): ScopeConfig {
	return {
		include: unique([
			`${project.docsRoot}/**/*.md`,
			project.roadmapPath,
			`${project.researchRoot}/**/*.jsonl`,
		]),
		exclude: unique([
			`${project.docsRoot}/_templates/**`,
			...(project.indexPath ? [project.indexPath] : []),
			...(project.roadmapDocPath ? [project.roadmapDocPath] : []),
		]),
	};
}

function defaultCodeDriftDocsScope(project: WikiProject): string[] {
	return unique([`${project.docsRoot}/**/*.md`]);
}

function renderScope(label: string, items: string[]): string[] {
	return [label + ":", ...renderList(items)];
}

function renderList(items: string[]): string[] {
	return items.length > 0 ? items.map((item) => `- ${item}`) : ["- none"];
}

function sanitizeCommand(command: unknown): string[] | null {
	if (!Array.isArray(command) || command.length === 0) return null;
	const cleaned = command.filter(
		(part): part is string =>
			typeof part === "string" && part.trim().length > 0,
	);
	return cleaned.length > 0 ? cleaned : null;
}

function pythonAliasFallback(command: string[]): string[][] {
	if (command.length === 0) return [];
	if (command[0] === "python") return [["python3", ...command.slice(1)]];
	if (command[0] === "python3") return [["python", ...command.slice(1)]];
	return [];
}

function uniqueCommands(commands: string[][]): string[][] {
	const seen = new Set<string>();
	const result: string[][] = [];
	for (const command of commands) {
		const key = JSON.stringify(command);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(command);
	}
	return result;
}

function roadmapArchivePath(project: WikiProject): string {
	let archivePath = normalizeRelativePath(
		project.config.roadmap_retention?.archive_path ??
			".wiki/roadmap-archive.jsonl",
	);
	if (
		project.config.roadmap_retention?.compress_archive &&
		!archivePath.endsWith(".gz")
	) {
		archivePath = `${archivePath}.gz`;
	}
	return resolve(project.root, archivePath);
}

function optionalRelativePath(path: string | null | undefined): string | null {
	if (typeof path !== "string" || !path.trim()) return null;
	return normalizeRelativePath(path);
}

function normalizeRelativePath(path: string): string {
	return path.replace(/^\.\//, "").replace(/\\/g, "/");
}

function unique(items: string[]): string[] {
	return [...new Set(items.filter(Boolean))];
}

function countBy(values: string[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}

function formatError(error: unknown): string {
	if (!error) return "Unknown error";
	if (error instanceof Error) {
		const withOutput = error as Error & { stderr?: string; stdout?: string };
		const parts = [error.message];
		const stderr = withOutput.stderr?.trim();
		const stdout = withOutput.stdout?.trim();
		if (stderr) parts.push(stderr);
		else if (stdout) parts.push(stdout);
		return parts.join("\n");
	}
	return String(error);
}
