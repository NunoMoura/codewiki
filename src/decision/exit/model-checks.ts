import {
	EVIDENCE_SCHEMA_VERSION,
	type EvidenceId,
	type EvidenceRecord,
	type EvidenceSubject,
	type ModelSecurityChallengeFinding,
} from "../../evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../evidence/materialize.ts";
import {modelConclusionEvidenceMeasurement} from "../../evidence/model-assessment.ts";
import {reduceEvidenceObligation} from "../../evidence/obligations.ts";
import type {CheckCatalog} from "../../loop-exit/catalog.ts";
import type {CheckDefinition} from "../../loop-exit/contracts.ts";
import {
	assertSecuritySurfaceClassification,
	type SecuritySurfaceClassification,
} from "../../loop-exit/security-surfaces.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "../../loop-exit/runner.ts";
import type {WikiModelRouteConfig} from "../../project/model-routing.ts";
import {validateNoToolModelRoute} from "../../project/model-route-validation.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import type {DecisionCandidate} from "./candidate.ts";

export const DECISION_MODEL_CHECK_PROTOCOL = Object.freeze({
	id: "codewiki.decision.model-check",
	version: "1.2.0",
	maxRequestBytes: 262_144,
	maxFindings: 32,
	maxLimitations: 32,
	maxTextLength: 2_000,
});

export interface DecisionModelCheckRequest {
	readonly protocolId: typeof DECISION_MODEL_CHECK_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_MODEL_CHECK_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly candidate: DecisionCandidate;
	readonly check: {
		readonly id: string;
		readonly version: string;
		readonly digest: Sha256Digest;
		readonly description: string;
		readonly requirement: string;
		readonly customCheck?: {
			readonly customCheckId: string;
			readonly revision: number;
			readonly contentDigest: Sha256Digest;
			readonly checkTypeId: string;
			readonly checkTypeVersion: string;
			readonly evaluatorId: string;
			readonly knowledgeRefs: readonly string[];
			readonly repairGuidance?: string;
		};
	};
	readonly route: {
		readonly id: string;
		readonly provider: string;
		readonly model: string;
		readonly thinking: WikiModelRouteConfig["thinking"];
	};
	readonly configurationDigest: Sha256Digest;
	readonly review: {
		readonly mode: "balanced" | "security_challenge";
		readonly consideredEvidenceIds: readonly EvidenceId[];
		readonly evidenceRecords: readonly EvidenceRecord[];
		readonly dependencyResults: readonly {
			readonly checkId: string;
			readonly checkVersion: string;
			readonly status: "pass" | "fail" | "indeterminate";
			readonly evidenceRecordIds: readonly string[];
			readonly findings: readonly string[];
		}[];
		readonly securitySurfaceClassification: SecuritySurfaceClassification | null;
	};
}

interface DecisionModelCheckResponse {
	readonly protocolId: typeof DECISION_MODEL_CHECK_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_MODEL_CHECK_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly conclusion: "supported" | "unsupported" | "uncertain";
	readonly consideredEvidenceIds: readonly EvidenceId[];
	readonly findings: readonly string[];
	readonly limitations: readonly string[];
	readonly securityFindings?: readonly ModelSecurityChallengeFinding[];
}

export type DecisionModelCheckObservation =
	| {
			readonly status: "completed";
			readonly observedAt: string;
			readonly response: unknown;
	  }
	| {
			readonly status:
				| "timeout"
				| "provider_failure"
				| "unavailable"
				| "cancelled";
			readonly observedAt: string;
	  };

export interface DecisionModelCheckTransport {
	readonly execute: (
		request: DecisionModelCheckRequest,
		options: {readonly signal: AbortSignal; readonly timeoutMs: number},
	) => Promise<DecisionModelCheckObservation>;
}

interface CreateDecisionModelCheckExecutorsInput {
	readonly catalog: CheckCatalog;
	readonly route: WikiModelRouteConfig;
	readonly subject: EvidenceSubject;
	readonly transport: DecisionModelCheckTransport;
}

const SPECIALIZED_MODEL_CHECK_IDS = new Set(["research_claims_supported"]);
const MODEL_CONCLUSION_VOCABULARY_DIGEST = canonicalJsonDigest({
	protocolId: DECISION_MODEL_CHECK_PROTOCOL.id,
	protocolVersion: DECISION_MODEL_CHECK_PROTOCOL.version,
	labels: ["uncertain"],
});

