import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	runCodewikiDaemonDispatcherTick,
	runCodewikiRuntimeStep,
} from "../../src/runtime/runner.ts";
import {
	createPiCodeRuntimeFoundationContract,
	createUnsupportedRuntimeFoundationContract,
	requireRuntimeCapability,
} from "../../src/runtime/ports.ts";
import {
	CODEWIKI_DAEMON_JOB_STORE_VERSION,
	createCodewikiDaemonJob,
} from "../../src/runtime/types.ts";
import {
	piCodeRuntimeFoundation,
	piFreshWorkerBridge,
} from "../../src/adapters/pi/tools/ports.ts";
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

function readinessFor(taskId, overrides = {}) {
	return {
		version: 1,
		contract_version: 1,
		kind: "task",
		task_id: taskId,
		state: overrides.state || "runnable",
		safe_to_schedule: overrides.safe_to_schedule ?? true,
		expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
		blockers: overrides.blockers || [],
		next_action: overrides.next_action || {
			kind: "run",
			loop: "implementation",
			summary: `Run ${taskId}`,
			command: `wiki_resume_context taskId=${taskId}`,
			refs: [`.codewiki/roadmap/tasks/${taskId}/context.json`],
			safe_to_schedule: overrides.safe_to_schedule ?? true,
		},
	};
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
	const readiness = overrides.omitReadiness
		? undefined
		: readinessFor(taskId, overrides.readiness || {});
	return {
		mode: "work",
		trigger: "manual",
		budget,
		...(readiness
			? { automation_readiness: { tasks: { [taskId]: readiness } } }
			: {}),
		cycles: [
			{
				cycle: 1,
				action: overrides.fresh_worker ? "fresh_worker" : "task_advance",
				next_task: taskId,
				summary: `Next task: ${taskId}`,
				...(readiness ? { automation_readiness: readiness } : {}),
				...(overrides.fresh_worker
					? { fresh_worker: overrides.fresh_worker }
					: {}),
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
	const foundation = createPiCodeRuntimeFoundationContract();
	for (const name of [
		"model_loop",
		"session_state",
		"tool_execution",
		"context_assembly",
		"compaction",
		"event_streams",
	]) {
		const check = requireRuntimeCapability(foundation, name);
		assert.equal(check.ok, true, `${name} should be supported by Pi Code`);
		assert.equal(check.capability.owner, "pi_code");
	}
	assert.equal(foundation.primary, true);
	assert.equal(foundation.foundation, "pi_code");
	assert.equal(
		foundation.capabilities.worker_execution.support,
		"platform_limited",
		"daemon worker execution should remain contract-only until session spawning exists",
	);
	const adapterFoundation = piCodeRuntimeFoundation();
	assert.equal(adapterFoundation.foundation, "pi_code");
	assert.equal(
		adapterFoundation.capabilities.worker_execution.support,
		"supported",
	);
	assert.match(
		adapterFoundation.capabilities.worker_execution.evidence.join("\n"),
		/subprocess/,
	);
}

{
	const bridge = piFreshWorkerBridge(
		{ cwd: process.cwd() },
		{
			invocation: {
				command: "/definitely/missing/pi-worker",
				evidence: ["subprocess:test-missing-pi"],
			},
		},
	);
	const result = await bridge.requestFreshWorker({
		role: "builder",
		task_id: "TASK-001",
		reason: "test unavailable bridge",
		requested_at: now(),
		prompt: "Implement TASK-001 from CodeWiki refs.",
		build_refs: [".codewiki/builds/implementation/fixture.json"],
		validation_refs: [".codewiki/validation/fixture.json"],
		content_refs: ["working_tree_digest:abc123"],
		trace_refs: ["trace:TASK-001"],
		gate_refs: ["gate:implementation"],
		git_refs: ["git:tree:abc123"],
		artifact_refs: ["artifact:TASK-001"],
		content_evidence: {
			mode: "dirty",
			working_tree_digest: "abc123",
			patch_refs: ["patch:fixture.diff"],
			worktree_refs: ["worktree:fixture"],
			immutable_refs: [],
			content_refs: ["working_tree_digest:abc123", "patch:fixture.diff"],
			required: ["working_tree_digest", "patch_refs", "worktree_refs"],
			missing: [],
			safe_to_transfer: true,
			notes: ["dirty handoff fixture"],
		},
	});
	assert.equal(result.status, "unsupported");
	assert.equal(result.blockers[0].kind, "platform_limited");
	assert.ok(result.blockers[0].refs.includes("trace:TASK-001"));
	assert.ok(result.blockers[0].refs.includes("gate:implementation"));
	assert.ok(result.blockers[0].refs.includes("git:tree:abc123"));
	assert.match(result.blockers[0].summary, /not executable/);
	assert.match(result.blockers[0].remediation.join("\n"), /wiki-resume --new/);
}

{
	const unsupported = createUnsupportedRuntimeFoundationContract(
		"future-cli",
		"Future CLI",
	);
	const check = requireRuntimeCapability(unsupported, "context_assembly");
	assert.equal(check.ok, false);
	assert.equal(check.status, "platform_limited");
	assert.match(check.summary, /cannot satisfy context_assembly/);
	assert.ok(check.evidence.some((item) => item.includes("unsupported")));
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
	const result = await runCodewikiRuntimeStep(project, planFor(task.id), {
		runtimeFoundation: createUnsupportedRuntimeFoundationContract(
			"future-cli",
			"Future CLI",
		),
		sessionStore: {
			getCurrentSessionId: () => "unsupported-session",
			getSessionBranch: () => [],
		},
		resumeContextBuilder: fakeResumeBuilder(task),
	});
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.action, "runtime_capability");
	assert.equal(result.stop_reason, "platform_limited");
	assert.equal(result.context_boundary.capability.name, "context_assembly");
	assert.ok(
		result.workflow_efficiency.platform_limited_steps.some((item) =>
			item.includes("context_assembly"),
		),
	);
	const queue = await readQueue(project);
	const claim = queue.claims.find((item) => item.id === result.claim_id);
	assert.equal(claim.status, "released");
}

{
	const { project, task } = await fixtureProject();
	const bridgeRequests = [];
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, {
			fresh_worker: {
				required: true,
				role: "builder",
				gate: "implementation",
				content_mode: "dirty",
				working_tree_digest: "sha256:dirty",
				patch_refs: ["patch:task-001.diff"],
				trace_refs: ["trace:TASK-001"],
				gate_refs: ["gate:implementation"],
			},
		}),
		{
			sessionStore: {
				getCurrentSessionId: () => "fresh-parent",
				getSessionBranch: () => [],
			},
			resumeContextBuilder: fakeResumeBuilder(task),
			freshWorkerBridge: {
				requestFreshWorker: (request) => {
					bridgeRequests.push(request);
					return {
						status: "requested",
						summary: "fresh worker requested by fixture bridge",
						request,
						worker: { session_id: "worker-session" },
						blockers: [],
						handoff: {
							summary: "handoff",
							build_refs: request.build_refs,
							validation_refs: request.validation_refs,
							content_refs: request.content_evidence.content_refs,
							trace_refs: request.trace_refs,
							gate_refs: request.gate_refs,
							git_refs: request.git_refs,
							artifact_refs: request.artifact_refs,
							notes: request.content_evidence.notes,
						},
						platform: {
							kind: "subprocess",
							summary: "fixture",
							evidence: ["fixture"],
						},
					};
				},
			},
		},
	);
	assert.equal(result.executed, true);
	assert.equal(result.action, "fresh_worker_request");
	assert.equal(result.fresh_worker.status, "requested");
	assert.equal(bridgeRequests.length, 1);
	assert.equal(bridgeRequests[0].content_evidence.mode, "dirty");
	assert.equal(bridgeRequests[0].content_evidence.safe_to_transfer, true);
	assert.ok(
		bridgeRequests[0].content_evidence.content_refs.includes(
			"working_tree_digest:sha256:dirty",
		),
	);
	assert.equal(result.workflow_efficiency.session_boundaries_used, 1);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, {
			fresh_worker: {
				required: true,
				role: "validator",
				gate: "implementation",
				content_mode: "dirty",
				patch_refs: ["patch:task-001.diff"],
			},
		}),
		{
			sessionStore: {
				getCurrentSessionId: () => "fresh-parent",
				getSessionBranch: () => [],
			},
			resumeContextBuilder: fakeResumeBuilder(task),
		},
	);
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.action, "fresh_worker_request");
	assert.equal(result.stop_reason, "content_proof_missing");
	assert.deepEqual(result.fresh_worker.request.content_evidence.missing, [
		"working_tree_digest",
	]);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, {
			fresh_worker: {
				required: true,
				role: "publisher",
				gate: "ship-ready",
			},
		}),
		{
			sessionStore: {
				getCurrentSessionId: () => "fresh-parent",
				getSessionBranch: () => [],
			},
			resumeContextBuilder: fakeResumeBuilder(task),
		},
	);
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.stop_reason, "content_proof_missing");
	assert.deepEqual(result.fresh_worker.request.content_evidence.missing, [
		"immutable_content_ref",
	]);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, {
			fresh_worker: {
				required: true,
				role: "builder",
				content_mode: "dirty",
				working_tree_digest: "sha256:dirty",
				worktree_refs: ["worktree:/tmp/task-001"],
			},
		}),
		{
			sessionStore: {
				getCurrentSessionId: () => "fresh-parent",
				getSessionBranch: () => [],
			},
			resumeContextBuilder: fakeResumeBuilder(task),
		},
	);
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.stop_reason, "platform_limited");
	assert.match(
		result.fresh_worker.blockers[0].summary,
		/no RuntimeFreshWorkerBridgePort/,
	);
	assert.match(
		result.fresh_worker.blockers[0].remediation[0],
		/RuntimeFreshWorkerBridgePort/,
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
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, { omitReadiness: true }),
		{},
	);
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.action, "automation_readiness");
	assert.match(result.stop_reason, /contract missing/);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, {
			readiness: { expires_at: "2000-01-01T00:00:00.000Z" },
		}),
		{},
	);
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.action, "automation_readiness");
	assert.match(result.stop_reason, /expired/);
}

