import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createInitialProjectWorkState,
	readGitStateHistory,
} from "../../../src/changes/trace/index.ts";
import {authorityBinding} from "../../helpers/change-trace-v1.mjs";
import {
	baseSnapshotFor,
	buildOperationSequence,
	buildPassingPlanningExit,
	buildPlanningEpochRecords,
	planningArtifacts,
} from "../../helpers/change-trace-replay-v1.mjs";
import {
	buildOpenChangeRecords as buildOpenRecords,
	createGitProposal as propose,
	createTwoCloneFixture,
	git,
	pushGitProposal as push,
	synchronizeTestState as sync,
} from "../../helpers/git-state-v1.mjs";

function buildFeedbackRecord(state, changeId, suffix, actorId) {
	const change = state.changes.find((entry) => entry.changeId === changeId);
	return buildOperationSequence({
		change,
		changeId,
		baseSnapshot: baseSnapshotFor(state),
		authority: authorityBinding({actorId}),
		specifications: [
			{
				kind: "change.feedback_recorded",
				recordedAt: `2026-07-30T15:10:${suffix}.000Z`,
				payload: {
					revisionId: change.currentRevision.revisionId,
					classification: "clarification",
					summary: `Concurrent feedback ${suffix}.`,
					provenanceRefs: [`feedback:${suffix}`],
				},
			},
		],
	}).operations;
}

function buildChangeClaimRecord(state, changeId, actorId) {
	const change = state.changes.find((entry) => entry.changeId === changeId);
	return buildOperationSequence({
		change,
		changeId,
		baseSnapshot: baseSnapshotFor(state),
		authority: authorityBinding({actorId}),
		specifications: [
			{
				kind: "change_claim.acquired",
				recordedAt: "2026-07-30T15:20:00.000Z",
				payload: {
					revisionId: change.currentRevision.revisionId,
					purpose: "implementation",
				},
			},
		],
	}).operations;
}

function buildWorkItemClaimRecord(state, changeId, epoch, workItemId, actorId) {
	const change = state.changes.find((entry) => entry.changeId === changeId);
	return buildOperationSequence({
		change,
		changeId,
		baseSnapshot: baseSnapshotFor(state),
		authority: authorityBinding({actorId}),
		planningEpochs: [epoch],
		specifications: [
			{
				kind: "work_item_claim.acquired",
				recordedAt: "2026-07-30T15:30:00.000Z",
				payload: {
					planningEpochId: epoch.operationId,
					workItemId,
					assignmentAttemptId: `attempt-${actorId}`,
					workerId: actorId,
					workbenchId: `workbench-${actorId}`,
					sourceBase: state.observedBase.sourceHead,
					scopeDigest: `sha256:${"1".repeat(64)}`,
					budgetDigest: `sha256:${"2".repeat(64)}`,
					obligationDigest: `sha256:${"3".repeat(64)}`,
				},
			},
		],
	}).operations;
}