export function createDecisionModelCheckExecutors(
	input: CreateDecisionModelCheckExecutorsInput,
): readonly LoopCheckExecutor[] {
	const route = validateNoToolModelRoute(input.route, "Decision Model Check");
	const subject = normalizedSubject(input.subject);
	return Object.freeze(
		input.catalog.list("decision").flatMap((registration) =>
			registration.check.execution.kind === "model" &&
			!SPECIALIZED_MODEL_CHECK_IDS.has(registration.check.id)
				? [
						modelCheckExecutor({
							check: registration.check,
							route,
							subject,
							transport: input.transport,
						}),
					]
				: [],
		),
	);
}

function modelCheckExecutor(input: {
	readonly check: CheckDefinition;
	readonly route: WikiModelRouteConfig;
	readonly subject: EvidenceSubject;
	readonly transport: DecisionModelCheckTransport;
}): LoopCheckExecutor {
	const obligation = input.check.evidenceObligations.find(
		(candidate) => candidate.id === "model-assessment",
	);
	if (!obligation || input.check.evidenceObligations.length !== 1) {
		throw new Error(
			`Decision Model Check ${input.check.id} must declare exactly one model-assessment obligation.`,
		);
	}
	const configurationDigest = canonicalJsonDigest({
		protocol: DECISION_MODEL_CHECK_PROTOCOL,
		execution: input.check.execution,
		route: input.route,
	});
	return Object.freeze({
		loop: "decision",
		checkId: input.check.id,
		checkVersion: input.check.version,
		execution: {
			...input.check.execution,
			adapterVersion: DECISION_MODEL_CHECK_PROTOCOL.version,
			modelRef: `${input.route.provider}/${input.route.model}`,
			configurationDigest,
		},
		producesEvidenceObligationIds: [obligation.id],
		execute: (context: LoopCheckExecutorContext) =>
			executeModelCheck({
				context,
				route: input.route,
				subject: input.subject,
				transport: input.transport,
				configurationDigest,
			}),
	});
}

async function executeModelCheck(input: {
	readonly context: LoopCheckExecutorContext;
	readonly route: WikiModelRouteConfig;
	readonly subject: EvidenceSubject;
	readonly transport: DecisionModelCheckTransport;
	readonly configurationDigest: Sha256Digest;
}): Promise<CheckExecutorObservation> {
	assertCandidateSubject(input.context.candidate, input.subject);
	const ready = input.context.evidenceResolutions.find(
		(resolution) =>
			resolution.obligationId === "model-assessment" &&
			resolution.status === "ready",
	);
	if (ready) {
		return observationFromPersistedEvidence(input.context, ready.eligibleEvidenceIds);
	}
	const request = modelCheckRequest(input);
	let observation: DecisionModelCheckObservation;
	try {
		observation = await input.transport.execute(request, {
			signal: input.context.signal,
			timeoutMs: Math.min(input.route.timeoutMs, input.context.check.timeoutMs),
		});
	} catch {
		return operationalObservation("provider_failure");
	}
	if (observation.status !== "completed") {
		return operationalObservation(observation.status);
	}
	let response: DecisionModelCheckResponse;
	try {
		response = normalizedResponse(observation.response, request);
	} catch {
		return {
			disposition: "indeterminate",
			findings: ["Decision Model Check returned malformed output; details were redacted."],
			issueClass: "model_output",
		};
	}
	const evidence = modelAssessmentEvidence({
		context: input.context,
		subject: input.subject,
		route: input.route,
		request,
		response,
		observedAt: observation.observedAt,
	});
	const obligation = input.context.check.evidenceObligations[0];
	const resolution = reduceEvidenceObligation({
		obligation,
		evidence: [{evidence, relation: "supporting"}],
		expectedSubject: input.subject,
	});
	return responseObservation(response, evidence, resolution);
}

function modelCheckRequest(input: {
	readonly context: LoopCheckExecutorContext;
	readonly route: WikiModelRouteConfig;
	readonly configurationDigest: Sha256Digest;
}): DecisionModelCheckRequest {
	const body = {
		protocolId: DECISION_MODEL_CHECK_PROTOCOL.id,
		protocolVersion: DECISION_MODEL_CHECK_PROTOCOL.version,
		candidate: input.context.candidate,
		check: {
			id: input.context.check.id,
			version: input.context.check.version,
			digest: input.context.binding.checkDigest,
			description: input.context.check.description,
			requirement: input.context.check.requirement,
			...customCheckRequestMetadata(input.context),
		},
		route: {
			id: input.route.id,
			provider: input.route.provider,
			model: input.route.model,
			thinking: input.route.thinking,
		},
		configurationDigest: input.configurationDigest,
		review: modelCheckReview(input.context),
	};
	const request = toCanonicalJsonValue({
		...body,
		requestDigest: canonicalJsonDigest(body),
	}) as unknown as DecisionModelCheckRequest;
	if (Buffer.byteLength(canonicalJson(request), "utf8") > DECISION_MODEL_CHECK_PROTOCOL.maxRequestBytes) {
		throw new Error("Decision Model Check request exceeds protocol limit.");
	}
	return request;
}

