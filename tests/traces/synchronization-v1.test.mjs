import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	assertFreshSynchronization,
	createInitialProjectWorkState,
	createSynchronizationPoller,
	gitStateManifestPath,
	gitStateRecordPath,
	pushSynchronizedGitStateCommit,
	synchronizeGitState,
} from "../../src/change-trace/index.ts";
import {allowAllReplayPolicy} from "../helpers/change-trace-replay-v1.mjs";
import {
	buildOpenChangeRecords,
	createGitProposal,
	createTwoCloneFixture,
	git,
	pushGitProposal,
} from "../helpers/git-state-v1.mjs";

const repositoryIdentity = `sha256:${"a".repeat(64)}`;

function projectSnapshotFor(state) {
	return {
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
	};
}

async function seedRemote(fixture, changeId) {
	const initial = createInitialProjectWorkState();
	const local = await createGitProposal(
		fixture.cloneA,
		initial,
		buildOpenChangeRecords(initial, changeId),
	);
	const pushed = await pushGitProposal(fixture.cloneA, local.proposal);
	assert.equal(pushed.status, "accepted");
	return local;
}

function synchronizationInput(fixture, state, overrides = {}) {
	return {
		repoRoot: fixture.cloneB,
		remote: "origin",
		repositoryIdentity,
		currentProject: projectSnapshotFor(state),
		policy: allowAllReplayPolicy,
		...overrides,
	};
}

