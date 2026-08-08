import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION,
	cleanupImplementationWorkerArtifacts,
	writeImplementationWorkerDispatchPacket,
} from "../../src/runtime/workers/implementation-worker-artifacts.ts";
import { IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION } from "../../src/runtime/workers/implementation-worker-adapter.ts";

function packetDirectory(root) {
	return join(root, ".codewiki", "runtime", "worker-assignments");
}

function packet(root, suffix, status) {
	const claimId = `claim:${suffix}`;
	const workItemId = `WU-${suffix}`;
	const worktreePath = join(
		root,
		".codewiki",
		"runtime",
		"tmp",
		`TRACE-${suffix}`,
		"worktree",
		suffix,
	);
	const reportKey = createHash("sha256").update(suffix).digest("hex").slice(0, 32);
	const reportPath = join(
		root,
		".codewiki",
		"runtime",
		"workers",
		`${reportKey}.json`,
	);
	const worktree = {
		path: worktreePath,
		branch: `codewiki/${suffix}`,
		baseRef: "main",
		baseSha: "a".repeat(40),
	};
	return {
		packet: {
			schemaVersion: IMPLEMENTATION_WORKER_DISPATCH_PACKET_SCHEMA_VERSION,
			claimEventId: `TRACE-${suffix}:runtime:claim:1`,
			assignment: {
				schemaVersion: IMPLEMENTATION_WORKER_ASSIGNMENT_SCHEMA_VERSION,
				repoRoot: root,
				assignmentId: claimId,
				workerId: `worker:${suffix}`,
				workItemId,
				claimId,
				traceId: `TRACE-${suffix}`,
				planningRefs: [`TRACE-${suffix}:planning:iteration:1#work:${workItemId}`],
				traceRefs: [`trace:TRACE-${suffix}`],
				componentRefs: ["runtime"],
				pathScopes: [`src/${suffix}/**`],
				workStateDigest: `sha256:${"b".repeat(64)}`,
				sourceBaseRef: `git:${"a".repeat(40)}`,
				contextDigest: `sha256:${"c".repeat(64)}`,
				prompt: `Implement ${workItemId}`,
				reportPath,
				isolation: { kind: "worktree", ref: `worktree:${suffix}` },
				worktree,
			},
			worktreePlan: {
				workUnitId: workItemId,
				traceId: `TRACE-${suffix}`,
				workerId: `worker:${suffix}`,
				required: true,
				reason: "test",
				pathScopes: [`src/${suffix}/**`],
				worktree,
				commands: {
					worktreePrepare: [],
					worktreeVerify: [],
					worktreeCleanup: [],
				},
			},
		},
		report: {
			assignmentId: claimId,
			workerId: `worker:${suffix}`,
			workItemId,
			status,
			reportRef: `runtime-worker-report:${suffix}`,
		},
	};
}

async function seedArtifacts(root, fixture) {
	await writeImplementationWorkerDispatchPacket(root, fixture.packet);
	await mkdir(fixture.packet.assignment.worktree.path, { recursive: true });
	await writeFile(
		join(fixture.packet.assignment.worktree.path, "candidate.txt"),
		"candidate",
		"utf8",
	);
	await mkdir(join(root, ".codewiki", "runtime", "workers"), {
		recursive: true,
	});
	await writeFile(
		fixture.packet.assignment.reportPath,
		`${JSON.stringify(fixture.report)}\n`,
		"utf8",
	);
	await writeFile(
		`${fixture.packet.assignment.reportPath}.worker-output`,
		"worker output",
		"utf8",
	);
	await writeFile(
		`${fixture.packet.assignment.reportPath}.container-outcome`,
		"container outcome",
		"utf8",
	);
}

async function exists(path) {
	try {
		await readFile(path);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT" || error?.code === "EISDIR") return false;
		throw error;
	}
}

