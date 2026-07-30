import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {createLoopCandidate} from "../../src/loop-exit/identity.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {createCheckResult, createExitReport} from "../../src/loop-exit/results.ts";
import {deriveDecisionRuntimeRoute} from "../../src/decision/exit/runtime.ts";
import {createNativeDecisionOperationSequence} from "../../src/runtime/native-decision-operations.ts";
import {
	baseSnapshotFor,
	openProposedChange,
	reduceBatch,
} from "../helpers/change-trace-replay-v1.mjs";
import {
	authorityBinding,
	digest,
	gitObject,
} from "../helpers/change-trace-v1.mjs";
import {createInitialProjectWorkState} from "../../src/change-trace/index.ts";

function nativeDecisionArtifacts(change) {
	const candidate = createLoopCandidate({
		schemaVersion: "1.0.0",
		loop: "decision",
		content: {disposition: "approve", rationale: "Exact revision is ready."},
		observedBase: {
			workStateDigest: change.stateDigest,
			knowledgeSnapshotDigest: digest("8"),
			canonicalRefs: [change.currentRevision.revisionId],
		},
	});
	const catalog = createCheckCatalog();
	const resolved = resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId: change.changeId,
				revision: 1,
				digest: change.currentRevision.revisionId,
				kind: "improve",
				type: "workflow_change",
				risk: "low",
				affectedLayers: ["runtime"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: ["src/runtime/native-decision-operations.ts"],
	});
	const binding = resolved.bindings.find(
		(candidateBinding) => candidateBinding.checkId === "change_revision_ready",
	);
	const policy = createResolvedExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		catalogDigest: resolved.catalogDigest,
		selectorInputDigest: resolved.selectorInputDigest,
		bindings: [binding],
		protectedCheckIds: [binding.checkId],
	});
	const check = catalog.get("change_revision_ready", "decision").check;
	const result = createCheckResult({
		loop: "decision",
		policy,
		check,
		disposition: "satisfied",
		measurement: {shape: "boolean", value: true},
		evidenceResolutions: [],
		findings: [],
		execution: check.execution,
	});
	const report = createExitReport({policy, checkResults: [result]});
	const route = deriveDecisionRuntimeRoute(candidate, report);
	return {candidate, policy, report, route};
}

describe("native Decision canonical operation sequence", () => {
	it("records exact Candidate-to-Route artifacts as one replayable parent chain", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-operations",
		);
		const change = opened.state.changes[0];
		const artifacts = nativeDecisionArtifacts(change);
		const sequence = createNativeDecisionOperationSequence({
			state: change,
			baseSnapshot: baseSnapshotFor(opened.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-07-30T15:00:00.000Z",
			...artifacts,
			evidenceRecords: [],
		});
		assert.deepEqual(
			sequence.operations.map((operation) => operation.body.kind),
			[
				"loop.attempt_started",
				"decision.candidate_recorded",
				"loop.exit_policy_recorded",
				"check.result_recorded",
				"loop.exit_report_recorded",
				"runtime.route_recorded",
				"loop.attempt_ended",
			],
		);
		assert.equal(sequence.state.loopAttempts[0].status, "passed");
		assert.equal(
			sequence.state.loopAttempts[0].routeOperationId,
			sequence.routeOperationId,
		);
		const accepted = reduceBatch(
			opened.state,
			sequence.operations,
			gitObject("b"),
		);
		assert.equal(
			accepted.changes[0].stateDigest,
			sequence.state.stateDigest,
		);
		const routeOperation = sequence.operations.find(
			(operation) => operation.body.kind === "runtime.route_recorded",
		);
		assert.equal(routeOperation.body.payload.route, "planning");
		assert.equal(routeOperation.body.payload.exitReportId, sequence.exitReportId);
	});

	it("rejects a stale Candidate revision before operation creation", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-stale",
		);
		const change = opened.state.changes[0];
		const artifacts = nativeDecisionArtifacts(change);
		assert.throws(
			() =>
				createNativeDecisionOperationSequence({
					state: change,
					baseSnapshot: baseSnapshotFor(opened.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-07-30T15:10:00.000Z",
					...artifacts,
					candidate: {
						...artifacts.candidate,
						observedBase: {
							...artifacts.candidate.observedBase,
							canonicalRefs: [],
						},
					},
					evidenceRecords: [],
				}),
			/does not bind current Change revision/,
		);
	});
});
