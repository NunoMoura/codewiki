import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
	ingestJunitXmlEvidence,
} from "../../src/evidence/adapters/junit.ts";
import {SARIF_EVIDENCE_ADAPTER_PROTOCOL} from "../../src/evidence/adapters/sarif.ts";
import {
	STANDARD_ADAPTER_MATERIALIZATION_PROTOCOL,
	adapterProtocolRef,
	materializeStandardAdapterEvidence,
	resolveStandardAdapterEvidenceObligation,
} from "../../src/evidence/adapters/materialization.ts";
import {
	EVIDENCE_OBLIGATION_VERSION,
	createEvidenceObligation,
} from "../../src/evidence/obligations.ts";
import {sha256Digest} from "../../src/utils/canonical-json.ts";

const sourceSnapshotDigest = digest("1");
const candidateDigest = digest("2");
const revisionDigest = digest("3");
const testSelectionDigest = digest("4");

const subject = Object.freeze({
	changeRefs: ["TRACE-CHG-adapter-materialization"],
	changeRevisionDigests: [revisionDigest],
	candidateDigest,
	acceptanceRequirementIds: [],
	sourceTreeDigest: sourceSnapshotDigest,
});

function report() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="1" errors="0" skipped="0">
  <testsuite name="unit" tests="2" failures="1" errors="0" skipped="0">
    <testcase classname="auth" name="accepts current token" />
    <testcase classname="auth" name="rejects expired token">
      <failure message="private detail">private stack</failure>
    </testcase>
  </testsuite>
