import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRoadmapTasks } from "../../../src/roadmap/store.ts";

function projectFixture(root) {
	return {
		root,
		label: "task-112-fixture",
		config: { project_name: "task-112-fixture", schema_version: 4 },
		docsRoot: ".codewiki/kb",
		specsRoot: ".codewiki/kb",
		evidenceRoot: ".codewiki/evidence",
		researchRoot: ".codewiki/research",
		indexPath: ".codewiki/index.md",
		roadmapPath: ".codewiki/roadmap/queue.json",
		roadmapDocPath: ".codewiki/roadmap.md",
		roadmapEventsPath: "",
		metaRoot: ".codewiki",
		viewsRoot: ".codewiki/views",
		graphPath: ".codewiki/index_graph.json",
		lintPath: ".codewiki/index_graph.json",
		roadmapStatePath: ".codewiki/index_graph.json",
		statusStatePath: ".codewiki/index_graph.json",
		eventsPath: "",
		configPath: ".codewiki/config.json",
	};
}

async function readRoadmap(root) {
	return JSON.parse(await readFile(join(root, ".codewiki/roadmap/queue.json"), "utf8"));
}

const root = await mkdtemp(join(tmpdir(), "codewiki-task-112-"));
const project = projectFixture(root);

try {
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 1,
				updated: "2026-06-07",
				order: ["TASK-001"],
				tasks: {
					"TASK-001": {
						id: "TASK-001",
						title: "Implement shared planning checks",
						status: "todo",
						priority: "high",
						kind: "architecture",
						summary: "Existing work owns one planning requirement.",
						spec_paths: [".codewiki/kb/system/roadmap.md"],
						code_paths: ["src/roadmap/tool.ts"],
						research_ids: [],
						labels: ["DPA-REQ-005", "task-boundary"],
						change_type: "system",
						goal: {
							outcome: "Roadmap reuse requires matching requirement and outcome.",
							acceptance: ["Unsafe reuse is rejected."],
							non_goals: [],
							verification: ["targeted test"],
						},
						delta: {
							desired: "DPA-REQ-005 roadmap reuse is safe.",
							current: "Reuse can merge by shared labels.",
							closure: "Tests cover safe and unsafe reuse.",
						},
						created: "2026-06-07",
						updated: "2026-06-07",
					},
				},
				sprints: {},
			},
			null,
			2,
		),
	);

	const unsafe = await appendRoadmapTasks(
		null,
		project,
		null,
		[
			{
				title: "Implement unrelated planning coverage",
				priority: "high",
				kind: "architecture",
				summary: "Shares paths and labels but owns a different accepted outcome.",
				spec_paths: [".codewiki/kb/system/roadmap.md"],
				code_paths: ["src/roadmap/tool.ts"],
				labels: ["DPA-REQ-003", "task-boundary"],
				change_type: "system",
				goal: {
					outcome: "Planning builds reject prose-only coverage.",
					acceptance: ["Prose-only planning coverage fails."],
					verification: ["targeted test"],
				},
				delta: {
					desired: "DPA-REQ-003 planning coverage is structured.",
				},
			},
		],
		{ refresh: false },
	);
	assert.equal(unsafe.reused.length, 0);
	assert.equal(unsafe.created.length, 1);
	assert.equal(unsafe.created[0].id, "TASK-002");
	let roadmap = await readRoadmap(root);
	assert.equal(roadmap.tasks["TASK-001"].labels.includes("DPA-REQ-003"), false);

	const safe = await appendRoadmapTasks(
		null,
		project,
		null,
		[
			{
				title: "Harden roadmap task reuse",
				priority: "high",
				kind: "architecture",
				summary: "Same requirement and same desired outcome should refine.",
				spec_paths: [".codewiki/kb/system/roadmap.md"],
				code_paths: ["src/roadmap/tool.ts"],
				labels: ["DPA-REQ-005", "task-boundary"],
				change_type: "system",
				goal: {
					outcome: "Roadmap reuse requires matching requirement and outcome.",
					acceptance: ["Safe matching reuse refines existing task."],
					verification: ["targeted test"],
				},
				delta: {
					desired: "DPA-REQ-005 roadmap reuse is safe.",
				},
			},
		],
		{ refresh: false },
	);
	assert.equal(safe.reused.length, 1);
	assert.equal(safe.reused[0].id, "TASK-001");
	assert.equal(safe.created.length, 0);
	roadmap = await readRoadmap(root);
	assert.ok(
		roadmap.tasks["TASK-001"].goal.acceptance.includes(
			"Safe matching reuse refines existing task.",
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
