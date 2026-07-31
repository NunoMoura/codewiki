import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	commitRollingPlanningEpoch,
	createInitialProjectWorkState,
	createRollingPlanningCandidate,
	projectRollingPlanningView,
	resolveRollingPlanningEpoch,
} from "../../src/change-trace/index.ts";
import {authorityBinding, digest} from "../helpers/change-trace-v1.mjs";
import {
	allowAllReplayPolicy,
	baseSnapshotFor,
	buildOperationSequence,
	buildPassingPlanningExit,
	buildPlanningEpochRecords,
	inlineSemanticArtifact,
	planningArtifacts,
} from "../helpers/change-trace-replay-v1.mjs";
import {
	buildOpenChangeRecords,
	createGitProposal,
	createTwoCloneFixture,
	pushGitProposal,
	synchronizeTestState,
} from "../helpers/git-state-v1.mjs";

const repositoryIdentity = digest("a");
const plannerAuthority = authorityBinding({actorId: "runtime-planner", role: "planner"});

function projectSnapshotFor(state) {
	return {
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
	};
}

async function seedChanges(fixture, changeIds) {
	const initial = createInitialProjectWorkState();
	const proposal = await createGitProposal(
		fixture.cloneA,
		initial,
		changeIds.flatMap((changeId) => buildOpenChangeRecords(initial, changeId)),
	);
	assert.equal((await pushGitProposal(fixture.cloneA, proposal.proposal)).status, "accepted");
	return proposal.projected;
}

function candidateContentFromState(state, changeIds, suffix) {
	const template = buildPlanningEpochRecords({
		state,
		participantChangeIds: changeIds,
		suffix,
	}).epoch.body;
	return {
		participantChangeIds: [...changeIds].sort(),
		sprints: template.sprints,
		workItems: template.workItems.map((workItem) => {
			const {owningChange, contributingChanges, ...fields} = workItem;
			return {
				...fields,
				owningChangeId: owningChange.changeId,
				contributingChangeIds: contributingChanges.map(
					(contributor) => contributor.changeId,
				),
			};
		}),
		activeWorkDispositions: [],
		rationale: `Rolling Planning Candidate ${suffix}.`,
	};
}

function createCandidate(state, content) {
	return createRollingPlanningCandidate({
		content,
		observedBase: {
			workStateDigest: state.workStateDigest,
			knowledgeSnapshotDigest: state.observedBase.knowledgeDigest,
			canonicalRefs: content.participantChangeIds.map(
				(changeId) => `change:${changeId}`,
			),
		},
	});
}

async function acceptPlanningExits(fixture, state, candidate, suffix) {
	const defaults = planningArtifacts(suffix);
	const report = {
		id: defaults.report.id,
		digest: defaults.report.artifact.reportDigest,
	};
	const artifacts = {
		...defaults,
		candidate: inlineSemanticArtifact(candidate.id, candidate),
	};
	const records = candidate.content.participantChangeIds.flatMap(
		(changeId) => buildPassingPlanningExit(state, changeId, artifacts).operations,
	);
	const local = await createGitProposal(fixture.cloneA, state, records);
	assert.equal((await pushGitProposal(fixture.cloneA, local.proposal)).status, "accepted");
	return {state: local.projected, report};
}

async function commitEpoch(fixture, state, candidate, report, recordedAt) {
	return commitRollingPlanningEpoch({
		repoRoot: fixture.cloneB,
		remote: "origin",
		repositoryIdentity,
		currentProject: () => projectSnapshotFor(state),
		authorityBinding: plannerAuthority,
		policy: allowAllReplayPolicy,
		candidate,
		exitReport: report,
		expectedWorkStateDigest: state.workStateDigest,
		recordedAt,
	});
}

async function appendActiveAssignment(fixture, state, epoch, changeId) {
	const workItem = epoch.body.workItems[0];
	const claimFields = {
		planningEpochId: epoch.operationId,
		workItemId: workItem.id,
		assignmentAttemptId: "attempt-rolling-active",
		workerId: "worker-rolling",
		workbenchId: "workbench-rolling",
		sourceBase: state.observedBase.sourceHead,
		scopeDigest: digest("1"),
		budgetDigest: digest("2"),
		obligationDigest: digest("3"),
	};
	const change = state.changes.find((entry) => entry.changeId === changeId);
	const sequence = buildOperationSequence({
		change,
		changeId,
		baseSnapshot: baseSnapshotFor(state),
		authority: authorityBinding({actorId: "runtime-worker"}),
		planningEpochs: state.planningEpochs,
		specifications: [
			{
				kind: "work_item_claim.acquired",
				recordedAt: "2026-07-30T19:00:00.000Z",
				payload: claimFields,
			},
			{
				kind: "assignment.dispatched",
				recordedAt: "2026-07-30T19:00:01.000Z",
				payload: ({operations}) => ({
					claimOperationId: operations[0].operationId,
					...claimFields,
				}),
			},
		],
	});
	const local = await createGitProposal(fixture.cloneA, state, sequence.operations);
	assert.equal((await pushGitProposal(fixture.cloneA, local.proposal)).status, "accepted");
	return {
		state: local.projected,
		claimOperationId: sequence.operations[0].operationId,
		assignmentOperationId: sequence.operations[1].operationId,
	};
}