{
	const { project, task } = await fixtureProject();
	const result = await runCodewikiRuntimeStep(
		project,
		planFor(task.id, {
			readiness: {
				state: "blocked",
				safe_to_schedule: false,
				blockers: [
					{
						kind: "accepted_planning_missing",
						severity: "high",
						summary: "No accepted planning build.",
						refs: [task.id],
						next_safe_action: "Run planning compiler.",
					},
				],
			},
		}),
		{},
	);
	assert.equal(result.executed, false);
	assert.equal(result.status, "blocked");
	assert.equal(result.action, "automation_readiness");
	assert.equal(result.context_boundary.state, "blocked");
	assert.equal(
		result.context_boundary.blockers[0].kind,
		"accepted_planning_missing",
	);
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
		"gateway preflight path should also release its claim",
	);
}

function daemonStore(job) {
	return {
		version: CODEWIKI_DAEMON_JOB_STORE_VERSION,
		updated_at: job.created_at,
		jobs: { [job.id]: job },
	};
}

function daemonJob(overrides = {}) {
	return createCodewikiDaemonJob({
		id: overrides.id || "JOB-065",
		task_id: overrides.task_id || "TASK-065",
		loop: overrides.loop || "implementation",
		created_at: overrides.created_at || "2026-05-30T00:00:00.000Z",
		max_attempts: overrides.max_attempts ?? 2,
		source_refs: [".codewiki/roadmap/tasks/TASK-065/task.json"],
	});
}

