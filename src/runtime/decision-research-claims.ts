import { DECISION_RESEARCH_CLAIMS_PROTOCOL } from "../decision/exit/research-claims-protocol.ts";
import type {
	EvidenceId,
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
	ModelAssessmentPayload,
	ResearchCitationPayload,
} from "../evidence/contracts.ts";
import { EVIDENCE_SCHEMA_VERSION } from "../evidence/contracts.ts";
import { materializeEvidenceRecord } from "../evidence/materialize.ts";
import { modelConclusionEvidenceMeasurement } from "../evidence/model-assessment.ts";
import type { EvidenceObligationResolution } from "../evidence/obligation-resolution.ts";
import type { EvidenceObligation } from "../evidence/obligations.ts";
import { reduceEvidenceObligation } from "../evidence/obligations.ts";
import type { CheckCatalog } from "../loop-exit/catalog.ts";
import type {
	CheckDefinition,
	CheckExecutionIdentity,
	CheckResult,
	ResolvedExitPolicy,
} from "../loop-exit/contracts.ts";
import { assertValidResolvedExitPolicy } from "../loop-exit/contracts.ts";
import { loopQualifiedCheckDigest } from "../loop-exit/identity.ts";
import { createCheckResult } from "../loop-exit/results.ts";
import type { WikiModelRouteConfig } from "../project/model-routing.ts";
import { validateNoToolModelRoute } from "../project/model-route-validation.ts";
import type { Sha256Digest } from "../utils/canonical-json.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../utils/canonical-json.ts";
import { assertExactKeys } from "../utils/json.ts";
import { assertDecisionResearchSubject } from "./decision-research.ts";

const CHECK_ID = "research_claims_supported";
const PROVENANCE_CHECK_ID = "research_provenance_valid";
const PROTOCOL_ID = DECISION_RESEARCH_CLAIMS_PROTOCOL.id;
const PROTOCOL_VERSION = DECISION_RESEARCH_CLAIMS_PROTOCOL.version;
const {
	maxClaims: MAX_CLAIMS,
	maxCitations: MAX_CITATIONS,
	maxRequestBytes: MAX_REQUEST_BYTES,
} = DECISION_RESEARCH_CLAIMS_PROTOCOL.inputLimits;
const {
	maxFindings: MAX_FINDINGS,
	maxLimitations: MAX_LIMITATIONS,
} = DECISION_RESEARCH_CLAIMS_PROTOCOL.outputLimits;
const SENSITIVITIES = ["public", "project", "private"] as const;
const MODEL_CONCLUSION_VOCABULARY_DIGEST = canonicalJsonDigest({
	protocolId: PROTOCOL_ID,
	protocolVersion: PROTOCOL_VERSION,
	labels: ["uncertain"],
});
const OPERATIONAL_OUTCOMES = [
	"timeout",
	"provider_failure",
	"unavailable",
	"cancelled",
] as const;

type OperationalOutcome = (typeof OPERATIONAL_OUTCOMES)[number];
type ModelConclusion = "supported" | "unsupported" | "uncertain";

interface DecisionResearchClaimsInput {
	readonly policy: ResolvedExitPolicy;
	readonly provenanceResult: CheckResult;
	readonly researchEvidence: readonly EvidenceRecord[];
	readonly expectedChangeSubject: EvidenceSubject;
	readonly expectedFreshnessBoundary: string;
	readonly candidateSubject: EvidenceSubject;
	readonly route: WikiModelRouteConfig;
	readonly sensitivity: EvidenceSensitivity;
}

export type DecisionResearchClaimsModelObservation =
	| {
			readonly status: "completed";
			readonly requestDigest: Sha256Digest;
			readonly observedAt: string;
			readonly response: unknown;
	  }
	| {
			readonly status: OperationalOutcome;
			readonly requestDigest: Sha256Digest;
	  };

type ModelObservation = DecisionResearchClaimsModelObservation;

interface NormalizedClaimAssessment {
	readonly claimDigest: Sha256Digest;
	readonly conclusion: ModelConclusion;
	readonly findings: readonly string[];
	readonly limitations: readonly string[];
}

