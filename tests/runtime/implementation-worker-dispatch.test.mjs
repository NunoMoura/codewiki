import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeWikiConfigFile } from "../../src/project/config-file.ts";
import { resolveWikiConfig } from "../../src/project/config.ts";
import { ImplementationWorkerDispatcher } from "../../src/runtime/implementation-worker-dispatch.ts";
import { ProjectCoordinator } from "../../src/runtime/project-coordinator.ts";
import {
	connectProjectCoordinatorClient,
	startProjectCoordinatorService,
} from "../../src/runtime/project-coordinator-service.ts";
import { RuntimeReactor } from "../../src/runtime/reactor.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { seedRuntimeImplementation } from "../helpers/runtime-implementation.mjs";

const execFile = promisify(execFileCallback);

function automaticConfig() {
	return resolveWikiConfig({
		project: "worker-dispatch-test",
		runtime: {
			automation: "auto",
			agency: "auto",
			maxWorkers: 2,
			worktreeIsolation: "worktree",
		},
	});
}

function gitStatus(root) {
	return {
		repoRoot: root,
		baseRef: "HEAD",
		baseSha: "abc123",
		dirtyPaths: [],
		errors: [],
		gitRoot: root,
		isGitRepository: true,
	};
}

function completedResult(assignment) {
	return {
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		status: "completed",
		receiptRef: `runtime-worker-receipt:${assignment.assignmentId}`,
	};
}

