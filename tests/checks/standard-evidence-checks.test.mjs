import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	evaluateStandardEvidenceCheck,
	STANDARD_EVIDENCE_CHECK_EVALUATION_PROTOCOL,
} from "../../src/checks/standard-evidence-checks.ts";
import {
	materializeStandardAdapterEvidence,
} from "../../src/evidence/adapters/materialization.ts";
import {
	JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
	ingestJunitXmlEvidence,
} from "../../src/evidence/adapters/junit.ts";
import {ingestLcovEvidence} from "../../src/evidence/adapters/coverage.ts";
import {ingestSarif21Evidence} from "../../src/evidence/adapters/sarif.ts";
import {
	PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL,
	ingestProviderCheckReceiptEvidence,
} from "../../src/evidence/adapters/provider-check-receipt.ts";
import {
	CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL,
	ingestCycloneDx17JsonEvidence,
} from "../../src/evidence/adapters/cyclonedx.ts";
import {
	EVIDENCE_OBLIGATION_VERSION,
	createEvidenceObligation,
} from "../../src/evidence/obligations.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
} from "../../src/utils/canonical-json.ts";

const sourceSnapshotDigest = digest("1");
const scopeDigest = digest("2");
const subject = Object.freeze({
	changeRefs: ["TRACE-CHG-standard-evidence-check"],
	changeRevisionDigests: [digest("3")],
	candidateDigest: digest("4"),
	acceptanceRequirementIds: [],
	sourceTreeDigest: sourceSnapshotDigest,
});
const baseExecution = Object.freeze({
	adapterId: "codewiki.fixture.collector",
	adapterVersion: "1.0.0",
	requestDigest: digest("5"),
	invocationDigest: digest("6"),
	environmentDigest: digest("7"),
	configurationDigest: digest("8"),
	termination: "exited",
	exitCode: 0,
	durationMs: 25,
});

function commandObligation({
	producerKind = "runtime",
	authority = "observed",
} = {}) {
	return createEvidenceObligation({
		id: "standard-command",
		version: EVIDENCE_OBLIGATION_VERSION,
		kinds: ["command_execution"],
		producerKinds: [producerKind],
		authorities: [authority],
		coverages: ["complete"],
		sensitivities: ["project"],
		minimumCount: 1,
		subject: "candidate_source_tree",
		freshness: "exact_boundary",
		artifact: "required",
		contradiction: "retain",
	});
}

function sourceObligation() {
	return createEvidenceObligation({
		id: "standard-source",
		version: EVIDENCE_OBLIGATION_VERSION,
		kinds: ["source_observation"],
		producerKinds: ["runtime"],
		authorities: ["observed"],
		coverages: ["complete"],
		sensitivities: ["project"],
		minimumCount: 1,
		subject: "candidate_source_tree",
		freshness: "exact_boundary",
		artifact: "required",
		contradiction: "retain",
	});
}

function evaluate(ingestion, selector, obligation = commandObligation()) {
	const bundle = materializeStandardAdapterEvidence({
		ingestion,
		subject,
		observedAt: "2026-08-01T12:00:00.000Z",
	});
	return evaluateStandardEvidenceCheck({
		selector,
		ingestion,
		bundle,
		obligation,
		expectedSubject: subject,
	});
}

function junit({failed = false, expectedTestCount = 2} = {}) {
	const failure = failed
		? '<failure message="private">private stack</failure>'
		: "";
	return ingestJunitXmlEvidence({
		artifact: {
			bytes: `<testsuite name="unit" tests="2" failures="${failed ? 1 : 0}" errors="0" skipped="0"><testcase name="one"/><testcase name="two">${failure}</testcase></testsuite>`,
			ref: "artifact:junit/standard-check",
		},
		sourceSnapshotDigest,
		testSelectionDigest: digest("9"),
		expectedTestCount,
		runner: {name: "node-test", version: "26.1.0"},
		execution: {...baseExecution, exitCode: failed ? 1 : 0},
		provenanceRefs: ["run:junit/standard-check"],
	});
}

function lcov() {
	return ingestLcovEvidence({
		artifact: {
			bytes: "TN:\nSF:src/a.ts\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n",
			ref: "artifact:lcov/standard-check",
		},
		sourceSnapshotDigest,
		coverageScopeDigest: scopeDigest,
		requiredPaths: ["src/a.ts"],
		ownershipRefs: ["owner:platform"],
		tool: {name: "c8", version: "10.1.3"},
		execution: baseExecution,
		provenanceRefs: ["run:lcov/standard-check"],
	});
}