interface NormalizedResponse {
	readonly conclusion: ModelConclusion;
	readonly findings: readonly string[];
	readonly limitations: readonly string[];
}

interface PreparedCitation extends ResearchCitationPayload {
	readonly evidenceId: EvidenceId;
}

interface PreparedClaim {
	readonly claim: string;
	readonly claimDigest: Sha256Digest;
	readonly citations: readonly PreparedCitation[];
}

interface PreparedRequest {
	readonly schemaVersion: "1.0.0";
	readonly protocolId: typeof PROTOCOL_ID;
	readonly protocolVersion: typeof PROTOCOL_VERSION;
	readonly checkId: typeof CHECK_ID;
	readonly checkVersion: string;
	readonly candidateDigest: Sha256Digest;
	readonly policyDigest: Sha256Digest;
	readonly checkDigest: Sha256Digest;
	readonly route: {
		readonly id: string;
		readonly provider: string;
		readonly model: string;
		readonly thinking: WikiModelRouteConfig["thinking"];
		readonly timeoutMs: number;
	};
	readonly configurationDigest: Sha256Digest;
	readonly researchEvidenceIds: readonly EvidenceId[];
	readonly claims: readonly PreparedClaim[];
	readonly inputLimits: {
		readonly maxClaims: number;
		readonly maxCitations: number;
		readonly maxRequestBytes: number;
	};
	readonly outputLimits: {
		readonly maxFindings: number;
		readonly maxLimitations: number;
		readonly maxResponseBytes: number;
	};
	readonly requestDigest: Sha256Digest;
}

type PublicPreparation =
	| { readonly status: "ready"; readonly request: PreparedRequest }
	| { readonly status: "indeterminate"; readonly result: CheckResult };

export type DecisionResearchClaimsRequest = PreparedRequest;

interface TrustedClaimsCheck {
	readonly check: CheckDefinition;
	readonly researchObligation: EvidenceObligation;
	readonly modelObligation: EvidenceObligation;
}

interface PreparedState {
	readonly public: PublicPreparation;
	readonly trusted: TrustedClaimsCheck;
	readonly researchResolution: EvidenceObligationResolution;
	readonly execution: CheckExecutionIdentity;
}

export function createDecisionResearchClaimsExecutor(catalog: CheckCatalog) {
	const trusted = trustedClaimsCheck(catalog);
	return Object.freeze({
		prepare: (input: DecisionResearchClaimsInput) =>
			prepareClaims(trusted, input).public,
		complete: (
			input: DecisionResearchClaimsInput,
			observation: ModelObservation,
		) => completeClaims(trusted, input, observation),
	});
}

function trustedClaimsCheck(catalog: CheckCatalog): TrustedClaimsCheck {
	const registration = catalog.get(CHECK_ID, "decision");
	if (
		registration?.authority !== "kernel" ||
		registration.check.execution.kind !== "model" ||
		!registration.check.protected ||
		!registration.dependsOn.includes(PROVENANCE_CHECK_ID)
	) {
		throw new Error(
			"Decision research claims executor requires the protected dependent kernel Model Check.",
		);
	}
	const researchObligation = registration.check.evidenceObligations.find(
		(obligation) => obligation.id === "research-citations",
	);
	const modelObligation = registration.check.evidenceObligations.find(
		(obligation) => obligation.id === "model-assessment",
	);
	if (
		!researchObligation ||
		!modelObligation ||
		registration.check.evidenceObligations.length !== 2
	) {
		throw new Error(
			"Decision research claims Check must declare research-citations and model-assessment obligations.",
		);
	}
	return { check: registration.check, researchObligation, modelObligation };
}

