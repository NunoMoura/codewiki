import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, matchesKey, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { registerBootstrapFeatures } from "./bootstrap";
import { withLockedPaths } from "./mutation-queue";
import { requireWikiRoot } from "./project-root";

const execFileAsync = promisify(execFile);
const CONFIG_RELATIVE_PATH = ".docs/config.json";
const DEFAULT_DOCS_ROOT = "docs";
const DEFAULT_SPECS_ROOT = "docs/specs";
const DEFAULT_RESEARCH_ROOT = "docs/research";
const DEFAULT_INDEX_PATH = "docs/index.md";
const DEFAULT_ROADMAP_PATH = "docs/roadmap.json";
const DEFAULT_ROADMAP_DOC_PATH = "docs/roadmap.md";
const DEFAULT_ROADMAP_EVENTS_PATH = ".docs/roadmap-events.jsonl";
const DEFAULT_META_ROOT = ".docs";
const DEFAULT_REBUILD_SCRIPT = "scripts/rebuild_docs_meta.py";
const GENERATED_METADATA_FILES = ["registry.json", "backlinks.json", "lint.json"] as const;
const TASK_SESSION_LINK_CUSTOM_TYPE = "codebase-wiki.task-link";
const ROADMAP_STATUS_VALUES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
const ROADMAP_PRIORITY_VALUES = ["critical", "high", "medium", "low"] as const;
const TASK_SESSION_ACTION_VALUES = ["focus", "progress", "blocked", "done", "spawn"] as const;
const COMMAND_PREFIX = "wiki";

interface ScopeConfig {
  include?: string[];
  exclude?: string[];
}

interface CodeDriftScopeConfig {
  docs?: string[];
  repo_docs?: string[];
  code?: string[];
}

interface CodebaseWikiConfig {
  name?: string;
  rebuild_command?: string[];
  self_drift_scope?: ScopeConfig;
  code_drift_scope?: CodeDriftScopeConfig;
}

interface DocsConfig {
  project_name?: string;
  docs_root?: string;
  specs_root?: string;
  research_root?: string;
  index_path?: string;
  roadmap_path?: string;
  roadmap_doc_path?: string;
  roadmap_events_path?: string;
  meta_root?: string;
  codebase_wiki?: CodebaseWikiConfig;
}

type RoadmapStatus = (typeof ROADMAP_STATUS_VALUES)[number];
type RoadmapPriority = (typeof ROADMAP_PRIORITY_VALUES)[number];
type TaskSessionAction = (typeof TASK_SESSION_ACTION_VALUES)[number];

interface LintIssue {
  severity: string;
  kind: string;
  path: string;
  message: string;
}

interface LintReport {
  generated_at: string;
  counts: Record<string, number>;
  issues: LintIssue[];
}

interface RegistryDoc {
  path: string;
  doc_type: string;
  state: string;
  code_paths?: string[];
}

interface RegistryResearchCollection {
  path: string;
  entry_count: number;
}

interface RegistryRoadmapSummary {
  entry_count: number;
  counts: Record<string, number>;
}

interface RegistryFile {
  generated_at: string;
  docs: RegistryDoc[];
  research?: RegistryResearchCollection[];
  roadmap?: RegistryRoadmapSummary;
}

interface RoadmapTaskDelta {
  desired: string;
  current: string;
  closure: string;
}

interface RoadmapTaskInput {
  title: string;
  status?: RoadmapStatus;
  priority: RoadmapPriority;
  kind: string;
  summary: string;
  spec_paths?: string[];
  code_paths?: string[];
  research_ids?: string[];
  labels?: string[];
  delta?: Partial<RoadmapTaskDelta>;
}

interface RoadmapTaskRecord {
  id: string;
  title: string;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  kind: string;
  summary: string;
  spec_paths: string[];
  code_paths: string[];
  research_ids: string[];
  labels: string[];
  delta: RoadmapTaskDelta;
  created: string;
  updated: string;
}

interface RoadmapFile {
  version: number;
  updated: string;
  order: string[];
  tasks: Record<string, RoadmapTaskRecord>;
}

interface TaskSessionLinkInput {
  taskId: string;
  action?: TaskSessionAction;
  summary?: string;
  filesTouched?: string[];
  spawnedTaskIds?: string[];
  setSessionName?: boolean;
}

interface TaskSessionLinkRecord {
  taskId: string;
  action: TaskSessionAction;
  summary: string;
  filesTouched: string[];
  spawnedTaskIds: string[];
  timestamp: string;
}

interface TaskSessionIndexTaskSummary {
  session_ids: string[];
  session_count: number;
  last_session_id?: string;
  last_session_name?: string;
  last_action?: TaskSessionAction;
  last_summary?: string;
  last_timestamp?: string;
}

interface TaskSessionIndexSessionSummary {
  id: string;
  name?: string;
  file_name?: string;
  task_ids: string[];
  last_action?: TaskSessionAction;
  last_summary?: string;
  last_timestamp?: string;
}

interface TaskSessionIndexFile {
  version: number;
  updated: string;
  tasks: Record<string, TaskSessionIndexTaskSummary>;
  sessions: Record<string, TaskSessionIndexSessionSummary>;
}

interface SessionMeta {
  sessionId: string;
  sessionName?: string;
  sessionFileName?: string;
}

interface WikiProject {
  root: string;
  label: string;
  config: DocsConfig;
  docsRoot: string;
  specsRoot: string;
  researchRoot: string;
  indexPath: string;
  roadmapPath: string;
  roadmapDocPath: string;
  metaRoot: string;
  configPath: string;
  lintPath: string;
  registryPath: string;
  eventsPath: string;
  roadmapEventsPath: string;
  taskSessionIndexPath: string;
}

