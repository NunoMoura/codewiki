#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const packageJsonPath = resolve(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const require = createRequire(import.meta.url);
const agentDir = resolve(
	process.env.HOME ?? resolve(repoRoot, ".."),
	".pi",
	"agent",
);

function findPiRoot() {
	const fromEnv = process.env.PI_CODING_AGENT_ROOT;
	const candidates = [
		fromEnv,
		resolve(repoRoot, "node_modules", "@mariozechner", "pi-coding-agent"),
	].filter(Boolean);

	for (const candidate of candidates) {
		if (candidate && existsSync(resolve(candidate, "dist", "index.js")))
			return candidate;
	}

	try {
		const globalRoot = execFileSync("npm", ["root", "-g"], {
			encoding: "utf8",
		}).trim();
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

	const existing =
		process.env.NODE_PATH?.split(path.delimiter).filter(Boolean) ?? [];
	process.env.NODE_PATH = [...new Set([...entries, ...existing])].join(
		path.delimiter,
	);
	require("node:module").Module._initPaths();
}

function ensurePythonYamlAvailable() {
	const commands = ["python3", "python"];
	let lastError = null;

	for (const command of commands) {
		try {
			const version = execFileSync(
				command,
				["-c", "import yaml; print(yaml.__version__)"],
				{
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				},
			).trim();
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
		assert.ok(
			actual.includes(item),
			`${label} missing ${item}. Got: ${actual.join(", ")}`,
		);
	}
}

async function main() {
	const piRoot = findPiRoot();
	extendNodePath(piRoot);
	const python = ensurePythonYamlAvailable();

	const { DefaultResourceLoader, initTheme } = await import(
		pathToFileURL(resolve(piRoot, "dist", "index.js")).href
	);
	initTheme("dark", false);

	assert.equal(packageJson.name, "codewiki", "Unexpected package name");
	assert.ok(
		Array.isArray(packageJson.pi?.extensions) &&
			packageJson.pi.extensions.length === 1,
		"Expected one Pi extension in package.json",
	);
	assert.ok(
		Array.isArray(packageJson.pi?.skills) && packageJson.pi.skills.length === 1,
		"Expected one Pi skill path in package.json",
	);
	assert.equal(
		packageJson.peerDependencies?.["@mariozechner/pi-coding-agent"],
		"*",
		"Missing pi-coding-agent peer dependency",
	);
	assert.equal(
		packageJson.peerDependencies?.["@sinclair/typebox"],
		"*",
		"Missing @sinclair/typebox peer dependency",
	);
	console.log(
		`✓ package manifest looks correct (${packageJson.name}@${packageJson.version})`,
	);

	await withTempDir("codewiki-loader-", async (projectDir) => {
		mkdirSync(resolve(projectDir, ".pi"), { recursive: true });
		writeFileSync(
			resolve(projectDir, ".pi", "settings.json"),
			JSON.stringify({ packages: [repoRoot] }, null, 2),
		);

		const loader = new DefaultResourceLoader({ cwd: projectDir, agentDir });
		await loader.reload();

		const extensionResult = loader.getExtensions();
		assert.equal(
			extensionResult.errors.length,
			0,
			`Unexpected extension load errors: ${extensionResult.errors.map((e) => e.message).join(" | ")}`,
		);

		const extensions = extensionResult.extensions.filter((extension) =>
			extension.path.startsWith(repoRoot),
		);
		assert.equal(
			extensions.length,
			1,
			`Expected exactly one package extension, found ${extensions.length}`,
		);
		const extension = extensions[0];
		assert.equal(
			extension.sourceInfo.origin,
			"package",
			"Extension should load as a package resource",
		);
		assert.equal(
			extension.sourceInfo.scope,
			"project",
			"Extension should load from project package settings",
		);
		const commandNames = [...extension.commands.keys()];
		ensureIncludes(
			commandNames,
			["wiki-bootstrap", "wiki-config", "wiki-status", "wiki-resume"],
			"extension commands",
		);
		assert.equal(
			commandNames.length,
			4,
			`Expected exactly 4 public commands, got ${commandNames.length}: ${commandNames.join(", ")}`,
		);
		for (const legacyCommand of [
			"wiki-fix",
			"wiki-review",
			"wiki-code",
			"wiki-setup",
			"wiki-rebuild",
			"wiki-lint",
			"wiki-roadmap",
			"wiki-self-drift",
			"wiki-code-drift",
			"wiki-task",
		]) {
			assert.ok(
				!commandNames.includes(legacyCommand),
				`Legacy public command should not be registered: ${legacyCommand}`,
			);
		}
		assert.ok(
			extension.shortcuts.has("alt+w"),
			"Expected alt+w shortcut for toggling the status panel",
		);
		ensureIncludes(
			[...extension.tools.keys()],
			[
				"codewiki_setup",
				"codewiki_bootstrap",
				"codewiki_state",
				"codewiki_task",
				"codewiki_session",
			],
			"extension tools",
		);
		for (const removedTool of [
			"codewiki_rebuild",
			"codewiki_status",
			"codewiki_roadmap_append",
			"codewiki_roadmap_update",
			"codewiki_task_session_link",
			"codewiki_task_loop_update",
		]) {
			assert.ok(
				!extension.tools.has(removedTool),
				`Removed internal tool should not be registered: ${removedTool}`,
			);
		}

		const skillResult = loader.getSkills();
		assert.equal(
			skillResult.diagnostics.length,
			0,
			`Unexpected skill diagnostics: ${skillResult.diagnostics.map((d) => d.message).join(" | ")}`,
		);
		const skills = skillResult.skills.filter((skill) =>
			skill.filePath.startsWith(repoRoot),
		);
		assert.equal(
			skills.length,
			1,
			`Expected exactly one package skill, found ${skills.length}`,
		);
		assert.equal(skills[0].name, "codewiki", "Unexpected skill name");
		assert.equal(
			skills[0].sourceInfo.origin,
			"package",
			"Skill should load as a package resource",
		);
	});
	console.log(
		"✓ package loads through DefaultResourceLoader with one extension and one skill",
	);

	await withTempDir("codewiki-bootstrap-", async (projectDir) => {
		mkdirSync(resolve(projectDir, ".pi"), { recursive: true });
		writeFileSync(
			resolve(projectDir, ".pi", "settings.json"),
			JSON.stringify({ packages: [repoRoot] }, null, 2),
		);
		process.env.PI_CODEWIKI_STATUS_PREFS_PATH = resolve(
			projectDir,
			".pi",
			"codewiki-status.json",
		);
		mkdirSync(resolve(projectDir, ".git"), { recursive: true });
		mkdirSync(resolve(projectDir, "frontend", "src"), { recursive: true });
		writeFileSync(
			resolve(projectDir, "frontend", "src", "index.ts"),
			"export const frontend = true;\n",
		);
		mkdirSync(resolve(projectDir, "backend"), { recursive: true });
		writeFileSync(resolve(projectDir, "backend", "app.py"), "app = object()\n");
		mkdirSync(resolve(projectDir, "packages", "sdk", "src"), {
			recursive: true,
		});
		writeFileSync(
			resolve(projectDir, "packages", "sdk", "package.json"),
			JSON.stringify({ name: "@smoke/sdk" }, null, 2),
		);
		const nestedDir = resolve(projectDir, "packages", "nested", "worktree");
		mkdirSync(nestedDir, { recursive: true });
		const outsideDir = dirname(projectDir);
		const blankDir = resolve(outsideDir, "blank-worktree");
		mkdirSync(blankDir, { recursive: true });

		const loader = new DefaultResourceLoader({ cwd: projectDir, agentDir });
		await loader.reload();
		const extension = loader
			.getExtensions()
			.extensions.find((item) => item.path.startsWith(repoRoot));
		assert.ok(
			extension,
			"Expected package extension to load for bootstrap smoke test",
		);

		const setupTool = extension.tools.get("codewiki_setup");
		assert.ok(
			setupTool && typeof setupTool.definition?.execute === "function",
			"Setup tool missing execute function",
		);
		const bootstrapTool = extension.tools.get("codewiki_bootstrap");
		assert.ok(
			bootstrapTool && typeof bootstrapTool.definition?.execute === "function",
			"Bootstrap tool missing execute function",
		);

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
		const thirdResult = await setupTool.definition.execute(
			"setup-smoke-3",
			{ projectName: "Smoke Wiki", repoPath: projectDir },
			undefined,
			undefined,
			{ cwd: outsideDir },
		);
		const fourthResult = await bootstrapTool.definition.execute(
			"bootstrap-smoke-4",
			{ projectName: "Smoke Wiki", force: false, repoPath: projectDir },
			undefined,
			undefined,
			{ cwd: outsideDir },
		);

		const first = firstResult.details;
		const second = secondResult.details;
		const third = thirdResult.details;
		const fourth = fourthResult.details;
		assert.equal(
			first.root,
			projectDir,
			"Setup from nested cwd should target repo root when no wiki exists yet",
		);
		assert.equal(
			second.root,
			projectDir,
			"Bootstrap from nested cwd should reuse the existing wiki root",
		);
		assert.equal(
			third.root,
			projectDir,
			"Setup tool should accept explicit repoPath from outside cwd",
		);
		assert.equal(
			fourth.root,
			projectDir,
			"Bootstrap tool should accept explicit repoPath from outside cwd",
		);
		const sessionEntries = [];
		const toolCtx = {
			cwd: nestedDir,
			sessionManager: {
				getSessionId: () => "session-smoke-1",
				getSessionFile: () =>
					resolve(projectDir, ".pi", "sessions", "session-smoke-1.jsonl"),
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
		const outsideToolCtx = {
			...toolCtx,
			cwd: outsideDir,
		};
		const stateTool = extension.tools.get("codewiki_state");
		assert.ok(
			stateTool && typeof stateTool.definition?.execute === "function",
			"State tool missing execute function",
		);
		const stateResult = await stateTool.definition.execute(
			"state-tool-smoke",
			{
				repoPath: projectDir,
				refresh: true,
				include: ["summary", "roadmap", "graph", "session"],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(
			stateResult.details.repo.repo_root,
			projectDir,
			"State tool should accept explicit repoPath from outside cwd",
		);
		assert.match(
			stateResult.content[0]?.text ?? "",
			/open \d+; next/i,
			"State tool should return compact summary text",
		);

		const taskTool = extension.tools.get("codewiki_task");
		assert.ok(
			taskTool && typeof taskTool.definition?.execute === "function",
			"Task tool missing execute function",
		);
		await taskTool.definition.execute(
			"task-create-smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke audit task",
						priority: "high",
						kind: "agent-workflow",
						summary: "Track unresolved smoke-test delta.",
						spec_paths: [".wiki/knowledge/product/overview.md"],
						code_paths: ["scripts/rebuild_docs_meta.py"],
						research_ids: [],
						labels: ["smoke"],
						goal: {
							outcome:
								"Smoke repo can persist goal-shaped roadmap task metadata.",
							acceptance: [
								"Appended task stores success signals.",
								"Generated roadmap view renders goal metadata.",
							],
							non_goals: [
								"Exercise every future automation workflow in smoke coverage.",
							],
							verification: [
								"Append task through package tool.",
								"Rebuild generated outputs.",
							],
						},
						delta: {
							desired: "Smoke repo has structured task append flow.",
							current: "Task was not yet appended.",
							closure: "Append one roadmap task through package tool.",
						},
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const appendedRoadmap = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "roadmap.json"), "utf8"),
		);
		const appendedTaskId = Array.isArray(appendedRoadmap.order)
			? appendedRoadmap.order.find(
					(id) => appendedRoadmap.tasks[id]?.title === "Smoke audit task",
				)
			: undefined;
		assert.ok(
			appendedTaskId,
			"Roadmap order missing appended task before update",
		);
		const duplicateCreateResult = await taskTool.definition.execute(
			"task_create_duplicate_smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke audit task",
						priority: "high",
						kind: "agent-workflow",
						summary:
							"Duplicate smoke delta should be coordinated automatically.",
						spec_paths: [".wiki/knowledge/product/overview.md"],
						code_paths: ["scripts/rebuild_docs_meta.py"],
						labels: ["smoke"],
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			duplicateCreateResult.content?.[0]?.text ?? "",
			/reused/i,
			"Task tool should coordinate duplicate task intent automatically",
		);

		const distinctCreateResult = await taskTool.definition.execute(
			"task_create_distinct_scope_smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke scoped follow-up task",
						priority: "medium",
						kind: "agent-workflow",
						summary:
							"Same broad scope but different intent should become a new task.",
						spec_paths: [".wiki/knowledge/product/overview.md"],
						labels: ["follow-up"],
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			distinctCreateResult.content?.[0]?.text ?? "",
			/created/i,
			"Task tool should not reuse an unrelated task solely because broad scope overlaps",
		);

		await taskTool.definition.execute(
			"task_update_smoke_1",
			{
				repoPath: projectDir,
				action: "update",
				taskId: appendedTaskId,
				patch: { phase: "research" },
				evidence: {
					result: "pass",
					summary: "Research complete; ready to implement.",
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_update_smoke_2",
			{
				repoPath: projectDir,
				action: "update",
				taskId: appendedTaskId,
				patch: { phase: "implement" },
				evidence: {
					result: "pass",
					summary: "Implementation complete; ready to verify.",
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_update_smoke_3",
			{
				repoPath: projectDir,
				action: "update",
				taskId: appendedTaskId,
				patch: { phase: "verify" },
				evidence: {
					result: "pass",
					summary: "Verification passed.",
					checks_run: ["npm test"],
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_close_smoke",
			{
				repoPath: projectDir,
				action: "close",
				taskId: appendedTaskId,
				summary:
					"Close smoke-test delta through canonical task tool after verify pass.",
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_update_metadata_smoke",
			{
				repoPath: projectDir,
				action: "update",
				taskId: appendedTaskId,
				patch: {
					labels: ["smoke", "closed"],
					goal: {
						verification: [
							"Update existing roadmap task through package tool.",
							"Rebuild generated outputs after mutation.",
						],
					},
					delta: {
						current:
							"Task was appended and then moved to done through the unified task tool before a follow-up metadata update.",
						closure:
							"Update existing roadmap task through package tool and rebuild generated outputs.",
					},
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const taskDetailStateResult = await stateTool.definition.execute(
			"state-task-detail-smoke",
			{ repoPath: projectDir, taskId: appendedTaskId, include: ["task"] },
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(
			taskDetailStateResult.details.task.id,
			appendedTaskId,
			"State tool should return requested task detail",
		);
		assert.equal(
			taskDetailStateResult.details.task.status,
			"done",
			"State tool task detail should reflect canonical task status",
		);
		assert.equal(
			taskDetailStateResult.details.task.context_packet?.task?.id,
			appendedTaskId,
			"State tool should surface compact task context packet",
		);
		assert.match(
			taskDetailStateResult.details.task.context_path ?? "",
			new RegExp(`\\.wiki/roadmap/tasks/${appendedTaskId}/context\\.json`),
			"State tool should point to task-local context shard",
		);

		const sessionTool = extension.tools.get("codewiki_session");
		assert.ok(
			sessionTool && typeof sessionTool.definition?.execute === "function",
			"Session tool missing execute function",
		);
		await sessionTool.definition.execute(
			"session-focus-smoke",
			{
				repoPath: projectDir,
				taskId: "ROADMAP-001",
				action: "focus",
				summary: "Focused smoke session on starter task.",
				setSessionName: true,
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const implicitStateResult = await stateTool.definition.execute(
			"state-outside-implicit-smoke",
			{},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(
			implicitStateResult.details.repo.repo_root,
			projectDir,
			"State tool should reuse remembered repo when outside cwd has no local wiki",
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
		const implicitSessionNoteResult = await sessionTool.definition.execute(
			"session-note-implicit-smoke",
			{
				action: "note",
				summary:
					"Implicit repo resolution should reuse remembered repo context.",
				files_touched: ["extensions/codewiki/index.ts"],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			implicitSessionNoteResult.content[0]?.text ?? "",
			/codewiki session: note TASK-001/i,
			"Session tool should reuse remembered repo and focused task when outside cwd has no local wiki",
		);

		const statusNotifications = [];
		const resumeNotifications = [];
		const resumeBarrierNotifications = [];
		const errorNotifications = [];
		const taskStatuses = [];
		const statusSummaries = [];
		const channelInputQueue = [];
		const widgetState = { key: null, content: null, options: null };
		const panelState = { renderedLines: null, terminalInput: null };
		const configPanelState = {
			options: null,
			renderedLines: null,
			instance: null,
			error: null,
			terminalInput: null,
			widget: null,
		};
		const configCommand = extension.commands.get("wiki-config");
		const statusCommand = extension.commands.get("wiki-status");
		const resumeCommand = extension.commands.get("wiki-resume");
		const statusShortcut = extension.shortcuts.get("alt+w");
		assert.ok(
			configCommand && typeof configCommand.handler === "function",
			"wiki-config command missing handler",
		);
		assert.ok(
			statusCommand && typeof statusCommand.handler === "function",
			"wiki-status command missing handler",
		);
		assert.ok(
			resumeCommand && typeof resumeCommand.handler === "function",
			"wiki-resume command missing handler",
		);
		assert.ok(
			statusShortcut && typeof statusShortcut.handler === "function",
			"alt+w shortcut missing handler",
		);
		await configCommand.handler("", {
			cwd: projectDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				input: async () => undefined,
				select: async () => undefined,
				setWidget: (_key, content, options) => {
					configPanelState.widget = content;
					configPanelState.options = options;
					if (typeof content === "function") {
						const instance = content(
							{ terminal: { columns: 120, rows: 32 } },
							{
								fg: (_color, text) => text,
								bg: (_color, text) => text,
								bold: (text) => text,
							},
						);
						configPanelState.instance = instance;
						configPanelState.renderedLines = instance.render(56);
					}
				},
				onTerminalInput: (handler) => {
					configPanelState.terminalInput = handler;
					return () => {
						configPanelState.terminalInput = null;
					};
				},
			},
		});
		assert.deepEqual(
			configPanelState.options,
			{ placement: "aboveEditor" },
			"wiki-config should render as a top widget like status panel",
		);
		assert.equal(
			configPanelState.error,
			null,
			`wiki-config config panel threw: ${configPanelState.error}`,
		);
		assert.ok(
			configPanelState.widget && configPanelState.instance,
			"wiki-config should render an interactive top-pinned configuration panel",
		);
		await statusShortcut.handler({
			cwd: projectDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				input: async () => channelInputQueue.shift(),
				select: async () => undefined,
				setStatus: (key, value) => statusSummaries.push({ key, value }),
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
				onTerminalInput: (handler) => {
					panelState.terminalInput = handler;
					return () => {
						panelState.terminalInput = null;
					};
				},
			},
		});
		const autoDockPrefs = JSON.parse(
			readFileSync(resolve(projectDir, ".pi", "codewiki-status.json"), "utf8"),
		);
		assert.equal(
			autoDockPrefs.mode,
			"auto",
			"wiki-config should keep auto summary mode unless explicitly pinned",
		);
		assert.equal(
			autoDockPrefs.lastRepoPath,
			projectDir,
			"panel toggle should remember the last resolved repo for future global sessions",
		);
		widgetState.key = null;
		widgetState.content = null;
		widgetState.options = null;
		await configCommand.handler("auto", {
			cwd: outsideDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				setStatus: (key, value) => statusSummaries.push({ key, value }),
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
			},
		});
		const latestSummary = statusSummaries.at(-1)?.value ?? "";
		assert.ok(
			String(latestSummary).startsWith("codewiki: ") &&
				String(latestSummary).split(" · ").length >= 3,
			"Status summary auto mode should keep a compact extension-labeled health summary outside repo cwd",
		);
		assert.ok(
			String(latestSummary).includes("🟢") ||
				String(latestSummary).includes("🟡") ||
				String(latestSummary).includes("🔴"),
			"Status summary should include a traffic-light circle for repo health",
		);
		await configCommand.handler(`pin ${projectDir}`, {
			cwd: outsideDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				setStatus: (key, value) => statusSummaries.push({ key, value }),
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
			},
		});
		const dockPrefs = JSON.parse(
			readFileSync(resolve(projectDir, ".pi", "codewiki-status.json"), "utf8"),
		);
		assert.equal(
			dockPrefs.mode,
			"pin",
			"wiki-config pin should persist pinned summary mode",
		);
		assert.equal(
			dockPrefs.pinnedRepoPath,
			projectDir,
			"wiki-config pin should persist pinned repo path",
		);
		await resumeCommand.handler("", {
			cwd: outsideDir,
			hasUI: true,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				custom: async () => projectDir,
				notify: (message, level) =>
					resumeNotifications.push({ message, level }),
				setStatus: (key, value) => {
					taskStatuses.push({ key, value });
					statusSummaries.push({ key, value });
				},
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
			},
		});

		await configCommand.handler("pin", {
			cwd: blankDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) => errorNotifications.push({ message, level }),
			},
		});

		await extension.hooks?.onTurnStart?.(
			{ role: "user", content: "check status" },
			{
				cwd: outsideDir,
				ui: {
					setStatus: () => {},
					setWidget: () => {},
					notify: (message, level) =>
						errorNotifications.push({ message, level }),
				},
				sessionManager: {
					getSessionId: () => "session-no-branch",
				},
			},
		);

		await taskTool.definition.execute(
			"task_verify_fail_smoke",
			{
				repoPath: projectDir,
				action: "update",
				taskId: "TASK-001",
				patch: { phase: "verify" },
				evidence: {
					result: "fail",
					summary: "Verification found remaining gaps before done.",
					checks_run: ["npm test"],
					files_touched: ["extensions/codewiki/index.ts"],
					issues: ["Need explicit closure evidence gate."],
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await resumeCommand.handler("TASK-001", {
			cwd: projectDir,
			hasUI: true,
			ui: {
				notify: (message, level) =>
					resumeNotifications.push({ message, level }),
				setStatus: (key, value) => taskStatuses.push({ key, value }),
			},
			sessionManager: toolCtx.sessionManager,
		});
		await resumeCommand.handler("TASK-002", {
			cwd: projectDir,
			hasUI: true,
			ui: {
				notify: (message, level) =>
					resumeBarrierNotifications.push({ message, level }),
				setStatus: () => {},
			},
			sessionManager: toolCtx.sessionManager,
		});

		const lint = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "lint.json"), "utf8"),
		);
		const graph = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "graph.json"), "utf8"),
		);
		const config = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "config.json"), "utf8"),
		);
		const systemText = readFileSync(
			resolve(projectDir, ".wiki", "knowledge", "system", "overview.md"),
			"utf8",
		);
		const frontendSpecText = readFileSync(
			resolve(
				projectDir,
				".wiki",
				"knowledge",
				"system",
				"frontend",
				"overview.md",
			),
			"utf8",
		);
		const roadmapJson = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "roadmap.json"), "utf8"),
		);
		const roadmapEvents = readFileSync(
			resolve(projectDir, ".wiki", "roadmap-events.jsonl"),
			"utf8",
		);
		const repoEvents = readFileSync(
			resolve(projectDir, ".wiki", "events.jsonl"),
			"utf8",
		);
		const roadmapState = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "roadmap-state.json"), "utf8"),
		);
		const statusState = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "status-state.json"), "utf8"),
		);
		const roadmapFolderIndex = JSON.parse(
			readFileSync(
				resolve(projectDir, ".wiki", "roadmap", "index.json"),
				"utf8",
			),
		);
		const starterTaskContext = JSON.parse(
			readFileSync(
				resolve(
					projectDir,
					".wiki",
					"roadmap",
					"tasks",
					"TASK-001",
					"context.json",
				),
				"utf8",
			),
		);
		let panelLines = panelState.renderedLines ?? [];
		assert.ok(
			!existsSync(resolve(nestedDir, "wiki")),
			"Bootstrap should anchor wiki at the existing wiki root, not nested cwd",
		);

		assert.equal(
			first.created.length,
			15,
			`Expected 15 created starter files including runtime policy, client surfaces, and inferred boundary specs, got ${first.created.length}`,
		);
		assert.equal(
			first.updated.length,
			0,
			"Initial bootstrap should not update files",
		);
		assert.equal(
			second.created.length,
			0,
			"Second bootstrap should not create files",
		);
		assert.equal(
			second.updated.length,
			0,
			"Second bootstrap should not update files without force",
		);
		assert.equal(
			second.skipped.length,
			15,
			`Expected 15 skipped starter files, got ${second.skipped.length}`,
		);
		assert.equal(
			lint.issues.length,
			0,
			`Expected zero lint issues, got ${lint.issues.length}`,
		);
		const graphDocNodes = Array.isArray(graph.nodes)
			? graph.nodes.filter((node) => node.kind === "doc")
			: [];
		const graphResearchNodes = Array.isArray(graph.nodes)
			? graph.nodes.filter((node) => node.kind === "research_collection")
			: [];
		assert.ok(
			graphDocNodes.length >= 6,
			"Expected generated graph doc nodes including inferred boundary specs",
		);
		assert.ok(
			graphResearchNodes.length >= 1,
			"Expected generated graph research nodes",
		);
		assert.ok(
			Array.isArray(graph.nodes) && graph.nodes.length >= graphDocNodes.length,
			"Expected generated graph nodes",
		);
		assert.ok(
			Array.isArray(graph.edges) &&
				graph.edges.some((edge) => edge.kind === "task_spec"),
			"Expected generated graph task→spec edges",
		);
		assert.ok(
			graph.views?.docs?.by_group?.system?.includes(
				".wiki/knowledge/system/overview.md",
			),
			"Expected system overview in graph docs-by-group view",
		);
		assert.ok(
			!graphDocNodes.some((doc) => doc.path === "wiki/roadmap.md"),
			"Generated roadmap.md should not exist in .wiki-only default graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".wiki/knowledge/system/runtime/overview.md",
			),
			"Expected runtime policy spec in graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".wiki/knowledge/system/frontend/overview.md",
			),
			"Expected inferred frontend spec in graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".wiki/knowledge/system/backend/overview.md",
			),
			"Expected inferred backend spec in graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".wiki/knowledge/system/packages/sdk/overview.md",
			),
			"Expected inferred nested package spec in graph docs",
		);
		assert.deepEqual(
			config.lint.repo_markdown,
			[
				"README.md",
				"backend/**/README.md",
				"frontend/**/README.md",
				"packages/sdk/**/README.md",
			],
			"Expected inferred repo markdown scope",
		);
		assert.deepEqual(
			config.codewiki.code_drift_scope.code,
			["backend/**", "frontend/**", "packages/sdk/**"],
			"Expected inferred code drift scope",
		);
		assert.deepEqual(
			config.codewiki.gateway.write_paths,
			[".wiki/knowledge/**", ".wiki/evidence/**"],
			"Expected gateway write policy for direct wiki transactions",
		);
		assert.ok(
			config.codewiki.gateway.generated_readonly_paths.includes(
				".wiki/roadmap/**",
			),
			"Expected generated roadmap shards to be read-only through gateway transactions",
		);
		assert.equal(
			config.codewiki.runtime.future_executor,
			"think-code",
			"Expected runtime policy to declare future think-code executor seam",
		);

		const gatewayTxPath = resolve(projectDir, "gateway-transaction-smoke.json");
		writeFileSync(
			gatewayTxPath,
			JSON.stringify(
				{
					version: 1,
					summary: "Gateway transaction smoke append.",
					ops: [
						{
							kind: "append_jsonl",
							path: ".wiki/evidence/runtime-smoke.jsonl",
							value: {
								id: "gateway-smoke-001",
								title: "Gateway smoke",
								summary: "Validated append-only evidence transaction.",
							},
						},
					],
				},
				null,
				2,
			),
		);
		const gatewayApplyOutput = execFileSync(
			"node",
			[
				resolve(repoRoot, "scripts", "codewiki-gateway.mjs"),
				"apply",
				gatewayTxPath,
				projectDir,
			],
			{ encoding: "utf8" },
		);
		assert.match(
			gatewayApplyOutput,
			/"kind": "append_jsonl"/,
			"Gateway apply should report append_jsonl transaction op",
		);
		assert.match(
			readFileSync(
				resolve(projectDir, ".wiki", "evidence", "runtime-smoke.jsonl"),
				"utf8",
			),
			/gateway-smoke-001/,
			"Gateway transaction should append evidence inside .wiki only",
		);
		writeFileSync(
			gatewayTxPath,
			JSON.stringify(
				{
					version: 1,
					summary: "Gateway transaction deny generated file.",
					ops: [
						{
							kind: "patch",
							path: ".wiki/roadmap/tasks/TASK-001/context.json",
							oldText: "TASK-001",
							newText: "TASK-001",
						},
					],
				},
				null,
				2,
			),
		);
		assert.throws(
			() =>
				execFileSync(
					"node",
					[
						resolve(repoRoot, "scripts", "codewiki-gateway.mjs"),
						"apply",
						gatewayTxPath,
						projectDir,
					],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
				),
			/Generated\/read-only path/,
			"Gateway transaction should reject generated task context writes",
		);
		assert.ok(
			!existsSync(resolve(projectDir, "wiki")),
			"Default .wiki-only bootstrap should not create top-level wiki exports",
		);
		assert.equal(
			config.index_path,
			undefined,
			"Default config should not emit index_path",
		);
		assert.equal(
			config.roadmap_doc_path,
			undefined,
			"Default config should not emit roadmap_doc_path",
		);
		assert.match(
			systemText,
			/Inferred brownfield boundaries/,
			"System overview missing inferred boundary section",
		);
		assert.match(
			systemText,
			/\[Frontend\]\(frontend\/overview\.md\)/,
			"System overview missing inferred frontend link",
		);
		assert.match(
			frontendSpecText,
			/^# Frontend/m,
			"Generated frontend boundary title mismatch",
		);
		assert.match(
			frontendSpecText,
			/`frontend`/,
			"Generated frontend boundary spec missing code path",
		);
		assert.ok(roadmapJson.tasks["TASK-001"], "Structured roadmap seed missing");
		assert.ok(
			!roadmapJson.tasks["ROADMAP-001"],
			"Canonical roadmap seed should no longer use ROADMAP ids",
		);
		assert.ok(
			Object.values(roadmapJson.tasks).some(
				(task) => task.title === "Smoke audit task",
			),
			"Task tool did not persist created task",
		);
		const appendedTaskIdFromJson = Array.isArray(roadmapJson.order)
			? roadmapJson.order.find(
					(id) => roadmapJson.tasks[id]?.title === "Smoke audit task",
				)
			: undefined;
		assert.ok(appendedTaskIdFromJson, "Roadmap order missing appended task");
		assert.match(
			appendedTaskIdFromJson ?? "",
			/^TASK-\d+$/,
			"Appended roadmap task should use canonical TASK ids",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].status,
			"done",
			"Task tool should be able to close an existing task",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].summary,
			"Close smoke-test delta through canonical task tool after verify pass.",
			"Task close action should persist closure summary",
		);
		assert.deepEqual(
			roadmapJson.tasks[appendedTaskIdFromJson].labels,
			["smoke", "closed"],
			"Task tool should replace labels",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].goal.outcome,
			"Smoke repo can persist goal-shaped roadmap task metadata.",
			"Task create action should persist goal outcome",
		);
		assert.deepEqual(
			roadmapJson.tasks[appendedTaskIdFromJson].goal.verification,
			[
				"Update existing roadmap task through package tool.",
				"Rebuild generated outputs after mutation.",
			],
			"Task tool should replace goal verification steps",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].delta.current,
			"Task was appended and then moved to done through the unified task tool before a follow-up metadata update.",
			"Task tool should persist delta changes",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].title,
			"Smoke audit task",
			"Roadmap JSON missing appended task",
		);
		assert.ok(
			Array.isArray(roadmapJson.tasks[appendedTaskIdFromJson].goal.acceptance),
			"Roadmap JSON should render task success signals as structured data",
		);
		assert.match(
			roadmapEvents,
			/"action":"append"/,
			"Roadmap history missing append mutation",
		);
		assert.match(
			roadmapEvents,
			/"action":"update"/,
			"Roadmap history missing follow-up task mutation after done transition",
		);
		assert.match(
			repoEvents,
			/"kind":"task_evidence_recorded"/,
			"Repo event log should record structured evidence when closing a task",
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".wiki", "task-session-index.json")),
			"Task session index cache should not be generated",
		);
		assert.equal(
			roadmapState.version,
			2,
			"Roadmap state should use session-free v2 contract",
		);
		assert.equal(
			roadmapState.health.color,
			"green",
			"Roadmap state should embed deterministic lint health",
		);
		assert.equal(
			roadmapState.source.task_context_root,
			".wiki/roadmap/tasks",
			"Roadmap state should expose generated task context root",
		);
		assert.ok(
			Array.isArray(roadmapFolderIndex.tasks) &&
				roadmapFolderIndex.tasks.some((task) => task.id === "TASK-001"),
			"Roadmap folder index should expose task shards",
		);
		assert.equal(
			starterTaskContext.task.id,
			"TASK-001",
			"Task context shard should carry compact task identity",
		);
		assert.equal(
			starterTaskContext.budget.target_tokens,
			6000,
			"Task context shard should carry resume token budget",
		);
		assert.ok(
			Array.isArray(roadmapState.views.open_task_ids) &&
				roadmapState.views.open_task_ids.length >= 1,
			"Roadmap state should expose open task ids",
		);
		assert.equal(
			roadmapState.tasks["TASK-001"].id,
			"TASK-001",
			"Roadmap state should carry task identifiers",
		);
		assert.equal(
			roadmapState.tasks["TASK-001"].status,
			"implement",
			"Task loop failure should sync roadmap task back to implement",
		);
		assert.ok(
			roadmapState.tasks["TASK-001"].title,
			"Roadmap state should carry task display data",
		);
		assert.ok(
			Array.isArray(roadmapState.tasks["TASK-001"].goal.verification),
			"Roadmap state should carry task goal metadata",
		);
		assert.equal(
			roadmapState.tasks["TASK-001"].loop.phase,
			"implement",
			"Roadmap state should send failed verify back to implement phase",
		);
		assert.equal(
			roadmapState.tasks["TASK-001"].loop.evidence.verdict,
			"fail",
			"Roadmap state should carry latest task evidence verdict",
		);
		assert.equal(
			statusState.version,
			1,
			"Status state should expose v1 contract",
		);
		assert.equal(
			statusState.health.color,
			"green",
			"Status state should carry deterministic health color",
		);
		assert.ok(
			Array.isArray(statusState.specs) && statusState.specs.length >= 5,
			"Status state should carry derived spec rows",
		);
		assert.ok(
			Array.isArray(statusState.wiki?.rows) &&
				statusState.wiki.rows.length >= 5,
			"Status state should expose wiki rows for the primary status tab",
		);
		assert.ok(
			Array.isArray(statusState.wiki?.sections) &&
				statusState.wiki.sections.some(
					(section) => section.label === "Product",
				) &&
				statusState.wiki.sections.some(
					(section) => section.label === "System",
				) &&
				statusState.wiki.sections.some(
					(section) => section.label === "Clients",
				),
			"Status state should expose Product/System/Clients wiki groups",
		);
		assert.ok(
			Array.isArray(statusState.roadmap?.in_progress_task_ids),
			"Status state should expose roadmap tab task ids",
		);
		assert.ok(
			Array.isArray(statusState.roadmap?.columns) &&
				statusState.roadmap.columns.some((column) => column.id === "todo") &&
				statusState.roadmap.columns.some(
					(column) => column.id === "research",
				) &&
				statusState.roadmap.columns.some(
					(column) => column.id === "implement",
				) &&
				statusState.roadmap.columns.some((column) => column.id === "verify") &&
				statusState.roadmap.columns.some((column) => column.id === "done"),
			"Status state should expose unified kanban task-state columns",
		);
		assert.ok(
			Array.isArray(statusState.agents?.rows) &&
				typeof statusState.agents.rows[0]?.name === "string",
			"Status state should expose named agent rows",
		);
		assert.equal(
			statusState.channels?.add_label,
			"Add channel",
			"Status state should expose minimal channel-add affordance",
		);
		assert.ok(
			Array.isArray(statusState.channels?.rows) &&
				statusState.channels.rows.length === 0,
			"Status state should keep channels list minimal until user channels are added",
		);
		assert.equal(
			statusState.bars.spec_mapping.percent,
			100,
			"Smoke repo should have full spec mapping coverage",
		);
		assert.ok(
			typeof statusState.next_step.command === "string" &&
				statusState.next_step.command.length > 0,
			"Status state should recommend a next step",
		);
		assert.equal(
			statusState.heartbeat.summary.lane_count,
			3,
			"Status state should expose three heartbeat lanes",
		);
		assert.equal(
			statusState.heartbeat.summary.freshness_basis,
			"work-first",
			"Status state should describe heartbeat freshness as work-first",
		);
		assert.deepEqual(
			statusState.heartbeat.summary.high_cadence_lane_ids,
			["system_code"],
			"Status state should classify system↔code as high cadence",
		);
		assert.ok(
			statusState.heartbeat.lanes.some(
				(lane) =>
					lane.id === "product_system" &&
					lane.recommendation.command === "/wiki-status",
			),
			"Status state should expose heartbeat lane recommendations through wiki-status",
		);
		assert.ok(
			statusState.heartbeat.lanes.some(
				(lane) =>
					lane.id === "system_code" &&
					lane.fallback_max_age_hours === 1 &&
					lane.triggers.includes("code_change:mapped"),
			),
			"Status state should expose work-triggered freshness metadata for heartbeat lanes",
		);
		assert.equal(
			statusState.resume.source,
			"task",
			"Status state should expose deterministic resume source",
		);
		assert.match(
			statusState.resume.command,
			/^\/wiki-resume TASK-\d+$/,
			"Status state should expose deterministic resume command",
		);
		assert.equal(
			statusState.resume.phase,
			"implement",
			"Status state should expose deterministic task phase",
		);
		assert.ok(
			typeof statusState.resume.verification === "string" &&
				statusState.resume.verification.length > 0,
			"Status state should expose a resume verification cue",
		);
		assert.match(
			String(statusState.resume.evidence),
			/Verification found remaining gaps before done/i,
			"Status state should expose latest evidence summary",
		);
		assert.ok(
			typeof statusState.parallel.active_session_count === "number" &&
				statusState.parallel.active_session_count >= 1,
			"Status state should expose active parallel-session signals",
		);
		assert.ok(
			Array.isArray(statusState.parallel.collision_task_ids),
			"Status state should expose collision task ids array",
		);
		assert.ok(
			!JSON.stringify(roadmapJson).includes("Session links:"),
			"Roadmap JSON should not persist session linkage metadata",
		);
		assert.ok(
			statusNotifications.every(
				(entry) => !/Wiki: Smoke Wiki/.test(String(entry.message)),
			),
			"alt+w should prefer opening the panel over posting a long notify when custom UI is available",
		);
		assert.equal(
			typeof widgetState.content,
			"function",
			"status panel should render as a live top widget",
		);
		assert.ok(
			statusSummaries.some(
				(entry) =>
					entry.key === "codewiki-status" &&
					/[🟢🟡🔴]/u.test(String(entry.value)) &&
					/Smoke Wiki/.test(String(entry.value)),
			),
			"panel toggle should refresh the one-line status summary with repo name and traffic-light circle",
		);
		const widgetInstance = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		panelState.renderedLines = widgetInstance?.render(100) ?? [];
		panelLines = panelState.renderedLines ?? [];
		assert.match(
			panelLines[0] ?? "",
			/^┌/,
			"Status panel should render as a framed container",
		);
		assert.match(
			panelLines.join("\n"),
			/Smoke Wiki[\s\S]*\| (🟢|🟡|🔴)/,
			"Status panel header should contain only repo and traffic-light circle",
		);
		assert.doesNotMatch(
			panelLines.join("\n"),
			/\b(GREEN|YELLOW|RED)\b/i,
			"Status panel should avoid spelling health colors in the panel body",
		);
		assert.match(
			panelLines.join("\n"),
			/\[Home\].*Wiki.*Roadmap.*Agents.*Channels/i,
			"Status panel should show Home plus detail tabs",
		);
		assert.match(
			panelLines.join("\n"),
			/Current state[\s\S]*Being done now[\s\S]*Issues[\s\S]*Recommended:[\s\S]*Production path/i,
			"Status panel should open on the Home project-state dashboard",
		);
		assert.match(
			panelLines.join("\n"),
			/Tab section · arrows move · Enter details/i,
			"Status panel should show keyboard help for tab-only section switching and cursor navigation",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterWikiTab = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const wikiPanelLines = widgetInstanceAfterWikiTab?.render(100) ?? [];
		assert.match(
			wikiPanelLines.join("\n"),
			/\[Wiki\]/i,
			"Status panel should switch to wiki tab",
		);
		assert.match(
			wikiPanelLines.join("\n"),
			/Product[\s\S]*System[\s\S]*Clients/i,
			"Wiki tab should show groups for Product, System, and Clients",
		);
		assert.doesNotMatch(
			wikiPanelLines.join("\n"),
			/Product, system, and client truth with deterministic drift notes\./i,
			"Wiki tab should avoid a repeated explanatory preamble above the three-column content",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterTab = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const roadmapPanelLines = widgetInstanceAfterTab?.render(100) ?? [];
		assert.match(
			roadmapPanelLines.join("\n"),
			/\[Roadmap\]/i,
			"Status panel should switch to roadmap tab",
		);
		assert.match(
			roadmapPanelLines.join("\n"),
			/Todo[\s\S]*Research[\s\S]*Implement[\s\S]*Verify[\s\S]*Done/i,
			"Roadmap tab should render unified kanban task-state columns",
		);
		assert.match(
			roadmapPanelLines.join("\n"),
			/TASK-\d+/i,
			"Roadmap tab should render task cards inside the kanban columns",
		);
		assert.doesNotMatch(
			roadmapPanelLines.join("\n"),
			/Next: \/wiki-resume|Focused: |Open \d+ · blocked \d+ · done \d+|Verify: |Evidence: /i,
			"Roadmap tab should render only the kanban board without extra summary text",
		);
		panelState.terminalInput?.("\r");
		const widgetInstanceAfterRoadmapDetail = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const roadmapDetailLines =
			widgetInstanceAfterRoadmapDetail?.render(100) ?? [];
		assert.match(
			roadmapDetailLines.join("\n"),
			/Status: |Phase: |Priority: /i,
			"Enter on a selected roadmap task should open the reusable detail window",
		);
		assert.match(
			roadmapDetailLines.join("\n"),
			/Resume[\s\S]*Block/i,
			"Roadmap detail window should expose task actions",
		);
		panelState.terminalInput?.("\u001b");
		panelState.terminalInput?.("\u001b[C");
		const widgetInstanceAfterArrow = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const arrowPanelLines = widgetInstanceAfterArrow?.render(100) ?? [];
		assert.match(
			arrowPanelLines.join("\n"),
			/\[Roadmap\]/i,
			"Right arrow should move the roadmap cursor inside the active section instead of switching tabs",
		);
		panelState.terminalInput?.("\u001b[C");
		const widgetInstanceAfterEmptyColumnMove = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const emptyColumnMoveLines =
			widgetInstanceAfterEmptyColumnMove?.render(100) ?? [];
		assert.match(
			emptyColumnMoveLines.join("\n"),
			/Todo[\s\S]*Research[\s\S]*Implement[\s\S]*Verify[\s\S]*Done/i,
			"Roadmap cursor should still move across columns even when some columns are empty",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterAgentsTab = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const agentsPanelLines = widgetInstanceAfterAgentsTab?.render(100) ?? [];
		assert.match(
			agentsPanelLines.join("\n"),
			/\[Agents\]/i,
			"Tab should advance to the agents section",
		);
		assert.match(
			agentsPanelLines.join("\n"),
			/\| .*TASK-001|\| .*TASK-020|\| .*TASK-/i,
			"Agents tab should show named agents with task title and low-emphasis task id",
		);
		assert.match(
			agentsPanelLines.join("\n"),
			/Parallel sessions/i,
			"Agents tab should surface same-user parallel-session context",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterChannels = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const channelPanelLines = widgetInstanceAfterChannels?.render(100) ?? [];
		assert.match(
			channelPanelLines.join("\n"),
			/\[Channels\]/i,
			"Status panel should switch to channels tab",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterWrap = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const wrappedPanelLines = widgetInstanceAfterWrap?.render(100) ?? [];
		assert.match(
			wrappedPanelLines.join("\n"),
			/\[Home\]/i,
			"Tab should wrap from channels back to home",
		);
		panelState.terminalInput?.("\t");
		panelState.terminalInput?.("\t");
		panelState.terminalInput?.("\t");
		panelState.terminalInput?.("\t");
		assert.doesNotMatch(
			channelPanelLines.join("\n"),
			/Press Enter to open \/wiki-config\./i,
			"Channels tab should not route add-channel affordance through wiki-config copy",
		);
		panelState.terminalInput?.("\r");
		const widgetInstanceAfterChannelEnter = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const channelPanelLinesAfterEnter =
			widgetInstanceAfterChannelEnter?.render(100) ?? [];
		assert.match(
			channelPanelLinesAfterEnter.join("\n"),
			/Add channel/i,
			"Pressing Enter in channels should open an add-channel detail pane instead of opening wiki-config",
		);
		channelInputQueue.push(
			"Smoke channel",
			"manual",
			"slack://smoke",
			"Smoke delivery route",
		);
		panelState.terminalInput?.("\r");
		await new Promise((resolveTick) => setTimeout(resolveTick, 25));
		const storedChannels = JSON.parse(
			readFileSync(
				resolve(projectDir, ".pi", "codewiki-channels.json"),
				"utf8",
			),
		);
		assert.match(
			JSON.stringify(storedChannels),
			/Smoke channel/i,
			"Saving the add-channel detail pane should persist a new channel row",
		);
		assert.match(
			resumeNotifications.at(-1)?.message ?? "",
			/queued implement for TASK-001/i,
			"wiki-resume should resume the deterministic task phase from the focused roadmap task",
		);
		assert.ok(
			taskStatuses.some(
				(entry) =>
					entry.key === "codewiki-task" &&
					/TASK-001 progress/i.test(String(entry.value)),
			),
			"wiki-resume should refresh task focus status",
		);
		assert.match(
			resumeBarrierNotifications.at(-1)?.message ?? "",
			/TASK-002 cannot start yet\. TASK-001 is still active in implement/i,
			"wiki-resume should refuse to start a todo task while another task is still active in the internal loop",
		);
		assert.match(
			errorNotifications[0]?.message ?? "",
			/No repo-local wiki found from/,
			"Missing-target errors should explain why global commands could not pick a repo",
		);
		assert.match(
			errorNotifications[0]?.message ?? "",
			/loaded globally, but each run targets one repo-local wiki/i,
			"Missing-target errors should explain global-vs-local targeting",
		);
		assert.match(
			errorNotifications[0]?.message ?? "",
			/\/wiki-config \/path\/to\/repo/,
			"Missing-target errors should suggest passing an explicit repo path for configuration",
		);

		const archiveTaskResult = await taskTool.definition.execute(
			"task_create_archive_smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke archive retention task",
						priority: "low",
						kind: "testing",
						summary: "Exercise closed-task archival.",
						spec_paths: [".wiki/knowledge/system/rules/overview.md"],
						code_paths: ["scripts/rebuild_docs_meta.py"],
						labels: ["archive-smoke"],
						goal: { verification: ["Close task and compact hot roadmap."] },
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			archiveTaskResult.content?.[0]?.text ?? "",
			/TASK-\d+/i,
			"Archive smoke task should be created",
		);
		const archiveRoadmapBeforeClose = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "roadmap.json"), "utf8"),
		);
		const archiveTaskId = archiveRoadmapBeforeClose.order.find(
			(id) =>
				archiveRoadmapBeforeClose.tasks[id]?.title ===
				"Smoke archive retention task",
		);
		assert.ok(archiveTaskId, "Archive smoke task id missing before close");
		await taskTool.definition.execute(
			"task_archive_verify_smoke",
			{
				repoPath: projectDir,
				action: "update",
				taskId: archiveTaskId,
				patch: { phase: "verify" },
				evidence: { result: "pass", summary: "Archive smoke verified." },
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const retentionConfigPath = resolve(projectDir, ".wiki", "config.json");
		const retentionConfig = JSON.parse(
			readFileSync(retentionConfigPath, "utf8"),
		);
		retentionConfig.roadmap_retention = {
			closed_task_limit: 0,
			archive_path: ".wiki/roadmap-archive.jsonl",
			compress_archive: false,
		};
		writeFileSync(
			retentionConfigPath,
			`${JSON.stringify(retentionConfig, null, 2)}\n`,
			"utf8",
		);
		await taskTool.definition.execute(
			"task_archive_close_smoke",
			{
				repoPath: projectDir,
				action: "close",
				taskId: archiveTaskId,
				summary: "Close archive smoke task.",
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const archiveRoadmapAfterClose = JSON.parse(
			readFileSync(resolve(projectDir, ".wiki", "roadmap.json"), "utf8"),
		);
		const archiveText = readFileSync(
			resolve(projectDir, ".wiki", "roadmap-archive.jsonl"),
			"utf8",
		);
		assert.ok(
			!archiveRoadmapAfterClose.tasks[archiveTaskId],
			"Closed task should leave hot roadmap when closed_task_limit is zero",
		);
		assert.match(
			archiveText,
			new RegExp(`"id":"${archiveTaskId}"`),
			"Closed task should be preserved losslessly in roadmap archive JSONL",
		);
		const clearArchiveResult = await taskTool.definition.execute(
			"task_clear_archive_smoke",
			{
				repoPath: projectDir,
				action: "clear-archive",
				summary: "Smoke test confirms explicit archive clearing.",
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			clearArchiveResult.content?.[0]?.text ?? "",
			/cleared roadmap archive/i,
			"Archive clear action should report success",
		);
		assert.equal(
			readFileSync(
				resolve(projectDir, ".wiki", "roadmap-archive.jsonl"),
				"utf8",
			),
			"",
			"Archive clear action should empty archive contents explicitly",
		);
	});
	console.log(
		`✓ bootstrap smoke test passed (Python: ${python.command}, PyYAML: ${python.yamlVersion})`,
	);

	console.log("All codewiki smoke tests passed.");
}

await main();
