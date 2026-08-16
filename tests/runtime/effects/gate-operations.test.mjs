import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {checkSubjectFromCandidate} from "../../../src/checks/identity.ts";
import {
	assembleCheckInvocation,
	subjectInputSelection,
} from "../../../src/checks/protocol.ts";
import {createCheckResult, createGateReport} from "../../../src/checks/results.ts";
import {
	deriveDecisionLifecycleTransition,
	deriveReviewLifecycleTransition,
} from "../../../src/runtime/lifecycle/gates.ts";
import {
	createReviewAttempt,
	reviewSubjectFromAttempt,
} from "../../../src/loops/review/contracts.ts";
import {EVIDENCE_SCHEMA_VERSION} from "../../../src/evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../../src/evidence/materialize.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";
import {projectChecksState} from "../../../src/work-state/checks.ts";
import {
	commitNativeDecisionOperationSequence,
	commitReviewOperationSequence,
	createNativeDecisionOperationSequence,
	createReviewOperationSequence,
} from "../../../src/runtime/effects/gate-operations.ts";
import {
	allowAllReplayPolicy,
	baseSnapshotFor,
	buildOperationSequence,
	openProposedChange,
	revisionFor,
	reduceBatch,
} from "../../helpers/change-trace-replay-v1.mjs";
import {
	authorityBinding,
	digest,
	gitObject,
} from "../../helpers/change-trace-v1.mjs";
import {nativeDecisionCandidate} from "../../helpers/native-decision.mjs";
import {
	checkOutput,
	checkSnapshot,
	executionIdentity,
	packagedCheck,
} from "../../helpers/checks.mjs";
import {
	assertValidCanonicalChangeOperation,
	createInitialProjectWorkState,
	createNextChangeOperation,
	pushSynchronizedStateBatch,
	synchronizeGitState,
} from "../../../src/changes/trace/index.ts";
import {
	buildOpenChangeRecords,
	createGitProposal,
	createTwoCloneFixture,
	git,
	pushGitProposal,
} from "../../helpers/git-state-v1.mjs";

function sourceEvidence(change, candidate) {
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "source_observation",
			provenanceRefs: ["source:native-decision-test"],
			payload: {
				sourceType: "source",
				snapshotDigest: digest("6"),
				paths: ["src/runtime/effects/gate-operations.ts"],
				symbols: ["createNativeDecisionOperationSequence"],
				ownershipRefs: ["component:runtime"],
				observations: ["Native Decision artifacts are inline."],
			},
		},
		{
			subject: {
				changeRefs: [`change:${change.changeId}`],
				changeRevisionDigests: [change.currentRevision.revisionId],
				candidateDigest: candidate.digest,
				acceptanceRequirementIds:
					candidate.content.revision.acceptanceRequirements.map(
						(requirement) => requirement.id,
					),
			},
			observedAt: "2026-07-30T15:04:00.000Z",
			producer: {kind: "runtime", id: "native-decision-test", version: "1.0.0"},
			authority: "observed",
			coverage: "complete",
			sensitivity: "project",
		},
	);
}

function failedReviewArtifacts(changeId) {
	const check = packagedCheck({
		stage: "review",
		definition: {
			id: "delivery-ready",
			failure: {
				code: "delivery_not_ready",
				message: "Delivery proof is incomplete.",
				remediation: ["Add exact delivery proof."],
			},
			inputs: [
				{
					source: "subject",
					refs: [],
					required: true,
					maximumBytes: 1_048_576,
				},
			],
		},
	});
	const packSnapshot = checkSnapshot([check], {stage: "review"});
	const attempt = createReviewAttempt({
		integratedHead: "f".repeat(40),
		integratedTree: "e".repeat(40),
		targetBranch: "main",
		changeIds: [`change:${changeId}`],
		workItemIds: ["work-item:WI-feedback"],
		checkPackSnapshotDigest: packSnapshot.checkPackDigest,
		providerReceiptDigests: [],
		evidenceRecordDigests: [],
	});
	const subject = reviewSubjectFromAttempt(attempt);
	const invocation = assembleCheckInvocation({
		subject,
		snapshot: packSnapshot,
		check,
		inputs: [subjectInputSelection(subject, check.definition.inputs[0])],
	});
	const execution = executionIdentity();
	const result = createCheckResult({
		snapshot: packSnapshot,
		check,
		invocation,
		output: checkOutput(invocation, {
			measurement: {kind: "binary", value: false},
			summary: "Delivery proof is incomplete.",
			details: [{message: "Add exact delivery proof."}],
		}),
		execution,
	});
	const report = createGateReport({
		snapshot: packSnapshot,
		subjectDigest: subject.digest,
		results: [result],
		executions: [
			{
				packId: check.packId,
				checkId: check.checkId,
				source: "executed",
				status: "completed",
				attempts: 1,
				execution,
				resultDigest: result.resultDigest,
			},
		],
	});
	return {attempt, packSnapshot, report};
}

