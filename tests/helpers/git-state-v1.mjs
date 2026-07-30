import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	createGitStateCommit,
	pushGitStateCommit,
	reduceAcceptedStateBatch,
	replayGitStateHistory,
} from "../../src/change-trace/index.ts";
import {authorityBinding} from "./change-trace-v1.mjs";
import {
	allowAllReplayPolicy,
	baseSnapshotFor,
	buildOperationSequence,
	revisionFor,
} from "./change-trace-replay-v1.mjs";

const execFileAsync = promisify(execFile);

export async function createTwoCloneFixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-git-state-"));
	const remote = join(root, "remote.git");
	const cloneA = join(root, "clone-a");
	const cloneB = join(root, "clone-b");
	await git(root, ["init", "--bare", "--quiet", remote]);
	for (const clone of [cloneA, cloneB]) {
		await mkdir(clone);
		await git(clone, ["init", "--quiet"]);
		await git(clone, ["remote", "add", "origin", remote]);
	}
	return {
		root,
		remote,
		cloneA,
		cloneB,
		cleanup: () => rm(root, {recursive: true, force: true}),
	};
}

export function buildOpenChangeRecords(
	state,
	changeId,
	actorId = "runtime-main",
) {
	const revision = revisionFor(changeId);
	return buildOperationSequence({
		changeId,
		baseSnapshot: baseSnapshotFor(state),
		authority: authorityBinding({actorId}),
		specifications: [
			{
				kind: "trace.opened",
				recordedAt: "2026-07-30T15:00:00.000Z",
				payload: {origin: "user", provenanceRefs: [`request:${changeId}`]},
			},
			{
				kind: "change.proposed",
				recordedAt: "2026-07-30T15:00:01.000Z",
				payload: {
					revision,
					provenance: {kind: "user", refs: [`request:${changeId}`]},
				},
			},
		],
	}).operations;
}

export async function createGitProposal(repoRoot, state, records) {
	const proposal = await createGitStateCommit({repoRoot, state, records});
	const projected = reduceAcceptedStateBatch(
		state,
		{
			stateHead: proposal.stateCommit,
			manifest: proposal.manifest,
			records: proposal.records,
		},
		allowAllReplayPolicy,
	);
	return {proposal, projected};
}

export function pushGitProposal(repoRoot, proposal) {
	return pushGitStateCommit({repoRoot, remote: "origin", proposal});
}

export function synchronizeTestState(repoRoot) {
	return replayGitStateHistory(
		{repoRoot, remote: "origin"},
		allowAllReplayPolicy,
	);
}

export async function git(repoRoot, args, options = {}) {
	const result = await execFileAsync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
		...options,
	});
	return {stdout: result.stdout, stderr: result.stderr};
}
