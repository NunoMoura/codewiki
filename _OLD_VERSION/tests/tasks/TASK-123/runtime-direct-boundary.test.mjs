import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCodewikiRuntimeTool } from "../../../src/workflow/tool.ts";
import { createPiCodeRuntimeFoundationContract } from "../../../src/runtime/ports.ts";
import {
	requestCodewikiContextRefresh,
	takePendingCodewikiContextRefresh,
} from "../../../src/adapters/pi/compaction.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-task-123-"));
	await mkdir(join(root, ".codewiki/roadmap"), { recursive: true });
	await mkdir(join(root, ".codewiki/kb/system"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/config.json"),
		JSON.stringify(
			{ project_name: "task-123-runtime-boundary", schema_version: 4 },
			null,
			2,
		),
	);
	await writeFile(
		join(root, ".codewiki/kb/system/runtime.md"),
		"---\ntitle: Runtime\n---\n\nRuntime owns context-boundary dispatch.\n",
	);
	await writeFile(
		join(root, ".codewiki/roadmap/queue.json"),
		JSON.stringify(
			{
				version: 2,
				updated: "2026-06-07T00:00:00.000Z",
				tasks: {
					"TASK-123": {
						id: "TASK-123",
						status: "in_progress",
						priority: "high",
						kind: "bug",
						title: "Expose direct runtime context-boundary actions",
						summary: "Expose direct wiki_runtime context-boundary actions.",
						spec_paths: [".codewiki/kb/system/runtime.md"],
						code_paths: ["src/workflow/tool.ts", "src/runtime/runner.ts"],
						labels: ["runtime-context-boundary"],
						goal: {
							outcome: "Direct runtime context-boundary dispatch works.",
							acceptance: [],
							non_goals: [],
							verification: [],
						},
					},
				},
				sprints: {},
			},
			null,
			2,
		),
	);
	return root;
}

async function writeImplementationBuild(root) {
	await mkdir(join(root, ".codewiki/builds/implementation"), {
		recursive: true,
	});
	await writeFile(
		join(
			root,
			".codewiki/builds/implementation/2026-06-07-task-123-fixture.json",
		),
		JSON.stringify(
			{
				version: 1,
				kind: "implementation_build",
				created: "2026-06-07T00:00:00.000Z",
				status: "accepted",
				lifecycle: { state: "accepted" },
				task_id: "TASK-123",
				summary:
					"Fixture implementation build should not divert direct runtime actions.",
				checks_run: ["fixture-check"],
				code_files: [],
				test_files: [],
			},
			null,
			2,
		),
	);
}