const roadmapStatusSchema = Type.Union(ROADMAP_STATUS_VALUES.map((value) => Type.Literal(value)));
const roadmapPrioritySchema = Type.Union(ROADMAP_PRIORITY_VALUES.map((value) => Type.Literal(value)));
const taskSessionActionSchema = Type.Union(TASK_SESSION_ACTION_VALUES.map((value) => Type.Literal(value)));
const roadmapTaskInputSchema = Type.Object({
  title: Type.String({ minLength: 1, description: "Short task title." }),
  status: Type.Optional(roadmapStatusSchema),
  priority: roadmapPrioritySchema,
  kind: Type.String({ minLength: 1, description: "Task kind like architecture, bug, migration, testing, docs, or agent-workflow." }),
  summary: Type.String({ minLength: 1, description: "One-sentence task summary." }),
  spec_paths: Type.Optional(Type.Array(Type.String(), { default: [] })),
  code_paths: Type.Optional(Type.Array(Type.String(), { default: [] })),
  research_ids: Type.Optional(Type.Array(Type.String(), { default: [] })),
  labels: Type.Optional(Type.Array(Type.String(), { default: [] })),
  delta: Type.Optional(Type.Object({
    desired: Type.Optional(Type.String()),
    current: Type.Optional(Type.String()),
    closure: Type.Optional(Type.String()),
  })),
});
const taskSessionLinkInputSchema = Type.Object({
  taskId: Type.String({ minLength: 1, description: "Existing roadmap task id to link to current Pi session." }),
  action: Type.Optional(taskSessionActionSchema),
  summary: Type.Optional(Type.String({ description: "Short note about what happened in this session for the task." })),
  filesTouched: Type.Optional(Type.Array(Type.String(), { default: [] })),
  spawnedTaskIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
  setSessionName: Type.Optional(Type.Boolean({ description: "When true, rename the current Pi session to this task id + title." })),
});

