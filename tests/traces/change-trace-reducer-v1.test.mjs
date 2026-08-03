import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createCanonicalChangeOperation,
	createInitialProjectWorkState,
	createManifestForRecords,
	createNextChangeOperation,
	reduceAcceptedStateBatch,
	reduceChangeOperation,
	replayAcceptedStateBatches,
	sameWorkState,
} from "../../src/change-trace/index.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
} from "../../src/utils/canonical-json.ts";
import {authorityBinding, digest, gitObject} from "../helpers/change-trace-v1.mjs";
import {
	acceptedBatch,
	allowAllReplayPolicy,
	appendContradictoryDecisionResults,
	baseSnapshotFor,
	buildOperationSequence,
	createThreeBatchJourney,
	openProposedChange,
	reduceBatch,
} from "../helpers/change-trace-replay-v1.mjs";

function assertReductionCode(code, action) {
	assert.throws(action, (error) => error?.code === code);
}

describe("Change Trace deterministic reducer", () => {
	it("reduces exact state batches without mutating prior projections", () => {
		const initial = createInitialProjectWorkState();
		const initialBytes = canonicalJson(initial);
		const opened = openProposedChange(initial, "CHG-reducer");
		assert.equal(canonicalJson(initial), initialBytes);
		assert.equal(opened.state.changes.length, 1);
		assert.equal(opened.state.changes[0].currentRevision.revisionId, opened.revision.revisionId);
		assert.equal(opened.state.changes[0].operations.length, 2);
		assert.equal(Object.isFrozen(opened.state), true);
		assert.equal(Object.isFrozen(opened.state.changes), true);
	});

	it("proves full and incremental replay equivalence including Planning epochs", () => {
		const journey = createThreeBatchJourney();
		const full = replayAcceptedStateBatches(
			journey.batches,
			allowAllReplayPolicy,
		);
		const incremental = journey.batches.reduce(
			(state, batch) =>
				reduceAcceptedStateBatch(state, batch, allowAllReplayPolicy),
			journey.initial,
		);
		assert.equal(sameWorkState(full, incremental), true);
		assert.equal(sameWorkState(full, journey.states[2]), true);
		assert.equal(full.planningEpochs[0].operationId, journey.epoch.operationId);
		assert.equal(full.changes[0].planningEpochBindings.length, 1);
		assert.deepEqual(
			full.changes[0].planningEpochBindings[0].workItemIds,
			["work-reducer"],
		);
	});

	it("rejects unauthorized and stale operations before reduction", () => {
		const initial = createInitialProjectWorkState();
		const opened = openProposedChange(initial, "CHG-admission");
		const change = opened.state.changes[0];
		const feedback = buildOperationSequence({
			change,
			changeId: change.changeId,
			baseSnapshot: baseSnapshotFor(opened.state),
			specifications: [
				{
					kind: "change.feedback_recorded",
					recordedAt: "2026-07-30T13:30:00.000Z",
					payload: {
						revisionId: change.currentRevision.revisionId,
						classification: "concern",
						summary: "Verify authority before acceptance.",
						provenanceRefs: ["review:authority"],
					},
				},
			],
		});
		const batch = acceptedBatch(opened.state, feedback.operations, gitObject("b"));
		assertReductionCode("UNAUTHORIZED_ACTOR", () =>
			reduceAcceptedStateBatch(opened.state, batch, {
				authorize: () => false,
				acceptSnapshot: () => true,
			}),
		);

		const stale = buildOperationSequence({
			change,
			changeId: change.changeId,
			baseSnapshot: {...baseSnapshotFor(opened.state), remoteStateHead: null},
			specifications: [
				{
					kind: "change.feedback_recorded",
					recordedAt: "2026-07-30T13:30:01.000Z",
					payload: {
						revisionId: change.currentRevision.revisionId,
						classification: "concern",
						summary: "Reject stale accepted bases.",
						provenanceRefs: ["review:stale"],
					},
				},
			],
		});
		assertReductionCode("STALE_BASE", () =>
			reduceBatch(opened.state, stale.operations, gitObject("c")),
		);
	});

	it("rejects duplicate operations, missing parents, and state-digest tampering", () => {
		const initial = createInitialProjectWorkState();
		const opened = openProposedChange(initial, "CHG-adversarial");
		const duplicateManifest = createManifestForRecords(opened.state, [opened.operations[0]]);
		assertReductionCode("DUPLICATE_OPERATION", () =>
			reduceAcceptedStateBatch(
				opened.state,
				{
					stateHead: gitObject("b"),
					manifest: duplicateManifest,
					records: [opened.operations[0]],
				},
				allowAllReplayPolicy,
			),
		);

		const change = opened.state.changes[0];
		const sources = [
			{
				changeId: "CHG-adversarial",
				revisionId: change.currentRevision.revisionId,
				tailOperationId: change.tailOperationId,
			},
			{changeId: "CHG-other", revisionId: digest("4"), tailOperationId: digest("5")},
		].sort((left, right) => left.changeId.localeCompare(right.changeId));
		const result = {
			changeId: "CHG-result",
			revisionId: digest("6"),
			tailOperationId: digest("7"),
		};
		const rationale = "Converge exact accepted intent.";
		const mergeId = canonicalJsonDigest({sources, result, rationale});
		const merge = createNextChangeOperation(change, {
			changeId: change.changeId,
			kind: "change.merge_recorded",
			additionalParents: [digest("f")],
			baseSnapshot: baseSnapshotFor(opened.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-07-30T13:31:00.000Z",
			payload: {mergeId, role: "source", sources, result, rationale},
		});
		assertReductionCode("UNKNOWN_PARENT", () =>
			reduceChangeOperation(change, merge, {planningEpochs: []}),
		);

		const valid = buildOperationSequence({
			change,
			changeId: change.changeId,
			baseSnapshot: baseSnapshotFor(opened.state),
			specifications: [
				{
					kind: "change.feedback_recorded",
					recordedAt: "2026-07-30T13:31:01.000Z",
					payload: {
						revisionId: change.currentRevision.revisionId,
						classification: "clarification",
						summary: "Bind exact reduction digest.",
						provenanceRefs: ["review:digest"],
					},
				},
			],
		}).operations[0];
		const badDigest = createCanonicalChangeOperation({
			...valid.body,
			postStateDigest: digest("0"),
		});
		assertReductionCode("STATE_DIGEST_MISMATCH", () =>
			reduceChangeOperation(change, badDigest, {planningEpochs: []}),
		);
	});

	it("retains contradictory Results as explicit projected facts", () => {
		const initial = createInitialProjectWorkState();
		const opened = openProposedChange(initial, "CHG-contradiction");
		const contradicted = appendContradictoryDecisionResults(
			opened.state,
			gitObject("b"),
		);
		const change = contradicted.state.changes[0];
		assert.equal(change.contradictions.length, 1);
		assert.deepEqual(
			new Set(change.contradictions[0].values),
			new Set(["passed", "failed"]),
		);
		assert.equal(
			change.operations.filter(
				(operation) => operation.body.kind === "check.result_recorded",
			).length,
			2,
		);
	});

	it("holds replay equivalence across deterministic randomized batch boundaries", () => {
		for (let seed = 1; seed <= 20; seed += 1) {
			const initial = createInitialProjectWorkState();
			const opened = openProposedChange(initial, `CHG-property-${seed}`);
			const batches = [acceptedBatch(initial, opened.operations, gitObject("a"))];
			let state = opened.state;
			let emitted = 0;
			let random = seed;
			while (emitted < 20) {
				random = (random * 1_664_525 + 1_013_904_223) >>> 0;
				const count = Math.min((random % 5) + 1, 20 - emitted);
				const change = state.changes[0];
				const specs = Array.from({length: count}, (_, offset) => {
					const index = emitted + offset;
					return {
						kind: "change.feedback_recorded",
						recordedAt: `2026-07-30T14:00:${String(index).padStart(2, "0")}.000Z`,
						payload: {
							revisionId: change.currentRevision.revisionId,
							classification: "clarification",
							summary: `Deterministic feedback ${index}.`,
							provenanceRefs: [`property:${seed}:${index}`],
						},
					};
				});
				const built = buildOperationSequence({
					change,
					changeId: change.changeId,
					baseSnapshot: baseSnapshotFor(state),
					specifications: specs,
				});
				const stateHead = (seed * 1_000 + batches.length)
					.toString(16)
					.padStart(40, "0");
				const batch = acceptedBatch(state, built.operations, stateHead);
				batches.push(batch);
				state = reduceAcceptedStateBatch(state, batch, allowAllReplayPolicy);
				emitted += count;
			}
			const replayed = replayAcceptedStateBatches(batches, allowAllReplayPolicy);
			assert.equal(sameWorkState(replayed, state), true, `seed ${seed}`);
		}
	});
});
