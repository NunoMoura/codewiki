import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL,
	ingestProviderCheckReceiptEvidence,
} from "../../src/evidence/adapters/provider-check-receipt.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
} from "../../src/utils/canonical-json.ts";

const providerInstanceDigest = digest("1");
const repositoryIdDigest = digest("2");
const sourceSnapshotDigest = digest("3");
const checkIdentityDigest = digest("4");
const checkConfigurationDigest = digest("5");
const authenticatedIdentityDigest = digest("6");
const credentialBindingDigest = digest("7");
const requestDigest = digest("8");
const invocationDigest = digest("9");
const environmentDigest = digest("a");
const adapterConfigurationDigest = digest("b");
const providerCheckIdDigest = digest("c");
const providerCheckSuiteIdDigest = digest("d");
const providerPayloadDigest = digest("e");
const outputDigest = digest("f");
const candidateDigest = digest("0");
const revisionDigest = digest("a");
const sourceTreeDigest = digest("b");
const headCommit = "c".repeat(40);

const authentication = Object.freeze({
	method: "authenticated_api",
	authenticatedIdentityDigest,
	credentialBindingDigest,
});

const execution = Object.freeze({
	adapterId: "codewiki.provider.github-checks",
	adapterVersion: "1.0.0",
	requestDigest,
	invocationDigest,
	environmentDigest,
	configurationDigest: adapterConfigurationDigest,
	termination: "exited",
	exitCode: 0,
	durationMs: 84,
});

function document(overrides = {}) {
	const value = {
		protocolId: PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL.id,
		protocolVersion: PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL.version,
		providerId: "github",
		providerInstanceDigest,
		repositoryIdDigest,
		sourceSnapshotDigest,
		headCommit,
		checkIdentityDigest,
		checkConfigurationDigest,
		authenticationDigest: canonicalJsonDigest(authentication),
		adapterId: execution.adapterId,
		adapterVersion: execution.adapterVersion,
		requestDigest,
		executionDigest: canonicalJsonDigest(execution),
		providerCheckIdDigest,
		providerCheckSuiteIdDigest,
		providerPayloadDigest,
		attempt: 2,
		state: "completed",
		conclusion: "success",
		startedAt: "2026-08-05T10:00:00.000Z",
		completedAt: "2026-08-05T10:02:03.000Z",
		outputDigest,
		annotationCount: 3,
	};
	for (const [key, item] of Object.entries(overrides)) {
		if (item === undefined) delete value[key];
		else value[key] = item;
	}
	return value;
}

function receiptBytes(overrides = {}) {
	return canonicalJson(document(overrides));
}

function input(bytes = receiptBytes(), overrides = {}) {
	return {
		artifact: {
			bytes,
			ref: "provider-receipt:github/checks/sha256-abc",
		},
		provider: {providerId: "github", providerInstanceDigest},
		repositoryIdDigest,
		sourceSnapshotDigest,
		headCommit,
		checkIdentityDigest,
		checkConfigurationDigest,
		authentication,
		execution,
		provenanceRefs: ["provider-request:github/checks/sha256-def"],
		...overrides,
	};
}

function runtime(coverage) {
	return {
		subject: {
			changeRefs: ["TRACE-CHG-provider-check-receipt"],
			changeRevisionDigests: [revisionDigest],
			candidateDigest,
			acceptanceRequirementIds: [],
			sourceTreeDigest,
		},
		observedAt: "2026-08-05T10:03:00.000Z",
		producer: {
			kind: "external_service",
			id: "github-checks",
			version: "1.0.0",
		},
		authority: "verified",
		coverage,
		freshnessBoundary: "2026-08-05T10:03:00.000Z",
		sensitivity: "project",
	};
}

