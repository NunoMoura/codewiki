import type { EvidenceObligationResolution } from "../evidence/obligation-resolution.ts";
import { assertExactKeys } from "../utils/json.ts";
import {
	MAX_CHECK_OBSERVATION_BYTES,
	assertValidCheckInvocation,
	assertValidResolvedExitPolicy,
	createCheckInvocation,
	normalizeCheckObservation,
	type CheckDefinition,
	type CheckExecutionIdentity,
	type CheckInvocation,
	type CheckInvocationContext,
	type CheckObservation,
	type CheckObservationFinding,
	type CheckResult,
	type ResolvedExitPolicy,
} from "./contracts.ts";
import {
	assertSha256Digest,
	canonicalJson,
	createLoopCandidate,
	loopQualifiedCheckDigest,
	type LoopCandidate,
} from "./identity.ts";
import { createCheckResult } from "./results.ts";

export interface AssembleCheckInvocationInput {
	readonly candidate: LoopCandidate;
	readonly policy: ResolvedExitPolicy;
	readonly check: CheckDefinition;
	readonly context: CheckInvocationContext;
	readonly maximumInputBytes: number;
}

export interface AdmitCheckObservationInput {
	readonly invocation: CheckInvocation;
	readonly policy: ResolvedExitPolicy;
	readonly check: CheckDefinition;
	readonly observation: unknown;
	readonly maximumInputBytes: number;
	readonly maximumOutputBytes: number;
	readonly evidenceResolutions: readonly EvidenceObligationResolution[];
	readonly execution: CheckExecutionIdentity;
}

export function assembleCheckInvocation(
	input: AssembleCheckInvocationInput,
): CheckInvocation {
	assertExactKeys(
		input,
		["candidate", "policy", "check", "context", "maximumInputBytes"],
		"Check Invocation assembly input",
	);
	assertCanonicalCandidate(input.candidate);
	assertValidResolvedExitPolicy(input.policy);
	const binding = boundCheck(input.policy, input.check);
	if (input.candidate.loop !== input.policy.loop) {
		throw new Error("Check Invocation Candidate loop does not match its policy.");
	}
	if (input.candidate.digest !== input.policy.candidateDigest) {
		throw new Error("Check Invocation Candidate digest does not match its policy.");
	}
	return createCheckInvocation({
		candidate: input.candidate,
		policy: {
			candidateDigest: input.policy.candidateDigest,
			catalogDigest: assertSha256Digest(input.policy.catalogDigest, "catalogDigest"),
			selectorInputDigest: assertSha256Digest(
				input.policy.selectorInputDigest,
				"selectorInputDigest",
			),
			policyDigest: assertSha256Digest(input.policy.policyDigest, "policyDigest"),
		},
		check: {
			id: input.check.id,
			version: input.check.version,
			requirement: input.check.requirement,
			requirementDigest: assertSha256Digest(
				input.check.requirementDigest,
				"requirementDigest",
			),
			checkDigest: assertSha256Digest(binding.checkDigest, "checkDigest"),
			enforcement: binding.enforcement,
			required: binding.required,
			parameters: binding.parameters,
		},
		context: input.context,
		maximumInputBytes: input.maximumInputBytes,
	});
}