function project(root) {
	return {
		root,
		label: "task-123-runtime-boundary",
		config: { project_name: "task-123-runtime-boundary", schema_version: 4 },
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

async function contextRefreshRequestPersistsAcrossProcessBoundary() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-task-123-refresh-"));
	try {
		requestCodewikiContextRefresh({
			reason: "cross-process-context-boundary",
			taskId: "TASK-123",
			followUpIntent: "Fresh source-backed validation context.",
			sourceRefs: ["src/workflow/tool.ts"],
			projectRoot: root,
		});
		const path = join(
			root,
			".codewiki/runtime/tmp/context-refresh-request.json",
		);
		assert.equal(existsSync(path), true);
		const persisted = JSON.parse(await readFile(path, "utf8"));
		assert.equal(persisted.reason, "cross-process-context-boundary");
		assert.equal(persisted.taskId, "TASK-123");
		assert.deepEqual(persisted.sourceRefs, ["src/workflow/tool.ts"]);
		const taken = takePendingCodewikiContextRefresh(root);
		assert.equal(taken?.reason, "cross-process-context-boundary");
		assert.equal(existsSync(path), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function ports(overrides = {}) {
	const contextRequests = [];
	const workerRequests = [];
	return {
		contextRequests,
		workerRequests,
		value: {
			session: {},
			artifactStatus: { sessionId: "task-123-session", agentName: "TASK-123" },
			agency: {
				sessionStore: { getCurrentSessionId: () => "task-123-session" },
				resumeContextBuilder: async (_project, input) => ({
					prompt: `Resume ${input.requestedTaskId}`,
					task: {
						id: "TASK-123",
						title: "Expose direct runtime context-boundary actions",
					},
					context_path: ".codewiki/roadmap/tasks/TASK-123/context.json",
					source_refs: ["src/workflow/tool.ts", "src/runtime/runner.ts"],
					graph_lens: "task",
					expected_output: "runtime boundary requested",
					blockers: [],
					artifact_status: [],
					content_evidence_requirements: [],
				}),
				runtimeFoundation: createPiCodeRuntimeFoundationContract({
					capabilities: { worker_execution: { support: "supported" } },
				}),
				sessionBoundary: {
					requestContextRefresh: (request) => contextRequests.push(request),
				},
				freshWorkerBridge: {
					requestFreshWorker: (request) => {
						workerRequests.push(request);
						return {
							status: "requested",
							summary: `requested ${request.task_id}`,
							request,
							worker: { session_id: "fresh-1", agent_name: "fresh", pid: 1234 },
							blockers: [],
							handoff: {
								summary: "fresh worker requested",
								build_refs: request.build_refs,
								validation_refs: request.validation_refs,
								content_refs: request.content_evidence.content_refs,
								trace_refs: request.trace_refs,
								gate_refs: request.gate_refs,
								git_refs: request.git_refs,
								artifact_refs: request.artifact_refs,
								next_loop: "implementation",
								notes: [],
							},
							platform: { kind: "subprocess", summary: "test", evidence: [] },
						};
					},
				},
				...overrides,
			},
		},
	};
}

await contextRefreshRequestPersistsAcrossProcessBoundary();

{
	const root = await fixture();
	try {
		await writeImplementationBuild(root);
		const p = ports({
			gatewayPreflightBuilder: () => {
				throw new Error("direct runtime action entered validation preflight");
			},
		});
		const result = await executeCodewikiRuntimeTool(
			project(root),
			{
				action: "context_boundary",
				taskId: "TASK-123",
				reason: "user-requested-fresh-session",
				followUpIntent: "Continue fresh from TASK-123 source refs.",
				context_boundary: {
					graph_lens: "task",
					expected_output: "fresh context refresh requested",
					source_refs: ["src/workflow/tool.ts"],
				},
			},
			p.value,
		);
		assert.equal(result.action, "context_boundary");
		assert.deepEqual(
			result.operations.map((operation) => operation.primitive),
			["wiki_runtime_step"],
		);
		assert.equal(result.result.context_boundary.requested, true);
		assert.equal(p.contextRequests.length, 1);
		assert.equal(p.contextRequests[0].reason, "user-requested-fresh-session");
		assert.equal(p.contextRequests[0].taskId, "TASK-123");
		assert.equal(p.contextRequests[0].projectRoot, root);
		assert.ok(p.contextRequests[0].sourceRefs.includes("src/workflow/tool.ts"));
		assert.equal(p.workerRequests.length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

{
	const root = await fixture();
	try {
		await writeImplementationBuild(root);
		const p = ports({
			gatewayPreflightBuilder: () => {
				throw new Error("direct runtime action entered validation preflight");
			},
		});
		const result = await executeCodewikiRuntimeTool(
			project(root),
			{
				action: "fresh_worker",
				taskId: "TASK-123",
				reason: "fresh-validation-worker",
				fresh_worker: {
					gate: "implementation",
					content_mode: "clean",
					build_refs: [".codewiki/builds/implementation/example.json"],
					source_refs: ["src/runtime/runner.ts"],
				},
			},
			p.value,
		);
		assert.equal(result.result.action, "fresh_worker_request");
		assert.deepEqual(
			result.operations.map((operation) => operation.primitive),
			["wiki_runtime_step"],
		);
		assert.equal(result.result.fresh_worker.status, "requested");
		assert.equal(p.workerRequests.length, 1);
		assert.equal(p.contextRequests.length, 0);
		assert.equal(p.workerRequests[0].task_id, "TASK-123");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

{
	const root = await fixture();
	try {
		const p = ports();
		const result = await executeCodewikiRuntimeTool(
			project(root),
			{
				action: "fresh_worker",
				taskId: "TASK-123",
				reason: "dirty-fresh-worker-missing-digest",
				fresh_worker: { content_mode: "dirty" },
			},
			p.value,
		);
		assert.equal(result.result.status, "blocked");
		assert.equal(result.result.fresh_worker.status, "blocked");
		assert.equal(p.workerRequests.length, 0);
		assert.ok(result.result.summary.includes("working_tree_digest"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
