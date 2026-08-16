import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createShellWorktreeCommandRunner } from "../../../src/git/worktree-shell-runner.ts";
import {
	IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
	implementationWorkerJobId,
} from "../../../src/runtime/workers/implementation-adapter.ts";
import { IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION } from "../../../src/runtime/workers/implementation-artifacts.ts";
import { implementationWorkerIntegrationJob } from "../../../src/runtime/integration/worker.ts";
import { RuntimeReactor } from "../../../src/runtime/coordinator/reactor.ts";
import { appendRuntimeTraceRecords } from "../../../src/runtime/persistence/trace.ts";
import {producerSkills} from "../../helpers/checks.mjs";
import { seedRuntimeImplementation } from "../../helpers/runtime-implementation.mjs";

const execFile = promisify(execFileCallback);

async function git(root, args) {
	const result = await execFile("git", args, { cwd: root });
	return result.stdout.trim();
}

async function integrationFixture(suffix, pathScopes = ["src/**"]) {
	const root = await mkdtemp(`${tmpdir()}/codewiki-integration-${suffix}-`);
	await git(root, ["init", "-q"]);
	await git(root, ["config", "user.name", "CodeWiki Test"]);
	await git(root, ["config", "user.email", "codewiki@example.test"]);
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "src", "feature.ts"), "export const value = 1;\n");
	await git(root, ["add", "src/feature.ts"]);
	await git(root, ["commit", "-qm", "base"]);
	const baseCommit = await git(root, ["rev-parse", "HEAD"]);
	const fixture = await seedRuntimeImplementation(root, {
		suffix,
		pathScopes,
	});
	const workerPath = join(
		root,
		".codewiki",
		"runtime",
		"tmp",
		`worker-${suffix}`,
	);
	await mkdir(join(workerPath, ".."), { recursive: true });
	await git(root, [
		"worktree",
		"add",
		"-q",
		"-b",
		`codewiki/test-worker-${suffix}`,
		workerPath,
		baseCommit,
	]);
	await writeFile(join(workerPath, "src", "feature.ts"), "export const value = 2;\n");
	await writeFile(join(workerPath, "src", "added.ts"), "export const added = true;\n");

	const assignmentId = `assignment-${suffix}`;
	const claimId = `claim-${suffix}`;
	const workerId = `worker-${suffix}`;
	const assignment = {
		schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
		repoRoot: root,
		assignmentId,
		workerId,
		workItemId: fixture.workItemId,
		claimId,
		traceId: fixture.traceId,
		planningRefs: [fixture.planningRef],
		traceRefs: [fixture.traceId],
		componentRefs: ["api"],
		pathScopes,
		workStateDigest: `sha256:${"a".repeat(64)}`,
		sourceBaseRef: `git:${baseCommit}`,
		contextDigest: `sha256:${"b".repeat(64)}`,
		producerSkillReceipt: producerSkills().receipt,
		prompt: "Implement exact fixture.",
		reportPath: join(
			root,
			".codewiki",
			"runtime",
			"workers",
			`${"c".repeat(32)}.json`,
		),
		isolation: { kind: "worktree", ref: workerPath },
		worktree: {
			path: workerPath,
			branch: `codewiki/test-worker-${suffix}`,
			baseRef: baseCommit,
			baseSha: baseCommit,
		},
	};
	const packet = {
		schemaVersion: IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION,
		claimEventId: `${fixture.traceId}:runtime:claim:${suffix}`,
		assignment,
		worktreePlan: {
			workUnitId: fixture.workItemId,
			traceId: fixture.traceId,
			workerId,
			required: true,
			reason: "test",
			pathScopes,
			worktree: assignment.worktree,
			commands: {
				worktreePrepare: [],
				worktreeVerify: [],
				worktreeCleanup: [],
			},
		},
	};
	const report = {
		assignmentId,
		workerId,
		workItemId: fixture.workItemId,
		status: "completed",
		reportRef: `runtime-worker-report:${assignmentId}`,
		producerSkillReceipt: assignment.producerSkillReceipt,
	};
	const reactor = new RuntimeReactor(root);
	const beforeClaim = await reactor.observe({
		kind: "timer_due",
		occurredAt: "2026-07-22T09:59:59.000Z",
	});
	const claimSequence =
		Math.max(
			...beforeClaim.records.flatMap((record) =>
				record.type === "trace_event" ? [record.sequence] : [],
			),
		) + 1;
	await appendRuntimeTraceRecords(
		root,
		[
			{
				type: "trace_event",
				id: packet.claimEventId,
				parentId: fixture.planningEvents[0].id,
				traceId: fixture.traceId,
				sequence: claimSequence,
				event: "runtime.work_unit.claimed",
				refs: [fixture.planningRef, ...pathScopes],
				createdAt: "2026-07-22T10:00:00.000Z",
				data: {
					claimId,
					workerId,
					workUnitId: fixture.workItemId,
					planningRefs: [fixture.planningRef],
					pathScopes,
					runtimeJobId: implementationWorkerJobId(assignment),
					runtimeAssignmentDigest: sha256Ref(stableJson(packet)),
				},
			},
		],
		beforeClaim.expectedBytesByTrace[fixture.traceId],
	);
	reactor.invalidate(fixture.traceId);
	const beforeAcceptance = await reactor.observe({
		kind: "timer_due",
		occurredAt: "2026-07-22T10:00:00.500Z",
	});
	const sequence =
		Math.max(
			...beforeAcceptance.records.flatMap((record) =>
				record.type === "trace_event" ? [record.sequence] : [],
			),
		) + 1;
	const acceptanceEvent = {
		type: "trace_event",
		id: `${fixture.traceId}:implementation:accepted:${sequence}`,
		parentId: fixture.planningEvents[0].id,
		traceId: fixture.traceId,
		sequence,
		loop: "implementation",
		event: "evidence_accepted",
		refs: [fixture.planningRef],
		createdAt: "2026-07-22T10:00:01.000Z",
		data: { output: { coveredWorkItemRefs: [fixture.workItemId] } },
	};
	await appendRuntimeTraceRecords(root, [acceptanceEvent], beforeAcceptance.expectedBytesByTrace[fixture.traceId]);
	return {
		root,
		baseCommit,
		fixture,
		workerPath,
		packet,
		report,
		acceptanceEvent,
		reactor,
		runner: createShellWorktreeCommandRunner({
			cwd: root,
			timeoutMs: 30_000,
			maxBufferBytes: 8 * 1024 * 1024,
		}),
	};
}

