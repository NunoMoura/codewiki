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
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createShellWorktreeCommandRunner } from "../../src/git/worktree-shell-runner.ts";
import { projectBranchMergeJob } from "../../src/runtime/effects/project-branch-merge.ts";
import { projectBranchPushJob } from "../../src/runtime/effects/project-branch-push.ts";
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

async function pushFixture(suffix) {
	const root = await mkdtemp(`${tmpdir()}/codewiki-project-push-${suffix}-`);
	const remoteRoot = await mkdtemp(`${tmpdir()}/codewiki-project-remote-${suffix}-`);
	await git(remoteRoot, ["init", "-q", "--bare"]);
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
	await git(root, ["remote", "add", "origin", remoteRoot]);
	await git(root, ["push", "-q", "origin", "main:main"]);

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
		id: `${seeded.traceId}:runtime:integration:${seeded.nextSequence}:push-fixture`,
		parentId: seeded.parentId,
		traceId: seeded.traceId,
		sequence: seeded.nextSequence,
		event: "runtime.integration.proven",
		refs: [`git-commit:${commit}`, `git-tree:${tree}`],
		createdAt: "2026-07-24T10:00:00.000Z",
		data: {
			schemaVersion: 1,
			runtimeJobId: integrationJobId,
			traceId: seeded.traceId,
			workItemId: seeded.workItemId,
			parentCommit: baseCommit,
			commit,
			tree,
			contentProof: `git-tree:${tree}`,
			integratedPatchDigest: sha256Ref(patch),
			changedPaths: ["src/feature.ts"],
		},
	};
	await appendRuntimeTraceRecords(root, [integrationEvent], seeded.expectedBytes);
	const reactor = new RuntimeReactor(root);
	const shellRunner = createShellWorktreeCommandRunner();
	await projectBranchMergeJob({
		repoRoot: root,
		reactor,
		integrationEvent,
		authority: {
			kind: "policy",
			actor: "runtime:test",
			ref: "policy:push-fixture-merge",
			targetBranch: "refs/heads/main",
		},
		createdAt: "2026-07-24T10:00:01.000Z",
		runner: shellRunner,
	}).run(new AbortController().signal);
	const records = await traceRecords(root, seeded.traceId);
	const mergeEvent = records.findLast(
		(record) => record.event === "runtime.project_branch.merged",
	);
	assert.ok(mergeEvent);
	const commands = [];
	const runner = async (command, context) => {
		commands.push(command);
		return shellRunner(command, context);
	};
	return {
		root,
		remoteRoot,
		seeded,
		baseCommit,
		commit,
		tree,
		mergeEvent,
		reactor,
		runner,
		commands,
	};
}

function pushJob(context, overrides = {}) {
	return projectBranchPushJob({
		repoRoot: context.root,
		reactor: context.reactor,
		mergeEvent: context.mergeEvent,
		authority: {
			kind: "user",
			actor: "user:maintainer",
			ref: "confirmation:push-reviewed-commit",
			remote: "origin",
			targetBranch: "refs/heads/main",
			expectedRemoteCommit: context.baseCommit,
		},
		createdAt: "2026-07-24T10:00:02.000Z",
		runner: context.runner,
		...overrides,
	});
}

async function traceRecords(root, traceId) {
	return (await readFile(
		join(root, ".codewiki", "traces", `${traceId}.jsonl`),
		"utf8",
	))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
}

async function remoteCommit(context) {
	return git(context.remoteRoot, ["rev-parse", "refs/heads/main"]);
}

async function advanceRemote(context, suffix) {
	const path = join(context.root, ".codewiki", "runtime", `remote-${suffix}`);
	await git(context.root, ["worktree", "add", "-q", "-b", `remote-${suffix}`, path, context.baseCommit]);
	await git(path, ["config", "user.name", "Remote Test"]);
	await git(path, ["config", "user.email", "remote@example.test"]);
	await writeFile(join(path, `remote-${suffix}.txt`), "remote advance\n");
	await git(path, ["add", `remote-${suffix}.txt`]);
	await git(path, ["commit", "-qm", "advance remote"]);
	const commit = await git(path, ["rev-parse", "HEAD"]);
	await git(path, ["push", "-q", "origin", `HEAD:main`]);
	return commit;
}