function completeClaims(
	trusted: TrustedClaimsCheck,
	input: DecisionResearchClaimsInput,
	observation: ModelObservation,
) {
	const prepared = prepareClaims(trusted, input);
	if (prepared.public.status === "indeterminate") {
		return Object.freeze({
			result: prepared.public.result,
			evidenceRecords: Object.freeze([] as EvidenceRecord[]),
		});
	}
	const request = prepared.public.request;
	assertModelObservation(observation, request.requestDigest);
	if (observation.status !== "completed") {
		return emptyCompletion(
			operationalResult(prepared, input, observation.status),
		);
	}
	let response: NormalizedResponse;
	try {
		response = normalizedResponse(observation.response, request);
	} catch {
		return emptyCompletion(
			operationalResult(prepared, input, "malformed_output"),
		);
	}
	const modelEvidence = materializeModelAssessment(
		input,
		request,
		observation.observedAt,
		response,
	);
	const modelResolution = reduceEvidenceObligation({
		obligation: trusted.modelObligation,
		evidence: [{ evidence: modelEvidence, relation: "supporting" }],
		expectedSubject: input.candidateSubject,
	});
	const resolutions = [prepared.researchResolution, modelResolution];
	const resultFindings = response.findings.length
		? response.findings
		: response.limitations;
	let result: CheckResult;
	if (response.conclusion === "uncertain") {
		result = createCheckResult({
			loop: "decision",
			policy: input.policy,
			check: trusted.check,
			disposition: "indeterminate",
			evidenceResolutions: resolutions,
			findings: [...resultFindings],
			issueClass: "research_claim_support",
			execution: prepared.execution,
		});
	} else {
		const supported = response.conclusion === "supported";
		result = createCheckResult({
			loop: "decision",
			policy: input.policy,
			check: trusted.check,
			disposition: supported ? "satisfied" : "unsatisfied",
			measurement: { shape: "boolean", value: supported },
			evidenceResolutions: resolutions,
			findings: [...(supported ? response.findings : resultFindings)],
			...(supported ? {} : { issueClass: "research_claim_support" }),
			execution: prepared.execution,
		});
	}
	return Object.freeze({
		result,
		evidenceRecords: Object.freeze([modelEvidence]),
	});
}

function emptyCompletion(result: CheckResult) {
	return Object.freeze({
		result,
		evidenceRecords: Object.freeze([] as EvidenceRecord[]),
	});
}

function prepareClaims(
	trusted: TrustedClaimsCheck,
	input: DecisionResearchClaimsInput,
): PreparedState {
	assertClaimsInput(input);
	assertValidResolvedExitPolicy(input.policy);
	const binding = input.policy.bindings.find(
		(candidate) => candidate.checkId === CHECK_ID,
	);
	if (!binding) throw new Error(`Decision policy does not bind ${CHECK_ID}.`);
	const expectedCheckDigest = loopQualifiedCheckDigest({
		loop: "decision",
		check: trusted.check,
		configuration: binding.parameters,
		catalogDigest: input.policy.catalogDigest,
	});
	if (
		binding.checkVersion !== trusted.check.version ||
		binding.requirementDigest !== trusted.check.requirementDigest ||
		binding.checkDigest !== expectedCheckDigest
	) {
		throw new Error("Decision research claims Check binding is stale or invalid.");
	}
	const route = validateNoToolModelRoute(
		input.route,
		"Decision research Model Check",
	);
	const configurationDigest = modelConfigurationDigest(trusted.check, route);
	const execution: CheckExecutionIdentity = {
		...trusted.check.execution,
		adapterVersion: PROTOCOL_VERSION,
		modelRef: `${route.provider}/${route.model}`,
		configurationDigest,
		trialPolicy: "single-observation",
		aggregationPolicy: "direct",
	};
	const researchResolution = reduceEvidenceObligation({
		obligation: trusted.researchObligation,
		evidence: input.researchEvidence.map((evidence) => ({
			evidence,
			relation: "supporting" as const,
		})),
		expectedSubject: input.expectedChangeSubject,
		expectedFreshnessBoundary: input.expectedFreshnessBoundary,
	});
	assertProvenanceResult(input, researchResolution);
	if (
		researchResolution.status !== "ready" ||
		input.provenanceResult.status !== "pass"
	) {
		return indeterminatePreparation({
			trusted,
			input,
			researchResolution,
			execution,
			finding:
				input.provenanceResult.status === "pass"
					? `Decision research input is ${researchResolution.status}.`
					: `Decision research provenance dependency is ${input.provenanceResult.status}.`,
		});
	}
	const inputLimitFinding = researchInputLimitFinding(input, researchResolution);
	if (inputLimitFinding) {
		return indeterminatePreparation({
			trusted,
			input,
			researchResolution,
			execution,
			finding: inputLimitFinding,
		});
	}
	const request = researchClaimsRequest({
		input,
		checkVersion: trusted.check.version,
		checkDigest: binding.checkDigest,
		route,
		configurationDigest,
		resolution: researchResolution,
	});
	if (Buffer.byteLength(JSON.stringify(request), "utf8") > MAX_REQUEST_BYTES) {
		return indeterminatePreparation({
			trusted,
			input,
			researchResolution,
			execution,
			finding: `Decision research model request exceeds ${MAX_REQUEST_BYTES} bytes.`,
		});
	}
	return {
		public: Object.freeze({ status: "ready", request }),
		trusted,
		researchResolution,
		execution,
	};
}

