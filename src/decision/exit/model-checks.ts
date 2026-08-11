import {
	EVIDENCE_SCHEMA_VERSION,
	type EvidenceId,
	type EvidenceRecord,
	type EvidenceSubject,
	type ModelSecurityChallengeFinding,
} from "../../evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../evidence/materialize.ts";
import {modelConclusionEvidenceMeasurement} from "../../evidence/model-assessment.ts";
import type {ModelCheckEvaluatorPort} from "../../harnesses/ports.ts";
import {reduceEvidenceObligation} from "../../evidence/obligations.ts";
import type {CheckCatalog} from "../../verification/catalog.ts";
import {
	createCustomCheckEvaluatorBinding,
	normalizeCustomCheckEvaluatorAssessment,
	normalizeCustomCheckEvaluatorStandardBindings,
	type CustomCheckEvaluatorAssessmentExtension,
	type CustomCheckEvaluatorBinding,
} from "../../verification/custom-checks/model-evaluator.ts";
import type {CheckDefinition} from "../../verification/contracts.ts";
import {
	assertSecuritySurfaceClassification,
	type SecuritySurfaceClassification,
} from "../../verification/security-surfaces.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "../../verification/runner.ts";
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

export const DECISION_MODEL_CHECK_REQUEST_PROTOCOL = Object.freeze({
	id: "codewiki.decision.model-check-request",
	version: "5.0.0",
	maxRequestBytes: 262_144,
	maxFindings: 32,
	maxLimitations: 32,
	maxTextLength: 2_000,
});

