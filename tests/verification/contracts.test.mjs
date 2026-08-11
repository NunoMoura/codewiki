import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	CHECK_INVOCATION_PROTOCOL_ID,
	CHECK_INVOCATION_PROTOCOL_VERSION,
	CHECK_INVOCATION_SCHEMA,
	CHECK_OBSERVATION_PROTOCOL_ID,
	CHECK_OBSERVATION_PROTOCOL_VERSION,
	CHECK_OBSERVATION_SCHEMA,
	assertValidCheckInvocation,
	assertValidResolvedExitPolicy,
	createCheckInvocation,
	createResolvedExitPolicy,
	normalizeCheckObservation,
} from "../../src/verification/contracts.ts";
import {
	checkRequirementDigest,
	createLoopCandidate,
	loopQualifiedCheckDigest,
} from "../../src/verification/identity.ts";
import {
	admitCheckObservation,
	assembleCheckInvocation,
} from "../../src/verification/protocol.ts";
import {createCheckResult} from "../../src/verification/results.ts";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const SELECTOR_DIGEST = `sha256:${"b".repeat(64)}`;
const CATALOG_DIGEST = `sha256:${"c".repeat(64)}`;
const REQUIREMENT_DIGEST = `sha256:${"d".repeat(64)}`;
const CHECK_DIGEST = `sha256:${"e".repeat(64)}`;

function policyInput() {
	return {
		loop: "implementation",
		candidateDigest: CANDIDATE_DIGEST,
		catalogDigest: CATALOG_DIGEST,
		selectorInputDigest: SELECTOR_DIGEST,
		bindings: [
			{
				checkId: "acceptance_covered",
				checkVersion: "1.0.0",
				requirementDigest: REQUIREMENT_DIGEST,
				checkDigest: CHECK_DIGEST,
				enforcement: "require",
				required: true,
				parameters: { minimum: 1, evidence: "exact" },
				dependsOn: ["input_valid"],
				activatedBy: ["loop:implementation", "risk:check"],
				ruleRefs: ["verification.loop.implementation"],
			},
			{
				checkId: "input_valid",
				checkVersion: "1.0.0",
				requirementDigest: REQUIREMENT_DIGEST,
				checkDigest: CHECK_DIGEST,
				enforcement: "require",
				required: true,
				parameters: {},
				dependsOn: [],
				activatedBy: ["kernel", "loop:implementation"],
				ruleRefs: ["verification.kernel.input"],
			},
		],
		exclusions: [
			{
				checkId: "ui_accessibility",
				checkVersion: "1.0.0",
				requirementDigest: REQUIREMENT_DIGEST,
				checkDigest: CHECK_DIGEST,
				reason: "not_applicable",
				refs: ["change:CHG-1"],
			},
		],
		protectedCheckIds: ["input_valid"],
	};
}

function invocationInput() {
	const complete = (requestedRefs, items) => ({
		status: "complete",
		requestedRefs,
		items,
		omittedCount: 0,
		truncated: false,
		stale: false,
	});
	return {
		candidate: {
			id: "candidate:implementation:change-1",
			digest: CANDIDATE_DIGEST,
			loop: "implementation",
			schemaVersion: "1.0.0",
			content: {summary: "Implement exact Check protocols."},
			observedBase: {
				workStateDigest: `sha256:${"1".repeat(64)}`,
				knowledgeSnapshotDigest: `sha256:${"2".repeat(64)}`,
				sourceSnapshotDigest: `sha256:${"3".repeat(64)}`,
				gitTreeDigest: `sha256:${"4".repeat(64)}`,
				canonicalRefs: ["change:CHG-1", "knowledge:verification"],
			},
		},
		policy: {
			candidateDigest: CANDIDATE_DIGEST,
			catalogDigest: CATALOG_DIGEST,
			selectorInputDigest: SELECTOR_DIGEST,
			policyDigest: `sha256:${"5".repeat(64)}`,
		},
		check: {
			id: "check-pack:default:protocol",
			version: "1.0.0",
			requirement: "Check protocols remain exact and bounded.",
			requirementDigest: REQUIREMENT_DIGEST,
			checkDigest: CHECK_DIGEST,
			enforcement: "require",
			required: true,
			parameters: {input: {paths: ["src/verification"]}},
		},
		context: {
			repository: complete(
				["src/verification"],
				[
					{
						ref: "src/verification/contracts.ts",
						digest: `sha256:${"6".repeat(64)}`,
						mediaType: "text/typescript",
						content: "export interface CheckInvocation {}\n",
					},
				],
			),
			knowledge: complete(
				["knowledge:verification"],
				[
					{
						ref: "knowledge:verification",
						digest: `sha256:${"7".repeat(64)}`,
						mediaType: "text/markdown",
						content: "Verification owns common protocols.",
					},
				],
			),
			evidence: {
				status: "unavailable",
				requestedRefs: [],
				items: [],
				omittedCount: 0,
				truncated: false,
				stale: false,
			},
		},
		maximumInputBytes: 1_048_576,
	};
}