describe("authenticated Provider Check receipt Evidence adapter", () => {
	it("binds exact authenticated provider facts without granting a Result", () => {
		const success = ingestProviderCheckReceiptEvidence(input());
		const failure = ingestProviderCheckReceiptEvidence(
			input(
				receiptBytes({
					conclusion: "failure",
					providerPayloadDigest: digest("0"),
				}),
			),
		);

		assert.deepEqual(
			{...success.protocol},
			PROVIDER_CHECK_RECEIPT_EVIDENCE_ADAPTER_PROTOCOL,
		);
		assert.equal(success.authorityCeiling, "verified");
		assert.equal(success.grantsResult, false);
		assert.equal(success.coverage, "complete");
		assert.equal(success.summary.state, "completed");
		assert.equal(success.summary.conclusion, "success");
		assert.equal(success.summary.providerDurationMs, 123_000);
		assert.equal(success.summary.annotationCount, 3);
		assert.equal(success.commandExecution.kind, "command_execution");
		assert.equal(success.commandExecution.payload.termination, "exited");
		assert.equal(success.commandExecution.payload.exitCode, 0);
		assert.equal(success.commandExecution.payload.stdoutDigest, providerPayloadDigest);
		assert.ok(
			success.commandExecution.payload.diagnosticRefs.includes(
				"provider-check/conclusion/success",
			),
		);
		assert.equal(failure.coverage, "complete");
		assert.equal(failure.summary.conclusion, "failure");
		assert.equal(failure.commandExecution.payload.exitCode, 0);
		assert.equal("result" in success, false);
		assert.equal("verdict" in success, false);

		const record = materializeEvidenceRecord(
			success.commandExecution,
			runtime(success.coverage),
		);
		assert.equal(record.authority, "verified");
		assert.equal(record.coverage, "complete");
		assert.equal(record.producer.kind, "external_service");
		assert.equal(record.artifact?.mediaType, "application/vnd.codewiki.provider-check-receipt+json");

		const replay = ingestProviderCheckReceiptEvidence(input());
		assert.equal(replay.receiptDigest, success.receiptDigest);
		assert.deepEqual(replay, success);
	});

	it("preserves pending and unavailable provider observations", () => {
		const queued = ingestProviderCheckReceiptEvidence(
			input(
				receiptBytes({
					state: "queued",
					conclusion: undefined,
					startedAt: undefined,
					completedAt: undefined,
					outputDigest: undefined,
				}),
			),
		);
		assert.equal(queued.coverage, "partial");
		assert.equal(queued.summary.state, "queued");
		assert.equal(queued.summary.conclusion, undefined);

		const unavailableExecution = {
			adapterId: execution.adapterId,
			adapterVersion: execution.adapterVersion,
			requestDigest: execution.requestDigest,
			invocationDigest: execution.invocationDigest,
			environmentDigest: execution.environmentDigest,
			configurationDigest: execution.configurationDigest,
			termination: "unavailable",
			durationMs: execution.durationMs,
		};
		const unavailable = ingestProviderCheckReceiptEvidence(
			input(
				receiptBytes({
					providerCheckIdDigest: undefined,
					providerCheckSuiteIdDigest: undefined,
					providerPayloadDigest: undefined,
					attempt: undefined,
					state: "unavailable",
					conclusion: undefined,
					startedAt: undefined,
					completedAt: undefined,
					outputDigest: undefined,
					annotationCount: undefined,
					executionDigest: canonicalJsonDigest(unavailableExecution),
				}),
				{execution: unavailableExecution},
			),
		);
		assert.equal(unavailable.coverage, "unknown");
		assert.deepEqual({...unavailable.summary}, {state: "unavailable"});
		assert.equal(unavailable.commandExecution.payload.termination, "unavailable");
	});

	it("rejects caller authority, credentials, drift, malformed receipts, and contradictory state", () => {
		assert.throws(
			() => ingestProviderCheckReceiptEvidence({...input(), authority: "verified"}),
			/ingestion received unsupported field authority/,
		);
		assert.throws(
			() =>
				ingestProviderCheckReceiptEvidence({
					...input(),
					authentication: {...authentication, token: "private-token"},
				}),
			/authentication received unsupported field token/,
		);
		assert.throws(
			() =>
				ingestProviderCheckReceiptEvidence({
					...input(),
					execution: {...execution, adapterId: "Bearer private-token"},
				}),
			/adapterId is invalid/,
		);
		assert.throws(
			() =>
				ingestProviderCheckReceiptEvidence(
					input(canonicalJson({...document(), result: "pass"})),
				),
			/document received unsupported field result/,
		);
		assert.throws(
			() => ingestProviderCheckReceiptEvidence(input(` ${receiptBytes()}`)),
			/strict canonical JSON without duplicate keys/,
		);
		const duplicate = receiptBytes().replace(
			'"providerId":"github"',
			'"providerId":"github","providerId":"github"',
		);
		assert.throws(
			() => ingestProviderCheckReceiptEvidence(input(duplicate)),
			/strict canonical JSON without duplicate keys/,
		);
		assert.throws(
			() => ingestProviderCheckReceiptEvidence(input(new Uint8Array([0xff]))),
			/must be valid UTF-8 JSON/,
		);
		assert.throws(
			() => ingestProviderCheckReceiptEvidence(input("x".repeat(65_537))),
			/must contain 1..65536 UTF-8 bytes/,
		);

		for (const [label, override] of [
			["provider", {providerId: "gitlab"}],
			["repository", {repositoryIdDigest: digest("f")}],
			["source snapshot", {sourceSnapshotDigest: digest("f")}],
			["head commit", {headCommit: "d".repeat(40)}],
			["check identity", {checkIdentityDigest: digest("f")}],
			["check configuration", {checkConfigurationDigest: digest("f")}],
			["authentication", {authenticationDigest: digest("f")}],
			["adapter", {adapterId: "different.adapter"}],
			["request", {requestDigest: digest("f")}],
		]) {
			assert.throws(
				() => ingestProviderCheckReceiptEvidence(input(receiptBytes(override))),
				new RegExp(`${label} does not match the Runtime binding`),
			);
		}

		assert.throws(
			() =>
				ingestProviderCheckReceiptEvidence(
					input(receiptBytes({completedAt: undefined})),
				),
			/Completed Provider Check receipt requires timing and conclusion/,
		);
		assert.throws(
			() =>
				ingestProviderCheckReceiptEvidence(
					input(receiptBytes({completedAt: "2026-08-05T09:59:59.000Z"})),
				),
			/completedAt precedes startedAt/,
		);
		const failedRetrieval = {...execution, exitCode: 1};
		assert.throws(
			() =>
				ingestProviderCheckReceiptEvidence(
					input(
						receiptBytes({
							executionDigest: canonicalJsonDigest(failedRetrieval),
						}),
						{execution: failedRetrieval},
					),
				),
			/requires successful authenticated retrieval/,
		);
	});
});

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}
