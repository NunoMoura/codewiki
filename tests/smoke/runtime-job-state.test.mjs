import "../setup-env.mjs";
import assert from "node:assert/strict";
import {
	CODEWIKI_DAEMON_JOB_STORE_PATH,
	answerCodewikiDaemonWorkerQuestion,
	askCodewikiDaemonWorkerQuestion,
	claimCodewikiDaemonBrainLease,
	createCodewikiDaemonJob,
	finishCodewikiDaemonRun,
	heartbeatCodewikiDaemonBrainLease,
	heartbeatCodewikiDaemonRun,
	normalizeCodewikiDaemonJobStore,
	releaseCodewikiDaemonBrainLease,
	startCodewikiDaemonRun,
	unblockCodewikiDaemonJob,
} from "../../src/runtime/types.ts";

const createdAt = "2026-05-30T00:00:00.000Z";

{
	const store = normalizeCodewikiDaemonJobStore(
		{
			version: 999,
			updated_at: "",
			jobs: [
				{
					id: "JOB-001",
					task_id: "TASK-063",
					status: "nonsense",
					loop: "implementation",
					created_at: createdAt,
					updated_at: "",
					max_attempts: 0,
					source_refs: ["src/runtime/types.ts", "src/runtime/types.ts", ""],
					canonical_refs: {
						roadmap_task: "TASK-999",
						planning_build:
							".codewiki/builds/planning/2026-05-30-daemon-runtime-architecture-sprint.json",
					},
					runs: [
						{
							id: "RUN-001",
							status: "???",
							attempt: "2",
							heartbeats: [
								{
									at: createdAt,
									note: "alive",
									worker: { session_id: "session-1" },
								},
								{ note: "missing timestamp" },
							],
							build_refs: ["build.json", "build.json"],
						},
					],
				},
				{ id: "missing-task" },
			],
		},
		createdAt,
	);

	assert.equal(CODEWIKI_DAEMON_JOB_STORE_PATH, ".codewiki/runtime/jobs.json");
	assert.equal(store.version, 1);
	assert.equal(store.updated_at, createdAt);
	assert.deepEqual(Object.keys(store.jobs), ["JOB-001"]);
	assert.equal(store.jobs["JOB-001"].status, "queued");
	assert.equal(store.jobs["JOB-001"].max_attempts, 1);
	assert.deepEqual(store.jobs["JOB-001"].source_refs, ["src/runtime/types.ts"]);
	assert.equal(store.jobs["JOB-001"].canonical_refs.roadmap_task, "TASK-063");
	assert.equal(store.jobs["JOB-001"].runs[0].status, "running");
	assert.equal(store.jobs["JOB-001"].runs[0].heartbeat_count, 1);
	assert.deepEqual(store.jobs["JOB-001"].runs[0].build_refs, ["build.json"]);
}

{
	let job = createCodewikiDaemonJob({
		id: "JOB-063",
		task_id: "TASK-063",
		loop: "implementation",
		created_at: createdAt,
		max_attempts: 2,
		source_refs: [".codewiki/kb/system/runtime.md", "src/runtime/types.ts"],
	});

	assert.equal(job.status, "queued");
	assert.equal(job.canonical_refs.roadmap_task, "TASK-063");

	job = startCodewikiDaemonRun(job, {
		run_id: "RUN-063-1",
		started_at: "2026-05-30T00:01:00.000Z",
		worker: { session_id: "builder-session", claim_id: "claim-1" },
	});
	assert.equal(job.status, "running");
	assert.equal(job.runs[0].attempt, 1);
	assert.equal(job.runs[0].last_heartbeat_at, "2026-05-30T00:01:00.000Z");

	job = heartbeatCodewikiDaemonRun(job, "RUN-063-1", {
		at: "2026-05-30T00:02:00.000Z",
		note: "schema review complete",
		worker: { session_id: "builder-session", claim_id: "claim-2" },
	});
	assert.equal(job.runs[0].heartbeat_count, 1);
	assert.equal(job.runs[0].heartbeats[0].note, "schema review complete");
	assert.equal(job.runs[0].worker?.claim_id, "claim-2");

	job = finishCodewikiDaemonRun(job, "RUN-063-1", {
		ended_at: "2026-05-30T00:03:00.000Z",
		outcome: "pass",
		summary: "daemon schema accepted",
		build_refs: [".codewiki/builds/implementation/2026-05-30-task-063.json"],
		validation_refs: [
			".codewiki/validation/2026-05-30-implementation-pass-task-063.json",
		],
		content_refs: ["tree:abc123"],
	});
	assert.equal(job.status, "completed");
	assert.equal(job.runs[0].status, "completed");
	assert.equal(job.runs[0].handoff?.summary, "daemon schema accepted");
	assert.deepEqual(job.runs[0].handoff?.validation_refs, [
		".codewiki/validation/2026-05-30-implementation-pass-task-063.json",
	]);
}

