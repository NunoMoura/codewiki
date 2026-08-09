import assert from "node:assert/strict";
import test from "node:test";
import { DECISION_RESEARCH_CLAIMS_PROTOCOL } from "../../../src/decision/exit/research-claims-protocol.ts";
import { createPiDecisionResearchClaimsTransport } from "../../../src/harnesses/pi/decision-research-claims-session.ts";
import { canonicalJsonDigest } from "../../../src/utils/canonical-json.ts";

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}

function researchEvidenceId(character = "1") {
	return `evidence:research_citation:${character.repeat(64)}`;
}

function request(overrides = {}) {
	const body = {
		schemaVersion: "1.0.0",
		protocolId: DECISION_RESEARCH_CLAIMS_PROTOCOL.id,
		protocolVersion: DECISION_RESEARCH_CLAIMS_PROTOCOL.version,
		checkId: "research_claims_supported",
		checkVersion: "1.0.0",
		candidateDigest: digest("a"),
		policyDigest: digest("b"),
		checkDigest: digest("c"),
		route: {
			id: "decision-research",
			provider: "test-provider",
			model: "test-model",
			thinking: "medium",
			timeoutMs: 1_000,
		},
		configurationDigest: digest("d"),
		researchEvidenceIds: [researchEvidenceId()],
		claims: [
			{
				claim: "Runtime owns aggregate Check status.",
				claimDigest: digest("e"),
				citations: [
					{
						evidenceId: researchEvidenceId(),
						claim: "Runtime owns aggregate Check status.",
						sourceUri: "https://example.test/runtime",
						title: "Runtime authority",
						publisher: "Example",
						publicationDate: "2026-07-20T00:00:00.000Z",
						passage: "Model observations do not grant Loop exit.",
						stance: "supporting",
						classification: "primary",
						limitations: [],
					},
				],
			},
		],
		inputLimits: {
			maxClaims: DECISION_RESEARCH_CLAIMS_PROTOCOL.inputLimits.maxClaims,
			maxCitations:
				DECISION_RESEARCH_CLAIMS_PROTOCOL.inputLimits.maxCitations,
			maxRequestBytes:
				DECISION_RESEARCH_CLAIMS_PROTOCOL.inputLimits.maxRequestBytes,
		},
		outputLimits: {
			maxFindings:
				DECISION_RESEARCH_CLAIMS_PROTOCOL.outputLimits.maxFindings,
			maxLimitations:
				DECISION_RESEARCH_CLAIMS_PROTOCOL.outputLimits.maxLimitations,
			maxResponseBytes:
				DECISION_RESEARCH_CLAIMS_PROTOCOL.outputLimits.maxResponseBytes,
		},
		...overrides,
	};
	return Object.freeze({ ...body, requestDigest: canonicalJsonDigest(body) });
}

function responseFor(preparedRequest, conclusion = "supported") {
	return {
		claimAssessments: preparedRequest.claims.map((claim) => ({
			claimDigest: claim.claimDigest,
			evidenceIds: claim.citations.map((citation) => citation.evidenceId),
			conclusion,
			findings:
				conclusion === "supported" ? [] : ["Claim requires independent repair."],
			limitations: [],
		})),
	};
}

test("Pi claim-support transport runs one isolated exact-request session", async () => {
	const preparedRequest = request();
	const calls = [];
	let disposed = false;
	const transport = createPiDecisionResearchClaimsTransport({
		repoRoot: process.cwd(),
		now: () => "2026-07-30T10:00:00.000Z",
		sessionFactory: async (input) => {
			calls.push(input);
			return {
				async prompt(prompt) {
					assert.match(prompt, /<response_schema>/);
					assert.match(prompt, new RegExp(preparedRequest.requestDigest));
				},
				readResponse: () => responseFor(preparedRequest),
				dispose() {
					disposed = true;
				},
			};
		},
	});

	const observation = await transport.execute(preparedRequest);
	assert.equal(observation.status, "completed");
	assert.equal(observation.requestDigest, preparedRequest.requestDigest);
	assert.equal(observation.observedAt, "2026-07-30T10:00:00.000Z");
	assert.deepEqual(observation.response, responseFor(preparedRequest));
	assert.equal(calls.length, 1);
	assert.equal(calls[0].request, preparedRequest);
	assert.match(calls[0].systemPrompt, /Use no tools/);
	assert.match(calls[0].systemPrompt, /Do not return an aggregate verdict/);
	assert.equal(disposed, true);
});