describe("Resolved Exit Policy contracts", () => {
	it("normalizes ordering and produces stable identity", () => {
		const policy = createResolvedExitPolicy(policyInput());
		const reordered = structuredClone(policyInput());
		reordered.bindings.reverse();
		reordered.bindings[1].activatedBy.reverse();
		reordered.bindings[1].dependsOn.reverse();
		const equivalent = createResolvedExitPolicy(reordered);

		assert.equal(policy.policyDigest, equivalent.policyDigest);
		assert.deepEqual(
			policy.bindings.map((binding) => binding.checkId),
			["acceptance_covered", "input_valid"],
		);
		assert.deepEqual(policy.bindings[0].activatedBy, [
			"loop:implementation",
			"risk:check",
		]);
		assert.doesNotThrow(() => assertValidResolvedExitPolicy(policy));
	});

	it("keeps execution, measurement, and enforcement dimensions independent", () => {
		const check = {
			id: "maintainability_reviewed",
			version: "1.0.0",
			description: "Review maintainability independently.",
			requirement: "Findings are specific and actionable.",
			requirementDigest: REQUIREMENT_DIGEST,
			execution: {
				id: "codewiki.model-check",
				version: "1.0.0",
				kind: "model",
			},
			measurement: {
				kind: "qualitative",
				shape: "structured",
				schemaRef: "check.findings.v1",
			},
			evidenceObligations: [],
			repairTarget: "source",
			cost: 4,
			timeoutMs: 30_000,
			protected: false,
		};
		const binding = {
			checkId: check.id,
			checkVersion: check.version,
			enforcement: "warn",
			required: false,
		};
		assert.equal(check.execution.kind, "model");
		assert.equal(check.measurement.kind, "qualitative");
		assert.equal(check.measurement.shape, "structured");
		assert.equal(binding.enforcement, "warn");
	});

	it("rejects protected omissions and inactive dependencies", () => {
		const missingProtected = policyInput();
		missingProtected.bindings = missingProtected.bindings
			.filter((binding) => binding.checkId !== "input_valid")
			.map((binding) => ({ ...binding, dependsOn: [] }));
		assert.throws(
			() => createResolvedExitPolicy(missingProtected),
			/Protected Check input_valid must remain active/,
		);
		const inactiveDependency = policyInput();
		inactiveDependency.bindings[0].dependsOn.push("unknown_check");
		assert.throws(
			() => createResolvedExitPolicy(inactiveDependency),
			/has unknown dependency unknown_check/,
		);
	});

	it("rejects dependency cycles and digest tampering", () => {
		const cyclic = policyInput();
		cyclic.bindings[1].dependsOn.push("acceptance_covered");
		assert.throws(
			() => createResolvedExitPolicy(cyclic),
			/Check dependency cycle includes/,
		);
		const policy = createResolvedExitPolicy(policyInput());
		policy.bindings[0].enforcement = "observe";
		assert.throws(
			() => assertValidResolvedExitPolicy(policy),
			/Resolved Exit Policy digest mismatch/,
		);
	});
});

describe("Check Invocation protocol", () => {
	it("creates one stable bounded Candidate and context binding", () => {
		const first = createCheckInvocation(invocationInput());
		const reordered = invocationInput();
		reordered.candidate.observedBase.canonicalRefs.reverse();
		reordered.context.repository.requestedRefs.reverse();
		const second = createCheckInvocation(reordered);

		assert.equal(first.protocolId, CHECK_INVOCATION_PROTOCOL_ID);
		assert.equal(first.protocolVersion, CHECK_INVOCATION_PROTOCOL_VERSION);
		assert.equal(
			CHECK_INVOCATION_SCHEMA.$id,
			"urn:codewiki:protocol:check-invocation:1.0.0",
		);
		assert.equal(first.invocationDigest, second.invocationDigest);
		assert.equal(first.policy.candidateDigest, first.candidate.digest);
		assert.ok(Object.isFrozen(first));
		assert.ok(Object.isFrozen(first.context.repository.items));
		assert.doesNotThrow(() =>
			assertValidCheckInvocation(first, invocationInput().maximumInputBytes),
		);
	});

	it("rejects identity drift, invalid coverage, tampering, and oversized input", () => {
		const wrongCandidate = invocationInput();
		wrongCandidate.policy.candidateDigest = `sha256:${"8".repeat(64)}`;
		assert.throws(
			() => createCheckInvocation(wrongCandidate),
			/policy does not bind its Candidate/u,
		);

		const invalidCoverage = invocationInput();
		invalidCoverage.context.repository.omittedCount = 1;
		assert.throws(
			() => createCheckInvocation(invalidCoverage),
			/Complete Check Invocation repository context cannot be truncated or omit items/u,
		);

		const invocation = structuredClone(createCheckInvocation(invocationInput()));
		invocation.check.requirement = "Tampered requirement.";
		assert.throws(
			() => assertValidCheckInvocation(invocation, 1_048_576),
			/not in canonical normalized form/u,
		);

		assert.throws(
			() => createCheckInvocation({...invocationInput(), maximumInputBytes: 128}),
			/exceeds its 128-byte limit/u,
		);
	});
});

