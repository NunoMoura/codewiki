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
import { IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION } from "../../src/runtime/implementation-worker-adapter.ts";

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
