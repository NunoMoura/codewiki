import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	assertUserStandardDistillationReceipt,
	assertUserStandardDistillationRequest,
	createUserStandardDistillationRequest,
	createUserStandardSourceRequest,
	materializeUserStandardDistillationBundle,
	retrieveUserStandardSource,
	runUserStandardDistillation,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";

const NOW = () => new Date("2026-08-03T10:00:00.000Z");
const SOURCE = [
	"# Company delivery standard",
	"Every accepted Change states the observed problem.",
	"Every changed public API names its accountable owner.",
	"All changed user interfaces must pass the approved accessibility scanner.",
	"Security incidents receive earlier Decision attention than cosmetic requests.",
	"One worker attempt may consume at most 5000 model tokens.",
	"The legacy escalation rule contradicts the current owner policy.",
].join("\n");
const DEFAULT_CHECK = Object.freeze({
	id: "problem_framed",
	version: "1.0.0",
	digest: canonicalJsonDigest({id: "problem_framed", version: "1.0.0"}),
	description: "Observed problem and intended outcome are explicit.",
	requirement: "State the observed problem before selecting a solution.",
	loops: ["decision"],
});
const ROUTE = Object.freeze({
	id: "decision-reviewer",
	provider: "openai",
	model: "gpt-5.4",
	thinking: "high",
	timeoutMs: 120_000,
	configurationDigest: canonicalJsonDigest({route: "decision-reviewer"}),
});
const DISTILLER = Object.freeze({
	id: "codewiki.user-standard-distiller",
	version: "1.0.0",
	configurationDigest: canonicalJsonDigest({prompt: "user-standard-distiller-v1"}),
});

async function requestFixture() {
	const sourceRequest = createUserStandardSourceRequest({
		kind: "inline",
		mediaType: "text/markdown",
		content: SOURCE,
	});
	const sourceReceipt = await retrieveUserStandardSource({
		request: sourceRequest,
		now: NOW,
	});
	return createUserStandardDistillationRequest({
		name: "Company delivery standard",
		sourceReceipt,
		defaultChecks: [DEFAULT_CHECK],
		route: ROUTE,
	});
}

function completedOutput(request) {
	return {
		protocolId: "codewiki.user-standard-distillation",
		protocolVersion: "1.0.0",
		requestDigest: request.requestDigest,
		clauses: [
			{
				passage: "Every accepted Change states the observed problem.",
				explanation: "Existing Decision framing assurance covers this clause.",
				disposition: "default_covered",
				defaultCheckIds: ["problem_framed"],
			},
			{
				passage: "Every changed public API names its accountable owner.",
				explanation: "Project-specific ownership policy needs one independent Check.",
				disposition: "custom_model",
				proposal: {
					checkTypeId: "organization_policy",
					name: "Public API ownership",
					requirement: "Every changed public API must name its accountable owner.",
					repairGuidance: "Name the owning team in the accepted Change.",
					appliesWhen: {loops: ["decision"]},
				},
			},
			{
				passage: "All changed user interfaces must pass the approved accessibility scanner.",
				explanation: "Deterministic accessibility measurement is preferred.",
				disposition: "custom_code",
				proposal: {
					checkTypeId: "accessibility",
					name: "Approved accessibility scan",
					requirement: "Changed user interfaces pass the approved accessibility scanner.",
					appliesWhen: {loops: ["implementation"], affectedLayers: ["ui"]},
					templateIntent: "Consume an authenticated axe-compatible report.",
					requiredCapabilities: ["axe-report-ingestion"],
				},
			},
			{
				passage: "Security incidents receive earlier Decision attention than cosmetic requests.",
				explanation: "This is ordering guidance, not pass/fail assurance.",
				disposition: "triage_preference",
				preference: "Prefer authenticated security incidents when other dimensions are equal.",
				dimensions: ["severity", "exposure", "age_fairness"],
			},
			{
				passage: "One worker attempt may consume at most 5000 model tokens.",
				explanation: "A hard quantitative limit needs measurement and cancellation.",
				disposition: "runtime_guard",
				guard: {
					metric: "model_tokens",
					unit: "tokens",
					scope: "one implementation worker attempt",
					accountingWindow: "assignment attempt",
					operator: "lte",
					threshold: 5000,
					enforcement: "preflight meter and cancellation guard",
					measurementSource: "Runtime model usage receipts",
					requiredCapability: "authoritative per-attempt model token meter",
				},
			},
			{
				passage: "The legacy escalation rule contradicts the current owner policy.",
				explanation: "Contradiction needs protected human resolution.",
				disposition: "unresolved",
				reason: "contradictory",
				details: "Do not activate either interpretation until authority resolves it.",
			},
		],
	};
}

