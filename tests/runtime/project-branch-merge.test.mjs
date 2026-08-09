import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmod,
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
import { promisify } from "node:util";

import { createShellWorktreeCommandRunner } from "../../src/git/worktree-shell-runner.ts";
import { projectBranchMergeJob } from "../../src/runtime/effects/project-branch-merge.ts";
import { RuntimeReactor } from "../../src/runtime/coordinator/reactor.ts";
import { appendRuntimeTraceRecords } from "../../src/runtime/trace-writer.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { seedRuntimeImplementation } from "../helpers/runtime-implementation.mjs";

const execFile = promisify(execFileCallback);

async function gitRaw(root, args) {
	return (await execFile("git", args, { cwd: root })).stdout;
}

async function git(root, args) {
	return (await gitRaw(root, args)).trim();
}

async function mergeFixture(suffix) {
	const root = await mkdtemp(`${tmpdir()}/codewiki-project-merge-${suffix}-`);
	await git(root, ["init", "-q", "-b", "main"]);
	await git(root, ["config", "user.name", "CodeWiki Test"]);
	await git(root, ["config", "user.email", "codewiki@example.test"]);
	await mkdir(join(root, "src"), { recursive: true });
	await mkdir(join(root, ".codewiki"), { recursive: true });
	await writeFile(join(root, "src", "feature.ts"), "export const value = 1;\n");
	await writeFile(join(root, ".codewiki", ".gitkeep"), "");
	await git(root, ["add", "src/feature.ts", ".codewiki/.gitkeep"]);
	await git(root, ["commit", "-qm", "base"]);
	const seeded = await seedRuntimeImplementation(root, {
		suffix,
		pathScopes: ["src/feature.ts"],
	});
	await git(root, ["add", ".codewiki/traces"]);
	await git(root, ["commit", "-qm", "seed canonical trace"]);
	const baseCommit = await git(root, ["rev-parse", "HEAD"]);
	const integrationJobId = `implementation-integration:${"a".repeat(64)}`;
	await git(root, ["checkout", "-q", "-b", `codewiki/integration/${suffix}`]);
	await writeFile(join(root, "src", "feature.ts"), "export const value = 2;\n");
	await git(root, ["add", "src/feature.ts"]);
	await git(root, [
		"commit",
		"-qm",
		`codewiki: integrate ${seeded.workItemId}`,
		"-m",
		`CodeWiki-Integration-Job: ${integrationJobId}`,
	]);
	const commit = await git(root, ["rev-parse", "HEAD"]);
	const tree = await git(root, ["rev-parse", "HEAD^{tree}"]);
	const patch = await gitRaw(root, [
		"diff",
		"--binary",
		"--full-index",
		"--no-ext-diff",
		baseCommit,
		commit,
		"--",
	]);
	await git(root, ["checkout", "-q", "main"]);
	const integrationEvent = {
		type: "trace_event",
		id: `${seeded.traceId}:runtime:integration:${seeded.nextSequence}:fixture`,
		parentId: seeded.parentId,
		traceId: seeded.traceId,
		sequence: seeded.nextSequence,
		event: "runtime.integration.proven",
		refs: [
			`git-commit:${commit}`,
			`git-tree:${tree}`,
			`git-tree:${tree}`,
		],
		createdAt: "2026-07-23T10:00:00.000Z",
		data: {
			schemaVersion: 1,
			runtimeJobId: integrationJobId,
			traceId: seeded.traceId,
			workItemId: seeded.workItemId,
			claimId: `claim-${suffix}`,
			assignmentId: `assignment-${suffix}`,
			workerId: `worker-${suffix}`,
			workerReportRef: `runtime-worker-report:${"b".repeat(64)}`,
			targetRef: "project:default",
			targetRefs: [],
			baseCommit,
			parentCommit: baseCommit,
			commit,
			tree,
			contentProof: `git-tree:${tree}`,
			integratedPatchDigest: sha256Ref(patch),
			changedPaths: ["src/feature.ts"],
			checks: [
				{
					id: "git.diff_check",
					status: "passed",
					ref: `git-commit:${commit}`,
				},
			],
			committedAt: "2026-07-23T10:00:00.000Z",
		},
	};
	await appendRuntimeTraceRecords(root, [integrationEvent], seeded.expectedBytes);
	const commands = [];
	const shellRunner = createShellWorktreeCommandRunner();
	const runner = async (command, context) => {
		commands.push(command);
		return shellRunner(command, context);
	};
	return {
		root,
		seeded,
		baseCommit,
		commit,
		tree,
		integrationEvent,
		commands,
		runner,
		reactor: new RuntimeReactor(root),
	};
}

