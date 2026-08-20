import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createNextChangeOperation} from "../../../src/changes/trace/index.ts";
import {
	assertDecisionAcceptedActiveChangesBinding,
} from "../../../src/loops/decision/accepted-active-changes.ts";
import {createDecisionCandidate} from "../../../src/loops/decision/candidate.ts";
import {createNativeDecisionOperationSequence} from "../../../src/project-server/effects/gate-operations.ts";
import {createDecisionGate} from "../../../src/project-server/lifecycle/gates.ts";
import {
	baseSnapshotFor,
	reduceBatch,
} from "../../helpers/change-trace-replay-v1.mjs";
import {
	authorityBinding,
	digest,
	gitObject,
} from "../../helpers/change-trace-v1.mjs";
import {
	checkExecutor,
	checkOutput,
	checkSnapshot,
	packagedCheck,
} from "../../helpers/checks.mjs";
import {
	nativeDecisionRevision,
	nativeDecisionState,
} from "../../helpers/native-decision.mjs";

function startDecisionAttempt(state, changeId, marker) {
	const change = state.changes.find((entry) => entry.changeId === changeId);
	const attempt = createNextChangeOperation(change, {
		changeId,
		kind: "loop.attempt_started",
		baseSnapshot: baseSnapshotFor(state),
		authorityBinding: authorityBinding({
			authenticationEvidenceId: `auth:accepted-active-changes-${marker}`,
		}),
		recordedAt: `2026-08-02T10:00:0${marker}.000Z`,
		payload: {
			loop: "decision",
			changeRevisionId: change.currentRevision.revisionId,
			loopProtocolDigest: digest(`${marker}`),
			routeId: "decision-accepted-active-changes-v1",
			privateAttemptDigest: digest(`${marker + 1}`),
		},
	});
	return {
		attempt,
		state: reduceBatch(
			state,
			[attempt],
			gitObject(["0", "a", "c", "e", "1"][marker]),
		),
	};
}

async function runCompatibilityGate(decisionCandidate, changeId) {
	const compatibilityCheck = packagedCheck({
		definition: {
			id: "active_change_compatibility",
			implementation: {
				kind: "model",
				route: "decision-compatibility",
				profile: "decision-model-check",
				maximumTokens: 1024,
			},
		},
	});
	return createDecisionGate({
		packSnapshot: checkSnapshot([compatibilityCheck]),
		executors: [
			checkExecutor({
				identity: {
					kind: "model",
					profile: "decision-model-check",
					route: "decision-compatibility",
				},
				execute({invocation}) {
					const acceptedChanges = invocation.subject.content.acceptedActiveChanges;
					assert.equal(acceptedChanges.requiredCheckId, "active_change_compatibility");
					assert.deepEqual(
						acceptedChanges.comparedChangeIds,
						acceptedChanges.expectedChangeIds,
					);
					return checkOutput(invocation);
				},
			}),
		],
	}).run({
		candidate: decisionCandidate,
		changeRef: `change:${changeId}`,
		evidenceRecords: [],
	});
}

async function acceptDecision(state, changeId, marker) {
	const started = startDecisionAttempt(state, changeId, marker);
	const decisionCandidate = candidate(started.state, changeId);
	const gate = await runCompatibilityGate(decisionCandidate, changeId);
	const sequence = createNativeDecisionOperationSequence({
		state: started.state,
		changeId,
		attemptOperationId: started.attempt.operationId,
		baseSnapshot: baseSnapshotFor(started.state),
		authorityBinding: authorityBinding(),
		recordedAt: `2026-08-02T10:01:0${marker}.000Z`,
		candidate: decisionCandidate,
		packSnapshot: gate.packSnapshot,
		evidenceRecords: [],
		report: gate.report,
		transition: gate.transition,
	});
	return reduceBatch(
		started.state,
		sequence.operations,
		gitObject(["1", "b", "d", "f", "2"][marker]),
	);
}

function candidate(state, changeId) {
	return createDecisionCandidate({
		state,
		changeId,
		proposal: {
			disposition: "approve",
			rationale: "Compare every accepted nonterminal Change revision.",
		},
	});
}

