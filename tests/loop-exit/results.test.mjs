import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCheckCatalog } from "../../src/loop-exit/catalog.ts";
import { resolveExitPolicy } from "../../src/loop-exit/resolve-policy.ts";
import {
	assertValidExitReport,
	createCheckResult,
	createExitReport,
} from "../../src/loop-exit/results.ts";

const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;
const EVIDENCE_DIGEST = `sha256:${"c".repeat(64)}`;

function selectorInput() {
	return {
		loop: "implementation",
		candidateDigest: CANDIDATE_DIGEST,
		changes: [
			{
				changeId: "CHG-results",
				revision: 1,
				digest: CHANGE_DIGEST,
				kind: "improve",
				type: "behavior_change",
				risk: "low",
				affectedLayers: ["source"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: ["src/loop-exit/results.ts"],
	};
}

function foundation() {
	const policy = resolveExitPolicy(selectorInput());
	const catalog = createCheckCatalog();
	return { policy, catalog };
}

function resultFor(
	policy,
	catalog,
	binding,
	options = {},
) {
	const check = catalog.get(binding.checkId, policy.loop).check;
	const disposition = options.disposition ?? "satisfied";
	return createCheckResult({
		loop: policy.loop,
		policy,
		check,
		disposition,
		...(options.measurement
			? { measurement: options.measurement }
			: disposition === "indeterminate"
				? {}
				: {
						measurement: {
							shape: "boolean",
							value: disposition === "satisfied",
						},
					}),
		evidenceRefs: options.evidenceRefs ?? ["trace:CHG-results:implementation:1"],
		evidenceInputDigests: [EVIDENCE_DIGEST],
		findings:
			options.findings ??
			(disposition === "satisfied" ? [] : [`${binding.checkId} did not pass.`]),
		...(options.issueClass ? { issueClass: options.issueClass } : {}),
		execution: { ...check.execution },
	});
}

function allRequiredResults(policy, catalog) {
	return policy.bindings
		.filter((binding) => binding.required)
		.map((binding) => resultFor(policy, catalog, binding));
}

function projectScoreRegistration() {
	return {
		check: {
			id: "project.documentation_score",
			version: "1.0.0",
			description: "Documentation coverage remains sufficient.",
			requirement: "Documentation coverage score is at least 0.8.",
			execution: {
				id: "codewiki.code-check",
				version: "1.0.0",
				kind: "code",
			},
			measurement: {
				kind: "quantitative",
				shape: "score",
				minimum: 0.8,
				maximum: 1,
			},
			evidenceAdapterIds: ["source"],
			repairTarget: "source",
			cost: 1,
			timeoutMs: 5_000,
			protected: false,
		},
		loops: ["implementation"],
		rollout: "observe",
		rolloutHistory: [],
		dependsOn: [],
	};
}

describe("immutable Check Result", () => {
	it("derives stable identity from exact policy, Check, evidence, and execution", () => {
		const { policy, catalog } = foundation();
		const binding = policy.bindings[0];
		const result = resultFor(policy, catalog, binding, {
			evidenceRefs: ["trace:z", "trace:a", "trace:z"],
			issueClass: "verification",
		});
		const equivalent = resultFor(policy, catalog, binding, {
			evidenceRefs: ["trace:a", "trace:z"],
			issueClass: "verification",
		});

		assert.equal(result.resultDigest, equivalent.resultDigest);
		assert.equal(result.checkDigest, binding.checkDigest);
		assert.equal(result.policyDigest, policy.policyDigest);
		assert.equal(result.status, "pass");
		assert.equal(result.issueClass, "verification");
		assert.equal(result.repairTarget, "loop-candidate");
		assert.deepEqual(result.evidenceRefs, ["trace:a", "trace:z"]);
		assert.equal(Object.isFrozen(result), true);
		assert.equal(Object.isFrozen(result.execution), true);
	});

	it("rejects caller-owned identity and wrong measurement", () => {
		const { policy, catalog } = foundation();
		const binding = policy.bindings[0];
		const check = catalog.get(binding.checkId, policy.loop).check;
		const base = {
			loop: policy.loop,
			policy,
			check,
			disposition: "satisfied",
			measurement: { shape: "boolean", value: true },
			execution: { ...check.execution },
		};

		assert.throws(
			() => createCheckResult({ ...base, resultDigest: EVIDENCE_DIGEST }),
			/Check Result input contains unsupported field resultDigest/,
		);
		assert.throws(
			() =>
				createCheckResult({
					...base,
					measurement: { shape: "score", value: 1 },
				}),
			/measurement shape score does not match boolean/,
		);
		assert.throws(
			() =>
				createCheckResult({
					...base,
					disposition: "unsatisfied",
				}),
			/disposition contradicts measurement: expected pass/,
		);
		assert.throws(
			() =>
				createCheckResult({
					...base,
					execution: { ...check.execution, version: "2.0.0" },
				}),
			/has wrong execution identity/,
		);
	});

	it("applies Runtime-owned quantitative thresholds", () => {
		const input = selectorInput();
		input.projectRegistrations = [projectScoreRegistration()];
		input.approvedAdditions = [
			{
				checkId: "project.documentation_score",
				checkVersion: "1.0.0",
				authorityRef: "trace:approval:score",
				parameters: { minimum: 0.9 },
			},
		];
		const policy = resolveExitPolicy(input);
		const catalog = createCheckCatalog([projectScoreRegistration()]);
		const binding = policy.bindings.find(
			(entry) => entry.checkId === "project.documentation_score",
		);
		const check = catalog.get(binding.checkId, policy.loop).check;
		const result = createCheckResult({
			loop: policy.loop,
			policy,
			check,
			disposition: "unsatisfied",
			measurement: { shape: "score", value: 0.85 },
			evidenceInputDigests: [EVIDENCE_DIGEST],
			findings: ["Coverage is below the resolved minimum."],
			execution: { ...check.execution },
		});

		assert.equal(result.status, "fail");
		assert.deepEqual({ ...result.threshold }, { minimum: 0.9, maximum: 1 });
		assert.throws(
			() =>
				createCheckResult({
					loop: policy.loop,
					policy,
					check,
					disposition: "satisfied",
					measurement: { shape: "score", value: 0.85 },
					findings: [],
					execution: { ...check.execution },
				}),
			/disposition contradicts measurement: expected fail/,
		);
	});

	it("represents operational failure only as indeterminate without measurement", () => {
		const { policy, catalog } = foundation();
		const binding = policy.bindings[0];
		const result = resultFor(policy, catalog, binding, {
			disposition: "indeterminate",
			findings: ["Provider unavailable."],
		});
		assert.equal(result.status, "indeterminate");
		assert.equal(result.measurement, undefined);
		assert.throws(
			() =>
				resultFor(policy, catalog, binding, {
					disposition: "indeterminate",
					measurement: { shape: "boolean", value: false },
					findings: ["Provider unavailable."],
				}),
			/Indeterminate Check Result cannot include measurement/,
		);
	});
});

describe("immutable Exit Report", () => {
	it("derives pass, fail, and indeterminate with failure dominance", () => {
		const { policy, catalog } = foundation();
		const passing = allRequiredResults(policy, catalog);
		const failed = [
			resultFor(policy, catalog, policy.bindings[0], {
				disposition: "unsatisfied",
			}),
			...passing.slice(1),
		];
		const indeterminate = [
			resultFor(policy, catalog, policy.bindings[0], {
				disposition: "indeterminate",
			}),
			...passing.slice(1),
		];
		const failedAndIndeterminate = [
			failed[0],
			resultFor(policy, catalog, policy.bindings[1], {
				disposition: "indeterminate",
			}),
			...passing.slice(2),
		];

		assert.equal(createExitReport({ policy, checkResults: passing }).status, "pass");
		assert.equal(createExitReport({ policy, checkResults: failed }).status, "fail");
		assert.equal(
			createExitReport({ policy, checkResults: indeterminate }).status,
			"indeterminate",
		);
		assert.equal(
			createExitReport({ policy, checkResults: failedAndIndeterminate }).status,
			"fail",
		);
	});

	it("keeps observe and warn failures visible without blocking exit", () => {
		const input = selectorInput();
		input.projectRegistrations = [projectScoreRegistration()];
		input.approvedAdditions = [
			{
				checkId: "project.documentation_score",
				checkVersion: "1.0.0",
				authorityRef: "trace:approval:score",
			},
		];
		const policy = resolveExitPolicy(input);
		const catalog = createCheckCatalog([projectScoreRegistration()]);
		const binding = policy.bindings.find(
			(entry) => entry.checkId === "project.documentation_score",
		);
		const check = catalog.get(binding.checkId, policy.loop).check;
		const observedFailure = createCheckResult({
			loop: policy.loop,
			policy,
			check,
			disposition: "unsatisfied",
			measurement: { shape: "score", value: 0.5 },
			findings: ["Observed project Check failed."],
			execution: { ...check.execution },
		});
		const report = createExitReport({
			policy,
			checkResults: [
				...allRequiredResults(policy, catalog),
				observedFailure,
			],
		});

		assert.equal(binding.required, false);
		assert.equal(report.status, "pass");
		assert.ok(
			report.checkResults.some(
				(result) => result.checkId === binding.checkId && result.status === "fail",
			),
		);
	});

	it("rejects missing, duplicate, wrong-candidate, and wrong-policy Results", () => {
		const { policy, catalog } = foundation();
		const passing = allRequiredResults(policy, catalog);
		assert.throws(
			() => createExitReport({ policy, checkResults: passing.slice(1) }),
			/Required Check Result .* is missing/,
		);
		assert.throws(
			() => createExitReport({ policy, checkResults: [...passing, passing[0]] }),
			/Duplicate Check Result/,
		);
		assert.throws(
			() =>
				createExitReport({
					policy,
					checkResults: [
						{ ...passing[0], candidateDigest: `sha256:${"d".repeat(64)}` },
						...passing.slice(1),
					],
				}),
			/has wrong candidate/,
		);
		assert.throws(
			() =>
				createExitReport({
					policy,
					checkResults: [
						{ ...passing[0], policyDigest: `sha256:${"e".repeat(64)}` },
						...passing.slice(1),
					],
				}),
			/has wrong policy/,
		);
	});

	it("creates immutable report identity and detects aggregate tampering", () => {
		const { policy, catalog } = foundation();
		const report = createExitReport({
			policy,
			checkResults: allRequiredResults(policy, catalog).toReversed(),
		});

		assert.match(report.reportDigest, /^sha256:[0-9a-f]{64}$/);
		assert.deepEqual(
			report.checkResults.map((result) => result.checkId),
			report.checkResults
				.map((result) => result.checkId)
				.toSorted((left, right) => left.localeCompare(right)),
		);
		assert.equal(Object.isFrozen(report), true);
		assert.equal(Object.isFrozen(report.checkResults), true);
		assert.doesNotThrow(() => assertValidExitReport(report, policy));
		assert.throws(
			() => assertValidExitReport({ ...report, status: "fail" }, policy),
			/Exit Report status mismatch/,
		);
	});
});
