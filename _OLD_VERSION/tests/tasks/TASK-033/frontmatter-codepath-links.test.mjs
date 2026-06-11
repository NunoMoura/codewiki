#!/usr/bin/env node
import "../../setup-env.mjs";
import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import yaml from "js-yaml";
import { buildGraph } from "../../../src/state/graph.ts";
import { buildLintReport } from "../../../src/state/lint.ts";
import { parseDoc } from "../../../src/knowledge/doc-parser.ts";

function mkdir(path) {
	mkdirSync(path, { recursive: true });
}

function write(path, content) {
	mkdir(dirname(path));
	writeFileSync(path, content);
}

function createProject(root) {
	return {
		root,
		label: "task-033-fixture",
		config: {
			project_name: "task-033-fixture",
			schema_version: 4,
			codewiki: { system_diagrams: { diagram_refs: { mode: "warn" } } },
		},
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
	};
}

function baseDoc(id, title, frontmatter, body = "") {
	return `---\nid: ${id}\ntitle: ${title}\nstate: active\nsummary: ${title} fixture.\nowners:\n  - tests\nupdated: "2026-05-28"\n${frontmatter}---\n\n# ${title}\n\n${body}\n\n## Related docs\n\n- [Diagram](diagram-owned.md)\n`;
}

function walkMarkdown(root) {
	const out = [];
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const path = resolve(dir, name);
			if (statSync(path).isDirectory()) walk(path);
			else if (path.endsWith(".md")) out.push(path);
		}
	};
	walk(root);
	return out.sort();
}

