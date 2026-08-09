import {DECISION_RESEARCH_CLAIMS_PROTOCOL} from "./research-claims-protocol.ts";
import type {
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
} from "../../evidence/contracts.ts";
import type {CheckCatalog} from "../../verification/catalog.ts";
import type {
	CheckDefinition,
	CheckExecutionIdentity,
	CheckResult,
} from "../../verification/contracts.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "../../verification/runner.ts";
import type {WikiModelRouteConfig} from "../../project/model-routing.ts";
import {validateNoToolModelRoute} from "../../project/model-route-validation.ts";
import {
	createDecisionResearchClaimsExecutor,
	type DecisionResearchClaimsModelObservation,
	type DecisionResearchClaimsRequest,
} from "./research-claims.ts";
import {createDecisionResearchProvenanceExecutor} from "./research.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../../utils/canonical-json.ts";

export interface DecisionResearchClaimsTransport {
	readonly execute: (
		request: DecisionResearchClaimsRequest,
		options: {readonly signal: AbortSignal},
	) => Promise<DecisionResearchClaimsModelObservation>;
}

interface CreateNativeDecisionResearchExecutorsInput {
	readonly catalog: CheckCatalog;
	readonly route: WikiModelRouteConfig;
	readonly candidateSubject: EvidenceSubject;
	readonly expectedFreshnessBoundary: string;
	readonly sensitivity: EvidenceSensitivity;
	readonly transport: DecisionResearchClaimsTransport;
}

const PROVENANCE_CHECK_ID = "research_provenance_valid";
const CLAIMS_CHECK_ID = "research_claims_supported";
const MODEL_OBLIGATION_ID = "model-assessment";

export function createDecisionResearchExecutors(
	input: CreateNativeDecisionResearchExecutorsInput,
): readonly LoopCheckExecutor[] {
	const route = validateNoToolModelRoute(
		input.route,
		"Native Decision research",
	);
	const candidateSubject = normalizedCandidateSubject(input.candidateSubject);
	const changeSubject = changeRevisionSubject(candidateSubject);
	const provenanceCheck = requiredDecisionCheck(input.catalog, PROVENANCE_CHECK_ID);
	const claimsCheck = requiredDecisionCheck(input.catalog, CLAIMS_CHECK_ID);
	const claimsExecution = claimsExecutionIdentity(claimsCheck, route);
	const provenance = createDecisionResearchProvenanceExecutor(input.catalog);
	const claims = createDecisionResearchClaimsExecutor(input.catalog);
	return Object.freeze([
		Object.freeze({
			loop: "decision" as const,
			checkId: provenanceCheck.id,
			checkVersion: provenanceCheck.version,
			execution: provenanceCheck.execution,
			execute: (context: LoopCheckExecutorContext) =>
				resultObservation(
					provenance({
						policy: context.policy,
						evidence: researchEvidence(context),
						expectedSubject: changeSubject,
						expectedFreshnessBoundary: input.expectedFreshnessBoundary,
					}),
				),
		}),
		Object.freeze({
			loop: "decision" as const,
			checkId: claimsCheck.id,
			checkVersion: claimsCheck.version,
			execution: claimsExecution,
			producesEvidenceObligationIds: [MODEL_OBLIGATION_ID],
			execute: (context: LoopCheckExecutorContext) =>
				executeClaimsCheck({
					context,
					claims,
					route,
					changeSubject,
					candidateSubject,
					expectedFreshnessBoundary: input.expectedFreshnessBoundary,
					sensitivity: input.sensitivity,
					transport: input.transport,
					claimsExecution,
				}),
		}),
	]);
}

async function executeClaimsCheck(input: {
	readonly context: LoopCheckExecutorContext;
	readonly claims: ReturnType<typeof createDecisionResearchClaimsExecutor>;
	readonly route: WikiModelRouteConfig;
	readonly changeSubject: EvidenceSubject;
	readonly candidateSubject: EvidenceSubject;
	readonly expectedFreshnessBoundary: string;
	readonly sensitivity: EvidenceSensitivity;
	readonly transport: DecisionResearchClaimsTransport;
	readonly claimsExecution: CheckExecutionIdentity;
}): Promise<CheckExecutorObservation> {
	const provenanceResult = input.context.dependencyResults.find(
		(result) => result.checkId === PROVENANCE_CHECK_ID,
	);
	if (!provenanceResult) {
		return indeterminateObservation("Decision research provenance Result is unavailable.");
	}
	const persisted = persistedClaimsObservation(input.context, provenanceResult);
	if (persisted) return persisted;
	const claimsInput = {
		policy: input.context.policy,
		provenanceResult,
		researchEvidence: researchEvidence(input.context),
		expectedChangeSubject: input.changeSubject,
		expectedFreshnessBoundary: input.expectedFreshnessBoundary,
		candidateSubject: input.candidateSubject,
		route: input.route,
		sensitivity: input.sensitivity,
	};
	const prepared = input.claims.prepare(claimsInput);
	if (prepared.status === "indeterminate") {
		return resultObservation(prepared.result, [], [], input.claimsExecution);
	}
	let observation: DecisionResearchClaimsModelObservation;
	try {
		observation = await input.transport.execute(prepared.request, {
			signal: input.context.signal,
		});
	} catch {
		observation = {
			status: input.context.signal.aborted ? "cancelled" : "provider_failure",
			requestDigest: prepared.request.requestDigest,
		};
	}
	const completion = input.claims.complete(claimsInput, observation);
	const modelResolutions = completion.result.evidenceResolutions.filter(
		(resolution) => resolution.obligationId === MODEL_OBLIGATION_ID,
	);
	return resultObservation(
		completion.result,
		completion.evidenceRecords,
		modelResolutions,
		input.claimsExecution,
	);
}

