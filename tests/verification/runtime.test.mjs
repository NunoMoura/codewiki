import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {decisionLoopExitDeclaration} from "../../src/decision/exit/index.ts";
import {implementationLoopExitDeclaration} from "../../src/implementation/types.ts";
import {planningLoopExitDeclaration} from "../../src/planning/types.ts";
import {createCheckCatalog} from "../../src/verification/catalog.ts";
import {
	createLoopExitSuite,
	createResolvedExitPolicy,
} from "../../src/verification/contracts.ts";
import {loopQualifiedCheckDigest} from "../../src/verification/identity.ts";
import {createCheckResult, createExitReport} from "../../src/verification/results.ts";
import {projectVerificationState} from "../../src/verification/projection.ts";
import {
	defaultRepairProfiles,
	repairProfileSetDigest,
} from "../../src/verification/repair-profiles.ts";
import {createVerificationRuntime} from "../../src/verification/runtime.ts";
import {deriveDecisionRuntimeRoute} from "../../src/decision/exit/runtime.ts";
import {createNativeDecisionOperationSequence} from "../../src/runtime/effects/decision-operations.ts";
import {
	createInitialProjectWorkState,
	createNextChangeOperation,
} from "../../src/changes/trace/index.ts";
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
import {nativeDecisionCandidate} from "../helpers/native-decision.mjs";

function persistedVerificationFixture(disposition = "satisfied") {
	const changeId = "CHG-verification-projection";
	const opened = openProposedChange(createInitialProjectWorkState(), changeId);
	const openedChange = opened.state.changes[0];
	const startedOperation = createNextChangeOperation(openedChange, {
		changeId,
		kind: "loop.attempt_started",
		baseSnapshot: baseSnapshotFor(opened.state),
		authorityBinding: authorityBinding({
			authenticationEvidenceId: "auth:native-decision-selection",
		}),
		recordedAt: "2026-08-06T10:00:00.000Z",
		payload: {
			loop: "decision",
			changeRevisionId: openedChange.currentRevision.revisionId,
			loopProtocolDigest: digest("7"),
			routeId: "decision-selected-v2",
			privateAttemptDigest: digest("8"),
		},
	});
	const started = reduceBatch(opened.state, [startedOperation], gitObject("b"));
	const candidate = nativeDecisionCandidate({state: started, changeId});
	const catalog = createCheckCatalog();
	const check = catalog.get("change_revision_ready", "decision").check;
	const repairProfiles = defaultRepairProfiles({
		checkId: check.id,
		requirement: check.requirement,
		target: check.repairTarget,
	});
	const profileSetDigest = repairProfileSetDigest(repairProfiles);
	const parameters = {repairProfileSetDigest: profileSetDigest};
	const resolved = createResolvedExitPolicy({
			loop: "decision",
			candidateDigest: candidate.digest,
			catalogDigest: catalog.digest,
			selectorInputDigest: digest("9"),
			bindings: [
				{
					checkId: "change_revision_ready",
					checkVersion: check.version,
					requirementDigest: check.requirementDigest,
					checkDigest: loopQualifiedCheckDigest({
						loop: "decision",
						check,
						configuration: parameters,
						catalogDigest: catalog.digest,
					}),
					enforcement: "require",
					required: true,
					parameters,
					repairProfiles,
					repairProfileSetDigest: profileSetDigest,
					dependsOn: [],
					activatedBy: ["test:verification-projection"],
					ruleRefs: ["test:verification-projection"],
				},
			],
			exclusions: [
				{
					checkId: "release_intent_authorized",
					checkVersion: catalog.get("release_intent_authorized", "decision").check.version,
					requirementDigest:
						catalog.get("release_intent_authorized", "decision").check.requirementDigest,
					checkDigest: loopQualifiedCheckDigest({
						loop: "decision",
						check: catalog.get("release_intent_authorized", "decision").check,
						configuration: {},
						catalogDigest: catalog.digest,
					}),
					reason: "not_applicable",
					refs: ["test:no-release"],
				},
			],
		protectedCheckIds: ["change_revision_ready"],
	});
	const result = createCheckResult({
		loop: "decision",
		policy: resolved,
		check,
		disposition,
		...(disposition === "indeterminate"
			? {}
			: {
					measurement: {
						shape: "boolean",
						value: disposition === "satisfied",
					},
				}),
		evidenceResolutions: [],
		findings:
			disposition === "satisfied"
				? []
				: [{message: "Projection fixture outcome."}],
		execution: check.execution,
	});
	const report = createExitReport({policy: resolved, checkResults: [result]});
	const route = deriveDecisionRuntimeRoute(candidate, report);
	const sequence = createNativeDecisionOperationSequence({
		state: started,
		changeId,
		attemptOperationId: startedOperation.operationId,
		baseSnapshot: baseSnapshotFor(started),
		authorityBinding: authorityBinding(),
		recordedAt: "2026-08-06T10:01:00.000Z",
		candidate,
		policy: resolved,
		evidenceRecords: [],
		report,
		route,
	});
	const accepted = reduceBatch(started, sequence.operations, gitObject("c"));
	return {
		accepted,
		candidate,
		changeId,
		policy: resolved,
		report,
		route,
		sequence,
		started,
		startedOperation,
	};
}

