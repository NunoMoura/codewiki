import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { executeCodewikiAudit } from "../../../src/audit/tool.ts";

function projectFixture(root) {
	return {
		root,
		label: "task-113-fixture",
		config: { project_name: "task-113-fixture", schema_version: 4 },
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

async function writeFixture(root, queueTasks) {
	await mkdir(resolve(root, ".codewiki/kb/system/diagrams"), { recursive: true });
	await mkdir(resolve(root, ".codewiki/roadmap"), { recursive: true });
	await mkdir(resolve(root, "src/roadmap"), { recursive: true });
	await mkdir(resolve(root, "scripts"), { recursive: true });
	await writeFile(
		resolve(root, ".codewiki/kb/system/file-structure.md"),
		"---\nid: spec.system.file-structure\ntitle: File Structure\nstate: active\ndiagram_refs:\n  - file-structure-map:concept_root_target\n---\n\n# File Structure\n",
	);
	await writeFile(
		resolve(root, ".codewiki/kb/system/diagrams/file-structure-map.yaml"),
		`schema_version: 1
id: spec.system.diagrams.file-structure-map
title: Fixture File Structure Map
kind: file_structure_map
purpose: Fixture accepted target map.
source_docs:
  - .codewiki/kb/system/file-structure.md
groups:
  - id: source_target
    label: Source target
nodes:
  - id: concept_root_target
    label: Loop-first source target
    group: source_target
    kind: policy
    source: .codewiki/kb/system/file-structure.md
    requires_doc: true
    status: accepted_target
    paths:
      - src/planning/**
`,
	);
	await writeFile(
		resolve(root, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 1,
				updated: "2026-06-07",
				order: Object.keys(queueTasks),
				tasks: queueTasks,
				sprints: {},
			},
			null,
			2,
		),
	);
	await writeFile(
		resolve(root, "src/roadmap/types.ts"),
		'export const ROADMAP_STATUS_VALUES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;\n',
	);
	await writeFile(
		resolve(root, "scripts/check-architecture.mjs"),
		'import { executeCodewikiAudit } from "../src/audit/tool.ts";\nvoid executeCodewikiAudit;\n',
	);
}

async function runFixture(queueTasks) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-task-113-"));
	try {
		await writeFixture(root, queueTasks);
		return await executeCodewikiAudit(projectFixture(root), {
			profiles: ["file-structure"],
			include_fingerprints: false,
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

const uncovered = await runFixture({});
assert.equal(uncovered.status, "warning");
assert.ok(
	uncovered.issues.some(
		(issue) =>
			issue.kind === "accepted-target-gap-uncovered" &&
			issue.path === "src/planning/**",
	),
	JSON.stringify(uncovered.issues, null, 2),
);

const covered = await runFixture({
	"TASK-001": {
		id: "TASK-001",
		title: "Migrate planning root",
		status: "todo",
		priority: "medium",
		kind: "migration",
		summary: "Active roadmap ownership for src/planning target root.",
		spec_paths: [".codewiki/kb/system/file-structure.md"],
		code_paths: ["src/planning/**"],
		research_ids: [],
		labels: ["source-structure-refactor"],
		goal: {
			outcome: "Planning root target has roadmap coverage.",
			acceptance: ["coverage exists"],
			non_goals: [],
			verification: ["audit"],
		},
		delta: {},
	},
});
assert.equal(
	covered.issues.some((issue) => issue.kind === "accepted-target-gap-uncovered"),
	false,
	JSON.stringify(covered.issues, null, 2),
);