function persistedClaimsObservation(
	context: LoopCheckExecutorContext,
	provenanceResult: CheckResult,
): CheckExecutorObservation | null {
	const resolution = context.evidenceResolutions.find(
		(candidate) =>
			candidate.obligationId === MODEL_OBLIGATION_ID &&
			candidate.status === "ready",
	);
	if (!resolution) return null;
	if (provenanceResult.status !== "pass") {
		return indeterminateObservation(
			`Decision research provenance dependency is ${provenanceResult.status}.`,
		);
	}
	const eligible = new Set(resolution.eligibleEvidenceIds);
	const assessments = context.evidenceRecords
		.filter(isModelAssessment)
		.filter(
			(record) =>
				eligible.has(record.evidenceId) &&
				record.payload.checkId === CLAIMS_CHECK_ID,
		);
	if (assessments.length !== 1) {
		return indeterminateObservation(
			"Persisted Decision research assessment is ambiguous or unavailable.",
		);
	}
	const assessment = assessments[0];
	const findings = [
		...assessment.payload.findings,
		...assessment.payload.limitations.map(
			(limitation) => `Limitation: ${limitation}`,
		),
	];
	if (assessment.payload.measurement.kind === "boolean") {
		const supported = assessment.payload.measurement.value;
		return {
			disposition: supported ? "satisfied" : "unsatisfied",
			measurement: {shape: "boolean", value: supported},
			findings,
			...(supported ? {} : {issueClass: "research_claim_support"}),
		};
	}
	if (
		assessment.payload.measurement.kind === "label" &&
		assessment.payload.measurement.value === "uncertain"
	) {
		return {
			disposition: "indeterminate",
			findings,
			issueClass: "research_claim_support",
		};
	}
	return indeterminateObservation(
		"Persisted Decision research assessment measurement is invalid.",
	);
}

function resultObservation(
	result: CheckResult,
	producedEvidenceRecords: readonly EvidenceRecord[] = [],
	producedEvidenceResolutions: readonly CheckResult["evidenceResolutions"][number][] = [],
	expectedExecution?: CheckExecutionIdentity,
): CheckExecutorObservation {
	if (
		expectedExecution &&
		canonicalJsonDigest(result.execution) !== canonicalJsonDigest(expectedExecution)
	) {
		throw new Error(`Decision research Check ${result.checkId} execution identity drifted.`);
	}
	const disposition = resultDisposition(result.status);
	return {
		disposition,
		...(result.measurement ? {measurement: result.measurement} : {}),
		findings: [...result.findings],
		...(result.issueClass ? {issueClass: result.issueClass} : {}),
		...(result.feedback ? {feedback: result.feedback} : {}),
		...(producedEvidenceRecords.length > 0
			? {producedEvidenceRecords: [...producedEvidenceRecords]}
			: {}),
		...(producedEvidenceResolutions.length > 0
			? {producedEvidenceResolutions: [...producedEvidenceResolutions]}
			: {}),
	};
}

function resultDisposition(
	status: CheckResult["status"],
): CheckExecutorObservation["disposition"] {
	if (status === "pass") return "satisfied";
	if (status === "fail") return "unsatisfied";
	return "indeterminate";
}

function indeterminateObservation(finding: string): CheckExecutorObservation {
	return {
		disposition: "indeterminate",
		findings: [finding],
		issueClass: "research_evidence",
	};
}

function researchEvidence(context: LoopCheckExecutorContext): EvidenceRecord[] {
	return context.evidenceRecords.filter(
		(record) => record.kind === "research_citation",
	);
}

function isModelAssessment(
	record: EvidenceRecord,
): record is EvidenceRecord<"model_assessment"> {
	return record.kind === "model_assessment";
}

function claimsExecutionIdentity(
	check: CheckDefinition,
	route: WikiModelRouteConfig,
): CheckExecutionIdentity {
	return {
		...check.execution,
		adapterVersion: DECISION_RESEARCH_CLAIMS_PROTOCOL.version,
		modelRef: `${route.provider}/${route.model}`,
		configurationDigest: canonicalJsonDigest({
			protocol: DECISION_RESEARCH_CLAIMS_PROTOCOL,
			checkId: check.id,
			checkVersion: check.version,
			route,
		}),
		trialPolicy: "single-observation",
		aggregationPolicy: "direct",
	};
}

function normalizedCandidateSubject(subject: EvidenceSubject): EvidenceSubject {
	if (
		!subject.candidateDigest ||
		subject.changeRefs.length !== 1 ||
		subject.changeRevisionDigests.length !== 1
	) {
		throw new Error("Native Decision research subject is invalid.");
	}
	return toCanonicalJsonValue(subject) as unknown as EvidenceSubject;
}

function changeRevisionSubject(subject: EvidenceSubject): EvidenceSubject {
	return toCanonicalJsonValue({
		changeRefs: [...subject.changeRefs],
		changeRevisionDigests: [...subject.changeRevisionDigests],
		acceptanceRequirementIds: [],
	}) as unknown as EvidenceSubject;
}

function requiredDecisionCheck(
	catalog: CheckCatalog,
	checkId: string,
): CheckDefinition {
	const registration = catalog.get(checkId, "decision");
	if (!registration) throw new Error(`Decision research Check ${checkId} is unavailable.`);
	return registration.check;
}