describe("rolling Planning", () => {
	it("atomically commits exact participant bindings and a derived safe frontier", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const changeIds = ["CHG-rolling-a", "CHG-rolling-b"];
			const initialState = await seedChanges(fixture, changeIds);
			const content = candidateContentFromState(initialState, changeIds, "rolling");
			const first = content.workItems[0];
			const dependent = {
				...first,
				id: "work-rolling-dependent",
				title: "Verify rolling frontier",
				outcome: "Dependent work waits for completion.",
				dependsOnWorkItemIds: [first.id],
			};
			content.workItems = [first, dependent];
			content.sprints = [
				{...content.sprints[0], workItemIds: [first.id, dependent.id]},
			];
			const candidate = createCandidate(initialState, content);
			const exited = await acceptPlanningExits(
				fixture,
				initialState,
				candidate,
				"rolling",
			);
			const receipt = await commitEpoch(
				fixture,
				exited.state,
				candidate,
				exited.report,
				"2026-07-30T18:10:00.000Z",
			);
			const epoch = receipt.observation.workState.planningEpochs.at(-1);
			assert.equal(epoch.operationId, receipt.epochId);
			assert.deepEqual(epoch.body.safeExecutionFrontier, [first.id]);
			assert.equal(epoch.body.participants.length, 2);
			for (const participant of epoch.body.participants) {
				const change = receipt.observation.workState.changes.find(
					(entry) => entry.changeId === participant.changeId,
				);
				assert.equal(
					change.planningEpochBindings.at(-1).planningEpochId,
					epoch.operationId,
				);
			}
			const view = projectRollingPlanningView(receipt.observation.workState);
			assert.deepEqual(
				view.workItems.map((item) => [item.id, item.status]),
				[
					[first.id, "ready"],
					[dependent.id, "waiting"],
				],
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("rejects a stale global Candidate instead of rewriting active Planning", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const changeId = "CHG-rolling-stale";
			const initialState = await seedChanges(fixture, [changeId]);
			const content = candidateContentFromState(initialState, [changeId], "stale");
			const candidate = createCandidate(initialState, content);
			const exited = await acceptPlanningExits(
				fixture,
				initialState,
				candidate,
				"stale",
			);
			const concurrent = await createGitProposal(
				fixture.cloneA,
				exited.state,
				buildOpenChangeRecords(exited.state, "CHG-concurrent-decision"),
			);
			assert.equal(
				(await pushGitProposal(fixture.cloneA, concurrent.proposal)).status,
				"accepted",
			);
			await assert.rejects(
				() =>
					commitEpoch(
						fixture,
						exited.state,
						candidate,
						exited.report,
						"2026-07-30T18:20:00.000Z",
					),
				/WorkState is stale and must be rerun/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("preserves exact active work, then records explicit pause without expiry", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const changeId = "CHG-rolling-active";
			let state = await seedChanges(fixture, [changeId]);
			const initialContent = candidateContentFromState(state, [changeId], "active");
			const initialCandidate = createCandidate(state, initialContent);
			let exited = await acceptPlanningExits(
				fixture,
				state,
				initialCandidate,
				"active-initial",
			);
			let receipt = await commitEpoch(
				fixture,
				exited.state,
				initialCandidate,
				exited.report,
				"2026-07-30T18:30:00.000Z",
			);
			state = receipt.observation.workState;
			await synchronizeTestState(fixture.cloneA);
			const assignment = await appendActiveAssignment(
				fixture,
				state,
				state.planningEpochs.at(-1),
				changeId,
			);
			state = assignment.state;

			const preservedContent = candidateContentFromState(state, [changeId], "active");
			preservedContent.activeWorkDispositions = [
				{
					workItemId: preservedContent.workItems[0].id,
					disposition: "preserve",
					activeAssignmentOperationId: assignment.assignmentOperationId,
					reason: "Exact scope and bindings remain valid.",
				},
			];
			const preservedCandidate = createCandidate(state, preservedContent);
			exited = await acceptPlanningExits(
				fixture,
				state,
				preservedCandidate,
				"active-preserve",
			);
			const resolved = resolveRollingPlanningEpoch({
				state: exited.state,
				candidate: preservedCandidate,
				exitReport: exited.report,
				authorityBinding: plannerAuthority,
				recordedAt: "2026-07-30T18:40:00.000Z",
			});
			assert.deepEqual(resolved.epoch.body.safeExecutionFrontier, [
				preservedContent.workItems[0].id,
			]);
			receipt = await commitEpoch(
				fixture,
				exited.state,
				preservedCandidate,
				exited.report,
				"2026-07-30T18:40:00.000Z",
			);
			state = receipt.observation.workState;
			assert.equal(
				state.changes[0].assignments.find(
					(entry) => entry.operationId === assignment.assignmentOperationId,
				).status,
				"active",
			);

			await synchronizeTestState(fixture.cloneA);
			const pausedContent = candidateContentFromState(state, [changeId], "active");
			pausedContent.activeWorkDispositions = [
				{
					workItemId: pausedContent.workItems[0].id,
					disposition: "pause",
					activeAssignmentOperationId: assignment.assignmentOperationId,
					reason: "New global dependency requires explicit pause.",
				},
			];
			const pausedCandidate = createCandidate(state, pausedContent);
			exited = await acceptPlanningExits(
				fixture,
				state,
				pausedCandidate,
				"active-pause",
			);
			receipt = await commitEpoch(
				fixture,
				exited.state,
				pausedCandidate,
				exited.report,
				"2099-01-01T00:00:00.000Z",
			);
			const pausedEpoch = receipt.observation.workState.planningEpochs.at(-1);
			assert.deepEqual(pausedEpoch.body.safeExecutionFrontier, []);
			assert.equal(
				projectRollingPlanningView(receipt.observation.workState).workItems[0].status,
				"paused",
			);
			assert.equal(
				receipt.observation.workState.changes[0].workItemClaims.find(
					(claim) => claim.operationId === assignment.claimOperationId,
				).status,
				"active",
			);
		} finally {
			await fixture.cleanup();
		}
	});
});
