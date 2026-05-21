import "../setup-env.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLintReport } from "../../src/application/lint.ts";
import { buildGraph } from "../../src/application/graph.ts";
import { runCodewikiGc } from "../../src/application/gc.ts";

const root = await mkdtemp(join(tmpdir(), "codewiki-hot-retention-"));

const project = {
	root,
	label: "hot-retention-smoke",
	config: { project_name: "hot-retention-smoke", generated_files: [".codewiki/index_graph.json"], codewiki: { gc: {} } },
	docsRoot: ".codewiki/kb",
	specsRoot: ".codewiki/kb",
	evidenceRoot: "",
	researchRoot: ".codewiki/research",
	indexPath: "",
	roadmapPath: ".codewiki/roadmap/queue.json",
	roadmapDocPath: "",
	roadmapEventsPath: "",
	metaRoot: ".codewiki",
	viewsRoot: ".codewiki/views",
	graphPath: ".codewiki/index_graph.json",
	lintPath: ".codewiki/lint.json",
	roadmapStatePath: ".codewiki/index_graph.json",
	statusStatePath: ".codewiki/index_graph.json",
	eventsPath: "",
	configPath: ".codewiki/config.json",
};

try {
	await mkdir(join(root, ".codewiki/index"), { recursive: true });
	await mkdir(join(root, ".codewiki/evidence"), { recursive: true });
	await writeFile(join(root, ".codewiki/index/legacy.json"), "{}\n");
	await writeFile(join(root, ".codewiki/evidence/legacy.jsonl"), "{}\n");
	await writeFile(join(root, ".codewiki/config.json"), JSON.stringify({ notes: "legacy .wiki/path" }, null, 2));
	const lint = buildLintReport(root, project, [], [], [], { builds: [], validations: [], archivedTaskIds: [] });
	assert.ok(lint.issues.some((issue) => issue.kind === "deprecated-codewiki-index"), "Deprecated index path should be deterministic drift");
	assert.ok(lint.issues.some((issue) => issue.kind === "deprecated-codewiki-evidence"), "Deprecated evidence path should be deterministic drift");
	assert.ok(lint.issues.some((issue) => issue.kind === "stale-dotwiki-reference"), "Legacy dot-wiki path should be deterministic drift");

	const buildPath = ".codewiki/builds/implementation/2026-05-12-task-999.json";
	const validationPath = ".codewiki/validation/2026-05-12-task-close-pass-task-999.json";
	const graph = buildGraph({
		project,
		docs: [],
		research: [],
		roadmapEntries: [],
		archivedTaskIds: ["TASK-999"],
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
					archive_ledger: { kind: "task", id: "TASK-999", build_path: buildPath, archive_ref: "refs/codewiki/archive/task/TASK-999", digest: "sha256:abc", restore_command: "/wiki-restore TASK-999" },
					artifact_digests: { files: [{ path: "src/x.ts", role: "code_file", sha256: "sha256:def", bytes: 1 }] },
					push_readiness: { safe_to_push: true },
				},
			},
		}],
		validations: [{ path: validationPath, taskId: "TASK-999", verdict: "pass", data: { source: buildPath, verdict: "pass" } }],
		testFiles: [],
		claims: { version: 1, updated_at: "", next_sequence: 1, claims: [] },
	});
	assert.ok(graph.views.gc.classes.purgeable.build_paths.includes(buildPath), "Safe archived implementation build should be purgeable");
	assert.ok(graph.views.gc.classes.purgeable.validation_paths.includes(validationPath), "Pass validation for safe archived task should be purgeable");
	assert.equal(graph.views.gc.classes.hot.validation_paths.includes(validationPath), false, "Pass validation should not stay hot after safe archive");
	assert.equal(graph.views.archive.restore_index[0].archive_ref, "refs/codewiki/archive/task/TASK-999");

	await mkdir(join(root, ".codewiki/builds/implementation"), { recursive: true });
	await mkdir(join(root, ".codewiki/validation"), { recursive: true });
	await mkdir(join(root, ".codewiki/runtime/session-handoffs"), { recursive: true });
	await writeFile(join(root, buildPath), JSON.stringify({ kind: "implementation_build", task_id: "TASK-999" }, null, 2));
	await writeFile(join(root, validationPath), JSON.stringify({ verdict: "pass", source: buildPath }, null, 2));
	await writeFile(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-TEST.json"), "{}\n");
	await writeFile(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-COMPLETED.json"), JSON.stringify({ kind: "codewiki_session_handoff", status: "completed" }, null, 2));
	await writeFile(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-QUEUED.json"), JSON.stringify({ kind: "codewiki_session_handoff", status: "queued" }, null, 2));
	await writeFile(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-STARTED.json"), JSON.stringify({ kind: "codewiki_session_handoff", status: "started" }, null, 2));
	await writeFile(join(root, ".codewiki/index_graph.json"), JSON.stringify({ views: { gc: graph.views.gc } }, null, 2));

	const dryRun = await runCodewikiGc(project, { action: "dry-run", refresh: false });
	assert.equal(dryRun.status, "dry-run", "GC dry-run should not mutate files");
	assert.equal(dryRun.candidates.tracked.length, 2, "GC dry-run should report purgeable build and validation files");
	assert.equal(dryRun.candidates.runtime.length, 2, "GC dry-run should report consumed or legacy ignored runtime handoffs");
	assert.ok(dryRun.candidates.runtime.some((candidate) => candidate.path.endsWith("HANDOFF-COMPLETED.json")), "Dry-run should report completed handoffs");
	assert.equal(dryRun.candidates.runtime.some((candidate) => candidate.path.endsWith("HANDOFF-QUEUED.json")), false, "Dry-run should not report active queued handoffs");
	assert.equal(dryRun.candidates.runtime.some((candidate) => candidate.path.endsWith("HANDOFF-STARTED.json")), false, "Dry-run should not report active started handoffs");
	assert.ok(existsSync(join(root, buildPath)), "Dry-run should keep tracked build file");

	const blocked = await runCodewikiGc(project, { action: "purge", include: ["tracked"], refresh: false });
	assert.equal(blocked.status, "blocked", "Tracked purge should block without archive proof");
	assert.match(blocked.blocked_reasons.join("\n"), /archive_sha/, "Blocked purge should name missing archive proof");
	assert.ok(existsSync(join(root, validationPath)), "Blocked tracked purge should keep validation file");

	const runtimeOnly = await runCodewikiGc(project, { action: "purge", include: ["runtime"], refresh: false });
	assert.equal(runtimeOnly.status, "purged", "Runtime-only GC can purge ignored session handoffs without archive proof");
	assert.equal(runtimeOnly.deleted.runtime.length, 2, "Runtime-only GC should delete consumed or legacy ignored handoff files");
	assert.equal(existsSync(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-TEST.json")), false, "Legacy runtime handoff should be removed");
	assert.equal(existsSync(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-COMPLETED.json")), false, "Completed runtime handoff should be removed");
	assert.equal(existsSync(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-QUEUED.json")), true, "Queued active handoff should be retained");
	assert.equal(existsSync(join(root, ".codewiki/runtime/session-handoffs/HANDOFF-STARTED.json")), true, "Started active handoff should be retained");

	execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "codewiki@example.test"], { cwd: root });
	execFileSync("git", ["config", "user.name", "CodeWiki Test"], { cwd: root });
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "-m", "archive gc fixture"], { cwd: root, stdio: "ignore" });
	const archive_sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
	const tree_sha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
	const trackedPurge = await runCodewikiGc(project, { action: "purge", include: ["tracked"], archive_sha, tree_sha, refresh: false });
	assert.equal(trackedPurge.status, "purged", "Tracked GC should purge after archive commit/tree proof");
	assert.equal(trackedPurge.deleted.tracked.length, 2, "Tracked GC should delete purgeable tracked files");
	assert.ok(trackedPurge.ledger_path, "Tracked GC should write a restore ledger before deletion");
	assert.equal(existsSync(join(root, buildPath)), false, "Tracked build should be removed after safe GC");
	assert.equal(existsSync(join(root, validationPath)), false, "Tracked validation should be removed after safe GC");
	const ledger = JSON.parse(readFileSync(join(root, trackedPurge.ledger_path), "utf8"));
	assert.equal(ledger.archive.commit_sha, archive_sha, "GC ledger should record archive commit");
	assert.ok(ledger.restore_commands.some((command) => command.includes(`git restore --source=${archive_sha} -- ${buildPath}`)), "GC ledger should include restore command for tracked build");
} finally {
	await rm(root, { recursive: true, force: true });
}