describe("read-only Git synchronization", () => {
	it("verifies remote history and materializes one fresh team snapshot", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const seeded = await seedRemote(fixture, "CHG-sync-fresh");
			const observation = await synchronizeGitState(
				synchronizationInput(fixture, seeded.projected, {
					materializationRoot: fixture.cloneB,
				}),
			);
			assert.equal(observation.status, "fresh");
			assert.equal(observation.canMutate, true);
			assert.equal(
				observation.teamSnapshot.remoteStateHead,
				seeded.proposal.stateCommit,
			);
			assert.equal(observation.workState.changes[0].changeId, "CHG-sync-fresh");
			assert.ok(observation.alignmentGraph.graphSnapshotDigest);
			assertFreshSynchronization(
				observation,
				observation.teamSnapshot.snapshotDigest,
			);

			const operationPath = gitStateRecordPath(seeded.proposal.records[0]);
			const manifestPath = gitStateManifestPath(seeded.proposal.manifest);
			assert.match(
				await readFile(join(fixture.cloneB, operationPath), "utf8"),
				/"kind":"trace.opened"/,
			);
			assert.match(
				await readFile(join(fixture.cloneB, manifestPath), "utf8"),
				new RegExp(seeded.proposal.manifest.manifestId.replace(":", "\\:")),
			);
			const pointer = JSON.parse(
				await readFile(
					join(fixture.cloneB, ".codewiki/runtime/synchronization.json"),
					"utf8",
				),
			);
			assert.equal(pointer.status, "fresh");
			assert.equal(pointer.workStateDigest, observation.workState.workStateDigest);
			const repeated = await synchronizeGitState(
				synchronizationInput(fixture, seeded.projected, {
					materializationRoot: fixture.cloneB,
				}),
			);
			assert.deepEqual(repeated, observation);
			const next = await createGitProposal(
				fixture.cloneB,
				observation.workState,
				buildOpenChangeRecords(observation.workState, "CHG-sync-next"),
			);
			assert.throws(
				() =>
					pushSynchronizedGitStateCommit({
						repoRoot: fixture.cloneB,
						remote: "origin",
						proposal: next.proposal,
						observation,
						expectedSnapshotDigest: `sha256:${"b".repeat(64)}`,
					}),
				/snapshot digest changed before mutation/,
			);
			const pushed = await pushSynchronizedGitStateCommit({
				repoRoot: fixture.cloneB,
				remote: "origin",
				proposal: next.proposal,
				observation,
				expectedSnapshotDigest: observation.teamSnapshot.snapshotDigest,
			});
			assert.equal(pushed.status, "accepted");
		} finally {
			await fixture.cleanup();
		}
	});

	it("marks authority drift stale and blocks distributed mutation", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const seeded = await seedRemote(fixture, "CHG-sync-stale");
			const currentProject = {
				...projectSnapshotFor(seeded.projected),
				sourceHead: "f".repeat(40),
				knowledgeDigest: `sha256:${"9".repeat(64)}`,
			};
			const observation = await synchronizeGitState(
				synchronizationInput(fixture, seeded.projected, {currentProject}),
			);
			assert.equal(observation.status, "stale");
			assert.equal(observation.canMutate, false);
			assert.deepEqual(observation.staleReasons, [
				"knowledge_digest_mismatch",
				"source_head_mismatch",
			]);
			assert.throws(
				() => assertFreshSynchronization(observation),
				/Unsafe distributed mutation requires fresh synchronization/,
			);
			assert.throws(
				() =>
					pushSynchronizedGitStateCommit({
						repoRoot: fixture.cloneB,
						remote: "origin",
						proposal: seeded.proposal,
						observation,
						expectedSnapshotDigest: observation.teamSnapshot.snapshotDigest,
					}),
				/current status is stale/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("retains the last verified snapshot offline without granting authority", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const seeded = await seedRemote(fixture, "CHG-sync-offline");
			const fresh = await synchronizeGitState(
				synchronizationInput(fixture, seeded.projected),
			);
			await git(fixture.cloneB, ["remote", "set-url", "origin", join(fixture.root, "missing.git")]);
			const offline = await synchronizeGitState(
				synchronizationInput(fixture, seeded.projected, {lastVerified: fresh}),
			);
			assert.equal(offline.status, "offline");
			assert.equal(offline.canMutate, false);
			assert.equal(offline.failureCode, "remote_unavailable");
			assert.equal(
				offline.teamSnapshot.snapshotDigest,
				fresh.teamSnapshot.snapshotDigest,
			);
			assert.equal(offline.workState.workStateDigest, fresh.workState.workStateDigest);
			assert.throws(
				() => assertFreshSynchronization(offline),
				/current status is offline/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("coalesces polling and duplicate notification invalidations", async () => {
		let now = 100;
		let calls = 0;
		const observation = Object.freeze({status: "fresh", marker: "verified"});
		const poller = createSynchronizationPoller({
			minimumIntervalMs: 50,
			now: () => now,
			synchronize: async () => {
				calls += 1;
				await Promise.resolve();
				return observation;
			},
		});
		assert.equal(await poller.poll(), observation);
		assert.equal(await poller.poll(), observation);
		assert.equal(calls, 1);
		poller.invalidate();
		poller.invalidate();
		assert.equal(poller.current(), null);
		const concurrent = await Promise.all([poller.poll(), poller.poll()]);
		assert.deepEqual(concurrent, [observation, observation]);
		assert.equal(calls, 2);
		now += 50;
		assert.equal(await poller.poll(), observation);
		assert.equal(calls, 3);
		assert.equal(poller.current(), observation);

		const resolvers = [];
		const racingPoller = createSynchronizationPoller({
			minimumIntervalMs: 50,
			now: () => now,
			synchronize: () =>
				new Promise((resolve) => {
					resolvers.push(resolve);
				}),
		});
		const inFlight = racingPoller.poll();
		racingPoller.invalidate();
		resolvers.shift()(observation);
		await inFlight;
		assert.equal(racingPoller.current(), null);
		const refreshed = racingPoller.poll();
		resolvers.shift()(observation);
		await refreshed;
		assert.equal(racingPoller.current(), observation);
	});

	it("fails closed when fetched Git history is structurally invalid", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const seeded = await seedRemote(fixture, "CHG-sync-invalid");
			const tree = (
				await git(fixture.cloneA, ["rev-parse", `${seeded.proposal.stateCommit}^{tree}`])
			).stdout.trim();
			const malformedCommit = (
				await git(
					fixture.cloneA,
					[
						"commit-tree",
						tree,
						"-p",
						seeded.proposal.stateCommit,
						"-m",
						"malformed state receipt",
					],
					{
						env: {
							...process.env,
							GIT_AUTHOR_NAME: "Malformed Fixture",
							GIT_AUTHOR_EMAIL: "fixture@invalid",
							GIT_AUTHOR_DATE: "2026-07-30T16:00:00Z",
							GIT_COMMITTER_NAME: "Malformed Fixture",
							GIT_COMMITTER_EMAIL: "fixture@invalid",
							GIT_COMMITTER_DATE: "2026-07-30T16:00:00Z",
						},
					},
				)
			).stdout.trim();
			await git(fixture.cloneA, [
				"push",
				"--quiet",
				"--force",
				"origin",
				`${malformedCommit}:refs/heads/codewiki/state`,
			]);
			await assert.rejects(
				() => synchronizeGitState(synchronizationInput(fixture, seeded.projected)),
				/must add exactly one manifest/,
			);
		} finally {
			await fixture.cleanup();
		}
	});
});
