import assert from "node:assert";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	writeDecisionBuild,
	writePlanningBuild,
} from "../../../src/build/writer.ts";
import { writeValidationReport } from "../../../src/validation/report.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const requiredStateOwners = [
	"src/state/types.ts",
	"src/state/artifacts.ts",
	"src/state/builders.ts",
	"src/state/reader.ts",
	"src/state/rebuild.ts",
	"src/state/graph.ts",
	"src/state/graph/rebuilder.ts",
	"src/state/lint.ts",
	"src/state/resume-context.ts",
	"src/state/prompt.ts",
	"src/state/skill-assets.ts",
	"src/state/local/rebuild-runner.ts",
	"src/state/local/status-dock-prefs.ts",
	"src/state/tool.ts",
	"src/state/resume-tool.ts",
];
const removedStateOwners = [
	"src/domain/state/types.ts",
	"src/application/state.ts",
	"src/application/state-artifacts.ts",
	"src/application/state-builders.ts",
	"src/application/rebuild.ts",
	"src/application/graph.ts",
	"src/application/graph/rebuilder.ts",
	"src/application/lint.ts",
	"src/application/resume-context.ts",
	"src/application/prompt.ts",
	"src/application/skill-assets.ts",
	"src/application/local/rebuild-runner.ts",
	"src/application/local/status-dock-prefs.ts",
	"src/application/tools/state.ts",
	"src/application/tools/resume-context.ts",
];

for (const owner of requiredStateOwners) {
	assert.ok(
		existsSync(resolve(repoRoot, owner)),
		`${owner} should exist after TASK-030 state/graph/resume migration`,
	);
}
for (const owner of removedStateOwners) {
	assert.ok(
		!existsSync(resolve(repoRoot, owner)),
		`${owner} should be removed rather than kept as an untested shim`,
	);
}
assert.ok(
	!existsSync(resolve(repoRoot, "src/resume")),
	"TASK-030 should not create a separate src/resume/** root",
);

const stateTypes = await import(resolve(repoRoot, "src/state/types.ts"));
const stateArtifacts = await import(
	resolve(repoRoot, "src/state/artifacts.ts")
);
const stateBuilders = await import(resolve(repoRoot, "src/state/builders.ts"));
const stateReader = await import(resolve(repoRoot, "src/state/reader.ts"));
const stateRebuild = await import(resolve(repoRoot, "src/state/rebuild.ts"));
const stateGraph = await import(resolve(repoRoot, "src/state/graph.ts"));
const stateGraphRebuilder = await import(
	resolve(repoRoot, "src/state/graph/rebuilder.ts")
);
const stateLint = await import(resolve(repoRoot, "src/state/lint.ts"));
const stateResume = await import(
	resolve(repoRoot, "src/state/resume-context.ts")
);
const statePrompt = await import(resolve(repoRoot, "src/state/prompt.ts"));
const statePrefs = await import(
	resolve(repoRoot, "src/state/local/status-dock-prefs.ts")
);
const stateTool = await import(resolve(repoRoot, "src/state/tool.ts"));
const stateResumeTool = await import(
	resolve(repoRoot, "src/state/resume-tool.ts")
);

assert.deepEqual(
	stateTypes.CODEWIKI_STATE_SECTION_VALUES,
	[
		"repo",
		"health",
		"summary",
		"roadmap",
		"graph",
		"trace",
		"audit",
		"drift",
		"session",
		"task",
		"claims",
		"archive",
	],
	"codewiki_state sections should remain stable",
);
assert.deepEqual(
	stateTypes.STATUS_DOCK_MODE_VALUES,
	["auto", "pin", "off"],
	"status dock modes should remain stable",
);
assert.deepEqual(
	stateTypes.STATUS_DOCK_DENSITY_VALUES,
	["minimal", "standard", "full"],
	"status dock density values should remain stable",
);
assert.equal(
	stateArtifacts.mapToolTaskStatusToRoadmapStatus("in_progress"),
	"in_progress",
	"tool task status mapping should stay stable",
);
assert.equal(
	stateArtifacts.roadmapApiTaskState({ status: "blocked" }).status,
	"blocked",
	"roadmap task API status should stay stable",
);
assert.equal(
	stateBuilders.stableAgentName("abc123456789"),
	"Heron",
	"stable agent names should remain deterministic",
);
assert.deepEqual(
	stateReader.buildCodewikiStateInclude(undefined, "TASK-030"),
	["repo", "health", "summary", "task"],
	"state include default should add task when task id exists",
);
assert.equal(
	typeof stateRebuild.rebuildTargetPaths,
	"function",
	"rebuild locking helper should be state-owned",
);
assert.equal(
	typeof stateGraph.buildGraph,
	"function",
	"graph builder should be state-owned",
);
assert.equal(
	typeof stateGraphRebuilder.CodewikiRebuilder,
	"function",
	"graph rebuilder should be state-owned",
);
assert.equal(
	typeof stateLint.buildLintReport,
	"function",
	"lint report builder should be state-owned",
);
assert.equal(
	typeof stateResume.buildCodewikiResumeContext,
	"function",
	"resume context builder should be state-owned",
);
assert.equal(
	typeof statePrompt.codePrompt,
	"function",
	"prompt renderer should be state-owned",
);
assert.deepEqual(
	statePrefs.defaultStatusDockPrefs(),
	{ version: 1, mode: "auto", density: "standard" },
	"status dock defaults should stay stable",
);