function nativeDecisionArtifacts(
	state,
	changeId,
	rationale = "Exact revision is ready.",
) {
	const candidate = nativeDecisionCandidate({state, changeId, rationale});
	const check = packagedCheck({
		definition: {
			id: "change-revision-ready",
			inputs: [
				{
					source: "subject",
					refs: [],
					required: true,
					maximumBytes: 1_048_576,
				},
			],
			limits: {
				timeoutMs: 1_000,
				maximumAttempts: 1,
				maximumInputBytes: 2_097_152,
				maximumOutputBytes: 65_536,
			},
		},
	});
	const packSnapshot = checkSnapshot([check]);
	const subject = checkSubjectFromCandidate(candidate);
	const invocation = assembleCheckInvocation({
		subject,
		snapshot: packSnapshot,
		check,
		inputs: [subjectInputSelection(subject, check.definition.inputs[0])],
	});
	const execution = executionIdentity();
	const result = createCheckResult({
		snapshot: packSnapshot,
		check,
		invocation,
		output: checkOutput(invocation),
		execution,
	});
	const report = createGateReport({
		snapshot: packSnapshot,
		subjectDigest: candidate.digest,
		results: [result],
		executions: [
			{
				packId: check.packId,
				checkId: check.checkId,
				source: "executed",
				status: "completed",
				attempts: 1,
				execution,
				resultDigest: result.resultDigest,
			},
		],
	});
	const transition = deriveDecisionLifecycleTransition(candidate, report);
	return {candidate, packSnapshot, report, transition};
}

const repositoryIdentity = digest("a");

function projectSnapshotFor(state) {
	return {
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
	};
}

function startDecisionAttempt(input) {
	const change = input.state.changes.find(
		(candidate) => candidate.changeId === input.changeId,
	);
	assert.ok(change?.currentRevision);
	const operation = createNextChangeOperation(change, {
		changeId: input.changeId,
		kind: "loop.attempt_started",
		baseSnapshot: baseSnapshotFor(input.state),
		authorityBinding: authorityBinding({
			authenticationEvidenceId: "auth:native-decision-selection",
		}),
		recordedAt: input.recordedAt,
		payload: {
			loop: "decision",
			changeRevisionId: change.currentRevision.revisionId,
			loopProtocolDigest: digest("7"),
			routeId: "decision-selected-v2",
			privateAttemptDigest: digest("9"),
		},
	});
	const state = reduceBatch(
		input.state,
		[operation],
		input.stateHead ?? gitObject("b"),
	);
	return {
		operation,
		state,
		change: state.changes.find((candidate) => candidate.changeId === input.changeId),
	};
}

