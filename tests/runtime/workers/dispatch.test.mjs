import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCodeWikiLoopExecutionPorts } from "../../../src/api/loop-execution.ts";
import { writeWikiConfigFile } from "../../../src/project/config-file.ts";
import { resolveWikiConfig } from "../../../src/project/config.ts";
import { readImplementationWorkerDispatchPackets } from "../../../src/runtime/workers/implementation-artifacts.ts";
import { ImplementationWorkerDispatcher } from "../../../src/runtime/workers/dispatch.ts";
import { implementationWorkerClaimReleaseJob } from "../../../src/runtime/claims/release.ts";
import { ProjectCoordinator } from "../../../src/runtime/coordinator/project.ts";
import { appendRuntimeTraceRecords } from "../../../src/runtime/trace-writer.ts";
import {
	connectProjectCoordinatorClient,
	startProjectCoordinatorService,
} from "../../../src/runtime/coordinator/service.ts";
import { RuntimeReactor } from "../../../src/runtime/coordinator/reactor.ts";
import { buildProjectWorkState } from "../../../src/work-state/project.ts";
import { seedRuntimeImplementation } from "../../helpers/runtime-implementation.mjs";

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

const TEST_BASE_SHA = "a".repeat(40);

function gitStatus(root) {
	return {
		repoRoot: root,
		baseRef: "HEAD",
		baseSha: TEST_BASE_SHA,
		dirtyPaths: [],
		errors: [],
		gitRoot: root,
		isGitRepository: true,
	};
}