function indeterminatePreparation(options: {
	readonly trusted: TrustedClaimsCheck;
	readonly input: DecisionResearchClaimsInput;
	readonly researchResolution: EvidenceObligationResolution;
	readonly execution: CheckExecutionIdentity;
	readonly finding: string;
}): PreparedState {
	const { trusted, input, researchResolution, execution, finding } = options;
	const result = createCheckResult({
		loop: "decision",
		policy: input.policy,
		check: trusted.check,
		disposition: "indeterminate",
		evidenceResolutions: [
			researchResolution,
			emptyModelResolution(trusted.modelObligation, input),
		],
		findings: [finding],
		issueClass: "research_evidence",
		execution,
	});
	return {
		public: Object.freeze({ status: "indeterminate", result }),
		trusted,
		researchResolution,
		execution,
	};
}

function researchInputLimitFinding(
	input: DecisionResearchClaimsInput,
	resolution: EvidenceObligationResolution,
): string | undefined {
	if (resolution.eligibleEvidenceIds.length > MAX_CITATIONS) {
		return `Decision research citation count exceeds ${MAX_CITATIONS}.`;
	}
	const eligible = new Set(resolution.eligibleEvidenceIds);
	const claims = new Set(
		input.researchEvidence.flatMap((evidence) =>
			eligible.has(evidence.evidenceId) && evidence.kind === "research_citation"
				? [evidence.payload.claim]
				: [],
		),
	);
	return claims.size > MAX_CLAIMS
		? `Decision research claim count exceeds ${MAX_CLAIMS}.`
		: undefined;
}

function modelConfigurationDigest(
	check: CheckDefinition,
	route: WikiModelRouteConfig,
): Sha256Digest {
	return canonicalJsonDigest({
		protocol: DECISION_RESEARCH_CLAIMS_PROTOCOL,
		checkId: check.id,
		checkVersion: check.version,
		route,
	});
}

