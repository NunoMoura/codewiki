import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { withLockedPaths } from "./mutation-queue";
import { resolveSetupRoot } from "./project-root";
import { starterDirectories, starterFiles, type StarterBrownfieldHints, type StarterBoundary } from "./templates";

const execFileAsync = promisify(execFile);
const GENERATED_OUTPUTS = [
  "docs/index.md",
  "docs/roadmap.md",
  ".docs/registry.json",
  ".docs/backlinks.json",
  ".docs/lint.json",
  ".docs/task-session-index.json",
] as const;
const CONTAINER_DIR_NAMES = new Set(["apps", "components", "domains", "extensions", "libs", "modules", "packages", "services", "skills", "surfaces"]);
const EXCLUDED_DIR_NAMES = new Set([
  ".bandwagon",
  ".docs",
  ".git",
  ".github",
  ".idea",
  ".next",
  ".nuxt",
  ".pi",
  ".pytest_cache",
  ".turbo",
  ".venv",
  ".vscode",
  "__pycache__",
  "assets",
  "build",
  "coverage",
  "dist",
  "docs",
  "fixtures",
  "migrations",
  "node_modules",
  "out",
  "public",
  "scripts",
  "static",
  "target",
  "test",
  "tests",
  "tmp",
  "vendor",
]);
const CODE_FILE_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cs", ".go", ".java", ".js", ".jsx", ".kt", ".mjs", ".php", ".py", ".rb", ".rs", ".scala", ".swift", ".ts", ".tsx"]);
const MANIFEST_FILE_NAMES = new Set(["Cargo.toml", "go.mod", "package.json", "pom.xml", "pyproject.toml", "requirements.txt", "setup.py", "tsconfig.json"]);

export interface BootstrapOptions {
  projectName?: string;
  force?: boolean;
}

export interface BootstrapResult {
  root: string;
  projectName: string;
  created: string[];
  updated: string[];
  skipped: string[];
}