function sha256Ref(value) {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function integrationJob(context, overrides = {}) {
	return implementationWorkerIntegrationJob({
		repoRoot: context.root,
		reactor: context.reactor,
		packet: context.packet,
		report: context.report,
		acceptanceEvent: context.acceptanceEvent,
		sprintId: context.fixture.sprintId,
		targetRefs: [],
		createdAt: "2026-07-22T10:00:02.000Z",
		runner: context.runner,
		...overrides,
	});
}

test("accepted worker patch becomes exact integration commit and canonical Git proof", async () => {
	const context = await integrationFixture("proof");
	try {
		const job = integrationJob(context);
		assert.match(job.idempotencyKey, /^implementation-integration:[a-f0-9]{64}$/);
		assert.deepEqual(job.lane, {
			kind: "integration",
			targetRef: "project:default",
			baseRef: context.baseCommit,
		});
		const receipt = await job.run(new AbortController().signal);
		assert.match(receipt.commit, /^[a-f0-9]{40}$/);
		assert.match(receipt.tree, /^[a-f0-9]{40}$/);
		assert.equal(await git(context.root, ["rev-parse", "HEAD"]), context.baseCommit);
		assert.equal(
			await git(context.root, ["show", `${receipt.commit}:src/feature.ts`]),
			"export const value = 2;",
		);
		assert.equal(
			await git(context.root, ["show", `${receipt.commit}:src/added.ts`]),
			"export const added = true;",
		);
		const records = (await readFile(
			join(context.root, ".codewiki", "traces", `${context.fixture.traceId}.jsonl`),
			"utf8",
		))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		const proof = records.at(-1);
		assert.equal(proof.event, "runtime.integration.proven");
		assert.equal(proof.data.runtimeJobId, job.idempotencyKey);
		assert.equal(proof.data.commit, receipt.commit);
		assert.equal(proof.data.tree, receipt.tree);
		assert.equal(proof.data.contentProof, `git-tree:${receipt.tree}`);
		assert.deepEqual(proof.data.changedPaths, ["src/added.ts", "src/feature.ts"]);
		assert.deepEqual(proof.data.checks, [
			{
				id: "git.diff_check",
				status: "passed",
				ref: `git-commit:${receipt.commit}`,
			},
		]);
		const recovered = await job.recover();
		assert.equal(recovered.status, "completed");
		assert.deepEqual(recovered.result, receipt);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("commit-to-append crash recovers exact local commit without duplicate integration", async () => {
	const context = await integrationFixture("crash");
	let appendAttempts = 0;
	try {
		await assert.rejects(
			integrationJob(context, {
				beforeAppend() {
					appendAttempts += 1;
					throw new Error("simulated integration append crash");
				},
			}).run(new AbortController().signal),
			/simulated integration append crash/,
		);
		const integrationBranch = await git(context.root, [
			"for-each-ref",
			"--format=%(refname:short)",
			"refs/heads/codewiki/integration/",
		]);
		assert.match(integrationBranch, /^codewiki\/integration\//);
		const commitBeforeRecovery = await git(context.root, [
			"rev-parse",
			integrationBranch,
		]);
		const worktreeList = await git(context.root, ["worktree", "list", "--porcelain"]);
		const integrationBlock = worktreeList
			.split("\n\n")
			.find((block) => block.includes(`branch refs/heads/${integrationBranch}`));
		const integrationPath = integrationBlock
			?.split("\n")
			.find((line) => line.startsWith("worktree "))
			?.slice("worktree ".length);
		assert.ok(integrationPath);
		await git(integrationPath, ["commit", "--allow-empty", "-qm", "later integration"]);
		const laterCommit = await git(context.root, ["rev-parse", integrationBranch]);
		assert.notEqual(laterCommit, commitBeforeRecovery);
		const recovered = await integrationJob(context).run(
			new AbortController().signal,
		);
		assert.equal(recovered.commit, commitBeforeRecovery);
		assert.equal(appendAttempts, 1);
		const integrationJobCommits = await git(context.root, [
			"log",
			"--format=%H",
			"--fixed-strings",
			`--grep=CodeWiki-Integration-Job: ${integrationJob(context).idempotencyKey}`,
			`${context.baseCommit}..${integrationBranch}`,
		]);
		assert.deepEqual(integrationJobCommits.split("\n").filter(Boolean), [
			commitBeforeRecovery,
		]);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("integration rejects packet drift after canonical Claim authorization", async () => {
	const context = await integrationFixture("claim-drift");
	try {
		const packet = {
			...context.packet,
			assignment: {
				...context.packet.assignment,
				prompt: "Tampered after Claim append.",
			},
		};
		await assert.rejects(
			integrationJob(context, { packet }).run(new AbortController().signal),
			/Claim authority is stale/,
		);
		const trace = await readFile(
			join(context.root, ".codewiki", "traces", `${context.fixture.traceId}.jsonl`),
			"utf8",
		);
		assert.equal(trace.includes("runtime.integration.proven"), false);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("integration fails closed when structured Git runner returns no status", async () => {
	const context = await integrationFixture("runner-status");
	try {
		await assert.rejects(
			integrationJob(context, {
				runner: async () => undefined,
			}).run(new AbortController().signal),
			/Git runner returned no exit status/,
		);
		const trace = await readFile(
			join(context.root, ".codewiki", "traces", `${context.fixture.traceId}.jsonl`),
			"utf8",
		);
		assert.equal(trace.includes("runtime.integration.proven"), false);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("integration rejects worker changes outside Planning path scope", async () => {
	const context = await integrationFixture("scope", ["src/feature.ts"]);
	try {
		await writeFile(join(context.workerPath, "outside.txt"), "not authorized\n");
		await assert.rejects(
			integrationJob(context).run(new AbortController().signal),
			/escape Planning scope: outside\.txt/,
		);
		const integrationBranch = await git(context.root, [
			"for-each-ref",
			"--format=%(refname:short)",
			"refs/heads/codewiki/integration/",
		]);
		assert.match(integrationBranch, /^codewiki\/integration\//);
		assert.equal(
			await git(context.root, [
				"rev-list",
				"--count",
				`${context.baseCommit}..${integrationBranch}`,
			]),
			"0",
		);
		const trace = await readFile(
			join(context.root, ".codewiki", "traces", `${context.fixture.traceId}.jsonl`),
			"utf8",
		);
		assert.equal(trace.includes("runtime.integration.proven"), false);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});
