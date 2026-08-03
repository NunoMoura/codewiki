import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	COBERTURA_EVIDENCE_ADAPTER_PROTOCOL,
	LCOV_EVIDENCE_ADAPTER_PROTOCOL,
	ingestCoberturaEvidence,
	ingestLcovEvidence,
} from "../../src/evidence/adapters/coverage.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";
import {canonicalJsonDigest, sha256Digest} from "../../src/utils/canonical-json.ts";

const sourceSnapshotDigest = digest("1");
const coverageScopeDigest = digest("2");
const candidateDigest = digest("3");
const revisionDigest = digest("4");
const sourceTreeDigest = digest("5");

function lcovReport() {
	return `TN:unit
SF:src/a.ts
FN:1,privateAuthFunction
FNDA:1,privateAuthFunction
FNF:1
FNH:1
DA:1,1
DA:2,0
LF:2
LH:1
BRDA:1,0,0,1
BRDA:1,0,1,0
BRF:2
BRH:1
end_of_record
SF:src/b.ts
FNF:0
FNH:0
DA:5,0
LF:1
LH:0
BRF:0
BRH:0
end_of_record
SF:vendor/extra.ts
DA:1,1
LF:1
LH:1
BRF:0
BRH:0
FNF:0
FNH:0
end_of_record
`;
}

function coberturaReport() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<coverage lines-valid="4" lines-covered="2" branches-valid="2" branches-covered="1" line-rate="0.5" branch-rate="0.5">
  <packages>
    <package name="project">
      <classes>
        <class name="private.AuthClass" filename="src/a.ts">
          <methods>
            <method name="privateAuthFunction" signature="()V">
              <lines><line number="1" hits="1" /></lines>
            </method>
          </methods>
          <lines>
            <line number="1" hits="1" branch="true" condition-coverage="50% (1/2)" />
            <line number="2" hits="0" />
          </lines>
        </class>
        <class name="B" filename="src/b.ts">
          <lines><line number="5" hits="0" /></lines>
        </class>
        <class name="Vendor" filename="vendor/extra.ts">
          <lines><line number="1" hits="1" /></lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;
}

function input(bytes, ref, overrides = {}) {
	return {
		artifact: {bytes, ref},
		sourceSnapshotDigest,
		coverageScopeDigest,
		requiredPaths: ["src/b.ts", "./src/a.ts"],
		ownershipRefs: ["owner:runtime"],
		tool: {name: "coverage-tool", version: "1.2.3"},
		execution: {
			adapterId: "codewiki.coverage.runner",
			adapterVersion: "1.0.0",
			requestDigest: digest("6"),
			invocationDigest: digest("7"),
			environmentDigest: digest("8"),
			configurationDigest: digest("9"),
			termination: "exited",
			exitCode: 0,
			durationMs: 125,
		},
		provenanceRefs: ["coverage-run:unit/1"],
		...overrides,
	};
}

function runtime(coverage) {
	return {
		subject: {
			changeRefs: ["TRACE-CHG-coverage-adapters"],
			changeRevisionDigests: [revisionDigest],
			candidateDigest,
			acceptanceRequirementIds: [],
			sourceTreeDigest,
		},
		observedAt: "2026-08-05T10:00:00.000Z",
		producer: {
			kind: "runtime",
			id: "codewiki.coverage-adapter",
			version: "1.0.0",
		},
		authority: "observed",
		coverage,
		freshnessBoundary: "2026-08-05T10:00:00.000Z",
		sensitivity: "project",
	};
}

function expectedSummary() {
	return {
		reportedFileCount: 3,
		uniqueSafeFileCount: 3,
		requiredPathCount: 2,
		matchedRequiredPathCount: 2,
		missingRequiredPathCount: 0,
		outOfScopeFileCount: 1,
		lineFound: 3,
		lineHit: 1,
		branchFound: 2,
		branchHit: 1,
		functionFound: 1,
		functionHit: 1,
		unsafePathCount: 0,
		declaredCountMismatchCount: 0,
		excessFileCount: 0,
	};
}