describe("Verification runtime composition", () => {
	it("composes owner-provided declarations without a global semantic facade", () => {
		const suite = createLoopExitSuite({
			decision: decisionLoopExitDeclaration,
			planning: planningLoopExitDeclaration,
			implementation: implementationLoopExitDeclaration,
		});

		assert.deepEqual(suite, {
			decision: {loop: "decision"},
			planning: {loop: "planning"},
			implementation: {loop: "implementation"},
		});
		assert.ok(Object.isFrozen(suite));
		assert.ok(Object.isFrozen(suite.decision));
		assert.ok(Object.isFrozen(suite.planning));
		assert.ok(Object.isFrozen(suite.implementation));
	});

	it("rejects a declaration assigned to the wrong Loop slot", () => {
		assert.throws(
			() =>
				createLoopExitSuite({
					decision: {loop: "planning"},
					planning: {loop: "planning"},
					implementation: {loop: "implementation"},
				}),
			/Loop exit declaration decision must declare loop decision/,
		);
	});

	it("owns frozen generic Catalog, Result, cache, guard, and runner machinery", () => {
		const runtime = createVerificationRuntime();

		assert.ok(Object.isFrozen(runtime));
		assert.ok(Object.isFrozen(runtime.catalog));
		assert.equal(
			runtime.catalog.get("change_revision_ready").authority,
			"kernel",
		);
		assert.ok(runtime.catalog.list("decision").length > 0);
		assert.ok(runtime.catalog.list("planning").length > 0);
		assert.ok(runtime.catalog.list("implementation").length > 0);
		assert.equal(typeof runtime.createCheckResult, "function");
		assert.equal(typeof runtime.createExitReport, "function");
		assert.equal(typeof runtime.createRepairFrontier, "function");
		assert.equal(typeof runtime.assertValidRepairFrontier, "function");
		assert.equal(typeof runtime.createRepairBrief, "function");
		assert.equal(typeof runtime.assertValidRepairBrief, "function");
		assert.equal(typeof runtime.createRepairBundle, "function");
		assert.equal(typeof runtime.assertValidRepairBundle, "function");
		assert.equal(typeof runtime.createExitOutcome, "function");
		assert.equal(typeof runtime.assertValidExitOutcome, "function");
		assert.equal(typeof runtime.createRepairExecutionInvocation, "function");
		assert.equal(typeof runtime.assertValidRepairExecutionInvocation, "function");
		assert.equal(typeof runtime.createResultCache, "function");
		assert.equal(typeof runtime.projectState, "function");
		assert.equal(typeof runtime.createRunner, "function");
		assert.equal(runtime.createRunner({executors: []}).cache.size(), 0);
		assert.throws(
			() => createVerificationRuntime({customChecks: []}),
			/Verification Runtime received unsupported field customChecks; use protectedBaseCustomCheckConfig/,
		);
	});
});

