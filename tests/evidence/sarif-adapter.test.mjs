import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	SARIF_EVIDENCE_ADAPTER_PROTOCOL,
	ingestSarif21Evidence,
} from "../../src/evidence/adapters/sarif.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";
import {canonicalJsonDigest, sha256Digest} from "../../src/utils/canonical-json.ts";

const sourceSnapshotDigest = digest("1");
const candidateDigest = digest("2");
const revisionDigest = digest("3");
const sourceTreeDigest = digest("4");

function sarif(results = defaultResults()) {
	return JSON.stringify({
		version: "2.1.0",
		runs: [
			{
				tool: {driver: {name: "example-scanner", version: "3.2.1"}},
				results,
			},
		],
	});
}

function defaultResults() {
	return [
		{
			ruleId: "security/no-unsafe-call",
			level: "error",
			message: {text: "Private exploit detail must not enter Evidence."},
			locations: [
				{
					physicalLocation: {
						artifactLocation: {uri: "src/security.ts"},
						region: {startLine: 42},
					},
				},
			],
		},
		{
			ruleId: "quality/global-warning",
			level: "warning",
			message: {text: "A global warning without a location."},
		},
	];
}

function input(overrides = {}) {
	return {
		artifact: {
			bytes: sarif(),
			ref: "artifact:sarif/example-scan",
		},
		sourceSnapshotDigest,
		scannedPaths: ["src"],
		ownershipRefs: ["owner:security"],
		expectedTools: [{name: "example-scanner", version: "3.2.1"}],
		execution: {
			adapterId: "codewiki.scanner.example",
			adapterVersion: "1.0.0",
			requestDigest: digest("7"),
			invocationDigest: digest("5"),
			environmentDigest: digest("6"),
			configurationDigest: digest("8"),
			advisoryDatabaseDigest: digest("9"),
			termination: "exited",
			exitCode: 1,
			durationMs: 125,
		},
		provenanceRefs: ["scan:example/run-1"],
		...overrides,
	};
}

function runtime(coverage) {
	return {
		subject: {
			changeRefs: ["TRACE-CHG-sarif-adapter"],
			changeRevisionDigests: [revisionDigest],
			candidateDigest,
			acceptanceRequirementIds: [],
			sourceTreeDigest,
		},
		observedAt: "2026-08-03T10:00:00.000Z",
		producer: {
			kind: "runtime",
			id: "codewiki.sarif-adapter",
			version: SARIF_EVIDENCE_ADAPTER_PROTOCOL.version,
		},
		authority: "observed",
		coverage,
		freshnessBoundary: "2026-08-03T10:00:00.000Z",
		sensitivity: "project",
	};
}

