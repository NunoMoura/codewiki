import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	assertUserStandardSourceReceipt,
	assertUserStandardSourceRequest,
	createUserStandardSourceRequest,
	retrieveUserStandardSource,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";

const NOW = () => new Date("2026-08-02T10:00:00.000Z");
const RETRIEVER_BINDING = Object.freeze({
	id: "company.policy-source",
	version: "1.2.0",
	configurationDigest: canonicalJsonDigest({connector: "public-https"}),
});

describe("User Standard source retrieval", () => {
	it("normalizes bounded inline text into an exact Runtime-owned snapshot receipt", async () => {
		const request = createUserStandardSourceRequest({
			kind: "inline",
			mediaType: "text/markdown",
			content: "# Policy\r\nEvery public API names an owner.  ",
		});
		const receipt = await retrieveUserStandardSource({request, now: NOW});

		assert.equal(request.protocolVersion, "1.0.0");
		assert.equal(request.selection.content.includes("\r"), false);
		assert.equal(receipt.status, "retrieved");
		assert.equal(receipt.source.observedAt, "2026-08-02T10:00:00.000Z");
		assert.equal(receipt.source.content, "# Policy\nEvery public API names an owner.");
		assert.match(receipt.source.contentDigest, /^sha256:[0-9a-f]{64}$/);
		assert.match(receipt.receiptId, /^user-standard-source-receipt:[0-9a-f]{64}$/);
		assert.doesNotThrow(() => assertUserStandardSourceRequest(request));
		assert.doesNotThrow(() => assertUserStandardSourceReceipt(receipt));
	});

	it("uses one credential-isolated URL retriever and rejects source substitution", async () => {
		const request = createUserStandardSourceRequest({
			kind: "url",
			uri: "https://standards.example.com/api.md",
		});
		const calls = [];
		const urlRetriever = {
			binding: RETRIEVER_BINDING,
			async retrieve(input) {
				calls.push(input);
				return {
					status: "retrieved",
					mediaType: "text/markdown",
					content: "# API policy\nEvery public API names an owner.",
					uri: input.uri,
				};
			},
		};
		const receipt = await retrieveUserStandardSource({
			request,
			urlRetriever,
			now: NOW,
		});

		assert.equal(receipt.status, "retrieved");
		assert.equal(receipt.source.uri, request.selection.uri);
		assert.deepEqual(receipt.retriever, RETRIEVER_BINDING);
		assert.deepEqual(calls, [{uri: request.selection.uri, maxBytes: 131_072}]);

		const substituted = await retrieveUserStandardSource({
			request,
			now: NOW,
			urlRetriever: {
				binding: RETRIEVER_BINDING,
				async retrieve() {
					return {
						status: "retrieved",
						mediaType: "text/markdown",
						content: "Other source",
						uri: "https://attacker.example/policy",
					};
				},
			},
		});
		assert.equal(substituted.status, "unavailable");
		assert.equal(substituted.reason, "malformed_response");
	});

	it("preserves unavailable, failed, malformed, and cancelled retrieval states", async () => {
		const request = createUserStandardSourceRequest({
			kind: "url",
			uri: "https://standards.example.com/security.md",
		});
		const unavailable = await retrieveUserStandardSource({request, now: NOW});
		assert.equal(unavailable.reason, "temporarily_unavailable");
		assert.equal(unavailable.source, null);

		const failed = await retrieveUserStandardSource({
			request,
			now: NOW,
			urlRetriever: {
				binding: RETRIEVER_BINDING,
				async retrieve() {
					throw new Error("private provider detail");
				},
			},
		});
		assert.equal(failed.reason, "provider_failure");
		assert.equal(JSON.stringify(failed).includes("private provider detail"), false);

		const malformed = await retrieveUserStandardSource({
			request,
			now: NOW,
			urlRetriever: {
				binding: RETRIEVER_BINDING,
				async retrieve() {
					return {status: "retrieved", mediaType: "text/html", content: "x", uri: request.selection.uri};
				},
			},
		});
		assert.equal(malformed.reason, "malformed_response");

		const controller = new AbortController();
		controller.abort();
		const cancelled = await retrieveUserStandardSource({
			request,
			now: NOW,
			signal: controller.signal,
			urlRetriever: {
				binding: RETRIEVER_BINDING,
				async retrieve() {
					throw new Error("must not run");
				},
			},
		});
		assert.equal(cancelled.reason, "cancelled");
	});

	it("rejects unsafe requests and tampered authority-bearing receipts", async () => {
		assert.throws(
			() => createUserStandardSourceRequest({kind: "url", uri: "http://example.com/policy"}),
			/HTTPS URI/,
		);
		assert.throws(
			() => createUserStandardSourceRequest({kind: "url", uri: "https://user:secret@example.com/policy"}),
			/cannot contain credentials/,
		);
		assert.throws(
			() =>
				createUserStandardSourceRequest({
					kind: "inline",
					mediaType: "text/markdown",
					content: "access_token=abcdefgh12345678",
				}),
			/credential-like private data/,
		);

		const request = createUserStandardSourceRequest({
			kind: "inline",
			mediaType: "text/plain",
			content: "Every release must be reproducible.",
		});
		const receipt = await retrieveUserStandardSource({request, now: NOW});
		assert.throws(
			() => assertUserStandardSourceRequest({...request, traceId: "forbidden"}),
			/unsupported field traceId/,
		);
		assert.throws(
			() => assertUserStandardSourceReceipt({...receipt, recordedAt: "2026-08-03T10:00:00.000Z"}),
			/snapshot is invalid/,
		);
	});
});
