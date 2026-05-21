#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildGraph } from "../../src/application/graph.ts";
import { buildLintReport } from "../../src/application/lint.ts";
import { parseDoc } from "../../src/application/knowledge/doc-parser.ts";
import { executeCodewikiAudit } from "../../src/application/tools/audit.ts";

function mkdir(path) {
	mkdirSync(path, { recursive: true });
}

function write(path, content) {
	mkdir(resolve(path, ".."));
	writeFileSync(path, content);
}

function writeJson(path, value) {
	write(path, JSON.stringify(value, null, 2));
}

function createProject(root, mode = "warn") {
	return {
		root,
		label: "diagram-ref-fixture",
		config: {
			project_name: "diagram-ref-fixture",
			schema_version: 4,
			codewiki: { system_diagrams: { diagram_refs: { mode } } },
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

function baseDiagram(extra = "") {
	return `schema_version: 1
id: fixture-map
title: Fixture Map
kind: component_map
purpose: Exercise diagram refs.
source_docs:
  - .codewiki/kb/system/runtime.md
actors:
  - id: user
    label: User
external_systems:
  - id: github
    label: GitHub
components:
  - id: app
    label: Application
    requires_doc: true
adapters:
  - id: pi
    label: Pi Adapter
entities:
  - id: task
    label: Task
states:
  - id: active
    label: Active
policies:
  - id: validation
    label: Validation Policy
artifacts:
  - id: build
    label: Build Artifact
flows:
  - id: handoff
    from: user
    to: app
    label: Handoff Flow
relationships:
  - from: app
    to: pi
    label: Uses
${extra}`;
}

function writeFixture(root, options = {}) {
	mkdir(resolve(root, ".codewiki", "kb", "system", "diagrams"));
	mkdir(resolve(root, "src", "domain"));
	mkdir(resolve(root, "src", "adapters", "pi"));
	mkdir(resolve(root, "scripts"));
	writeJson(resolve(root, ".codewiki", "config.json"), { project_name: "diagram-ref-fixture", codewiki: { system_diagrams: { diagram_refs: { mode: options.mode || "warn" } } } });
	writeJson(resolve(root, ".codewiki", "roadmap", "queue.json"), { version: 1, order: [], tasks: {} });
	write(resolve(root, "src", "domain", "shared", "types.ts"), `export const ROADMAP_STATUS_VALUES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;\n`);
	write(resolve(root, "src", "adapters", "pi", "schemas.ts"), "export const schemas = {};\n");
	write(resolve(root, "src", "adapters", "pi", "index.ts"), "export const pi = {};\n");
	write(resolve(root, "scripts", "check-architecture.mjs"), "import { executeCodewikiAudit } from '../src/application/tools/audit.ts';\nvoid executeCodewikiAudit;\n");
	write(resolve(root, ".codewiki", "kb", "system", "overview.md"), `---
id: spec.system.overview
title: Overview
state: active
summary: Fixture
owners: [tests]
updated: "2026-05-20"
---
# Overview
`);
	write(resolve(root, ".codewiki", "kb", "system", "runtime.md"), `---
id: spec.system.runtime
title: Runtime
state: active
summary: Runtime fixture
owners: [tests]
updated: "2026-05-20"
diagram_refs:
  - fixture-map:app
  - fixture-map:pi
  - fixture-map:task
  - fixture-map:active
  - fixture-map:validation
  - fixture-map:build
  - fixture-map:user
  - fixture-map:github
  - fixture-map:handoff
---
# Runtime
`);
	write(resolve(root, ".codewiki", "kb", "system", "diagrams", "component-map.yaml"), baseDiagram(options.diagramExtra || ""));
}

function readDocs(root, project) {
	return [
		parseDoc(root, project, resolve(root, ".codewiki", "kb", "system", "overview.md")),
		parseDoc(root, project, resolve(root, ".codewiki", "kb", "system", "runtime.md")),
	];
}

const root = mkdtempSync(resolve(tmpdir(), "codewiki-diagram-refs-"));
try {
	writeFixture(root);
	const project = createProject(root, "warn");
	const docs = readDocs(root, project);
	const lint = buildLintReport(root, project, docs, [], [], {});
	assert.equal(lint.issues.filter((issue) => issue.kind.startsWith("diagram") || issue.kind.startsWith("system-doc")).length, 0, "valid diagram refs should not lint");

	const graph = buildGraph({
		project,
		docs,
		research: [],
		roadmapEntries: [],
		roadmapSprints: [],
		archivedTaskIds: [],
		gitCache: { getDirtyPaths: () => [] },
		builds: [],
		validations: [],
		testFiles: [],
		claims: { version: 1, claims: [] },
		lintReport: { issues: [], counts: {}, status: "green" },
	});
	for (const category of ["component", "adapter", "flow", "domain_entity", "lifecycle", "policy", "artifact", "actor", "external_system"]) {
		assert.ok(graph.views.system_diagrams.by_category[category]?.length > 0, `missing category ${category}`);
	}
	assert.ok(graph.nodes.some((node) => node.id === "diagram_ref:component-map:app" && node.kind === "system_diagram_ref" && node.requires_doc === true), "requires_doc diagram node should be first-class graph node");
	assert.ok(graph.edges.some((edge) => edge.kind === "doc_diagram_ref" && edge.to === "diagram_ref:component-map:app"), "doc should link to diagram ref");
	assert.deepEqual(graph.views.system_diagrams.docs_by_ref["component-map:app"], [".codewiki/kb/system/runtime.md"]);

	write(resolve(root, ".codewiki", "kb", "system", "runtime.md"), `---
id: spec.system.runtime
title: Runtime
state: active
summary: Runtime fixture
owners: [tests]
updated: "2026-05-20"
diagram_refs:
  - fixture-map:missing
---
# Runtime
`);
	const missingDocs = readDocs(root, project);
	const missingLint = buildLintReport(root, project, missingDocs, [], [], {});
	assert.ok(missingLint.issues.some((issue) => issue.kind === "diagram-ref-target-missing" && issue.severity === "warning"), "migration warn mode should warn for missing targets");

	write(resolve(root, ".codewiki", "kb", "system", "runtime.md"), `---
id: spec.system.runtime
title: Runtime
state: active
summary: Runtime fixture
owners: [tests]
updated: "2026-05-20"
---
# Runtime
`);
	const noRefDocs = readDocs(root, project);
	const noRefLint = buildLintReport(root, project, noRefDocs, [], [], {});
	assert.ok(noRefLint.issues.some((issue) => issue.kind === "system-doc-missing-diagram-refs" && issue.severity === "warning"), "migration warn mode should warn before hard enforcement");

	write(resolve(root, ".codewiki", "kb", "system", "runtime.md"), `---
id: spec.system.runtime
title: Runtime
state: active
summary: Runtime fixture
owners: [tests]
updated: "2026-05-20"
diagram_refs:
  - fixture-map:pi
---
# Runtime
`);
	const orphanDocs = readDocs(root, project);
	const orphanLint = buildLintReport(root, project, orphanDocs, [], [], {});
	assert.ok(orphanLint.issues.some((issue) => issue.kind === "diagram-node-missing-required-doc" && issue.severity === "warning"), "requires_doc node without owning doc should warn in migration mode");

	const hardProject = createProject(root, "error");
	const hardLint = buildLintReport(root, hardProject, orphanDocs, [], [], {});
	assert.ok(hardLint.issues.some((issue) => issue.kind === "diagram-node-missing-required-doc" && issue.severity === "error"), "hard enforcement should report errors");

	const audit = await executeCodewikiAudit(project, { profiles: ["file-structure"], include_fingerprints: false });
	assert.equal(audit.status, "warning");
	assert.ok(audit.issues.some((issue) => issue.kind === "diagram-node-missing-required-doc"), "file-structure audit should include diagram-ref audit issues");
} finally {
	rmSync(root, { recursive: true, force: true });
}

console.log("✓ diagram refs smoke passed");
