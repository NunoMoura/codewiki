import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintRoadmapEntries } from "../../../src/state/lint.ts";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../../..");
const project = { root: repoRoot, roadmapPath: ".codewiki/roadmap/queue.json" };

function roadmapIssues(entries) {
	return lintRoadmapEntries(repoRoot, project, entries, []).filter(
		(issue) => issue.kind === "roadmap-missing-code-path",
	);
}

const openTask = {
	id: "TASK-999",
	title: "Open missing path fixture",
	status: "in_progress",
	priority: "medium",
	kind: "bug",
	summary: "Open tasks must still validate code paths.",
	created: "2026-06-01",
	updated: "2026-06-01",
	spec_paths: [],
	code_paths: ["src/not-a-real-open-path"],
	research_ids: [],
	goal: {
		outcome: "Warn for active missing paths.",
		acceptance: ["warning exists"],
		non_goals: [],
		verification: ["lintRoadmapEntries"],
	},
};

const cancelledTask = {
	...openTask,
	id: "TASK-998",
	title: "Cancelled missing path fixture",
	status: "cancelled",
	summary: "Cancelled tasks are historical evidence and should not block reconciliation on removed source paths.",
	code_paths: ["src/not-a-real-cancelled-path"],
};

assert.ok(
	roadmapIssues([openTask]).some((issue) =>
		issue.message.includes("TASK-999 references missing code path"),
	),
	"open tasks should still warn when code paths are missing",
);
assert.equal(
	roadmapIssues([cancelledTask]).length,
	0,
	"cancelled tasks should not warn on missing historic code paths",
);

const queue = JSON.parse(
	readFileSync(resolve(repoRoot, ".codewiki/roadmap/queue.json"), "utf8"),
);
const queueTasks = Object.values(queue.tasks || {});
assert.ok(
	queueTasks.some((task) => task.id === "TASK-012" && task.status === "cancelled"),
	"fixture expects cancelled TASK-012 to remain in queue as historic evidence",
);
const currentWarnings = roadmapIssues(queueTasks).map((issue) => issue.message);
assert.ok(
	!currentWarnings.some((message) =>
		/TASK-012.*src\/ui/.test(message),
	),
	"cancelled TASK-012 src/ui reference should not drive active reconciliation",
);
assert.ok(
	!currentWarnings.some((message) =>
		/TASK-036.*src\/ui\/web/.test(message),
	),
	"cancelled TASK-036 web UI references should not drive active reconciliation",
);

console.log("✓ TASK-075 cancelled roadmap path lint smoke passed");
