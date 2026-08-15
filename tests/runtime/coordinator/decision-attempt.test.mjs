import assert from "node:assert/strict";
import {it} from "node:test";

import {
	createInitialProjectWorkState,
	createNextChangeOperation,
	pushSynchronizedStateBatch,
	synchronizeGitState,
} from "../../../src/changes/trace/index.ts";
import {createDecisionGate} from "../../../src/runtime/lifecycle/decision.ts";
import {
	DECISION_CANDIDATE_PRODUCTION_PROTOCOL,
	createNativeDecisionAttemptExecutor,
} from "../../../src/runtime/coordinator/decision-attempt.ts";
import {
	allowAllReplayPolicy,
	baseSnapshotFor,
} from "../../helpers/change-trace-replay-v1.mjs";
import {authorityBinding, digest} from "../../helpers/change-trace-v1.mjs";
import {
	buildOpenChangeRecords,
	createGitProposal,
	createTwoCloneFixture,
	pushGitProposal,
} from "../../helpers/git-state-v1.mjs";

const repositoryIdentity = digest("a");

function projectSnapshotFor(state) {
	return {
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
	};
}

it("executes and recovers one authenticated native Decision attempt without reinvoking its producer", async () => {
	const fixture = await createTwoCloneFixture();
	try {
		const changeId = "CHG-native-decision-executor";
		const initial = createInitialProjectWorkState();
		const opened = await createGitProposal(
			fixture.cloneA,
			initial,
			buildOpenChangeRecords(initial, changeId),
		);
		assert.equal(
			(await pushGitProposal(fixture.cloneA, opened.proposal)).status,
			"accepted",
		);
		const project = projectSnapshotFor(opened.projected);
		const observed = await synchronizeGitState({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: project,
			policy: allowAllReplayPolicy,
		});
		const change = observed.workState.changes[0];
		const attempt = createNextChangeOperation(change, {
			changeId,
			kind: "loop.attempt_started",
			baseSnapshot: baseSnapshotFor(observed.workState),
			authorityBinding: authorityBinding({
				authenticationEvidenceId: "auth:native-decision-executor",
			}),
			recordedAt: "2026-08-01T12:00:00.000Z",
			payload: {
				loop: "decision",
				changeRevisionId: change.currentRevision.revisionId,
				loopProtocolDigest: digest("7"),
				routeId: "decision-selected-v2",
				privateAttemptDigest: digest("9"),
			},
		});
		const startPush = await pushSynchronizedStateBatch({
			repoRoot: fixture.cloneB,
			remote: "origin",
			state: observed.workState,
			records: [attempt],
			policy: allowAllReplayPolicy,
			observation: observed,
		});
		assert.equal(startPush.pushResult.status, "accepted");
		const selected = await synchronizeGitState({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: project,
			policy: allowAllReplayPolicy,
		});
		const selectedChange = selected.workState.changes[0];
		let producerCalls = 0;
		let producerRequest;
		const executor = createNativeDecisionAttemptExecutor({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: () => project,
			replayPolicy: allowAllReplayPolicy,
			authorityBinding: authorityBinding(),
			createDecisionGate({teamSnapshot}) {
				return {
					protectedSourceHead: teamSnapshot.protectedSourceHead,
					projectConfigDigest: teamSnapshot.configDigest,
					decisionGate: createDecisionGate(),
				};
			},
			producer: {
				produce({request, signal}) {
					producerCalls += 1;
					producerRequest = request;
					assert.equal(signal.aborted, false);
					return {
						disposition: "approve",
						rationale: "Evaluate the exact selected native revision.",
					};
				},
			},
			now: () => "2026-08-01T12:01:00.000Z",
		});
		const cancelled = new AbortController();
		cancelled.abort();
		await assert.rejects(
			executor.run({
				attemptOperationId: attempt.operationId,
				changeId,
				changeRevisionId: selectedChange.currentRevision.revisionId,
				signal: cancelled.signal,
			}),
			(error) => error?.name === "AbortError",
		);
		assert.equal(producerCalls, 0);

		let staleBindingProducerCalls = 0;
		const staleBindingExecutor = createNativeDecisionAttemptExecutor({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: () => project,
			replayPolicy: allowAllReplayPolicy,
			authorityBinding: authorityBinding(),
			createDecisionGate({teamSnapshot}) {
				return {
					protectedSourceHead: teamSnapshot.protectedSourceHead,
					projectConfigDigest: digest("0"),
					decisionGate: createDecisionGate(),
				};
			},
			producer: {
				produce() {
					staleBindingProducerCalls += 1;
					return {
						disposition: "approve",
						rationale: "This stale policy binding must not execute.",
					};
				},
			},
		});
		await assert.rejects(
			staleBindingExecutor.run({
				attemptOperationId: attempt.operationId,
				changeId,
				changeRevisionId: selectedChange.currentRevision.revisionId,
				signal: new AbortController().signal,
			}),
			/not bound to the current protected project snapshot/,
		);
		assert.equal(staleBindingProducerCalls, 0);

		const controller = new AbortController();
		const result = await executor.run({
			attemptOperationId: attempt.operationId,
			changeId,
			changeRevisionId: selectedChange.currentRevision.revisionId,
			signal: controller.signal,
		});

		assert.equal(producerCalls, 1);
		assert.deepEqual(Object.keys(producerRequest).sort(), [
			"attemptOperationId",
			"changeId",
			"changeRevisionId",
			"protocolId",
			"protocolVersion",
			"relationships",
			"revision",
			"workStateDigest",
		]);
		assert.equal(
			producerRequest.protocolId,
			DECISION_CANDIDATE_PRODUCTION_PROTOCOL.id,
		);
		assert.equal(
			producerRequest.protocolVersion,
			DECISION_CANDIDATE_PRODUCTION_PROTOCOL.version,
		);
		assert.equal(producerRequest.attemptOperationId, attempt.operationId);
		assert.equal(
			producerRequest.changeRevisionId,
			selectedChange.currentRevision.revisionId,
		);
		assert.equal(
			producerRequest.workStateDigest,
			selected.workState.workStateDigest,
		);
		assert.equal(result.attemptOperationId, attempt.operationId);
		assert.equal(result.status, "passed");
		assert.match(result.candidateId, /^candidate:decision:/);
		assert.match(result.gateReportOperationId, /^sha256:/);
		assert.match(result.transitionOperationId, /^sha256:/);
		assert.match(result.terminalOperationId, /^sha256:/);

		const noReinvoke = createNativeDecisionAttemptExecutor({
			repoRoot: fixture.cloneB,
			remote: "origin",
			repositoryIdentity,
			currentProject: () => project,
			replayPolicy: allowAllReplayPolicy,
			authorityBinding: authorityBinding(),
			createDecisionGate() {
				throw new Error("completed Decision must not recreate Decision Gate");
			},
			producer: {
				produce() {
					throw new Error("completed Decision must not reinvoke producer");
				},
			},
		});
		const recovered = await noReinvoke.recover({
			attemptOperationId: attempt.operationId,
			changeId,
			changeRevisionId: selectedChange.currentRevision.revisionId,
		});
		assert.equal(recovered.status, "completed");
		assert.deepEqual(recovered.result, result);
		assert.deepEqual(
			await noReinvoke.run({
				attemptOperationId: attempt.operationId,
				changeId,
				changeRevisionId: selectedChange.currentRevision.revisionId,
				signal: controller.signal,
			}),
			result,
		);
	} finally {
		await fixture.cleanup();
	}
});