</testsuites>`;
}

function ingestion(overrides = {}) {
	return ingestJunitXmlEvidence({
		artifact: {bytes: report(), ref: "artifact:junit/materialization"},
		sourceSnapshotDigest,
		testSelectionDigest,
		expectedTestCount: 2,
		runner: {name: "node-test", version: "26.1.0"},
		execution: {
			adapterId: "codewiki.test.node",
			adapterVersion: "1.0.0",
			requestDigest: digest("5"),
			invocationDigest: digest("6"),
			environmentDigest: digest("7"),
			configurationDigest: digest("8"),
			termination: "exited",
			exitCode: 1,
			durationMs: 25,
		},
		provenanceRefs: ["test-run:materialization"],
		...overrides,
	});
}

function materialize(admitted = ingestion()) {
	return materializeStandardAdapterEvidence({
		ingestion: admitted,
		subject,
		observedAt: "2026-08-01T10:00:00.000Z",
	});
}

function obligation() {
	return createEvidenceObligation({
		id: "exact-test-command",
		version: EVIDENCE_OBLIGATION_VERSION,
		kinds: ["command_execution"],
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

describe("standard Evidence adapter materialization", () => {
	it("fixes Runtime authority and exact adapter provenance without granting a Result", () => {
		const admitted = ingestion();
		const bundle = materialize(admitted);
		const repeated = materialize(admitted);

		assert.deepEqual(
			{...bundle.protocol},
			STANDARD_ADAPTER_MATERIALIZATION_PROTOCOL,
		);
		assert.deepEqual({...bundle.adapterProtocol}, JUNIT_EVIDENCE_ADAPTER_PROTOCOL);
		assert.equal(bundle.adapterReceiptDigest, admitted.receiptDigest);
		assert.equal(bundle.adapterBindingDigest, admitted.bindingDigest);
		assert.equal(bundle.authority, "observed");
		assert.equal(bundle.coverage, "complete");
		assert.equal(bundle.grantsResult, false);
		assert.equal(bundle.evidenceRecords.length, 1);
		assert.equal(bundle.bundleDigest, repeated.bundleDigest);
		assert.deepEqual(bundle.evidenceRecordIds, repeated.evidenceRecordIds);

		const [record] = bundle.evidenceRecords;
		assert.equal(record?.producer.kind, "runtime");
		assert.equal(record?.producer.id, JUNIT_EVIDENCE_ADAPTER_PROTOCOL.id);
		assert.equal(record?.producer.version, JUNIT_EVIDENCE_ADAPTER_PROTOCOL.version);
		assert.equal(record?.authority, "observed");
		assert.equal(record?.coverage, "complete");
		assert.equal(record?.freshnessBoundary, sourceSnapshotDigest);
		assert.ok(
			record?.provenanceRefs.includes(
				adapterProtocolRef(JUNIT_EVIDENCE_ADAPTER_PROTOCOL),
			),
		);
		assert.ok(
			record?.provenanceRefs.includes(
				`evidence-adapter-receipt:${admitted.receiptDigest}`,
			),
		);
		assert.equal("result" in bundle, false);
		assert.equal("status" in bundle, false);
	});

	it("resolves exact complete Evidence while leaving test failure meaning to the Check", () => {
		const bundle = materialize();
		const resolution = resolveStandardAdapterEvidenceObligation({
			obligation: obligation(),
			bundles: [bundle],
			acceptedProtocols: [JUNIT_EVIDENCE_ADAPTER_PROTOCOL],
			expectedSubject: subject,
		});

		assert.equal(resolution.status, "ready");
		assert.deepEqual(resolution.supportingEvidenceIds, bundle.evidenceRecordIds);
		assert.equal(resolution.missingCount, 0);
		assert.equal(ingestion().summary.failureCount, 1);
	});

	it("keeps partial, unavailable, and wrong-protocol Evidence indeterminate", () => {
		for (const admitted of [
			ingestion({expectedTestCount: 3}),
			ingestion({
				execution: {
					adapterId: "codewiki.test.node",
					adapterVersion: "1.0.0",
					requestDigest: digest("5"),
					invocationDigest: digest("6"),
					environmentDigest: digest("7"),
					configurationDigest: digest("8"),
					termination: "unavailable",
					durationMs: 0,
				},
			}),
		]) {
			const resolution = resolveStandardAdapterEvidenceObligation({
				obligation: obligation(),
				bundles: [materialize(admitted)],
				acceptedProtocols: [JUNIT_EVIDENCE_ADAPTER_PROTOCOL],
				expectedSubject: subject,
			});
			assert.equal(resolution.status, "indeterminate");
			assert.equal(resolution.supportingEvidenceIds.length, 0);
			assert.ok(
				resolution.excludedEvidence[0]?.reasons.includes("coverage"),
			);
		}

		const wrongProtocol = resolveStandardAdapterEvidenceObligation({
			obligation: obligation(),
			bundles: [materialize()],
			acceptedProtocols: [SARIF_EVIDENCE_ADAPTER_PROTOCOL],
			expectedSubject: subject,
		});
		assert.equal(wrongProtocol.status, "indeterminate");
		assert.equal(wrongProtocol.supportingEvidenceIds.length, 0);
		assert.deepEqual(wrongProtocol.neutralEvidenceIds, materialize().evidenceRecordIds);
	});

	it("rejects source drift, receipt tampering, authority escalation, and bundle tampering", () => {
		const admitted = ingestion();
		assert.throws(
			() =>
				materializeStandardAdapterEvidence({
					ingestion: admitted,
					subject: {...subject, sourceTreeDigest: digest("f")},
					observedAt: "2026-08-01T10:00:00.000Z",
				}),
			/source snapshot does not match/,
		);
		assert.throws(
			() => materialize({...admitted, bindingDigest: digest("f")}),
			/receipt digest does not match/,
		);
		assert.throws(
			() => materialize({...admitted, authorityCeiling: "verified"}),
			/authority ceiling must be observed/,
		);

		const bundle = materialize(admitted);
		assert.throws(
			() =>
				resolveStandardAdapterEvidenceObligation({
					obligation: obligation(),
					bundles: [{...bundle, coverage: "unknown"}],
					acceptedProtocols: [JUNIT_EVIDENCE_ADAPTER_PROTOCOL],
					expectedSubject: subject,
				}),
			/bundle digest does not match/,
		);
	});
});

function digest(character) {
	return sha256Digest(Buffer.from(character.repeat(64)));
}