describe("Decision accepted active Changes binding", () => {
	it("covers every accepted nonterminal Change at its exact accepted revision", async () => {
		const subjectRevision = nativeDecisionRevision({
			changeId: "CHG-subject",
			targetRefs: ["src/shared.ts"],
		});
		const acceptedRevision = nativeDecisionRevision({
			changeId: "CHG-accepted",
			targetRefs: ["src/shared.ts"],
		});
		const unrelatedRevision = nativeDecisionRevision({
			changeId: "CHG-unrelated",
			targetRefs: ["src/unrelated.ts"],
		});
		const pendingRevision = nativeDecisionRevision({changeId: "CHG-pending"});
		let state = nativeDecisionState([
			{changeId: "CHG-subject", revision: subjectRevision},
			{changeId: "CHG-accepted", revision: acceptedRevision},
			{changeId: "CHG-unrelated", revision: unrelatedRevision},
			{changeId: "CHG-pending", revision: pendingRevision},
		]);
		state = await acceptDecision(state, "CHG-accepted", 1);
		state = await acceptDecision(state, "CHG-unrelated", 2);

		const decisionCandidate = candidate(state, "CHG-subject");
		const acceptedChanges = decisionCandidate.content.acceptedActiveChanges;
		assert.equal(acceptedChanges.schemaVersion, "1.0.0");
		assert.equal(acceptedChanges.requiredCheckId, "active_change_compatibility");
		assert.equal(acceptedChanges.coverage, "complete");
		assert.deepEqual(acceptedChanges.expectedChangeIds, [
			"CHG-accepted",
			"CHG-unrelated",
		]);
		assert.deepEqual(acceptedChanges.comparedChangeIds, acceptedChanges.expectedChangeIds);
		assert.equal(acceptedChanges.changes.length, 2);
		assert.equal(acceptedChanges.changes[0].changeId, "CHG-accepted");
		assert.equal(
			acceptedChanges.changes[0].revision.revisionId,
			acceptedRevision.revisionId,
		);
		assert.equal(
			acceptedChanges.changes[1].revision.revisionId,
			unrelatedRevision.revisionId,
		);
		assert.deepEqual(
			decisionCandidate.content.activeOverlaps.map((overlap) => overlap.changeId),
			["CHG-accepted"],
		);
		assert.throws(
			() =>
				assertDecisionAcceptedActiveChangesBinding({
					...acceptedChanges,
					comparedChangeIds: ["CHG-accepted"],
				}),
			/incomplete/,
		);
	});

	it("stops Decision when active compatibility Model Check is absent", async () => {
		let state = nativeDecisionState([
			{changeId: "CHG-subject", revision: nativeDecisionRevision({changeId: "CHG-subject"})},
			{changeId: "CHG-active", revision: nativeDecisionRevision({changeId: "CHG-active"})},
		]);
		state = await acceptDecision(state, "CHG-active", 1);
		const decisionCandidate = candidate(state, "CHG-subject");
		const gate = await createDecisionGate().run({
			candidate: decisionCandidate,
			changeRef: "change:CHG-subject",
			evidenceRecords: [],
		});
		assert.equal(gate.report.status, "stopped");
		assert.equal(gate.report.stoppedReason?.code, "malformed_check");
		assert.equal(
			gate.report.stoppedReason?.checkId,
			"active_change_compatibility",
		);
	});

	it("invalidates a passed Candidate when another Change joins the accepted active Changes", async () => {
		const state = nativeDecisionState([
			{changeId: "CHG-subject", revision: nativeDecisionRevision({changeId: "CHG-subject"})},
			{changeId: "CHG-first", revision: nativeDecisionRevision({changeId: "CHG-first"})},
			{changeId: "CHG-second", revision: nativeDecisionRevision({changeId: "CHG-second"})},
		]);
		const firstAccepted = await acceptDecision(state, "CHG-first", 2);
		const subjectAttempt = startDecisionAttempt(
			firstAccepted,
			"CHG-subject",
			1,
		);
		const staleCandidate = candidate(subjectAttempt.state, "CHG-subject");
		const staleGate = await runCompatibilityGate(
			staleCandidate,
			"CHG-subject",
		);
		const secondAccepted = await acceptDecision(
			subjectAttempt.state,
			"CHG-second",
			3,
		);
		const currentCandidate = candidate(secondAccepted, "CHG-subject");

		assert.notEqual(
			staleCandidate.content.acceptedActiveChanges.digest,
			currentCandidate.content.acceptedActiveChanges.digest,
		);
		assert.deepEqual(currentCandidate.content.acceptedActiveChanges.expectedChangeIds, [
			"CHG-first",
			"CHG-second",
		]);
		assert.throws(
			() =>
				createNativeDecisionOperationSequence({
					state: secondAccepted,
					changeId: "CHG-subject",
					attemptOperationId: subjectAttempt.attempt.operationId,
					baseSnapshot: baseSnapshotFor(secondAccepted),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-08-02T10:09:00.000Z",
					candidate: staleCandidate,
					packSnapshot: staleGate.packSnapshot,
					evidenceRecords: [],
					report: staleGate.report,
					transition: staleGate.transition,
				}),
			/not the exact Project Server materialization/,
		);
	});
});