describe("User Standard distillation", () => {
	it("materializes bounded source-to-Check review bundles without granting authority", async () => {
		const request = await requestFixture();
		const calls = [];
		const receipt = await runUserStandardDistillation({
			request,
			now: NOW,
			distiller: {
				binding: DISTILLER,
				async execute(input) {
					calls.push(input);
					return {status: "completed", response: completedOutput(input.request)};
				},
			},
		});
		const bundle = materializeUserStandardDistillationBundle(receipt);

		assert.equal(request.protocolVersion, "1.0.0");
		assert.equal(request.checkTypes.length, 10);
		assert.equal(calls.length, 1);
		assert.equal(Object.hasOwn(calls[0], "credentials"), false);
		assert.equal(receipt.status, "completed");
		assert.match(receipt.receiptId, /^user-standard-distillation-receipt:[0-9a-f]{64}$/);
		assert.equal(bundle.userStandard.passages.length, 6);
		assert.equal(bundle.customCheckProposals.length, 1);
		assert.equal(bundle.customCodeCheckProposals.length, 1);
		assert.match(
			bundle.customCodeCheckProposals[0].proposalId,
			/^custom-code-check-proposal:/,
		);
		assert.equal(bundle.customCheckProposals[0].proposal.lifecycle, undefined);
		assert.deepEqual(bundle.customCheckProposals[0].proposal.standardRefs, [
			{
				userStandardId: bundle.userStandard.userStandardId,
				standardDigest: bundle.userStandard.standardDigest,
				passageIds: [
					bundle.clauses.find((clause) => clause.disposition === "custom_model").passageId,
				],
			},
		]);
		assert.equal(
			bundle.clauses.find((clause) => clause.disposition === "custom_code")
				.proposal.templateIntent,
			"Consume an authenticated axe-compatible report.",
		);
		assert.equal(
			bundle.clauses.find((clause) => clause.disposition === "unresolved").reason,
			"contradictory",
		);
		assert.doesNotThrow(() => assertUserStandardDistillationRequest(request));
		assert.doesNotThrow(() => assertUserStandardDistillationReceipt(receipt));
	});

	it("fails closed on invented passages, unknown coverage, source-unbound fields, and tampering", async () => {
		const request = await requestFixture();
		for (const response of [
			{
				...completedOutput(request),
				clauses: [{...completedOutput(request).clauses[0], passage: "Invented policy text."}],
			},
			{
				...completedOutput(request),
				clauses: [{...completedOutput(request).clauses[0], defaultCheckIds: ["unknown_check"]}],
			},
			{
				...completedOutput(request),
				clauses: [{
					...completedOutput(request).clauses[1],
					proposal: {...completedOutput(request).clauses[1].proposal, standardRefs: []},
				}],
			},
		]) {
			const receipt = await runUserStandardDistillation({
				request,
				now: NOW,
				distiller: {
					binding: DISTILLER,
					async execute() {
						return {status: "completed", response};
					},
				},
			});
			assert.equal(receipt.status, "indeterminate");
			assert.equal(receipt.reason, "malformed_output");
			assert.throws(
				() => materializeUserStandardDistillationBundle(receipt),
				/has no review bundle/,
			);
		}

		const valid = await runUserStandardDistillation({
			request,
			now: NOW,
			distiller: {
				binding: DISTILLER,
				async execute() {
					return {status: "completed", response: completedOutput(request)};
				},
			},
		});
		assert.throws(
			() => assertUserStandardDistillationReceipt({...valid, recordedAt: "2026-08-04T10:00:00.000Z"}),
			/identity is invalid/,
		);
		assert.throws(
			() => assertUserStandardDistillationRequest({...request, traceId: "forbidden"}),
			/unsupported field traceId/,
		);
	});

	it("preserves bounded operational failures without provider payload leakage", async () => {
		const request = await requestFixture();
		for (const status of ["timeout", "provider_failure", "unavailable", "cancelled"]) {
			const receipt = await runUserStandardDistillation({
				request,
				now: NOW,
				distiller: {
					binding: DISTILLER,
					async execute() {
						return {status};
					},
				},
			});
			assert.equal(receipt.status, "indeterminate");
			assert.equal(receipt.reason, status);
			assert.equal(receipt.output, null);
			assert.doesNotThrow(() => assertUserStandardDistillationReceipt(receipt));
		}

		const thrown = await runUserStandardDistillation({
			request,
			now: NOW,
			distiller: {
				binding: DISTILLER,
				async execute() {
					throw new Error("private provider response");
				},
			},
		});
		assert.equal(thrown.reason, "provider_failure");
		assert.equal(JSON.stringify(thrown).includes("private provider response"), false);
	});
});