export interface DecisionModelCheckRequest {
	readonly protocolId: typeof DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly candidate: DecisionCandidate;
	readonly check: {
		readonly id: string;
		readonly version: string;
		readonly digest: Sha256Digest;
		readonly description: string;
		readonly requirement: string;
		readonly customCheck?: CustomCheckEvaluatorBinding;
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
	readonly protocolId: typeof DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly conclusion: "supported" | "unsupported" | "uncertain";
	readonly consideredEvidenceIds: readonly EvidenceId[];
	readonly findings: readonly string[];
	readonly limitations: readonly string[];
	readonly securityFindings?: readonly ModelSecurityChallengeFinding[];
	readonly customCheckAssessment?: CustomCheckEvaluatorAssessmentExtension;
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

export type DecisionModelCheckTransport = ModelCheckEvaluatorPort<
	DecisionModelCheckRequest,
	DecisionModelCheckObservation
>;

interface CreateDecisionModelCheckExecutorsInput {
	readonly catalog: CheckCatalog;
	readonly route: WikiModelRouteConfig;
	readonly subject: EvidenceSubject;
	readonly transport: DecisionModelCheckTransport;
	readonly includeCheckIds?: readonly string[];
	readonly excludeCheckIds?: readonly string[];
}

const SPECIALIZED_MODEL_CHECK_IDS = new Set(["research_claims_supported"]);
const MODEL_CONCLUSION_VOCABULARY_DIGEST = canonicalJsonDigest({
	protocolId: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id,
	protocolVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
	labels: ["uncertain"],
});

export function createDecisionModelCheckExecutors(
	input: CreateDecisionModelCheckExecutorsInput,
): readonly LoopCheckExecutor[] {
	const route = validateNoToolModelRoute(input.route, "Decision Model Check");
	const subject = normalizedSubject(input.subject);
	const included = input.includeCheckIds
		? new Set(input.includeCheckIds)
		: undefined;
	const excluded = new Set(input.excludeCheckIds ?? []);
	return Object.freeze(
		input.catalog.list("decision").flatMap((registration) =>
			registration.check.execution.kind === "model" &&
			!SPECIALIZED_MODEL_CHECK_IDS.has(registration.check.id) &&
			(!included || included.has(registration.check.id)) &&
			!excluded.has(registration.check.id)
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
		protocol: DECISION_MODEL_CHECK_REQUEST_PROTOCOL,
		execution: input.check.execution,
		route: input.route,
	});
	return Object.freeze({
		loop: "decision",
		checkId: input.check.id,
		checkVersion: input.check.version,
		execution: {
			...input.check.execution,
			adapterVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
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
	const request = modelCheckRequest(input);
	const ready = input.context.evidenceResolutions.find(
		(resolution) =>
			resolution.obligationId === "model-assessment" &&
			resolution.status === "ready",
	);
	if (ready) {
		return observationFromPersistedEvidence({
			context: input.context,
			eligibleEvidenceIds: ready.eligibleEvidenceIds,
			request,
		});
	}
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
	const review = modelCheckReview(input.context);
	const body = {
		protocolId: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id,
		protocolVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
		candidate: input.context.candidate,
		check: {
			id: input.context.check.id,
			version: input.context.check.version,
			digest: input.context.binding.checkDigest,
			description: input.context.check.description,
			requirement: input.context.check.requirement,
			...customCheckRequestMetadata({
				context: input.context,
				route: input.route,
				configurationDigest: input.configurationDigest,
				consideredEvidenceIds: review.consideredEvidenceIds,
			}),
		},
		route: {
			id: input.route.id,
			provider: input.route.provider,
			model: input.route.model,
			thinking: input.route.thinking,
		},
		configurationDigest: input.configurationDigest,
		review,
	};
	const request = toCanonicalJsonValue({
		...body,
		requestDigest: canonicalJsonDigest(body),
	}) as unknown as DecisionModelCheckRequest;
	if (Buffer.byteLength(canonicalJson(request), "utf8") > DECISION_MODEL_CHECK_REQUEST_PROTOCOL.maxRequestBytes) {
		throw new Error("Decision Model Check request exceeds protocol limit.");
	}
	return request;
}

function customCheckRequestMetadata(input: {
	readonly context: LoopCheckExecutorContext;
	readonly route: WikiModelRouteConfig;
	readonly configurationDigest: Sha256Digest;
	readonly consideredEvidenceIds: readonly EvidenceId[];
}): Pick<DecisionModelCheckRequest["check"], "customCheck"> | Record<string, never> {
	const parameters = input.context.binding.parameters;
	if (parameters.customCheckId === undefined) return {};
	const protectedSourceHead = requiredParameterText(
		parameters.protectedSourceHead,
		"protectedSourceHead",
	);
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(protectedSourceHead)) {
		throw new Error("Custom Check Model request has invalid protected source head.");
	}
	const knowledgeRefs = parameters.knowledgeRefs;
	if (!Array.isArray(knowledgeRefs) || knowledgeRefs.some((value) => typeof value !== "string")) {
		throw new Error("Custom Check Model request has invalid Knowledge refs.");
	}
	const repairGuidance = parameters.repairGuidance;
	if (repairGuidance !== undefined && typeof repairGuidance !== "string") {
		throw new Error("Custom Check Model request has invalid repair guidance.");
	}
	return {
		customCheck: createCustomCheckEvaluatorBinding({
			customCheckId: requiredParameterText(parameters.customCheckId, "customCheckId"),
			definitionDigest: requiredDigestParameter(
				parameters.customCheckDefinitionDigest,
				"customCheckDefinitionDigest",
			),
			checkTypeId: requiredParameterText(parameters.customCheckTypeId, "customCheckTypeId"),
			checkTypeVersion: requiredParameterText(
				parameters.customCheckTypeVersion,
				"customCheckTypeVersion",
			),
			evaluatorId: requiredParameterText(parameters.checkEvaluatorId, "checkEvaluatorId"),
			candidateDigest: input.context.candidate.digest,
			checkId: input.context.check.id,
			checkVersion: input.context.check.version,
			checkDigest: requiredDigestParameter(
				input.context.binding.checkDigest,
				"checkDigest",
			),
			protectedSourceHead,
			protectedConfigDigest: requiredDigestParameter(
				parameters.protectedConfigDigest,
				"protectedConfigDigest",
			),
			customCheckConfigDigest: requiredDigestParameter(
				parameters.customCheckConfigDigest,
				"customCheckConfigDigest",
			),
			protectedConfigSnapshotDigest: requiredDigestParameter(
				parameters.protectedCustomCheckConfigSnapshotDigest,
				"protectedCustomCheckConfigSnapshotDigest",
			),
			standardBindings: normalizeCustomCheckEvaluatorStandardBindings(
				parameters.standardBindings,
			),
			knowledgeRefs: knowledgeRefs as string[],
			...(repairGuidance ? {repairGuidance} : {}),
			consideredEvidenceIds: [...input.consideredEvidenceIds],
			prerequisiteResults: input.context.dependencyResults.map((result) => ({
				checkId: result.checkId,
				checkVersion: result.checkVersion,
				resultDigest: requiredDigestParameter(
					result.resultDigest,
					"prerequisiteResultDigest",
				),
				status: result.status,
				evidenceInputDigest: requiredDigestParameter(
					result.evidenceInputDigest,
					"prerequisiteEvidenceInputDigest",
				),
			})),
			route: {
				id: input.route.id,
				provider: input.route.provider,
				model: input.route.model,
			},
			configurationDigest: input.configurationDigest,
		}),
	};
}

function requiredParameterText(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Custom Check Model request has invalid ${field}.`);
	}
	return value;
}

function requiredDigestParameter(
	value: unknown,
	field: string,
): Sha256Digest {
	const digest = requiredParameterText(value, field);
	if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
		throw new Error(`Custom Check Model request has invalid ${field}.`);
	}
	return digest as Sha256Digest;
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
			findings: result.findings.map((finding) => finding.message),
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
		context.check.id === "security_independent_challenge_reviewed" ||
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
				protocolId: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id,
				protocolVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
				requestDigest: input.request.requestDigest,
				assessmentDigest: canonicalJsonDigest(input.response),
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
				...(input.response.customCheckAssessment && input.request.check.customCheck
					? {
							customCheck: {
								evaluatorBindingDigest:
									input.response.customCheckAssessment.evaluatorBindingDigest,
								customCheckId: input.response.customCheckAssessment.customCheckId,
								definitionDigest:
									input.response.customCheckAssessment.definitionDigest,
								checkTypeId: input.response.customCheckAssessment.checkTypeId,
								checkTypeVersion:
									input.response.customCheckAssessment.checkTypeVersion,
								evaluatorId: input.response.customCheckAssessment.evaluatorId,
								standardDigests: input.request.check.customCheck.standardBindings.map(
									(standard) => standard.standardDigest,
								),
								prerequisiteResultDigests: [
									...input.response.customCheckAssessment.prerequisiteResultDigests,
								],
								evidenceGaps: [...input.response.customCheckAssessment.evidenceGaps],
								counterevidence: [
									...input.response.customCheckAssessment.counterevidence,
								],
								coverage: input.response.customCheckAssessment.coverage,
								truncated: input.response.customCheckAssessment.truncated,
								repairTargetRefs:
									input.response.customCheckAssessment.repair?.targetRefs ?? [],
							},
						}
					: {}),
			},
		},
		{
			subject: input.subject,
			observedAt: input.observedAt,
			producer: {
				kind: "model",
				id: `${input.route.provider}/${input.route.model}`,
				version: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
			},
			authority:
				input.context.check.id === "security_privacy_reviewed" ||
				input.context.check.id === "security_independent_challenge_reviewed"
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
		...(response.customCheckAssessment?.repair
			? {feedback: response.customCheckAssessment.repair.summary}
			: {}),
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

function observationFromPersistedEvidence(input: {
	readonly context: LoopCheckExecutorContext;
	readonly eligibleEvidenceIds: readonly string[];
	readonly request: DecisionModelCheckRequest;
}): CheckExecutorObservation {
	const eligible = new Set(input.eligibleEvidenceIds);
	const assessments = input.context.evidenceRecords
		.filter(isModelAssessmentEvidence)
		.filter(
			(record) =>
				eligible.has(record.evidenceId) &&
				record.payload.checkId === input.context.check.id &&
				record.payload.checkVersion === input.context.check.version &&
				record.payload.requestDigest === input.request.requestDigest &&
				persistedCustomAssessmentMatches({
					record,
					binding: input.request.check.customCheck,
				}),
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

function persistedCustomAssessmentMatches(input: {
	readonly record: EvidenceRecord<"model_assessment">;
	readonly binding: CustomCheckEvaluatorBinding | undefined;
}): boolean {
	const assessment = input.record.payload.customCheck;
	if (!input.binding) return assessment === undefined;
	if (!assessment) return false;
	return (
		assessment.evaluatorBindingDigest === input.binding.evaluatorBindingDigest &&
		assessment.customCheckId === input.binding.customCheckId &&
		assessment.definitionDigest === input.binding.definitionDigest &&
		assessment.checkTypeId === input.binding.checkTypeId &&
		assessment.checkTypeVersion === input.binding.checkTypeVersion &&
		assessment.evaluatorId === input.binding.evaluatorId &&
		JSON.stringify(assessment.standardDigests) ===
			JSON.stringify(
				input.binding.standardBindings.map((standard) => standard.standardDigest),
			) &&
		JSON.stringify(assessment.prerequisiteResultDigests) ===
			JSON.stringify(
				input.binding.prerequisiteResults.map((result) => result.resultDigest),
			)
	);
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
	if (request.check.customCheck) {
		responseKeys.push("customCheckAssessment");
	}
	assertExactKeys(value, responseKeys, "Decision Model Check response");
	const response = value as Record<string, unknown>;
	assertResponseIdentity({response, request});
	assertResponseConclusion(response.conclusion);
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
		DECISION_MODEL_CHECK_REQUEST_PROTOCOL.maxFindings,
		"findings",
	);
	const limitations = normalizedTextList(
		response.limitations,
		DECISION_MODEL_CHECK_REQUEST_PROTOCOL.maxLimitations,
		"limitations",
	);
	const securityFindings =
		request.review.mode === "security_challenge"
			? normalizedSecurityFindings(
					response.securityFindings,
					consideredEvidenceIds,
				)
			: undefined;
	const customCheckAssessment = normalizedCustomCheckAssessment({
		request,
		value: response.customCheckAssessment,
	});
	assertCustomCheckAssessmentBasis({
		conclusion: response.conclusion,
		assessment: customCheckAssessment,
	});
	assertAssessmentBasis(
		response.conclusion,
		findings,
		limitations,
		securityFindings,
	);
	return {
		protocolId: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id,
		protocolVersion: DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version,
		requestDigest: response.requestDigest as Sha256Digest,
		checkId: response.checkId as string,
		checkVersion: response.checkVersion as string,
		conclusion: response.conclusion,
		consideredEvidenceIds,
		findings,
		limitations,
		...(securityFindings ? {securityFindings} : {}),
		...(customCheckAssessment ? {customCheckAssessment} : {}),
	};
}

function assertResponseIdentity(input: {
	readonly response: Readonly<Record<string, unknown>>;
	readonly request: DecisionModelCheckRequest;
}): void {
	if (
		input.response.protocolId !== DECISION_MODEL_CHECK_REQUEST_PROTOCOL.id ||
		input.response.protocolVersion !== DECISION_MODEL_CHECK_REQUEST_PROTOCOL.version ||
		input.response.requestDigest !== input.request.requestDigest ||
		input.response.checkId !== input.request.check.id ||
		input.response.checkVersion !== input.request.check.version
	) {
		throw new Error("Decision Model Check response identity does not match request.");
	}
}

function assertResponseConclusion(
	value: unknown,
): asserts value is DecisionModelCheckResponse["conclusion"] {
	if (value !== "supported" && value !== "unsupported" && value !== "uncertain") {
		throw new Error("Decision Model Check response conclusion is invalid.");
	}
}

function assertCustomCheckAssessmentBasis(input: {
	readonly conclusion: DecisionModelCheckResponse["conclusion"];
	readonly assessment: CustomCheckEvaluatorAssessmentExtension | undefined;
}): void {
	if (!input.assessment) return;
	if (
		input.conclusion === "supported" &&
		(input.assessment.coverage !== "complete" ||
			input.assessment.truncated ||
			input.assessment.evidenceGaps.length > 0 ||
			input.assessment.counterevidence.length > 0)
	) {
		throw new Error(
			"Supported Custom Check Assessment requires complete untruncated Evidence without gaps or counterevidence.",
		);
	}
	if (input.conclusion === "unsupported" && !input.assessment.repair) {
		throw new Error("Unsupported Custom Check Assessment requires bounded repair output.");
	}
}

function normalizedCustomCheckAssessment(input: {
	readonly request: DecisionModelCheckRequest;
	readonly value: unknown;
}): CustomCheckEvaluatorAssessmentExtension | undefined {
	if (!input.request.check.customCheck) return undefined;
	return normalizeCustomCheckEvaluatorAssessment({
		value: input.value,
		binding: input.request.check.customCheck,
	});
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function normalizedSecurityFindings(
	value: unknown,
	consideredEvidenceIds: readonly EvidenceId[],
): ModelSecurityChallengeFinding[] {
	if (!Array.isArray(value) || value.length > DECISION_MODEL_CHECK_REQUEST_PROTOCOL.maxFindings) {
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
		value.length > DECISION_MODEL_CHECK_REQUEST_PROTOCOL.maxTextLength
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
			entry.length > DECISION_MODEL_CHECK_REQUEST_PROTOCOL.maxTextLength
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
