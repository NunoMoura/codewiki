import {
	EVIDENCE_SCHEMA_VERSION,
	type EvidenceMeasurement,
	type EvidenceRecord,
	type EvidenceSubject,
} from "../../evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../evidence/materialize.ts";
import {reduceEvidenceObligation} from "../../evidence/obligations.ts";
import type {CheckCatalog} from "../../loop-exit/catalog.ts";
import type {CheckDefinition} from "../../loop-exit/contracts.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "../../loop-exit/runner.ts";
import {
	resolveWikiModelRoutingConfig,
	type WikiModelRouteConfig,
} from "../../project/model-routing.ts";
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
	version: "1.0.0",
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
	};
	readonly route: {
		readonly id: string;
		readonly provider: string;
		readonly model: string;
		readonly thinking: WikiModelRouteConfig["thinking"];
	};
	readonly configurationDigest: Sha256Digest;
}

interface DecisionModelCheckResponse {
	readonly protocolId: typeof DECISION_MODEL_CHECK_PROTOCOL.id;
	readonly protocolVersion: typeof DECISION_MODEL_CHECK_PROTOCOL.version;
	readonly requestDigest: Sha256Digest;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly conclusion: "supported" | "unsupported" | "uncertain";
	readonly findings: readonly string[];
	readonly limitations: readonly string[];
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
	const route = validatedRoute(input.route);
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
		},
		route: {
			id: input.route.id,
			provider: input.route.provider,
			model: input.route.model,
			thinking: input.route.thinking,
		},
		configurationDigest: input.configurationDigest,
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
				measurement: evidenceMeasurement(input.response.conclusion),
				findings: [...input.response.findings],
				limitations: [...input.response.limitations],
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
			authority: "observed",
			coverage: "complete",
			sensitivity: "project",
		},
	);
}

function evidenceMeasurement(
	conclusion: DecisionModelCheckResponse["conclusion"],
): EvidenceMeasurement {
	if (conclusion === "supported") return {kind: "boolean", value: true};
	if (conclusion === "unsupported") return {kind: "boolean", value: false};
	return {
		kind: "label",
		value: "uncertain",
		vocabularyDigest: MODEL_CONCLUSION_VOCABULARY_DIGEST,
	};
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
	assertExactKeys(
		value,
		[
			"protocolId",
			"protocolVersion",
			"requestDigest",
			"checkId",
			"checkVersion",
			"conclusion",
			"findings",
			"limitations",
		],
		"Decision Model Check response",
	);
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
	return {
		protocolId: response.protocolId,
		protocolVersion: response.protocolVersion,
		requestDigest: response.requestDigest as Sha256Digest,
		checkId: response.checkId as string,
		checkVersion: response.checkVersion as string,
		conclusion: response.conclusion,
		findings: normalizedTextList(
			response.findings,
			DECISION_MODEL_CHECK_PROTOCOL.maxFindings,
			"findings",
		),
		limitations: normalizedTextList(
			response.limitations,
			DECISION_MODEL_CHECK_PROTOCOL.maxLimitations,
			"limitations",
		),
	};
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

function validatedRoute(route: WikiModelRouteConfig): WikiModelRouteConfig {
	const routing = resolveWikiModelRoutingConfig({
		qualityFloor: route.quality,
		routes: [route],
	});
	const [validated] = routing.routes;
	if (routing.routes.length !== 1 || validated.allowedTools[0] !== undefined) {
		throw new Error("Decision Model Check route must disable all tools.");
	}
	return validated;
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