function admissionFixture() {
	const candidate = createLoopCandidate({
		loop: "implementation",
		schemaVersion: "1.0.0",
		content: {summary: "Admit exact evaluator output."},
		observedBase: {
			workStateDigest: `sha256:${"1".repeat(64)}`,
			knowledgeSnapshotDigest: `sha256:${"2".repeat(64)}`,
			sourceSnapshotDigest: `sha256:${"3".repeat(64)}`,
			gitTreeDigest: `sha256:${"4".repeat(64)}`,
			canonicalRefs: ["change:CHG-1"],
		},
	});
	const requirement = "Exact evaluator output satisfies this requirement.";
	const check = {
		id: "check-pack:default:protocol",
		version: "1.0.0",
		description: "Evaluate protocol integrity.",
		requirement,
		requirementDigest: checkRequirementDigest(requirement),
		execution: {
			id: "codewiki.model-check",
			version: "1.0.0",
			kind: "model",
		},
		measurement: {kind: "qualitative", shape: "boolean"},
		evidenceObligations: [],
		repairTarget: "source",
		cost: 1,
		timeoutMs: 10_000,
		protected: false,
	};
	const parameters = {route: "checks/reviewer"};
	const checkDigest = loopQualifiedCheckDigest({
		loop: candidate.loop,
		check,
		configuration: parameters,
		catalogDigest: CATALOG_DIGEST,
	});
	const policy = createResolvedExitPolicy({
		loop: candidate.loop,
		candidateDigest: candidate.digest,
		catalogDigest: CATALOG_DIGEST,
		selectorInputDigest: SELECTOR_DIGEST,
		bindings: [
			{
				checkId: check.id,
				checkVersion: check.version,
				requirementDigest: check.requirementDigest,
				checkDigest,
				enforcement: "require",
				required: true,
				parameters,
				dependsOn: [],
				activatedBy: ["check-pack:default"],
				ruleRefs: ["verification.pack.default"],
			},
		],
		exclusions: [],
		protectedCheckIds: [],
	});
	const context = invocationInput().context;
	const invocation = assembleCheckInvocation({
		candidate,
		policy,
		check,
		context,
		maximumInputBytes: 1_048_576,
	});
	return {candidate, check, policy, invocation};
}

describe("Check Observation protocol", () => {
	it("normalizes pass, fail, and indeterminate evaluator output", () => {
		const invocation = createCheckInvocation(invocationInput());
		const base = {
			protocolId: CHECK_OBSERVATION_PROTOCOL_ID,
			protocolVersion: CHECK_OBSERVATION_PROTOCOL_VERSION,
			invocationDigest: invocation.invocationDigest,
			summary: "Protocol contract evaluated.",
			findings: [],
			grantsResult: false,
		};
		const pass = normalizeCheckObservation({
			value: {...base, outcome: "pass"},
			expectedInvocationDigest: invocation.invocationDigest,
			maximumOutputBytes: 65_536,
		});
		const fail = normalizeCheckObservation({
			value: {
				...base,
				outcome: "fail",
				findings: [
					{
						code: "protocol.binding",
						message: "Observation lacks exact binding.",
						location: {
							ref: "src/verification/contracts.ts",
							startLine: 10,
							endLine: 12,
						},
					},
				],
			},
			expectedInvocationDigest: invocation.invocationDigest,
			maximumOutputBytes: 65_536,
		});
		const indeterminate = normalizeCheckObservation({
			value: {
				...base,
				outcome: "indeterminate",
				reason: "Required repository context was unavailable.",
			},
			expectedInvocationDigest: invocation.invocationDigest,
			maximumOutputBytes: 65_536,
		});

		assert.equal(
			CHECK_OBSERVATION_SCHEMA.$id,
			"urn:codewiki:protocol:check-observation:1.0.0",
		);
		assert.equal(pass.outcome, "pass");
		assert.equal(fail.findings[0].location.startLine, 10);
		assert.equal(indeterminate.reason, "Required repository context was unavailable.");
		assert.equal(pass.grantsResult, false);
		assert.ok(Object.isFrozen(fail.findings[0].location));
	});

	it("rejects unbound, malformed, authority-bearing, and oversized output", () => {
		const invocation = createCheckInvocation(invocationInput());
		const base = {
			protocolId: CHECK_OBSERVATION_PROTOCOL_ID,
			protocolVersion: CHECK_OBSERVATION_PROTOCOL_VERSION,
			invocationDigest: invocation.invocationDigest,
			outcome: "fail",
			summary: "Evaluation failed.",
			findings: [{message: "Actionable finding."}],
			grantsResult: false,
		};
		const normalize = (value, maximumOutputBytes = 65_536) =>
			normalizeCheckObservation({
				value,
				expectedInvocationDigest: invocation.invocationDigest,
				maximumOutputBytes,
			});

		assert.throws(
			() => normalize({...base, invocationDigest: `sha256:${"9".repeat(64)}`}),
			/does not bind its Invocation/u,
		);
		assert.throws(
			() => normalize({...base, findings: []}),
			/requires at least one finding/u,
		);
		assert.throws(
			() => normalize({...base, outcome: "indeterminate", findings: []}),
			/requires a reason/u,
		);
		assert.throws(
			() => normalize({...base, grantsResult: true}),
			/cannot grant a Check Result/u,
		);
		assert.throws(
			() => normalize({...base, summary: "x".repeat(2_000)}, 256),
			/exceeds its 256-byte limit/u,
		);
	});
});