{
	const result = await runCodewikiDaemonDispatcherTick({
		store: daemonStore(daemonJob()),
		now: "2026-05-30T00:01:00.000Z",
		worker: { session_id: "daemon-session", claim_id: "CLAIM-065" },
		workerProfile: {
			role: "builder",
			mode: "implementation",
			capabilities: ["runtime-scheduler"],
			notes: ["run scoped"],
		},
		modelPolicy: {
			provider: "pi",
			model: "strong-model",
			fallback_model: "fast-model",
			approval_refs: ["decision:BRAIN-WORKER-004"],
			notes: ["scheduler test"],
		},
		leaseTtlMs: 60_000,
		executeAttempt: () => ({
			ended_at: "2026-05-30T00:02:00.000Z",
			outcome: "pass",
			summary: "dispatcher skeleton pass",
			build_refs: [".codewiki/builds/implementation/task-065.json"],
			validation_refs: [".codewiki/validation/task-065.json"],
		}),
	});

	assert.equal(result.status, "completed");
	assert.equal(result.job_id, "JOB-065");
	assert.equal(result.run_id, "JOB-065-RUN-001");
	const job = result.store.jobs["JOB-065"];
	assert.equal(job.status, "completed");
	assert.equal(job.runs[0].status, "completed");
	assert.equal(job.runs[0].heartbeat_count, 1);
	assert.equal(job.runs[0].lease_expires_at, "2026-05-30T00:02:00.000Z");
	assert.equal(job.runs[0].worker_profile?.role, "builder");
	assert.equal(job.runs[0].model_policy?.fallback_model, "fast-model");
	assert.equal(job.runs[0].handoff?.summary, "dispatcher skeleton pass");
}

