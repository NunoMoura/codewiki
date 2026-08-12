import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
	implementationWorkerJobId,
} from "../../../src/runtime/workers/implementation-adapter.ts";
import { scheduleImplementationWorkerAssignments } from "../../../src/runtime/workers/jobs.ts";
import { ProjectCoordinator } from "../../../src/runtime/coordinator/project.ts";
import {
	connectProjectCoordinatorClient,
	startProjectCoordinatorService,
} from "../../../src/runtime/coordinator/service.ts";

function assignment(root, id, pathScope) {
	return {
		schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
		repoRoot: root,
		assignmentId: `assignment:${id}`,
		workerId: `worker:${id}`,
		workItemId: `work:${id}`,
		claimId: `claim:${id}`,
		traceId: `TRACE-CHG-${id}`,
		planningRefs: [`trace:TRACE-CHG-${id}#planning:1`],
		traceRefs: [`TRACE-CHG-${id}`],
		componentRefs: [`component:${id}`],
		pathScopes: [pathScope],
		workStateDigest: `sha256:work-state-${id}`,
		sourceBaseRef: "git:base:abc123",
		contextDigest: `sha256:context-${id}`,
		prompt: `Implement ${id}.`,
		reportPath: join(root, ".codewiki", "runtime", "workers", `${id}.json`),
		isolation: { kind: "worktree", ref: `worktree:${id}` },
		worktree: {
			path: join(root, ".codewiki", "runtime", "worktrees", id),
			branch: `codewiki/${id}`,
			baseRef: "abc123",
		},
	};
}

function result(input, status = "completed") {
	return {
		assignmentId: input.assignmentId,
		workerId: input.workerId,
		workItemId: input.workItemId,
		status,
		reportRef: `runtime-worker-report:${input.assignmentId}`,
	};
}

test("implementation worker jobs run independent assignments concurrently and hold path conflicts", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-jobs-"));
	const coordinator = new ProjectCoordinator(root, {
		generationId: "generation:worker-jobs",
		maxConcurrentJobs: 3,
	});
	const client = coordinator.connectClient({
		clientId: "pi:worker-supervisor",
		kind: "pi",
		supervision: "approved",
	});
	let active = 0;
	let peak = 0;
	const started = [];
	const adapter = {
		async recover() {
			return undefined;
		},
		async execute(input) {
			started.push(input.assignmentId);
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 20));
			active -= 1;
			return result(input);
		},
	};
	try {
		const receipts = await scheduleImplementationWorkerAssignments({
			coordinator,
			adapter,
			assignments: [
				assignment(root, "one", "src/one/**"),
				assignment(root, "two", "src/two/**"),
				assignment(root, "three", "src/one/file.ts"),
			],
		});
		assert.equal(receipts.length, 3);
		assert.equal(peak, 2);
		assert.deepEqual(started.slice(0, 2).sort(), [
			"assignment:one",
			"assignment:two",
		]);
		assert.equal(started[2], "assignment:three");
	} finally {
		client.disconnect();
		coordinator.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("implementation worker jobs recover durable Worker reports without reinvoking adapter", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-recovery-"));
	const input = assignment(root, "recovery", "src/recovery/**");
	const persisted = new Map();
	let executions = 0;
	const adapter = {
		async recover(candidate) {
			return persisted.get(candidate.assignmentId);
		},
		async execute(candidate) {
			executions += 1;
			const completed = result(candidate);
			persisted.set(candidate.assignmentId, completed);
			return completed;
		},
	};
	const first = new ProjectCoordinator(root, {
		generationId: "generation:worker-first",
	});
	const firstClient = first.connectClient({
		clientId: "pi:first",
		kind: "pi",
		supervision: "approved",
	});
	try {
		await scheduleImplementationWorkerAssignments({
			coordinator: first,
			adapter,
			assignments: [input],
		});
	} finally {
		firstClient.disconnect();
		first.close();
	}
	const replacement = new ProjectCoordinator(root, {
		generationId: "generation:worker-replacement",
	});
	const replacementClient = replacement.connectClient({
		clientId: "pi:replacement",
		kind: "pi",
		supervision: "approved",
	});
	try {
		const [recovered] = await scheduleImplementationWorkerAssignments({
			coordinator: replacement,
			adapter,
			assignments: [input],
		});
		assert.equal(recovered.report.status, "completed");
		assert.equal(executions, 1);
		assert.match(
			implementationWorkerJobId(input),
			/^implementation-worker:[a-f0-9]{64}$/,
		);
	} finally {
		replacementClient.disconnect();
		replacement.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("elected coordinator service schedules worker assignments through configured adapter", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-service-"));
	let service;
	let client;
	let executions = 0;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:worker-service",
			workerAdapter: {
				async recover() {
					return undefined;
				},
				async execute(input) {
					executions += 1;
					return result(input);
				},
			},
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:worker-service-supervisor",
			kind: "pi",
			supervision: "approved",
		});
		const [jobReceipt] = await service.scheduleWorkerAssignments([
			assignment(root, "service", "src/service/**"),
		]);
		assert.equal(jobReceipt.report.status, "completed");
		assert.equal(executions, 1);
		assert.equal(service.coordinator.snapshot().completedJobCount, 1);
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});

test("coordinator service drains active workers into cancelled reports", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-service-cancel-"));
	const started = Promise.withResolvers();
	let service;
	let client;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:worker-service-cancel",
			workerAdapter: {
				async recover() {
					return undefined;
				},
				async execute(input, signal) {
					started.resolve();
					await new Promise((resolve) =>
						signal.addEventListener("abort", resolve, { once: true }),
					);
					return result(input, "cancelled");
				},
			},
		});
		client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:worker-service-cancel-supervisor",
			kind: "pi",
			supervision: "approved",
		});
		const scheduled = service.scheduleWorkerAssignments([
			assignment(root, "service-cancel", "src/service-cancel/**"),
		]);
		await started.promise;
		await service.close();
		const [receipt] = await scheduled;
		assert.equal(receipt.report.status, "cancelled");
		assert.equal(service.coordinator.snapshot().jobs.length, 0);
	} finally {
		if (client) await client.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		await rm(root, { recursive: true, force: true });
	}
});

test("implementation worker jobs reject assignments without isolated worktree custody", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-custody-"));
	const coordinator = new ProjectCoordinator(root);
	const input = assignment(root, "missing-worktree", "src/runtime/**");
	delete input.worktree;
	let executions = 0;
	try {
		assert.throws(
			() =>
				scheduleImplementationWorkerAssignments({
					coordinator,
					adapter: {
						async recover() {
							return undefined;
						},
						async execute(candidate) {
							executions += 1;
							return result(candidate);
						},
					},
					assignments: [input],
				}),
			/Implementation worker assignment requires isolated worktree custody\./,
		);
		assert.equal(executions, 0);
	} finally {
		coordinator.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("implementation worker batches reject repeated Work Items", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-duplicate-"));
	const coordinator = new ProjectCoordinator(root);
	const first = assignment(root, "duplicate-one", "src/one/**");
	const second = {
		...assignment(root, "duplicate-two", "src/two/**"),
		workItemId: first.workItemId,
	};
	try {
		assert.throws(
			() => scheduleImplementationWorkerAssignments({
				coordinator,
				adapter: {
					async recover() {
						return undefined;
					},
					async execute(input) {
						return result(input);
					},
				},
				assignments: [first, second],
			}),
			/repeats Work Item/,
		);
	} finally {
		coordinator.close();
		await rm(root, { recursive: true, force: true });
	}
});
