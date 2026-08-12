import assert from "node:assert/strict";
import {test} from "node:test";

import {DECISION_MODEL_CHECK_REQUEST_PROTOCOL} from "../../../src/decision/exit/model-checks.ts";
import {createPiDecisionModelCheckTransport} from "../../../src/execution/pi/decision-model-check-session.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;

function request() {
	const body = {
		protocolId: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id,
		protocolVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
		candidate: {
			schemaVersion: 1,
			loop: "decision",
			content: {disposition: "approve"},
			observedBase: {
				workStateDigest: digest("1"),
				knowledgeSnapshotDigest: digest("2"),
				canonicalRefs: ["change:CHG-pi-model"],
			},
			digest: digest("3"),
		},
		check: {
			id: "intention_validated",
			version: "1.0.0",
			digest: digest("4"),
			description: "Validate intention.",
			requirement: "Intent is unambiguous and complete.",
		},
		route: {
			id: "decision-model",
			provider: "test-provider",
			model: "test-model",
			thinking: "high",
		},
		configurationDigest: digest("5"),
		review: {
			mode: "balanced",
			consideredEvidenceIds: [],
			evidenceRecords: [],
			dependencyResults: [],
			securitySurfaceClassification: null,
		},
	};
	return {...body, requestDigest: canonicalJsonDigest(body)};
}

function response(preparedRequest) {
	return {
		protocolId: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id,
		protocolVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
		requestDigest: preparedRequest.requestDigest,
		checkId: preparedRequest.check.id,
		checkVersion: preparedRequest.check.version,
		conclusion: "supported",
		consideredEvidenceIds: [],
		findings: ["Intent is grounded."],
		limitations: [],
	};
}

test("Pi Decision Model Check transport runs one isolated exact-request session", async () => {
	const preparedRequest = request();
	const calls = [];
	const prompts = [];
	let disposed = false;
	const transport = createPiDecisionModelCheckTransport({
		repoRoot: process.cwd(),
		now: () => "2026-07-30T11:00:00.000Z",
		sessionFactory: async (input) => {
			calls.push(input);
			return {
				async prompt(prompt) {
					prompts.push(prompt);
				},
				readResponse: () => response(input.request),
				dispose() {
					disposed = true;
				},
			};
		},
	});
	const observation = await transport.execute(preparedRequest, {
		signal: new AbortController().signal,
		timeoutMs: 60_000,
	});
	assert.equal(observation.status, "completed");
	assert.equal(observation.observedAt, "2026-07-30T11:00:00.000Z");
	assert.deepEqual(observation.response, response(preparedRequest));
	assert.equal(calls.length, 1);
	assert.equal(calls[0].request, preparedRequest);
	assert.match(calls[0].systemPrompt, /Use no tools/);
	assert.match(prompts[0], new RegExp(preparedRequest.requestDigest));
	assert.equal(disposed, true);
});

test("Pi Decision Model Check transport maps bounded operational outcomes", async () => {
	const preparedRequest = request();
	let timeoutAborted = false;
	const timeoutTransport = createPiDecisionModelCheckTransport({
		repoRoot: process.cwd(),
		sessionFactory: async () => ({
			prompt: () => new Promise(() => {}),
			readResponse: () => ({}),
			abort() {
				timeoutAborted = true;
			},
			dispose() {},
		}),
	});
	const timeout = await timeoutTransport.execute(preparedRequest, {
		signal: new AbortController().signal,
		timeoutMs: 20,
	});
	assert.equal(timeout.status, "timeout");
	assert.equal(timeoutAborted, true);

	let cancellationAborted = false;
	const cancellingTransport = createPiDecisionModelCheckTransport({
		repoRoot: process.cwd(),
		sessionFactory: async () => ({
			prompt: () => new Promise(() => {}),
			readResponse: () => ({}),
			abort() {
				cancellationAborted = true;
			},
			dispose() {},
		}),
	});
	const controller = new AbortController();
	const cancelled = cancellingTransport.execute(preparedRequest, {
		signal: controller.signal,
		timeoutMs: 60_000,
	});
	await new Promise((resolve) => setImmediate(resolve));
	controller.abort();
	assert.equal((await cancelled).status, "cancelled");
	assert.equal(cancellationAborted, true);

	const failedTransport = createPiDecisionModelCheckTransport({
		repoRoot: process.cwd(),
		sessionFactory: async () => {
			throw new Error("provider secret must not escape");
		},
	});
	const failed = await failedTransport.execute(preparedRequest, {
		signal: new AbortController().signal,
		timeoutMs: 60_000,
	});
	assert.equal(failed.status, "provider_failure");
	assert.equal("error" in failed, false);
});

test("Pi Decision Model Check transport fails closed before model work", async () => {
	let created = false;
	const transport = createPiDecisionModelCheckTransport({
		repoRoot: process.cwd(),
		sessionFactory: async () => {
			created = true;
			throw new Error("must not run");
		},
	});
	await assert.rejects(
		transport.execute(
			{...request(), requestDigest: digest("0")},
			{signal: new AbortController().signal, timeoutMs: 60_000},
		),
		/request digest is invalid/,
	);
	assert.equal(created, false);
	await assert.rejects(
		transport.execute(request(), {
			signal: new AbortController().signal,
			timeoutMs: 0,
		}),
		/timeout is invalid/,
	);
});
