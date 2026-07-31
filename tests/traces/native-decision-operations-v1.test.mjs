import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {createCheckCatalog} from "../../src/loop-exit/catalog.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {createLoopCandidate} from "../../src/loop-exit/identity.ts";
import {resolveExitPolicy} from "../../src/loop-exit/resolve-policy.ts";
import {createCheckResult, createExitReport} from "../../src/loop-exit/results.ts";
import {deriveDecisionRuntimeRoute} from "../../src/decision/exit/runtime.ts";
import {EVIDENCE_SCHEMA_VERSION} from "../../src/evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";
import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";
import {
	commitNativeDecisionOperationSequence,
	createNativeDecisionOperationSequence,
} from "../../src/runtime/native-decision-operations.ts";
import {
	allowAllReplayPolicy,
	baseSnapshotFor,
	openProposedChange,
	reduceBatch,
} from "../helpers/change-trace-replay-v1.mjs";
import {
	authorityBinding,
	digest,
	gitObject,
} from "../helpers/change-trace-v1.mjs";
import {
	assertValidCanonicalChangeOperation,
	createInitialProjectWorkState,
	synchronizeGitState,
} from "../../src/change-trace/index.ts";
import {
	buildOpenChangeRecords,
	createGitProposal,
	createTwoCloneFixture,
	git,
	pushGitProposal,
} from "../helpers/git-state-v1.mjs";

function sourceEvidence(change, candidate) {
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "source_observation",
			provenanceRefs: ["source:native-decision-test"],
			payload: {
				sourceType: "source",
				snapshotDigest: digest("6"),
				paths: ["src/runtime/native-decision-operations.ts"],
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
				acceptanceRequirementIds: [],
			},
			observedAt: "2026-07-30T15:04:00.000Z",
			producer: {kind: "runtime", id: "native-decision-test", version: "1.0.0"},
			authority: "observed",
			coverage: "complete",
			sensitivity: "project",
		},
	);
}

function nativeDecisionArtifacts(change, rationale = "Exact revision is ready.") {
	const candidate = createLoopCandidate({
		schemaVersion: "1.0.0",
		loop: "decision",
		content: {disposition: "approve", rationale},
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

const repositoryIdentity = digest("a");

function projectSnapshotFor(state) {
	return {
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
	};
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
		const artifactOperations = [
			[sequence.operations[1], "candidate", artifacts.candidate],
			[sequence.operations[2], "policy", artifacts.policy],
			[sequence.operations[3], "result", artifacts.report.checkResults[0]],
			[sequence.operations[4], "report", artifacts.report],
			[sequence.operations[5], "runtimeRoute", artifacts.route],
		];
		for (const [operation, field, expected] of artifactOperations) {
			const inline = operation.body.payload[field];
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
		const change = opened.state.changes[0];
		const artifacts = nativeDecisionArtifacts(change);
		const evidence = sourceEvidence(change, artifacts.candidate);
		const sequence = createNativeDecisionOperationSequence({
			state: change,
			baseSnapshot: baseSnapshotFor(opened.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-07-30T15:04:00.000Z",
			...artifacts,
			evidenceRecords: [evidence],
		});
		const operation = sequence.operations.find(
			(candidate) => candidate.body.kind === "evidence.recorded",
		);
		assert.equal(operation.body.payload.evidence.id, evidence.evidenceId);
		assert.equal(Object.hasOwn(operation.body.payload.evidence, "ref"), false);
		assert.deepEqual(
			JSON.parse(JSON.stringify(operation.body.payload.evidence.artifact)),
			JSON.parse(JSON.stringify(evidence)),
		);
	});

	it("rejects oversized inline semantic artifacts", () => {
		const opened = openProposedChange(
			createInitialProjectWorkState(),
			"CHG-native-decision-inline-size",
		);
		const change = opened.state.changes[0];
		assert.throws(
			() =>
				createNativeDecisionOperationSequence({
					state: change,
					baseSnapshot: baseSnapshotFor(opened.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-07-30T15:04:30.000Z",
					...nativeDecisionArtifacts(change, "x".repeat(270_000)),
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
		const change = opened.state.changes[0];
		const sequence = createNativeDecisionOperationSequence({
			state: change,
			baseSnapshot: baseSnapshotFor(opened.state),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-07-30T15:05:00.000Z",
			...nativeDecisionArtifacts(change),
			evidenceRecords: [],
		});
		const tampered = structuredClone(sequence.operations[1]);
		tampered.body.payload.candidate.artifact.content.rationale = "Tampered.";
		tampered.body.payload.candidate.digest = canonicalJsonDigest(
			tampered.body.payload.candidate.artifact,
		);
		assert.throws(
			() => assertValidCanonicalChangeOperation(tampered),
			/Candidate semantic identity mismatch/,
		);
	});

	it("admits and verifies one exact inline Decision chain through synchronized Git", async () => {
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
			const change = observed.workState.changes[0];
			const artifacts = nativeDecisionArtifacts(change);
			const receipt = await commitNativeDecisionOperationSequence({
				repoRoot: fixture.cloneB,
				remote: "origin",
				repositoryIdentity,
				currentProject: () => project,
				replayPolicy: allowAllReplayPolicy,
				authorityBinding: authorityBinding(),
				changeId: change.changeId,
				expectedTeamSnapshotDigest: observed.teamSnapshot.snapshotDigest,
				expectedWorkStateDigest: observed.workState.workStateDigest,
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
					expectedTeamSnapshotDigest: observed.teamSnapshot.snapshotDigest,
					expectedWorkStateDigest: observed.workState.workStateDigest,
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
					state: {
						...change,
						currentRevision: {
							...change.currentRevision,
							revisionId: digest("f"),
						},
					},
					baseSnapshot: baseSnapshotFor(opened.state),
					authorityBinding: authorityBinding(),
					recordedAt: "2026-07-30T15:10:00.000Z",
					...artifacts,
					evidenceRecords: [],
				}),
			/does not bind current Change revision/,
		);
	});
});