describe("native Decision canonical operation continuation", () => {
	it("records exact Candidate-to-Route artifacts as one replayable parent chain", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-operations",
		);
		const started = startDecisionAttempt({
			state: opened.state,
			changeId: "CHG-native-decision-operations",
			recordedAt: "2026-07-30T14:59:00.000Z",
		});
		const artifacts = nativeDecisionArtifacts(
			started.state,
			"CHG-native-decision-operations",
		);
		const sequence = createNativeDecisionOperationSequence({
			state: started.state,
			changeId: "CHG-native-decision-operations",
			attemptOperationId: started.operation.operationId,
			baseSnapshot: baseSnapshotFor(started.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-07-30T15:00:00.000Z",
			...artifacts,
			evidenceRecords: [],
		});
		assert.deepEqual(
			sequence.operations.map((operation) => operation.body.kind),
			[
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
			sequence.transitionOperationId,
		);
		const accepted = reduceBatch(
			started.state,
			sequence.operations,
			gitObject("c"),
		);
		assert.equal(
			accepted.changes[0].stateDigest,
			sequence.state.stateDigest,
		);
		const routeOperation = sequence.operations.find(
			(operation) => operation.body.kind === "runtime.route_recorded",
		);
		assert.equal(routeOperation.body.payload.route, "planning");
		assert.equal(routeOperation.body.payload.exitReportId, sequence.gateReportId);
		const artifactOperations = [
			[sequence.operations[0], "candidate", artifacts.candidate],
			[sequence.operations[1], "policy", artifacts.packSnapshot],
			[sequence.operations[2], "result", artifacts.report.results[0]],
			[sequence.operations[3], "report", artifacts.report],
			[sequence.operations[4], "runtimeRoute", artifacts.transition],
		];
		for (const [operation, field, expected] of artifactOperations) {
			const canonicalOperation = /** @type {(typeof sequence.operations)[number]} */ (
				operation
			);
			const inline = canonicalOperation.body.payload[field];
			assert.equal(Object.hasOwn(inline, "ref"), false);
			assert.deepEqual(
				structuredClone(inline.artifact),
				structuredClone(expected),
			);
		}
		assert.equal(
			sequence.operations.some((operation) =>
				JSON.stringify(operation).includes("state:objects/"),
			),
			false,
		);
	});

	it("inlines validated Evidence Records without artifact refs", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-inline-evidence",
		);
		const started = startDecisionAttempt({
			state: opened.state,
			changeId: "CHG-native-decision-inline-evidence",
			recordedAt: "2026-07-30T15:03:00.000Z",
		});
		const artifacts = nativeDecisionArtifacts(
			started.state,
			"CHG-native-decision-inline-evidence",
		);
		const evidence = sourceEvidence(started.change, artifacts.candidate);
		const sequence = createNativeDecisionOperationSequence({
			state: started.state,
			changeId: "CHG-native-decision-inline-evidence",
			attemptOperationId: started.operation.operationId,
			baseSnapshot: baseSnapshotFor(started.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-07-30T15:04:00.000Z",
			...artifacts,
			evidenceRecords: [evidence],
		});
		const operation = /** @type {(typeof sequence.operations)[number]} */ (
			sequence.operations.find(
				(candidate) => candidate.body.kind === "evidence.recorded",
			)
		);
		assert.equal(operation.body.payload.evidence.id, evidence.evidenceId);
		assert.equal(Object.hasOwn(operation.body.payload.evidence, "ref"), false);
		assert.deepEqual(
			structuredClone(operation.body.payload.evidence.artifact),
			structuredClone(evidence),
		);
	});

	it("rejects oversized inline semantic artifacts", () => {
		const changeId = "CHG-native-decision-inline-size";
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			changeId,
		);
		const started = startDecisionAttempt({
			state: opened.state,
			changeId,
			recordedAt: "2026-07-30T15:04:00.000Z",
		});
		assert.throws(
			() =>
				createNativeDecisionOperationSequence({
					state: started.state,
					changeId,
					attemptOperationId: started.operation.operationId,
					baseSnapshot: baseSnapshotFor(started.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-07-30T15:04:30.000Z",
					...nativeDecisionArtifacts(
						started.state,
						changeId,
						"x".repeat(270_000),
					),
					evidenceRecords: [],
				}),
			/exceeds 262144 bytes/,
		);
	});

	it("rejects tampered inline semantic artifact bytes", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-inline-tamper",
		);
		const started = startDecisionAttempt({
			state: opened.state,
			changeId: "CHG-native-decision-inline-tamper",
			recordedAt: "2026-07-30T15:04:45.000Z",
		});
		const sequence = createNativeDecisionOperationSequence({
			state: started.state,
			changeId: "CHG-native-decision-inline-tamper",
			attemptOperationId: started.operation.operationId,
			baseSnapshot: baseSnapshotFor(started.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-07-30T15:05:00.000Z",
			...nativeDecisionArtifacts(
				started.state,
				"CHG-native-decision-inline-tamper",
			),
			evidenceRecords: [],
		});
		const tampered = structuredClone(sequence.operations[0]);
		tampered.body.payload.candidate.artifact.content.rationale = "Tampered.";
		tampered.body.payload.candidate.digest = canonicalJsonDigest(
			tampered.body.payload.candidate.artifact,
		);
		assert.throws(
			() => assertValidCanonicalChangeOperation(tampered),
			/Candidate semantic identity mismatch/,
		);
	});

	it("admits and verifies one exact inline Decision continuation through synchronized Git", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const initial = createInitialProjectWorkState();
			const opened = await createGitProposal(
				fixture.cloneA,
				initial,
				buildOpenChangeRecords(initial, "CHG-native-decision-git"),
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
			const started = startDecisionAttempt({
				state: observed.workState,
				changeId: "CHG-native-decision-git",
				recordedAt: "2026-07-30T15:06:00.000Z",
			});
			const startPush = await pushSynchronizedStateBatch({
				repoRoot: fixture.cloneB,
				remote: "origin",
				state: observed.workState,
				records: [started.operation],
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
			const change = selected.workState.changes[0];
			const artifacts = nativeDecisionArtifacts(
				selected.workState,
				change.changeId,
			);
			const receipt = await commitNativeDecisionOperationSequence({
				repoRoot: fixture.cloneB,
				remote: "origin",
				repositoryIdentity,
				currentProject: () => project,
				replayPolicy: allowAllReplayPolicy,
				authorityBinding: authorityBinding(),
				changeId: change.changeId,
				attemptOperationId: started.operation.operationId,
				expectedTeamSnapshotDigest: selected.teamSnapshot.snapshotDigest,
				expectedWorkStateDigest: selected.workState.workStateDigest,
				recordedAt: "2026-07-30T15:07:00.000Z",
				candidate: artifacts.candidate,
				packSnapshot: artifacts.packSnapshot,
				evidenceRecords: [],
				report: artifacts.report,
				transition: artifacts.transition,
			});
			assert.equal(receipt.observation.status, "fresh");
			assert.equal(receipt.observation.workState.stateHead, receipt.stateHead);
			assert.equal(
				receipt.observation.workState.changes[0].loopAttempts[0].status,
				"passed",
			);
			const tree = await git(fixture.cloneB, [
				"ls-tree",
				"-r",
				"--name-only",
				receipt.stateHead,
			]);
			assert.doesNotMatch(tree.stdout, /state\/objects/);
			assert.match(tree.stdout, /\.codewiki\/changes\//);
			await assert.rejects(
				commitNativeDecisionOperationSequence({
					repoRoot: fixture.cloneB,
					remote: "origin",
					repositoryIdentity,
					currentProject: () => project,
					replayPolicy: allowAllReplayPolicy,
					authorityBinding: authorityBinding(),
					changeId: change.changeId,
					attemptOperationId: started.operation.operationId,
					expectedTeamSnapshotDigest: selected.teamSnapshot.snapshotDigest,
					expectedWorkStateDigest: selected.workState.workStateDigest,
					recordedAt: "2026-07-30T15:07:00.000Z",
					candidate: artifacts.candidate,
					packSnapshot: artifacts.packSnapshot,
					evidenceRecords: [],
					report: artifacts.report,
					transition: artifacts.transition,
				}),
				/must be rerun/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("rejects Decision continuation without its canonical attempt", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-missing-attempt",
		);
		assert.throws(
			() =>
				createNativeDecisionOperationSequence({
					state: opened.state,
					changeId: "CHG-native-decision-missing-attempt",
					attemptOperationId: digest("0"),
					baseSnapshot: baseSnapshotFor(opened.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-07-30T15:08:00.000Z",
					...nativeDecisionArtifacts(
						opened.state,
						"CHG-native-decision-missing-attempt",
					),
					evidenceRecords: [],
				}),
			/exact authenticated canonical Decision attempt/,
		);
	});

	it("rejects a Candidate materialized before the canonical attempt", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-stale",
		);
		const started = startDecisionAttempt({
			state: opened.state,
			changeId: "CHG-native-decision-stale",
			recordedAt: "2026-07-30T15:09:00.000Z",
		});
		const artifacts = nativeDecisionArtifacts(
			opened.state,
			"CHG-native-decision-stale",
		);
		assert.throws(
			() =>
				createNativeDecisionOperationSequence({
					state: started.state,
					changeId: "CHG-native-decision-stale",
					attemptOperationId: started.operation.operationId,
					baseSnapshot: baseSnapshotFor(started.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-07-30T15:10:00.000Z",
					...artifacts,
					evidenceRecords: [],
				}),
			/not the exact Runtime materialization for current WorkState/,
		);
	});
});

describe("Review canonical Gate persistence", () => {
	it("persists exact Review attempt, Gate, transition, and terminal state", () => {
		const changeId = "CHG-review-operations";
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			changeId,
		);
		const packSnapshot = checkSnapshot([], {stage: "review", packs: []});
		const attempt = createReviewAttempt({
			integratedHead: "a".repeat(40),
			integratedTree: "b".repeat(40),
			targetBranch: "main",
			changeIds: [`change:${changeId}`],
			workItemIds: ["work-item:WI-review"],
			checkPackSnapshotDigest: packSnapshot.checkPackDigest,
			providerReceiptDigests: [],
			evidenceRecordDigests: [],
		});
		const subject = reviewSubjectFromAttempt(attempt);
		const report = createGateReport({
			snapshot: packSnapshot,
			subjectDigest: subject.digest,
			results: [],
			executions: [],
		});
		const transition = deriveReviewLifecycleTransition(attempt, report);
		const sequence = createReviewOperationSequence({
			state: opened.state,
			changeId,
			baseSnapshot: baseSnapshotFor(opened.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-08-15T10:00:00.000Z",
			attempt,
			packSnapshot,
			evidenceRecords: [],
			report,
			transition,
		});
		assert.deepEqual(
			sequence.operations.map((operation) => operation.body.kind),
			[
				"loop.attempt_started",
				"loop.exit_policy_recorded",
				"loop.exit_report_recorded",
				"runtime.route_recorded",
				"loop.attempt_ended",
			],
		);
		const projected = sequence.state.loopAttempts[0];
		assert.equal(projected.loop, "review");
		assert.equal(projected.privateAttemptDigest, attempt.attemptDigest);
		assert.equal(projected.currentCandidateId, subject.id);
		assert.equal(projected.status, "passed");
		assert.equal(sequence.operations.at(-2).body.payload.route, "complete");
		const accepted = reduceBatch(
			opened.state,
			sequence.operations,
			gitObject("d"),
		);
		const projection = projectChecksState(accepted);
		assert.equal(projection.attempts[0].stage, "review");
		assert.equal(projection.attempts[0].status, "passed");
		assert.equal(
			projection.attempts[0].report.reportDigest,
			report.reportDigest,
		);
		assert.throws(
			() =>
				createReviewOperationSequence({
					state: opened.state,
					changeId,
					baseSnapshot: baseSnapshotFor(opened.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-08-15T10:00:00.000Z",
					attempt,
					packSnapshot,
					evidenceRecords: [],
					report,
					transition: {...transition, target: "implementation"},
				}),
			/fixed Gate transition/,
		);
		const unrelatedCandidate = nativeDecisionCandidate({
			state: opened.state,
			changeId,
			rationale: "Unrelated Evidence identity.",
		});
		assert.throws(
			() =>
				createReviewOperationSequence({
					state: opened.state,
					changeId,
					baseSnapshot: baseSnapshotFor(opened.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-08-15T10:00:00.000Z",
					attempt,
					packSnapshot,
					evidenceRecords: [
						sourceEvidence(opened.state.changes[0], unrelatedCandidate),
					],
					report,
					transition,
				}),
			/Evidence digests do not match/,
		);
	});

	it("projects persisted failed-Review feedback for Implementation and UI", () => {
		const changeId = "CHG-review-feedback";
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			changeId,
		);
		const artifacts = failedReviewArtifacts(changeId);
		const sequence = createReviewOperationSequence({
			state: opened.state,
			changeId,
			baseSnapshot: baseSnapshotFor(opened.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-08-15T10:30:00.000Z",
			...artifacts,
			evidenceRecords: [],
			transition: deriveReviewLifecycleTransition(
				artifacts.attempt,
				artifacts.report,
			),
		});
		const accepted = reduceBatch(
			opened.state,
			sequence.operations,
			gitObject("f"),
		);
		const projected = projectChecksState(accepted).attempts[0];
		assert.equal(projected.stage, "review");
		assert.equal(projected.status, "failed");
		assert.equal(projected.results[0].failureCode, "delivery_not_ready");
		assert.equal(
			projected.results[0].feedbackSummary,
			"Delivery proof is incomplete.",
		);
	});

	it("commits and verifies Review through expected-head synchronization", async () => {
		const fixture = await createTwoCloneFixture();
		try {
			const changeId = "CHG-review-git";
			await git(fixture.cloneB, ["config", "user.name", "Review Test"]);
			await git(fixture.cloneB, ["config", "user.email", "review@example.invalid"]);
			await git(fixture.cloneB, ["checkout", "--orphan", "main"]);
			await git(fixture.cloneB, ["commit", "--allow-empty", "-m", "source"]);
			const sourceHead = (
				await git(fixture.cloneB, ["rev-parse", "HEAD"])
			).stdout.trim();
			const initial = createInitialProjectWorkState();
			const records = buildOperationSequence({
				changeId,
				baseSnapshot: {...baseSnapshotFor(initial), sourceHead},
				specifications: [
					{
						kind: "trace.opened",
						recordedAt: "2026-08-15T11:58:00.000Z",
						payload: {origin: "user", provenanceRefs: [`request:${changeId}`]},
					},
					{
						kind: "change.proposed",
						recordedAt: "2026-08-15T11:59:00.000Z",
						payload: {
							revision: revisionFor(changeId),
							provenance: {kind: "user", refs: [`request:${changeId}`]},
						},
					},
				],
			}).operations;
			const opened = await createGitProposal(fixture.cloneA, initial, records);
			assert.equal(
				(await pushGitProposal(fixture.cloneA, opened.proposal)).status,
				"accepted",
			);
			const project = projectSnapshotFor(opened.projected);
			const selected = await synchronizeGitState({
				repoRoot: fixture.cloneB,
				remote: "origin",
				repositoryIdentity,
				currentProject: project,
				policy: allowAllReplayPolicy,
			});
			assert.equal(selected.status, "fresh");
			const integratedHead = selected.teamSnapshot.protectedSourceHead;
			const integratedTree = (
				await git(fixture.cloneB, ["rev-parse", `${integratedHead}^{tree}`])
			).stdout.trim();
			const packSnapshot = checkSnapshot([], {stage: "review", packs: []});
			const attempt = createReviewAttempt({
				integratedHead,
				integratedTree,
				targetBranch: "main",
				changeIds: [`change:${changeId}`],
				workItemIds: ["work-item:WI-review-git"],
				checkPackSnapshotDigest: packSnapshot.checkPackDigest,
				providerReceiptDigests: [],
				evidenceRecordDigests: [],
			});
			const report = createGateReport({
				snapshot: packSnapshot,
				subjectDigest: reviewSubjectFromAttempt(attempt).digest,
				results: [],
				executions: [],
			});
			const commitInput = {
				repoRoot: fixture.cloneB,
				remote: "origin",
				repositoryIdentity,
				currentProject: () => project,
				replayPolicy: allowAllReplayPolicy,
				authorityBinding: authorityBinding(),
				changeId,
				expectedTeamSnapshotDigest: selected.teamSnapshot.snapshotDigest,
				expectedWorkStateDigest: selected.workState.workStateDigest,
				recordedAt: "2026-08-15T12:00:00.000Z",
				attempt,
				packSnapshot,
				evidenceRecords: [],
				report,
				transition: deriveReviewLifecycleTransition(attempt, report),
			};
			const receipt = await commitReviewOperationSequence(commitInput);
			assert.equal(receipt.observation.status, "fresh");
			assert.equal(
				receipt.observation.workState.changes[0].loopAttempts[0].loop,
				"review",
			);
			await assert.rejects(
				commitReviewOperationSequence(commitInput),
				/must be rerun/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("projects an operationally stopped Review without a fabricated Result", () => {
		const changeId = "CHG-review-stopped";
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			changeId,
		);
		const check = packagedCheck({stage: "review"});
		const packSnapshot = checkSnapshot([check], {stage: "review"});
		const attempt = createReviewAttempt({
			integratedHead: "c".repeat(40),
			integratedTree: "d".repeat(40),
			targetBranch: "main",
			changeIds: [`change:${changeId}`],
			workItemIds: ["work-item:WI-stopped"],
			checkPackSnapshotDigest: packSnapshot.checkPackDigest,
			providerReceiptDigests: [],
			evidenceRecordDigests: [],
		});
		const report = createGateReport({
			snapshot: packSnapshot,
			subjectDigest: reviewSubjectFromAttempt(attempt).digest,
			results: [],
			executions: [],
			stoppedReason: {
				code: "executor_unavailable",
				message: "Review executor is unavailable.",
			},
		});
		const sequence = createReviewOperationSequence({
			state: opened.state,
			changeId,
			baseSnapshot: baseSnapshotFor(opened.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-08-15T11:00:00.000Z",
			attempt,
			packSnapshot,
			evidenceRecords: [],
			report,
			transition: deriveReviewLifecycleTransition(attempt, report),
		});
		assert.equal(
			sequence.operations.some(
				(operation) => operation.body.kind === "check.result_recorded",
			),
			false,
		);
		const accepted = reduceBatch(
			opened.state,
			sequence.operations,
			gitObject("e"),
		);
		assert.equal(accepted.changes[0].loopAttempts[0].status, "indeterminate");
		assert.equal(projectChecksState(accepted).attempts[0].status, "stopped");
	});
});
