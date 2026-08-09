import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPiDecisionResearchClaimsTransport } from "../../src/pi/decision-research-claims-session.ts";
import { createDecisionResearchClaimsExecutor } from "../../src/runtime/decision-research-claims.ts";
import {
	createDecisionResearchProvenanceExecutor,
	materializeDecisionResearchCitation,
} from "../../src/runtime/decision-research.ts";
import { createCheckCatalog } from "../../src/verification/catalog.ts";
import { resolveExitPolicy } from "../../src/verification/resolve-policy.ts";

const digest = (value) => `sha256:${value.repeat(64)}`;
const subject = {
	changeRefs: ["CHG-decision-research"],
	changeRevisionDigests: [digest("1")],
	acceptanceRequirementIds: [],
};

function policy() {
	return resolveExitPolicy({
		loop: "decision",
		candidateDigest: digest("2"),
		changes: [
			{
				changeId: "CHG-decision-research",
				revision: 1,
				digest: digest("1"),
				kind: "improve",
				type: "architecture_change",
				risk: "high",
				affectedLayers: ["runtime"],
			},
		],
	});
}

function material(overrides = {}) {
	return {
		provenanceRefs: ["source:https://example.test/runtime"],
		payload: {
			claim: "The provider supports bounded retries.",
			classification: "primary",
			publisher: "Example Provider",
			uri: "https://example.test/runtime",
			title: "Runtime limits",
			publicationDate: "2026-07-01",
			passageDigest: digest("3"),
			passageLocator: "section:retries",
			stance: "supports",
			limitations: [],
		},
		...overrides,
	};
}

function context(overrides = {}) {
	return {
		subject,
		observedAt: "2026-07-29T12:00:00.000Z",
		producer: {
			kind: "external_service",
			id: "bounded-research-fetch",
			version: "1.0.0",
		},
		coverage: "complete",
		sensitivity: "project",
		freshnessBoundary: digest("4"),
		...overrides,
	};
}

const candidateSubject = {
	...subject,
	candidateDigest: digest("2"),
};

function createDecisionResearchRuntime() {
	const catalog = createCheckCatalog();
	const claims = createDecisionResearchClaimsExecutor(catalog);
	return Object.freeze({
		materializeDecisionResearchCitation,
		evaluateDecisionResearchProvenance:
			createDecisionResearchProvenanceExecutor(catalog),
		prepareDecisionResearchClaimsAssessment: claims.prepare,
		completeDecisionResearchClaimsAssessment: claims.complete,
	});
}

function modelRoute(overrides = {}) {
	return {
		id: "decision-research-high",
		provider: "test-provider",
		model: "test-model-high",
		thinking: "high",
		quality: "high",
		latency: "balanced",
		timeoutMs: 60_000,
		pricing: {
			inputUsdPerMillion: 1,
			outputUsdPerMillion: 2,
			cacheReadUsdPerMillion: 0,
			cacheWriteUsdPerMillion: 0,
		},
		allowedTools: [],
		...overrides,
	};
}

function claimsFixture(runtime, overrides = {}) {
	const resolvedPolicy = overrides.policy ?? policy();
	const evidence =
		overrides.evidence ??
		runtime.materializeDecisionResearchCitation(material(), context());
	const provenanceResult =
		overrides.provenanceResult ??
		runtime.evaluateDecisionResearchProvenance({
			policy: resolvedPolicy,
			evidence: [evidence],
			expectedSubject: subject,
			expectedFreshnessBoundary: digest("4"),
		});
	return {
		evidence,
		input: {
			policy: resolvedPolicy,
			provenanceResult,
			researchEvidence: [evidence],
			expectedChangeSubject: subject,
			expectedFreshnessBoundary: digest("4"),
			candidateSubject,
			route: modelRoute(),
			sensitivity: "project",
			...overrides.input,
		},
	};
}

