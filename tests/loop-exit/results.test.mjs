import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCheckCatalog } from "../../src/loop-exit/catalog.ts";
import {
	canonicalJsonDigest,
	checkRequirementDigest,
	loopQualifiedCheckDigest,
} from "../../src/loop-exit/identity.ts";
import {createResolvedExitPolicy} from "../../src/loop-exit/contracts.ts";
import {
	activateCustomCheckDefinition,
	createCustomCheckDefinition,
	createProtectedCustomCheckConfigSnapshot,
	customCheckDefinitionCheckId,
} from "../../src/loop-exit/custom-checks/index.ts";
import { resolveExitPolicy } from "../../src/loop-exit/resolve-policy.ts";
import {
	assertValidExitReport,
	createCheckResult,
	createExitReport,
} from "../../src/loop-exit/results.ts";
import {
	createTestUserStandard,
	standardRefsFor,
} from "./custom-checks/user-standard-fixture.mjs";

const USER_STANDARD = createTestUserStandard();
const USER_STANDARDS = [USER_STANDARD];
const CANDIDATE_DIGEST = `sha256:${"a".repeat(64)}`;
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;
const EVIDENCE_DIGEST = `sha256:${"c".repeat(64)}`;

function protectedConfig(customChecks) {
	return createProtectedCustomCheckConfigSnapshot({
		protectedSourceHead: "f".repeat(40),
		projectConfigDigest: `sha256:${"e".repeat(64)}`,
		userStandards: USER_STANDARDS,
		customChecks,
	});
}

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

function readyEvidenceResolution(obligation, salt = "default") {
	const evidenceIds = Array.from({ length: obligation.minimumCount }, (_, index) => {
		const digest = canonicalJsonDigest({
			obligationId: obligation.id,
			obligationVersion: obligation.version,
			salt,
			index,
		});
		return `evidence:${obligation.kinds[0]}:${digest.slice("sha256:".length)}`;
	}).sort((left, right) => left.localeCompare(right));
	const withoutDigest = {
		obligationId: obligation.id,
		obligationVersion: obligation.version,
		obligationDigest: canonicalJsonDigest(obligation),
		status: "ready",
		inputEvidenceIds: evidenceIds,
		eligibleEvidenceIds: evidenceIds,
		supportingEvidenceIds: evidenceIds,
		contradictoryEvidenceIds: [],
		neutralEvidenceIds: [],
		excludedEvidence: [],
		duplicateEvidenceIds: [],
		missingCount: 0,
	};
	return {
		...withoutDigest,
		resolutionDigest: canonicalJsonDigest(withoutDigest),
	};
}

function missingEvidenceResolution(obligation) {
	const withoutDigest = {
		obligationId: obligation.id,
		obligationVersion: obligation.version,
		obligationDigest: canonicalJsonDigest(obligation),
		status: "missing",
		inputEvidenceIds: [],
		eligibleEvidenceIds: [],
		supportingEvidenceIds: [],
		contradictoryEvidenceIds: [],
		neutralEvidenceIds: [],
		excludedEvidence: [],
		duplicateEvidenceIds: [],
		missingCount: obligation.minimumCount,
	};
	return {
		...withoutDigest,
		resolutionDigest: canonicalJsonDigest(withoutDigest),
	};
}

function readyEvidenceResolutions(check, salt) {
	return check.evidenceObligations.map((obligation) =>
		readyEvidenceResolution(obligation, salt),
	);
}