function mergeJob(context, overrides = {}) {
	return projectBranchMergeJob({
		repoRoot: context.root,
		reactor: context.reactor,
		integrationEvent: context.integrationEvent,
		authority: {
			kind: "policy",
			actor: "runtime:test",
			ref: "policy:project-branch-merge-test",
			targetBranch: "refs/heads/main",
		},
		createdAt: "2026-07-23T10:00:01.000Z",
		runner: context.runner,
		...overrides,
	});
}

async function traceRecords(context) {
	return (await readFile(
		join(context.root, ".codewiki", "traces", `${context.seeded.traceId}.jsonl`),
		"utf8",
	))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
}

function sha256Ref(value) {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

test("exact Integration commit fast-forwards project branch and appends merge proof", async () => {
	const context = await mergeFixture("proof");
	let ownershipChecks = 0;
	try {
		const hookPath = join(context.root, ".git", "hooks", "post-merge");
		await writeFile(
			hookPath,
			`#!/bin/sh\ntouch ${JSON.stringify(join(context.root, "hook-ran"))}\n`,
		);
		await chmod(hookPath, 0o755);
		const authority = {
			kind: "policy",
			actor: "runtime:test",
			ref: "policy:project-branch-merge-test",
			targetBranch: "refs/heads/main",
		};
		const job = mergeJob(context, {
			authority,
			beforeAppend() {
				ownershipChecks += 1;
			},
		});
		authority.actor = "runtime:mutated-after-schedule";
		context.integrationEvent.data.changedPaths = ["src/mutated-after-schedule.ts"];
		context.integrationEvent.data.integratedPatchDigest = `sha256:${"0".repeat(64)}`;
		assert.match(job.idempotencyKey, /^project-branch-merge:[a-f0-9]{64}$/);
		assert.deepEqual(job.lane, {
			kind: "effect",
			targetRef: "refs/heads/main",
		});
		const receipt = await job.run(new AbortController().signal);
		assert.equal(ownershipChecks, 2);
		assert.equal(receipt.previousCommit, context.baseCommit);
		assert.equal(receipt.commit, context.commit);
		assert.equal(await git(context.root, ["rev-parse", "main"]), context.commit);
		assert.equal(
			(await git(context.root, ["status", "--porcelain=v1"]))
				.split("\n")
				.filter((line) => line && !line.includes(".codewiki/traces"))
				.join("\n"),
			"",
		);
		assert.equal(
			await readFile(join(context.root, "src", "feature.ts"), "utf8"),
			"export const value = 2;\n",
		);
		const records = await traceRecords(context);
		const proof = records.at(-1);
		assert.equal(proof.event, "runtime.project_branch.merged");
		assert.equal(proof.parentId, context.integrationEvent.id);
		assert.equal(proof.data.runtimeJobId, job.idempotencyKey);
		assert.equal(proof.data.targetBranch, "refs/heads/main");
		assert.equal(proof.data.expectedTargetCommit, context.baseCommit);
		assert.equal(proof.data.commit, context.commit);
		assert.deepEqual(proof.data.authority, {
			kind: "policy",
			actor: "runtime:test",
			ref: "policy:project-branch-merge-test",
		});
		const recovered = await job.recover();
		assert.equal(recovered.status, "completed");
		assert.deepEqual(recovered.result, receipt);
		await assert.rejects(readFile(join(context.root, "hook-ran"), "utf8"), {
			code: "ENOENT",
		});
		assert.equal(
			context.commands.some(
				(command) => command.args.includes("push") || command.args.includes("publish"),
			),
			false,
		);
		const workState = await buildProjectWorkState({ repoRoot: context.root });
		const item = workState.workItems.find(
			(candidate) => candidate.id === context.seeded.workItemId,
		);
		assert.deepEqual(item.mergeProofs, [
			{
				eventId: proof.id,
				jobId: job.idempotencyKey,
				integrationEventId: context.integrationEvent.id,
				targetBranch: "refs/heads/main",
				previousCommit: context.baseCommit,
				commit: context.commit,
				tree: context.tree,
				contentProof: `git-tree:${context.tree}`,
				authorityKind: "policy",
				authorityActor: "runtime:test",
				authorityRef: "policy:project-branch-merge-test",
				mergedAt: "2026-07-23T10:00:01.000Z",
			},
		]);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("merge-to-append crash recovers exact moved branch without another merge", async () => {
	const context = await mergeFixture("crash");
	let ownershipChecks = 0;
	try {
		await assert.rejects(
			mergeJob(context, {
				beforeAppend() {
					ownershipChecks += 1;
					if (ownershipChecks === 2) throw new Error("simulated merge append crash");
				},
			}).run(new AbortController().signal),
			/simulated merge append crash/,
		);
		assert.equal(await git(context.root, ["rev-parse", "main"]), context.commit);
		assert.equal(
			(await traceRecords(context)).filter(
				(record) => record.event === "runtime.project_branch.merged",
			).length,
			0,
		);
		const receipt = await mergeJob(context).run(new AbortController().signal);
		assert.equal(receipt.commit, context.commit);
		assert.equal(
			context.commands.filter((command) => command.args.includes("merge")).length,
			1,
		);
		assert.equal(
			(await traceRecords(context)).filter(
				(record) => record.event === "runtime.project_branch.merged",
			).length,
			1,
		);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("stale or non-fast-forward target is rejected without branch movement", async () => {
	const context = await mergeFixture("stale");
	try {
		await writeFile(join(context.root, "unrelated.txt"), "new target work\n");
		await git(context.root, ["add", "unrelated.txt"]);
		await git(context.root, ["commit", "-qm", "move target"]);
		const movedCommit = await git(context.root, ["rev-parse", "HEAD"]);
		await assert.rejects(
			mergeJob(context).run(new AbortController().signal),
			/branch moved after Integration proof/i,
		);
		assert.equal(await git(context.root, ["rev-parse", "HEAD"]), movedCommit);
		assert.equal(
			(await traceRecords(context)).some(
				(record) => record.event === "runtime.project_branch.merged",
			),
			false,
		);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("dirty checkout and wrong checked-out branch fail closed", async () => {
	const dirty = await mergeFixture("dirty");
	try {
		await writeFile(join(dirty.root, "untracked.txt"), "do not overwrite\n");
		await assert.rejects(
			mergeJob(dirty).run(new AbortController().signal),
			/requires a clean project checkout/i,
		);
		assert.equal(await git(dirty.root, ["rev-parse", "main"]), dirty.baseCommit);
	} finally {
		await rm(dirty.root, { recursive: true, force: true });
	}

	const branch = await mergeFixture("branch");
	try {
		await git(branch.root, ["checkout", "-q", `codewiki/integration/branch`]);
		await assert.rejects(
			mergeJob(branch).run(new AbortController().signal),
			/not the checked-out branch/i,
		);
		assert.equal(await git(branch.root, ["rev-parse", "main"]), branch.baseCommit);
	} finally {
		await rm(branch.root, { recursive: true, force: true });
	}
});

test("failed or malformed structured merge execution leaves target unchanged", async () => {
	const failed = await mergeFixture("failed-runner");
	try {
		const runner = async (command, context) =>
			command.args.includes("merge")
				? { exitCode: 1, stdout: "", stderr: "not a fast-forward" }
				: failed.runner(command, context);
		await assert.rejects(
			mergeJob(failed, { runner }).run(new AbortController().signal),
			/fast-forward failed \(1\): not a fast-forward/i,
		);
		assert.equal(await git(failed.root, ["rev-parse", "main"]), failed.baseCommit);
	} finally {
		await rm(failed.root, { recursive: true, force: true });
	}

	const malformed = await mergeFixture("malformed-runner");
	try {
		await assert.rejects(
			mergeJob(malformed, { runner: async () => undefined }).run(
				new AbortController().signal,
			),
			/returned no exit status/i,
		);
		assert.equal(
			await git(malformed.root, ["rev-parse", "main"]),
			malformed.baseCommit,
		);
	} finally {
		await rm(malformed.root, { recursive: true, force: true });
	}
});

test("symbolic disabled-hooks path fails closed before branch mutation", async () => {
	const context = await mergeFixture("hook-symlink");
	try {
		await mkdir(join(context.root, ".codewiki", "runtime"), {
			recursive: true,
		});
		await symlink(
			join(context.root, ".git", "hooks"),
			join(context.root, ".codewiki", "runtime", "empty-hooks"),
			"dir",
		);
		await assert.rejects(
			mergeJob(context).run(new AbortController().signal),
			/hooks path cannot be symbolic/i,
		);
		assert.equal(await git(context.root, ["rev-parse", "main"]), context.baseCommit);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});

test("tampered Integration proof and invalid authority are rejected", async () => {
	const context = await mergeFixture("tamper");
	try {
		for (const targetBranch of ["HEAD", "refs/heads/main..evil"]) {
			assert.throws(
				() =>
					mergeJob(context, {
						authority: {
							kind: "policy",
							actor: "runtime:test",
							ref: "policy:test",
							targetBranch,
						},
					}),
				/exact local branch ref/i,
			);
		}
		const tamperedEvent = {
			...context.integrationEvent,
			data: {
				...context.integrationEvent.data,
				tree: context.baseCommit,
				contentProof: `git-tree:${context.baseCommit}`,
			},
		};
		await assert.rejects(
			mergeJob(context, { integrationEvent: tamperedEvent }).run(
				new AbortController().signal,
			),
			/not canonical/i,
		);
		assert.equal(await git(context.root, ["rev-parse", "main"]), context.baseCommit);
	} finally {
		await rm(context.root, { recursive: true, force: true });
	}
});
