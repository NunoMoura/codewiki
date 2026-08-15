import test from "node:test";
import assert from "node:assert/strict";
import {createPiModelCheckTransport} from "../../../src/execution/pi/decision-model-check-session.ts";
import {createModelCheckRequest} from "../../../src/execution/checks/model.ts";
import {
	assembleCheckInvocation,
	subjectInputSelection,
} from "../../../src/checks/protocol.ts";
import {
	checkSnapshot,
	checkSubject,
	packagedCheck,
} from "../../helpers/checks.mjs";

function request() {
	const check = packagedCheck({
		definition: {
			id: "pi-model-check",
			implementation: {
				kind: "model",
				route: "independent-route",
				profile: "review-model",
				maximumTokens: 1024,
			},
		},
		implementationContent: [
			"# Requirement",
			"Assess bounded subject.",
			"# Pass",
			"Subject satisfies requirement.",
			"# Fail",
			"Subject does not satisfy requirement.",
			"# Feedback",
			"State missing supplied fact.",
		].join("\n"),
	});
	const snapshot = checkSnapshot([check]);
	const subject = checkSubject();
	const invocation = assembleCheckInvocation({
		subject,
		snapshot,
		check,
		inputs: [subjectInputSelection(subject, check.definition.inputs[0])],
	});
	return createModelCheckRequest({check, invocation});
}

function response(prepared) {
	return {
		protocolId: "codewiki.check-output",
		protocolVersion: "1.0.0",
		invocationDigest: prepared.invocation.invocationDigest,
		measurement: {kind: "binary", value: true},
		summary: "Passed.",
		details: [],
	};
}

function route(timeoutMs = 1000) {
	return {
		id: "independent-route",
		provider: "test-provider",
		model: "test-model",
		thinking: "high",
		quality: "high",
		latency: "balanced",
		timeoutMs,
		pricing: {
			inputUsdPerMillion: 0,
			outputUsdPerMillion: 0,
			cacheReadUsdPerMillion: 0,
			cacheWriteUsdPerMillion: 0,
		},
		allowedTools: [],
	};
}

test("Pi Model Check transport runs one tool-free isolated structured-output session", async () => {
	const prepared = request();
	const calls = [];
	const prompts = [];
	let disposed = false;
	const transport = createPiModelCheckTransport({
		repoRoot: process.cwd(),
		resolveRoute: () => route(),
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
	const output = await transport(prepared, new AbortController().signal);
	assert.deepEqual(output, response(prepared));
	assert.equal(calls.length, 1);
	assert.match(calls[0].systemPrompt, /Use no tools/);
	assert.match(prompts[0], new RegExp(prepared.requestDigest));
	assert.equal(disposed, true);
});

test("Pi Model Check transport surfaces timeout and cancellation as operational stops", async () => {
	const prepared = request();
	let aborted = false;
	const timeoutTransport = createPiModelCheckTransport({
		repoRoot: process.cwd(),
		resolveRoute: () => route(20),
		sessionFactory: async () => ({
			prompt: () => new Promise(() => {}),
			readResponse: () => ({}),
			abort() {
				aborted = true;
			},
			dispose() {},
		}),
	});
	await assert.rejects(
		() => timeoutTransport(prepared, new AbortController().signal),
		/transport stopped: timeout/,
	);
	assert.equal(aborted, true);

	const controller = new AbortController();
	const cancelled = timeoutTransport(prepared, controller.signal);
	await new Promise((resolve) => setImmediate(resolve));
	controller.abort();
	await assert.rejects(() => cancelled, /transport stopped: cancelled/);
});

test("Pi Model Check route identity must match Pack-selected route", async () => {
	const prepared = request();
	const transport = createPiModelCheckTransport({
		repoRoot: process.cwd(),
		resolveRoute: () => ({...route(), id: "worker-route"}),
		sessionFactory: async () => {
			throw new Error("must not start");
		},
	});
	await assert.rejects(
		() => transport(prepared, new AbortController().signal),
		/route identity does not match/,
	);
});