{
	const job = daemonJob({ id: "JOB-FRESH-BLOCK" });
	job.trace_refs = ["trace:TASK-065"];
	job.gate_refs = ["gate:implementation"];
	job.git_refs = ["worktree_digest:sha256:dirty"];
	const result = await runCodewikiDaemonDispatcherTick({
		store: daemonStore(job),
		now: "2026-05-30T00:03:00.000Z",
		freshWorker: {
			required: true,
			bridge_available: false,
			summary: "worker bridge unavailable in fixture",
			remediation: ["Use manual /wiki-resume --new fallback."],
		},
	});
	assert.equal(result.status, "blocked");
	assert.equal(result.outcome, "block");
	const blocked = result.store.jobs["JOB-FRESH-BLOCK"];
	assert.equal(blocked.block_reason?.kind, "platform_limited");
	assert.ok(blocked.block_reason?.refs.includes("trace:TASK-065"));
	assert.deepEqual(blocked.block_reason?.gate_refs, ["gate:implementation"]);
	assert.match(blocked.block_reason?.remediation[0], /wiki-resume/);
}

{
	let result = await runCodewikiDaemonDispatcherTick({
		store: daemonStore(daemonJob({ id: "JOB-RETRY", max_attempts: 2 })),
		now: "2026-05-30T01:00:00.000Z",
		executeAttempt: () => ({
			ended_at: "2026-05-30T01:01:00.000Z",
			outcome: "fail",
			error: "first attempt failed",
		}),
	});
	assert.equal(result.status, "failed");
	assert.equal(result.store.jobs["JOB-RETRY"].status, "blocked");
	assert.equal(result.store.jobs["JOB-RETRY"].block_reason?.retryable, true);

	result = await runCodewikiDaemonDispatcherTick({
		store: result.store,
		now: "2026-05-30T01:02:00.000Z",
		executeAttempt: () => ({
			ended_at: "2026-05-30T01:03:00.000Z",
			outcome: "fail",
			error: "second attempt failed",
		}),
	});
	assert.equal(result.status, "failed");
	assert.equal(result.run_id, "JOB-RETRY-RUN-002");
	assert.equal(
		result.store.jobs["JOB-RETRY"].block_reason?.kind,
		"retry_limit",
	);
	assert.equal(result.store.jobs["JOB-RETRY"].block_reason?.retryable, false);

	const idle = await runCodewikiDaemonDispatcherTick({
		store: result.store,
		now: "2026-05-30T01:04:00.000Z",
	});
	assert.equal(idle.status, "idle", "retry-limit jobs should not rerun");
}

{
	let result = await runCodewikiDaemonDispatcherTick({
		store: daemonStore(daemonJob({ id: "JOB-STALE", max_attempts: 2 })),
		now: "2026-05-30T02:00:00.000Z",
		leaseTtlMs: 1_000,
	});
	assert.equal(result.status, "claimed");
	assert.equal(result.store.jobs["JOB-STALE"].status, "running");

	result = await runCodewikiDaemonDispatcherTick({
		store: result.store,
		now: "2026-05-30T02:01:00.000Z",
		staleAfterMs: 1_000,
	});
	assert.equal(result.status, "stale");
	assert.equal(result.store.jobs["JOB-STALE"].status, "blocked");
	assert.equal(result.store.jobs["JOB-STALE"].runs[0].status, "stale");
	assert.equal(result.store.jobs["JOB-STALE"].block_reason?.retryable, true);

	result = await runCodewikiDaemonDispatcherTick({
		store: result.store,
		now: "2026-05-30T02:02:00.000Z",
		executeAttempt: () => ({
			ended_at: "2026-05-30T02:03:00.000Z",
			outcome: "pass",
			summary: "recovered stale run",
		}),
	});
	assert.equal(result.status, "completed");
	assert.equal(result.run_id, "JOB-STALE-RUN-002");
}