describe("provider-neutral Git state CAS", () => {
	it("accepts and replays exact canonical state from an empty bare remote", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const initial = createInitialProjectWorkState();
			const records = buildOpenRecords(initial, "CHG-git-basic");
			const local = await propose(fixture.cloneA, initial, records);
			const result = await push(fixture.cloneA, local.proposal);
			assert.equal(result.status, "accepted");
			assert.equal(result.acceptedStateHead, local.proposal.stateCommit);

			const history = await readGitStateHistory({
				repoRoot: fixture.cloneB,
				remote: "origin",
			});
			assert.equal(history.batches.length, 1);
			assert.equal(history.remoteStateHead, local.proposal.stateCommit);
			const replayed = await sync(fixture.cloneB);
			assert.equal(replayed.stateHead, local.proposal.stateCommit);
			assert.equal(replayed.changes[0].changeId, "CHG-git-basic");
			assert.equal(replayed.changes[0].operations.length, 2);
		} finally {
			await fixture.cleanup();
		}
	});

	it("serializes concurrent independent Changes with one semantic retry", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const initial = createInitialProjectWorkState();
			const contenders = [
				{
					repoRoot: fixture.cloneA,
					changeId: "CHG-concurrent-a",
					actorId: "runtime-a",
				},
				{
					repoRoot: fixture.cloneB,
					changeId: "CHG-concurrent-b",
					actorId: "runtime-b",
				},
			];
			const proposals = await Promise.all(
				contenders.map(({repoRoot, changeId, actorId}) =>
					propose(repoRoot, initial, buildOpenRecords(initial, changeId, actorId)),
				),
			);
			const results = await Promise.all(
				proposals.map(({proposal}, index) => push(contenders[index].repoRoot, proposal)),
			);
			assert.equal(results.filter((result) => result.status === "accepted").length, 1);
			assert.equal(results.filter((result) => result.status === "stale").length, 1);
			const staleIndex = results.findIndex((result) => result.status === "stale");
			const staleContender = contenders[staleIndex];
			const refreshed = await sync(staleContender.repoRoot);
			const rebuilt = await propose(
				staleContender.repoRoot,
				refreshed,
				buildOpenRecords(
					refreshed,
					staleContender.changeId,
					staleContender.actorId,
				),
			);
			assert.notEqual(
				rebuilt.proposal.records[0].operationId,
				proposals[staleIndex].proposal.records[0].operationId,
			);
			assert.equal((await push(staleContender.repoRoot, rebuilt.proposal)).status, "accepted");
			const finalState = await sync(fixture.cloneA);
			assert.deepEqual(
				finalState.changes.map((change) => change.changeId),
				["CHG-concurrent-a", "CHG-concurrent-b"],
			);
			const metrics = {
				proposalAttempts: 3,
				accepted: 2,
				stale: 1,
				semanticRetries: 1,
			};
			assert.deepEqual(metrics, {
				proposalAttempts: 3,
				accepted: 2,
				stale: 1,
				semanticRetries: 1,
			});
		} finally {
			await fixture.cleanup();
		}
	});

	it("serializes same-Change writes without blind rebase", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const initial = createInitialProjectWorkState();
			const base = await propose(
				fixture.cloneA,
				initial,
				buildOpenRecords(initial, "CHG-same-change"),
			);
			assert.equal((await push(fixture.cloneA, base.proposal)).status, "accepted");
			const states = await Promise.all([sync(fixture.cloneA), sync(fixture.cloneB)]);
			const writes = await Promise.all([
				propose(
					fixture.cloneA,
					states[0],
					buildFeedbackRecord(states[0], "CHG-same-change", "01", "runtime-a"),
				),
				propose(
					fixture.cloneB,
					states[1],
					buildFeedbackRecord(states[1], "CHG-same-change", "02", "runtime-b"),
				),
			]);
			const results = await Promise.all([
				push(fixture.cloneA, writes[0].proposal),
				push(fixture.cloneB, writes[1].proposal),
			]);
			assert.equal(results.filter((result) => result.status === "accepted").length, 1);
			const staleIndex = results.findIndex((result) => result.status === "stale");
			const staleRepo = staleIndex === 0 ? fixture.cloneA : fixture.cloneB;
			const suffix = staleIndex === 0 ? "01" : "02";
			const actorId = staleIndex === 0 ? "runtime-a" : "runtime-b";
			const refreshed = await sync(staleRepo);
			const retry = await propose(
				staleRepo,
				refreshed,
				buildFeedbackRecord(refreshed, "CHG-same-change", suffix, actorId),
			);
			assert.equal((await push(staleRepo, retry.proposal)).status, "accepted");
			const finalState = await sync(fixture.cloneA);
			assert.equal(
				finalState.changes[0].operations.filter(
					(operation) => operation.body.kind === "change.feedback_recorded",
				).length,
				2,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("allows one Change Claim and rejects stale semantic reevaluation", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const initial = createInitialProjectWorkState();
			const base = await propose(
				fixture.cloneA,
				initial,
				buildOpenRecords(initial, "CHG-claim-race"),
			);
			await push(fixture.cloneA, base.proposal);
			const states = await Promise.all([sync(fixture.cloneA), sync(fixture.cloneB)]);
			const claims = await Promise.all([
				propose(
					fixture.cloneA,
					states[0],
					buildChangeClaimRecord(states[0], "CHG-claim-race", "runtime-a"),
				),
				propose(
					fixture.cloneB,
					states[1],
					buildChangeClaimRecord(states[1], "CHG-claim-race", "runtime-b"),
				),
			]);
			const results = await Promise.all([
				push(fixture.cloneA, claims[0].proposal),
				push(fixture.cloneB, claims[1].proposal),
			]);
			const staleIndex = results.findIndex((result) => result.status === "stale");
			assert.notEqual(staleIndex, -1);
			const staleRepo = staleIndex === 0 ? fixture.cloneA : fixture.cloneB;
			const staleActor = staleIndex === 0 ? "runtime-a" : "runtime-b";
			const refreshed = await sync(staleRepo);
			assert.throws(
				() => buildChangeClaimRecord(refreshed, "CHG-claim-race", staleActor),
				(error) => error?.code === "ACTIVE_AUTHORITY",
			);
			const activeClaims = refreshed.changes[0].changeClaims.filter(
				(claim) => claim.status === "active",
			);
			assert.equal(activeClaims.length, 1);
		} finally {
			await fixture.cleanup();
		}
	});

	it("accepts atomic multi-Change Planning and one Work Item Claim", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const initial = createInitialProjectWorkState();
			const changeIds = ["CHG-planning-a", "CHG-planning-b"];
			const openRecords = changeIds.flatMap((changeId) =>
				buildOpenRecords(initial, changeId),
			);
			const opened = await propose(fixture.cloneA, initial, openRecords);
			await push(fixture.cloneA, opened.proposal);
			const openState = await sync(fixture.cloneA);
			const artifacts = planningArtifacts("git-atomic");
			const planningRecords = changeIds.flatMap(
				(changeId) =>
					buildPassingPlanningExit(openState, changeId, artifacts).operations,
			);
			const planning = await propose(fixture.cloneA, openState, planningRecords);
			await push(fixture.cloneA, planning.proposal);
			const plannedState = await sync(fixture.cloneA);
			const epoch = buildPlanningEpochRecords({
				state: plannedState,
				participantChangeIds: changeIds,
				artifacts,
				suffix: "git-atomic",
			});
			await assert.rejects(
				() => propose(fixture.cloneA, plannedState, epoch.records.slice(0, -1)),
				(error) => error?.code === "ATOMIC_BINDING_MISSING",
			);
			const atomic = await propose(fixture.cloneA, plannedState, epoch.records);
			assert.equal(atomic.proposal.manifest.body.changedTraceTails.length, 2);
			await push(fixture.cloneA, atomic.proposal);
			const states = await Promise.all([sync(fixture.cloneA), sync(fixture.cloneB)]);
			const ownerChangeId = changeIds[0];
			const claimRecords = [
				buildWorkItemClaimRecord(
					states[0],
					ownerChangeId,
					epoch.epoch,
					epoch.workItemId,
					"worker-a",
				),
				buildWorkItemClaimRecord(
					states[1],
					ownerChangeId,
					epoch.epoch,
					epoch.workItemId,
					"worker-b",
				),
			];
			const claims = await Promise.all([
				propose(fixture.cloneA, states[0], claimRecords[0]),
				propose(fixture.cloneB, states[1], claimRecords[1]),
			]);
			const results = await Promise.all([
				push(fixture.cloneA, claims[0].proposal),
				push(fixture.cloneB, claims[1].proposal),
			]);
			const staleIndex = results.findIndex((result) => result.status === "stale");
			const staleRepo = staleIndex === 0 ? fixture.cloneA : fixture.cloneB;
			const staleWorker = staleIndex === 0 ? "worker-a" : "worker-b";
			const refreshed = await sync(staleRepo);
			assert.throws(
				() =>
					buildWorkItemClaimRecord(
						refreshed,
						ownerChangeId,
						epoch.epoch,
						epoch.workItemId,
						staleWorker,
					),
				(error) => error?.code === "ACTIVE_AUTHORITY",
			);
			const owner = refreshed.changes.find(
				(change) => change.changeId === ownerChangeId,
			);
			assert.equal(
				owner.workItemClaims.filter((claim) => claim.status === "active").length,
				1,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("recovers crashes and converges after duplicate or reordered notifications", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const initial = createInitialProjectWorkState();
			const base = await propose(
				fixture.cloneA,
				initial,
				buildOpenRecords(initial, "CHG-crash-recovery"),
			);
			await push(fixture.cloneA, base.proposal);
			const state = await sync(fixture.cloneA);
			const remoteBefore = state.stateHead;
			const records = buildFeedbackRecord(
				state,
				"CHG-crash-recovery",
				"03",
				"runtime-crash",
			);
			assert.equal((await sync(fixture.cloneB)).stateHead, remoteBefore);
			const local = await propose(fixture.cloneA, state, records);
			assert.equal((await sync(fixture.cloneB)).stateHead, remoteBefore);
			assert.equal((await git(fixture.cloneA, ["status", "--porcelain"])).stdout, "");
			await git(fixture.cloneA, ["cat-file", "-e", `${local.proposal.stateCommit}^{commit}`]);

			await push(fixture.cloneA, local.proposal);
			const repeatedPush = await push(fixture.cloneA, local.proposal);
			assert.equal(repeatedPush.status, "accepted");
			assert.equal(
				repeatedPush.acceptedStateHead,
				local.proposal.stateCommit,
			);
			const history = await readGitStateHistory({
				repoRoot: fixture.cloneB,
				remote: "origin",
			});
			assert.equal(
				history.batches.filter(
					(batch) => batch.manifest.manifestId === local.proposal.manifest.manifestId,
				).length,
				1,
			);
			const notifications = [remoteBefore, local.proposal.stateCommit, remoteBefore, local.proposal.stateCommit];
			const snapshots = [];
			for (const _notification of notifications) {
				snapshots.push(await sync(fixture.cloneB));
			}
			assert.equal(
				new Set(snapshots.map((snapshot) => snapshot.workStateDigest)).size,
				1,
			);
			assert.equal(snapshots.at(-1).stateHead, local.proposal.stateCommit);
		} finally {
			await fixture.cleanup();
		}
	});

});