function researchClaimsRequest(options: {
	readonly input: DecisionResearchClaimsInput;
	readonly checkVersion: string;
	readonly checkDigest: string;
	readonly route: WikiModelRouteConfig;
	readonly configurationDigest: Sha256Digest;
	readonly resolution: EvidenceObligationResolution;
}): PreparedRequest {
	const {
		input,
		checkVersion,
		checkDigest,
		route,
		configurationDigest,
		resolution,
	} = options;
	const byId = new Map(
		input.researchEvidence.map((evidence) => [evidence.evidenceId, evidence]),
	);
	const claims = new Map<string, PreparedCitation[]>();
	for (const evidenceId of resolution.eligibleEvidenceIds) {
		const evidence = byId.get(evidenceId);
		if (!evidence || evidence.kind !== "research_citation") continue;
		const citations = claims.get(evidence.payload.claim) ?? [];
		citations.push({ evidenceId, ...evidence.payload });
		claims.set(evidence.payload.claim, citations);
	}
	const normalizedClaims = [...claims.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([claim, citations]) => ({
			claim,
			claimDigest: canonicalJsonDigest({
				claim,
				evidenceIds: citations
					.map((citation) => citation.evidenceId)
					.sort((left, right) => left.localeCompare(right)),
			}),
			citations,
		}));
	if (normalizedClaims.length > MAX_CLAIMS) {
		throw new Error(
			`Decision research claim count exceeds ${MAX_CLAIMS}.`,
		);
	}
	const body = {
		schemaVersion: "1.0.0" as const,
		protocolId: PROTOCOL_ID,
		protocolVersion: PROTOCOL_VERSION,
		checkId: CHECK_ID,
		checkVersion,
		candidateDigest: input.policy.candidateDigest,
		policyDigest: input.policy.policyDigest,
		checkDigest,
		route: {
			id: route.id,
			provider: route.provider,
			model: route.model,
			thinking: route.thinking,
			timeoutMs: route.timeoutMs,
		},
		configurationDigest,
		researchEvidenceIds: resolution.eligibleEvidenceIds,
		claims: normalizedClaims,
		inputLimits: {
			maxClaims: MAX_CLAIMS,
			maxCitations: MAX_CITATIONS,
			maxRequestBytes: MAX_REQUEST_BYTES,
		},
		outputLimits: {
			maxFindings: MAX_FINDINGS,
			maxLimitations: MAX_LIMITATIONS,
			maxResponseBytes:
				DECISION_RESEARCH_CLAIMS_PROTOCOL.outputLimits.maxResponseBytes,
		},
	};
	return toCanonicalJsonValue({
		...body,
		requestDigest: canonicalJsonDigest(body),
	}) as unknown as PreparedRequest;
}

function materializeModelAssessment(
	input: DecisionResearchClaimsInput,
	request: PreparedRequest,
	observedAt: string,
	response: NormalizedResponse,
): EvidenceRecord<"model_assessment"> {
	const payload: ModelAssessmentPayload = {
		checkId: CHECK_ID,
		checkVersion: request.checkVersion,
		protocolId: PROTOCOL_ID,
		protocolVersion: PROTOCOL_VERSION,
		routeId: request.route.id,
		configurationDigest: request.configurationDigest,
		measurement: modelConclusionEvidenceMeasurement(
			response.conclusion,
			MODEL_CONCLUSION_VOCABULARY_DIGEST,
		),
		consideredEvidenceIds: [...request.researchEvidenceIds],
		findings: response.findings,
		limitations: response.limitations,
	};
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "model_assessment",
			provenanceRefs: [
				`request:${request.requestDigest}`,
				`protocol:${PROTOCOL_ID}@${PROTOCOL_VERSION}`,
				...request.researchEvidenceIds.map((id) => `evidence:${id}`),
			],
			payload,
		},
		{
			subject: input.candidateSubject,
			observedAt,
			producer: {
				kind: "model",
				id: `${request.route.provider}/${request.route.model}`,
				version: PROTOCOL_VERSION,
			},
			authority: "observed",
			coverage: "complete",
			freshnessBoundary: request.requestDigest,
			sensitivity: input.sensitivity,
		},
	);
}

function operationalResult(
	prepared: PreparedState,
	input: DecisionResearchClaimsInput,
	outcome: OperationalOutcome | "malformed_output",
): CheckResult {
	return createCheckResult({
		loop: "decision",
		policy: input.policy,
		check: prepared.trusted.check,
		disposition: "indeterminate",
		evidenceResolutions: [
			prepared.researchResolution,
			emptyModelResolution(prepared.trusted.modelObligation, input),
		],
		findings: [`Decision research claim assessment ${outcome}.`],
		issueClass: "model_execution",
		execution: prepared.execution,
	});
}

function emptyModelResolution(
	obligation: EvidenceObligation,
	input: DecisionResearchClaimsInput,
): EvidenceObligationResolution {
	return reduceEvidenceObligation({
		obligation,
		evidence: [],
		expectedSubject: input.candidateSubject,
	});
}