function completedResult(assignment, status = "completed") {
	return {
		assignmentId: assignment.assignmentId,
		workerId: assignment.workerId,
		workItemId: assignment.workItemId,
		status,
		reportRef: `runtime-worker-report:${assignment.assignmentId}`,
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
		assert.equal(executions[0].sourceBaseRef, `git:${TEST_BASE_SHA}`);
		assert.equal(executions[0].worktree.baseRef, TEST_BASE_SHA);
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
		assert.match(claim?.data?.runtimeAssignmentDigest, /^sha256:[a-f0-9]{64}$/);
		await assert.rejects(
			implementationWorkerClaimReleaseJob({
				repoRoot: root,
				reactor: new RuntimeReactor(root),
				assignment: executions[0],
				report: persisted.get(executions[0].assignmentId),
				claimEvent: claim,
				createdAt: "2026-07-21T10:00:01.500Z",
			}).run(new AbortController().signal),
			/Completed claim cannot release before Implementation acceptance/i,
		);

		const sequence =
			Math.max(
				...observed.records.flatMap((record) =>
					record.type === "trace_event" ? [record.sequence] : [],
				),
			) + 1;
		await appendRuntimeTraceRecords(
			root,
			[
				{
					type: "trace_event",
					id: `${fixture.traceId}:implementation:accepted:${sequence}`,
					parentId: fixture.planningEvents[0].id,
					traceId: fixture.traceId,
					sequence,
					loop: "implementation",
					event: "evidence_accepted",
					refs: [fixture.planningRef],
					createdAt: "2026-07-21T10:00:02.000Z",
					data: {
						output: { coveredWorkItemRefs: [fixture.workItemId] },
					},
				},
			],
			observed.expectedBytesByTrace[fixture.traceId],
		);
		const releasing = await dispatcher.reconcile({
			kind: "project_truth_changed",
			occurredAt: "2026-07-21T10:00:03.000Z",
		});
		assert.deepEqual(releasing.reviewReadyWorkItemIds, []);
		assert.equal(
			releasing.scheduledJobIds.some((jobId) =>
				jobId.startsWith("implementation-integration:"),
			),
			true,
		);
		assert.equal(
			releasing.scheduledJobIds.some((jobId) =>
				jobId.startsWith("implementation-worker-release:"),
			),
			true,
		);
		await waitForCoordinator(coordinator);
		const released = await buildProjectWorkState({ repoRoot: root });
		assert.equal(released.assignments[0].status, "released");
		assert.equal(released.workItems[0].implemented, true);
		const settled = await new RuntimeReactor(root).observe({
			kind: "timer_due",
			occurredAt: "2026-07-21T10:00:04.000Z",
		});
		const releaseEvents = settled.records.filter(
			(record) =>
				record.type === "trace_event" &&
				record.event === "runtime.work_unit.claim.released",
		);
		assert.equal(releaseEvents.length, 1);
		assert.match(
			releaseEvents[0].data?.runtimeJobId,
			/^implementation-worker-release:[a-f0-9]{64}$/,
		);
		assert.match(
			releaseEvents[0].data?.workerReportRef,
			/^runtime-worker-report:/,
		);
		const integrationRetry = await dispatcher.reconcile({
			kind: "timer_due",
			occurredAt: "2026-07-21T10:00:05.000Z",
		});
		assert.equal(
			integrationRetry.scheduledJobIds.some((jobId) =>
				jobId.startsWith("implementation-integration:"),
			),
			true,
		);
		await waitForCoordinator(coordinator);
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
		const resumed = await dispatchWith(replacement, "2026-07-21T11:01:00.000Z");
		assert.equal(resumed.status, "scheduled");
		assert.deepEqual(resumed.pendingWorkItemIds, []);
		assert.deepEqual(resumed.reviewReadyWorkItemIds, [fixture.workItemId]);
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
	const persisted = new Map();
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
			loopExecutionPorts: createCodeWikiLoopExecutionPorts(),
			semanticAdapters: {
				implementation(invocation) {
					semanticExecutions += 1;
					assert.equal(invocation.workerReports.length, 1);
					assert.equal(
						invocation.workerReports[0].workUnitId,
						fixture.workItemId,
					);
					return {};
				},
			},
			workerAdapter: {
				isolationKinds: ["worktree"],
				async recover(assignment) {
					return persisted.get(assignment.assignmentId);
				},
				async execute(assignment) {
					executions += 1;
					const result = completedResult(assignment);
					persisted.set(assignment.assignmentId, result);
					return result;
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
		const ready = await client.reconcileWorkers({ kind: "timer_due" });
		assert.deepEqual(ready.pendingWorkItemIds, []);
		assert.deepEqual(ready.reviewReadyWorkItemIds, [fixture.workItemId]);
		const semanticReceipts = await client.react(
			{ kind: "timer_due" },
			"preview",
		);
		assert.equal(semanticReceipts.length, 1);
		assert.equal(semanticReceipts[0].loop, "implementation");
		assert.equal(semanticExecutions, 1);
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) {
			await waitForCoordinator(service.coordinator);
			await service.close().catch(() => undefined);
		}
		await rm(root, { recursive: true, force: true });
	}
});

