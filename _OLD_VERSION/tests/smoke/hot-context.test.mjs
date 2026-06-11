import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph } from "../../src/state/graph.ts";
import { readCodewikiState } from "../../src/state/reader.ts";
import { loadProject } from "../../src/project/context.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-hot-context-"));
const buildPath = ".codewiki/builds/implementation/2026-05-12-task-999.json";
const validationPath = ".codewiki/validation/2026-05-12-task-close-pass-task-999.json";

try {
	await mkdir(join(root, ".codewiki"), { recursive: true });
	await writeFile(join(root, ".codewiki/config.json"), JSON.stringify({
		project_name: "hot-context-smoke",
		schema_version: 4,
		docs_root: ".codewiki/kb",
	}, null, 2));

	const project = await loadProject(root);
	const graph = buildGraph({
		project,
		docs: [],
		research: [],
		roadmapEntries: [{
			id: "TASK-999",
			title: "Archived task",
			status: "done",
			priority: "medium",
			kind: "test",
			summary: "Closed task",
			spec_paths: [],
			code_paths: [],
			research_ids: [],
			labels: [],
			created: "2026-05-12T00:00:00Z",
			updated: "2026-05-12T00:00:00Z",
		}],
		gitCache: { getDirtyPaths: () => [] },
		builds: [{
			path: buildPath,
			kind: "implementation_build",
			status: "accepted",
			data: {
				kind: "implementation_build",
				task_id: "TASK-999",
				lifecycle: { state: "accepted" },
				publication: {
					archive_ledger: {
						kind: "task",
						id: "TASK-999",
						build_path: buildPath,
						archive_ref: "refs/codewiki/archive/task/TASK-999",
						digest: "sha256:abc",
						restore_command: "/wiki-restore TASK-999",
					},
					artifact_digests: { files: [{ path: "src/x.ts", role: "code_file", sha256: "sha256:def", bytes: 1 }] },
					push_readiness: { safe_to_push: true },
				},
			},
		}],
		validations: [{ path: validationPath, taskId: "TASK-999", verdict: "pass", data: { source: buildPath, verdict: "pass" } }],
		testFiles: [],
		claims: { version: 1, updated_at: "", next_sequence: 1, claims: [] },
	});

	assert.equal(graph.views.gc.restore_index, undefined, "default GC view must not expose restore index");
	assert.equal(graph.views.gc.git_archive, undefined, "default GC view must not expose archive ledger");
	assert.equal(graph.views.gc.classes.cold.archive_refs, undefined, "default cold class must not expose archive refs");
	assert.equal(graph.views.archive.restore_index[0].archive_ref, "refs/codewiki/archive/task/TASK-999");
	assert.equal(graph.nodes.find((node) => node.kind === "git_archive_ref")?.default_hidden, true);
	assert.equal(graph.nodes.find((node) => node.id === `build:${buildPath}`)?.default_hidden, true);

	await writeFile(project.graphPath, JSON.stringify({
		...graph,
		lenses: {
			lint: { summary: { color: "green", errors: 0, warnings: 0, total_issues: 0 }, counts: {}, issues: [] },
			status: { health: { color: "green", errors: 0, warnings: 0, total: 0 }, summary: { open_task_count: 0, unmapped_specs: 0, tracked_specs: 0, blocked_specs: 0 }, next_step: { kind: "observe", reason: "clear" }, roadmap: { open_task_count: 0 }, parallel: { active_claim_count: 0, claim_warning_count: 0, claim_conflict_count: 0 } },
			roadmap: { version: 1, generated_at: "2026-05-12T00:00:00Z", summary: { open_count: 0 }, views: { open_task_ids: [], in_progress_task_ids: [], blocked_task_ids: [] }, tasks: {} },
		},
	}, null, 2));

	const state = await readCodewikiState(project, { include: ["graph"], taskId: undefined, refresh: false }, {
		fileStore: {},
		rebuildRunner: { run: async () => {} },
		sessionStore: { getSessionBranch: () => [] },
	});
	assert.equal(state.graph.source, "graph:default-lens");
	assert.deepEqual(state.graph.families.map((family) => family.id), ["decision", "knowledge", "work", "execution", "proof"]);
	assert.equal(state.graph.gc.classes.cold, undefined, "default state graph must not expose cold classes");
	assert.equal(state.graph.gc.restore_index, undefined, "default state graph must not expose restore index");
	assert.equal(state.archive, undefined, "archive section must be absent unless requested");

	const stateWithArchive = await readCodewikiState(project, { include: ["graph", "archive"], taskId: undefined, refresh: false }, {
		fileStore: {},
		rebuildRunner: { run: async () => {} },
		sessionStore: { getSessionBranch: () => [] },
	});
	assert.equal(stateWithArchive.archive.restore_index[0].id, "TASK-999");
	assert.equal(stateWithArchive.archive.git_archive.archive_refs[0], "refs/codewiki/archive/task/TASK-999");
} finally {
	await rm(root, { recursive: true, force: true });
}
