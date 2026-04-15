import { access, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { registerBootstrapFeatures } from "./bootstrap";

const execFileAsync = promisify(execFile);
const CONFIG_RELATIVE_PATH = ".docs/config.json";
const DEFAULT_DOCS_ROOT = "docs";
const DEFAULT_SCHEMA_PATH = "docs/schema.md";
const DEFAULT_INDEX_PATH = "docs/index.md";
const DEFAULT_META_ROOT = ".docs";
const DEFAULT_REBUILD_SCRIPT = "scripts/rebuild_docs_meta.py";
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
  schema_path?: string;
  index_path?: string;
  meta_root?: string;
  codebase_wiki?: CodebaseWikiConfig;
}

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

interface RegistryFile {
  generated_at: string;
  docs: RegistryDoc[];
}

interface WikiProject {
  root: string;
  label: string;
  config: DocsConfig;
  docsRoot: string;
  schemaPath: string;
  indexPath: string;
  metaRoot: string;
  configPath: string;
  lintPath: string;
  registryPath: string;
  eventsPath: string;
}

export default function codebaseWikiExtension(pi: ExtensionAPI) {
  registerBootstrapFeatures(pi);

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
    `Audit the live codebase wiki for internal drift in ${project.label}.`,
    "Scope:",
    ...renderScope("Include", include),
    ...renderScope("Exclude", exclude),
    "Context files:",
    `- ${project.configPath}`,
    `- ${project.indexPath}`,
    `- ${project.schemaPath}`,
    `- ${project.registryPath.replace(`${project.root}/`, "")}`,
    `- ${project.lintPath.replace(`${project.root}/`, "")}`,
    "Tasks:",
    "1. Find contradictions, overlaps, stale claims, duplicated rules, and docs that should merge, split, or be deleted.",
    "2. Check that plans, specs, decisions, analyses, and the schema still agree.",
    "3. Treat the generated index as navigation, not source of truth.",
    "Output format:",
    "- Findings by severity",
    "- Docs to merge, cut, archive, or split",
    "- Exact files to edit next",
    "- Short proposed edits",
    "Do not edit files yet.",
  ].join("\n");
}

function codeDriftPrompt(project: WikiProject, registry: RegistryFile | null): string {
  const docsScope = unique(project.config.codebase_wiki?.code_drift_scope?.docs ?? defaultSelfDriftScope(project).include ?? []);
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
    `Audit drift between the live codebase wiki and implementation for ${project.label}.`,
    "Docs scope:",
    ...renderScope("Include", docsScope),
    ...renderScope("Exclude", docsExclude),
    "Additional repository docs:",
    ...renderList(repoDocs),
    "Implementation scope:",
    ...renderList(codeScope.length > 0 ? codeScope : ["Use code paths referenced by the live docs; no explicit code scope configured."]),
    "Context files:",
    `- ${project.configPath}`,
    `- ${project.registryPath.replace(`${project.root}/`, "")}`,
    `- ${project.lintPath.replace(`${project.root}/`, "")}`,
    "Tasks:",
    "1. Find where docs overclaim, underclaim, or point to stale structure.",
    "2. Distinguish: docs wrong vs code behind docs vs true unresolved drift.",
    "3. Prefer concrete evidence from current files and route/package wiring.",
    "Output format:",
    "- Findings by severity",
    "- Docs wrong",
    "- Code behind docs",
    "- True drift to track in docs/drift",
    "- Exact files to edit next",
    "Do not edit files yet.",
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

  const live = registry.docs.filter((doc) => !doc.path.startsWith(`${project.docsRoot}/archive/`) && doc.path !== project.indexPath);
  const byType = countBy(live.map((doc) => doc.doc_type));
  lines.push(`Docs generated: ${registry.generated_at}`);
  lines.push(`Live docs: ${live.length}`);
  lines.push(`Types: ${Object.entries(byType).map(([key, value]) => `${key}=${value}`).join(" ") || "none"}`);
  lines.push(`Lint issues: ${report.issues.length}`);

  const lastEvent = await readLastEventLine(project.eventsPath);
  if (lastEvent) lines.push(`Last event: ${lastEvent}`);
  return lines.join("\n");
}

async function runRebuild(project: WikiProject): Promise<void> {
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

async function detectRebuildCommands(root: string): Promise<string[][]> {
  const scriptPath = resolve(root, DEFAULT_REBUILD_SCRIPT);
  if (!(await pathExists(scriptPath))) return [];
  return [
    ["python3", DEFAULT_REBUILD_SCRIPT],
    ["python", DEFAULT_REBUILD_SCRIPT],
  ];
}

async function loadProject(startDir: string): Promise<WikiProject> {
  const root = await findWikiRoot(startDir);
  if (!root) {
    throw new Error(`No ${CONFIG_RELATIVE_PATH} found from ${startDir} upward.`);
  }

  const config = await readJson<DocsConfig>(resolve(root, CONFIG_RELATIVE_PATH));
  const docsRoot = normalizeRelativePath(config.docs_root ?? DEFAULT_DOCS_ROOT);
  const schemaPath = normalizeRelativePath(config.schema_path ?? DEFAULT_SCHEMA_PATH);
  const indexPath = normalizeRelativePath(config.index_path ?? DEFAULT_INDEX_PATH);
  const metaRoot = normalizeRelativePath(config.meta_root ?? DEFAULT_META_ROOT);
  const label = config.codebase_wiki?.name ?? config.project_name ?? basename(root);

  return {
    root,
    label,
    config,
    docsRoot,
    schemaPath,
    indexPath,
    metaRoot,
    configPath: resolve(root, CONFIG_RELATIVE_PATH),
    lintPath: resolve(root, metaRoot, "lint.json"),
    registryPath: resolve(root, metaRoot, "registry.json"),
    eventsPath: resolve(root, metaRoot, "events.jsonl"),
  };
}

async function findWikiRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  while (true) {
    const candidate = resolve(current, CONFIG_RELATIVE_PATH);
    if (await pathExists(candidate)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
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
    include: unique([project.indexPath, project.schemaPath, `${project.docsRoot}/**/*.md`]),
    exclude: unique([`${project.docsRoot}/archive/**`, `${project.docsRoot}/_templates/**`]),
  };
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