function modelAssessmentResponse(
	request,
	conclusion,
	findings = [],
	limitations = [],
) {
	return {
		claimAssessments: request.claims.map((claim) => ({
			claimDigest: claim.claimDigest,
			evidenceIds: claim.citations.map((citation) => citation.evidenceId),
			conclusion,
			findings,
			limitations,
		})),
	};
}

describe("Decision research Runtime boundary", () => {
	it("materializes exact Change-revision citations and creates a passing provenance Result", () => {
		const runtime = createDecisionResearchRuntime();
		const evidence = runtime.materializeDecisionResearchCitation(
			material(),
			context(),
		);
		const result = runtime.evaluateDecisionResearchProvenance({
			policy: policy(),
			evidence: [evidence],
			expectedSubject: subject,
			expectedFreshnessBoundary: digest("4"),
		});

		assert.equal(evidence.kind, "research_citation");
		assert.equal(evidence.authority, "observed");
		assert.equal(result.checkId, "research_provenance_valid");
		assert.equal(result.status, "pass");
		assert.deepEqual(
			{ ...result.measurement },
			{ shape: "boolean", value: true },
		);
		assert.deepEqual(result.evidenceRecordIds, [evidence.evidenceId]);
		assert.equal(result.evidenceResolutions[0].status, "ready");
		assert.equal(result.execution.kind, "code");
	});

	it("keeps contradictory research stance while checking provenance independently", () => {
		const runtime = createDecisionResearchRuntime();
		const evidence = runtime.materializeDecisionResearchCitation(
			material({
				payload: {
					...material().payload,
					stance: "contradicts",
					limitations: ["Applies only to hosted plans."],
				},
			}),
			context(),
		);
		const result = runtime.evaluateDecisionResearchProvenance({
			policy: policy(),
			evidence: [evidence],
			expectedSubject: subject,
			expectedFreshnessBoundary: digest("4"),
		});

		assert.equal(evidence.payload.stance, "contradicts");
		assert.equal(result.status, "pass");
	});

	it("returns fail for temporally impossible source metadata without discarding Evidence", () => {
		const runtime = createDecisionResearchRuntime();
		const evidence = runtime.materializeDecisionResearchCitation(
			material({
				payload: {
					...material().payload,
					publicationDate: "2026-07-30",
				},
			}),
			context(),
		);
		const result = runtime.evaluateDecisionResearchProvenance({
			policy: policy(),
			evidence: [evidence],
			expectedSubject: subject,
			expectedFreshnessBoundary: digest("4"),
		});

		assert.equal(result.status, "fail");
		assert.deepEqual(result.evidenceRecordIds, [evidence.evidenceId]);
		assert.match(result.findings[0], /publicationDate 2026-07-30 follows observation/);
	});

	it("returns indeterminate for missing or stale citation inputs", () => {
		const runtime = createDecisionResearchRuntime();
		const missing = runtime.evaluateDecisionResearchProvenance({
			policy: policy(),
			evidence: [],
			expectedSubject: subject,
			expectedFreshnessBoundary: digest("4"),
		});
		assert.equal(missing.status, "indeterminate");
		assert.equal(missing.measurement, undefined);
		assert.match(missing.findings[0], /is missing/);

		const staleEvidence = runtime.materializeDecisionResearchCitation(
			material(),
			context({ freshnessBoundary: digest("5") }),
		);
		const stale = runtime.evaluateDecisionResearchProvenance({
			policy: policy(),
			evidence: [staleEvidence],
			expectedSubject: subject,
			expectedFreshnessBoundary: digest("4"),
		});
		assert.equal(stale.status, "indeterminate");
		assert.match(stale.findings[0], /exclusions=freshness/);
		assert.deepEqual(stale.evidenceRecordIds, [staleEvidence.evidenceId]);
	});

	it("rejects caller-owned assurance and non-Change research subjects", () => {
		const runtime = createDecisionResearchRuntime();
		assert.throws(
			() =>
				runtime.materializeDecisionResearchCitation(material(), {
					...context(),
					authority: "verified",
				}),
			/Decision research observation context received unsupported field authority/,
		);
		assert.throws(
			() =>
				runtime.materializeDecisionResearchCitation(
					material(),
					context({
						subject: {
							...subject,
							candidateDigest: digest("6"),
						},
					}),
				),
			/Decision research Evidence subject received unsupported field candidateDigest/,
		);
	});
});