describe("SARIF 2.1 Evidence adapter", () => {
	it("binds exact tools and bytes into sanitized Evidence-only materials", () => {
		const admitted = ingestSarif21Evidence(input());
		assert.deepEqual(
			{...admitted.protocol},
			SARIF_EVIDENCE_ADAPTER_PROTOCOL,
		);
		assert.equal(admitted.sourceSnapshotDigest, sourceSnapshotDigest);
		assert.equal(admitted.authorityCeiling, "observed");
		assert.equal(admitted.grantsResult, false);
		assert.equal(admitted.coverage, "complete");
		assert.equal(admitted.summary.resultCount, 2);
		assert.equal(admitted.summary.errorCount, 1);
		assert.equal(admitted.summary.warningCount, 1);
		assert.equal(admitted.artifact.digest, sha256Digest(Buffer.from(sarif())));
		assert.equal(admitted.commandExecution.payload.stdoutDigest, admitted.artifact.digest);
		assert.match(admitted.bindingDigest, /^sha256:[0-9a-f]{64}$/);
		assert.ok(
			admitted.commandExecution.provenanceRefs.includes(
				`sarif-binding:${admitted.bindingDigest}`,
			),
		);
		assert.deepEqual(admitted.sourceObservation.payload.paths, ["src", "src/security.ts"]);
		assert.equal(admitted.sourceObservation.payload.observations.length, 3);
		const serialized = JSON.stringify(admitted);
		assert.doesNotMatch(serialized, /Private exploit detail|global warning without/);
		assert.match(serialized, /messageDigest=sha256:/);
		assert.equal("status" in admitted, false);
		assert.equal("result" in admitted, false);
		const {receiptDigest, ...body} = admitted;
		assert.equal(receiptDigest, canonicalJsonDigest(body));
		assert.deepEqual(ingestSarif21Evidence(input()), admitted);

		const commandRecord = materializeEvidenceRecord(
			admitted.commandExecution,
			runtime(admitted.coverage),
		);
		const sourceRecord = materializeEvidenceRecord(
			admitted.sourceObservation,
			runtime(admitted.coverage),
		);
		assert.equal(commandRecord.kind, "command_execution");
		assert.equal(sourceRecord.kind, "source_observation");
		assert.equal(commandRecord.authority, "observed");
		assert.equal(sourceRecord.coverage, "complete");
	});

	it("preserves unsafe and truncated observations as partial coverage", () => {
		const results = Array.from({length: 300}, (_, index) => ({
			ruleId: `rule-${index}`,
			level: index === 0 ? "error" : "note",
			message: {text: `finding ${index}`},
			locations: [
				{
					physicalLocation: {
						artifactLocation: {
							uri: index === 0 ? "file:///private/source.ts" : `src/file-${index}.ts`,
						},
					},
				},
			],
		}));
		const admitted = ingestSarif21Evidence(
			input({artifact: {bytes: sarif(results), ref: "artifact:sarif/partial"}}),
		);
		assert.equal(admitted.coverage, "partial");
		assert.equal(admitted.summary.unsafeLocationCount, 1);
		assert.equal(admitted.sourceObservation.payload.observations.length, 256);
		assert.equal(admitted.sourceObservation.payload.paths.length, 256);
		assert.doesNotMatch(JSON.stringify(admitted), /private\/source/);

		const unavailable = ingestSarif21Evidence(
			input({
				execution: {
					adapterId: "codewiki.scanner.example",
					adapterVersion: "1.0.0",
					requestDigest: digest("7"),
					invocationDigest: digest("5"),
					environmentDigest: digest("6"),
					configurationDigest: digest("8"),
					advisoryDatabaseDigest: digest("9"),
					termination: "unavailable",
					durationMs: 0,
				},
			}),
		);
		assert.equal(unavailable.coverage, "unknown");
	});

	it("rejects unsupported authority, mismatched identity, malformed context, and oversized bytes", () => {
		assert.throws(
			() => ingestSarif21Evidence({...input(), authority: "approved"}),
			/SARIF ingestion received unsupported field authority/,
		);
		assert.throws(
			() =>
				ingestSarif21Evidence({
					...input(),
					expectedTools: [
						{name: "example-scanner", version: "3.2.1", authority: "verified"},
					],
				}),
			/SARIF ingestion received unsupported field authority/,
		);
		assert.throws(
			() =>
				ingestSarif21Evidence({
					...input(),
					expectedTools: [{name: "different-scanner", version: "3.2.1"}],
				}),
			/SARIF tool identity does not match the Runtime binding/,
		);
		assert.throws(
			() =>
				ingestSarif21Evidence({
					...input(),
					artifact: {
						bytes: sarif().replace('"2.1.0"', '"2.0.0"'),
						ref: "artifact:sarif/wrong-version",
					},
				}),
			/SARIF document version must be 2.1.0/,
		);
		const duplicateKey = sarif().replace(
			'"version":"2.1.0"',
			'"version":"2.1.0","version":"2.1.0"',
		);
		assert.throws(
			() =>
				ingestSarif21Evidence({
					...input(),
					artifact: {bytes: duplicateKey, ref: "artifact:sarif/duplicate"},
				}),
			/malformed or duplicate-key syntax/,
		);
		assert.throws(
			() =>
				ingestSarif21Evidence({
					...input(),
					artifact: {
						bytes: "x".repeat(4 * 1024 * 1024 + 1),
						ref: "artifact:sarif/oversized",
					},
				}),
			/SARIF artifact must contain/,
		);
		assert.throws(
			() =>
				ingestSarif21Evidence({
					...input(),
					artifact: {
						bytes: sarif(),
						ref: "https://provider.invalid/result?token=private",
					},
				}),
			/opaque credential-free ref/,
		);
	});
});

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}