{
	let job = createCodewikiDaemonJob({
		id: "JOB-BLOCK",
		task_id: "TASK-063",
		loop: "validation",
		created_at: createdAt,
		max_attempts: 2,
	});

	job = startCodewikiDaemonRun(job, {
		run_id: "RUN-BLOCK-1",
		started_at: "2026-05-30T01:00:00.000Z",
	});
	job = finishCodewikiDaemonRun(job, "RUN-BLOCK-1", {
		ended_at: "2026-05-30T01:01:00.000Z",
		outcome: "block",
		block_reason: {
			kind: "runtime_conflict",
			summary: "artifact holder owns TASK-063",
			refs: [".codewiki/session/queue.json"],
			retryable: true,
		},
	});
	assert.equal(job.status, "blocked");
	assert.equal(job.block_reason?.kind, "runtime_conflict");
	assert.equal(job.runs[0].status, "blocked");

	job = startCodewikiDaemonRun(job, {
		run_id: "RUN-BLOCK-2",
		started_at: "2026-05-30T01:02:00.000Z",
	});
	assert.equal(job.status, "running");
	assert.equal(job.block_reason, undefined);
	assert.equal(job.runs[1].attempt, 2);

	job = finishCodewikiDaemonRun(job, "RUN-BLOCK-2", {
		ended_at: "2026-05-30T01:03:00.000Z",
		outcome: "fail",
		error: "fresh validation failed",
	});
	assert.equal(job.status, "blocked");
	assert.equal(job.block_reason?.kind, "validation_fail");
	assert.throws(
		() =>
			startCodewikiDaemonRun(job, {
				run_id: "RUN-BLOCK-3",
				started_at: "2026-05-30T01:04:00.000Z",
			}),
		/max_attempts=2/,
	);
}

{
	let store = normalizeCodewikiDaemonJobStore(
		{ version: 1, updated_at: createdAt, jobs: {} },
		createdAt,
	);
	store = claimCodewikiDaemonBrainLease(store, {
		session_id: "brain-session",
		session_file: ".pi/sessions/brain.json",
		agent_name: "Brain",
		now: "2026-05-30T02:00:00.000Z",
		expires_at: "2026-05-30T02:05:00.000Z",
		active_task_id: "TASK-070",
		active_sprint_id: "SPRINT-018",
		active_refs: ["TASK-070", "SPRINT-018", "TASK-070"],
		model_policy: {
			provider: "pi",
			model: "strong-model",
			fallback_model: "fast-model",
			approval_refs: ["decision:TOOLS-CORE-003"],
			notes: ["high-risk runtime task"],
		},
		takeover_policy: "stale-only",
	});
	assert.equal(store.brain_lease?.status, "active");
	assert.equal(store.brain_lease?.session_id, "brain-session");
	assert.equal(store.brain_lease?.active_task_id, "TASK-070");
	assert.deepEqual(store.brain_lease?.active_refs, ["TASK-070", "SPRINT-018"]);
	assert.equal(store.brain_lease?.model_policy?.fallback_model, "fast-model");
	assert.throws(
		() =>
			claimCodewikiDaemonBrainLease(store, {
				session_id: "other-brain",
				now: "2026-05-30T02:01:00.000Z",
				expires_at: "2026-05-30T02:06:00.000Z",
			}),
		/already active/,
	);
	store = heartbeatCodewikiDaemonBrainLease(store, {
		session_id: "brain-session",
		at: "2026-05-30T02:02:00.000Z",
		expires_at: "2026-05-30T02:07:00.000Z",
		active_refs: ["TASK-070", "runtime-foundation"],
	});
	assert.equal(store.brain_lease?.heartbeat_at, "2026-05-30T02:02:00.000Z");
	assert.deepEqual(store.brain_lease?.active_refs, [
		"TASK-070",
		"runtime-foundation",
	]);
	assert.throws(
		() =>
			claimCodewikiDaemonBrainLease(store, {
				session_id: "replacement-brain",
				now: "2026-05-30T02:08:00.000Z",
				expires_at: "2026-05-30T02:13:00.000Z",
			}),
		/stale takeover policy/,
	);
	store = claimCodewikiDaemonBrainLease(store, {
		session_id: "replacement-brain",
		now: "2026-05-30T02:08:00.000Z",
		expires_at: "2026-05-30T02:13:00.000Z",
		allow_stale_takeover: true,
		notes: ["previous heartbeat expired"],
	});
	assert.equal(store.brain_lease?.session_id, "replacement-brain");
	store = releaseCodewikiDaemonBrainLease(
		store,
		"replacement-brain",
		"2026-05-30T02:09:00.000Z",
	);
	assert.equal(store.brain_lease?.status, "released");
}