export function admitCheckObservation(
	input: AdmitCheckObservationInput,
): CheckResult {
	assertExactKeys(
		input,
		[
			"invocation",
			"policy",
			"check",
			"observation",
			"maximumInputBytes",
			"maximumOutputBytes",
			"evidenceResolutions",
			"execution",
		],
		"Check Observation admission input",
	);
	assertValidCheckInvocation(input.invocation, input.maximumInputBytes);
	const expectedInvocation = assembleCheckInvocation({
		candidate: input.invocation.candidate as LoopCandidate,
		policy: input.policy,
		check: input.check,
		context: input.invocation.context,
		maximumInputBytes: input.maximumInputBytes,
	});
	if (canonicalJson(input.invocation) !== canonicalJson(expectedInvocation)) {
		throw new Error("Check Observation admission received wrong Invocation binding.");
	}
	assertObservationByteLimit(input.maximumOutputBytes);

	let observation: CheckObservation;
	try {
		observation = normalizeCheckObservation({
			value: input.observation,
			expectedInvocationDigest: input.invocation.invocationDigest,
			maximumOutputBytes: input.maximumOutputBytes,
		});
	} catch {
		return resultFromInvalidObservation(input);
	}
	if (
		observation.outcome !== "indeterminate" &&
		input.check.measurement.shape !== "boolean"
	) {
		throw new Error(
			`Check Observation protocol requires boolean measurement for ${input.check.id}.`,
		);
	}
	return createCheckResult({
		loop: input.policy.loop,
		policy: input.policy,
		check: input.check,
		disposition: dispositionFor(observation),
		invocationDigest: input.invocation.invocationDigest,
		...(observation.outcome === "indeterminate"
			? {}
			: {measurement: {shape: "boolean" as const, value: observation.outcome === "pass"}}),
		evidenceResolutions: [...input.evidenceResolutions],
		findings: resultFindings(observation),
		feedback: observation.summary,
		execution: input.execution,
	});
}

function assertCanonicalCandidate(candidate: LoopCandidate): void {
	const expected = createLoopCandidate({
		loop: candidate.loop,
		schemaVersion: candidate.schemaVersion,
		content: candidate.content,
		observedBase: candidate.observedBase,
	});
	if (canonicalJson(candidate) !== canonicalJson(expected)) {
		throw new Error("Check Invocation Candidate is not canonical or has digest drift.");
	}
}

function boundCheck(policy: ResolvedExitPolicy, check: CheckDefinition) {
	const binding = policy.bindings.find((value) => value.checkId === check.id);
	if (!binding || binding.checkVersion !== check.version) {
		throw new Error(`Check ${check.id} is not bound by the Resolved Exit Policy.`);
	}
	const expectedDigest = loopQualifiedCheckDigest({
		loop: policy.loop,
		check,
		configuration: binding.parameters,
		catalogDigest: policy.catalogDigest,
	});
	if (
		binding.requirementDigest !== check.requirementDigest ||
		binding.checkDigest !== expectedDigest
	) {
		throw new Error(`Check ${check.id} binding identity drifted from its policy.`);
	}
	return binding;
}

function dispositionFor(
	observation: CheckObservation,
): "satisfied" | "unsatisfied" | "indeterminate" {
	switch (observation.outcome) {
		case "pass":
			return "satisfied";
		case "fail":
			return "unsatisfied";
		case "indeterminate":
			return "indeterminate";
		default:
			throw new Error("Check Observation outcome is invalid.");
	}
}

function resultFindings(
	observation: CheckObservation,
): CheckObservationFinding[] {
	const findings = [...observation.findings];
	if (observation.outcome === "indeterminate" && observation.reason) {
		findings.push({message: observation.reason});
	}
	return findings;
}

function assertObservationByteLimit(value: number): void {
	if (
		!Number.isSafeInteger(value) ||
		value <= 0 ||
		value > MAX_CHECK_OBSERVATION_BYTES
	) {
		throw new Error(
			`Check Observation maximumOutputBytes must be between 1 and ${MAX_CHECK_OBSERVATION_BYTES}.`,
		);
	}
}

function resultFromInvalidObservation(
	input: AdmitCheckObservationInput,
): CheckResult {
	return createCheckResult({
		loop: input.policy.loop,
		policy: input.policy,
		check: input.check,
		disposition: "indeterminate",
		invocationDigest: input.invocation.invocationDigest,
		evidenceResolutions: [...input.evidenceResolutions],
		findings: [
			{
				code: "codewiki.evaluator.invalid_output",
				message: `Check evaluator ${input.check.id} returned unavailable or invalid output; details were redacted.`,
			},
		],
		execution: input.execution,
	});
}