export default function codebaseWikiExtension(pi: ExtensionAPI) {
  registerBootstrapFeatures(pi);

  pi.on("session_start", async (_event, ctx) => {
    const project = await maybeLoadProject(ctx.cwd);
    if (!project) {
      ctx.ui.setStatus("codebase-wiki-task", undefined);
      return;
    }

    await withUiErrorHandling(ctx, async () => {
      const synced = await syncCurrentSessionTaskLinks(project, ctx);
      if (synced) await runRebuild(project);
      const active = findLatestTaskSessionLink(ctx.sessionManager.getBranch());
      if (!active) {
        ctx.ui.setStatus("codebase-wiki-task", undefined);
        return;
      }
      const task = await readRoadmapTask(project, active.taskId);
      if (task) setTaskSessionStatus(ctx, task.id, task.title, active.action);
    });
  });

  pi.registerCommand(`${COMMAND_PREFIX}-rebuild`, {
    description: "Rebuild codebase wiki metadata, then show lint summary",
    handler: async (_args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const summary = await rebuildAndSummarize(ctx.cwd);
        ctx.ui.notify(summary.text, summary.issueCount === 0 ? "success" : "warning");
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-lint`, {
    description: "Run deterministic codebase-wiki lint. Use '/wiki-lint show' to browse issues",
    getArgumentCompletions: (prefix) => {
      const options = ["show"];
      const items = options.filter((item) => item.startsWith(prefix));
      return items.length ? items.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const summary = await rebuildAndSummarize(ctx.cwd);
        ctx.ui.notify(summary.text, summary.issueCount === 0 ? "success" : "warning");
        if (args.trim() === "show" && summary.report.issues.length > 0) {
          await ctx.ui.select(
            "Codebase wiki lint issues",
            summary.report.issues.map((issue) => `[${issue.severity}] ${issue.kind} | ${issue.path} | ${issue.message}`),
          );
        }
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-status`, {
    description: "Show codebase wiki inventory, last generation time, and lint status",
    handler: async (_args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        ctx.ui.notify(await readStatus(ctx.cwd), "info");
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-roadmap`, {
    description: "Browse roadmap tasks and task details in a terminal UI. Usage: /wiki-roadmap [ROADMAP-###]",
    handler: async (args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const project = await loadProject(ctx.cwd);
        const roadmap = await readRoadmapFile(resolve(project.root, project.roadmapPath));
        const taskId = args.trim();
        if (taskId) {
          const task = roadmap.tasks[taskId];
          if (!task) throw new Error(`Roadmap task not found: ${taskId}`);
          await showRoadmapTask(project, roadmap, task, ctx);
          return;
        }
        await browseRoadmap(project, roadmap, ctx);
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-task`, {
    description: "Link current Pi session to a roadmap task. Usage: /wiki-task <task-id> [focus|progress|blocked|done|spawn]",
    handler: async (args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const [taskId, actionRaw] = args.trim().split(/\s+/, 2);
        if (!taskId) {
          const active = findLatestTaskSessionLink(ctx.sessionManager.getBranch());
          ctx.ui.notify(active ? `Current linked task: ${active.taskId} (${active.action})` : "No task linked to current session branch yet.", "info");
          return;
        }
        const project = await loadProject(ctx.cwd);
        const result = await linkTaskSession(pi, project, ctx, {
          taskId,
          action: normalizeTaskSessionAction(actionRaw),
          setSessionName: actionRaw ? actionRaw === "focus" : true,
        });
        ctx.ui.notify(formatTaskSessionLinkSummary(result), "success");
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-self-drift`, {
    description: "Queue semantic audit for drift inside the live codebase wiki",
    handler: async (_args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const project = await loadProject(ctx.cwd);
        await queueAudit(pi, ctx, selfDriftPrompt(project));
        ctx.ui.notify(`Queued live-wiki drift audit for ${project.label}`, "info");
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-code-drift`, {
    description: "Queue semantic audit for drift between the codebase wiki and code",
    handler: async (_args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const project = await loadProject(ctx.cwd);
        const registry = await maybeReadJson<RegistryFile>(project.registryPath);
        await queueAudit(pi, ctx, codeDriftPrompt(project, registry));
        ctx.ui.notify(`Queued wiki-vs-code drift audit for ${project.label}`, "info");
      });
    },
  });

  pi.registerTool({
    name: "codebase_wiki_rebuild",
    label: "Codebase Wiki Rebuild",
    description: "Rebuild the current project's codebase wiki metadata and return lint summary",
    promptSnippet: "Rebuild the current project's codebase wiki metadata and inspect deterministic lint results",
    promptGuidelines: [
      "Use this after editing wiki docs or before a semantic wiki audit when you need fresh registry and lint outputs.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const summary = await rebuildAndSummarize(ctx.cwd);
      return {
        content: [{ type: "text", text: summary.text }],
        details: summary,
      };
    },
  });

  pi.registerTool({
    name: "codebase_wiki_status",
    label: "Codebase Wiki Status",
    description: "Show the current project's codebase wiki inventory and lint status",
    promptSnippet: "Inspect the current project's codebase wiki inventory and lint status",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const text = await readStatus(ctx.cwd);
      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "codebase_wiki_roadmap_append",
    label: "Codebase Wiki Roadmap Append",
    description: "Append new roadmap tasks to docs/roadmap.json, update order, log history event, and rebuild generated roadmap/index outputs",
    promptSnippet: "Append new unresolved delta tasks to the current project's codebase wiki roadmap",
    promptGuidelines: [
      "Use this after self-drift or code-drift review when you found real unresolved delta that belongs in docs/roadmap.json.",
      "Do not use this for issues already covered by an existing roadmap item unless you first explain why duplication is needed.",
      "The tool assigns ROADMAP-### ids automatically, appends them to roadmap order, logs history, and rebuilds generated outputs.",
    ],
    parameters: Type.Object({
      tasks: Type.Array(roadmapTaskInputSchema, { minItems: 1 }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = await loadProject(ctx.cwd);
      const result = await appendRoadmapTasks(pi, project, ctx, params.tasks);
      return {
        content: [{ type: "text", text: formatRoadmapAppendSummary(project, result.created) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "codebase_wiki_task_session_link",
    label: "Codebase Wiki Task Session Link",
    description: "Link current Pi session to an existing roadmap task, persist a Pi custom session entry, update task-session index, and rebuild generated roadmap outputs",
    promptSnippet: "Link the current Pi session to a roadmap task so future sessions can resume work cleanly",
    promptGuidelines: [
      "Use this when starting, progressing, blocking, or finishing work on an existing roadmap task.",
      "Prefer action='focus' when the session is now centered on one task.",
      "Use action='spawn' only when the current session created follow-up tasks and you need a trace from session to those tasks.",
    ],
    parameters: taskSessionLinkInputSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = await loadProject(ctx.cwd);
      const result = await linkTaskSession(pi, project, ctx, params);
      return {
        content: [{ type: "text", text: formatTaskSessionLinkSummary(result) }],
        details: result,
      };
    },
  });
}

async function withUiErrorHandling(ctx: ExtensionContext, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    ctx.ui.notify(formatError(error), "error");
  }
}

async function queueAudit(pi: ExtensionAPI, ctx: ExtensionContext, prompt: string): Promise<void> {
  if (ctx.isIdle()) {
    pi.sendUserMessage(prompt);
  } else {
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  }
}

function selfDriftPrompt(project: WikiProject): string {
  const scope = project.config.codebase_wiki?.self_drift_scope ?? defaultSelfDriftScope(project);
  const include = unique(scope.include ?? []);
  const exclude = unique(scope.exclude ?? []);
  return [
    `Audit live codebase wiki for internal drift in ${project.label}.`,
    "Scope:",
    ...renderScope("Include", include),
    ...renderScope("Exclude", exclude),
    "Context files:",
    `- ${project.configPath}`,
    `- ${project.indexPath}`,
    `- ${project.roadmapPath}`,
    `- ${project.roadmapDocPath}`,
    `- ${project.registryPath.replace(`${project.root}/`, "")}`,
    `- ${project.lintPath.replace(`${project.root}/`, "")}`,
    "Tasks:",
    "1. Find contradictions, stale claims, duplicated specs, weak research links, and roadmap items that no longer reflect current delta.",
    "2. Check that research, specs, roadmap, and generated navigation still agree on current intended state.",
    "3. Compare candidate roadmap work against existing docs/roadmap.json tasks. Avoid duplicates.",
    "4. If you find true unresolved delta not already tracked, call codebase_wiki_roadmap_append with task objects. Tool assigns ROADMAP ids automatically and appends them to roadmap order.",
    "Roadmap task object shape:",
    "- title",
    "- priority: critical|high|medium|low",
    "- kind",
    "- summary",
    "- spec_paths[]",
    "- code_paths[]",
    "- research_ids[]",
    "- labels[]",
    "- delta.desired",
    "- delta.current",
    "- delta.closure",
    "Output format:",
    "- Findings by severity",
    "- Specs to merge, cut, split, or move",
    "- Existing roadmap items to close or rewrite",
    "- New roadmap ids appended this pass",
    "- Exact files to edit next",
    "Do not edit specs or code yet. Only append roadmap tasks when needed.",
  ].join("\n");
}

function codeDriftPrompt(project: WikiProject, registry: RegistryFile | null): string {
  const docsScope = unique(project.config.codebase_wiki?.code_drift_scope?.docs ?? defaultCodeDriftDocsScope(project));
  const docsExclude = unique(project.config.codebase_wiki?.self_drift_scope?.exclude ?? defaultSelfDriftScope(project).exclude ?? []);
  const repoDocs = unique(project.config.codebase_wiki?.code_drift_scope?.repo_docs ?? ["README.md"]);
  const configCode = unique(project.config.codebase_wiki?.code_drift_scope?.code ?? []);
  const registryCode = unique(
    (registry?.docs ?? [])
      .flatMap((doc) => doc.code_paths ?? [])
      .filter(Boolean),
  );
  const codeScope = unique([...configCode, ...registryCode]);

  return [
    `Audit drift between live codebase wiki and implementation for ${project.label}.`,
    "Docs scope:",
    ...renderScope("Include", docsScope),
    ...renderScope("Exclude", docsExclude),
    "Additional repository docs:",
    ...renderList(repoDocs),
    "Implementation scope:",
    ...renderList(codeScope.length > 0 ? codeScope : ["Use code paths referenced by live specs; no explicit code scope configured."]),
    "Context files:",
    `- ${project.configPath}`,
    `- ${project.roadmapPath}`,
    `- ${project.registryPath.replace(`${project.root}/`, "")}`,
    `- ${project.lintPath.replace(`${project.root}/`, "")}`,
    "Tasks:",
    "1. Find where specs overclaim, underclaim, or miss real structure.",
    "2. Distinguish: specs wrong vs code behind specs vs true unresolved delta.",
    "3. Prefer concrete evidence from current files and package wiring.",
    "4. Compare candidate roadmap work against existing docs/roadmap.json tasks. Avoid duplicates.",
    "5. If you find true unresolved delta not already tracked, call codebase_wiki_roadmap_append with task objects. Tool assigns ROADMAP ids automatically and appends them to roadmap order.",
    "Roadmap task object shape:",
    "- title",
    "- priority: critical|high|medium|low",
    "- kind",
    "- summary",
    "- spec_paths[]",
    "- code_paths[]",
    "- research_ids[]",
    "- labels[]",
    "- delta.desired",
    "- delta.current",
    "- delta.closure",
    "Output format:",
    "- Findings by severity",
    "- Specs wrong",
    "- Code behind specs",
    "- Existing roadmap items to close or rewrite",
    "- New roadmap ids appended this pass",
    "- Exact files to edit next",
    "Do not edit specs or code yet. Only append roadmap tasks when needed.",
  ].join("\n");
}

async function rebuildAndSummarize(cwd: string): Promise<{ text: string; issueCount: number; report: LintReport }> {
  const project = await loadProject(cwd);
  await runRebuild(project);
  const report = await readJson<LintReport>(project.lintPath);
  const kinds = Object.entries(report.counts)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(" ");
  const issueCount = report.issues.length;
  const text = issueCount === 0
    ? `${project.label}: rebuild ok. 0 issues. Generated ${report.generated_at}`
    : `${project.label}: rebuild ok. ${issueCount} issue(s). ${kinds || ""}`.trim();
  return { text, issueCount, report };
}

async function readStatus(cwd: string): Promise<string> {
  const project = await loadProject(cwd);
  const registry = await maybeReadJson<RegistryFile>(project.registryPath);
  const report = await maybeReadJson<LintReport>(project.lintPath);
  const lines = [
    `Wiki: ${project.label}`,
    `Root: ${project.root}`,
    `Config: ${CONFIG_RELATIVE_PATH}`,
  ];

  if (!registry || !report) {
    lines.push("Generated metadata missing. Run /wiki-rebuild.");
    return lines.join("\n");
  }

  const live = registry.docs.filter((doc) => doc.path !== project.indexPath);
  const byType = countBy(live.map((doc) => doc.doc_type));
  const researchFiles = registry.research ?? [];
  const researchEntries = researchFiles.reduce((sum, item) => sum + item.entry_count, 0);
  const roadmap = registry.roadmap;
  const taskSessionIndex = await maybeReadJson<TaskSessionIndexFile>(project.taskSessionIndexPath);
  lines.push(`Docs generated: ${registry.generated_at}`);
  lines.push(`Live docs: ${live.length}`);
  lines.push(`Types: ${Object.entries(byType).map(([key, value]) => `${key}=${value}`).join(" ") || "none"}`);
  lines.push(`Research: files=${researchFiles.length} entries=${researchEntries}`);
  if (roadmap) {
    lines.push(`Roadmap: items=${roadmap.entry_count} ${Object.entries(roadmap.counts).map(([key, value]) => `${key}=${value}`).join(" ")}`.trim());
  }
  if (taskSessionIndex) {
    lines.push(`Task sessions: tasks=${Object.keys(taskSessionIndex.tasks).length} sessions=${Object.keys(taskSessionIndex.sessions).length}`);
  }
  lines.push(`Lint issues: ${report.issues.length}`);

  const lastEvent = await readLastEventLine(project.eventsPath);
  if (lastEvent) lines.push(`Last event: ${lastEvent}`);
  return lines.join("\n");
}

async function browseRoadmap(project: WikiProject, roadmap: RoadmapFile, ctx: ExtensionCommandContext): Promise<void> {
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

async function selectRoadmapTask(project: WikiProject, roadmap: RoadmapFile, ctx: ExtensionCommandContext): Promise<string | null> {
  const items = buildRoadmapSelectItems(roadmap);
  if (items.length === 0) {
    ctx.ui.notify(`${project.label}: no roadmap tasks found in ${project.roadmapPath}`, "warning");
    return null;
  }
  const counts = formatRoadmapCounts(roadmap);

  return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const container = new Container();
    const border = new DynamicBorder((s: string) => theme.fg("accent", s));

    container.addChild(border);
    container.addChild(new Text(theme.fg("accent", theme.bold(`Roadmap — ${project.label}`)), 1, 0));
    container.addChild(new Text(theme.fg("muted", `${items.length} item(s) • ${counts}`), 1, 0));

    const selectList = new SelectList(items, Math.min(Math.max(items.length, 6), 14), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);
    container.addChild(selectList);

    container.addChild(new Text(theme.fg("dim", "Type to filter • ↑↓ navigate • Enter inspect • Esc close"), 1, 0));
    container.addChild(border);

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  }, {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: "88%",
      maxHeight: "78%",
      margin: 1,
    },
  });
}

async function showRoadmapTask(project: WikiProject, roadmap: RoadmapFile, task: RoadmapTaskRecord, ctx: ExtensionCommandContext): Promise<void> {
  const text = formatRoadmapTaskText(project, roadmap, task);
  if (!ctx.hasUI) {
    ctx.ui.notify(text, "info");
    return;
  }

  await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
    const container = new Container();
    const border = new DynamicBorder((s: string) => theme.fg("accent", s));
    const mdTheme = getMarkdownTheme();

    container.addChild(border);
    container.addChild(new Text(theme.fg("accent", theme.bold(`${task.id} — ${task.title}`)), 1, 0));
    container.addChild(new Markdown(text, 1, 1, mdTheme));
    container.addChild(new Text(theme.fg("dim", "Press Enter or Esc to return to the roadmap"), 1, 0));
    container.addChild(border);

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (matchesKey(data, "enter") || matchesKey(data, "escape")) done();
      },
    };
  }, {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: "88%",
      maxHeight: "82%",
      margin: 1,
    },
  });
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
  return Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(" ") || "no tasks";
}

function formatRoadmapSnapshot(project: WikiProject, roadmap: RoadmapFile): string {
  const ordered = roadmap.order
    .map((taskId) => roadmap.tasks[taskId])
    .filter((task): task is RoadmapTaskRecord => Boolean(task));
  const lines = [
    `Roadmap: ${project.label}`,
    `Path: ${project.roadmapPath}`,
    `Items: ${ordered.length} (${formatRoadmapCounts(roadmap)})`,
    "",
  ];
  for (const task of ordered.slice(0, 10)) {
    lines.push(`${task.id} [${task.status}] ${task.title}`);
  }
  if (ordered.length > 10) lines.push(`... ${ordered.length - 10} more`);
  return lines.join("\n");
}

function formatRoadmapTaskText(project: WikiProject, roadmap: RoadmapFile, task: RoadmapTaskRecord): string {
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

  if (task.labels.length > 0) lines.push(`- Labels: ${task.labels.map((label) => `\`${label}\``).join(", ")}`);
  lines.push("", "## Summary", "", task.summary, "", "## Delta", "");
  lines.push(`- Desired: ${task.delta.desired}`);
  lines.push(`- Current: ${task.delta.current}`);
  lines.push(`- Closure: ${task.delta.closure}`);

  if (task.spec_paths.length > 0) {
    lines.push("", "## Spec paths", "", ...task.spec_paths.map((path) => `- \`${path}\``));
  }
  if (task.code_paths.length > 0) {
    lines.push("", "## Code paths", "", ...task.code_paths.map((path) => `- \`${path}\``));
  }
  if (task.research_ids.length > 0) {
    lines.push("", "## Research ids", "", ...task.research_ids.map((researchId) => `- \`${researchId}\``));
  }

  lines.push("", "## Next step", "", `Use \`/wiki-task ${task.id} focus\` when the current Pi session is centered on this task.`);
  return lines.join("\n");
}