const tempRoot = mkdtempSync(resolve(tmpdir(), "codewiki-task-033-"));
try {
	const project = createProject(tempRoot);
	write(
		resolve(tempRoot, "src/diagram-owned.ts"),
		"export const diagramOwned = true;\n",
	);
	write(
		resolve(tempRoot, "src/body-owned.ts"),
		"export const bodyOwned = true;\n",
	);
	write(
		resolve(tempRoot, "src/task-owned.ts"),
		"export const taskOwned = true;\n",
	);
	write(
		resolve(tempRoot, "src/build-owned.ts"),
		"export const buildOwned = true;\n",
	);
	write(
		resolve(tempRoot, "src/explicit-override.ts"),
		"export const explicitOverride = true;\n",
	);
	write(
		resolve(tempRoot, ".codewiki/config.json"),
		JSON.stringify(project.config, null, 2),
	);
	write(
		resolve(tempRoot, ".codewiki/roadmap/queue.json"),
		JSON.stringify({ version: 1, order: [], tasks: {} }, null, 2),
	);
	write(
		resolve(tempRoot, ".codewiki/kb/system/diagrams/component-map.yaml"),
		`schema_version: 1\nid: fixture-map\ntitle: Fixture Map\nkind: component_map\npurpose: Derive doc-code links from diagram paths.\nsource_docs:\n  - .codewiki/kb/system/diagram-owned.md\ncomponents:\n  - id: diagram_component\n    label: Diagram Component\n    source: .codewiki/kb/system/diagram-owned.md\n    paths:\n      - src/diagram-owned.ts\n`,
	);
	write(
		resolve(tempRoot, ".codewiki/kb/system/diagram-owned.md"),
		baseDoc(
			"spec.system.diagram-owned",
			"Diagram Owned",
			"diagram_refs:\n  - fixture-map:diagram_component\n",
			"Diagram refs, not frontmatter code_paths, own this mapping.",
		),
	);
	write(
		resolve(tempRoot, ".codewiki/kb/system/body-owned.md"),
		baseDoc(
			"spec.system.body-owned",
			"Body Owned",
			"",
			"The source fact `src/body-owned.ts` is enough for graph-derived doc-code linking.",
		),
	);
	write(
		resolve(tempRoot, ".codewiki/kb/system/task-owned.md"),
		baseDoc(
			"spec.system.task-owned",
			"Task Owned",
			"",
			"Roadmap tasks may derive doc-code scope without doc frontmatter code_paths.",
		),
	);
	write(
		resolve(tempRoot, ".codewiki/kb/system/build-owned.md"),
		baseDoc(
			"spec.system.build-owned",
			"Build Owned",
			"",
			"Implementation builds may derive doc-code scope without doc frontmatter code_paths.",
		),
	);
	write(
		resolve(tempRoot, ".codewiki/kb/system/explicit.md"),
		baseDoc(
			"spec.system.explicit",
			"Explicit",
			"code_paths:\n  - src/explicit-override.ts\ncode_paths_mode: explicit_override\n",
			"This precise override remains allowed.",
		),
	);

	const docs = walkMarkdown(resolve(tempRoot, ".codewiki/kb/system"))
		.filter((path) => !path.includes("/diagrams/"))
		.map((path) => parseDoc(tempRoot, project, path));
	const roadmapEntries = [
		{
			id: "TASK-900",
			title: "Derive task doc-code links",
			status: "todo",
			priority: "high",
			kind: "test",
			summary: "Roadmap task derives doc-code scope.",
			spec_paths: [".codewiki/kb/system/task-owned.md"],
			code_paths: ["src/task-owned.ts"],
			research_ids: [],
			labels: [],
			change_type: "system",
			goal: {
				outcome: "Task derives doc-code link.",
				acceptance: ["Graph links task spec docs to task code paths."],
				non_goals: [],
				verification: [
					"node --experimental-strip-types ./tests/tasks/TASK-033/frontmatter-codepath-links.test.mjs",
				],
			},
			created: "2026-05-28",
			updated: "2026-05-28",
		},
	];
	const builds = [
		{
			path: ".codewiki/builds/implementation/fixture-task-033.json",
			kind: "implementation_build",
			taskId: "TASK-901",
			status: "accepted",
			data: {
				lifecycle: { state: "accepted" },
				produces: {
					knowledge: [".codewiki/kb/system/build-owned.md"],
					code: ["src/build-owned.ts"],
				},
				code_files: ["src/build-owned.ts"],
			},
		},
	];

	const lint = buildLintReport(tempRoot, project, docs, roadmapEntries, [], {});
	assert.equal(
		lint.issues.find(
			(issue) =>
				issue.kind === "unscoped-doc" &&
				[
					".codewiki/kb/system/diagram-owned.md",
					".codewiki/kb/system/body-owned.md",
				].includes(issue.path),
		),
		undefined,
		"docs without routine frontmatter code_paths should stay scoped through diagram refs or source facts",
	);
	assert.equal(
		lint.issues.find(
			(issue) =>
				issue.kind === "frontmatter-code-paths-deprecated" &&
				issue.path === ".codewiki/kb/system/explicit.md",
		),
		undefined,
		"explicit override code_paths should be allowed when marked",
	);

	const graph = buildGraph({
		project,
		docs,
		research: [],
		roadmapEntries,
		roadmapSprints: [],
		archivedTaskIds: [],
		gitCache: { getDirtyPaths: () => [] },
		builds,
		validations: [],
		testFiles: [],
		claims: { version: 1, claims: [] },
		lintReport: { issues: [], counts: {}, status: "green" },
	});
	const edge = (from, to, source) =>
		graph.edges.find(
			(item) =>
				item.kind === "doc_code_path" &&
				item.from === `doc:${from}` &&
				item.to === `code:${to}` &&
				item.link_source === source,
		);
	assert.ok(
		edge(
			".codewiki/kb/system/diagram-owned.md",
			"src/diagram-owned.ts",
			"diagram_ref",
		),
		"diagram_refs should derive doc-code links",
	);
	assert.ok(
		edge(
			".codewiki/kb/system/body-owned.md",
			"src/body-owned.ts",
			"source_fact",
		),
		"body source facts should derive doc-code links",
	);
	assert.ok(
		edge(
			".codewiki/kb/system/task-owned.md",
			"src/task-owned.ts",
			"roadmap_task",
		),
		"roadmap task spec/code paths should derive doc-code links",
	);
	assert.ok(
		edge(
			".codewiki/kb/system/build-owned.md",
			"src/build-owned.ts",
			"build_evidence",
		),
		"implementation build evidence should derive doc-code links",
	);
	assert.ok(
		edge(
			".codewiki/kb/system/explicit.md",
			"src/explicit-override.ts",
			"frontmatter_override",
		),
		"marked explicit overrides should remain graph links",
	);

	for (const rel of [
		".codewiki/kb/system/file-structure.md",
		".codewiki/kb/system/knowledge.md",
	]) {
		const text = readFileSync(resolve(process.cwd(), rel), "utf8");
		const frontmatter = text.slice(4, text.indexOf("\n---\n", 4));
		assert.equal(
			yaml.load(frontmatter)?.code_paths,
			undefined,
			`${rel} should not retain routine frontmatter code_paths`,
		);
	}
	for (const rel of walkMarkdown(resolve(process.cwd(), ".codewiki/kb"))) {
		const text = readFileSync(rel, "utf8");
		if (!text.startsWith("---\n")) continue;
		const frontmatter =
			yaml.load(text.slice(4, text.indexOf("\n---\n", 4))) || {};
		if (frontmatter.code_paths) {
			assert.equal(
				frontmatter.code_paths_mode,
				"explicit_override",
				`${rel} frontmatter code_paths must be marked explicit_override`,
			);
		}
	}
} finally {
	rmSync(tempRoot, { recursive: true, force: true });
}

console.log("✓ TASK-033 frontmatter code-path links passed");