function sarif({withFinding = true} = {}) {
	return ingestSarif21Evidence({
		artifact: {
			bytes: JSON.stringify({
				version: "2.1.0",
				$schema: "https://json.schemastore.org/sarif-2.1.0.json",
				runs: [
					{
						tool: {driver: {name: "fixture-scanner", version: "1.0.0"}},
						results: withFinding
							? [{ruleId: "security/rule", level: "error", message: {text: "private"}}]
							: [],
					},
				],
			}),
			ref: "artifact:sarif/standard-check",
		},
		sourceSnapshotDigest,
		scannedPaths: ["src"],
		ownershipRefs: ["owner:security"],
		expectedTools: [{name: "fixture-scanner", version: "1.0.0"}],
		execution: {...baseExecution, exitCode: withFinding ? 1 : 0},
		provenanceRefs: ["run:sarif/standard-check"],
	});
}

function provider(conclusion) {
	const providerInstanceDigest = digest("a");
	const repositoryIdDigest = digest("b");
	const checkIdentityDigest = digest("c");
	const checkConfigurationDigest = digest("d");
	const authentication = {
		method: "authenticated_api",
		authenticatedIdentityDigest: digest("e"),
		credentialBindingDigest: digest("f"),
	};
	const execution = {
		...baseExecution,
		adapterId: "codewiki.provider.github-checks",
		exitCode: 0,
	};
	const receipt = {
		protocolId: PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL.id,
		protocolVersion: PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL.version,
		providerId: "github",
		providerInstanceDigest,
		repositoryIdDigest,
		sourceSnapshotDigest,
		headCommit: "a".repeat(40),
		checkIdentityDigest,
		checkConfigurationDigest,
		authenticationDigest: canonicalJsonDigest(authentication),
		adapterId: execution.adapterId,
		adapterVersion: execution.adapterVersion,
		requestDigest: execution.requestDigest,
		executionDigest: canonicalJsonDigest(execution),
		providerCheckIdDigest: digest("0"),
		providerCheckSuiteIdDigest: digest("2"),
		providerPayloadDigest: digest("3"),
		attempt: 1,
		state: "completed",
		conclusion,
		startedAt: "2026-08-01T11:59:00.000Z",
		completedAt: "2026-08-01T12:00:00.000Z",
		outputDigest: digest("1"),
		annotationCount: 0,
	};
	return ingestProviderCheckReceiptEvidence({
		artifact: {
			bytes: canonicalJson(receipt),
			ref: "provider-receipt:github/standard-check",
		},
		provider: {providerId: "github", providerInstanceDigest},
		repositoryIdDigest,
		sourceSnapshotDigest,
		headCommit: receipt.headCommit,
		checkIdentityDigest,
		checkConfigurationDigest,
		authentication,
		execution,
		provenanceRefs: ["provider-request:standard-check"],
	});
}

function cyclonedx() {
	return ingestCycloneDx17JsonEvidence({
		artifact: {
			bytes: JSON.stringify({
				bomFormat: "CycloneDX",
				specVersion: "1.7",
				version: 1,
				components: [{type: "library", name: "private", version: "1.0.0", "bom-ref": "a"}],
			}),
			ref: "artifact:cyclonedx/standard-check",
		},
		sourceSnapshotDigest,
		scopeDigest,
		sourcePaths: ["package.json"],
		requiredIdentityDigests: [],
		ownershipRefs: ["owner:platform"],
		tool: {name: "fixture-sbom", version: "1.0.0"},
		execution: baseExecution,
		provenanceRefs: ["run:cyclonedx/standard-check"],
	});
}

