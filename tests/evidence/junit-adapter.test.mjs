import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
	ingestJunitXmlEvidence,
} from "../../src/evidence/adapters/junit.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";
import {canonicalJsonDigest, sha256Digest} from "../../src/utils/canonical-json.ts";

const sourceSnapshotDigest = digest("1");
const testSelectionDigest = digest("2");
const candidateDigest = digest("3");
const revisionDigest = digest("4");
const sourceTreeDigest = digest("5");

function report() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="project" tests="4" failures="1" errors="1" skipped="1">
  <testsuite name="unit" tests="4" failures="1" errors="1" skipped="1">
    <testcase classname="auth" name="accepts current token" file="tests/auth.test.ts" line="10" time="0.010" />
    <testcase classname="auth" name="rejects expired token" file="tests/auth.test.ts" line="20" time="0.020">
      <failure message="private assertion detail" type="AssertionError">secret stack and credential</failure>
    </testcase>
    <testcase classname="store" name="reports unavailable database" time="0.030">
      <error message="private connection detail">secret provider output</error>
    </testcase>
    <testcase classname="platform" name="requires another platform" status="notrun" />
  </testsuite>
</testsuites>`;
}

function input(overrides = {}) {
	return {
		artifact: {
			bytes: report(),
			ref: "artifact:junit/unit-run",
		},
		sourceSnapshotDigest,
		testSelectionDigest,
		expectedTestCount: 4,
		runner: {name: "node-test", version: "26.1.0"},
		execution: {
			adapterId: "codewiki.test.node",
			adapterVersion: "1.0.0",
			requestDigest: digest("6"),
			invocationDigest: digest("7"),
			environmentDigest: digest("8"),
			configurationDigest: digest("9"),
			termination: "exited",
			exitCode: 1,
			durationMs: 61,
		},
		provenanceRefs: ["test-run:node/unit-1"],
		...overrides,
	};
}

function runtime(coverage) {
	return {
		subject: {
			changeRefs: ["TRACE-CHG-junit-adapter"],
			changeRevisionDigests: [revisionDigest],
			candidateDigest,
			acceptanceRequirementIds: [],
			sourceTreeDigest,
		},
		observedAt: "2026-08-04T10:00:00.000Z",
		producer: {
			kind: "runtime",
			id: "codewiki.junit-adapter",
			version: JUNIT_EVIDENCE_ADAPTER_PROTOCOL.version,
		},
		authority: "observed",
		coverage,
		freshnessBoundary: "2026-08-04T10:00:00.000Z",
		sensitivity: "project",
	};
}

describe("JUnit XML Evidence adapter", () => {
	it("binds expected execution and emits sanitized Evidence-only material", () => {
		const admitted = ingestJunitXmlEvidence(input());
		assert.deepEqual(
			{...admitted.protocol},
			JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
		);
		assert.equal(admitted.sourceSnapshotDigest, sourceSnapshotDigest);
		assert.equal(admitted.authorityCeiling, "observed");
		assert.equal(admitted.grantsResult, false);
		assert.equal(admitted.coverage, "complete");
		assert.deepEqual({...admitted.summary}, {
			suiteCount: 1,
			admittedSuiteCount: 1,
			testCount: 4,
			admittedTestCount: 4,
			passedCount: 1,
			failureCount: 1,
			errorCount: 1,
			skippedCount: 1,
			expectedTestCount: 4,
			expectedTestCountMismatch: false,
			declaredCountMismatchCount: 0,
			unsafeFileCount: 0,
			truncatedSuiteCount: 0,
			truncatedTestCount: 0,
			omittedDiagnosticCount: 0,
		});
		assert.equal(admitted.artifact.digest, sha256Digest(Buffer.from(report())));
		assert.equal(admitted.commandExecution.payload.stdoutDigest, undefined);
		assert.equal(admitted.commandExecution.payload.diagnosticRefs.length, 4);
		assert.match(admitted.commandExecution.payload.diagnosticRefs[0], /^junit-summary:/);
		assert.match(admitted.bindingDigest, /^sha256:[0-9a-f]{64}$/);
		assert.ok(
			admitted.commandExecution.provenanceRefs.includes(
				`junit-binding:${admitted.bindingDigest}`,
			),
		);
		assert.ok(
			admitted.commandExecution.provenanceRefs.includes(
				`junit-source-snapshot:${sourceSnapshotDigest}`,
			),
		);
		assert.ok(
			admitted.commandExecution.provenanceRefs.includes(
				`junit-test-selection:${testSelectionDigest}`,
			),
		);
		const serialized = JSON.stringify(admitted);
		assert.doesNotMatch(
			serialized,
			/private assertion|secret stack|connection detail|provider output|expired token/,
		);
		assert.equal("result" in admitted, false);
		assert.equal("verdict" in admitted, false);
		const {receiptDigest, ...body} = admitted;
		assert.equal(receiptDigest, canonicalJsonDigest(body));
		assert.deepEqual(ingestJunitXmlEvidence(input()), admitted);

		const record = materializeEvidenceRecord(
			admitted.commandExecution,
			runtime(admitted.coverage),
		);
		assert.equal(record.kind, "command_execution");
		assert.equal(record.authority, "observed");
		assert.equal(record.coverage, "complete");
	});

	it("preserves mismatches, unsafe paths, truncation, and unavailable execution", () => {
		const failures = Array.from(
			{length: 300},
			(_, index) =>
				`<testcase name="case-${index}" file="${index === 0 ? "/private/test.ts" : `tests/case-${index}.ts`}"><failure message="detail-${index}" /></testcase>`,
		).join("");
		const partialXml = `<testsuite name="partial" tests="301" failures="300">${failures}</testsuite>`;
		const partial = ingestJunitXmlEvidence(
			input({
				artifact: {bytes: partialXml, ref: "artifact:junit/partial"},
				expectedTestCount: 301,
			}),
		);
		assert.equal(partial.coverage, "partial");
		assert.equal(partial.summary.testCount, 300);
		assert.equal(partial.summary.expectedTestCountMismatch, true);
		assert.equal(partial.summary.declaredCountMismatchCount, 1);
		assert.equal(partial.summary.unsafeFileCount, 1);
		assert.equal(partial.summary.omittedDiagnosticCount, 45);
		assert.equal(partial.commandExecution.payload.diagnosticRefs.length, 256);
		assert.doesNotMatch(JSON.stringify(partial), /private\/test|detail-0/);

		const suiteDrift = ingestJunitXmlEvidence(
			input({
				artifact: {
					bytes: '<testsuites tests="1"><testsuite name="drift" tests="2"><testcase name="only" /></testsuite></testsuites>',
					ref: "artifact:junit/suite-drift",
				},
				expectedTestCount: 1,
			}),
		);
		assert.equal(suiteDrift.coverage, "partial");
		assert.equal(suiteDrift.summary.declaredCountMismatchCount, 1);

		const manyTests = Array.from(
			{length: 8_200},
			(_, index) => `<testcase name="case-${index}" />`,
		).join("");
		const truncated = ingestJunitXmlEvidence(
			input({
				artifact: {
					bytes: `<testsuite name="large" tests="8200">${manyTests}</testsuite>`,
					ref: "artifact:junit/truncated",
				},
				expectedTestCount: 8_200,
			}),
		);
		assert.equal(truncated.coverage, "partial");
		assert.equal(truncated.summary.admittedTestCount, 8_192);
		assert.equal(truncated.summary.truncatedTestCount, 8);

		const unavailable = ingestJunitXmlEvidence(
			input({
				execution: {
					adapterId: "codewiki.test.node",
					adapterVersion: "1.0.0",
					requestDigest: digest("6"),
					invocationDigest: digest("7"),
					environmentDigest: digest("8"),
					configurationDigest: digest("9"),
					termination: "unavailable",
					durationMs: 0,
				},
			}),
		);
		assert.equal(unavailable.coverage, "unknown");
	});

	it("rejects unsafe XML, malformed context, contradictory outcomes, and oversized bytes", () => {
		assert.throws(
			() => ingestJunitXmlEvidence({...input(), authority: "approved"}),
			/JUnit ingestion received unsupported field authority/,
		);
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					runner: {name: "node-test", version: "26.1.0", result: "pass"},
				}),
			/JUnit ingestion received unsupported field result/,
		);
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					artifact: {
						bytes: '<!DOCTYPE testsuite [<!ENTITY secret SYSTEM "file:///etc/passwd">]><testsuite/>',
						ref: "artifact:junit/entity",
					},
				}),
			/cannot contain DTD, entity, or processing declarations/,
		);
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					artifact: {
						bytes: '<testsuite><testcase name="bad"><failure/><error/></testcase></testsuite>',
						ref: "artifact:junit/contradictory",
					},
					expectedTestCount: 1,
				}),
			/has contradictory outcomes/,
		);
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					artifact: {
						bytes: "<testsuite><testcase name=\"broken\"></testsuite>",
						ref: "artifact:junit/malformed",
					},
				}),
			/JUnit artifact is not valid XML/,
		);
		const deeplyNested = `${Array.from(
			{length: 40},
			(_, index) => `<testsuite name="suite-${index}">`,
		).join("")}${"</testsuite>".repeat(40)}`;
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					artifact: {
						bytes: deeplyNested,
						ref: "artifact:junit/deeply-nested",
					},
				}),
			/could not be parsed safely/,
		);
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					artifact: {bytes: "<coverage />", ref: "artifact:junit/wrong-root"},
				}),
			/root must be testsuites or testsuite/,
		);
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					artifact: {
						bytes: "x".repeat(4 * 1024 * 1024 + 1),
						ref: "artifact:junit/oversized",
					},
				}),
			/JUnit artifact must contain/,
		);
		assert.throws(
			() =>
				ingestJunitXmlEvidence({
					...input(),
					artifact: {bytes: new Uint8Array([0xff]), ref: "artifact:junit/utf8"},
				}),
			/must be valid UTF-8 XML/,
		);
	});
});

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}
