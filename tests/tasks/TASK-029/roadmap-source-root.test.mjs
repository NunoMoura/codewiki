import assert from "node:assert";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const requiredRoadmapOwners = [
	"src/roadmap/types.ts",
	"src/roadmap/status.ts",
	"src/roadmap/task-id.ts",
	"src/roadmap/task-boundary.ts",
	"src/roadmap/runtime.ts",
	"src/roadmap/task.ts",
	"src/roadmap/tool.ts",
];
const removedRoadmapOwners = [
	"src/domain/roadmap/types.ts",
	"src/domain/roadmap/status.ts",
	"src/domain/roadmap/task-id.ts",
	"src/domain/roadmap/task-boundary.ts",
	"src/application/roadmap.ts",
	"src/application/task.ts",
	"src/application/tools/task.ts",
];

for (const owner of requiredRoadmapOwners) {
	assert.ok(existsSync(resolve(repoRoot, owner)), `${owner} should exist after TASK-029 roadmap migration`);
}
for (const owner of removedRoadmapOwners) {
	assert.ok(!existsSync(resolve(repoRoot, owner)), `${owner} should be removed rather than kept as an untested shim`);
}

const roadmapTypes = await import(resolve(repoRoot, "src/roadmap/types.ts"));
const roadmapStatus = await import(resolve(repoRoot, "src/roadmap/status.ts"));
const roadmapIds = await import(resolve(repoRoot, "src/roadmap/task-id.ts"));
const roadmapBoundary = await import(resolve(repoRoot, "src/roadmap/task-boundary.ts"));
const roadmapRuntime = await import(resolve(repoRoot, "src/roadmap/runtime.ts"));
const roadmapTask = await import(resolve(repoRoot, "src/roadmap/task.ts"));
const roadmapTool = await import(resolve(repoRoot, "src/roadmap/tool.ts"));

assert.deepEqual(roadmapTypes.ROADMAP_STATUS_VALUES, ["todo", "in_progress", "blocked", "done", "cancelled"], "roadmap statuses should remain stable");
assert.deepEqual(roadmapTypes.ROADMAP_PRIORITY_VALUES, ["critical", "high", "medium", "low"], "roadmap priorities should remain stable");
assert.deepEqual(roadmapTypes.TOOL_TASK_STATUS_VALUES, ["todo", "in_progress", "blocked", "done", "cancelled"], "tool task statuses should remain stable");
assert.deepEqual(roadmapTypes.TASK_EVIDENCE_RESULT_VALUES, ["progress", "pass", "fail", "block", "done_candidate"], "task evidence results should remain stable");
assert.deepEqual(roadmapTypes.SPRINT_STATUS_VALUES, ["planned", "active", "review", "closed", "cancelled"], "sprint statuses should remain stable");
assert.equal(roadmapStatus.isOpenRoadmapStatus("todo"), true, "todo should stay open");
assert.equal(roadmapStatus.isOpenRoadmapStatus("done"), false, "done should stay closed");
assert.equal(roadmapIds.formatTaskId(7), "TASK-007", "task id formatting should stay stable");
assert.equal(roadmapIds.parseTaskIdSequence("TASK-029"), 29, "task id parsing should stay stable");
assert.deepEqual(roadmapIds.taskIdCandidates("TASK-29"), ["TASK-29", "TASK-029"], "task id fallback candidates should stay stable");

const executableTask = {
	id: "TASK-900",
	title: "Move roadmap source root",
	status: "todo",
	priority: "high",
	kind: "migration",
	summary: "Move roadmap owner modules without changing behavior.",
	spec_paths: [".codewiki/kb/system/roadmap.md"],
	code_paths: ["src/roadmap/runtime.ts"],
	labels: ["roadmap-root"],
	goal: {
		outcome: "Roadmap ownership lives under src/roadmap/**.",
		acceptance: ["Roadmap tool behavior is preserved."],
		verification: ["node --experimental-strip-types ./tests/tasks/TASK-029/roadmap-source-root.test.mjs"],
	},
};
const containerTask = {
	...executableTask,
	id: "TASK-901",
	title: "Close roadmap migration umbrella",
	summary: "Coordinate children and close them after the sprint.",
	goal: {
		outcome: "Coordinate child tasks.",
		acceptance: ["TASK-029 is closed.", "TASK-030 is closed.", "TASK-031 is closed."],
		verification: ["Review child task status."],
	},
};
assert.equal(roadmapBoundary.isExecutableRoadmapTask(executableTask), true, "bounded roadmap task should be executable");
assert.equal(roadmapBoundary.assessRoadmapTaskBoundary(containerTask).container, true, "container task should still be detected");
assert.throws(() => roadmapBoundary.assertExecutableRoadmapTask(containerTask, "guard"), /self-contained executable work/);