test("worker artifact cleanup preserves every artifact for an active Claim", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-artifact-active-"));
	const fixture = packet(root, "active", "failed");
	try {
		await seedArtifacts(root, fixture);
		const result = await cleanupImplementationWorkerArtifacts({
			repoRoot: root,
			activeClaimIds: new Set([fixture.packet.assignment.claimId]),
			canonicalClaimEventIds: new Set([fixture.packet.claimEventId]),
			worktreeRunner() {
				assert.fail("active Claim worktree must not be cleaned");
			},
		});

		assert.deepEqual(result.removedPaths, []);
		assert.equal(await exists(fixture.packet.assignment.reportPath), true);
		assert.equal(
			await exists(`${fixture.packet.assignment.reportPath}.container-outcome`),
			true,
		);
		assert.equal(
			await exists(join(fixture.packet.assignment.worktree.path, "candidate.txt")),
			true,
		);
		assert.equal((await readdir(packetDirectory(root))).length, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("worker artifact cleanup removes pre-claim scratch and partial worktrees idempotently", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-artifact-orphan-"));
	const fixture = packet(root, "orphan", "cancelled");
	const commands = [];
	try {
		await seedArtifacts(root, fixture);
		const cleanup = () =>
			cleanupImplementationWorkerArtifacts({
				repoRoot: root,
				activeClaimIds: new Set(),
				canonicalClaimEventIds: new Set(),
				worktreeRunner(command) {
					commands.push(command);
					return { exitCode: 0 };
				},
			});
		const blocked = await cleanupImplementationWorkerArtifacts({
			repoRoot: root,
			activeClaimIds: new Set(),
			canonicalClaimEventIds: new Set(),
		});
		assert.deepEqual(blocked.blockers, [
			`implementation_worker_cleanup_runner_unavailable:${fixture.packet.assignment.claimId}`,
		]);
		assert.equal(
			await exists(join(fixture.packet.assignment.worktree.path, "candidate.txt")),
			true,
		);

		const first = await cleanup();
		const second = await cleanup();

		assert.equal(first.blockers.length, 0);
		assert.deepEqual(first.cleanedWorktreePaths, [
			fixture.packet.assignment.worktree.path,
		]);
		assert.deepEqual(commands, [
			{ executable: "git", args: ["worktree", "prune"] },
		]);
		assert.equal(await exists(fixture.packet.assignment.reportPath), false);
		assert.equal(
			await exists(`${fixture.packet.assignment.reportPath}.worker-output`),
			false,
		);
		assert.equal(
			await exists(`${fixture.packet.assignment.reportPath}.container-outcome`),
			false,
		);
		assert.equal(
			await exists(join(fixture.packet.assignment.worktree.path, "candidate.txt")),
			false,
		);
		assert.deepEqual(second.removedPaths, []);
		assert.deepEqual(second.cleanedWorktreePaths, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("worker artifact cleanup removes unreferenced terminal reports", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-artifact-report-"));
	const directory = join(root, ".codewiki", "runtime", "workers");
	const failedPath = join(directory, `${"d".repeat(32)}.json`);
	const completedPath = join(directory, `${"e".repeat(32)}.json`);
	const malformedPacket = join(packetDirectory(root), "unknown.json");
	const staleTemporaryPacket = join(packetDirectory(root), "packet.1.tmp");
	try {
		await mkdir(directory, { recursive: true });
		await mkdir(packetDirectory(root), { recursive: true });
		await writeFile(malformedPacket, "{not-json");
		await writeFile(staleTemporaryPacket, "partial");
		await writeFile(
			failedPath,
			JSON.stringify({
				assignmentId: "claim:failed-orphan",
				status: "failed",
			}),
		);
		await writeFile(`${failedPath}.worker-output`, "failed output");
		await writeFile(
			completedPath,
			JSON.stringify({
				assignmentId: "claim:completed-orphan",
				status: "completed",
			}),
		);
		const result = await cleanupImplementationWorkerArtifacts({
			repoRoot: root,
			activeClaimIds: new Set(),
			canonicalClaimEventIds: new Set(),
		});

		assert.equal(await exists(failedPath), false);
		assert.equal(await exists(`${failedPath}.worker-output`), false);
		assert.equal(await exists(completedPath), true);
		assert.equal(await exists(malformedPacket), true);
		assert.equal(await exists(staleTemporaryPacket), false);
		assert.deepEqual(result.preservedPaths, [malformedPacket, completedPath]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("worker artifact cleanup rejects runtime directory symlinks", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-artifact-symlink-"));
	const external = await mkdtemp(join(tmpdir(), "codewiki-worker-artifact-external-"));
	const reportPath = join(external, `${"f".repeat(32)}.json`);
	try {
		await mkdir(join(root, ".codewiki", "runtime"), { recursive: true });
		await writeFile(
			reportPath,
			JSON.stringify({ assignmentId: "claim:outside", status: "failed" }),
		);
		await symlink(external, join(root, ".codewiki", "runtime", "workers"));

		await assert.rejects(
			cleanupImplementationWorkerArtifacts({
				repoRoot: root,
				activeClaimIds: new Set(),
				canonicalClaimEventIds: new Set(),
			}),
			/traverses symlink/,
		);
		assert.equal(await exists(reportPath), true);
	} finally {
		await rm(root, { recursive: true, force: true });
		await rm(external, { recursive: true, force: true });
	}
});

test("worker artifact cleanup preserves completed work until integration proof", async () => {
	const root = await mkdtemp(join(tmpdir(), "codewiki-worker-artifact-complete-"));
	const completed = packet(root, "completed", "completed");
	const failed = packet(root, "failed", "failed");
	try {
		await seedArtifacts(root, completed);
		await seedArtifacts(root, failed);
		const result = await cleanupImplementationWorkerArtifacts({
			repoRoot: root,
			activeClaimIds: new Set(),
			canonicalClaimEventIds: new Set([
				completed.packet.claimEventId,
				failed.packet.claimEventId,
			]),
			worktreeRunner() {
				return { exitCode: 0 };
			},
		});

		assert.equal(await exists(completed.packet.assignment.reportPath), true);
		assert.equal(
			await exists(join(completed.packet.assignment.worktree.path, "candidate.txt")),
			true,
		);
		assert.equal(await exists(failed.packet.assignment.reportPath), false);
		assert.equal(
			await exists(join(failed.packet.assignment.worktree.path, "candidate.txt")),
			false,
		);
		assert.equal(result.cleanedWorktreePaths.length, 1);
		assert.equal((await readdir(packetDirectory(root))).length, 1);

		const integrated = await cleanupImplementationWorkerArtifacts({
			repoRoot: root,
			activeClaimIds: new Set(),
			canonicalClaimEventIds: new Set([completed.packet.claimEventId]),
			integratedClaims: new Map([
				[
					completed.packet.assignment.claimId,
					{
						assignmentId: completed.packet.assignment.assignmentId,
						workerReportRef: completed.report.reportRef,
					},
				],
			]),
			worktreeRunner() {
				return { exitCode: 0 };
			},
		});
		assert.deepEqual(integrated.cleanedWorktreePaths, [
			completed.packet.assignment.worktree.path,
		]);
		assert.equal(await exists(completed.packet.assignment.reportPath), false);
		assert.equal((await readdir(packetDirectory(root))).length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