describe("LCOV and Cobertura Evidence adapters", () => {
	it("normalizes both formats into exact factual coverage Evidence", () => {
		const cases = [
			{
				result: ingestLcovEvidence(
					input(lcovReport(), "artifact:coverage/lcov"),
				),
				protocol: LCOV_EVIDENCE_ADAPTER_PROTOCOL,
				format: "lcov",
				bytes: lcovReport(),
			},
			{
				result: ingestCoberturaEvidence(
					input(coberturaReport(), "artifact:coverage/cobertura"),
				),
				protocol: COBERTURA_EVIDENCE_ADAPTER_PROTOCOL,
				format: "cobertura_xml",
				bytes: coberturaReport(),
			},
		];
		for (const entry of cases) {
			const admitted = entry.result;
			assert.deepEqual({...admitted.protocol}, entry.protocol);
			assert.equal(admitted.format, entry.format);
			assert.equal(admitted.coverage, "complete");
			assert.deepEqual({...admitted.summary}, expectedSummary());
			assert.equal(
				admitted.artifact.digest,
				sha256Digest(Buffer.from(entry.bytes)),
			);
			assert.deepEqual(admitted.sourceObservation.payload.paths, [
				"src/a.ts",
				"src/b.ts",
			]);
			assert.equal(admitted.sourceObservation.payload.observations.length, 3);
			assert.equal(admitted.commandExecution.payload.diagnosticRefs.length, 3);
			assert.match(
				admitted.commandExecution.payload.diagnosticRefs[0],
				new RegExp(`^coverage-summary:${entry.format}/`),
			);
			assert.ok(
				admitted.sourceObservation.provenanceRefs.includes(
					`coverage-source-snapshot:${sourceSnapshotDigest}`,
				),
			);
			assert.ok(
				admitted.sourceObservation.provenanceRefs.includes(
					`coverage-format:${entry.format}`,
				),
			);
			const serialized = JSON.stringify(admitted);
			assert.doesNotMatch(serialized, /privateAuthFunction|private\.AuthClass/);
			assert.equal("result" in admitted, false);
			assert.equal("threshold" in admitted, false);
			assert.match(admitted.bindingDigest, /^sha256:[0-9a-f]{64}$/);
			const {receiptDigest, ...body} = admitted;
			assert.equal(receiptDigest, canonicalJsonDigest(body));

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
			assert.equal(sourceRecord.authority, "observed");
			assert.equal(sourceRecord.coverage, "complete");
		}
		assert.deepEqual(
			ingestLcovEvidence(input(lcovReport(), "artifact:coverage/lcov")),
			cases[0].result,
		);
		assert.deepEqual(
			ingestCoberturaEvidence(
				input(coberturaReport(), "artifact:coverage/cobertura"),
			),
			cases[1].result,
		);
	});

	it("preserves missing, unsafe, mismatched, excessive, and unavailable coverage", () => {
		const partialReport = `SF:src/a.ts
DA:1,1
LF:2
LH:1
end_of_record
SF:/private/source.ts
DA:1,1
LF:1
LH:1
end_of_record
`;
		const partial = ingestLcovEvidence(
			input(partialReport, "artifact:coverage/partial"),
		);
		assert.equal(partial.coverage, "partial");
		assert.equal(partial.summary.missingRequiredPathCount, 1);
		assert.equal(partial.summary.unsafePathCount, 1);
		assert.equal(partial.summary.declaredCountMismatchCount, 1);
		assert.doesNotMatch(JSON.stringify(partial), /private\/source/);

		const manyRecords = Array.from(
			{length: 2_049},
			(_, index) =>
				`SF:src/file-${index}.ts\nLF:0\nLH:0\nBRF:0\nBRH:0\nFNF:0\nFNH:0\nend_of_record\n`,
		).join("");
		const excessive = ingestLcovEvidence(
			input(manyRecords, "artifact:coverage/excessive", {
				requiredPaths: ["src/file-0.ts"],
			}),
		);
		assert.equal(excessive.coverage, "partial");
		assert.equal(excessive.summary.excessFileCount, 1);
		assert.equal(excessive.summary.matchedRequiredPathCount, 1);

		const unavailable = ingestCoberturaEvidence(
			input(coberturaReport(), "artifact:coverage/unavailable", {
				execution: {
					adapterId: "codewiki.coverage.runner",
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

	it("rejects authority input, unsafe scope, malformed formats, and oversized artifacts", () => {
		assert.throws(
			() =>
				ingestLcovEvidence({
					...input(lcovReport(), "artifact:coverage/authority"),
					authority: "verified",
				}),
			/LCOV ingestion received unsupported field authority/,
		);
		assert.throws(
			() =>
				ingestLcovEvidence(
					input(lcovReport(), "artifact:coverage/path", {
						requiredPaths: ["/private/source.ts"],
					}),
				),
			/project-relative/,
		);
		assert.throws(
			() =>
				ingestLcovEvidence(
					input(
						"SF:src/a.ts\nUNKNOWN:value\nend_of_record\n",
						"artifact:coverage/unknown",
					),
				),
			/unsupported record UNKNOWN/,
		);
		assert.throws(
			() =>
				ingestLcovEvidence(
					input(
						"SF:src/a.ts\nLF:0\nLF:0\nend_of_record\n",
						"artifact:coverage/duplicate",
					),
				),
			/repeats LF/,
		);
		assert.throws(
			() =>
				ingestCoberturaEvidence(
					input(
						'<!DOCTYPE coverage SYSTEM "http://example.invalid/cobertura.dtd"><coverage />',
						"artifact:coverage/doctype",
					),
				),
			/cannot contain DTD, entity, or processing declarations/,
		);
		assert.throws(
			() =>
				ingestCoberturaEvidence(
					input(
						'<coverage><packages><package><classes><class name="A" filename="src/a.ts"><lines><line number="1" hits="1" branch="true" condition-coverage="100% (1/2)" /></lines></class></classes></package></packages></coverage>',
						"artifact:coverage/branch-mismatch",
						{requiredPaths: ["src/a.ts"]},
					),
				),
			/percentage mismatches counts/,
		);
		assert.throws(
			() =>
				ingestCoberturaEvidence(
					input("<testsuites />", "artifact:coverage/wrong-root"),
				),
			/must contain exactly one coverage root/,
		);
		assert.throws(
			() =>
				ingestLcovEvidence(
					input(
						"x".repeat(4 * 1024 * 1024 + 1),
						"artifact:coverage/oversized",
					),
				),
			/LCOV artifact must contain/,
		);
	});
});

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}
