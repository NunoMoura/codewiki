#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildGraph } from "../../src/application/graph.ts";
import { loadProject } from "../../src/application/project.ts";
import { writeImplementationBuild, writePlanningBuild, writeValidationReport } from "../../src/application/builds.ts";
import { executeCodewikiAudit } from "../../src/application/tools/audit.ts";

const matrix = JSON.parse(readFileSync("tests/fixtures/alignment-drift/matrix.json", "utf8"));
const caseIds = new Set(matrix.cases.map((entry) => entry.id));
for (const id of ["vertical-drift", "horizontal-drift", "stale-generated-output", "missing-accepted-build", "missing-audit-evidence", "invalid-publication-proof", "clean"]) {
	assert.ok(caseIds.has(id), `missing fixture matrix case ${id}`);
}

const baseProject = {
	root: "/tmp/codewiki-alignment-drift-matrix",
	label: "alignment-drift-matrix",
	config: { project_name: "alignment-drift-matrix", schema_version: 4, specs_root: ".codewiki/kb", generated_files: [".codewiki/index_graph.json"] },
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

const docs = [{ path: ".codewiki/kb/system/alignment.md", title: "Alignment", doc_type: "spec", links: [], code_paths: ["src/application/graph.ts"] }];
const decisionPath = ".codewiki/builds/decision/decision.json";
const decisionBuild = {
	path: decisionPath,
	kind: "decision_build",
	status: "accepted",
	data: {
		kind: "decision_build",
		status: "accepted",
		change_type: "system",
		traceability: { change_type: "system", semantic: true, requires_accepted_build: false },
		requirements: [{ id: "REQ-001", text: "Alignment proof exists", state: "accepted" }],
		diff_table: [{ id: "REQ-001", desired_state: "Alignment proof exists", user_action: "approved" }],
		approved_diff_rows: ["REQ-001"],
		knowledge_changes: [".codewiki/kb/system/alignment.md"],
		row_to_kb_mappings: [{ row_id: "REQ-001", knowledge_refs: [".codewiki/kb/system/alignment.md"], evidence: "Alignment doc captures requirement." }],
		propagation: { direction: "system-first", product_impact: ["User-visible alignment semantics change."] },
		produces: { knowledge: [".codewiki/kb/system/alignment.md"], roadmap: ["TASK-900"] },
	},
};
const planningPath = ".codewiki/builds/planning/planning.json";
const planningBuild = {
	path: planningPath,
	kind: "planning_build",
	status: "accepted",
	data: {
		kind: "planning_build",
		status: "accepted",
		source_decision_build: decisionPath,
		change_type: "task",
		traceability: { change_type: "task", semantic: true, requires_accepted_build: true, accepted_build_refs: [decisionPath] },
		task_ids: ["TASK-900"],
	},
};
const implementationPath = ".codewiki/builds/implementation/implementation.json";
const implementationBuild = {
	path: implementationPath,
	kind: "implementation_build",
	status: "accepted",
	data: {
		kind: "implementation_build",
		status: "accepted",
		change_type: "code",
		traceability: { change_type: "code", semantic: true, requires_accepted_build: true, accepted_build_refs: [planningPath] },
		task_id: "TASK-900",
		code_files: ["src/application/graph.ts"],
		requirements: [{ id: "PUB-001", text: "Publication proof exists", state: "accepted" }],
		publication: { safe_to_push: true },
	},
};

function graph(overrides = {}) {
	return buildGraph({
		project: baseProject,
		docs,
		research: [],
		roadmapEntries: [],
		builds: [],
		validations: [],
		testFiles: [],
		claims: { version: 1, claims: [] },
		gitCache: { getDirtyPaths: () => [] },
		...overrides,
	});
}

{
	const g = graph({ builds: [decisionBuild] });
	const row = g.views.traceability.rows.find((entry) => entry.requirement_id === "REQ-001");
	assert.ok(row?.gaps.includes("missing_planning_build"), "vertical drift fixture should expose missing planning build");
}

{
	const g = graph({ gitCache: { getDirtyPaths: () => ["src/application/graph.ts"] }, builds: [] });
	const row = g.views.traceability.semantic_change_gaps.find((entry) => entry.path === "src/application/graph.ts");
	assert.ok(row?.gaps.includes("missing_accepted_build_coverage"), "dirty semantic source should require accepted build coverage");
}

{
	const g = graph({ roadmapEntries: [{ id: "TASK-900", title: "Publish", status: "todo", priority: "high", kind: "testing", summary: "Publish proof", spec_paths: [], code_paths: ["src/application/graph.ts"], research_ids: [] }], builds: [decisionBuild, planningBuild, implementationBuild] });
	const row = g.views.traceability.rows.find((entry) => entry.requirement_id === "PUB-001");
	assert.ok(g.views.reconciliation.items.some((entry) => entry.id === `reconcile:publication-proof:${implementationPath}`), "publication proof fixture should expose missing content proof reconciliation");
}

function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2)); }
function writeText(path, value) { writeFileSync(path, value); }
function ensure(path) { mkdirSync(path, { recursive: true }); }
function assertIssue(report, kind) { assert.ok(report.issues.some((issue) => issue.kind === kind), `expected ${kind}, got ${report.issues.map((issue) => issue.kind).join(", ")}`); }