function sha256Ref(value) {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function cleanup(context) {
	await rm(context.root, { recursive: true, force: true });
	await rm(context.remoteRoot, { recursive: true, force: true });
}

test("exact merged branch pushes normally and appends external-effect proof", async () => {
	const context = await pushFixture("proof");
	let ownershipChecks = 0;
	try {
		const authority = {
			kind: "user",
			actor: "user:maintainer",
			ref: "confirmation:push-reviewed-commit",
			remote: "origin",
			targetBranch: "refs/heads/main",
			expectedRemoteCommit: context.baseCommit,
		};
		const hookPath = join(context.root, ".git", "hooks", "pre-push");
		await writeFile(
			hookPath,
			`#!/bin/sh\ntouch ${JSON.stringify(join(context.root, "push-hook-ran"))}\nexit 1\n`,
		);
		await chmod(hookPath, 0o755);
		const job = pushJob(context, {
			authority,
			beforeAppend() {
				ownershipChecks += 1;
			},
		});
		authority.actor = "user:mutated-after-schedule";
		context.mergeEvent.data.commit = context.baseCommit;
		assert.match(job.idempotencyKey, /^project-branch-push:[a-f0-9]{64}$/);
		const receipt = await job.run(new AbortController().signal);
		assert.equal(ownershipChecks, 2);
		assert.equal(receipt.previousRemoteCommit, context.baseCommit);
		assert.equal(receipt.commit, context.commit);
		assert.equal(await remoteCommit(context), context.commit);
		await assert.rejects(readFile(join(context.root, "push-hook-ran"), "utf8"), {
			code: "ENOENT",
		});
		const records = await traceRecords(context.root, context.seeded.traceId);
		const proof = records.at(-1);
		assert.equal(proof.event, "runtime.project_branch.pushed");
		assert.equal(proof.parentId, context.mergeEvent.id);
		assert.equal(proof.data.remote, "origin");
		assert.equal(proof.data.expectedRemoteCommit, context.baseCommit);
		assert.equal(proof.data.commit, context.commit);
		assert.deepEqual(proof.data.authority, {
			kind: "user",
			actor: "user:maintainer",
			ref: "confirmation:push-reviewed-commit",
		});
		assert.equal(
			context.commands.some((command) =>
				command.args.some((argument) => argument.startsWith("--force")),
			),
			false,
		);
		assert.equal(
			context.commands.some((command) => command.args.includes("publish")),
			false,
		);
		const recovered = await job.recover();
		assert.equal(recovered.status, "completed");
		assert.deepEqual(recovered.result, receipt);
		const workState = await buildProjectWorkState({ repoRoot: context.root });
		const item = workState.workItems.find(
			(candidate) => candidate.id === context.seeded.workItemId,
		);
		assert.equal(item.pushProofs?.[0]?.eventId, proof.id);
	} finally {
		await cleanup(context);
	}
});

test("explicit branch-absence authority creates exact remote branch", async () => {
	const context = await pushFixture("absent");
	try {
		await git(context.remoteRoot, ["update-ref", "-d", "refs/heads/main"]);
		const receipt = await pushJob(context, {
			authority: {
				kind: "user",
				actor: "user:maintainer",
				ref: "confirmation:create-remote-branch",
				remote: "origin",
				targetBranch: "refs/heads/main",
				expectedRemoteCommit: null,
			},
		}).run(new AbortController().signal);
		assert.equal(receipt.previousRemoteCommit, null);
		assert.equal(await remoteCommit(context), context.commit);
	} finally {
		await cleanup(context);
	}
});

test("push-to-append crash recovers exact remote state without a second push", async () => {
	const context = await pushFixture("crash");
	let checks = 0;
	try {
		await assert.rejects(
			pushJob(context, {
				beforeAppend() {
					checks += 1;
					if (checks === 2) throw new Error("simulated push append crash");
				},
			}).run(new AbortController().signal),
			/simulated push append crash/,
		);
		assert.equal(await remoteCommit(context), context.commit);
		assert.equal(
			(await traceRecords(context.root, context.seeded.traceId)).some(
				(record) => record.event === "runtime.project_branch.pushed",
			),
			false,
		);
		await pushJob(context).run(new AbortController().signal);
		assert.equal(
			context.commands.filter((command) => command.args.includes("push")).length,
			1,
		);
	} finally {
		await cleanup(context);
	}
});

test("remote acceptance before pushed-phase persistence remains unattributed", async () => {
	const context = await pushFixture("acceptance-gap");
	let pushCompleted = false;
	try {
		const interruptedRunner = async (command, execution) => {
			if (pushCompleted && command.args.includes("ls-remote")) {
				return { exitCode: 1, stdout: "", stderr: "simulated host death" };
			}
			const result = await context.runner(command, execution);
			if (command.args.includes("--porcelain")) pushCompleted = true;
			return result;
		};
		await assert.rejects(
			pushJob(context, { runner: interruptedRunner }).run(
				new AbortController().signal,
			),
			/inspection failed/i,
		);
		assert.equal(await remoteCommit(context), context.commit);
		await assert.rejects(
			pushJob(context).run(new AbortController().signal),
			/without exact push recovery evidence/i,
		);
		assert.equal(
			(await traceRecords(context.root, context.seeded.traceId)).some(
				(record) => record.event === "runtime.project_branch.pushed",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});

test("preexisting exact remote commit without recovery evidence is not attributed", async () => {
	const context = await pushFixture("preexisting");
	try {
		await git(context.root, [
			"push",
			"-q",
			"--no-verify",
			"origin",
			`${context.commit}:refs/heads/main`,
		]);
		await assert.rejects(
			pushJob(context).run(new AbortController().signal),
			/without exact push recovery evidence/i,
		);
		assert.equal(
			(await traceRecords(context.root, context.seeded.traceId)).some(
				(record) => record.event === "runtime.project_branch.pushed",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});

test("stale remote authority rejects before push", async () => {
	const context = await pushFixture("stale");
	try {
		const advanced = await advanceRemote(context, "stale");
		await assert.rejects(
			pushJob(context).run(new AbortController().signal),
			/remote moved after push authority/i,
		);
		assert.equal(await remoteCommit(context), advanced);
		assert.equal(
			context.commands.some((command) => command.args.includes("push")),
			false,
		);
	} finally {
		await cleanup(context);
	}
});

test("non-fast-forward push fails without overwriting remote", async () => {
	const context = await pushFixture("non-ff");
	try {
		const advanced = await advanceRemote(context, "non-ff");
		await assert.rejects(
			pushJob(context, {
				authority: {
					kind: "user",
					actor: "user:maintainer",
					ref: "confirmation:observed-advanced-remote",
					remote: "origin",
					targetBranch: "refs/heads/main",
					expectedRemoteCommit: advanced,
				},
			}).run(new AbortController().signal),
			/push failed .*remote output was redacted/i,
		);
		assert.equal(await remoteCommit(context), advanced);
	} finally {
		await cleanup(context);
	}
});

test("dirty checkout, credential URL, and malformed runner fail closed", async () => {
	const dirty = await pushFixture("dirty");
	try {
		await writeFile(join(dirty.root, "untracked.txt"), "preserve me\n");
		await assert.rejects(
			pushJob(dirty).run(new AbortController().signal),
			/requires a clean project checkout/i,
		);
		assert.equal(await remoteCommit(dirty), dirty.baseCommit);
	} finally {
		await cleanup(dirty);
	}

	const credential = await pushFixture("credential");
	try {
		await git(credential.root, [
			"remote",
			"set-url",
			"--push",
			"origin",
			"https://token@example.test/repo.git",
		]);
		await assert.rejects(
			pushJob(credential).run(new AbortController().signal),
			/remote URL cannot contain credentials/i,
		);
	} finally {
		await cleanup(credential);
	}

	const malformed = await pushFixture("malformed");
	try {
		await assert.rejects(
			pushJob(malformed, { runner: async () => undefined }).run(
				new AbortController().signal,
			),
			/returned no exit status/i,
		);
		assert.equal(await remoteCommit(malformed), malformed.baseCommit);
	} finally {
		await cleanup(malformed);
	}
});

test("symbolic push recovery path fails closed before remote mutation", async () => {
	const context = await pushFixture("manifest-symlink");
	try {
		const pushesPath = join(context.root, ".codewiki", "runtime", "pushes");
		await mkdir(dirname(pushesPath), { recursive: true });
		await symlink(context.remoteRoot, pushesPath, "dir");
		await assert.rejects(
			pushJob(context).run(new AbortController().signal),
			/runtime path cannot be symbolic/i,
		);
		assert.equal(await remoteCommit(context), context.baseCommit);
	} finally {
		await cleanup(context);
	}
});

test("invalid remote, branch, or non-user authority is rejected", async () => {
	const context = await pushFixture("authority");
	try {
		for (const authority of [
			{
				kind: "user",
				actor: "user:maintainer",
				ref: "confirmation:test",
				remote: "../origin",
				targetBranch: "refs/heads/main",
				expectedRemoteCommit: context.baseCommit,
			},
			{
				kind: "user",
				actor: "user:maintainer",
				ref: "confirmation:test",
				remote: "origin",
				targetBranch: "HEAD",
				expectedRemoteCommit: context.baseCommit,
			},
			{
				kind: "policy",
				actor: "runtime:test",
				ref: "policy:not-enough",
				remote: "origin",
				targetBranch: "refs/heads/main",
				expectedRemoteCommit: context.baseCommit,
			},
		]) {
			assert.throws(
				() => pushJob(context, { authority }),
				/remote name|exact local branch|requires.*user|user authority/i,
			);
		}
	} finally {
		await cleanup(context);
	}
});