async function waitForCoordinator(coordinator) {
	const deadline = Date.now() + 3_000;
	while (coordinator.snapshot().jobs.length > 0 && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	assert.equal(coordinator.snapshot().jobs.length, 0);
}

test("elected runtime derives claims and exact worker Assignments from WorkState", async () => {
	const root = await mkdtemp(`${tmpdir()}/codewiki-worker-dispatch-`);
	const fixture = await seedRuntimeImplementation(root, {
		suffix: "worker-dispatch",
		pathScopes: ["src/worker-dispatch/**"],
	});
	const coordinator = new ProjectCoordinator(root, {
		generationId: "generation:worker-dispatch",
	});
	const client = coordinator.connectClient({
		clientId: "pi:worker-dispatch",
		kind: "pi",
		supervision: "approved",
	});
	const executions = [];
	const worktreeSteps = [];
	const persisted = new Map();
	const adapter = {
		isolationKinds: ["worktree"],
		async recover(assignment) {
			return persisted.get(assignment.assignmentId);
		},
		async execute(assignment) {
			executions.push(assignment);
			const completed = completedResult(assignment);
			persisted.set(assignment.assignmentId, completed);
			return completed;
		},
	};
	const dispatcher = new ImplementationWorkerDispatcher({
		repoRoot: root,
		coordinator,
		reactor: new RuntimeReactor(root),
		adapter,
		loadConfig: async () => automaticConfig(),
		collectGitStatus: async () => gitStatus(root),
		worktreeRunner(_command, context) {
			worktreeSteps.push(context.step);
			return { exitCode: 0 };
		},
		now: () => "2026-07-21T10:00:00.000Z",
	});
	try {
		const dispatch = await dispatcher.reconcile({
			kind: "project_truth_changed",
			occurredAt: "2026-07-21T10:00:00.000Z",
		});
		assert.equal(dispatch.status, "scheduled");
		assert.deepEqual(dispatch.pendingWorkItemIds, [fixture.workItemId]);
		assert.equal(dispatch.scheduledJobIds.length, 1);
		await waitForCoordinator(coordinator);
		assert.equal(executions.length, 1);
		assert.equal(executions[0].workItemId, fixture.workItemId);
		assert.equal(executions[0].traceId, fixture.traceId);
		assert.equal(executions[0].planningRefs[0], fixture.planningRef);
		assert.equal(executions[0].sourceBaseRef, "git:abc123");
		assert.equal(executions[0].worktree.baseRef, "abc123");
		assert.match(executions[0].contextDigest, /^sha256:[a-f0-9]{64}$/);
		assert.deepEqual(worktreeSteps, [
			"worktree.prepare",
			"worktree.verify",
			"worktree.verify",
		]);
		const state = await buildProjectWorkState({ repoRoot: root });
		assert.equal(state.assignments.length, 1);
		assert.equal(state.assignments[0].status, "claimed");
		assert.equal(state.assignments[0].id, executions[0].claimId);
		const observed = await new RuntimeReactor(root).observe({
			kind: "timer_due",
			occurredAt: "2026-07-21T10:00:01.000Z",
		});
		const claim = observed.records.find(
			(record) =>
				record.type === "trace_event" &&
				record.event === "runtime.work_unit.claimed",
		);
		assert.equal(claim?.data?.runtimeJobId, dispatch.scheduledJobIds[0]);
		assert.match(
			claim?.data?.runtimeAssignmentDigest,
			/^sha256:[a-f0-9]{64}$/,
		);
	} finally {
		client.disconnect();
		await waitForCoordinator(coordinator);
		coordinator.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("replacement generation resumes active claim from private Assignment packet", async () => {
	const root = await mkdtemp(`${tmpdir()}/codewiki-worker-resume-`);
	const fixture = await seedRuntimeImplementation(root, {
		suffix: "worker-resume",
		pathScopes: ["src/worker-resume/**"],
	});
	const persisted = new Map();
	let executions = 0;
	const adapter = {
		isolationKinds: ["worktree"],
		async recover(assignment) {
			return persisted.get(assignment.assignmentId);
		},
		async execute(assignment) {
			executions += 1;
			const completed = completedResult(assignment);
			persisted.set(assignment.assignmentId, completed);
			return completed;
		},
	};
	const dispatchWith = async (coordinator, occurredAt) => {
		const dispatcher = new ImplementationWorkerDispatcher({
			repoRoot: root,
			coordinator,
			reactor: new RuntimeReactor(root),
			adapter,
			loadConfig: async () => automaticConfig(),
			collectGitStatus: async () => gitStatus(root),
			worktreeRunner() {
				return { exitCode: 0 };
			},
			now: () => occurredAt,
		});
		return dispatcher.reconcile({ kind: "timer_due", occurredAt });
	};
	const first = new ProjectCoordinator(root, {
		generationId: "generation:worker-resume-first",
	});
	const firstClient = first.connectClient({
		clientId: "pi:worker-resume-first",
		kind: "pi",
		supervision: "approved",
	});
	try {
		await dispatchWith(first, "2026-07-21T11:00:00.000Z");
		await waitForCoordinator(first);
	} finally {
		firstClient.disconnect();
		first.close();
	}
	const replacement = new ProjectCoordinator(root, {
		generationId: "generation:worker-resume-replacement",
	});
	const replacementClient = replacement.connectClient({
		clientId: "pi:worker-resume-replacement",
		kind: "pi",
		supervision: "approved",
	});
	try {
		const resumed = await dispatchWith(
			replacement,
			"2026-07-21T11:01:00.000Z",
		);
		assert.equal(resumed.status, "scheduled");
		assert.deepEqual(resumed.pendingWorkItemIds, [fixture.workItemId]);
		assert.equal(resumed.scheduledJobIds.length, 1);
		await waitForCoordinator(replacement);
		assert.equal(executions, 1);
		assert.equal(replacement.snapshot().completedJobCount, 1);

		const packetDirectory = join(
			root,
			".codewiki",
			"runtime",
			"worker-assignments",
		);
		const [packetName] = await readdir(packetDirectory);
		const packetPath = join(packetDirectory, packetName);
		const packet = JSON.parse(await readFile(packetPath, "utf8"));
		packet.assignment.prompt = "Tampered runtime scratch.";
		await writeFile(packetPath, `${JSON.stringify(packet)}\n`, "utf8");
		const rejected = await dispatchWith(
			replacement,
			"2026-07-21T11:02:00.000Z",
		);
		assert.equal(rejected.status, "quiescent");
		assert.deepEqual(rejected.pendingWorkItemIds, [fixture.workItemId]);
		assert.deepEqual(rejected.scheduledJobIds, []);
		assert.equal(executions, 1);
	} finally {
		replacementClient.disconnect();
		replacement.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("authenticated project-service clients trigger automatic worker reconciliation", async () => {
	const root = await mkdtemp(`${tmpdir()}/codewiki-worker-service-dispatch-`);
	let service;
	let client;
	let executions = 0;
	let semanticExecutions = 0;
	try {
		await execFile("git", ["init", "-q"], { cwd: root });
		await execFile("git", ["config", "user.email", "codewiki@example.test"], {
			cwd: root,
		});
		await execFile("git", ["config", "user.name", "CodeWiki Test"], {
			cwd: root,
		});
		await execFile("git", ["commit", "--allow-empty", "-qm", "base"], {
			cwd: root,
		});
		const fixture = await seedRuntimeImplementation(root, {
			suffix: "worker-service-dispatch",
			pathScopes: ["src/service-dispatch/**"],
		});
		await writeWikiConfigFile(root, automaticConfig());
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:worker-service-dispatch",
			semanticAdapters: {
				implementation() {
					semanticExecutions += 1;
					throw new Error("worker receipt must precede Implementation review");
				},
			},
			workerAdapter: {
				isolationKinds: ["worktree"],
				async recover() {
					return undefined;
				},
				async execute(assignment) {
					executions += 1;
					return completedResult(assignment);
				},
			},
			workerWorktreeRunner() {
				return { exitCode: 0 };
			},
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:worker-service-dispatch",
			kind: "pi",
			supervision: "approved",
		});
		const dispatch = await client.reconcileWorkers({
			kind: "project_truth_changed",
		});
		assert.equal(dispatch.status, "scheduled");
		assert.deepEqual(dispatch.pendingWorkItemIds, [fixture.workItemId]);
		await waitForCoordinator(service.coordinator);
		assert.equal(executions, 1);
		const semanticReceipts = await client.react({ kind: "timer_due" });
		assert.deepEqual(semanticReceipts, []);
		assert.equal(semanticExecutions, 0);
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) {
			await waitForCoordinator(service.coordinator);
			await service.close().catch(() => undefined);
		}
		await rm(root, { recursive: true, force: true });
	}
});

test("worker claims remain held when elected coordinator lacks supervision", async () => {
	const root = await mkdtemp(`${tmpdir()}/codewiki-worker-held-`);
	await seedRuntimeImplementation(root, { suffix: "worker-held" });
	const coordinator = new ProjectCoordinator(root, {
		generationId: "generation:worker-held",
	});
	const dispatcher = new ImplementationWorkerDispatcher({
		repoRoot: root,
		coordinator,
		reactor: new RuntimeReactor(root),
		adapter: {
			isolationKinds: ["worktree"],
			async recover() {
				return undefined;
			},
			async execute() {
				assert.fail("unsupervised worker must not execute");
			},
		},
		loadConfig: async () => automaticConfig(),
		collectGitStatus: async () => gitStatus(root),
		worktreeRunner() {
			return { exitCode: 0 };
		},
	});
	try {
		const held = await dispatcher.reconcile({
			kind: "timer_due",
			occurredAt: "2026-07-21T12:00:00.000Z",
		});
		assert.equal(held.status, "held");
		assert.deepEqual(held.blockers, ["coordinator_execution_not_permitted"]);
		assert.equal((await buildProjectWorkState({ repoRoot: root })).assignments.length, 0);
	} finally {
		coordinator.close();
		await rm(root, { recursive: true, force: true });
	}
});
