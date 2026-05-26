import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRoadmapFile } from "../../src/application/roadmap.ts";
import { executeDiffTableAction, readRuntimeDiffTables } from "../../src/change/diff-table.ts";
import { readDiffTablePanelData, readGraphPanelData, updateRuntimeDiffRow } from "../../src/adapters/pi/ui/manager.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-efficiency-ui-"));
try {
	await mkdir(join(root, ".codewiki/builds/decision"), { recursive: true });
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await mkdir(join(root, ".codewiki/runtime"), { recursive: true });
	await writeFile(join(root, ".codewiki/config.json"), JSON.stringify({ project_name: "smoke", schema_version: 4 }, null, 2));
	await writeFile(join(root, ".codewiki/roadmap/queue.json"), JSON.stringify({
		version: 2,
		updated: "2026-05-11",
		order: ["TASK-001"],
		tasks: {
			"TASK-001": { id: "TASK-001", title: "Do scoped work", status: "todo", priority: "high", kind: "feature", summary: "Scoped work", spec_paths: [], code_paths: [], research_ids: [], labels: [], goal: { outcome: "Done", acceptance: ["done"], non_goals: [], verification: ["npm test"] }, delta: { desired: "done", current: "not done", closure: "done" }, created: "2026-05-11", updated: "2026-05-11" }
		},
		sprints: {
			"SPRINT-001": { id: "SPRINT-001", title: "Scoped sprint", status: "active", outcome: "Scope work", task_ids: ["TASK-001"], scope: { knowledge: [".codewiki/kb/system/**"], code: ["src/**"] }, budget: { maxTokens: 1000, maxCostUsd: 1, maxSessions: 2 }, gates: ["validation"], created: "2026-05-11", updated: "2026-05-11" }
		}
	}, null, 2));

	const roadmap = await readRoadmapFile(join(root, ".codewiki/roadmap/queue.json"));
	assert.equal(roadmap.sprints["SPRINT-001"].task_ids[0], "TASK-001");
	assert.equal(roadmap.sprints["SPRINT-001"].budget.maxTokens, 1000);

	const project = { root, graphPath: join(root, ".codewiki/index_graph.json"), config: {}, roadmapPath: ".codewiki/roadmap/queue.json" };
	const proposed = await executeDiffTableAction(project, {
		action: "propose",
		table_id: "DT-001",
		summary: "Approve intent",
		rows: [{ id: "DTR-001", current_state: "Old", desired_state: "New", rationale: "Better", affected_layers: ["roadmap"], risk: "low", user_action: "pending" }],
	});
	assert.equal(proposed.changed, true);
	assert.equal((await readRuntimeDiffTables(project)).tables[0].rows[0].user_action, "pending");
	assert.equal(updateRuntimeDiffRow(project, "DT-001", "DTR-001", "approved"), true);
	assert.equal(readDiffTablePanelData(project).rows[0].status, "approved");
	await executeDiffTableAction(project, { action: "alternative", table_id: "DT-001", row_id: "DTR-001", alternative: "Newer" });
	assert.deepEqual(readDiffTablePanelData(project).rows[0].alternatives, ["Newer"]);

	await writeFile(join(root, ".codewiki/index_graph.json"), JSON.stringify({
		version: 1,
		generated_at: "2026-05-11T00:00:00Z",
		nodes: [{ id: "build:a", kind: "build" }, { id: "task:TASK-001", kind: "roadmap_task" }],
		edges: [{ from: "build:a", to: "task:TASK-001", kind: "build_produces_task" }],
		views: {
			scope_views: { roadmap: { task_ids: ["TASK-001"], open_task_ids: ["TASK-001"] }, sprints: { "SPRINT-001": { id: "SPRINT-001", status: "active", task_ids: ["TASK-001"], open_task_ids: ["TASK-001"] } } },
			reconciliation: { next_action: { command: "/wiki-resume TASK-001" }, items: [] },
		}
	}, null, 2));
	const graph = readGraphPanelData(project);
	assert.equal(graph.stats.nodes, 2);
	assert.equal(graph.dagEdges[0].label, "build_produces_task");
} finally {
	await rm(root, { recursive: true, force: true });
}