const tempRoot = await mkdtemp(resolve(tmpdir(), "codewiki-task-030-"));
const oldPrefsPath = process.env.PI_CODEWIKI_STATUS_PREFS_PATH;
try {
	const metaRoot = resolve(tempRoot, ".codewiki");
	const roadmapPath = resolve(metaRoot, "roadmap/queue.json");
	const graphPath = resolve(metaRoot, "index_graph.json");
	const taskContextPath = resolve(
		metaRoot,
		"roadmap/tasks/TASK-900/context.json",
	);
	await mkdir(dirname(roadmapPath), { recursive: true });
	await mkdir(dirname(taskContextPath), { recursive: true });
	const now = "2026-05-27T00:00:00.000Z";
	const task = {
		id: "TASK-900",
		title: "Verify state source root",
		status: "todo",
		priority: "high",
		kind: "migration",
		summary:
			"Prove state, graph, prompt, and resume ownership lives under src/state/**.",
		spec_paths: [".codewiki/kb/system/graph.md"],
		code_paths: ["src/state/reader.ts", "src/state/resume-context.ts"],
		research_ids: [],
		labels: ["state-root"],
		change_type: "system",
		goal: {
			outcome: "State ownership lives under src/state/**.",
			acceptance: [
				"codewiki_state and codewiki_resume_context behavior is preserved.",
			],
			non_goals: ["Do not create src/resume/**."],
			verification: [
				"node --experimental-strip-types ./tests/tasks/TASK-030/state-graph-resume-source-root.test.mjs",
			],
		},
		delta: {
			desired: "src/state/** ownership",
			current: "legacy roots removed",
			closure: "guard passes",
		},
		created: now,
		updated: now,
	};
	await writeFile(
		roadmapPath,
		JSON.stringify(
			{
				version: 1,
				updated: now,
				order: [task.id],
				tasks: { [task.id]: task },
				sprints: {},
			},
			null,
			2,
		),
	);
	await writeFile(
		taskContextPath,
		JSON.stringify(
			{
				version: 1,
				generated_at: now,
				context_path: ".codewiki/roadmap/tasks/TASK-900/context.json",
				budget: { target_tokens: 6000, policy: "Use packet first." },
				revision: {
					task: { digest: "task-digest" },
					spec_digest: "spec-digest",
					code_digest: "code-digest",
					git: { head: "abc123", dirty: false },
				},
				task: {
					id: task.id,
					title: task.title,
					status: task.status,
					priority: task.priority,
					kind: task.kind,
					summary: task.summary,
					labels: task.labels,
					goal: task.goal,
					delta: task.delta,
				},
				specs: [
					{
						path: ".codewiki/kb/system/graph.md",
						title: "Graph",
						summary: "Generated state/graph representation.",
						revision: { digest: "spec-digest" },
					},
				],
				code: { paths: task.code_paths },
				evidence: { verdict: "progress", summary: "guard fixture" },
			},
			null,
			2,
		),
	);
	const lintReport = {
		version: 1,
		generated_at: now,
		counts: { error: 0, warning: 0, info: 0 },
		issues: [],
	};
	const statusState = {
		version: 1,
		generated_at: now,
		health: { color: "green", errors: 0, warnings: 0, total_issues: 0 },
		summary: {
			open_task_count: 1,
			tracked_specs: 1,
			untracked_specs: 0,
			blocked_specs: 0,
		},
		views: { top_risky_spec_paths: [] },
		resume: { task_id: task.id },
		parallel: {
			active_claim_count: 0,
			claim_warning_count: 0,
			claim_conflict_count: 0,
			claim_pending_wait_count: 0,
			claim_ready_wait_count: 0,
			artifact_statuses: [],
			claims: [],
			claim_waiters: [],
			claim_conflicts: [],
		},
	};
	const roadmapState = {
		version: 1,
		generated_at: now,
		tasks: {
			[task.id]: {
				id: task.id,
				title: task.title,
				status: task.status,
				priority: task.priority,
				kind: task.kind,
				summary: task.summary,
				context_path: ".codewiki/roadmap/tasks/TASK-900/context.json",
				loop: { evidence: { verdict: "progress", summary: "guard fixture" } },
			},
		},
		views: {
			open_task_ids: [task.id],
			in_progress_task_ids: [],
			blocked_task_ids: [],
			recent_task_ids: [task.id],
			sprint_ids: [],
			active_sprint_ids: [],
			sprints: [],
		},
	};
	await writeFile(
		graphPath,
		JSON.stringify(
			{
				version: 1,
				generated_at: now,
				nodes: [
					{
						id: "task:TASK-900",
						kind: "task",
						path: ".codewiki/roadmap/tasks/TASK-900/task.json",
						title: task.title,
					},
					{
						id: "doc:.codewiki/kb/system/graph.md",
						kind: "doc",
						path: ".codewiki/kb/system/graph.md",
						title: "Graph",
						doc_type: "spec",
					},
					{
						id: "code:src/state/reader.ts",
						kind: "code_path",
						path: "src/state/reader.ts",
					},
				],
				edges: [
					{
						from: "doc:.codewiki/kb/system/graph.md",
						to: "code:src/state/reader.ts",
						kind: "doc_code_path",
					},
				],
				views: {
					code: { paths: ["src/state/reader.ts"] },
					lenses: {
						default: {
							families: [],
							badges: [],
							next_action: null,
							expands_to: [],
						},
					},
					gc: { classes: { hot: {} } },
					claims: {
						active_claim_count: 0,
						warning_count: 0,
						conflict_count: 0,
					},
				},
				lenses: {
					lint: lintReport,
					status: statusState,
					roadmap: roadmapState,
				},
			},
			null,
			2,
		),
	);

	const project = {
		root: tempRoot,
		label: "task-030-fixture",
		config: {},
		docsRoot: resolve(metaRoot, "kb"),
		specsRoot: resolve(metaRoot, "kb"),
		evidenceRoot: resolve(metaRoot, "evidence"),
		researchRoot: resolve(metaRoot, "research"),
		indexPath: graphPath,
		roadmapPath,
		roadmapDocPath: resolve(metaRoot, "kb/system/roadmap.md"),
		roadmapEventsPath: resolve(metaRoot, "roadmap/events.jsonl"),
		metaRoot,
		viewsRoot: resolve(metaRoot, "roadmap/tasks"),
		generatedFiles: [],
		graphPath,
		lintPath: resolve(metaRoot, "lint.json"),
		roadmapStatePath: graphPath,
		statusStatePath: graphPath,
		eventsPath: resolve(metaRoot, "events.jsonl"),
		configPath: resolve(metaRoot, "config.json"),
	};
	const decision = await writeDecisionBuild(project, {
		kind: "decision",
		summary: "State resume source-root proof decision.",
		diff_table: [
			{
				id: "TASK-030-RESUME",
				current_state: "TASK-900 lacks planning proof.",
				desired_state: "TASK-900 has validated planning proof before resume.",
				rationale: "Resume enforcement requires planning-gateway proof.",
				affected_layers: ["roadmap"],
				user_action: "approved",
			},
		],
		row_to_kb_mappings: [
			{
				row_id: "TASK-030-RESUME",
				knowledge_refs: [".codewiki/kb/system/graph.md"],
				evidence: "Graph docs own state resume behavior.",
			},
		],
		propagation: {
			direction: "system-first",
			no_product_impact: "Source-root guard only.",
			downstream_planning_questions: ["Plan TASK-900 resume proof."],
		},
		knowledge_changes: [".codewiki/kb/system/graph.md"],
	});
	await writeValidationReport(project, {
		profile: "decision",
		verdict: "pass",
		rationale: "Decision pass for TASK-030 resume proof.",
		source: decision.path,
		audit_refs: ["audit:alignment", "audit:stale-reference", "approval:user"],
	});
	const planning = await writePlanningBuild(project, {
		kind: "planning",
		summary: "State resume source-root proof planning.",
		source_decision_build: decision.path,
		task_ids: [task.id],
		task_changes: [
			`${task.id} is implementation-ready for source-root resume guard.`,
		],
		decision_row_resolutions: [
			{
				row_id: "TASK-030-RESUME",
				resolution: "roadmap-task",
				task_ids: [task.id],
				evidence: "TASK-900 has validated planning proof.",
				source_refs: [decision.path, task.id],
			},
		],
		downstream_question_resolutions: [
			{
				question: "Plan TASK-900 resume proof.",
				resolution: "roadmap-task",
				task_ids: [task.id],
				evidence: "TASK-900 answers the resume proof question.",
				source_refs: [decision.path, task.id],
			},
		],
		tdd_plan: ["Source-root guard uses planning proof."],
		candidate_test_files: [
			"tests/tasks/TASK-030/state-graph-resume-source-root.test.mjs",
		],
		candidate_code_paths: ["src/state/resume-context.ts"],
	});
	await writeValidationReport(project, {
		profile: "planning",
		verdict: "pass",
		rationale: "Planning pass for TASK-030 resume proof.",
		source: planning.path,
		audit_refs: ["audit:alignment", "approval:user"],
	});
	const ports = {
		fileStore: {},
		rebuildRunner: {
			run: async () => {
				throw new Error("state guard should not rebuild when refresh=false");
			},
		},
		sessionStore: { getSessionBranch: () => [] },
	};
	const stateResult = await stateTool.executeCodewikiStateTool(
		project,
		{ include: ["roadmap", "task"], taskId: task.id, refresh: false },
		ports,
	);
	assert.match(
		stateResult.summary,
		/Codewiki State: task-030-fixture/,
		"codewiki_state summary should remain stable",
	);
	assert.equal(
		stateResult.result.summary.open_task_count,
		1,
		"codewiki_state result should preserve open task count",
	);
	assert.equal(
		stateResult.result.task.id,
		task.id,
		"codewiki_state task detail should preserve generated task shape",
	);
	assert.equal(
		stateResult.result.task.context_packet.context_path,
		".codewiki/roadmap/tasks/TASK-900/context.json",
		"task context packet path should be preserved",
	);

	const resumeResult = await stateResumeTool.executeCodewikiResumeContextTool(
		project,
		{ taskId: task.id, refresh: false, followUpIntent: "guard follow-up" },
		{ sessionId: "task-030-guard" },
	);
	assert.match(
		resumeResult.summary,
		/Codewiki Resume Context: task-030-fixture/,
		"resume-context summary should remain stable",
	);
	assert.match(
		resumeResult.result.prompt,
		/Implement roadmap task TASK-900/,
		"resume prompt should preserve implementation prompt shape",
	);
	assert.equal(
		resumeResult.result.context_path,
		".codewiki/roadmap/tasks/TASK-900/context.json",
		"resume context should preserve task context path",
	);
	assert.ok(
		resumeResult.result.source_refs.includes("src/state/reader.ts"),
		"resume context source refs should include task code paths",
	);

	process.env.PI_CODEWIKI_STATUS_PREFS_PATH = resolve(
		tempRoot,
		"status-prefs.json",
	);
	await statePrefs.writeStatusDockPrefs({
		version: 1,
		mode: "pin",
		density: "full",
		pinnedRepoPath: tempRoot,
	});
	const prefs = await statePrefs.readStatusDockPrefs();
	assert.deepEqual(
		prefs,
		{
			version: 1,
			mode: "pin",
			density: "full",
			pinnedRepoPath: tempRoot,
			lastRepoPath: undefined,
		},
		"status dock prefs should round-trip through state source root",
	);
} finally {
	if (oldPrefsPath === undefined)
		delete process.env.PI_CODEWIKI_STATUS_PREFS_PATH;
	else process.env.PI_CODEWIKI_STATUS_PREFS_PATH = oldPrefsPath;
	await rm(tempRoot, { recursive: true, force: true });
}