describe("Decision research claim-support Model Check", () => {
	it("completes exact prepared input through isolated Pi transport", async () => {
		const runtime = createDecisionResearchRuntime();
		const fixture = claimsFixture(runtime);
		const prepared = runtime.prepareDecisionResearchClaimsAssessment(
			fixture.input,
		);
		assert.equal(prepared.status, "ready");
		const transport = createPiDecisionResearchClaimsTransport({
			repoRoot: process.cwd(),
			now: () => "2026-07-29T12:05:00.000Z",
			sessionFactory: async ({ request }) => ({
				async prompt() {},
				readResponse: () => modelAssessmentResponse(request, "supported"),
				dispose() {},
			}),
		});
		const observation = await transport.execute(prepared.request);
		const completion = runtime.completeDecisionResearchClaimsAssessment(
			fixture.input,
			observation,
		);

		assert.equal(completion.result.status, "pass");
		assert.equal(completion.evidenceRecords.length, 1);
		assert.equal(completion.evidenceRecords[0].kind, "model_assessment");
	});

	it("prepares one immutable, tool-free, exact-input model request", () => {
		const runtime = createDecisionResearchRuntime();
		const fixture = claimsFixture(runtime);
		const prepared = runtime.prepareDecisionResearchClaimsAssessment(
			fixture.input,
		);

		assert.equal(prepared.status, "ready");
		assert.equal(prepared.request.protocolId, "codewiki.decision.research-claims");
		assert.equal(prepared.request.candidateDigest, digest("2"));
		assert.deepEqual(prepared.request.researchEvidenceIds, [
			fixture.evidence.evidenceId,
		]);
		assert.equal(prepared.request.claims.length, 1);
		assert.equal(prepared.request.claims[0].citations[0].stance, "supports");
		assert.match(prepared.request.requestDigest, /^sha256:[a-f0-9]{64}$/);
		assert.match(prepared.request.configurationDigest, /^sha256:[a-f0-9]{64}$/);
		assert.ok(Object.isFrozen(prepared.request));
		assert.equal("prompt" in prepared.request, false);
	});

	it("materializes bounded model output and derives pass or fail in Runtime", () => {
		for (const [conclusion, expectedStatus] of [
			["supported", "pass"],
			["unsupported", "fail"],
		]) {
			const runtime = createDecisionResearchRuntime();
			const fixture = claimsFixture(runtime);
			const prepared = runtime.prepareDecisionResearchClaimsAssessment(
				fixture.input,
			);
			assert.equal(prepared.status, "ready");
			const completion = runtime.completeDecisionResearchClaimsAssessment(
				fixture.input,
				{
					status: "completed",
					requestDigest: prepared.request.requestDigest,
					observedAt: "2026-07-29T12:05:00.000Z",
					response: modelAssessmentResponse(
						prepared.request,
						conclusion,
						conclusion === "supported"
							? []
							: ["Claim exceeds cited provider guarantee."],
					),
				},
			);

			assert.equal(completion.result.status, expectedStatus);
			assert.equal(completion.evidenceRecords.length, 1);
			const assessment = completion.evidenceRecords[0];
			assert.equal(assessment.kind, "model_assessment");
			assert.equal(assessment.authority, "observed");
			assert.equal(assessment.payload.checkId, "research_claims_supported");
			assert.deepEqual({...assessment.payload.measurement}, {
				kind: "boolean",
				value: conclusion === "supported",
			});
			assert.ok(completion.result.evidenceRecordIds.includes(assessment.evidenceId));
			assert.equal(completion.result.execution.modelRef, "test-provider/test-model-high");
		}
	});

	it("keeps semantic uncertainty indeterminate with observed model Evidence", () => {
		const runtime = createDecisionResearchRuntime();
		const fixture = claimsFixture(runtime);
		const prepared = runtime.prepareDecisionResearchClaimsAssessment(
			fixture.input,
		);
		assert.equal(prepared.status, "ready");
		const completion = runtime.completeDecisionResearchClaimsAssessment(
			fixture.input,
			{
				status: "completed",
				requestDigest: prepared.request.requestDigest,
				observedAt: "2026-07-29T12:05:00.000Z",
				response: modelAssessmentResponse(
					prepared.request,
					"uncertain",
					[],
					["Citation does not cover retry exhaustion."],
				),
			},
		);

		assert.equal(completion.result.status, "indeterminate");
		assert.equal(completion.result.measurement, undefined);
		assert.equal(completion.evidenceRecords.length, 1);
		assert.equal(
			completion.evidenceRecords[0].payload.measurement.kind,
			"label",
		);
		assert.equal(
			completion.evidenceRecords[0].payload.measurement.value,
			"uncertain",
		);
	});

	it("maps provider and malformed-output failures to indeterminate without fake Evidence", () => {
		const runtime = createDecisionResearchRuntime();
		const fixture = claimsFixture(runtime);
		const prepared = runtime.prepareDecisionResearchClaimsAssessment(
			fixture.input,
		);
		assert.equal(prepared.status, "ready");
		const wrongEvidenceResponse = modelAssessmentResponse(
			prepared.request,
			"supported",
		);
		wrongEvidenceResponse.claimAssessments[0].evidenceIds = [digest("9")];
		for (const observation of [
			{
				status: "timeout",
				requestDigest: prepared.request.requestDigest,
			},
			{
				status: "completed",
				requestDigest: prepared.request.requestDigest,
				observedAt: "2026-07-29T12:05:00.000Z",
				response: { conclusion: "probably" },
			},
			{
				status: "completed",
				requestDigest: prepared.request.requestDigest,
				observedAt: "2026-07-29T12:05:00.000Z",
				response: wrongEvidenceResponse,
			},
		]) {
			const completion = runtime.completeDecisionResearchClaimsAssessment(
				fixture.input,
				observation,
			);
			assert.equal(completion.result.status, "indeterminate");
			assert.equal(completion.result.measurement, undefined);
			assert.deepEqual(completion.evidenceRecords, []);
		}
	});

	it("does not invoke model work when exact provenance dependency failed", () => {
		const runtime = createDecisionResearchRuntime();
		const failedEvidence = runtime.materializeDecisionResearchCitation(
			material({
				payload: {
					...material().payload,
					publicationDate: "2026-07-30",
				},
			}),
			context(),
		);
		const failedProvenance = runtime.evaluateDecisionResearchProvenance({
			policy: policy(),
			evidence: [failedEvidence],
			expectedSubject: subject,
			expectedFreshnessBoundary: digest("4"),
		});
		const fixture = claimsFixture(runtime, {
			evidence: failedEvidence,
			provenanceResult: failedProvenance,
		});
		const prepared = runtime.prepareDecisionResearchClaimsAssessment(
			fixture.input,
		);

		assert.equal(prepared.status, "indeterminate");
		assert.equal(prepared.result.status, "indeterminate");
		assert.match(prepared.result.findings[0], /provenance dependency is fail/);
		assert.equal("request" in prepared, false);
	});

	it("rejects tools and observations for another exact request", () => {
		const runtime = createDecisionResearchRuntime();
		const fixture = claimsFixture(runtime);
		assert.throws(
			() =>
				runtime.prepareDecisionResearchClaimsAssessment({
					...fixture.input,
					route: modelRoute({ allowedTools: ["read"] }),
				}),
			/route must disable all tools/,
		);
		const prepared = runtime.prepareDecisionResearchClaimsAssessment(
			fixture.input,
		);
		assert.equal(prepared.status, "ready");
		assert.throws(
			() =>
				runtime.completeDecisionResearchClaimsAssessment(fixture.input, {
					status: "timeout",
					requestDigest: digest("9"),
				}),
			/request digest mismatch/,
		);
	});
});