for (const [name, value] of [
	["readRoadmapFile", roadmapRuntime.readRoadmapFile],
	["writeRoadmapFile", roadmapRuntime.writeRoadmapFile],
	["appendRoadmapTasks", roadmapRuntime.appendRoadmapTasks],
	["updateRoadmapTask", roadmapRuntime.updateRoadmapTask],
	["upsertRoadmapSprint", roadmapRuntime.upsertRoadmapSprint],
	["runTaskClosePreflight", roadmapRuntime.runTaskClosePreflight],
	["createCodewikiTasks", roadmapTask.createCodewikiTasks],
	["patchCodewikiTask", roadmapTask.patchCodewikiTask],
	["closeCodewikiTask", roadmapTask.closeCodewikiTask],
	["cancelCodewikiTask", roadmapTask.cancelCodewikiTask],
	["executeCodewikiTaskTool", roadmapTool.executeCodewikiTaskTool],
]) {
	assert.equal(typeof value, "function", `${name} should be exported from roadmap source root`);
}

const tempRoot = await mkdtemp(resolve(tmpdir(), "codewiki-task-029-"));
try {
	const roadmapPath = resolve(tempRoot, ".codewiki/roadmap/queue.json");
	const graphPath = resolve(tempRoot, ".codewiki/index_graph.json");
	await mkdir(dirname(roadmapPath), { recursive: true });
	await writeFile(roadmapPath, JSON.stringify({
		version: 1,
		updated: "2026-05-27T00:00:00.000Z",
		order: [executableTask.id],
		tasks: {
			[executableTask.id]: {
				...executableTask,
				research_ids: [],
				change_type: "system",
				goal: { ...executableTask.goal, non_goals: [] },
				delta: { desired: "", current: "", closure: "" },
				created: "2026-05-27T00:00:00.000Z",
				updated: "2026-05-27T00:00:00.000Z",
			},
		},
		sprints: {},
	}, null, 2));

	const project = {
		root: tempRoot,
		label: "task-029-fixture",
		config: {},
		docsRoot: resolve(tempRoot, ".codewiki/kb"),
		specsRoot: resolve(tempRoot, ".codewiki/kb"),
		evidenceRoot: resolve(tempRoot, ".codewiki/evidence"),
		researchRoot: resolve(tempRoot, ".codewiki/research"),
		indexPath: graphPath,
		roadmapPath,
		roadmapDocPath: resolve(tempRoot, ".codewiki/kb/system/roadmap.md"),
		roadmapEventsPath: resolve(tempRoot, ".codewiki/roadmap/events.jsonl"),
		metaRoot: resolve(tempRoot, ".codewiki"),
		viewsRoot: resolve(tempRoot, ".codewiki/roadmap/tasks"),
		generatedFiles: [],
		graphPath,
		lintPath: resolve(tempRoot, ".codewiki/lint.json"),
		roadmapStatePath: graphPath,
		statusStatePath: graphPath,
		eventsPath: resolve(tempRoot, ".codewiki/events.jsonl"),
		configPath: resolve(tempRoot, ".codewiki/config.json"),
	};
	let rebuildCount = 0;
	const ports = {
		fileStore: {},
		rebuildRunner: { run: async () => { rebuildCount += 1; } },
		messageBus: { publish: async () => {} },
	};

	const createResult = await roadmapTool.executeCodewikiTaskTool(project, {
		action: "create",
		refresh: false,
		tasks: [{
			title: "Verify roadmap source root",
			priority: "medium",
			kind: "testing",
			summary: "Prove codewiki_task create still mutates queue JSON.",
			spec_paths: ["package.json"],
			code_paths: ["tests/tasks/TASK-029/roadmap-source-root.test.mjs"],
			labels: ["guard-new-task"],
			change_type: "system",
			goal: {
				outcome: "Roadmap source root create path is covered.",
				acceptance: ["A created task appears in queue order."],
				non_goals: ["Do not change queue schema."],
				verification: ["TASK-029 guard"],
			},
		}],
	}, ports);
	assert.equal(createResult.action, "create");
	assert.equal(createResult.changed, true);
	assert.equal(createResult.canonical_task_ids[0], "TASK-901", "create should preserve sequential task ids");
	assert.equal(rebuildCount, 1, "create path should still request rebuild through ports");

	const updateResult = await roadmapTool.executeCodewikiTaskTool(project, {
		action: "update",
		taskId: "TASK-901",
		refresh: false,
		patch: { priority: "high", labels: ["roadmap-root", "guard"] },
		evidence: { summary: "Guard update evidence", result: "progress", checks_run: ["TASK-029 guard"] },
	}, ports);
	assert.equal(updateResult.action, "update");
	assert.equal(updateResult.changed, true);
	assert.equal(updateResult.evidence_recorded, true);

	const sprintResult = await roadmapTool.executeCodewikiTaskTool(project, {
		action: "sprint",
		refresh: false,
		sprint: {
			id: "SPRINT-901",
			title: "Roadmap source-root guard sprint",
			status: "active",
			outcome: "Roadmap task metadata stays mutable through src/roadmap/tool.ts.",
			task_ids: ["TASK-901"],
			scope: { code: ["src/roadmap/**"] },
			gates: ["TASK-029 guard"],
		},
	}, ports);
	assert.equal(sprintResult.action, "sprint");
	assert.equal(sprintResult.sprint.id, "SPRINT-901");

	const cancelResult = await roadmapTool.executeCodewikiTaskTool(project, {
		action: "cancel",
		taskId: "TASK-901",
		refresh: false,
		summary: "Guard cancellation preserves cancel semantics.",
	}, ports);
	assert.equal(cancelResult.action, "cancel");
	assert.equal(cancelResult.task.status, "cancelled");
	assert.ok(rebuildCount >= 2, "mutating task paths should still request rebuild through ports");

	const queue = JSON.parse(await readFile(roadmapPath, "utf8"));
	assert.equal(queue.tasks["TASK-901"].status, "cancelled", "queue JSON status should be unchanged by migration");
	assert.equal(queue.tasks["TASK-901"].priority, "high", "patch semantics should be preserved");
	assert.deepEqual(queue.sprints["SPRINT-901"].task_ids, ["TASK-901"], "sprint metadata schema should be preserved");
} finally {
	await rm(tempRoot, { recursive: true, force: true });
}

const legacyImportPattern = /(?:from|import\()\s*["'][^"']*(?:domain\/roadmap|application\/roadmap|application\/task|application\/tools\/task)\.ts["']/;
const allowedLegacyTextFiles = new Set([
	"tests/tasks/TASK-029/roadmap-source-root.test.mjs",
	"tests/smoke/package-smoke.test.mjs",
]);
const scanRoots = ["src", "tests", "scripts"];
for (const root of scanRoots) {
	const stack = [resolve(repoRoot, root)];
	while (stack.length) {
		const current = stack.pop();
		const entries = await (await import("node:fs/promises")).readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const full = resolve(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
				continue;
			}
			if (!/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) continue;
			const rel = full.slice(repoRoot.length + 1);
			const source = await readFile(full, "utf8");
			assert.ok(!legacyImportPattern.test(source), `${rel} should not import old roadmap/task owner paths`);
			if (!allowedLegacyTextFiles.has(rel)) {
				assert.ok(!/domain\/roadmap|application\/roadmap|application\/task|application\/tools\/task/.test(source), `${rel} should not keep legacy roadmap owner path text`);
			}
		}
	}
}

console.log("✓ TASK-029 roadmap source-root guard passed");