describe("standard Evidence Check evaluation", () => {
	it("derives deterministic JUnit pass/fail and keeps partial input indeterminate", () => {
		const selector = {
			kind: "junit_tests_passed",
			minimumTestCount: 2,
			maximumSkippedCount: 0,
		};
		const passed = evaluate(junit(), selector);
		const failed = evaluate(junit({failed: true}), selector);
		const partial = evaluate(junit({expectedTestCount: 3}), selector);

		assert.deepEqual({...passed.protocol}, STANDARD_EVIDENCE_CHECK_EVALUATION_PROTOCOL);
		assert.equal(passed.disposition, "satisfied");
		assert.equal(failed.disposition, "unsatisfied");
		assert.equal(failed.facts.failureCount, 1);
		assert.equal(partial.disposition, "indeterminate");
		assert.equal(partial.evidenceResolution.status, "indeterminate");
		assert.equal(passed.grantsResult, false);
		assert.equal("status" in passed, false);
	});

	it("applies exact coverage basis-point thresholds", () => {
		const passed = evaluate(lcov(), {
			kind: "coverage_minimum",
			metric: "line",
			minimumBasisPoints: 5_000,
		});
		const failed = evaluate(lcov(), {
			kind: "coverage_minimum",
			metric: "line",
			minimumBasisPoints: 5_001,
		});

		assert.equal(passed.disposition, "satisfied");
		assert.equal(passed.facts.observedBasisPoints, 5_000);
		assert.equal(failed.disposition, "unsatisfied");
	});

	it("reduces complete SARIF findings under an explicit blocked-level policy", () => {
		const selector = {
			kind: "sarif_findings_absent",
			blockedLevels: ["error", "warning"],
		};
		assert.equal(evaluate(sarif({withFinding: false}), selector).disposition, "satisfied");
		const failed = evaluate(sarif(), selector);
		assert.equal(failed.disposition, "unsatisfied");
		assert.equal(failed.facts.blockedFindingCount, 1);
	});

	it("interprets authenticated provider conclusions only under explicit Check policy", () => {
		const selector = {
			kind: "provider_conclusion_accepted",
			acceptedConclusions: ["success"],
		};
		const obligation = commandObligation({
			producerKind: "external_service",
			authority: "verified",
		});
		assert.equal(evaluate(provider("success"), selector, obligation).disposition, "satisfied");
		assert.equal(evaluate(provider("failure"), selector, obligation).disposition, "unsatisfied");
	});

	it("proves only exact structured artifact identity readiness", () => {
		const admitted = cyclonedx();
		const evaluated = evaluate(
			admitted,
			{
				kind: "artifact_identity_present",
				adapterProtocol: CYCLONEDX_EVIDENCE_ADAPTER_PROTOCOL,
				minimumIdentityCount: 1,
			},
			sourceObligation(),
		);
		assert.equal(evaluated.disposition, "satisfied");
		assert.deepEqual({...evaluated.facts}, {
			identityEvidenceComplete: true,
			identityCount: 1,
			minimumIdentityCount: 1,
		});
		assert.equal("securityResult" in evaluated, false);

		assert.throws(
			() =>
				evaluate(admitted, {
					kind: "artifact_identity_present",
					adapterProtocol: JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
					minimumIdentityCount: 1,
				}, sourceObligation()),
			/artifact identity Evidence Check protocol .* is unsupported/i,
		);
	});

	it("rejects selector drift, wrong adapter families, and bundle mismatch", () => {
		assert.throws(
			() =>
				evaluate(junit(), {
					kind: "junit_tests_passed",
					minimumTestCount: 2,
					maximumSkippedCount: 0,
					threshold: 1,
				}),
			/received unsupported field threshold/,
		);
		assert.throws(
			() =>
				evaluate(junit(), {
					kind: "sarif_findings_absent",
					blockedLevels: ["error"],
				}),
			/cannot consume/,
		);
		assert.throws(
			() =>
				evaluate(
					junit(),
					{
						kind: "junit_tests_passed",
						minimumTestCount: 2,
						maximumSkippedCount: 0,
					},
					createEvidenceObligation({
						...commandObligation(),
						coverages: ["complete", "partial"],
					}),
				),
			/must require complete coverage/,
		);

		const admitted = junit();
		const bundle = materializeStandardAdapterEvidence({
			ingestion: admitted,
			subject,
			observedAt: "2026-08-01T12:00:00.000Z",
		});
		assert.throws(
			() =>
				evaluateStandardEvidenceCheck({
					selector: {
						kind: "junit_tests_passed",
						minimumTestCount: 2,
						maximumSkippedCount: 0,
					},
					ingestion: admitted,
					bundle: {...bundle, adapterReceiptDigest: digest("f")},
					obligation: commandObligation(),
					expectedSubject: subject,
				}),
			/bundle digest does not match/,
		);
	});
});

function digest(character) {
	return canonicalJsonDigest({character});
}
