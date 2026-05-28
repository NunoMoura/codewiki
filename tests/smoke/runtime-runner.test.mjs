import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCodewikiRuntimeStep } from "../../src/runtime/runner.ts";
import {
	mutateArtifactStatuses,
	readChangeClaimsFile,
} from "../../src/session/claims.ts";

function now() {
	return "2026-05-28T00:00:00.000Z";
}

function taskRecord(id = "TASK-001") {
	return {
		id,
		title: "Runner fixture task",
		status: "in_progress",
		priority: "high",
		kind: "feature",
		summary: "Exercise the CodeWiki runtime runner.",
		spec_paths: [".codewiki/kb/system/agency.md"],
		code_paths: ["src/runtime/runner.ts"],
		research_ids: [],
		labels: ["agency"],
		goal: {
			outcome: "Runner can advance one safe step.",
			acceptance: ["Runs one step", "Stops at gates"],
			non_goals: ["No publication"],
			verification: ["Run runtime runner tests"],
		},
		delta: { desired: "runner", current: "planner", closure: "tested" },
		created: now(),
		updated: now(),
	};
}

async function writeJson(path, data) {
	await mkdir(resolve(path, ".."), { recursive: true });
	await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function fixtureProject(options = {}) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-runtime-runner-"));
	const task = taskRecord(options.taskId || "TASK-001");
	const project = {
		root,
		label: "runtime-runner-smoke",
		config: {
			project_name: "runtime-runner-smoke",
			schema_version: 4,
			codewiki: {
				agency: {
					level: "roadmap",
					approval_cadence: "roadmap",
					context_reset: {
						enabled: true,
						auto_pickup: true,
						max_resets_per_run: 2,
					},
				},
			},
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
		configPath: ".codewiki/config.json",
	};
	await writeJson(resolve(root, ".codewiki", "roadmap", "queue.json"), {
		version: 1,
		updated: now(),
		order: [task.id],
		tasks: { [task.id]: task },
	});
	return { project, task };
}

function planFor(taskId, overrides = {}) {
	const budget = {
		maxCycles: 1,
		maxWallSeconds: 30,
		maxTokens: 4000,
		maxCostUsd: 0.1,
		maxWrites: 2,
		maxSessions: 1,
		risk: "low",
		...(overrides.budget || {}),
	};
	return {
		mode: "work",
		trigger: "manual",
		budget,
		cycles: [
			{
				cycle: 1,
				action: "task_advance",
				next_task: taskId,
				summary: `Next task: ${taskId}`,
			},
		],
		stop: { next_task: taskId, reason: "Ready for execution." },
		policy: { allowWrites: overrides.allowWrites ?? true },
	};
}

function fakeResumeBuilder(task) {
	return async (_project, input) => ({
		project_label: "runtime-runner-smoke",
		repo_root: _project.root,
		prompt: `Resume ${input.requestedTaskId} from CodeWiki source refs.`,
		task,
		selection: { task, source: "explicit", artifact_statuses: [], skipped: [] },
		preflight: { color: "green", errors: 0, warnings: 0, total: 0 },
		evidence: "fake source-backed resume context",
		follow_up_intent: input.followUpIntent || "",
		context_path: `.codewiki/roadmap/tasks/${task.id}/context.json`,
		source_refs: [".codewiki/roadmap/queue.json", ".codewiki/index_graph.json"],
	});
}

async function readQueue(project) {
	try {
		return JSON.parse(
			await readFile(
				resolve(project.root, ".codewiki", "session", "queue.json"),
				"utf8",
			),
		);
	} catch {
		return { claims: [] };
	}
}

{
	const { project, task } = await fixtureProject();
	const boundaryRequests = [];
	const result = await runCodewikiRuntimeStep(project, planFor(task.id), {
		sessionStore: {
			getCurrentSessionId: () => "runtime-session",
			getSessionBranch: () => [],
		},
		resumeContextBuilder: fakeResumeBuilder(task),
		sessionBoundary: {
			requestContextRefresh: (request) => boundaryRequests.push(request),
		},
	});
	assert.equal(result.executed, true);
	assert.equal(result.status, "completed");
	assert.equal(result.action, "implementation_loop_kickoff");
	assert.equal(result.context_boundary.requested, true);
	assert.equal(
		boundaryRequests.length,
		1,
		"runtime should request CodeWiki-owned context refresh",
	);
	assert.equal(
		result.budget_used.writes,
		2,
		"runtime should claim and release scopes",
	);
	assert.equal(result.workflow_efficiency.session_boundaries_used, 1);
	assert.equal(result.workflow_efficiency.manual_commands_avoided, 2);
	const queue = await readQueue(project);
	const claim = queue.claims.find((item) => item.id === result.claim_id);
	assert.equal(
		claim.status,
		"released",
		"runtime claim should be released before returning",
	);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, { budget: { maxWrites: 1 } }),
		{
			sessionStore: {
				getCurrentSessionId: () => "budget-session",
				getSessionBranch: () => [],
			},
			resumeContextBuilder: fakeResumeBuilder(task),
		},
	);
	assert.equal(result.executed, false);
	assert.equal(result.status, "stopped");
	assert.equal(result.action, "budget_stop");
	assert.match(result.stop_reason, /maxWrites/);
	const queue = await readQueue(project);
	assert.equal(queue.claims.length, 0, "budget stop should not write a claim");
}

{
	const { project, task } = await fixtureProject();
	await mutateArtifactStatuses(
		project,
		{
			action: "mark",
			mode: "write",
			role: "builder",
			taskId: task.id,
			summary: "Fixture conflicting claim.",
			scopes: [{ layer: "roadmap", task_id: task.id }],
		},
		{ sessionId: "other-session", agentName: "Other Agent" },
	);
	const result = await runCodewikiRuntimeStep(project, planFor(task.id), {
		sessionStore: {
			getCurrentSessionId: () => "runtime-session",
			getSessionBranch: () => [],
		},
		resumeContextBuilder: fakeResumeBuilder(task),
	});
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.action, "artifact_claim");
	assert.equal(result.stop_reason, "artifact_conflict");
	assert.ok(
		result.artifact_statuses.some((status) => status.status === "conflict"),
	);
	const state = await readChangeClaimsFile(project);
	assert.equal(
		state.claims.filter((claim) => claim.session_id === "runtime-session")
			.length,
		0,
	);
}

{
	const { project, task } = await fixtureProject();
	const buildPath = resolve(
		project.root,
		".codewiki",
		"builds",
		"implementation",
		"2026-05-28-runner-fixture.json",
	);
	await writeJson(buildPath, {
		version: 1,
		kind: "implementation_build",
		created: now(),
		status: "accepted",
		lifecycle: { state: "accepted" },
		task_id: task.id,
		summary: "Fixture implementation build missing validation proof.",
		traceability: { semantic: false, exemption: "mechanical" },
		checks_run: ["fixture-check"],
		code_files: [],
		test_files: [],
	});
	const result = await runCodewikiRuntimeStep(project, planFor(task.id), {
		sessionStore: {
			getCurrentSessionId: () => "validator-session",
			getSessionBranch: () => [],
		},
	});
	assert.equal(result.executed, true);
	assert.equal(result.status, "blocked");
	assert.equal(result.action, "validation_preflight");
	assert.equal(result.stop_reason, "validation_block");
	assert.equal(result.gateway.status, "blocked");
	assert.equal(
		result.budget_used.writes,
		2,
		"validation preflight path should also release its claim",
	);
}
