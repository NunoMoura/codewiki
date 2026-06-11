import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseDoc } from "../../src/knowledge/doc-parser.ts";
import { buildGraph } from "../../src/state/graph.ts";
import { buildLintReport } from "../../src/state/lint.ts";
import {
	buildRoadmapState,
	buildStatusState,
	generatedStatePaths,
	laneRevisionAnchor,
} from "../../src/state/builders.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-drift-propagation-"));
const claims = { version: 1, claims: [] };
const fakeGitCache = {
	getDirtyPaths: () => [],
	buildAnchor: (paths) => ({
		head: "test-head",
		dirty: false,
		dirty_paths: [],
		paths: Object.fromEntries(paths.map((path) => [path, `oid:${path}`])),
	}),
};

function projectWithLint(wordCountWarn) {
	return {
		root,
		label: "drift-propagation-smoke",
		config: {
			project_name: "drift-propagation-smoke",
			schema_version: 4,
			specs_root: ".codewiki/kb",
			generated_files: [".codewiki/index_graph.json"],
			lint: { word_count_warn: wordCountWarn },
			codewiki: { gateway: { generated_readonly_paths: [".codewiki/index_graph.json"] } },
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

try {
	await mkdir(join(root, ".codewiki/kb/system"), { recursive: true });
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "src/a.ts"), "export const a = 1;\n");
	await writeFile(join(root, ".codewiki/index_graph.json"), "{\"generated_at\":\"one\"}\n");
	await writeFile(join(root, ".codewiki/kb/system/drift.md"), `---
id: test.drift
title: Drift
state: active
summary: Drift smoke doc.
owners: [test]
updated: "2026-05-12"
code_paths:
  - src/a.ts
  - .codewiki/index_graph.json
---
# Drift

${Array.from({ length: 1105 }, (_, i) => `word${i}`).join(" ")}

## Related docs
`);
	await writeFile(join(root, ".codewiki/kb/system/actionable.md"), `---
id: test.actionable
title: Actionable Drift
state: active
summary: Actionable drift smoke doc.
owners: [test]
updated: "2026-05-12"
code_paths:
  - src/missing.ts
---
# Actionable Drift

This doc points to missing mapped code.

## Related docs
`);

	const highProject = projectWithLint(1600);
	const lowProject = projectWithLint(1000);
	const doc = parseDoc(root, lowProject, resolve(root, ".codewiki/kb/system/drift.md"));
	const actionableDoc = parseDoc(root, lowProject, resolve(root, ".codewiki/kb/system/actionable.md"));

	const highLint = buildLintReport(root, highProject, [doc], [], []);
	assert.equal(highLint.counts["large-doc"] || 0, 0, "Configured lint threshold should suppress false large-doc drift");

	const lowLint = buildLintReport(root, lowProject, [doc], [], []);
	assert.equal(lowLint.counts["large-doc"], 1, "Lower lint threshold should create deterministic drift");

	const dirtyGitCache = {
		...fakeGitCache,
		getDirtyPaths: () => ["src/a.ts", ".codewiki/index_graph.json"],
	};
	const coveredTask = { id: "TASK-001", title: "Cover code drift", status: "todo", priority: "high", kind: "testing", summary: "Covers dirty source.", spec_paths: [], code_paths: ["src/a.ts"], research_ids: [] };
	const dirtyGraph = buildGraph({
		project: highProject,
		docs: [doc],
		research: [],
		roadmapEntries: [coveredTask],
		roadmapSprints: [],
		gitCache: dirtyGitCache,
		builds: [],
		validations: [],
		testFiles: [],
		claims,
		lintReport: highLint,
	});
	assert.ok(!dirtyGraph.views.code.dirty_paths.includes(".codewiki/index_graph.json"), "Generated graph should not be treated as code drift");
	assert.ok(!dirtyGraph.views.reconciliation.items.some((item) => item.id === "reconcile:code:src/a.ts"), "Open task code scope should cover dirty source drift");
	assert.ok(dirtyGraph.views.reconciliation.items.some((item) => item.id === "reconcile:task:TASK-001"), "Open task remains implementation delta");

	const implementationBuildPath = ".codewiki/builds/implementation/impl.json";
	const validatedDirtyGraph = buildGraph({
		project: highProject,
		docs: [doc],
		research: [],
		roadmapEntries: [],
		roadmapSprints: [],
		gitCache: dirtyGitCache,
		builds: [{ path: implementationBuildPath, kind: "implementation_build", taskId: "TASK-001", status: "accepted", data: { kind: "implementation_build", task_id: "TASK-001", lifecycle: { state: "accepted" }, produces: { code: ["src/a.ts"] }, code_files: ["src/a.ts"], closure_brief: { user_intent: "X", implemented_changes: ["Y"], acceptance_evidence: ["Z"], checks: ["npm test"] } } }],
		validations: [{ path: ".codewiki/validation/impl-pass.json", taskId: "TASK-001", verdict: "pass", data: { profile: "implementation", verdict: "pass", source: implementationBuildPath } }],
		testFiles: [],
		claims,
		lintReport: highLint,
	});
	assert.ok(!validatedDirtyGraph.views.reconciliation.items.some((item) => item.id === "reconcile:code:src/a.ts"), "Validated implementation build should cover its dirty source until publication/commit");

	const actionableLint = buildLintReport(root, lowProject, [actionableDoc], [], []);
	assert.equal(actionableLint.counts["missing-code-path"], 1, "Missing mapped code should remain actionable drift");
	const graph = buildGraph({
		project: lowProject,
		docs: [actionableDoc],
		research: [],
		roadmapEntries: [],
		roadmapSprints: [],
		gitCache: fakeGitCache,
		builds: [],
		validations: [],
		testFiles: [],
		claims,
		lintReport: actionableLint,
	});
	const items = graph.views?.reconciliation?.items || [];
	assert.ok(
		items.some((item) => item.source_id === "lint:missing-code-path:.codewiki/kb/system/actionable.md" && item.next_loop === "decision"),
		"Uncovered actionable lint drift should enter graph reconciliation",
	);
	assert.equal(graph.views.reconciliation.next_action.loop, "decision");

	const roadmapState = buildRoadmapState(lowProject, [], graph, actionableLint, [], []);
	const status = buildStatusState(lowProject, root, fakeGitCache, [actionableDoc], graph, [], actionableLint, roadmapState, [], {}, claims);
	assert.equal(status.next_step.kind, "reconciliation:decision", "Status next action should come from graph reconciliation");

	const row = {
		path: doc.path,
		revision: { digest: "doc-v1" },
		code_paths: doc.code_paths,
	};
	const generatedPaths = generatedStatePaths(lowProject);
	const anchorOne = laneRevisionAnchor(root, fakeGitCache, [doc.path], doc.code_paths, [], { [doc.path]: row }, [], lowProject.roadmapPath, generatedPaths);
	await writeFile(join(root, ".codewiki/index_graph.json"), "{\"generated_at\":\"two\"}\n");
	const anchorTwo = laneRevisionAnchor(root, fakeGitCache, [doc.path], doc.code_paths, [], { [doc.path]: row }, [], lowProject.roadmapPath, generatedPaths);
	assert.equal(anchorTwo.code_digest, anchorOne.code_digest, "Generated graph changes must not stale freshness anchors");

	await writeFile(join(root, "src/a.ts"), "export const a = 2;\n");
	const anchorThree = laneRevisionAnchor(root, fakeGitCache, [doc.path], doc.code_paths, [], { [doc.path]: row }, [], lowProject.roadmapPath, generatedPaths);
	assert.notEqual(anchorThree.code_digest, anchorOne.code_digest, "Source code changes should stale freshness anchors");
} finally {
	await rm(root, { recursive: true, force: true });
}