function assertClaimsInput(input: DecisionResearchClaimsInput): void {
	assertExactKeys(
		input,
		[
			"policy",
			"provenanceResult",
			"researchEvidence",
			"expectedChangeSubject",
			"expectedFreshnessBoundary",
			"candidateSubject",
			"route",
			"sensitivity",
		],
		"Decision research claims input",
	);
	if (input.policy.loop !== "decision") {
		throw new Error("Decision research claims executor requires a Decision policy.");
	}
	assertDecisionResearchSubject(input.expectedChangeSubject);
	assertDecisionCandidateSubject(input.candidateSubject, input.policy.candidateDigest);
	if (!(SENSITIVITIES as readonly string[]).includes(input.sensitivity)) {
		throw new Error(`Decision research claims sensitivity ${String(input.sensitivity)} is invalid.`);
	}
}

function assertDecisionCandidateSubject(
	subject: EvidenceSubject,
	candidateDigest: string,
): void {
	assertExactKeys(
		subject,
		[
			"changeRefs",
			"changeRevisionDigests",
			"candidateDigest",
			"acceptanceRequirementIds",
		],
		"Decision research model Evidence subject",
	);
	if (
		subject.changeRefs?.length !== 1 ||
		subject.changeRevisionDigests?.length !== 1 ||
		subject.acceptanceRequirementIds?.length !== 0 ||
		subject.candidateDigest !== candidateDigest
	) {
		throw new Error(
			"Decision research model Evidence subject must bind the exact Candidate and one Change revision.",
		);
	}
}

function assertProvenanceResult(
	input: DecisionResearchClaimsInput,
	resolution: EvidenceObligationResolution,
): void {
	const result = input.provenanceResult;
	const resultResolution = result.evidenceResolutions.find(
		(candidate) => candidate.obligationId === "research-citations",
	);
	const { resultDigest, ...body } = result;
	if (
		result.checkId !== PROVENANCE_CHECK_ID ||
		result.policyDigest !== input.policy.policyDigest ||
		result.candidateDigest !== input.policy.candidateDigest ||
		resultDigest !== canonicalJsonDigest(body) ||
		resultResolution?.resolutionDigest !== resolution.resolutionDigest ||
		!sameTextList(result.evidenceRecordIds, resolution.inputEvidenceIds)
	) {
		throw new Error(
			"Decision research claims executor requires the exact provenance Result for its Evidence input.",
		);
	}
}

function assertModelObservation(
	observation: ModelObservation,
	requestDigest: string,
): void {
	if (observation.status === "completed") {
		assertExactKeys(
			observation,
			["status", "requestDigest", "observedAt", "response"],
			"Decision research model observation",
		);
	} else if ((OPERATIONAL_OUTCOMES as readonly string[]).includes(observation.status)) {
		assertExactKeys(
			observation,
			["status", "requestDigest"],
			"Decision research model observation",
		);
	} else {
		throw new Error(`Decision research model outcome ${String(observation.status)} is invalid.`);
	}
	if (observation.requestDigest !== requestDigest) {
		throw new Error("Decision research model observation request digest mismatch.");
	}
}

function normalizedResponse(
	value: unknown,
	request: PreparedRequest,
): NormalizedResponse {
	assertExactKeys(
		value,
		["claimAssessments"],
		"Decision research model response",
	);
	const assessments = (value as Record<string, unknown>).claimAssessments;
	if (!Array.isArray(assessments) || assessments.length !== request.claims.length) {
		throw new Error(
			"Decision research model response must assess every exact claim once.",
		);
	}
	const expected = new Map(request.claims.map((claim) => [claim.claimDigest, claim]));
	const seen = new Set<string>();
	const normalized = assessments
		.map((assessment) => normalizedClaimAssessment(assessment, expected, seen))
		.sort((left, right) => left.claimDigest.localeCompare(right.claimDigest));
	const findingCount = normalized.reduce(
		(total, assessment) => total + assessment.findings.length,
		0,
	);
	const limitationCount = normalized.reduce(
		(total, assessment) => total + assessment.limitations.length,
		0,
	);
	if (findingCount > MAX_FINDINGS || limitationCount > MAX_LIMITATIONS) {
		throw new Error("Decision research model response exceeds output limits.");
	}
	const conclusion = aggregateModelConclusion(normalized);
	return {
		conclusion,
		findings: normalized.flatMap((assessment) => [
			`Claim ${assessment.claimDigest} assessed ${assessment.conclusion}.`,
			...assessment.findings.map(
				(finding) => `Claim ${assessment.claimDigest}: ${finding}`,
			),
		]),
		limitations: normalized.flatMap((assessment) =>
			assessment.limitations.map(
				(limitation) => `Claim ${assessment.claimDigest}: ${limitation}`,
			),
		),
	};
}