function customCheckRequestMetadata(
	context: LoopCheckExecutorContext,
): Pick<DecisionModelCheckRequest["check"], "customCheck"> | Record<string, never> {
	const parameters = context.binding.parameters;
	if (parameters.customCheckId === undefined) return {};
	const customCheckId = requiredParameterText(parameters.customCheckId, "customCheckId");
	const revision = parameters.customCheckRevision;
	if (!Number.isInteger(revision) || Number(revision) < 1) {
		throw new Error("Custom Check Model request has invalid revision.");
	}
	const contentDigest = requiredParameterText(
		parameters.customCheckContentDigest,
		"customCheckContentDigest",
	) as Sha256Digest;
	if (!/^sha256:[0-9a-f]{64}$/u.test(contentDigest)) {
		throw new Error("Custom Check Model request has invalid content digest.");
	}
	const knowledgeRefs = parameters.knowledgeRefs;
	if (!Array.isArray(knowledgeRefs)) {
		throw new Error("Custom Check Model request has invalid Knowledge refs.");
	}
	const normalizedKnowledgeRefs = knowledgeRefs.map((value) => {
		if (typeof value !== "string") {
			throw new Error("Custom Check Model request has invalid Knowledge refs.");
		}
		return value;
	});
	const repairGuidance = parameters.repairGuidance;
	if (repairGuidance !== undefined && typeof repairGuidance !== "string") {
		throw new Error("Custom Check Model request has invalid repair guidance.");
	}
	return {
		customCheck: {
			customCheckId,
			revision: Number(revision),
			contentDigest,
			checkTypeId: requiredParameterText(
				parameters.customCheckTypeId,
				"customCheckTypeId",
			),
			checkTypeVersion: requiredParameterText(
				parameters.customCheckTypeVersion,
				"customCheckTypeVersion",
			),
			evaluatorId: requiredParameterText(
				parameters.checkEvaluatorId,
				"checkEvaluatorId",
			),
			knowledgeRefs: normalizedKnowledgeRefs,
			...(repairGuidance ? { repairGuidance } : {}),
		},
	};
}

