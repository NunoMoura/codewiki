import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	assessRoadmapTaskBoundary,
	assertExecutableRoadmapTask,
} from "../../src/roadmap/task-boundary.ts";
import { runTaskClosePreflight } from "../../src/roadmap/store.ts";
import { closeCodewikiTask } from "../../src/roadmap/task.ts";

const boundedTask = {
	id: "TASK-900",
	title: "Validate graph cache refresh",
	status: "todo",
	priority: "high",
	kind: "testing",
	summary:
		"Add a smoke assertion for graph cache refresh after roadmap queue changes.",
	spec_paths: ["package.json"],
	code_paths: ["tests/smoke/alignment-graph.test.mjs"],
	labels: ["graph", "testing"],
	goal: {
		outcome: "Graph cache refresh has direct smoke coverage.",
		acceptance: [
			"A smoke test fails before the refresh fix and passes after it.",
		],
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

assert.equal(
	assessRoadmapTaskBoundary(boundedTask).executable,
	true,
	"bounded task should be executable",
);
assert.equal(
	assessRoadmapTaskBoundary(containerTask).container,
	true,
	"container wording should be rejected",
);
assert.throws(
	() => assertExecutableRoadmapTask(containerTask, "test mutation"),
	/self-contained executable work/,
);
assert.throws(
	() => assertExecutableRoadmapTask(sprintLabelTask, "test mutation"),
	/container label: sprint/,
);

const preflight = await runTaskClosePreflight(
	{ root: process.cwd() },
	{ ...containerTask, spec_paths: ["package.json"], code_paths: [] },
	{ checks_run: ["unit"] },
);
assert.equal(
	preflight.verdict,
	"fail",
	"container task should fail close preflight",
);
assert.ok(
	preflight.issues.some((issue) =>
		issue.summary.includes("self-contained executable work"),
	),
);

const repoRoot = process.cwd();
assert.equal(
	existsSync(resolve(repoRoot, "src/roadmap/runtime.ts")),
	false,
	"roadmap persistence should not keep the old runtime owner file",
);
assert.equal(
	existsSync(resolve(repoRoot, "src/roadmap/store.ts")),
	true,
	"roadmap persistence should use store naming",
);
const roadmapQueue = JSON.parse(
	readFileSync(resolve(repoRoot, ".codewiki/roadmap/queue.json"), "utf8"),
);
const activeRoadmapTasks = Object.values(roadmapQueue.tasks ?? {}).filter(
	(task) => !["done", "cancelled"].includes(task.status),
);
assert.equal(
	activeRoadmapTasks.some((task) =>
		JSON.stringify(task).includes("src/roadmap/runtime.ts"),
	),
	false,
	"active roadmap tasks should not reference the old roadmap runtime helper path",
);

const closeRoot = await mkdtemp(join(tmpdir(), "codewiki-close-route-"));
try {
	await mkdir(resolve(closeRoot, ".codewiki/roadmap"), { recursive: true });
	await writeFile(
		resolve(closeRoot, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 1,
				updated: "2026-06-02T00:00:00Z",
				order: ["TASK-999"],
				tasks: {
					"TASK-999": {
						id: "TASK-999",
						title: "Close route fixture",
						status: "in_progress",
						priority: "high",
						kind: "testing",
						summary: "Fixture for close routing.",
						spec_paths: [],
						code_paths: ["src/example.ts"],
						research_ids: [],
						labels: ["task-close"],
						change_type: "code",
						goal: {
							outcome: "Close only after production-ready gates pass.",
							acceptance: ["Close reports smallest safe retry loop."],
							non_goals: [],
							verification: ["task-close gate"],
						},
						delta: { desired: "", current: "", closure: "" },
						created: "2026-06-02",
						updated: "2026-06-02",
					},
				},
			},
			null,
			2,
		) + "\n",
		"utf8",
	);
	await assert.rejects(
		() =>
			closeCodewikiTask(
				{
					root: closeRoot,
					roadmapPath: ".codewiki/roadmap/queue.json",
					config: {},
				},
				"TASK-999",
				{
					fileStore: {},
					rebuildRunner: { run: async () => {} },
					messageBus: {},
				},
			),
		(error) => {
			assert.match(error.message, /next_loop=validation/);
			assert.match(error.message, /task-close validation/);
			assert.match(error.message, /ship-ready validation/);
			return true;
		},
		"roadmap close should report the smallest safe validation loop when production-ready evidence is missing",
	);
} finally {
	await rm(closeRoot, { recursive: true, force: true });
}

console.log("✓ roadmap task boundary smoke passed");