function resultFor(
	policy,
	catalog,
	binding,
	options = {},
) {
	const check = catalog.get(binding.checkId, policy.loop).check;
	const disposition = options.disposition ?? "satisfied";
	const measurement =
		options.measurement ??
		(disposition === "indeterminate"
			? undefined
			: { shape: "boolean", value: disposition === "satisfied" });
	return createCheckResult({
		loop: policy.loop,
		policy,
		check,
		disposition,
		...(measurement ? { measurement } : {}),
		evidenceResolutions:
			options.evidenceResolutions ?? readyEvidenceResolutions(check),
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

function quantitativeFoundation() {
	const requirement = "Documentation coverage score is at least 0.8.";
	const check = {
		id: "test.documentation_score",
		version: "1.0.0",
		description: "Documentation coverage remains sufficient.",
		requirement,
		requirementDigest: checkRequirementDigest(requirement),
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
		evidenceObligations: [],
		repairTarget: "source",
		cost: 1,
		timeoutMs: 5_000,
		protected: false,
	};
	const catalogDigest = canonicalJsonDigest({catalog: "quantitative-test"});
	const parameters = {minimum: 0.9};
	const binding = {
		checkId: check.id,
		checkVersion: check.version,
		requirementDigest: check.requirementDigest,
		checkDigest: loopQualifiedCheckDigest({
			loop: "implementation",
			check,
			configuration: parameters,
			catalogDigest,
		}),
		enforcement: "observe",
		required: false,
		parameters,
		dependsOn: [],
		activatedBy: ["test:quantitative"],
		ruleRefs: ["test:quantitative"],
	};
	const policy = createResolvedExitPolicy({
		loop: "implementation",
		candidateDigest: CANDIDATE_DIGEST,
		catalogDigest,
		selectorInputDigest: canonicalJsonDigest({selector: "quantitative-test"}),
		bindings: [binding],
		protectedCheckIds: [],
	});
	return {check, policy, binding};
}

function requiredCustomCheck() {
	return activateCustomCheckDefinition(
		createCustomCheckDefinition({
			checkTypeId: "organization_policy",
			name: "Documentation current",
			requirement: "Affected documentation remains current.",
			appliesWhen: {loops: ["implementation"]},
			standardRefs: standardRefsFor(USER_STANDARD),
		}, USER_STANDARDS),
		USER_STANDARDS,
	);
}

describe("immutable Check Result", () => {
	it("derives stable identity from exact policy, Check, evidence, and execution", () => {
		const { policy, catalog } = foundation();
		const binding = policy.bindings.find(
			(entry) =>
				catalog.get(entry.checkId, policy.loop).check.evidenceObligations.length >
				0,
		);
		const check = catalog.get(binding.checkId, policy.loop).check;
		const evidenceResolutions = readyEvidenceResolutions(check);
		const result = resultFor(policy, catalog, binding, {
			evidenceResolutions,
			issueClass: "verification",
		});
		const equivalent = resultFor(policy, catalog, binding, {
			evidenceResolutions: [...evidenceResolutions].reverse(),
			issueClass: "verification",
		});
		const changed = resultFor(policy, catalog, binding, {
			evidenceResolutions: readyEvidenceResolutions(check, "changed"),
			issueClass: "verification",
		});

		assert.equal(result.resultDigest, equivalent.resultDigest);
		assert.notEqual(result.resultDigest, changed.resultDigest);
		assert.notEqual(result.evidenceInputDigest, changed.evidenceInputDigest);
		assert.equal(result.checkDigest, binding.checkDigest);
		assert.equal(result.policyDigest, policy.policyDigest);
		assert.equal(result.status, "pass");
		assert.equal(result.issueClass, "verification");
		assert.equal(result.repairTarget, "loop-candidate");
		assert.deepEqual(
			result.evidenceRecordIds,
			evidenceResolutions.flatMap((entry) => entry.inputEvidenceIds),
		);
		assert.equal(Object.isFrozen(result), true);
		assert.equal(Object.isFrozen(result.execution), true);
		assert.equal(Object.isFrozen(result.evidenceResolutions), true);
	});

	it("requires exact obligation resolutions before a determinate Result", () => {
		const { policy, catalog } = foundation();
		const binding = policy.bindings.find(
			(entry) =>
				catalog.get(entry.checkId, policy.loop).check.evidenceObligations.length >
				0,
		);
		const check = catalog.get(binding.checkId, policy.loop).check;
		const missing = check.evidenceObligations.map(missingEvidenceResolution);
		assert.throws(
			() =>
				resultFor(policy, catalog, binding, {
					evidenceResolutions: [],
				}),
			/is missing Evidence obligation resolution/,
		);
		assert.throws(
			() =>
				resultFor(policy, catalog, binding, {
					evidenceResolutions: missing,
				}),
			/requires indeterminate disposition while Evidence obligation .* is missing/,
		);
		const result = resultFor(policy, catalog, binding, {
			disposition: "indeterminate",
			evidenceResolutions: missing,
			findings: ["Required Evidence is missing."],
		});
		assert.equal(result.status, "indeterminate");
		assert.deepEqual(result.evidenceRecordIds, []);
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
			evidenceResolutions: readyEvidenceResolutions(check),
			execution: { ...check.execution },
		};

		assert.throws(
			() => createCheckResult({ ...base, resultDigest: EVIDENCE_DIGEST }),
			/Check Result input contains unsupported field resultDigest/,
		);
		assert.throws(
			() => createCheckResult({ ...base, evidenceRecordIds: [] }),
			/Check Result input contains unsupported field evidenceRecordIds/,
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
		const {policy, check} = quantitativeFoundation();
		const result = createCheckResult({
			loop: policy.loop,
			policy,
			check,
			disposition: "unsatisfied",
			measurement: { shape: "score", value: 0.85 },
			evidenceResolutions: [],
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
					evidenceResolutions: [],
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

	it("blocks exit when an active Custom Check fails or is indeterminate", () => {
		const definition = requiredCustomCheck();
		const input = selectorInput();
		input.protectedBaseCustomCheckConfig = protectedConfig([definition]);
		const policy = resolveExitPolicy(input);
		const catalog = createCheckCatalog({
			userStandards: USER_STANDARDS,
			customChecks: [definition],
		});
		const binding = policy.bindings.find(
			(entry) => entry.checkId === customCheckDefinitionCheckId(definition),
		);
		const check = catalog.get(binding.checkId, policy.loop).check;
		const customFailure = createCheckResult({
			loop: policy.loop,
			policy,
			check,
			disposition: "unsatisfied",
			measurement: { shape: "boolean", value: false },
			evidenceResolutions: readyEvidenceResolutions(check),
			findings: ["Required Custom Check failed."],
			execution: { ...check.execution },
		});
		const customIndeterminate = createCheckResult({
			loop: policy.loop,
			policy,
			check,
			disposition: "indeterminate",
			evidenceResolutions: readyEvidenceResolutions(check),
			findings: ["Required Custom Check lacks sufficient Evidence."],
			execution: { ...check.execution },
		});
		const passing = allRequiredResults(policy, catalog);
		const reportFor = (customResult) =>
			createExitReport({
				policy,
				checkResults: passing.map((result) =>
					result.checkId === binding.checkId ? customResult : result,
				),
			});
		const failedReport = reportFor(customFailure);
		const indeterminateReport = reportFor(customIndeterminate);

		assert.equal(binding.required, true);
		assert.equal(binding.enforcement, "require");
		assert.equal(failedReport.status, "fail");
		assert.equal(indeterminateReport.status, "indeterminate");
		assert.ok(
			failedReport.checkResults.some(
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

		const evidenceIndex = report.checkResults.findIndex(
			(result) => result.evidenceRecordIds.length > 0,
		);
		const { resultDigest: _discarded, ...resultBody } =
			report.checkResults[evidenceIndex];
		const tamperedBody = { ...resultBody, evidenceRecordIds: [] };
		const tamperedResult = {
			...tamperedBody,
			resultDigest: canonicalJsonDigest(tamperedBody),
		};
		const tamperedResults = [...report.checkResults];
		tamperedResults[evidenceIndex] = tamperedResult;
		assert.throws(
			() =>
				assertValidExitReport(
					{ ...report, checkResults: tamperedResults },
					policy,
				),
			/Evidence Record identities do not match its resolutions/,
		);
	});
});