function requiredParameterText(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Custom Check Model request has invalid ${field}.`);
	}
	return value;
}

function modelCheckReview(
	context: LoopCheckExecutorContext,
): DecisionModelCheckRequest["review"] {
	const dependencyResults = [...context.dependencyResults]
		.map((result) => ({
			checkId: result.checkId,
			checkVersion: result.checkVersion,
			status: result.status,
			evidenceRecordIds: [...result.evidenceRecordIds].sort(compareText),
			findings: [...result.findings],
		}))
		.sort((left, right) => left.checkId.localeCompare(right.checkId));
	const dependencyEvidenceIds = new Set(
		dependencyResults.flatMap((result) => result.evidenceRecordIds),
	);
	const evidenceRecords = context.evidenceRecords
		.filter(
			(record) =>
				dependencyEvidenceIds.has(record.evidenceId) &&
				record.sensitivity !== "private",
		)
		.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
	const consideredEvidenceIds = evidenceRecords.map((record) => record.evidenceId);
	let securitySurfaceClassification: SecuritySurfaceClassification | null = null;
	const securityChallenge =
		context.check.id === "security_privacy_reviewed" ||
		context.binding.parameters.customCheckTypeId === "security_and_privacy";
	if (securityChallenge) {
		const configured = context.binding.parameters.securitySurfaceClassification;
		if (configured !== undefined) {
			securitySurfaceClassification =
				configured as unknown as SecuritySurfaceClassification;
			assertSecuritySurfaceClassification(securitySurfaceClassification);
		}
	}
	return {
		mode: securityChallenge ? "security_challenge" : "balanced",
		consideredEvidenceIds,
		evidenceRecords,
		dependencyResults,
		securitySurfaceClassification,
	};
}

function modelAssessmentEvidence(input: {
	readonly context: LoopCheckExecutorContext;
	readonly subject: EvidenceSubject;
	readonly route: WikiModelRouteConfig;
	readonly request: DecisionModelCheckRequest;
	readonly response: DecisionModelCheckResponse;
	readonly observedAt: string;
}): EvidenceRecord<"model_assessment"> {
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "model_assessment",
			provenanceRefs: [`model-request:${input.request.requestDigest}`],
			payload: {
				checkId: input.context.check.id,
				checkVersion: input.context.check.version,
				protocolId: DECISION_MODEL_CHECK_PROTOCOL.id,
				protocolVersion: DECISION_MODEL_CHECK_PROTOCOL.version,
				routeId: input.route.id,
				configurationDigest: input.request.configurationDigest,
				measurement: modelConclusionEvidenceMeasurement(
					input.response.conclusion,
					MODEL_CONCLUSION_VOCABULARY_DIGEST,
				),
				consideredEvidenceIds: [...input.response.consideredEvidenceIds],
				findings: [...input.response.findings],
				limitations: [...input.response.limitations],
				...(input.response.securityFindings
					? {securityFindings: [...input.response.securityFindings]}
					: {}),
			},
		},
		{
			subject: input.subject,
			observedAt: input.observedAt,
			producer: {
				kind: "model",
				id: `${input.route.provider}/${input.route.model}`,
				version: DECISION_MODEL_CHECK_PROTOCOL.version,
			},
			authority:
				input.context.check.id === "security_privacy_reviewed"
					? "asserted"
					: "observed",
			coverage: "complete",
			sensitivity: "project",
		},
	);
}

function responseObservation(
	response: DecisionModelCheckResponse,
	evidence: EvidenceRecord<"model_assessment">,
	resolution: ReturnType<typeof reduceEvidenceObligation>,
): CheckExecutorObservation {
	const disposition = modelDisposition(response.conclusion);
	return {
		disposition,
		...(disposition !== "indeterminate"
			? {
					measurement: {
						shape: "boolean" as const,
						value: response.conclusion === "supported",
					},
				}
			: {}),
		findings: [
			...response.findings,
			...response.limitations.map((limitation) => `Limitation: ${limitation}`),
		],
		...(disposition === "unsatisfied" ? {issueClass: "model_assessment"} : {}),
		...(disposition === "indeterminate" ? {issueClass: "model_uncertainty"} : {}),
		producedEvidenceRecords: [evidence],
		producedEvidenceResolutions: [resolution],
	};
}

function modelDisposition(
	conclusion: DecisionModelCheckResponse["conclusion"],
): CheckExecutorObservation["disposition"] {
	if (conclusion === "supported") return "satisfied";
	if (conclusion === "unsupported") return "unsatisfied";
	return "indeterminate";
}

function observationFromPersistedEvidence(
	context: LoopCheckExecutorContext,
	eligibleEvidenceIds: readonly string[],
): CheckExecutorObservation {
	const eligible = new Set(eligibleEvidenceIds);
	const assessments = context.evidenceRecords
		.filter(isModelAssessmentEvidence)
		.filter(
			(record) =>
				eligible.has(record.evidenceId) &&
				record.payload.checkId === context.check.id &&
				record.payload.checkVersion === context.check.version,
		);
	if (assessments.length !== 1) {
		return {
			disposition: "indeterminate",
			findings: ["Persisted Decision Model assessment is ambiguous or unavailable."],
			issueClass: "model_evidence",
		};
	}
	const assessment = assessments[0];
	const measurement = assessment.payload.measurement;
	if (
		measurement.kind === "label" &&
		measurement.value === "uncertain" &&
		measurement.vocabularyDigest === MODEL_CONCLUSION_VOCABULARY_DIGEST
	) {
		return {
			disposition: "indeterminate",
			findings: [
				...assessment.payload.findings,
				...assessment.payload.limitations.map(
					(limitation) => `Limitation: ${limitation}`,
				),
			],
			issueClass: "model_uncertainty",
		};
	}
	if (measurement.kind !== "boolean") {
		return {
			disposition: "indeterminate",
			findings: ["Persisted Decision Model assessment measurement is invalid."],
			issueClass: "model_evidence",
		};
	}
	return {
		disposition: measurement.value ? "satisfied" : "unsatisfied",
		measurement: {shape: "boolean", value: measurement.value},
		findings: [
			...assessment.payload.findings,
			...assessment.payload.limitations.map(
				(limitation) => `Limitation: ${limitation}`,
			),
		],
		...(!measurement.value ? {issueClass: "model_assessment"} : {}),
	};
}

function isModelAssessmentEvidence(
	record: EvidenceRecord,
): record is EvidenceRecord<"model_assessment"> {
	return record.kind === "model_assessment";
}

function operationalObservation(
	status: Exclude<DecisionModelCheckObservation["status"], "completed">,
): CheckExecutorObservation {
	return {
		disposition: "indeterminate",
		findings: [`Decision Model Check ${status.replaceAll("_", " ")}.`],
		issueClass: "model_transport",
	};
}

function normalizedResponse(
	value: unknown,
	request: DecisionModelCheckRequest,
): DecisionModelCheckResponse {
	const responseKeys = [
		"protocolId",
		"protocolVersion",
		"requestDigest",
		"checkId",
		"checkVersion",
		"conclusion",
		"consideredEvidenceIds",
		"findings",
		"limitations",
	];
	if (request.review.mode === "security_challenge") {
		responseKeys.push("securityFindings");
	}
	assertExactKeys(value, responseKeys, "Decision Model Check response");
	const response = value as Record<string, unknown>;
	if (
		response.protocolId !== DECISION_MODEL_CHECK_PROTOCOL.id ||
		response.protocolVersion !== DECISION_MODEL_CHECK_PROTOCOL.version ||
		response.requestDigest !== request.requestDigest ||
		response.checkId !== request.check.id ||
		response.checkVersion !== request.check.version
	) {
		throw new Error("Decision Model Check response identity does not match request.");
	}
	if (
		response.conclusion !== "supported" &&
		response.conclusion !== "unsupported" &&
		response.conclusion !== "uncertain"
	) {
		throw new Error("Decision Model Check response conclusion is invalid.");
	}
	const consideredEvidenceIds = normalizedEvidenceIds(
		response.consideredEvidenceIds,
	);
	if (
		JSON.stringify(consideredEvidenceIds) !==
		JSON.stringify(request.review.consideredEvidenceIds)
	) {
		throw new Error("Decision Model Check considered Evidence does not match request.");
	}
	const findings = normalizedTextList(
		response.findings,
		DECISION_MODEL_CHECK_PROTOCOL.maxFindings,
		"findings",
	);
	const limitations = normalizedTextList(
		response.limitations,
		DECISION_MODEL_CHECK_PROTOCOL.maxLimitations,
		"limitations",
	);
	const securityFindings =
		request.review.mode === "security_challenge"
			? normalizedSecurityFindings(
					response.securityFindings,
					consideredEvidenceIds,
				)
			: undefined;
	assertAssessmentBasis(
		response.conclusion,
		findings,
		limitations,
		securityFindings,
	);
	return {
		protocolId: response.protocolId,
		protocolVersion: response.protocolVersion,
		requestDigest: response.requestDigest as Sha256Digest,
		checkId: response.checkId as string,
		checkVersion: response.checkVersion as string,
		conclusion: response.conclusion,
		consideredEvidenceIds,
		findings,
		limitations,
		...(securityFindings ? {securityFindings} : {}),
	};
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function normalizedSecurityFindings(
	value: unknown,
	consideredEvidenceIds: readonly EvidenceId[],
): ModelSecurityChallengeFinding[] {
	if (!Array.isArray(value) || value.length > DECISION_MODEL_CHECK_PROTOCOL.maxFindings) {
		throw new Error("Decision Model Check securityFindings are invalid.");
	}
	return value.map((entry, index) =>
		normalizedSecurityFinding(entry, index, consideredEvidenceIds),
	);
}

function normalizedSecurityFinding(
	value: unknown,
	index: number,
	consideredEvidenceIds: readonly EvidenceId[],
): ModelSecurityChallengeFinding {
	const label = `securityFindings[${index}]`;
	assertExactKeys(
		value,
		[
			"threatGoal",
			"preconditions",
			"attackPath",
			"violatedInvariants",
			"candidateRefs",
			"evidenceIds",
			"claimedSeverity",
			"confidence",
			"mitigations",
			"limitations",
		],
		`Decision Model Check ${label}`,
	);
	const finding = value as Record<string, unknown>;
	const threatGoal = normalizedRequiredText(finding.threatGoal, `${label}.threatGoal`);
	const attackPath = normalizedRequiredText(finding.attackPath, `${label}.attackPath`);
	const evidenceIds = normalizedEvidenceIds(finding.evidenceIds);
	if (evidenceIds.some((id) => !consideredEvidenceIds.includes(id))) {
		throw new Error(`Decision Model Check ${label} cites unconsidered Evidence.`);
	}
	if (
		finding.claimedSeverity !== "unknown" &&
		finding.claimedSeverity !== "low" &&
		finding.claimedSeverity !== "medium" &&
		finding.claimedSeverity !== "high" &&
		finding.claimedSeverity !== "critical"
	) {
		throw new Error(`Decision Model Check ${label}.claimedSeverity is invalid.`);
	}
	if (
		finding.confidence !== "low" &&
		finding.confidence !== "medium" &&
		finding.confidence !== "high"
	) {
		throw new Error(`Decision Model Check ${label}.confidence is invalid.`);
	}
	return {
		threatGoal,
		preconditions: normalizedTextList(finding.preconditions, 32, `${label}.preconditions`),
		attackPath,
		violatedInvariants: normalizedTextList(
			finding.violatedInvariants,
			32,
			`${label}.violatedInvariants`,
		),
		candidateRefs: normalizedTextList(finding.candidateRefs, 64, `${label}.candidateRefs`),
		evidenceIds,
		claimedSeverity: finding.claimedSeverity,
		confidence: finding.confidence,
		mitigations: normalizedTextList(finding.mitigations, 32, `${label}.mitigations`),
		limitations: normalizedTextList(finding.limitations, 32, `${label}.limitations`),
	};
}

function normalizedRequiredText(value: unknown, label: string): string {
	if (
		typeof value !== "string" ||
		!value.trim() ||
		value.length > DECISION_MODEL_CHECK_PROTOCOL.maxTextLength
	) {
		throw new Error(`Decision Model Check ${label} is invalid.`);
	}
	return value.trim();
}

function normalizedEvidenceIds(value: unknown): EvidenceId[] {
	const ids = normalizedTextList(value, 256, "consideredEvidenceIds");
	if (
		ids.some((id) => !/^evidence:[a-z_]+:[0-9a-f]{64}$/.test(id)) ||
		new Set(ids).size !== ids.length
	) {
		throw new Error("Decision Model Check consideredEvidenceIds are invalid.");
	}
	return ids as EvidenceId[];
}

function assertAssessmentBasis(
	conclusion: DecisionModelCheckResponse["conclusion"],
	findings: readonly string[],
	limitations: readonly string[],
	securityFindings: readonly ModelSecurityChallengeFinding[] | undefined,
): void {
	if (conclusion === "supported" && findings.length === 0) {
		throw new Error("Supported Decision Model Check response requires positive basis.");
	}
	if (conclusion === "unsupported" && findings.length === 0) {
		throw new Error("Unsupported Decision Model Check response requires a finding.");
	}
	if (conclusion === "uncertain" && findings.length === 0 && limitations.length === 0) {
		throw new Error("Uncertain Decision Model Check response requires an Evidence gap or limitation.");
	}
	if (conclusion === "supported" && securityFindings?.length) {
		throw new Error("Supported security challenge cannot include attack-path findings.");
	}
	if (conclusion === "unsupported" && securityFindings && securityFindings.length === 0) {
		throw new Error("Unsupported security challenge requires an attack-path finding.");
	}
}

function normalizedTextList(
	value: unknown,
	maximum: number,
	label: string,
): string[] {
	if (!Array.isArray(value) || value.length > maximum) {
		throw new Error(`Decision Model Check ${label} is invalid.`);
	}
	return value.map((entry) => {
		if (
			typeof entry !== "string" ||
			entry.trim().length === 0 ||
			entry.length > DECISION_MODEL_CHECK_PROTOCOL.maxTextLength
		) {
			throw new Error(`Decision Model Check ${label} entry is invalid.`);
		}
		return entry.trim();
	});
}

function normalizedSubject(subject: EvidenceSubject): EvidenceSubject {
	return toCanonicalJsonValue(subject) as unknown as EvidenceSubject;
}

function assertCandidateSubject(
	candidate: LoopCheckExecutorContext["candidate"],
	subject: EvidenceSubject,
): void {
	if (candidate.loop !== "decision" || subject.candidateDigest !== candidate.digest) {
		throw new Error("Decision Model Check subject does not bind Candidate.");
	}
	if (subject.changeRefs.length === 0 || subject.changeRevisionDigests.length === 0) {
		throw new Error("Decision Model Check subject does not bind Change revision.");
	}
}
