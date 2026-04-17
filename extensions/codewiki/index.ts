import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, matchesKey, type SelectItem, SelectList, Text, truncateToWidth } from "@mariozechner/pi-tui";
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
const GENERATED_METADATA_FILES = ["registry.json", "backlinks.json", "lint.json", "roadmap-state.json"] as const;
const TASK_SESSION_LINK_CUSTOM_TYPE = "codewiki.task-link";
const ROADMAP_WIDGET_KEY = "codewiki-roadmap";
const ROADMAP_WIDGET_MAX_VISIBLE_ITEMS = 4;
const ROADMAP_STATUS_VALUES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
const ROADMAP_PRIORITY_VALUES = ["critical", "high", "medium", "low"] as const;
const TASK_SESSION_ACTION_VALUES = ["focus", "progress", "blocked", "done", "spawn"] as const;
const STATUS_SCOPE_VALUES = ["docs", "code", "both"] as const;
const REVIEW_MODE_VALUES = ["idea", "architecture"] as const;
const COMMAND_PREFIX = "wiki";
const CANONICAL_TASK_ID_PREFIX = "TASK";
const LEGACY_TASK_ID_PREFIX = "ROADMAP";
const TASK_ID_PATTERN = /^(TASK|ROADMAP)-(\d+)$/;

interface ScopeConfig {
  include?: string[];
  exclude?: string[];
}

interface CodeDriftScopeConfig {
  docs?: string[];
  repo_docs?: string[];
  code?: string[];
}

interface CodewikiConfig {
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
  codewiki?: CodewikiConfig;
}

type RoadmapStatus = (typeof ROADMAP_STATUS_VALUES)[number];
type RoadmapPriority = (typeof ROADMAP_PRIORITY_VALUES)[number];
type TaskSessionAction = (typeof TASK_SESSION_ACTION_VALUES)[number];
type StatusScope = (typeof STATUS_SCOPE_VALUES)[number];
type ReviewMode = (typeof REVIEW_MODE_VALUES)[number];

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
  id?: string;
  path: string;
  title?: string;
  doc_type: string;
  state: string;
  summary?: string;
  owners?: string[];
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