export function registerBootstrapFeatures(pi: ExtensionAPI): void {
  pi.registerCommand("wiki-setup", {
    description: "Configure codebase-wiki for the current project without overwriting existing starter files",
    handler: async (args, ctx) => {
      try {
        const result = await setupCodebaseWiki(ctx.cwd, parseArgs(args, { allowForce: false }));
        ctx.ui.notify(formatSummary("Configured", result), result.updated.length + result.created.length > 0 ? "success" : "info");
      } catch (error) {
        ctx.ui.notify(formatError(error), "error");
      }
    },
  });

  pi.registerCommand("wiki-bootstrap", {
    description: "Scaffold a starter repo-local codebase wiki into the current project",
    getArgumentCompletions: (prefix) => {
      const options = ["--force"];
      const items = options.filter((item) => item.startsWith(prefix));
      return items.length ? items.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      try {
        const result = await bootstrapFromCurrentProject(ctx.cwd, parseArgs(args, { allowForce: true }));
        ctx.ui.notify(formatSummary("Bootstrapped", result), result.updated.length + result.created.length > 0 ? "success" : "info");
      } catch (error) {
        ctx.ui.notify(formatError(error), "error");
      }
    },
  });

  pi.registerTool({
    name: "codebase_wiki_setup",
    label: "Codebase Wiki Setup",
    description: "Configure codebase-wiki for the current project without overwriting existing starter files",
    promptSnippet: "Adopt or initialize the codebase wiki contract for the current project",
    promptGuidelines: [
      "Use this as the safe default when the repo should gain codebase-wiki support but you do not want to overwrite starter files.",
      "This reuses an existing ancestor wiki root when present, otherwise it targets the enclosing git repo root when present, else the current working directory.",
    ],
    parameters: Type.Object({
      projectName: Type.Optional(Type.String({ description: "Project name to write into starter docs; defaults to current directory name." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await setupCodebaseWiki(ctx.cwd, {
        projectName: params.projectName,
      });
      return {
        content: [{ type: "text", text: formatSummary("Configured", result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "codebase_wiki_bootstrap",
    label: "Codebase Wiki Bootstrap",
    description: "Scaffold a starter repo-local codebase wiki into the current project",
    promptSnippet: "Scaffold the starter codebase wiki contract into the current project",
    promptGuidelines: [
      "Use this when the user wants to create the starter codebase wiki contract in the current project.",
      "This reuses an existing ancestor wiki root when present, otherwise it targets the enclosing git repo root when present, else the current working directory.",
      "Prefer force=false unless the user explicitly asks to overwrite starter files.",
    ],
    parameters: Type.Object({
      projectName: Type.Optional(Type.String({ description: "Project name to write into starter docs; defaults to current directory name." })),
      force: Type.Optional(Type.Boolean({ description: "Overwrite existing starter files if true." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await bootstrapFromCurrentProject(ctx.cwd, {
        projectName: params.projectName,
        force: params.force ?? false,
      });
      return {
        content: [{ type: "text", text: formatSummary("Bootstrapped", result) }],
        details: result,
      };
    },
  });
}

export async function setupCodebaseWiki(startDir: string, options: Omit<BootstrapOptions, "force"> = {}): Promise<BootstrapResult> {
  const root = await resolveSetupRoot(startDir);
  return bootstrapCodebaseWiki(root, {
    projectName: options.projectName,
    force: false,
  });
}

export async function bootstrapFromCurrentProject(startDir: string, options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const root = await resolveSetupRoot(startDir);
  return bootstrapCodebaseWiki(root, options);
}

export async function bootstrapCodebaseWiki(root: string, options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const projectName = (options.projectName?.trim() || basename(root)).trim();
  const date = new Date().toISOString().slice(0, 10);
  const brownfieldHints = await detectBrownfieldHints(root);
  const files = starterFiles({ projectName, date, brownfieldHints });

  return withLockedPaths(bootstrapTargetPaths(root, files), async () => {
    const result: BootstrapResult = { root, projectName, created: [], updated: [], skipped: [] };

    for (const relativeDir of starterDirectories()) {
      await mkdir(resolve(root, relativeDir), { recursive: true });
    }

    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = resolve(root, relativePath);
      const exists = await pathExists(absolutePath);
      if (exists && !options.force) {
        result.skipped.push(relativePath);
        continue;
      }
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
      if (exists) result.updated.push(relativePath);
      else result.created.push(relativePath);
    }

    await runRebuild(root);
    return result;
  });
}

function bootstrapTargetPaths(root: string, files: Record<string, string>): string[] {
  return [...Object.keys(files), ...GENERATED_OUTPUTS].map((relativePath) => resolve(root, relativePath));
}

async function runRebuild(root: string): Promise<void> {
  const commands = [
    ["python3", "scripts/rebuild_docs_meta.py"],
    ["python", "scripts/rebuild_docs_meta.py"],
  ];

  let lastError: unknown;
  for (const command of commands) {
    try {
      await execFileAsync(command[0], command.slice(1), { cwd: root, timeout: 120_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Bootstrap rebuild failed: ${formatError(lastError)}`);
}

function parseArgs(args: string, options: { allowForce: boolean }): BootstrapOptions {
  const force = options.allowForce && /(?:^|\s)--force(?:\s|$)/.test(args);
  const cleaned = args.replace(/(?:^|\s)--force(?:\s|$)/g, " ").trim();
  return {
    force,
    projectName: cleaned || undefined,
  };
}

function formatSummary(action: "Configured" | "Bootstrapped", result: BootstrapResult): string {
  const parts = [
    `${action} ${result.projectName} wiki at ${result.root}.`,
    `created=${result.created.length}`,
    `updated=${result.updated.length}`,
    `skipped=${result.skipped.length}`,
  ];
  return parts.join(" ");
}

async function detectBrownfieldHints(root: string): Promise<StarterBrownfieldHints> {
  const boundaries = await discoverBrownfieldBoundaries(root);
  const repoMarkdownGlobs = unique([
    "README.md",
    ...boundaries.map((boundary) => `${boundary.codePath}/**/README.md`),
  ]);
  const codeGlobs = boundaries.length
    ? unique([
        ...boundaries.map((boundary) => `${boundary.codePath}/**`),
        ...(await pathExists(resolve(root, "scripts")) ? ["scripts/**"] : []),
      ])
    : ["src/**", "app/**", "backend/**", "server/**"];

  return {
    boundaries,
    repoMarkdownGlobs,
    codeGlobs,
  };
}

async function discoverBrownfieldBoundaries(root: string): Promise<StarterBoundary[]> {
  const entries = await readVisibleDirectories(root);
  const boundaries: StarterBoundary[] = [];

  for (const entry of entries) {
    if (CONTAINER_DIR_NAMES.has(entry)) {
      const children = await readVisibleDirectories(resolve(root, entry));
      for (const child of children) {
        const relativePath = `${entry}/${child}`;
        if (await looksLikeBoundary(resolve(root, relativePath), 0)) {
          boundaries.push(makeBoundary(relativePath));
        }
      }
      continue;
    }

    if (await looksLikeBoundary(resolve(root, entry), 0)) {
      boundaries.push(makeBoundary(entry));
    }
  }

  return boundaries.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function readVisibleDirectories(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !EXCLUDED_DIR_NAMES.has(name))
    .sort((a, b) => a.localeCompare(b));
}

async function looksLikeBoundary(path: string, depth: number): Promise<boolean> {
  if (depth > 2) return false;

  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      if (await looksLikeBoundary(resolve(path, entry.name), depth + 1)) return true;
      continue;
    }
    if (!entry.isFile()) continue;
    if (MANIFEST_FILE_NAMES.has(entry.name)) return true;
    if (CODE_FILE_EXTENSIONS.has(extname(entry.name))) return true;
  }

  return false;
}

function makeBoundary(relativePath: string): StarterBoundary {
  const segments = relativePath.split("/").filter(Boolean);
  const slug = segments.map(sanitizeSlugSegment).join("/");
  return {
    codePath: segments.join("/"),
    slug,
    title: segments.map(titleCase).join(" / "),
  };
}

function sanitizeSlugSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "boundary";
}

function titleCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unique(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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