for (const terminalStatus of ["failed", "cancelled"]) {
	test(`${terminalStatus} worker reports release claims without becoming Implementation truth`, async () => {
		const root = await mkdtemp(
			`${tmpdir()}/codewiki-worker-${terminalStatus}-release-`,
		);
		const fixture = await seedRuntimeImplementation(root, {
			suffix: `worker-${terminalStatus}-release`,
			pathScopes: [`src/worker-${terminalStatus}/**`],
		});
		const coordinator = new ProjectCoordinator(root, {
			generationId: `generation:worker-${terminalStatus}-release`,
		});
		const client = coordinator.connectClient({
			clientId: `pi:worker-${terminalStatus}-release`,
		kind: "pi",
		supervision: "approved",
	});
		const persisted = new Map();
		const dispatcher = new ImplementationWorkerDispatcher({
			repoRoot: root,
			coordinator,
			reactor: new RuntimeReactor(root),
			adapter: {
				isolationKinds: ["worktree"],
				async recover(assignment) {
					return persisted.get(assignment.assignmentId);
				},
				async execute(assignment) {
					const result = completedResult(assignment, terminalStatus);
					persisted.set(assignment.assignmentId, result);
					return result;
				},
			},
			loadConfig: async () => automaticConfig(),
			collectGitStatus: async () => gitStatus(root),
			worktreeRunner() {
				return { exitCode: 0 };
			},
			now: () => "2026-07-21T11:30:00.000Z",
		});
		try {
			await dispatcher.reconcile({
				kind: "project_truth_changed",
				occurredAt: "2026-07-21T11:30:00.000Z",
			});
			await waitForCoordinator(coordinator);
			const releasing = await dispatcher.reconcile({
				kind: "timer_due",
				occurredAt: "2026-07-21T11:30:01.000Z",
			});
			assert.deepEqual(releasing.reviewReadyWorkItemIds, []);
			assert.equal(
				releasing.scheduledJobIds.some((jobId) =>
					jobId.startsWith("implementation-worker-release:"),
				),
				true,
			);
			await waitForCoordinator(coordinator);
			const state = await buildProjectWorkState({ repoRoot: root });
			assert.equal(state.assignments[0].status, "released");
			assert.equal(state.workItems[0].id, fixture.workItemId);
			assert.equal(state.workItems[0].implemented, false);
			const records = (await readFile(
				join(root, ".codewiki", "traces", `${fixture.traceId}.jsonl`),
				"utf8",
			))
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			const release = records.findLast(
				(record) => record.event === "runtime.work_unit.claim.released",
			);
			assert.equal(release.data.completionStatus, terminalStatus);
		} finally {
			client.disconnect();
			await waitForCoordinator(coordinator);
			coordinator.close();
			await rm(root, { recursive: true, force: true });
		}
	});
}

test("container-only adapters hold before Claim append when unavailable and produce container Assignments when ready", async () => {
	const root = await mkdtemp(`${tmpdir()}/codewiki-container-dispatch-`);
	const fixture = await seedRuntimeImplementation(root, {
		suffix: "container-dispatch",
		pathScopes: ["src/container-dispatch/**"],
	});
	const coordinator = new ProjectCoordinator(root, {
		generationId: "generation:container-dispatch",
	});
	const client = coordinator.connectClient({
		clientId: "pi:container-dispatch",
		kind: "pi",
		supervision: "approved",
	});
	let available = false;
	const executions = [];
	const adapter = {
		isolationKinds: ["container"],
		async availability() {
			return available
				? { available: true }
				: { available: false, reason: "container runtime unavailable" };
		},
		async recover() {
			return undefined;
		},
		async execute(assignment) {
			executions.push(assignment);
			return completedResult(assignment);
		},
	};
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
		now: () => "2026-07-21T11:45:00.000Z",
	});
	try {
		const held = await dispatcher.reconcile({
			kind: "project_truth_changed",
			occurredAt: "2026-07-21T11:45:00.000Z",
		});
		assert.equal(held.status, "held");
		assert.deepEqual(held.blockers, [
			"implementation_worker_adapter_unavailable:container_runtime_unavailable",
		]);
		assert.equal(
			(await buildProjectWorkState({ repoRoot: root })).assignments.length,
			0,
		);
		assert.equal((await readImplementationWorkerDispatchPackets(root)).length, 0);

		available = true;
		const scheduled = await dispatcher.reconcile({
			kind: "timer_due",
			occurredAt: "2026-07-21T11:45:01.000Z",
		});
		assert.equal(scheduled.status, "scheduled");
		await waitForCoordinator(coordinator);
		assert.equal(executions.length, 1);
		assert.equal(executions[0].workItemId, fixture.workItemId);
		assert.equal(executions[0].isolation.kind, "container");
		assert.match(executions[0].isolation.ref, /^container:[a-f0-9]{64}$/u);
		const [packet] = await readImplementationWorkerDispatchPackets(root);
		assert.equal(packet.assignment.isolation.kind, "container");
	} finally {
		client.disconnect();
		await waitForCoordinator(coordinator);
		coordinator.close();
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
		assert.equal(
			(await buildProjectWorkState({ repoRoot: root })).assignments.length,
			0,
		);
	} finally {
		coordinator.close();
		await rm(root, { recursive: true, force: true });
	}
});