interface RoadmapTaskUpdateInput {
  taskId: string;
  title?: string;
  status?: RoadmapStatus;
  priority?: RoadmapPriority;
  kind?: string;
  summary?: string;
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

interface RoadmapStateHealth {
  color: "green" | "yellow" | "red";
  errors: number;
  warnings: number;
  total_issues: number;
}

interface RoadmapStateSummary {
  task_count: number;
  open_count: number;
  status_counts: Record<string, number>;
  priority_counts: Record<string, number>;
}

interface RoadmapStateViews {
  ordered_task_ids: string[];
  open_task_ids: string[];
  in_progress_task_ids: string[];
  todo_task_ids: string[];
  blocked_task_ids: string[];
  done_task_ids: string[];
  cancelled_task_ids: string[];
  recent_task_ids: string[];
}

interface RoadmapStateTaskSummary {
  id: string;
  title: string;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  kind: string;
  summary: string;
  labels: string[];
  spec_paths: string[];
  code_paths: string[];
  updated: string;
}

interface RoadmapStateFile {
  version: number;
  generated_at: string;
  health: RoadmapStateHealth;
  summary: RoadmapStateSummary;
  views: RoadmapStateViews;
  tasks: Record<string, RoadmapStateTaskSummary>;
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
  roadmapStatePath: string;
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
const roadmapTaskUpdateInputSchema = Type.Object({
  taskId: Type.String({ minLength: 1, description: "Existing task id to update. Canonical ids use TASK-###; legacy ROADMAP-### is still accepted." }),
  title: Type.Optional(Type.String({ minLength: 1, description: "Updated task title." })),
  status: Type.Optional(roadmapStatusSchema),
  priority: Type.Optional(roadmapPrioritySchema),
  kind: Type.Optional(Type.String({ minLength: 1, description: "Updated task kind." })),
  summary: Type.Optional(Type.String({ minLength: 1, description: "Updated one-sentence task summary." })),
  spec_paths: Type.Optional(Type.Array(Type.String(), { description: "Replacement spec path list." })),
  code_paths: Type.Optional(Type.Array(Type.String(), { description: "Replacement code path list." })),
  research_ids: Type.Optional(Type.Array(Type.String(), { description: "Replacement research id list." })),
  labels: Type.Optional(Type.Array(Type.String(), { description: "Replacement label list." })),
  delta: Type.Optional(Type.Object({
    desired: Type.Optional(Type.String({ description: "Replacement desired-state text when provided." })),
    current: Type.Optional(Type.String({ description: "Replacement current-state text when provided." })),
    closure: Type.Optional(Type.String({ description: "Replacement closure text when provided." })),
  })),
});
const taskSessionLinkInputSchema = Type.Object({
  taskId: Type.String({ minLength: 1, description: "Existing task id to link to current Pi session. Canonical ids use TASK-###; legacy ROADMAP-### is still accepted." }),
  action: Type.Optional(taskSessionActionSchema),
  summary: Type.Optional(Type.String({ description: "Short note about what happened in this session for the task." })),
  filesTouched: Type.Optional(Type.Array(Type.String(), { default: [] })),
  spawnedTaskIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
  setSessionName: Type.Optional(Type.Boolean({ description: "When true, rename the current Pi session to this canonical task id + title." })),
});

export default function codewikiExtension(pi: ExtensionAPI) {
  registerBootstrapFeatures(pi);

  pi.on("turn_start", async (_event, ctx) => {
    const project = await maybeLoadProject(ctx.cwd);
    if (!project) {
      clearRoadmapWidget(ctx);
      return;
    }
    await withUiErrorHandling(ctx, async () => {
      await refreshRoadmapWidget(project, ctx);
    });
  });

  pi.on("session_start", async (_event, ctx) => {
    const project = await maybeLoadProject(ctx.cwd);
    if (!project) {
      ctx.ui.setStatus("codewiki-task", undefined);
      clearRoadmapWidget(ctx);
      return;
    }

    await withUiErrorHandling(ctx, async () => {
      const active = findLatestTaskSessionLink(ctx.sessionManager.getBranch());
      if (!active) {
        ctx.ui.setStatus("codewiki-task", undefined);
        await refreshRoadmapWidget(project, ctx);
        return;
      }
      const task = await readRoadmapTask(project, active.taskId);
      if (task) setTaskSessionStatus(ctx, task.id, task.title, active.action);
      await refreshRoadmapWidget(project, ctx, active);
    });
  });

  pi.registerCommand(`${COMMAND_PREFIX}-status`, {
    description: "Review wiki health and drift across docs, code, or both. Usage: /wiki-status [docs|code|both]",
    getArgumentCompletions: (prefix) => completeCommandOptions(prefix, STATUS_SCOPE_VALUES),
    handler: async (args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const scope = normalizeStatusScope(args);
        const project = await loadProject(ctx.cwd);
        const summary = await rebuildAndSummarize(ctx.cwd);
        const registry = await maybeReadJson<RegistryFile>(project.registryPath);
        const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
        const text = buildStatusText(project, registry, summary.report, scope, roadmapState, currentTaskLink(ctx));
        ctx.ui.notify(text, statusLevel(summary.report));
        await refreshRoadmapWidget(project, ctx, currentTaskLink(ctx));
        await queueAudit(pi, ctx, statusPrompt(project, registry, summary.report, scope));
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-fix`, {
    description: "Fix wiki drift in docs, code, or both. Usage: /wiki-fix [docs|code|both]",
    getArgumentCompletions: (prefix) => completeCommandOptions(prefix, STATUS_SCOPE_VALUES),
    handler: async (args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const scope = normalizeStatusScope(args);
        const project = await loadProject(ctx.cwd);
        const summary = await rebuildAndSummarize(ctx.cwd);
        const registry = await maybeReadJson<RegistryFile>(project.registryPath);
        ctx.ui.notify(`${project.label}: queued ${scope} wiki-fix flow. Deterministic preflight is ${statusColor(summary.report)}.`, statusLevel(summary.report));
        await refreshRoadmapWidget(project, ctx, currentTaskLink(ctx));
        await queueAudit(pi, ctx, fixPrompt(project, registry, summary.report, scope));
      });
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}-review`, {
    description: "Review project direction through idea or architecture lenses. Usage: /wiki-review [idea|architecture]",
    getArgumentCompletions: (prefix) => completeCommandOptions(prefix, REVIEW_MODE_VALUES),
    handler: async (args, ctx) => {
      await withUiErrorHandling(ctx, async () => {
        const mode = normalizeReviewMode(args);
        const project = await loadProject(ctx.cwd);
        const summary = await rebuildAndSummarize(ctx.cwd);
        const registry = await maybeReadJson<RegistryFile>(project.registryPath);
        ctx.ui.notify(`${project.label}: queued ${mode} review. Deterministic preflight is ${statusColor(summary.report)}.`, statusLevel(summary.report));
        await refreshRoadmapWidget(project, ctx, currentTaskLink(ctx));
        await queueAudit(pi, ctx, reviewPrompt(project, registry, summary.report, mode));
      });
    },
  });

  pi.registerTool({
    name: "codewiki_rebuild",
    label: "Codewiki Rebuild",
    description: "Rebuild the current project's codebase wiki metadata and return lint summary",
    promptSnippet: "Rebuild the current project's codebase wiki metadata and inspect deterministic lint results",
    promptGuidelines: [
      "Use this after editing wiki docs or before a semantic wiki audit when you need fresh registry and lint outputs.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const summary = await rebuildAndSummarize(ctx.cwd);
      const project = await loadProject(ctx.cwd);
      await refreshRoadmapWidget(project, ctx, currentTaskLink(ctx));
      return {
        content: [{ type: "text", text: summary.text }],
        details: summary,
      };
    },
  });

  pi.registerTool({
    name: "codewiki_status",
    label: "Codewiki Status",
    description: "Show the current project's codebase wiki inventory and lint status",
    promptSnippet: "Inspect the current project's codebase wiki inventory and lint status",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const project = await loadProject(ctx.cwd);
      const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
      const report = await maybeReadJson<LintReport>(project.lintPath);
      const registry = await maybeReadJson<RegistryFile>(project.registryPath);
      const text = report
        ? buildStatusText(project, registry, report, "both", roadmapState, currentTaskLink(ctx))
        : await readStatus(ctx.cwd);
      await refreshRoadmapWidget(project, ctx, currentTaskLink(ctx));
      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "codewiki_roadmap_append",
    label: "Codewiki Roadmap Append",
    description: "Append new roadmap tasks to docs/roadmap.json, update order, log history event, and rebuild generated roadmap/index outputs",
    promptSnippet: "Append new unresolved delta tasks to the current project's codebase wiki roadmap",
    promptGuidelines: [
      "Use this after self-drift or code-drift review when you found real unresolved delta that belongs in docs/roadmap.json.",
      "Do not use this for issues already covered by an existing roadmap task unless you first explain why duplication is needed.",
      "The tool assigns TASK-### ids automatically, appends them to roadmap order, logs history, and rebuilds generated outputs. Legacy ROADMAP-### lookups remain accepted during migration.",
    ],
    parameters: Type.Object({
      tasks: Type.Array(roadmapTaskInputSchema, { minItems: 1 }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = await loadProject(ctx.cwd);
      const result = await appendRoadmapTasks(pi, project, ctx, params.tasks);
      await refreshRoadmapWidget(project, ctx, currentTaskLink(ctx));
      return {
        content: [{ type: "text", text: formatRoadmapAppendSummary(project, result.created) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "codewiki_roadmap_update",
    label: "Codewiki Roadmap Update",
    description: "Update or close an existing roadmap task in docs/roadmap.json, log history event, and rebuild generated roadmap/index outputs",
    promptSnippet: "Update or close an existing roadmap task in the current project's codebase wiki roadmap",
    promptGuidelines: [
      "Use this when an existing roadmap task needs status, summary, paths, labels, or delta changes instead of creating a duplicate task.",
      "Set status='done' or status='cancelled' to close an existing task through the package workflow.",
      "Tool preserves task order, accepts legacy ROADMAP-### lookup during migration, logs mutation history, and rebuilds generated outputs.",
    ],
    parameters: roadmapTaskUpdateInputSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = await loadProject(ctx.cwd);
      const result = await updateRoadmapTask(project, params);
      await refreshRoadmapWidget(project, ctx, currentTaskLink(ctx));
      return {
        content: [{ type: "text", text: formatRoadmapUpdateSummary(project, result.task, result.action) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "codewiki_task_session_link",
    label: "Codewiki Task Session Link",
    description: "Link current Pi session to an existing roadmap task, persist a Pi custom session entry, and refresh live roadmap focus without maintaining repo-owned session caches",
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
      await refreshRoadmapWidget(project, ctx, { taskId: result.taskId, action: result.action, summary: "", filesTouched: [], spawnedTaskIds: [], timestamp: nowIso() });
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

function completeCommandOptions(prefix: string, options: readonly string[]): { value: string; label: string }[] | null {
  const items = options.filter((item) => item.startsWith(prefix));
  return items.length > 0 ? items.map((value) => ({ value, label: value })) : null;
}

function normalizeStatusScope(args: string): StatusScope {
  const value = args.trim().split(/\s+/, 1)[0] || "both";
  if ((STATUS_SCOPE_VALUES as readonly string[]).includes(value)) return value as StatusScope;
  throw new Error(`Invalid wiki scope: ${value}. Use docs, code, or both.`);
}

function normalizeReviewMode(args: string): ReviewMode {
  const value = args.trim().split(/\s+/, 1)[0] || "architecture";
  if ((REVIEW_MODE_VALUES as readonly string[]).includes(value)) return value as ReviewMode;
  throw new Error(`Invalid review mode: ${value}. Use idea or architecture.`);
}

interface DriftContext {
  selfInclude: string[];
  selfExclude: string[];
  docsScope: string[];
  docsExclude: string[];
  repoDocs: string[];
  codeScope: string[];
}

function buildDriftContext(project: WikiProject, registry: RegistryFile | null): DriftContext {
  const selfScope = project.config.codewiki?.self_drift_scope ?? defaultSelfDriftScope(project);
  const selfInclude = unique(selfScope.include ?? []);
  const selfExclude = unique(selfScope.exclude ?? []);
  const docsScope = unique(project.config.codewiki?.code_drift_scope?.docs ?? defaultCodeDriftDocsScope(project));
  const docsExclude = unique(project.config.codewiki?.self_drift_scope?.exclude ?? defaultSelfDriftScope(project).exclude ?? []);
  const repoDocs = unique(project.config.codewiki?.code_drift_scope?.repo_docs ?? ["README.md"]);
  const configCode = unique(project.config.codewiki?.code_drift_scope?.code ?? []);
  const registryCode = unique(
    (registry?.docs ?? [])
      .flatMap((doc) => doc.code_paths ?? [])
      .filter(Boolean),
  );
  const codeScope = unique([...configCode, ...registryCode]);
  return { selfInclude, selfExclude, docsScope, docsExclude, repoDocs, codeScope };
}

function countIssuesBySeverity(report: LintReport, severity: string): number {
  return report.issues.filter((issue) => issue.severity === severity).length;
}

function statusColor(report: LintReport): "green" | "yellow" | "red" {
  if (countIssuesBySeverity(report, "error") > 0) return "red";
  if (report.issues.length > 0) return "yellow";
  return "green";
}

function statusLevel(report: LintReport): "success" | "warning" | "error" {
  const color = statusColor(report);
  if (color === "red") return "error";
  if (color === "yellow") return "warning";
  return "success";
}

function buildSpecStatusLines(registry: RegistryFile, report: LintReport): string[] {
  const specs = registry.docs
    .filter((doc) => doc.doc_type === "spec")
    .sort((a, b) => a.path.localeCompare(b.path));
  if (specs.length === 0) return ["- none"];

  const lines: string[] = [];
  for (const spec of specs) {
    const codePaths = unique(spec.code_paths ?? []);
    const relatedIssues = report.issues.filter((issue) => issue.path === spec.path || issue.path === spec.path.replace(/^docs\//, ""));
    const issueSummary = relatedIssues.length > 0
      ? relatedIssues.map((issue) => `${issue.severity}:${issue.kind}`).join(", ")
      : "none";
    lines.push(`- ${spec.title ?? spec.path} — ${spec.path}`);
    lines.push(`  code: ${codePaths.length > 0 ? codePaths.join(", ") : "none mapped"}`);
    lines.push(`  drift signals: ${issueSummary}`);
  }
  return lines;
}

async function maybeReadRoadmapState(path: string): Promise<RoadmapStateFile | null> {
  return maybeReadJson<RoadmapStateFile>(path);
}

function currentTaskLink(ctx: ExtensionContext | ExtensionCommandContext): TaskSessionLinkRecord | null {
  if (!hasSessionManager(ctx)) return null;
  try {
    const manager = (ctx as { sessionManager: { getBranch: () => unknown[] } }).sessionManager;
    return findLatestTaskSessionLink(manager.getBranch());
  } catch {
    return null;
  }
}

function resolveRoadmapStateTaskId(state: RoadmapStateFile, taskId: string | undefined): string | null {
  if (!taskId) return null;
  for (const candidate of taskIdCandidates(taskId)) {
    if (state.tasks[candidate]) return candidate;
  }
  return null;
}

function isOpenRoadmapTask(task: RoadmapStateTaskSummary | undefined): boolean {
  return !!task && ["todo", "in_progress", "blocked"].includes(task.status);
}

function roadmapHealthThemeColor(color: RoadmapStateHealth["color"]): "success" | "warning" | "error" {
  if (color === "red") return "error";
  if (color === "yellow") return "warning";
  return "success";
}

function roadmapWorkingSetTaskIds(state: RoadmapStateFile, activeLink: TaskSessionLinkRecord | null): string[] {
  const activeId = resolveRoadmapStateTaskId(state, activeLink?.taskId);
  const activeTask = activeId ? state.tasks[activeId] : undefined;
  return unique([
    ...(isOpenRoadmapTask(activeTask) ? [activeId as string] : []),
    ...(state.views.in_progress_task_ids ?? []),
    ...(state.views.todo_task_ids ?? []),
    ...(state.views.blocked_task_ids ?? []),
  ]).filter((taskId) => !!state.tasks[taskId]);
}

function formatRoadmapWorkingSetLine(task: RoadmapStateTaskSummary, activeId: string | null, index: number): string {
  if (task.id === activeId && isOpenRoadmapTask(task)) return `- Focused: ${task.id} — ${task.title}`;
  if (task.status === "in_progress") return `- In progress: ${task.id} — ${task.title}`;
  if (task.status === "blocked") return `- Blocked: ${task.id} — ${task.title}`;
  if (index === 0) return `- Next: ${task.id} — ${task.title}`;
  return `- Todo: ${task.id} — ${task.title}`;
}

function buildRoadmapWorkingSetLines(state: RoadmapStateFile | null, activeLink: TaskSessionLinkRecord | null, limit = 3): string[] {
  if (!state) return ["- none"];
  const activeId = resolveRoadmapStateTaskId(state, activeLink?.taskId);
  const ids = roadmapWorkingSetTaskIds(state, activeLink);
  if (ids.length === 0) {
    const doneCount = state.summary.status_counts.done ?? 0;
    return [doneCount > 0 ? `- Roadmap clear: ${doneCount} done` : "- none"];
  }
  const visible = ids.slice(0, limit).map((taskId) => state.tasks[taskId]).filter(Boolean) as RoadmapStateTaskSummary[];
  const lines = visible.map((task, index) => formatRoadmapWorkingSetLine(task, activeId, index));
  const overflow = ids.length - visible.length;
  if (overflow > 0) lines.push(`- ... and ${overflow} more open task(s)`);
  return lines;
}

function renderRoadmapWidgetLines(state: RoadmapStateFile, activeLink: TaskSessionLinkRecord | null, theme: { fg: (color: string, text: string) => string; bold: (text: string) => string }, width: number): string[] {
  const statusCounts = state.summary.status_counts ?? {};
  const color = roadmapHealthThemeColor(state.health.color);
  const header = `Wiki ${state.health.color} • ${state.summary.open_count} open • ${statusCounts.in_progress ?? 0} in progress • ${statusCounts.blocked ?? 0} blocked`;
  const lines = [truncateToWidth(`${theme.fg(color, "●")} ${theme.bold(theme.fg(color, header))}`, width)];
  const activeId = resolveRoadmapStateTaskId(state, activeLink?.taskId);
  const ids = roadmapWorkingSetTaskIds(state, activeLink);

  if (ids.length === 0) {
    const doneCount = statusCounts.done ?? 0;
    lines.push(truncateToWidth(theme.fg("success", `  ✔ Roadmap clear${doneCount > 0 ? ` (${doneCount} done)` : ""}`), width));
    return lines;
  }

  const visible = ids.slice(0, ROADMAP_WIDGET_MAX_VISIBLE_ITEMS).map((taskId) => state.tasks[taskId]).filter(Boolean) as RoadmapStateTaskSummary[];
  for (let index = 0; index < visible.length; index += 1) {
    const task = visible[index];
    const prefix = task.id === activeId && isOpenRoadmapTask(task)
      ? theme.fg("accent", "✳")
      : task.status === "in_progress"
        ? theme.fg("accent", "◼")
        : task.status === "blocked"
          ? theme.fg("warning", "◻")
          : "◻";
    const label = task.id === activeId && isOpenRoadmapTask(task)
      ? `${task.id} ${task.title}`
      : task.status === "todo" && index === 0 && !activeId && !visible.some((candidate) => candidate.status === "in_progress")
        ? `Next: ${task.id} ${task.title}`
        : `${task.id} ${task.title}`;
    lines.push(truncateToWidth(`  ${prefix} ${label}`, width));
  }

  const overflow = ids.length - visible.length;
  if (overflow > 0) lines.push(truncateToWidth(theme.fg("dim", `  … and ${overflow} more open tasks`), width));
  return lines;
}

function clearRoadmapWidget(ctx: ExtensionContext | ExtensionCommandContext): void {
  const ui = ctx.ui as { setWidget?: (key: string, content: undefined, options?: { placement?: "aboveEditor" | "belowEditor" }) => void };
  if (typeof ui.setWidget === "function") ui.setWidget(ROADMAP_WIDGET_KEY, undefined);
}

async function refreshRoadmapWidget(project: WikiProject, ctx: ExtensionContext | ExtensionCommandContext, activeLink: TaskSessionLinkRecord | null = currentTaskLink(ctx)): Promise<void> {
  const ui = ctx.ui as { setWidget?: (key: string, content: ((tui: any, theme: any) => { render(): string[]; invalidate(): void }) | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }) => void };
  if (typeof ui.setWidget !== "function") return;
  const state = await maybeReadRoadmapState(project.roadmapStatePath);
  if (!state) {
    ui.setWidget(ROADMAP_WIDGET_KEY, undefined);
    return;
  }
  ui.setWidget(ROADMAP_WIDGET_KEY, (tui, theme) => ({
    render: () => renderRoadmapWidgetLines(state, activeLink, theme, tui?.terminal?.columns ?? 120),
    invalidate: () => {},
  }), { placement: "aboveEditor" });
}

function buildStatusText(project: WikiProject, registry: RegistryFile | null, report: LintReport, scope: StatusScope, roadmapState: RoadmapStateFile | null = null, activeLink: TaskSessionLinkRecord | null = null): string {
  const lines = [
    `Wiki: ${project.label}`,
    `Root: ${project.root}`,
    `Scope: ${scope}`,
    `Preflight: ${statusColor(report)} (errors=${countIssuesBySeverity(report, "error")} warnings=${countIssuesBySeverity(report, "warning")} total=${report.issues.length})`,
  ];

  if (!registry) {
    lines.push("Generated metadata missing. Run /wiki-bootstrap first, then retry /wiki-status.");
    return lines.join("\n");
  }

  const live = registry.docs.filter((doc) => doc.path !== project.indexPath);
  const byType = countBy(live.map((doc) => doc.doc_type));
  const researchFiles = registry.research ?? [];
  const researchEntries = researchFiles.reduce((sum, item) => sum + item.entry_count, 0);
  const roadmap = registry.roadmap;
  lines.push(`Docs generated: ${registry.generated_at}`);
  lines.push(`Live docs: ${live.length}`);
  lines.push(`Types: ${Object.entries(byType).map(([key, value]) => `${key}=${value}`).join(" ") || "none"}`);
  lines.push(`Research: files=${researchFiles.length} entries=${researchEntries}`);
  if (roadmap) lines.push(`Roadmap: tasks=${roadmap.entry_count} ${Object.entries(roadmap.counts).map(([key, value]) => `${key}=${value}`).join(" ")}`.trim());
  if (roadmapState) {
    lines.push(`Roadmap widget state: health=${roadmapState.health.color} open=${roadmapState.summary.open_count}`);
    lines.push("", "Roadmap working set:", ...buildRoadmapWorkingSetLines(roadmapState, activeLink));
  }
  lines.push("", "Specs and mapped drift signals:", ...buildSpecStatusLines(registry, report));
  lines.push("", `Semantic ${scope} review queued. If the result is yellow/red, prefer /wiki-fix ${scope}.`);
  return lines.join("\n");
}

function promptContextFiles(project: WikiProject): string[] {
  return [
    `- ${project.configPath}`,
    `- ${project.indexPath}`,
    `- ${project.roadmapPath}`,
    `- ${project.roadmapDocPath}`,
    `- ${project.registryPath.replace(`${project.root}/`, "")}`,
    `- ${project.lintPath.replace(`${project.root}/`, "")}`,
    `- ${project.roadmapStatePath.replace(`${project.root}/`, "")}`,
  ];
}

function renderSpecPromptMap(registry: RegistryFile | null): string[] {
  const specs = (registry?.docs ?? [])
    .filter((doc) => doc.doc_type === "spec")
    .sort((a, b) => a.path.localeCompare(b.path));
  if (specs.length === 0) return ["- none"];
  return specs.flatMap((spec) => {
    const codePaths = unique(spec.code_paths ?? []);
    return [`- ${spec.title ?? spec.path} | ${spec.path} | code=${codePaths.length > 0 ? codePaths.join(", ") : "none mapped"}`];
  });
}

function renderScopeForPrompt(scope: StatusScope, drift: DriftContext): string[] {
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
      ...renderList(drift.codeScope.length > 0 ? drift.codeScope : ["Use code paths referenced by live specs; no explicit code scope configured."]),
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
    ...renderList(drift.codeScope.length > 0 ? drift.codeScope : ["Use code paths referenced by live specs; no explicit code scope configured."]),
  ];
}

function statusPrompt(project: WikiProject, registry: RegistryFile | null, report: LintReport, scope: StatusScope): string {
  const drift = buildDriftContext(project, registry);
  return [
    `Review current wiki status for ${project.label}.`,
    `Requested scope: ${scope}.`,
    `Deterministic preflight color: ${statusColor(report)}.`,
    `Deterministic lint counts: errors=${countIssuesBySeverity(report, "error")} warnings=${countIssuesBySeverity(report, "warning")} total=${report.issues.length}.`,
    ...renderScopeForPrompt(scope, drift),
    "Context files:",
    ...promptContextFiles(project),
    "Spec map:",
    ...renderSpecPromptMap(registry),
    "Tasks:",
    "1. Infer project shape from evidence first: greenfield vs brownfield, app vs library vs service vs monorepo, and major ownership seams.",
    "2. Use repo evidence first and ask at most 3 high-value user questions only if ambiguity materially changes the conclusion or edit scope.",
    "3. Classify the project as green, yellow, or red from a wiki-health standpoint.",
    "4. For each spec, describe mapped code, likely drift, and concrete evidence.",
    "5. Recommend the next step. If the repo is yellow or red, suggest /wiki-fix with the right scope.",
    "Output format:",
    "- Overall status: green|yellow|red with confidence",
    "- Inferred project shape",
    "- Per-spec drift summary",
    "- Questions for the user only if blocking",
    "- Recommended next step",
    "Do not edit files yet.",
  ].join("\n");
}

function fixPrompt(project: WikiProject, registry: RegistryFile | null, report: LintReport, scope: StatusScope): string {
  const drift = buildDriftContext(project, registry);
  const scopeRule = scope === "docs"
    ? "Prefer canonical docs/spec edits. Do not change code unless a tiny supporting fix is required."
    : scope === "code"
      ? "Prefer implementation fixes when specs are clear. If product intent or spec authority is ambiguous, ask before changing code."
      : "Choose the smallest coherent combined docs/code fix that resolves the drift cleanly.";
  return [
    `Fix wiki drift for ${project.label}.`,
    `Requested scope: ${scope}.`,
    `Deterministic preflight color: ${statusColor(report)}.`,
    ...renderScopeForPrompt(scope, drift),
    "Context files:",
    ...promptContextFiles(project),
    "Spec map:",
    ...renderSpecPromptMap(registry),
    "Rules:",
    "- infer project shape first and use repo evidence before asking questions",
    "- ask at most 3 high-value user questions only when ambiguity materially changes the fix",
    `- ${scopeRule}`,
    "- preserve the global-package plus repo-local-data architecture",
    "- preserve roadmap as container, tasks as atomic work units, and Pi sessions as native execution history",
    "- if work maps to an existing task, use codewiki_task_session_link",
    "- if true unresolved delta remains, append a roadmap task with codewiki_roadmap_append",
    "- rebuild generated outputs before finishing",
    "- rerun deterministic status before summarizing",
    "Output format:",
    "- Changes made",
    "- Questions asked (if any)",
    "- Remaining risks or follow-ups",
    "- Recommended next command",
  ].join("\n");
}

function reviewPrompt(project: WikiProject, registry: RegistryFile | null, report: LintReport, mode: ReviewMode): string {
  const drift = buildDriftContext(project, registry);
  const modeTasks = mode === "idea"
    ? [
        "1. Review the project from business value, user need, scope coherence, and product narrative standpoints.",
        "2. Identify whether the documented intent matches a believable user and delivery need.",
        "3. Highlight scope creep, weak differentiation, or missing problem framing.",
      ]
    : [
        "1. Review the project from technical execution, ownership boundaries, architecture quality, and delivery risk standpoints.",
        "2. Identify weak seams, hidden coupling, missing invariants, or risky implementation patterns.",
        "3. Highlight where specs and code organization help or hinder execution quality.",
      ];
  return [
    `Run a senior ${mode} review for ${project.label}.`,
    `Deterministic preflight color: ${statusColor(report)}.`,
    ...renderScopeForPrompt("both", drift),
    "Context files:",
    ...promptContextFiles(project),
    "Spec map:",
    ...renderSpecPromptMap(registry),
    "Rules:",
    "- infer project shape from repo evidence first",
    "- ask at most 2 concise user questions only if a missing answer materially changes the review",
    ...modeTasks,
    "Output format:",
    "- Overall judgment",
    "- Strengths",
    "- Risks",
    "- Highest-leverage recommendations",
    "- Questions for the user only if blocking",
    "Do not edit files unless the user explicitly asks for fixes after the review.",
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
  const roadmapState = await maybeReadRoadmapState(project.roadmapStatePath);
  if (!report) return `Wiki: ${project.label}\nRoot: ${project.root}\nGenerated metadata missing. Run /wiki-bootstrap first, then retry /wiki-status.`;
  return buildStatusText(project, registry, report, "both", roadmapState);
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
    container.addChild(new Text(theme.fg("muted", `${items.length} task(s) • ${counts}`), 1, 0));

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
    `Tasks: ${ordered.length} (${formatRoadmapCounts(roadmap)})`,
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

  lines.push("", "## Next step", "", `Use internal task-session linking when the current Pi session is centered on ${task.id}.`);
  return lines.join("\n");
}

async function runRebuild(project: WikiProject): Promise<void> {
  return withLockedPaths(rebuildTargetPaths(project), async () => {
    await runRebuildUnlocked(project);
  });
}

async function runRebuildUnlocked(project: WikiProject): Promise<void> {
  const configuredCommand = sanitizeCommand(project.config.codewiki?.rebuild_command);
  const commands = configuredCommand
    ? uniqueCommands([configuredCommand, ...pythonAliasFallback(configuredCommand)])
    : await detectRebuildCommands(project.root);

  if (commands.length === 0) {
    throw new Error(
      `No rebuild command configured. Add codewiki.rebuild_command to ${CONFIG_RELATIVE_PATH} or provide ${DEFAULT_REBUILD_SCRIPT}.`,
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
    ...GENERATED_METADATA_FILES.map((fileName) => resolve(project.root, project.metaRoot, fileName)),
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
  const configPath = resolve(root, CONFIG_RELATIVE_PATH);
  if (!(await pathExists(configPath))) {
    throw new Error(`No ${CONFIG_RELATIVE_PATH} found at wiki root ${root}. Run /wiki-bootstrap first.`);
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
    registryPath: resolve(root, metaRoot, "registry.json"),
    eventsPath: resolve(root, metaRoot, "events.jsonl"),
    roadmapEventsPath,
    roadmapStatePath: resolve(root, metaRoot, "roadmap-state.json"),
  };
}

async function appendRoadmapTasks(pi: ExtensionAPI, project: WikiProject, ctx: ExtensionContext, tasks: RoadmapTaskInput[]): Promise<{ created: RoadmapTaskRecord[] }> {
  if (tasks.length === 0) throw new Error("No roadmap tasks provided.");

  return withLockedPaths(roadmapMutationTargetPaths(project), async () => {
    const roadmapPath = resolve(project.root, project.roadmapPath);
    const roadmap = await readRoadmapFile(roadmapPath);
    const createdAt = todayIso();
    const nextId = createTaskIdAllocator(Object.keys(roadmap.tasks));
    const created = tasks.map((task) => normalizeRoadmapTask(task, nextId, createdAt));

    for (const task of created) {
      roadmap.tasks[task.id] = task;
      roadmap.order.push(task.id);
    }
    roadmap.updated = nowIso();

    await writeJsonFile(roadmapPath, roadmap);
    await appendRoadmapHistoryEvent(project, "append", created);
    await appendRoadmapEvent(project, "append", created);
    for (const task of created) {
      await recordTaskSessionLinkUnlocked(pi, ctx, task, {
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

async function updateRoadmapTask(project: WikiProject, input: RoadmapTaskUpdateInput): Promise<{ action: "update" | "close"; task: RoadmapTaskRecord }> {
  if (!hasRoadmapTaskUpdateFields(input)) throw new Error("No roadmap task changes provided.");

  return withLockedPaths(roadmapMutationTargetPaths(project), async () => {
    const roadmapPath = resolve(project.root, project.roadmapPath);
    const roadmap = await readRoadmapFile(roadmapPath);
    const existing = resolveRoadmapTask(roadmap, input.taskId);
    if (!existing) throw new Error(`Roadmap task not found: ${input.taskId}`);

    const updatedTask = applyRoadmapTaskUpdate(existing, input, todayIso());
    roadmap.tasks[updatedTask.id] = updatedTask;
    roadmap.updated = nowIso();

    const action = isClosedRoadmapStatus(existing.status) || !isClosedRoadmapStatus(updatedTask.status)
      ? "update"
      : "close";

    await writeJsonFile(roadmapPath, roadmap);
    await appendRoadmapHistoryEvent(project, action, [updatedTask]);
    await appendRoadmapEvent(project, action, [updatedTask]);
    await runRebuildUnlocked(project);
    return { action, task: updatedTask };
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

function applyRoadmapTaskUpdate(task: RoadmapTaskRecord, input: RoadmapTaskUpdateInput, today: string): RoadmapTaskRecord {
  return {
    ...task,
    title: input.title === undefined ? task.title : requireNonEmptyTrimmed(input.title, `Roadmap task ${task.id} title`),
    status: input.status === undefined ? task.status : normalizeRoadmapStatus(input.status),
    priority: input.priority === undefined ? task.priority : normalizeRoadmapPriority(input.priority),
    kind: input.kind === undefined ? task.kind : requireNonEmptyTrimmed(input.kind, `Roadmap task ${task.id} kind`),
    summary: input.summary === undefined ? task.summary : requireNonEmptyTrimmed(input.summary, `Roadmap task ${task.id} summary`),
    spec_paths: input.spec_paths === undefined ? task.spec_paths : unique(input.spec_paths),
    code_paths: input.code_paths === undefined ? task.code_paths : unique(input.code_paths),
    research_ids: input.research_ids === undefined ? task.research_ids : unique(input.research_ids),
    labels: input.labels === undefined ? task.labels : unique(input.labels),
    delta: {
      desired: input.delta?.desired === undefined ? task.delta.desired : input.delta.desired.trim(),
      current: input.delta?.current === undefined ? task.delta.current : input.delta.current.trim(),
      closure: input.delta?.closure === undefined ? task.delta.closure : input.delta.closure.trim(),
    },
    updated: today,
  };
}

function hasRoadmapTaskUpdateFields(input: RoadmapTaskUpdateInput): boolean {
  return input.title !== undefined
    || input.status !== undefined
    || input.priority !== undefined
    || input.kind !== undefined
    || input.summary !== undefined
    || input.spec_paths !== undefined
    || input.code_paths !== undefined
    || input.research_ids !== undefined
    || input.labels !== undefined
    || input.delta?.desired !== undefined
    || input.delta?.current !== undefined
    || input.delta?.closure !== undefined;
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
  if ((ROADMAP_STATUS_VALUES as readonly string[]).includes(status)) return status as RoadmapStatus;
  throw new Error(`Invalid roadmap status: ${status}`);
}

function normalizeRoadmapPriority(priority: string): RoadmapPriority {
  if ((ROADMAP_PRIORITY_VALUES as readonly string[]).includes(priority)) return priority as RoadmapPriority;
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

function resolveRoadmapTask(roadmap: RoadmapFile, requestedId: string): RoadmapTaskRecord | null {
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
  return unique([trimmed, upper, formatTaskId(sequence), formatLegacyTaskId(sequence)]);
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
  ctx: ExtensionContext,
  input: TaskSessionLinkInput,
): Promise<{ taskId: string; title: string; action: TaskSessionAction }> {
  const task = await readRoadmapTask(project, input.taskId);
  if (!task) throw new Error(`Roadmap task not found: ${input.taskId}`);
  await recordTaskSessionLinkUnlocked(pi, ctx, task, input);
  return { taskId: task.id, title: task.title, action: normalizeTaskSessionAction(input.action) };
}

async function recordTaskSessionLinkUnlocked(
  pi: ExtensionAPI,
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
  return resolveRoadmapTask(roadmap, taskId);
}

function hasSessionManager(ctx: ExtensionContext | ExtensionCommandContext): boolean {
  const manager = (ctx as { sessionManager?: { getSessionId?: () => string } }).sessionManager;
  return typeof manager?.getSessionId === "function";
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
  ctx.ui.setStatus("codewiki-task", `${taskId} ${action} — ${title}`);
}

async function appendRoadmapEvent(project: WikiProject, action: string, tasks: RoadmapTaskRecord[]): Promise<void> {
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

function formatRoadmapUpdateSummary(project: WikiProject, task: RoadmapTaskRecord, action: "update" | "close"): string {
  return `${project.label}: ${roadmapMutationVerb(action).toLowerCase()} roadmap task ${task.id} in ${project.roadmapPath}`;
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