describe("Candidate-bound Verification projection", () => {
	it("joins persisted policy, Results, Exit Report, and Runtime route without Catalog lookup", () => {
		const fixture = persistedVerificationFixture();
		const projection = projectVerificationState(fixture.accepted);
		const repeated = projectVerificationState(fixture.accepted);
		assert.equal(projection.snapshotDigest, repeated.snapshotDigest);
		assert.equal(projection.workStateDigest, fixture.accepted.workStateDigest);
		assert.deepEqual({...projection.coverage}, {
			totalAttempts: 1,
			projectedAttempts: 1,
			omittedAttempts: 0,
			totalChecksInProjectedAttempts: 2,
			projectedChecks: 2,
			omittedChecks: 0,
			truncated: false,
		});
		const attempt = projection.attempts[0];
		assert.equal(attempt.status, "pass");
		assert.equal(attempt.candidateId, fixture.candidate.id);
		assert.equal(attempt.candidateDigest, fixture.candidate.digest);
		assert.equal(attempt.policy.policyDigest, fixture.policy.policyDigest);
		assert.equal(attempt.policy.catalogDigest, fixture.policy.catalogDigest);
		assert.equal(
			attempt.policy.selectorInputDigest,
			fixture.policy.selectorInputDigest,
		);
		assert.equal(
			attempt.policy.configurationDigest,
			baseSnapshotFor(fixture.started).configDigest,
		);
		assert.equal(attempt.report.reportDigest, fixture.report.reportDigest);
		assert.deepEqual(
			{
				required: attempt.report.requiredCheckCount,
				advisory: attempt.report.advisoryCheckCount,
				observed: attempt.report.observedCheckCount,
				excluded: attempt.report.excludedCheckCount,
				blocking: attempt.report.blockingCheckCount,
				blockingIds: attempt.report.blockingCheckIds,
				blockingTruncated: attempt.report.blockingCheckIdsTruncated,
			},
			{
				required: 1,
				advisory: 0,
				observed: 0,
				excluded: 1,
				blocking: 0,
				blockingIds: [],
				blockingTruncated: false,
			},
		);
		assert.equal(attempt.routeDigest, fixture.route.routeDigest);
		assert.deepEqual(
			attempt.checks.map((check) => [check.checkId, check.status]),
			[
				["change_revision_ready", "pass"],
				["release_intent_authorized", "excluded"],
			],
		);
		assert.ok(Object.isFrozen(projection));
		assert.ok(Object.isFrozen(attempt));
		assert.ok(Object.isFrozen(attempt.checks));
	});

	it("projects failed and indeterminate reports without local readiness reduction", () => {
		assert.equal(
			projectVerificationState(persistedVerificationFixture("unsatisfied").accepted)
				.attempts[0].status,
			"fail",
		);
		assert.equal(
			projectVerificationState(
				persistedVerificationFixture("indeterminate").accepted,
			).attempts[0].status,
			"indeterminate",
		);
	});

	it("reports unresolved, pending, stale, and bounded coverage without inventing readiness", () => {
		const fixture = persistedVerificationFixture();
		const unresolved = projectVerificationState(fixture.started);
		assert.equal(unresolved.attempts[0].status, "unresolved");
		assert.equal(unresolved.attempts[0].policy, null);
		assert.deepEqual(unresolved.attempts[0].checks, []);

		const pendingState = reduceBatch(
			fixture.started,
			fixture.sequence.operations.slice(0, 2),
			gitObject("d"),
		);
		const pending = projectVerificationState(pendingState, {
			maxChecksPerAttempt: 1,
		});
		assert.equal(pending.attempts[0].status, "pending");
		assert.equal(pending.attempts[0].report, null);
		assert.equal(pending.attempts[0].checks[0].status, "pending");
		assert.equal(pending.coverage.omittedChecks, 1);
		assert.equal(pending.coverage.truncated, true);

		const startedChange = fixture.started.changes[0];
		const staleOperation = createNextChangeOperation(startedChange, {
			changeId: fixture.changeId,
			kind: "loop.attempt_ended",
			baseSnapshot: baseSnapshotFor(fixture.started),
			authorityBinding: authorityBinding(),
			recordedAt: "2026-08-06T10:00:30.000Z",
			payload: {
				attemptOperationId: fixture.startedOperation.operationId,
				status: "stale",
			},
		});
		const staleState = reduceBatch(
			fixture.started,
			[staleOperation],
			gitObject("e"),
		);
		assert.equal(projectVerificationState(staleState).attempts[0].status, "stale");
		assert.throws(
			() => projectVerificationState(fixture.accepted, {maxAttempts: 0}),
			/maxAttempts must be an integer from 1 through 1000/u,
		);
	});

	it("fails closed when persisted semantic artifact bytes drift", () => {
		const fixture = persistedVerificationFixture();
		const tampered = structuredClone(fixture.accepted);
		const operation = tampered.changes[0].operations.find(
			(candidate) => candidate.body.kind === "loop.exit_policy_recorded",
		);
		operation.body.payload.policy.artifact.selectorInputDigest = digest("f");
		assert.throws(
			() => projectVerificationState(tampered),
			/Verification WorkState digest mismatch/u,
		);
	});
});