describe("Check protocol Runtime boundary", () => {
	it("assembles an exact canonical Candidate, policy, and Check binding", () => {
		const {candidate, check, policy, invocation} = admissionFixture();

		assert.equal(invocation.candidate.id, candidate.id);
		assert.equal(invocation.policy.policyDigest, policy.policyDigest);
		assert.equal(invocation.check.id, check.id);
		assert.equal(invocation.check.parameters.route, "checks/reviewer");

		const driftedCandidate = structuredClone(candidate);
		driftedCandidate.content.summary = "Digest drift.";
		assert.throws(
			() =>
				assembleCheckInvocation({
					candidate: driftedCandidate,
					policy,
					check,
					context: invocation.context,
					maximumInputBytes: 1_048_576,
				}),
			/not canonical or has digest drift/u,
		);
	});

	it("admits valid output into canonical Results and redacts invalid output", () => {
		const {check, policy, invocation} = admissionFixture();
		const admit = (observation) =>
			admitCheckObservation({
				invocation,
				policy,
				check,
				observation,
				maximumInputBytes: 1_048_576,
				maximumOutputBytes: 65_536,
				evidenceResolutions: [],
				execution: {...check.execution, modelRef: "checks/reviewer"},
			});
		const base = {
			protocolId: CHECK_OBSERVATION_PROTOCOL_ID,
			protocolVersion: CHECK_OBSERVATION_PROTOCOL_VERSION,
			invocationDigest: invocation.invocationDigest,
			summary: "Evaluator completed one isolated judgment.",
			grantsResult: false,
		};
		const passing = admit({...base, outcome: "pass", findings: []});
		const failing = admit({
			...base,
			outcome: "fail",
			findings: [
				{
					code: "protocol.binding",
					message: "Binding is incomplete.",
					location: {ref: "src/verification/protocol.ts", startLine: 10},
				},
			],
		});
		const malformed = admit({...base, outcome: "fail", findings: []});

		assert.equal(passing.status, "pass");
		assert.equal(passing.invocationDigest, invocation.invocationDigest);
		assert.equal(passing.feedback, base.summary);
		assert.equal(failing.status, "fail");
		assert.deepEqual(failing.findings, [
			"[protocol.binding] Binding is incomplete. (src/verification/protocol.ts:10)",
		]);
		assert.equal(malformed.status, "indeterminate");
		assert.deepEqual(malformed.findings, [
			`Check evaluator ${check.id} returned unavailable or invalid output; details were redacted.`,
		]);
	});

	it("rejects Runtime-owned binding drift before evaluator output admission", () => {
		const {check, policy, invocation} = admissionFixture();
		assert.throws(
			() =>
				createCheckResult({
					loop: policy.loop,
					policy,
					check,
					disposition: "satisfied",
					measurement: {shape: "boolean", value: true},
					evidenceResolutions: [],
					execution: check.execution,
				}),
			/requires an Invocation digest/u,
		);
		const driftedCheck = {...check, requirement: "Different requirement."};
		assert.throws(
			() =>
				admitCheckObservation({
					invocation,
					policy,
					check: driftedCheck,
					observation: undefined,
					maximumInputBytes: 1_048_576,
					maximumOutputBytes: 65_536,
					evidenceResolutions: [],
					execution: check.execution,
				}),
			/requirement digest mismatch/u,
		);
	});
});