test("default Pi factory disables all tools and discovery and selects exact route", async () => {
	const preparedRequest = request();
	const selectedModel = { provider: "test-provider", id: "test-model" };
	let sdkOptions;
	let listener;
	let unsubscribed = false;
	const modelRuntime = {
		getModel(provider, model) {
			assert.equal(provider, preparedRequest.route.provider);
			assert.equal(model, preparedRequest.route.model);
			return selectedModel;
		},
	};
	const transport = createPiDecisionResearchClaimsTransport({
		repoRoot: process.cwd(),
		modelRuntime,
		now: () => "2026-07-30T10:01:00.000Z",
		createAgentSession: async (options) => {
			sdkOptions = options;
			return {
				session: {
					subscribe(next) {
						listener = next;
						return () => {
							unsubscribed = true;
						};
					},
					async prompt() {
						listener({
							type: "message_update",
							assistantMessageEvent: {
								type: "text_delta",
								delta: JSON.stringify(responseFor(preparedRequest)),
							},
						});
					},
					async abort() {},
					dispose() {},
				},
				extensionsResult: { extensions: [], errors: [], runtime: undefined },
			};
		},
	});

	const observation = await transport.execute(preparedRequest);
	assert.equal(observation.status, "completed");
	assert.equal(sdkOptions.modelRuntime, modelRuntime);
	assert.equal(sdkOptions.model, selectedModel);
	assert.equal(sdkOptions.thinkingLevel, preparedRequest.route.thinking);
	assert.equal(sdkOptions.noTools, "all");
	assert.deepEqual(sdkOptions.tools, []);
	assert.deepEqual(sdkOptions.customTools, []);
	assert.deepEqual(sdkOptions.resourceLoader.getExtensions().extensions, []);
	assert.deepEqual(sdkOptions.resourceLoader.getSkills().skills, []);
	assert.deepEqual(sdkOptions.resourceLoader.getPrompts().prompts, []);
	assert.deepEqual(sdkOptions.resourceLoader.getAgentsFiles().agentsFiles, []);
	assert.equal(unsubscribed, true);
});

test("Pi claim-support transport maps timeout, cancellation, provider failure, and unavailable model", async () => {
	const timeoutRequest = request({
		route: { ...request().route, timeoutMs: 20 },
	});
	let aborted = false;
	const timeoutTransport = createPiDecisionResearchClaimsTransport({
		repoRoot: process.cwd(),
		sessionFactory: async () => ({
			prompt: () => new Promise(() => {}),
			readResponse: () => ({}),
			abort() {
				aborted = true;
			},
			dispose() {},
		}),
	});
	assert.equal((await timeoutTransport.execute(timeoutRequest)).status, "timeout");
	assert.equal(aborted, true);

	let cancellationAborted = false;
	const cancellingTransport = createPiDecisionResearchClaimsTransport({
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
	const cancelled = cancellingTransport.execute(request(), {
		signal: controller.signal,
	});
	await new Promise((resolve) => setImmediate(resolve));
	controller.abort();
	assert.equal((await cancelled).status, "cancelled");
	assert.equal(cancellationAborted, true);

	const failedTransport = createPiDecisionResearchClaimsTransport({
		repoRoot: process.cwd(),
		sessionFactory: async () => {
			throw new Error("provider secret must not escape");
		},
	});
	assert.deepEqual(await failedTransport.execute(request()), {
		status: "provider_failure",
		requestDigest: request().requestDigest,
	});

	const unavailableTransport = createPiDecisionResearchClaimsTransport({
		repoRoot: process.cwd(),
		modelRuntime: { getModel: () => undefined },
		createAgentSession: async () => {
			throw new Error("must not create session without exact model");
		},
	});
	assert.equal((await unavailableTransport.execute(request())).status, "unavailable");
});

test("default Pi transport treats non-JSON model text as malformed completed output", async () => {
	const preparedRequest = request();
	const transport = createPiDecisionResearchClaimsTransport({
		repoRoot: process.cwd(),
		modelRuntime: { getModel: () => ({ provider: "test-provider", id: "test-model" }) },
		now: () => "2026-07-30T10:02:00.000Z",
		createAgentSession: async () => ({
			session: {
				subscribe(listener) {
					this.listener = listener;
					return () => {};
				},
				async prompt() {
					this.listener({
						type: "message_update",
						assistantMessageEvent: {
							type: "text_delta",
							delta: "```json not accepted```",
						},
					});
				},
				async abort() {},
				dispose() {},
			},
			extensionsResult: { extensions: [], errors: [], runtime: undefined },
		}),
	});

	const observation = await transport.execute(preparedRequest);
	assert.equal(observation.status, "completed");
	assert.deepEqual(observation.response, {});
});

test("Pi claim-support transport rejects a tampered prepared request before model work", async () => {
	let created = false;
	const transport = createPiDecisionResearchClaimsTransport({
		repoRoot: process.cwd(),
		sessionFactory: async () => {
			created = true;
			throw new Error("must not run");
		},
	});
	const preparedRequest = request();
	await assert.rejects(
		transport.execute({ ...preparedRequest, candidateDigest: digest("f") }),
		/request digest is invalid/,
	);
	assert.equal(created, false);
});
