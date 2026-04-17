#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const packageJsonPath = resolve(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const require = createRequire(import.meta.url);

function findPiRoot() {
  const fromEnv = process.env.PI_CODING_AGENT_ROOT;
  const candidates = [
    fromEnv,
    resolve(repoRoot, "node_modules", "@mariozechner", "pi-coding-agent"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(resolve(candidate, "dist", "index.js"))) return candidate;
  }

  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    const candidate = resolve(globalRoot, "@mariozechner", "pi-coding-agent");
    if (existsSync(resolve(candidate, "dist", "index.js"))) return candidate;
  } catch {
    // Ignore and fall through to the final error.
  }

  throw new Error(
    "Unable to locate @mariozechner/pi-coding-agent. Set PI_CODING_AGENT_ROOT or install pi-coding-agent locally/globally before running the smoke tests.",
  );
}

function extendNodePath(piRoot) {
  const entries = [
    resolve(repoRoot, "node_modules"),
    resolve(piRoot, "node_modules"),
    resolve(piRoot, "..", ".."),
  ].filter(existsSync);

  const existing = process.env.NODE_PATH?.split(path.delimiter).filter(Boolean) ?? [];
  process.env.NODE_PATH = [...new Set([...entries, ...existing])].join(path.delimiter);
  require("node:module").Module._initPaths();
}

