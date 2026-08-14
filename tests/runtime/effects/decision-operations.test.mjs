import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createCheckCatalog} from "../../../src/verification/catalog.ts";
import {createResolvedExitPolicy} from "../../../src/verification/contracts.ts";
import {resolveExitPolicy} from "../../../src/verification/resolve-policy.ts";
import {createCheckResult, createExitReport} from "../../../src/verification/results.ts";
import {deriveDecisionRuntimeRoute} from "../../../src/decision/exit/runtime.ts";
import {EVIDENCE_SCHEMA_VERSION} from "../../../src/evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../../src/evidence/materialize.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";
import {
	commitNativeDecisionOperationSequence,
	createNativeDecisionOperationSequence,
} from "../../../src/runtime/effects/decision-operations.ts";
import {
	allowAllReplayPolicy,
	baseSnapshotFor,
	openProposedChange,
	reduceBatch,
} from "../../helpers/change-trace-replay-v1.mjs";
import {
	authorityBinding,
	digest,
	gitObject,
} from "../../helpers/change-trace-v1.mjs";
import {nativeDecisionCandidate} from "../../helpers/native-decision.mjs";
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
				paths: ["src/runtime/effects/decision-operations.ts"],
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

function nativeDecisionArtifacts(
	state,
	changeId,
	rationale = "Exact revision is ready.",
) {
	const candidate = nativeDecisionCandidate({state, changeId, rationale});
	const revision = candidate.content.revision;
	const catalog = createCheckCatalog();
	const resolved = resolveExitPolicy({
		loop: "decision",
		candidateDigest: candidate.digest,
		changes: [
			{
				changeId,
				revision: revision.ordinal,
				digest: revision.revisionId,
				kind:
					revision.classification.kind === "unknown"
						? "harden"
						: revision.classification.kind,
				type:
					revision.classification.type === "unknown"
						? "security_change"
						: revision.classification.type,
				risk:
					revision.safety.risk === "low"
						? "low"
						: revision.safety.risk === "moderate"
							? "medium"
							: "high",
				affectedLayers: [...revision.classification.affectedLayers],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: [...revision.classification.targetRefs],
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
			sequence.routeOperationId,
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
		assert.equal(routeOperation.body.payload.exitReportId, sequence.exitReportId);
		const artifactOperations = [
			[sequence.operations[0], "candidate", artifacts.candidate],
			[sequence.operations[1], "policy", artifacts.policy],
			[sequence.operations[2], "result", artifacts.report.checkResults[0]],
			[sequence.operations[3], "report", artifacts.report],
			[sequence.operations[4], "runtimeRoute", artifacts.route],
		];
		for (const [operation, field, expected] of artifactOperations) {
			const canonicalOperation = /** @type {(typeof sequence.operations)[number]} */ (
				operation
			);
			const inline = canonicalOperation.body.payload[field];
			assert.equal(Object.hasOwn(inline, "ref"), false);
			assert.deepEqual(
				JSON.parse(JSON.stringify(inline.artifact)),
				JSON.parse(JSON.stringify(expected)),
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
			JSON.parse(JSON.stringify(operation.body.payload.evidence.artifact)),
			JSON.parse(JSON.stringify(evidence)),
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
				exitPolicy: artifacts.policy,
				evidenceRecords: [],
				report: artifacts.report,
				route: artifacts.route,
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
					exitPolicy: artifacts.policy,
					evidenceRecords: [],
					report: artifacts.report,
					route: artifacts.route,
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
