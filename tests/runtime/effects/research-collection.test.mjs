import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	DECISION_RESEARCH_COLLECTION_PROTOCOL,
	collectDecisionResearchEvidence,
} from "../../../src/runtime/effects/research-collection.ts";
import {
	nativeDecisionCandidate,
	nativeDecisionRevision,
	nativeDecisionState,
} from "../../helpers/native-decision.mjs";

const digest = (value) => `sha256:${value.repeat(64)}`;

function fixture() {
	const changeId = "CHG-decision-research-collection";
	const revision = nativeDecisionRevision({changeId, risk: "high"});
	const candidate = nativeDecisionCandidate({
		state: nativeDecisionState([{changeId, revision}]),
		changeId,
	});
	return {
		candidate,
		subject: {
			changeRefs: [`change:${changeId}`],
			changeRevisionDigests: [revision.revisionId],
			acceptanceRequirementIds: [],
		},
	};
}

function citation() {
	return {
		provenanceRefs: ["source:https://example.test/runtime"],
		payload: {
			claim: "Provider supports bounded retries.",
			classification: "primary",
			publisher: "Example Provider",
			uri: "https://example.test/runtime",
			title: "Runtime limits",
			publicationDate: "2026-07-01",
			passageDigest: digest("8"),
			passageLocator: "section:retries",
			stance: "supports",
			limitations: [],
		},
	};
}

function collector(collect) {
	return {
		id: "trusted-research-connector",
		version: "1.0.0",
		configurationDigest: digest("7"),
		collect,
	};
}

describe("Decision research collection", () => {
	it("binds one trusted collection receipt and materializes Runtime-owned citation Evidence", async () => {
		const setup = fixture();
		let request;
		const result = await collectDecisionResearchEvidence({
			...setup,
			collector: collector(async (input) => {
				request = input.request;
				return {
					protocol: DECISION_RESEARCH_COLLECTION_PROTOCOL,
					requestDigest: input.request.requestDigest,
					status: "available",
					citations: [citation()],
				};
			}),
			sensitivity: "project",
			observedAt: () => "2026-08-03T10:00:00.000Z",
			signal: new AbortController().signal,
		});
		assert.equal(request.candidate.digest, setup.candidate.digest);
		assert.equal(request.maximumCitations, 32);
		assert.equal(request.maximumReceiptBytes, 262_144);
		assert.equal(request.timeoutMs, 30_000);
		assert.deepEqual(request.protocol, DECISION_RESEARCH_COLLECTION_PROTOCOL);
		assert.match(request.requestDigest, /^sha256:[0-9a-f]{64}$/);
		assert.equal(result.status, "available");
		assert.match(result.freshnessBoundary, /^sha256:[0-9a-f]{64}$/);
		assert.equal(result.evidenceRecords.length, 1);
		const evidence = result.evidenceRecords[0];
		assert.equal(evidence.authority, "observed");
		assert.equal(evidence.coverage, "complete");
		assert.equal(evidence.freshnessBoundary, result.freshnessBoundary);
		assert.deepEqual(JSON.parse(JSON.stringify(evidence.producer)), {
			kind: "external_service",
			id: "trusted-research-connector",
			version: "1.0.0",
		});
		assert.ok(
			evidence.provenanceRefs.includes(
				`collector-request:${request.requestDigest}`,
			),
		);
		assert.ok(
			evidence.provenanceRefs.some((ref) =>
				ref.startsWith("collector-receipt:sha256:"),
			),
		);
	});

	it("keeps unavailable and malformed collection fail-closed without citation Evidence", async () => {
		const setup = fixture();
		const unavailable = await collectDecisionResearchEvidence({
			...setup,
			collector: collector(async () => {
				throw new Error("provider unavailable");
			}),
			sensitivity: "private",
			observedAt: () => "2026-08-03T10:01:00.000Z",
			signal: new AbortController().signal,
		});
		assert.equal(unavailable.status, "unavailable");
		assert.deepEqual(unavailable.evidenceRecords, []);

		const cancelledSignal = new AbortController();
		cancelledSignal.abort(new Error("cancelled"));
		const cancelled = await collectDecisionResearchEvidence({
			...setup,
			collector: collector(
				async () => new Promise(() => undefined),
			),
			sensitivity: "private",
			observedAt: () => "2026-08-03T10:01:30.000Z",
			signal: cancelledSignal.signal,
		});
		assert.equal(cancelled.status, "unavailable");
		assert.deepEqual(cancelled.evidenceRecords, []);

		const malformed = await collectDecisionResearchEvidence({
			...setup,
			collector: collector(async ({request}) => ({
				protocol: DECISION_RESEARCH_COLLECTION_PROTOCOL,
				requestDigest: request.requestDigest,
				status: "available",
				citations: [],
			})),
			sensitivity: "private",
			observedAt: () => "2026-08-03T10:02:00.000Z",
			signal: new AbortController().signal,
		});
		assert.equal(malformed.status, "malformed");
		assert.deepEqual(malformed.evidenceRecords, []);

		const duplicate = await collectDecisionResearchEvidence({
			...setup,
			collector: collector(async ({request}) => ({
				protocol: DECISION_RESEARCH_COLLECTION_PROTOCOL,
				requestDigest: request.requestDigest,
				status: "available",
				citations: [citation(), citation()],
			})),
			sensitivity: "private",
			observedAt: () => "2026-08-03T10:02:00.000Z",
			signal: new AbortController().signal,
		});
		assert.equal(duplicate.status, "malformed");
		assert.deepEqual(duplicate.evidenceRecords, []);
	});

	it("rejects caller-owned subject and collector binding drift", async () => {
		const setup = fixture();
		await assert.rejects(
			collectDecisionResearchEvidence({
				...setup,
				subject: {...setup.subject, candidateDigest: setup.candidate.digest},
				collector: collector(async () => undefined),
				sensitivity: "project",
				observedAt: () => "2026-08-03T10:03:00.000Z",
				signal: new AbortController().signal,
			}),
			/not the exact Change revision/,
		);
		await assert.rejects(
			collectDecisionResearchEvidence({
				...setup,
				collector: {...collector(async () => undefined), ambientToken: "secret"},
				sensitivity: "project",
				observedAt: () => "2026-08-03T10:03:00.000Z",
				signal: new AbortController().signal,
			}),
			/unsupported field ambientToken/,
		);
	});
});