function ensurePythonYamlAvailable() {
  const commands = ["python3", "python"];
  let lastError = null;

  for (const command of commands) {
    try {
      const version = execFileSync(command, ["-c", "import yaml; print(yaml.__version__)"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      return { command, yamlVersion: version };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    "Bootstrap smoke test requires python3/python with PyYAML installed (`import yaml`). " +
      (lastError instanceof Error ? lastError.message : String(lastError)),
  );
}

function withTempDir(prefix, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const run = async () => fn(dir);
  return run().finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function ensureIncludes(actual, expected, label) {
  for (const item of expected) {
    assert.ok(actual.includes(item), `${label} missing ${item}. Got: ${actual.join(", ")}`);
  }
}

async function main() {
  const piRoot = findPiRoot();
  extendNodePath(piRoot);
  const python = ensurePythonYamlAvailable();

  const { DefaultResourceLoader } = await import(pathToFileURL(resolve(piRoot, "dist", "index.js")).href);

  assert.equal(packageJson.name, "codebase-wiki", "Unexpected package name");
  assert.ok(Array.isArray(packageJson.pi?.extensions) && packageJson.pi.extensions.length === 1, "Expected one Pi extension in package.json");
  assert.ok(Array.isArray(packageJson.pi?.skills) && packageJson.pi.skills.length === 1, "Expected one Pi skill path in package.json");
  assert.equal(packageJson.peerDependencies?.["@mariozechner/pi-coding-agent"], "*", "Missing pi-coding-agent peer dependency");
  assert.equal(packageJson.peerDependencies?.["@sinclair/typebox"], "*", "Missing @sinclair/typebox peer dependency");
  console.log(`✓ package manifest looks correct (${packageJson.name}@${packageJson.version})`);

  await withTempDir("codebase-wiki-loader-", async (projectDir) => {
    mkdirSync(resolve(projectDir, ".pi"), { recursive: true });
    writeFileSync(resolve(projectDir, ".pi", "settings.json"), JSON.stringify({ packages: [repoRoot] }, null, 2));

    const loader = new DefaultResourceLoader({ cwd: projectDir });
    await loader.reload();

    const extensionResult = loader.getExtensions();
    assert.equal(extensionResult.errors.length, 0, `Unexpected extension load errors: ${extensionResult.errors.map((e) => e.message).join(" | ")}`);

    const extensions = extensionResult.extensions.filter((extension) => extension.path.startsWith(repoRoot));
    assert.equal(extensions.length, 1, `Expected exactly one package extension, found ${extensions.length}`);
    const extension = extensions[0];
    assert.equal(extension.sourceInfo.origin, "package", "Extension should load as a package resource");
    assert.equal(extension.sourceInfo.scope, "project", "Extension should load from project package settings");
    ensureIncludes([...extension.commands.keys()], [
      "wiki-setup",
      "wiki-bootstrap",
      "wiki-rebuild",
      "wiki-lint",
      "wiki-status",
      "wiki-self-drift",
      "wiki-code-drift",
      "wiki-task",
    ], "extension commands");
    ensureIncludes([...extension.tools.keys()], [
      "codebase_wiki_setup",
      "codebase_wiki_bootstrap",
      "codebase_wiki_rebuild",
      "codebase_wiki_status",
      "codebase_wiki_roadmap_append",
      "codebase_wiki_task_session_link",
    ], "extension tools");

    const skillResult = loader.getSkills();
    assert.equal(skillResult.diagnostics.length, 0, `Unexpected skill diagnostics: ${skillResult.diagnostics.map((d) => d.message).join(" | ")}`);
    const skills = skillResult.skills.filter((skill) => skill.filePath.startsWith(repoRoot));
    assert.equal(skills.length, 1, `Expected exactly one package skill, found ${skills.length}`);
    assert.equal(skills[0].name, "codebase-wiki", "Unexpected skill name");
    assert.equal(skills[0].sourceInfo.origin, "package", "Skill should load as a package resource");
  });
  console.log("✓ package loads through DefaultResourceLoader with one extension and one skill");

  await withTempDir("codebase-wiki-bootstrap-", async (projectDir) => {
    mkdirSync(resolve(projectDir, ".pi"), { recursive: true });
    writeFileSync(resolve(projectDir, ".pi", "settings.json"), JSON.stringify({ packages: [repoRoot] }, null, 2));
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });
    mkdirSync(resolve(projectDir, "frontend", "src"), { recursive: true });
    writeFileSync(resolve(projectDir, "frontend", "src", "index.ts"), "export const frontend = true;\n");
    mkdirSync(resolve(projectDir, "backend"), { recursive: true });
    writeFileSync(resolve(projectDir, "backend", "app.py"), "app = object()\n");
    mkdirSync(resolve(projectDir, "packages", "sdk", "src"), { recursive: true });
    writeFileSync(resolve(projectDir, "packages", "sdk", "package.json"), JSON.stringify({ name: "@smoke/sdk" }, null, 2));
    const nestedDir = resolve(projectDir, "packages", "nested", "worktree");
    mkdirSync(nestedDir, { recursive: true });

    const loader = new DefaultResourceLoader({ cwd: projectDir });
    await loader.reload();
    const extension = loader.getExtensions().extensions.find((item) => item.path.startsWith(repoRoot));
    assert.ok(extension, "Expected package extension to load for bootstrap smoke test");

    const setupTool = extension.tools.get("codebase_wiki_setup");
    assert.ok(setupTool && typeof setupTool.definition?.execute === "function", "Setup tool missing execute function");
    const bootstrapTool = extension.tools.get("codebase_wiki_bootstrap");
    assert.ok(bootstrapTool && typeof bootstrapTool.definition?.execute === "function", "Bootstrap tool missing execute function");

    const firstResult = await setupTool.definition.execute(
      "setup-smoke-1",
      { projectName: "Smoke Wiki" },
      undefined,
      undefined,
      { cwd: nestedDir },
    );
    const secondResult = await bootstrapTool.definition.execute(
      "bootstrap-smoke-2",
      { projectName: "Smoke Wiki", force: false },
      undefined,
      undefined,
      { cwd: nestedDir },
    );

    const first = firstResult.details;
    const second = secondResult.details;
    assert.equal(first.root, projectDir, "Setup from nested cwd should target repo root when no wiki exists yet");
    assert.equal(second.root, projectDir, "Bootstrap from nested cwd should reuse the existing wiki root");
    const toolCtx = {
      cwd: nestedDir,
      sessionManager: {
        getSessionId: () => "session-smoke-1",
        getSessionFile: () => resolve(projectDir, ".pi", "sessions", "session-smoke-1.jsonl"),
        getSessionName: () => "Smoke session",
        getEntries: () => [],
        getBranch: () => [],
      },
      ui: {
        setStatus: () => {},
        notify: () => {},
      },
    };
    const roadmapAppendTool = extension.tools.get("codebase_wiki_roadmap_append");
    assert.ok(roadmapAppendTool && typeof roadmapAppendTool.definition?.execute === "function", "Roadmap append tool missing execute function");
    await roadmapAppendTool.definition.execute(
      "roadmap-append-smoke",
      {
        tasks: [{
          title: "Smoke audit task",
          priority: "high",
          kind: "agent-workflow",
          summary: "Track unresolved smoke-test delta.",
          spec_paths: ["docs/specs/product.md"],
          code_paths: ["scripts/rebuild_docs_meta.py"],
          research_ids: [],
          labels: ["smoke"],
          delta: {
            desired: "Smoke repo has structured task append flow.",
            current: "Task was not yet appended.",
            closure: "Append one roadmap task through package tool.",
          },
        }],
      },
      undefined,
      undefined,
      toolCtx,
    );

    const taskSessionLinkTool = extension.tools.get("codebase_wiki_task_session_link");
    assert.ok(taskSessionLinkTool && typeof taskSessionLinkTool.definition?.execute === "function", "Task session link tool missing execute function");
    await taskSessionLinkTool.definition.execute(
      "task-link-smoke",
      {
        taskId: "ROADMAP-001",
        action: "focus",
        summary: "Focused smoke session on starter task.",
        filesTouched: ["extensions/codebase-wiki/index.ts"],
        spawnedTaskIds: [],
        setSessionName: true,
      },
      undefined,
      undefined,
      toolCtx,
    );

    const lint = JSON.parse(readFileSync(resolve(projectDir, ".docs", "lint.json"), "utf8"));
    const registry = JSON.parse(readFileSync(resolve(projectDir, ".docs", "registry.json"), "utf8"));
    const config = JSON.parse(readFileSync(resolve(projectDir, ".docs", "config.json"), "utf8"));
    const indexText = readFileSync(resolve(projectDir, "docs", "index.md"), "utf8");
    const systemText = readFileSync(resolve(projectDir, "docs", "specs", "system", "overview.md"), "utf8");
    const frontendSpecText = readFileSync(resolve(projectDir, "docs", "specs", "frontend", "overview.md"), "utf8");
    const roadmapText = readFileSync(resolve(projectDir, "docs", "roadmap.md"), "utf8");
    const roadmapJson = JSON.parse(readFileSync(resolve(projectDir, "docs", "roadmap.json"), "utf8"));
    const roadmapEvents = readFileSync(resolve(projectDir, ".docs", "roadmap-events.jsonl"), "utf8");
    const taskSessionIndex = JSON.parse(readFileSync(resolve(projectDir, ".docs", "task-session-index.json"), "utf8"));
    assert.ok(!existsSync(resolve(nestedDir, "docs")), "Bootstrap should anchor docs at the existing wiki root, not nested cwd");

    assert.equal(first.created.length, 12, `Expected 12 created starter files including inferred boundary specs, got ${first.created.length}`);
    assert.equal(first.updated.length, 0, "Initial bootstrap should not update files");
    assert.equal(second.created.length, 0, "Second bootstrap should not create files");
    assert.equal(second.updated.length, 0, "Second bootstrap should not update files without force");
    assert.equal(second.skipped.length, 12, `Expected 12 skipped starter files, got ${second.skipped.length}`);
    assert.equal(lint.issues.length, 0, `Expected zero lint issues, got ${lint.issues.length}`);
    assert.ok(Array.isArray(registry.docs) && registry.docs.length >= 7, "Expected generated registry docs including inferred boundary specs");
    assert.ok(Array.isArray(registry.research) && registry.research.length >= 1, "Expected generated research registry entries");
    assert.ok(registry.docs.some((doc) => doc.path === "docs/roadmap.md"), "Expected roadmap.md in generated registry");
    assert.ok(registry.docs.some((doc) => doc.path === "docs/specs/frontend/overview.md"), "Expected inferred frontend spec in registry");
    assert.ok(registry.docs.some((doc) => doc.path === "docs/specs/backend/overview.md"), "Expected inferred backend spec in registry");
    assert.ok(registry.docs.some((doc) => doc.path === "docs/specs/packages/sdk/overview.md"), "Expected inferred nested package spec in registry");
    assert.deepEqual(config.lint.repo_markdown, ["README.md", "backend/**/README.md", "frontend/**/README.md", "packages/sdk/**/README.md"], "Expected inferred repo markdown scope");
    assert.deepEqual(config.codebase_wiki.code_drift_scope.code, ["backend/**", "frontend/**", "packages/sdk/**"], "Expected inferred code drift scope");
    assert.match(indexText, /^# Smoke Wiki Docs Index/m, "Generated index title mismatch");
    assert.match(systemText, /Inferred brownfield boundaries/, "System overview missing inferred boundary section");
    assert.match(systemText, /\[Frontend\]\(\.\.\/frontend\/overview\.md\)/, "System overview missing inferred frontend link");
    assert.match(frontendSpecText, /^# Frontend/m, "Generated frontend boundary title mismatch");
    assert.match(frontendSpecText, /`frontend`/, "Generated frontend boundary spec missing code path");
    assert.match(roadmapText, /^# Roadmap/m, "Generated roadmap title mismatch");
    assert.ok(roadmapJson.tasks["ROADMAP-001"], "Structured roadmap seed missing");
    assert.ok(Object.values(roadmapJson.tasks).some((task) => task.title === "Smoke audit task"), "Roadmap append tool did not persist appended task");
    assert.ok(Array.isArray(roadmapJson.order) && roadmapJson.order.some((id) => roadmapJson.tasks[id]?.title === "Smoke audit task"), "Roadmap order missing appended task");
    assert.match(roadmapText, /Smoke audit task/, "Generated roadmap view missing appended task");
    assert.match(roadmapEvents, /Smoke audit task/, "Roadmap history missing appended task");
    assert.ok(taskSessionIndex.tasks["ROADMAP-001"], "Task session index missing linked task");
    assert.equal(taskSessionIndex.tasks["ROADMAP-001"].last_session_id, "session-smoke-1", "Task session index missing current session id");
    assert.match(roadmapText, /Session links:/, "Generated roadmap view missing session linkage metadata");
  });
  console.log(`✓ bootstrap smoke test passed (Python: ${python.command}, PyYAML: ${python.yamlVersion})`);

  console.log("All codebase-wiki smoke tests passed.");
}

await main();