function createAuditFixture({ clean = false } = {}) {
	const root = mkdtempSync(resolve(tmpdir(), "codewiki-alignment-drift-fixture-"));
	ensure(resolve(root, ".codewiki", "kb", "system"));
	ensure(resolve(root, ".codewiki", "roadmap", "tasks", "TASK-001"));
	ensure(resolve(root, "src"));
	ensure(resolve(root, "scripts"));
	ensure(resolve(root, "skills", "codewiki"));
	writeJson(resolve(root, ".codewiki", "config.json"), { project_name: "alignment-drift-fixture" });
	writeText(resolve(root, ".codewiki", "kb", "system", "overview.md"), "---\nid: spec.system.overview\ntitle: Overview\nstate: active\nsummary: Fixture\nowners: [tests]\nupdated: \"2026-05-16\"\n---\n\n# Overview\n");
	const task = { id: "TASK-001", title: "Canonical task", status: "todo", priority: "high", kind: "testing", summary: "Canonical task summary", spec_paths: [], code_paths: [] };
	writeJson(resolve(root, ".codewiki", "roadmap", "queue.json"), { version: 1, order: ["TASK-001"], tasks: { "TASK-001": task } });
	writeJson(resolve(root, ".codewiki", "roadmap", "tasks", "TASK-001", "task.json"), clean ? task : { ...task, title: "Stale generated task" });
	writeJson(resolve(root, ".codewiki", "roadmap", "tasks", "TASK-001", "context.json"), clean ? { version: 1, task } : { version: 1, task: { ...task, summary: "Stale context summary" } });
	writeJson(resolve(root, ".codewiki", "index_graph.json"), { version: 1, generated_at: new Date().toISOString(), lenses: { status: { health: { errors: 0, warnings: 0 } } } });
	writeText(resolve(root, "README.md"), clean ? "Clean fixture.\n" : "This stale fixture points at extensions/codewiki/src and says .codewiki/ stores package source. Generated task views are canonical truth.\n");
	writeText(resolve(root, "src", "index.ts"), "export const ok = true;\n");
	writeText(resolve(root, "scripts", "check-architecture.mjs"), "import { executeCodewikiAudit } from '../src/application/tools/audit.ts';\nvoid executeCodewikiAudit;\n");
	writeText(resolve(root, "skills", "codewiki", "SKILL.md"), "---\nname: codewiki\ndescription: fixture\n---\n# Skill\n");
	writeJson(resolve(root, "package.json"), { name: "alignment-drift-fixture", version: "0.0.0", type: "module", files: ["src", "skills", "scripts", "README.md", "package.json"], pi: { extensions: ["./src/index.ts"], skills: ["./skills"] }, scripts: { "check:architecture": "node ./scripts/check-architecture.mjs" } });
	return root;
}

{
	const root = createAuditFixture();
	try {
		const project = await loadProject(root);
		const staleReference = await executeCodewikiAudit(project, { profiles: ["stale-reference"], include_fingerprints: false });
		assertIssue(staleReference, "stale-reference");
		const parity = await executeCodewikiAudit(project, { profiles: ["generated-parity"], include_fingerprints: false });
		assertIssue(parity, "roadmap-task-view-mismatch");
	} finally { rmSync(root, { recursive: true, force: true }); }
}

{
	const root = createAuditFixture({ clean: true });
	try {
		const project = await loadProject(root);
		const fileStructure = await executeCodewikiAudit(project, { profiles: ["file-structure"], include_fingerprints: false });
		assert.notEqual(fileStructure.status, "fail", "clean fixture should avoid failing file-structure audit path");
	} finally { rmSync(root, { recursive: true, force: true }); }
}

{
	const root = await mkdtemp(join(tmpdir(), "codewiki-alignment-drift-validation-"));
	try {
		const project = { ...baseProject, root, configPath: ".codewiki/config.json" };
		const planning = await writePlanningBuild(project, { kind: "planning", summary: "Plan", source_decision_build: ".codewiki/builds/decision/decision.json", task_ids: ["TASK-900"], task_changes: ["Plan"], tdd_plan: ["Test"], candidate_test_files: ["tests/smoke/alignment-drift-fixtures.test.mjs"], candidate_code_paths: ["src/application/graph.ts"] });
		const implementation = await writeImplementationBuild(project, { kind: "implementation", summary: "Implement", source_planning_build: planning.path, task_id: "TASK-900", test_files: ["tests/smoke/alignment-drift-fixtures.test.mjs"], code_files: ["src/application/graph.ts"], checks_run: ["node tests/smoke/alignment-drift-fixtures.test.mjs"], acceptance_mapping: [{ criterion: "fixture", evidence: "test" }], closure_brief: { user_intent: "test", implemented_changes: ["fixture"], acceptance_evidence: ["test"], checks: ["node tests/smoke/alignment-drift-fixtures.test.mjs"] } });
		const blocked = await writeValidationReport(project, { profile: "implementation", task_id: "TASK-900", verdict: "pass", rationale: "Missing audits", source: implementation.path, isolation: { role: "validator", fresh_context: true, clean: true, validated_sha: "abc123" } });
		assert.equal(blocked.data.verdict, "block");
		assert.ok(blocked.data.failed_criteria.includes("audit_evidence"), "missing audit evidence fixture should block validation");
	} finally { await rmSync(root, { recursive: true, force: true }); }
}

console.log("✓ alignment drift fixture matrix passed");