{
	let job = createCodewikiDaemonJob({
		id: "JOB-QUESTION",
		task_id: "TASK-070",
		loop: "implementation",
		created_at: createdAt,
		max_attempts: 2,
		worker_profile: {
			role: "builder",
			mode: "implementation",
			capabilities: ["runtime-scheduler"],
			notes: ["run-scoped worker"],
		},
		model_policy: {
			provider: "pi",
			model: "strong-model",
			fallback_model: "fast-model",
			max_tokens: 12000,
			max_cost_usd: 1.5,
			risk: "high",
			approval_refs: ["decision:BRAIN-WORKER-004"],
			notes: ["runtime model policy"],
		},
	});
	assert.equal(job.model_policy?.model, "strong-model");
	job = startCodewikiDaemonRun(job, {
		run_id: "RUN-QUESTION-1",
		started_at: "2026-05-30T03:00:00.000Z",
	});
	assert.equal(job.runs[0].worker_profile?.role, "builder");
	assert.equal(job.runs[0].model_policy?.fallback_model, "fast-model");
	job = askCodewikiDaemonWorkerQuestion(job, {
		id: "Q-001",
		run_id: "RUN-QUESTION-1",
		asked_at: "2026-05-30T03:01:00.000Z",
		question: "Should worker reroute to planning or continue?",
		refs: [".codewiki/kb/system/runtime.md"],
		attempted_evidence: ["runtime tests read"],
		options: ["continue", "route-to-planning"],
		block_kind: "planning_required",
		recommended_next_loop: "planning",
	});
	assert.equal(job.status, "blocked");
	assert.equal(job.block_reason?.kind, "planning_required");
	assert.equal(job.block_reason?.retryable, false);
	assert.equal(job.questions[0].status, "open");
	assert.equal(job.runs[0].status, "blocked");
	job = answerCodewikiDaemonWorkerQuestion(job, {
		question_id: "Q-001",
		answered_at: "2026-05-30T03:02:00.000Z",
		answer: "Continue inside TASK-070; execution graph schema is deferred.",
		answered_by: "brain-session",
	});
	assert.equal(job.questions[0].status, "answered");
	job = unblockCodewikiDaemonJob(job, {
		question_id: "Q-001",
		unblocked_at: "2026-05-30T03:03:00.000Z",
		resolution: "Continue TASK-070 runtime foundation only.",
		resolution_refs: ["SPRINT-018"],
	});
	assert.equal(job.status, "queued");
	assert.equal(job.block_reason, undefined);
	assert.equal(job.questions[0].status, "resolved");
	assert.deepEqual(job.questions[0].resolution_refs, ["SPRINT-018"]);
	job = startCodewikiDaemonRun(job, {
		run_id: "RUN-QUESTION-2",
		started_at: "2026-05-30T03:04:00.000Z",
	});
	assert.equal(job.status, "running");
	assert.equal(job.runs[1].attempt, 2);
}