function normalizedClaimAssessment(
	assessment: unknown,
	expected: ReadonlyMap<Sha256Digest, PreparedClaim>,
	seen: Set<string>,
): NormalizedClaimAssessment {
	assertExactKeys(
		assessment,
		["claimDigest", "evidenceIds", "conclusion", "findings", "limitations"],
		"Decision research claim assessment",
	);
	const entry = assessment as Record<string, unknown>;
	const claimDigest =
		typeof entry.claimDigest === "string" &&
		/^sha256:[0-9a-f]{64}$/.test(entry.claimDigest)
			? (entry.claimDigest as Sha256Digest)
			: undefined;
	const claim = claimDigest ? expected.get(claimDigest) : undefined;
	if (!claim || seen.has(claim.claimDigest)) {
		throw new Error("Decision research claim assessment identity is invalid.");
	}
	seen.add(claim.claimDigest);
	const evidenceIds = normalizedEvidenceIds(entry.evidenceIds);
	const expectedIds = claim.citations
		.map((citation) => citation.evidenceId)
		.sort((left, right) => left.localeCompare(right));
	if (!sameTextList(evidenceIds, expectedIds)) {
		throw new Error("Decision research claim assessment Evidence binding is invalid.");
	}
	if (
		entry.conclusion !== "supported" &&
		entry.conclusion !== "unsupported" &&
		entry.conclusion !== "uncertain"
	) {
		throw new Error("Decision research claim assessment conclusion is invalid.");
	}
	const findings = normalizedTextList(entry.findings, MAX_FINDINGS, "finding");
	const limitations = normalizedTextList(
		entry.limitations,
		MAX_LIMITATIONS,
		"limitation",
	);
	if (entry.conclusion !== "supported" && findings.length + limitations.length === 0) {
		throw new Error(
			"Unsupported or uncertain claim assessment requires findings or limitations.",
		);
	}
	return {
		claimDigest: claim.claimDigest,
		conclusion: entry.conclusion,
		findings,
		limitations,
	};
}

function aggregateModelConclusion(
	assessments: readonly { conclusion: ModelConclusion }[],
): ModelConclusion {
	if (assessments.some((assessment) => assessment.conclusion === "unsupported")) {
		return "unsupported";
	}
	if (assessments.some((assessment) => assessment.conclusion === "uncertain")) {
		return "uncertain";
	}
	return "supported";
}

function normalizedEvidenceIds(value: unknown): string[] {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw new Error("Decision research claim assessment Evidence ids are invalid.");
	}
	const ids = [...value].sort((left, right) => left.localeCompare(right));
	if (new Set(ids).size !== ids.length) {
		throw new Error("Decision research claim assessment Evidence ids contain duplicates.");
	}
	return ids;
}

function normalizedTextList(
	value: unknown,
	maximum: number,
	label: string,
): readonly string[] {
	if (!Array.isArray(value) || value.length > maximum) {
		throw new Error(`Decision research model ${label} list is invalid.`);
	}
	const normalized = value.map((entry) => {
		if (typeof entry !== "string" || entry.trim().length === 0 || entry.length > 2_048) {
			throw new Error(`Decision research model ${label} is invalid.`);
		}
		return entry.trim();
	});
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`Decision research model ${label} list contains duplicates.`);
	}
	return normalized.sort((left, right) => left.localeCompare(right));
}

function sameTextList(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}
