import "../setup-env.mjs";
import assert from "node:assert/strict";
import {
	CODEWIKI_DAEMON_JOB_STORE_PATH,
	createCodewikiDaemonJob,
	finishCodewikiDaemonRun,
	heartbeatCodewikiDaemonRun,
	normalizeCodewikiDaemonJobStore,
	startCodewikiDaemonRun,
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
