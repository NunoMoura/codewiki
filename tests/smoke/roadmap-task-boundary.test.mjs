import assert from "node:assert";
import { assessRoadmapTaskBoundary, assertExecutableRoadmapTask } from "../../src/roadmap/task-boundary.ts";
import { runTaskClosePreflight } from "../../src/roadmap/runtime.ts";

const boundedTask = {
	id: "TASK-900",
	title: "Validate graph cache refresh",
	status: "todo",
	priority: "high",
	kind: "testing",
	summary: "Add a smoke assertion for graph cache refresh after roadmap queue changes.",
	spec_paths: ["package.json"],
	code_paths: ["tests/smoke/alignment-graph.test.mjs"],
	labels: ["graph", "testing"],
	goal: {
		outcome: "Graph cache refresh has direct smoke coverage.",
		acceptance: ["A smoke test fails before the refresh fix and passes after it."],
		verification: ["node tests/smoke/alignment-graph.test.mjs"],
	},
};

const containerTask = {
	id: "TASK-901",
	title: "Umbrella for graph sprint",
	status: "todo",
	priority: "critical",
	kind: "architecture",
	summary: "Coordinate child tasks and close them when the sprint is complete.",
	labels: ["roadmap"],
	goal: {
		outcome: "Coordinate related work.",
		acceptance: [
			"TASK-101 is closed with evidence.",
			"TASK-102 is validated.",
			"TASK-103 is done.",
		],
		verification: ["Review child task status."],
	},
};

const sprintLabelTask = {
	...boundedTask,
	id: "TASK-902",
	labels: ["sprint"],
};

assert.equal(assessRoadmapTaskBoundary(boundedTask).executable, true, "bounded task should be executable");
assert.equal(assessRoadmapTaskBoundary(containerTask).container, true, "container wording should be rejected");
assert.throws(
	() => assertExecutableRoadmapTask(containerTask, "test mutation"),
	/self-contained executable work/,
);
assert.throws(
	() => assertExecutableRoadmapTask(sprintLabelTask, "test mutation"),
	/container label: sprint/,
);

const preflight = await runTaskClosePreflight({ root: process.cwd() }, { ...containerTask, spec_paths: ["package.json"], code_paths: [] }, { checks_run: ["unit"] });
assert.equal(preflight.verdict, "fail", "container task should fail close preflight");
assert.ok(preflight.issues.some((issue) => issue.summary.includes("self-contained executable work")));

console.log("✓ roadmap task boundary smoke passed");