async function runRebuild(project: WikiProject): Promise<void> {
  return withLockedPaths(rebuildTargetPaths(project), async () => {
    await runRebuildUnlocked(project);
  });
}

async function runRebuildUnlocked(project: WikiProject): Promise<void> {
  const configuredCommand = sanitizeCommand(project.config.codebase_wiki?.rebuild_command);
  const commands = configuredCommand
    ? uniqueCommands([configuredCommand, ...pythonAliasFallback(configuredCommand)])
    : await detectRebuildCommands(project.root);

  if (commands.length === 0) {
    throw new Error(
      `No rebuild command configured. Add codebase_wiki.rebuild_command to ${CONFIG_RELATIVE_PATH} or provide ${DEFAULT_REBUILD_SCRIPT}.`,
    );
  }

  let lastError: unknown;
  for (const command of commands) {
    try {
      await execFileAsync(command[0], command.slice(1), { cwd: project.root, timeout: 120_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Rebuild failed: ${formatError(lastError)}`);
}

function rebuildTargetPaths(project: WikiProject): string[] {
  return [
    resolve(project.root, project.indexPath),
    resolve(project.root, project.roadmapDocPath),
    resolve(project.root, project.eventsPath),
    resolve(project.root, project.taskSessionIndexPath),
    ...GENERATED_METADATA_FILES.map((fileName) => resolve(project.root, project.metaRoot, fileName)),
  ];
}

function roadmapMutationTargetPaths(project: WikiProject): string[] {
  return [
    resolve(project.root, project.roadmapPath),
    resolve(project.root, project.roadmapEventsPath),
    ...rebuildTargetPaths(project),
  ];
}

function taskSessionMutationTargetPaths(project: WikiProject): string[] {
  return [resolve(project.root, project.taskSessionIndexPath), ...rebuildTargetPaths(project)];
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
  const configPath = resolve(root, CONFIG_RELATIVE_PATH);
  if (!(await pathExists(configPath))) {
    throw new Error(`No ${CONFIG_RELATIVE_PATH} found at wiki root ${root}. Run /wiki-setup or /wiki-bootstrap first.`);
  }

  const config = await readJson<DocsConfig>(configPath);
  const docsRoot = normalizeRelativePath(config.docs_root ?? DEFAULT_DOCS_ROOT);
  const specsRoot = normalizeRelativePath(config.specs_root ?? DEFAULT_SPECS_ROOT);
  const researchRoot = normalizeRelativePath(config.research_root ?? DEFAULT_RESEARCH_ROOT);
  const indexPath = normalizeRelativePath(config.index_path ?? DEFAULT_INDEX_PATH);
  const roadmapPath = normalizeRelativePath(config.roadmap_path ?? DEFAULT_ROADMAP_PATH);
  const roadmapDocPath = normalizeRelativePath(config.roadmap_doc_path ?? DEFAULT_ROADMAP_DOC_PATH);
  const roadmapEventsPath = normalizeRelativePath(config.roadmap_events_path ?? DEFAULT_ROADMAP_EVENTS_PATH);
  const metaRoot = normalizeRelativePath(config.meta_root ?? DEFAULT_META_ROOT);
  const label = config.codebase_wiki?.name ?? config.project_name ?? basename(root);

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
    registryPath: resolve(root, metaRoot, "registry.json"),
    eventsPath: resolve(root, metaRoot, "events.jsonl"),
    roadmapEventsPath,
    taskSessionIndexPath: resolve(root, metaRoot, "task-session-index.json"),
  };
}

async function appendRoadmapTasks(pi: ExtensionAPI, project: WikiProject, ctx: ExtensionContext, tasks: RoadmapTaskInput[]): Promise<{ created: RoadmapTaskRecord[] }> {
  if (tasks.length === 0) throw new Error("No roadmap tasks provided.");

  return withLockedPaths(roadmapMutationTargetPaths(project), async () => {
    const roadmapPath = resolve(project.root, project.roadmapPath);
    const roadmap = await readRoadmapFile(roadmapPath);
    const createdAt = todayIso();
    const nextId = createRoadmapIdAllocator(Object.keys(roadmap.tasks));
    const created = tasks.map((task) => normalizeRoadmapTask(task, nextId, createdAt));

    for (const task of created) {
      roadmap.tasks[task.id] = task;
      roadmap.order.push(task.id);
    }
    roadmap.updated = nowIso();

    await writeJsonFile(roadmapPath, roadmap);
    await appendRoadmapHistoryEvent(project, "append", created);
    await appendRoadmapEvent(project, created);
    for (const task of created) {
      await recordTaskSessionLinkUnlocked(pi, project, ctx, task, {
        taskId: task.id,
        action: "spawn",
        summary: `Spawned task ${task.id} in current Pi session.`,
        setSessionName: false,
      });
    }
    await runRebuildUnlocked(project);
    return { created };
  });
}

function normalizeRoadmapTask(task: RoadmapTaskInput, nextId: () => string, today: string): RoadmapTaskRecord {
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
    delta: {
      desired: task.delta?.desired?.trim() ?? "",
      current: task.delta?.current?.trim() ?? "",
      closure: task.delta?.closure?.trim() ?? "",
    },
    created: today,
    updated: today,
  };
}

function normalizeRoadmapStatus(status: string | undefined): RoadmapStatus {
  if (!status) return "todo";
  if ((ROADMAP_STATUS_VALUES as readonly string[]).includes(status)) return status as RoadmapStatus;
  throw new Error(`Invalid roadmap status: ${status}`);
}

function normalizeRoadmapPriority(priority: string): RoadmapPriority {
  if ((ROADMAP_PRIORITY_VALUES as readonly string[]).includes(priority)) return priority as RoadmapPriority;
  throw new Error(`Invalid roadmap priority: ${priority}`);
}

function createRoadmapIdAllocator(existingIds: string[]): () => string {
  let counter = existingIds
    .map((id) => /^ROADMAP-(\d+)$/.exec(id)?.[1])
    .map((value) => (value ? Number.parseInt(value, 10) : 0))
    .reduce((max, value) => Math.max(max, value), 0);

  return () => {
    counter += 1;
    return `ROADMAP-${String(counter).padStart(3, "0")}`;
  };
}

async function linkTaskSession(
  pi: ExtensionAPI,
  project: WikiProject,
  ctx: ExtensionContext,
  input: TaskSessionLinkInput,
): Promise<{ taskId: string; title: string; action: TaskSessionAction }> {
  return withLockedPaths(taskSessionMutationTargetPaths(project), async () => {
    const task = await readRoadmapTask(project, input.taskId);
    if (!task) throw new Error(`Roadmap task not found: ${input.taskId}`);
    await recordTaskSessionLinkUnlocked(pi, project, ctx, task, input);
    await runRebuildUnlocked(project);
    return { taskId: task.id, title: task.title, action: normalizeTaskSessionAction(input.action) };
  });
}

async function recordTaskSessionLinkUnlocked(
  pi: ExtensionAPI,
  project: WikiProject,
  ctx: ExtensionContext,
  task: RoadmapTaskRecord,
  input: TaskSessionLinkInput,
): Promise<void> {
  if (!hasSessionManager(ctx)) return;

  const link = normalizeTaskSessionLinkInput(input);
  const shouldSetSessionName = input.setSessionName ?? link.action === "focus";
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

  const index = await readTaskSessionIndex(project.taskSessionIndexPath);
  const sessionMeta = getSessionMeta(ctx, shouldSetSessionName ? `${task.id} ${task.title}` : undefined);
  if (!sessionMeta) return;
  const changed = applyTaskSessionLink(index, sessionMeta, { ...link, taskId: task.id });
  if (changed) await writeJsonFile(project.taskSessionIndexPath, index);
  setTaskSessionStatus(ctx, task.id, task.title, link.action);
}

function normalizeTaskSessionLinkInput(input: TaskSessionLinkInput): TaskSessionLinkRecord {
  return {
    taskId: input.taskId.trim(),
    action: normalizeTaskSessionAction(input.action),
    summary: input.summary?.trim() ?? "",
    filesTouched: unique(input.filesTouched ?? []),
    spawnedTaskIds: unique(input.spawnedTaskIds ?? []),
    timestamp: nowIso(),
  };
}

function normalizeTaskSessionAction(action: string | undefined): TaskSessionAction {
  if (!action) return "focus";
  if ((TASK_SESSION_ACTION_VALUES as readonly string[]).includes(action)) return action as TaskSessionAction;
  throw new Error(`Invalid task session action: ${action}`);
}

function formatTaskSessionLinkSummary(result: { taskId: string; title: string; action: TaskSessionAction }): string {
  return `Linked current Pi session to ${result.taskId} (${result.action}) — ${result.title}`;
}

async function readRoadmapTask(project: WikiProject, taskId: string): Promise<RoadmapTaskRecord | null> {
  const roadmap = await readRoadmapFile(resolve(project.root, project.roadmapPath));
  return roadmap.tasks[taskId] ?? null;
}

function hasSessionManager(ctx: ExtensionContext): boolean {
  const manager = ctx.sessionManager as unknown as { getSessionId?: () => string } | undefined;
  return typeof manager?.getSessionId === "function";
}

function getSessionMeta(ctx: ExtensionContext, sessionNameOverride?: string): SessionMeta | null {
  if (!hasSessionManager(ctx)) return null;
  const manager = ctx.sessionManager as unknown as {
    getSessionId: () => string;
    getSessionName?: () => string | undefined;
    getSessionFile?: () => string | undefined;
  };
  const sessionId = manager.getSessionId();
  if (!sessionId) return null;
  const sessionFile = typeof manager.getSessionFile === "function" ? manager.getSessionFile() : undefined;
  return {
    sessionId,
    sessionName: sessionNameOverride ?? (typeof manager.getSessionName === "function" ? manager.getSessionName() : undefined),
    sessionFileName: sessionFile ? basename(sessionFile) : undefined,
  };
}

async function readTaskSessionIndex(path: string): Promise<TaskSessionIndexFile> {
  if (!(await pathExists(path))) return emptyTaskSessionIndex();
  const data = await readJson<TaskSessionIndexFile>(path);
  return {
    version: data.version ?? 1,
    updated: data.updated ?? nowIso(),
    tasks: typeof data.tasks === "object" && data.tasks ? data.tasks : {},
    sessions: typeof data.sessions === "object" && data.sessions ? data.sessions : {},
  };
}

function emptyTaskSessionIndex(): TaskSessionIndexFile {
  return {
    version: 1,
    updated: nowIso(),
    tasks: {},
    sessions: {},
  };
}

function applyTaskSessionLink(index: TaskSessionIndexFile, session: SessionMeta, link: TaskSessionLinkRecord): boolean {
  let changed = false;
  const taskSummary = index.tasks[link.taskId] ?? {
    session_ids: [],
    session_count: 0,
  };
  if (!taskSummary.session_ids.includes(session.sessionId)) {
    taskSummary.session_ids.push(session.sessionId);
    changed = true;
  }
  const nextSessionCount = taskSummary.session_ids.length;
  if (taskSummary.session_count !== nextSessionCount) {
    taskSummary.session_count = nextSessionCount;
    changed = true;
  }
  if (!taskSummary.last_timestamp || link.timestamp >= taskSummary.last_timestamp) {
    if (taskSummary.last_session_id !== session.sessionId || taskSummary.last_session_name !== session.sessionName || taskSummary.last_action !== link.action || taskSummary.last_summary !== (link.summary || undefined) || taskSummary.last_timestamp !== link.timestamp) {
      changed = true;
    }
    taskSummary.last_session_id = session.sessionId;
    taskSummary.last_session_name = session.sessionName;
    taskSummary.last_action = link.action;
    taskSummary.last_summary = link.summary || undefined;
    taskSummary.last_timestamp = link.timestamp;
  }
  index.tasks[link.taskId] = taskSummary;

  const sessionSummary = index.sessions[session.sessionId] ?? {
    id: session.sessionId,
    task_ids: [],
  };
  if (!sessionSummary.task_ids.includes(link.taskId)) {
    sessionSummary.task_ids.push(link.taskId);
    changed = true;
  }
  if (session.sessionName && sessionSummary.name !== session.sessionName) {
    sessionSummary.name = session.sessionName;
    changed = true;
  }
  if (session.sessionFileName && sessionSummary.file_name !== session.sessionFileName) {
    sessionSummary.file_name = session.sessionFileName;
    changed = true;
  }
  if (!sessionSummary.last_timestamp || link.timestamp >= sessionSummary.last_timestamp) {
    if (sessionSummary.last_action !== link.action || sessionSummary.last_summary !== (link.summary || undefined) || sessionSummary.last_timestamp !== link.timestamp) {
      changed = true;
    }
    sessionSummary.last_action = link.action;
    sessionSummary.last_summary = link.summary || undefined;
    sessionSummary.last_timestamp = link.timestamp;
  }
  index.sessions[session.sessionId] = sessionSummary;
  if (changed) index.updated = nowIso();
  return changed;
}

async function syncCurrentSessionTaskLinks(project: WikiProject, ctx: ExtensionContext): Promise<boolean> {
  if (!hasSessionManager(ctx)) return false;
  const session = getSessionMeta(ctx);
  if (!session) return false;
  const entries = ctx.sessionManager.getEntries();
  const links = entries.flatMap((entry) => {
    const link = parseTaskSessionLinkEntry(entry);
    return link ? [link] : [];
  });
  const index = await readTaskSessionIndex(project.taskSessionIndexPath);
  let changed = false;
  for (const link of links) {
    changed = applyTaskSessionLink(index, session, link) || changed;
  }
  if (!changed) return false;
  await writeJsonFile(project.taskSessionIndexPath, index);
  return true;
}

function parseTaskSessionLinkEntry(entry: unknown): TaskSessionLinkRecord | null {
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
  if (value?.type !== "custom" || value.customType !== TASK_SESSION_LINK_CUSTOM_TYPE || !value.data?.taskId) return null;
  try {
    return {
      taskId: String(value.data.taskId),
      action: normalizeTaskSessionAction(value.data.action),
      summary: typeof value.data.summary === "string" ? value.data.summary : "",
      filesTouched: Array.isArray(value.data.filesTouched) ? unique(value.data.filesTouched) : [],
      spawnedTaskIds: Array.isArray(value.data.spawnedTaskIds) ? unique(value.data.spawnedTaskIds) : [],
      timestamp: typeof value.timestamp === "string" ? value.timestamp : nowIso(),
    };
  } catch {
    return null;
  }
}

function findLatestTaskSessionLink(entries: unknown[]): TaskSessionLinkRecord | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const parsed = parseTaskSessionLinkEntry(entries[index]);
    if (parsed) return parsed;
  }
  return null;
}

function setTaskSessionStatus(ctx: ExtensionContext, taskId: string, title: string, action: TaskSessionAction): void {
  ctx.ui.setStatus("codebase-wiki-task", `${taskId} ${action} — ${title}`);
}

async function appendRoadmapEvent(project: WikiProject, tasks: RoadmapTaskRecord[]): Promise<void> {
  const eventPath = resolve(project.root, project.eventsPath);
  const prefix = await jsonlAppendPrefix(eventPath);
  const titles = tasks.map((task) => `${task.id} ${task.title}`).join("; ");
  const event = JSON.stringify({
    ts: nowIso(),
    kind: "roadmap_append",
    title: `Appended ${tasks.length} roadmap task(s)`,
    summary: titles,
  });
  await appendFile(eventPath, `${prefix}${event}\n`, "utf8");
}

async function appendRoadmapHistoryEvent(project: WikiProject, action: string, tasks: RoadmapTaskRecord[]): Promise<void> {
  const historyPath = resolve(project.root, project.roadmapEventsPath);
  const prefix = await jsonlAppendPrefix(historyPath);
  const lines = tasks.map((task) => JSON.stringify({
    ts: nowIso(),
    action,
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
  }));
  await appendFile(historyPath, `${prefix}${lines.join("\n")}\n`, "utf8");
}

async function jsonlAppendPrefix(path: string): Promise<string> {
  if (!(await pathExists(path))) return "";
  const raw = await readFile(path, "utf8");
  return raw.length > 0 && !raw.endsWith("\n") ? "\n" : "";
}

function formatRoadmapAppendSummary(project: WikiProject, tasks: RoadmapTaskRecord[]): string {
  return `${project.label}: appended ${tasks.length} roadmap task(s) to ${project.roadmapPath} — ${tasks.map((task) => task.id).join(", ")}`;
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
  return {
    version: data.version ?? 1,
    updated: data.updated ?? nowIso(),
    order: Array.isArray(data.order) ? data.order.filter(Boolean) : [],
    tasks: typeof data.tasks === "object" && data.tasks ? data.tasks : {},
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
    const event = JSON.parse(lines[lines.length - 1]) as { ts?: string; title?: string };
    return [event.ts, event.title].filter(Boolean).join(" | ") || null;
  } catch {
    return lines[lines.length - 1];
  }
}

function defaultSelfDriftScope(project: WikiProject): ScopeConfig {
  return {
    include: unique([
      project.indexPath,
      project.roadmapPath,
      project.roadmapDocPath,
      `${project.specsRoot}/**/*.md`,
      `${project.researchRoot}/**/*.jsonl`,
    ]),
    exclude: unique([`${project.docsRoot}/_templates/**`]),
  };
}

function defaultCodeDriftDocsScope(project: WikiProject): string[] {
  return unique([project.roadmapDocPath, `${project.specsRoot}/**/*.md`]);
}

function renderScope(label: string, items: string[]): string[] {
  return [label + ":", ...renderList(items)];
}

function renderList(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- none"];
}

function sanitizeCommand(command: unknown): string[] | null {
  if (!Array.isArray(command) || command.length === 0) return null;
  const cleaned = command.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
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
