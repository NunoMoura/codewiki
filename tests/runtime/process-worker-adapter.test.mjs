import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPiProcessImplementationWorkerAdapter } from "../../src/pi/process-worker-adapter.ts";
import { IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION } from "../../src/runtime/workers/implementation-worker-adapter.ts";

function assignment(root) {
	return {
		schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
		repoRoot: root,
		assignmentId: "assignment:process-worker",
		workerId: "worker:process-worker",
		workItemId: "work:process-worker",
		claimId: "claim:process-worker",
		traceId: "TRACE-CHG-process-worker",
		planningRefs: ["trace:TRACE-CHG-process-worker#planning:1"],
		traceRefs: ["TRACE-CHG-process-worker"],
		componentRefs: ["component:runtime"],
		pathScopes: ["src/runtime/**"],
		workStateDigest: "sha256:work-state",
		sourceBaseRef: "git:base:abc123",
		contextDigest: "sha256:context",
		prompt: "Implement the assigned runtime change.",
		reportPath: join(
			root,
			".codewiki",
			"runtime",
			"workers",
			"process-worker.json",
		),
		isolation: { kind: "worktree", ref: "worktree:process-worker" },
		worktree: {
			path: join(root, ".codewiki", "runtime", "worktrees", "process-worker"),
			branch: "codewiki/process-worker",
			baseRef: "abc123",
		},
	};
}

function workerReport() {
	return [
		"```codewiki-worker-report",
		JSON.stringify({
			status: "completed",
			workUnitRef:
				"trace:TRACE-CHG-process-worker#planning:1#work:process-worker",
			changedFiles: ["src/runtime/example.ts"],
			checksRun: ["node --test tests/runtime/example.test.mjs"],
			contentProofRefs: ["sha256:content"],
			residualRisks: [],
			blockers: [],
			notes: "Completed in isolated worktree.",
			changes: [],
			discoveries: [
				{
					summary: "Out-of-scope runtime discrepancy",
					observedBehavior: "A neighboring runtime path violates the documented invariant.",
					desiredBehavior: "Runtime paths preserve the documented invariant.",
					affectedRefs: ["src/runtime/neighbor.ts"],
					sourceRefs: ["trace:worker:discovery:1"],
					claimedCategory: "behavior",
					claimedSeverity: "medium",
					claimedConfidence: "high",
				},
			],
		}),
		"```",
	].join("\n");
}

test("Pi process worker adapter persists and recovers normalized Worker reports", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-process-worker-"));
	const input = assignment(root);
	await mkdir(input.worktree.path, { recursive: true });
	let executions = 0;
	const adapter = createPiProcessImplementationWorkerAdapter({
		process: {
			async runner(command) {
				executions += 1;
				assert.equal(command.cwd, input.worktree.path);
				await mkdir(join(root, ".codewiki", "runtime", "workers"), {
					recursive: true,
				});
				await writeFile(command.outputFile, workerReport(), "utf8");
				return {
					pid: 4242,
					sessionId: "session:process-worker",
					outputFile: command.outputFile,
					exitCode: 0,
				};
			},
		},
	});
	try {
		const result = await adapter.execute(input, new AbortController().signal);
		assert.equal(result.status, "completed");
		assert.equal(result.pid, 4242);
		assert.equal(result.implementationEvidence?.workUnitId, input.workItemId);
		assert.equal(result.discoveries?.length, 1);
		assert.equal(
			result.discoveries?.[0].summary,
			"Out-of-scope runtime discrepancy",
		);
		assert.match(result.reportRef, /^runtime-worker-report:[a-f0-9]{64}$/);
		assert.equal(executions, 1);
		const persisted = JSON.parse(await readFile(input.reportPath, "utf8"));
		assert.equal(persisted.reportRef, result.reportRef);
		const recovered = await adapter.recover(input);
		assert.deepEqual(recovered, result);
		assert.equal(executions, 1);
		await writeFile(
			input.reportPath,
			JSON.stringify({ ...persisted, status: "blocked" }),
			"utf8",
		);
		await assert.rejects(
			adapter.recover(input),
			/report digest does not match/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Pi process worker adapter persists cancelled reports after start", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-process-worker-cancel-"));
	const input = assignment(root);
	await mkdir(input.worktree.path, { recursive: true });
	const started = Promise.withResolvers();
	const controller = new AbortController();
	const adapter = createPiProcessImplementationWorkerAdapter({
		process: {
			async runner(command) {
				started.resolve();
				await new Promise((resolve) =>
					command.signal.addEventListener("abort", resolve, { once: true }),
				);
				return {
					pid: 4343,
					outputFile: command.outputFile,
					exitCode: 1,
					signal: "SIGTERM",
					cancelled: true,
				};
			},
		},
	});
	try {
		const execution = adapter.execute(input, controller.signal);
		await started.promise;
		controller.abort();
		const report = await execution;
		assert.equal(report.status, "cancelled");
		assert.equal(report.implementationEvidence?.status, "cancelled");
		assert.match(report.error, /cancelled/i);
		assert.deepEqual(await adapter.recover(input), report);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Pi process worker adapter requires worktree isolation and runtime report paths", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-process-worker-guard-"));
	const base = assignment(root);
	const adapter = createPiProcessImplementationWorkerAdapter();
	try {
		await assert.rejects(
			adapter.execute(
				{ ...base, isolation: { kind: "container", ref: "container:test" } },
				new AbortController().signal,
			),
			/require explicit worktree isolation/,
		);
		await assert.rejects(
			adapter.recover({ ...base, reportPath: join(root, "outside.json") }),
			/must stay below \.codewiki\/runtime/,
		);
		const outside = join(root, "outside");
		await mkdir(join(root, ".codewiki", "runtime"), { recursive: true });
		await mkdir(outside, { recursive: true });
		await symlink(outside, join(root, ".codewiki", "runtime", "workers"));
		await assert.rejects(
			adapter.recover(base),
			/cannot traverse symbolic links/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
