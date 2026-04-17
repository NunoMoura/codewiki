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

  assert.equal(packageJson.name, "codewiki", "Unexpected package name");
  assert.ok(Array.isArray(packageJson.pi?.extensions) && packageJson.pi.extensions.length === 1, "Expected one Pi extension in package.json");
  assert.ok(Array.isArray(packageJson.pi?.skills) && packageJson.pi.skills.length === 1, "Expected one Pi skill path in package.json");
  assert.equal(packageJson.peerDependencies?.["@mariozechner/pi-coding-agent"], "*", "Missing pi-coding-agent peer dependency");
  assert.equal(packageJson.peerDependencies?.["@sinclair/typebox"], "*", "Missing @sinclair/typebox peer dependency");
  console.log(`✓ package manifest looks correct (${packageJson.name}@${packageJson.version})`);

  await withTempDir("codewiki-loader-", async (projectDir) => {
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
    const commandNames = [...extension.commands.keys()];
    ensureIncludes(commandNames, [
      "wiki-bootstrap",
      "wiki-status",
      "wiki-fix",
      "wiki-review",
    ], "extension commands");
    assert.equal(commandNames.length, 4, `Expected exactly 4 public commands, got ${commandNames.length}: ${commandNames.join(", ")}`);
    for (const legacyCommand of ["wiki-setup", "wiki-rebuild", "wiki-lint", "wiki-roadmap", "wiki-self-drift", "wiki-code-drift", "wiki-task"]) {
      assert.ok(!commandNames.includes(legacyCommand), `Legacy public command should not be registered: ${legacyCommand}`);
    }
    ensureIncludes([...extension.tools.keys()], [
      "codewiki_setup",
      "codewiki_bootstrap",
      "codewiki_rebuild",
      "codewiki_status",
      "codewiki_roadmap_append",
      "codewiki_roadmap_update",
      "codewiki_task_session_link",
    ], "extension tools");

    const skillResult = loader.getSkills();
    assert.equal(skillResult.diagnostics.length, 0, `Unexpected skill diagnostics: ${skillResult.diagnostics.map((d) => d.message).join(" | ")}`);
    const skills = skillResult.skills.filter((skill) => skill.filePath.startsWith(repoRoot));
    assert.equal(skills.length, 1, `Expected exactly one package skill, found ${skills.length}`);
    assert.equal(skills[0].name, "codewiki", "Unexpected skill name");
    assert.equal(skills[0].sourceInfo.origin, "package", "Skill should load as a package resource");
  });
  console.log("✓ package loads through DefaultResourceLoader with one extension and one skill");

  await withTempDir("codewiki-bootstrap-", async (projectDir) => {
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

    const setupTool = extension.tools.get("codewiki_setup");
    assert.ok(setupTool && typeof setupTool.definition?.execute === "function", "Setup tool missing execute function");
    const bootstrapTool = extension.tools.get("codewiki_bootstrap");
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
    const sessionEntries = [];
    const toolCtx = {
      cwd: nestedDir,
      sessionManager: {
        getSessionId: () => "session-smoke-1",
        getSessionFile: () => resolve(projectDir, ".pi", "sessions", "session-smoke-1.jsonl"),
        getSessionName: () => "Smoke session",
        getEntries: () => sessionEntries,
        getBranch: () => sessionEntries,
      },
      ui: {
        setStatus: () => {},
        setWidget: () => {},
        notify: () => {},
      },
    };
    const roadmapAppendTool = extension.tools.get("codewiki_roadmap_append");
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
    const appendedRoadmap = JSON.parse(readFileSync(resolve(projectDir, "docs", "roadmap.json"), "utf8"));
    const appendedTaskId = Array.isArray(appendedRoadmap.order)
      ? appendedRoadmap.order.find((id) => appendedRoadmap.tasks[id]?.title === "Smoke audit task")
      : undefined;
    assert.ok(appendedTaskId, "Roadmap order missing appended task before update");

    const roadmapUpdateTool = extension.tools.get("codewiki_roadmap_update");
    assert.ok(roadmapUpdateTool && typeof roadmapUpdateTool.definition?.execute === "function", "Roadmap update tool missing execute function");
    await roadmapUpdateTool.definition.execute(
      "roadmap-update-smoke",
      {
        taskId: appendedTaskId,
        status: "done",
        summary: "Close smoke-test delta through existing roadmap task mutation.",
        labels: ["smoke", "closed"],
        delta: {
          current: "Task was appended and then closed through package mutation tool.",
          closure: "Update existing roadmap task through package tool and rebuild generated outputs.",
        },
      },
      undefined,
      undefined,
      toolCtx,
    );

    const taskSessionLinkTool = extension.tools.get("codewiki_task_session_link");
    assert.ok(taskSessionLinkTool && typeof taskSessionLinkTool.definition?.execute === "function", "Task session link tool missing execute function");
    await taskSessionLinkTool.definition.execute(
      "task-link-smoke",
      {
        taskId: "ROADMAP-001",
        action: "focus",
        summary: "Focused smoke session on starter task.",
        filesTouched: ["extensions/codewiki/index.ts"],
        spawnedTaskIds: [],
        setSessionName: true,
      },
      undefined,
      undefined,
      toolCtx,
    );
    sessionEntries.push({
      type: "custom",
      customType: "codewiki.task-link",
      timestamp: "2026-04-17T15:10:00Z",
      data: {
        taskId: "TASK-001",
        action: "focus",
        summary: "Focused smoke session on starter task.",
        filesTouched: ["extensions/codewiki/index.ts"],
        spawnedTaskIds: [],
      },
    });

    const statusNotifications = [];
    const fixNotifications = [];
    const reviewNotifications = [];
    const widgetState = { key: null, content: null, options: null };
    const renderWidget = () => {
      assert.equal(widgetState.key, "codewiki-roadmap", "Expected roadmap widget key");
      assert.ok(typeof widgetState.content === "function", "Expected roadmap widget render callback");
      const instance = widgetState.content(
        { terminal: { columns: 120 }, requestRender: () => {} },
        { fg: (_color, text) => text, bold: (text) => text },
      );
      return instance.render();
    };
    const statusCommand = extension.commands.get("wiki-status");
    assert.ok(statusCommand && typeof statusCommand.handler === "function", "wiki-status command missing handler");
    await statusCommand.handler("both", {
      cwd: nestedDir,
      isIdle: () => true,
      sessionManager: toolCtx.sessionManager,
      ui: {
        notify: (message, level) => statusNotifications.push({ message, level }),
        setWidget: (key, content, options) => {
          widgetState.key = key;
          widgetState.content = content;
          widgetState.options = options;
        },
      },
    });
    const fixCommand = extension.commands.get("wiki-fix");
    assert.ok(fixCommand && typeof fixCommand.handler === "function", "wiki-fix command missing handler");
    await fixCommand.handler("docs", {
      cwd: nestedDir,
      isIdle: () => true,
      sessionManager: toolCtx.sessionManager,
      ui: {
        notify: (message, level) => fixNotifications.push({ message, level }),
        setWidget: (key, content, options) => {
          widgetState.key = key;
          widgetState.content = content;
          widgetState.options = options;
        },
      },
    });
    const reviewCommand = extension.commands.get("wiki-review");
    assert.ok(reviewCommand && typeof reviewCommand.handler === "function", "wiki-review command missing handler");
    await reviewCommand.handler("architecture", {
      cwd: nestedDir,
      isIdle: () => true,
      sessionManager: toolCtx.sessionManager,
      ui: {
        notify: (message, level) => reviewNotifications.push({ message, level }),
        setWidget: (key, content, options) => {
          widgetState.key = key;
          widgetState.content = content;
          widgetState.options = options;
        },
      },
    });

    const lint = JSON.parse(readFileSync(resolve(projectDir, ".docs", "lint.json"), "utf8"));
    const registry = JSON.parse(readFileSync(resolve(projectDir, ".docs", "registry.json"), "utf8"));
    const config = JSON.parse(readFileSync(resolve(projectDir, ".docs", "config.json"), "utf8"));
    const indexText = readFileSync(resolve(projectDir, "docs", "index.md"), "utf8");
    const systemText = readFileSync(resolve(projectDir, "docs", "specs", "system", "overview.md"), "utf8");
    const frontendSpecText = readFileSync(resolve(projectDir, "docs", "specs", "frontend", "overview.md"), "utf8");
    const roadmapText = readFileSync(resolve(projectDir, "docs", "roadmap.md"), "utf8");
    const roadmapJson = JSON.parse(readFileSync(resolve(projectDir, "docs", "roadmap.json"), "utf8"));
    const roadmapEvents = readFileSync(resolve(projectDir, ".docs", "roadmap-events.jsonl"), "utf8");
    const roadmapState = JSON.parse(readFileSync(resolve(projectDir, ".docs", "roadmap-state.json"), "utf8"));
    const widgetLines = renderWidget();
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
    assert.deepEqual(config.codewiki.code_drift_scope.code, ["backend/**", "frontend/**", "packages/sdk/**"], "Expected inferred code drift scope");
    assert.match(indexText, /^# Smoke Wiki Docs Index/m, "Generated index title mismatch");
    assert.match(systemText, /Inferred brownfield boundaries/, "System overview missing inferred boundary section");
    assert.match(systemText, /\[Frontend\]\(\.\.\/frontend\/overview\.md\)/, "System overview missing inferred frontend link");
    assert.match(frontendSpecText, /^# Frontend/m, "Generated frontend boundary title mismatch");
    assert.match(frontendSpecText, /`frontend`/, "Generated frontend boundary spec missing code path");
    assert.match(roadmapText, /^# Roadmap/m, "Generated roadmap title mismatch");
    assert.ok(roadmapJson.tasks["TASK-001"], "Structured roadmap seed missing");
    assert.ok(!roadmapJson.tasks["ROADMAP-001"], "Canonical roadmap seed should no longer use ROADMAP ids");
    assert.ok(Object.values(roadmapJson.tasks).some((task) => task.title === "Smoke audit task"), "Roadmap append tool did not persist appended task");
    const appendedTaskIdFromJson = Array.isArray(roadmapJson.order) ? roadmapJson.order.find((id) => roadmapJson.tasks[id]?.title === "Smoke audit task") : undefined;
    assert.ok(appendedTaskIdFromJson, "Roadmap order missing appended task");
    assert.match(appendedTaskIdFromJson ?? "", /^TASK-\d+$/, "Appended roadmap task should use canonical TASK ids");
    assert.equal(roadmapJson.tasks[appendedTaskIdFromJson].status, "done", "Roadmap update tool should be able to close an existing task");
    assert.equal(roadmapJson.tasks[appendedTaskIdFromJson].summary, "Close smoke-test delta through existing roadmap task mutation.", "Roadmap update tool should persist summary changes");
    assert.deepEqual(roadmapJson.tasks[appendedTaskIdFromJson].labels, ["smoke", "closed"], "Roadmap update tool should replace labels");
    assert.equal(roadmapJson.tasks[appendedTaskIdFromJson].delta.current, "Task was appended and then closed through package mutation tool.", "Roadmap update tool should persist delta changes");
    assert.match(roadmapText, /Smoke audit task/, "Generated roadmap view missing appended task");
    assert.match(roadmapEvents, /"action":"append"/, "Roadmap history missing append mutation");
    assert.match(roadmapEvents, /"action":"close"/, "Roadmap history missing close mutation");
    assert.ok(!existsSync(resolve(projectDir, ".docs", "task-session-index.json")), "Task session index cache should not be generated");
    assert.equal(roadmapState.version, 2, "Roadmap state should use session-free v2 contract");
    assert.equal(roadmapState.health.color, "green", "Roadmap state should embed deterministic lint health");
    assert.ok(Array.isArray(roadmapState.views.open_task_ids) && roadmapState.views.open_task_ids.length >= 1, "Roadmap state should expose open task ids");
    assert.equal(roadmapState.tasks["TASK-001"].id, "TASK-001", "Roadmap state should carry task identifiers");
    assert.ok(roadmapState.tasks["TASK-001"].title, "Roadmap state should carry task display data");
    assert.doesNotMatch(roadmapText, /Session links:/, "Generated roadmap view should not persist session linkage metadata");
    assert.match(statusNotifications[0]?.message ?? "", /Scope: both/, "wiki-status should report the requested scope");
    assert.match(statusNotifications[0]?.message ?? "", /Roadmap working set:/, "wiki-status should include the compact roadmap working set");
    assert.match(statusNotifications[0]?.message ?? "", /Specs and mapped drift signals:/, "wiki-status should list spec drift mapping");
    assert.equal(widgetState.options?.placement, "aboveEditor", "Roadmap widget should render above the editor");
    assert.match(widgetLines[0] ?? "", /Wiki green .* open .* in progress .* blocked/i, "Roadmap widget header should summarize health and counts");
    assert.match(widgetLines.join("\n"), /TASK-001/, "Roadmap widget should surface roadmap tasks");
    assert.match(fixNotifications[0]?.message ?? "", /queued docs wiki-fix flow/i, "wiki-fix should queue the requested fix scope");
    assert.match(reviewNotifications[0]?.message ?? "", /queued architecture review/i, "wiki-review should queue the requested review mode");
  });
  console.log(`✓ bootstrap smoke test passed (Python: ${python.command}, PyYAML: ${python.yamlVersion})`);

  console.log("All codewiki smoke tests passed.");
}

await main();