const legacyImportPattern =
	/(?:from|import\()\s*["'][^"']*(?:domain\/state|application\/state|application\/graph|application\/rebuild|application\/lint|application\/resume-context|application\/prompt|application\/skill-assets|application\/local\/(?:rebuild-runner|status-dock-prefs)|application\/tools\/(?:state|resume-context))[^"]*["']/;
const legacyTextPattern =
	/domain\/state|application\/state|application\/graph|application\/rebuild|application\/lint|application\/resume-context|application\/prompt|application\/skill-assets|application\/local\/(?:rebuild-runner|status-dock-prefs)|application\/tools\/(?:state|resume-context)/;
const allowedLegacyTextFiles = new Set([
	"tests/tasks/TASK-030/state-graph-resume-source-root.test.mjs",
	"tests/smoke/package-smoke.test.mjs",
]);
const scanRoots = ["src", "tests", "scripts"];
for (const root of scanRoots) {
	const stack = [resolve(repoRoot, root)];
	while (stack.length) {
		const current = stack.pop();
		const entries = await (await import("node:fs/promises")).readdir(current, {
			withFileTypes: true,
		});
		for (const entry of entries) {
			const full = resolve(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
				continue;
			}
			if (!/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) continue;
			const rel = full.slice(repoRoot.length + 1);
			const source = await readFile(full, "utf8");
			assert.ok(
				!legacyImportPattern.test(source),
				`${rel} should not import old state/graph/resume owner paths`,
			);
			if (!allowedLegacyTextFiles.has(rel)) {
				assert.ok(
					!legacyTextPattern.test(source),
					`${rel} should not keep legacy state/graph/resume owner path text`,
				);
			}
		}
	}
}

console.log("✓ TASK-030 state/graph/resume source-root guard passed");
