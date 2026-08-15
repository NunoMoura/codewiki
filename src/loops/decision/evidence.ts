import {
	EVIDENCE_SCHEMA_VERSION,
	type ApprovalReceiptProvider,
	type EvidenceId,
	type EvidenceProducer,
	type EvidenceRecord,
	type EvidenceSensitivity,
	type EvidenceSubject,
} from "../../evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../evidence/materialize.ts";
import {reduceEvidenceObligation} from "../../evidence/obligations.ts";
import type {CheckCatalog} from "../../checks/catalog.ts";
import type {ResolvedExitPolicy} from "../../checks/contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import type {DecisionCandidate} from "./candidate.ts";

interface DecisionApprovalReceiptInput {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly actorId: string;
	readonly authenticatedIdentityRef: string;
	readonly role: string;
	readonly channel: "codewiki" | "git_provider";
	readonly decidedAt: string;
	readonly observedAt: string;
	readonly producer: EvidenceProducer;
	readonly sensitivity?: EvidenceSensitivity;
	readonly captureDigests?: readonly Sha256Digest[];
	readonly provider?: ApprovalReceiptProvider;
}

interface DecisionResidualRiskApprovalReceiptInput
	extends DecisionApprovalReceiptInput {
	readonly acceptedRisk: "high" | "critical";
	readonly priorApproval: EvidenceRecord<"approval_receipt">;
	readonly assessmentEvidenceRecords: readonly EvidenceRecord<"model_assessment">[];
	readonly rationaleDigest: Sha256Digest;
	readonly findingDigests: readonly Sha256Digest[];
}

interface ResolveDecisionEvidenceInput {
	readonly catalog: CheckCatalog;
	readonly policy: ResolvedExitPolicy;
	readonly subject: EvidenceSubject;
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly researchFreshnessBoundary?: string;
}

export function materializeDecisionApprovalReceipt(
	input: DecisionApprovalReceiptInput,
): EvidenceRecord<"approval_receipt"> {
	assertApprovalInput(input);
	return materializeApprovalReceipt({
		input,
		checkId: "approval_safety",
		checkVersion: "1.0.0",
		approvalScope: "candidate_exit",
	});
}

export function materializeDecisionResidualRiskApprovalReceipt(
	input: DecisionResidualRiskApprovalReceiptInput,
): EvidenceRecord<"approval_receipt"> {
	assertResidualRiskApprovalInput(input);
	const assessmentEvidenceIds = input.assessmentEvidenceRecords.map(
		(record) => record.evidenceId,
	);
	return materializeApprovalReceipt({
		input,
		checkId: "security_residual_risk_authorized",
		checkVersion: "1.0.0",
		approvalScope: "security_residual_risk",
		securityResidualRisk: {
			risk: input.acceptedRisk,
			priorApprovalEvidenceId: input.priorApproval.evidenceId,
			assessmentEvidenceIds,
			rationaleDigest: input.rationaleDigest,
			findingDigests: [...input.findingDigests],
		},
	});
}

function materializeApprovalReceipt(input: {
	readonly input: DecisionApprovalReceiptInput;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly approvalScope: "candidate_exit" | "security_residual_risk";
	readonly securityResidualRisk?: {
		readonly risk: "high" | "critical";
		readonly priorApprovalEvidenceId: EvidenceId;
		readonly assessmentEvidenceIds: readonly EvidenceId[];
		readonly rationaleDigest: Sha256Digest;
		readonly findingDigests: readonly Sha256Digest[];
	};
}): EvidenceRecord<"approval_receipt"> {
	const approval = input.input;
	const subject = decisionEvidenceSubject({
		candidate: approval.candidate,
		changeRef: approval.changeRef,
	});
	const captureDigests = [...(approval.captureDigests ?? [])].sort();
	const securityResidualRisk = input.securityResidualRisk
		? {
				...input.securityResidualRisk,
				assessmentEvidenceIds: [
					...input.securityResidualRisk.assessmentEvidenceIds,
				].sort(),
				findingDigests: [...input.securityResidualRisk.findingDigests].sort(),
			}
		: undefined;
	const bundleDigest = canonicalJsonDigest({
		candidateDigest: approval.candidate.digest,
		changeRef: approval.changeRef,
		checkId: input.checkId,
		checkVersion: input.checkVersion,
		approvalScope: input.approvalScope,
		actorId: approval.actorId,
		authenticatedIdentityRef: approval.authenticatedIdentityRef,
		role: approval.role,
		channel: approval.channel,
		decidedAt: approval.decidedAt,
		captureDigests,
		securityResidualRisk: securityResidualRisk ?? null,
		provider: approval.provider ?? null,
	});
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "approval_receipt",
			provenanceRefs: [
				approval.authenticatedIdentityRef,
				approval.changeRef,
				`check:${input.checkId}@${input.checkVersion}`,
				...(securityResidualRisk?.assessmentEvidenceIds ?? []),
			],
			payload: {
				checkId: input.checkId,
				checkVersion: input.checkVersion,
				approvalScope: input.approvalScope,
				actorId: approval.actorId,
				authenticatedIdentityRef: approval.authenticatedIdentityRef,
				role: approval.role,
				decision: "approved",
				channel: approval.channel,
				decidedAt: approval.decidedAt,
				evidenceBundleDigest: bundleDigest,
				captureDigests,
				...(securityResidualRisk
					? {securityResidualRisk}
					: {}),
				...(approval.provider ? {provider: approval.provider} : {}),
			},
		},
		{
			subject,
			observedAt: approval.observedAt,
			producer: approval.producer,
			authority: "approved",
			coverage: "complete",
			sensitivity: approval.sensitivity ?? "project",
		},
	);
}

export function resolveDecisionEvidenceObligations(
	input: ResolveDecisionEvidenceInput,
): Readonly<Record<string, readonly ReturnType<typeof reduceEvidenceObligation>[]>> {
	assertEvidenceInput(input);
	const resolutions: Record<
		string,
		readonly ReturnType<typeof reduceEvidenceObligation>[]
	> = {};
	for (const binding of input.policy.bindings) {
		const check = input.catalog.get(binding.checkId, "decision")?.check;
		if (!check || check.version !== binding.checkVersion) {
			throw new Error(`Decision Evidence Check ${binding.checkId} is unavailable.`);
		}
		const checkResolutions = check.evidenceObligations.flatMap((obligation) => {
			if (
				obligation.freshness === "exact_boundary" &&
				!input.researchFreshnessBoundary
			) {
				return [];
			}
			return [
				reduceEvidenceObligation({
					obligation,
					evidence: input.evidenceRecords.flatMap((evidence) =>
						isEvidenceForCheck({
							evidence,
							checkId: check.id,
							checkVersion: check.version,
							requiredKinds: obligation.kinds,
						})
							? [{evidence, relation: evidenceRelation(evidence)}]
							: [],
					),
					expectedSubject: input.subject,
					...(obligation.freshness === "exact_boundary"
						? {
								expectedFreshnessBoundary:
									input.researchFreshnessBoundary as string,
							}
						: {}),
				}),
			];
		});
		if (checkResolutions.length > 0) {
			resolutions[binding.checkId] = Object.freeze(checkResolutions);
		}
	}
	return Object.freeze(resolutions);
}

export function decisionEvidenceSubject(input: {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
}): EvidenceSubject {
	if (!input.candidate.observedBase.canonicalRefs.includes(input.changeRef)) {
		throw new Error("Decision Evidence changeRef is not bound by Candidate.");
	}
	return toCanonicalJsonValue({
		changeRefs: [input.changeRef],
		changeRevisionDigests: [input.candidate.content.revision.revisionId],
		candidateDigest: input.candidate.digest,
		acceptanceRequirementIds:
			input.candidate.content.revision.acceptanceRequirements.map(
				(requirement) => requirement.id,
			),
	}) as unknown as EvidenceSubject;
}

function isEvidenceForCheck(input: {
	readonly evidence: EvidenceRecord;
	readonly checkId: string;
	readonly checkVersion: string;
	readonly requiredKinds: readonly EvidenceRecord["kind"][];
}): boolean {
	if (!input.requiredKinds.includes(input.evidence.kind)) return false;
	if (
		input.evidence.kind !== "model_assessment" &&
		input.evidence.kind !== "approval_receipt"
	) {
		return true;
	}
	return (
		input.evidence.payload.checkId === input.checkId &&
		input.evidence.payload.checkVersion === input.checkVersion
	);
}

function evidenceRelation(
	evidence: EvidenceRecord,
): "supporting" | "contradictory" | "neutral" {
	if (evidence.kind !== "research_citation") return "supporting";
	if (evidence.payload.stance === "contradicts") return "contradictory";
	if (evidence.payload.stance === "mixed" || evidence.payload.stance === "context_only") {
		return "neutral";
	}
	return "supporting";
}

function assertApprovalInput(input: DecisionApprovalReceiptInput): void {
	assertExactKeys(
		input,
		[
			"candidate",
			"changeRef",
			"actorId",
			"authenticatedIdentityRef",
			"role",
			"channel",
			"decidedAt",
			"observedAt",
			"producer",
			"sensitivity",
			"captureDigests",
			"provider",
		],
		"Decision approval input",
	);
	assertApprovalFields(input);
}

function assertResidualRiskApprovalInput(
	input: DecisionResidualRiskApprovalReceiptInput,
): void {
	assertExactKeys(
		input,
		[
			"candidate",
			"changeRef",
			"actorId",
			"authenticatedIdentityRef",
			"role",
			"channel",
			"decidedAt",
			"observedAt",
			"producer",
			"sensitivity",
			"captureDigests",
			"provider",
			"acceptedRisk",
			"priorApproval",
			"assessmentEvidenceRecords",
			"rationaleDigest",
			"findingDigests",
		],
		"Decision residual-risk approval input",
	);
	assertApprovalFields(input);
	if (input.acceptedRisk !== input.candidate.content.revision.safety.risk) {
		throw new Error(
			"Decision residual-risk approval does not match Candidate risk.",
		);
	}
	if (!["security_reviewer", "security_owner", "risk_owner"].includes(input.role)) {
		throw new Error(
			"Decision residual-risk approval requires a qualified security role.",
		);
	}
	assertSha256Digest(input.rationaleDigest, "Residual-risk rationaleDigest");
	for (const digest of input.findingDigests) {
		assertSha256Digest(digest, "Residual-risk findingDigest");
	}
	if (new Set(input.findingDigests).size !== input.findingDigests.length) {
		throw new Error("Residual-risk findingDigests must be unique.");
	}
	assertPriorApproval(input);
	assertIndependentSecurityAssessments(input);
}

function assertApprovalFields(input: DecisionApprovalReceiptInput): void {
	if (input.candidate.loop !== "decision") {
		throw new Error("Decision approval requires a Decision Candidate.");
	}
	if (input.producer.kind !== "user" && input.producer.kind !== "external_service") {
		throw new Error("Decision approval producer must be user or external_service.");
	}
	for (const [label, value] of [
		["actorId", input.actorId],
		["authenticatedIdentityRef", input.authenticatedIdentityRef],
		["role", input.role],
	] as const) {
		if (!value.trim()) throw new Error(`Decision approval ${label} is required.`);
	}
	const decidedAt = Date.parse(input.decidedAt);
	const observedAt = Date.parse(input.observedAt);
	if (!Number.isFinite(decidedAt) || !Number.isFinite(observedAt)) {
		throw new Error("Decision approval timestamps are invalid.");
	}
	if (decidedAt > observedAt) {
		throw new Error("Decision approval cannot be observed before it was decided.");
	}
}

function assertPriorApproval(input: DecisionResidualRiskApprovalReceiptInput): void {
	const prior = input.priorApproval;
	if (
		prior.authority !== "approved" ||
		prior.coverage !== "complete" ||
		prior.payload.checkId !== "approval_safety" ||
		prior.payload.checkVersion !== "1.0.0" ||
		prior.payload.approvalScope !== "candidate_exit" ||
		prior.payload.decision !== "approved" ||
		prior.subject.candidateDigest !== input.candidate.digest
	) {
		throw new Error(
			"Decision residual-risk approval requires exact approved Candidate-exit Evidence.",
		);
	}
	if (
		prior.payload.authenticatedIdentityRef === input.authenticatedIdentityRef
	) {
		throw new Error(
			"Decision residual-risk authority must be independently authenticated.",
		);
	}
}

function assertIndependentSecurityAssessments(
	input: DecisionResidualRiskApprovalReceiptInput,
): void {
	const records = input.assessmentEvidenceRecords;
	const expectedCheckIds = new Set([
		"security_privacy_reviewed",
		"security_independent_challenge_reviewed",
	]);
	if (
		records.length !== 2 ||
		new Set(records.map((record) => record.evidenceId)).size !== 2 ||
		new Set(records.map((record) => record.payload.checkId)).size !== 2 ||
		records.some((record) => !expectedCheckIds.has(record.payload.checkId))
	) {
		throw new Error(
			"Decision residual-risk approval requires both independent security assessments.",
		);
	}
	if (
		records.some(
			(record) =>
				!isCompleteSupportedSecurityAssessment({
					record,
					candidateDigest: input.candidate.digest,
				}),
		)
	) {
		throw new Error(
			"Decision residual-risk approval requires complete supported Candidate-bound assessments.",
		);
	}
	if (
		new Set(records.map((record) => record.payload.routeId)).size !== 2 ||
		new Set(records.map((record) => record.payload.configurationDigest)).size !== 2 ||
		new Set(records.map((record) => record.producer.id)).size !== 2
	) {
		throw new Error(
			"Decision residual-risk assessments must use independent model routes.",
		);
	}
}

function isCompleteSupportedSecurityAssessment(input: {
	readonly record: EvidenceRecord<"model_assessment">;
	readonly candidateDigest: string;
}): boolean {
	return (
		input.record.authority === "asserted" &&
		input.record.coverage === "complete" &&
		input.record.subject.candidateDigest === input.candidateDigest &&
		input.record.payload.checkVersion === "1.0.0" &&
		input.record.payload.measurement.kind === "boolean" &&
		input.record.payload.measurement.value === true
	);
}

function assertEvidenceInput(input: ResolveDecisionEvidenceInput): void {
	assertExactKeys(
		input,
		[
			"catalog",
			"policy",
			"subject",
			"evidenceRecords",
			"researchFreshnessBoundary",
		],
		"Decision Evidence resolution input",
	);
	if (input.policy.loop !== "decision") {
		throw new Error("Decision Evidence resolution requires a Decision policy.");
	}
	if (input.subject.candidateDigest !== input.policy.candidateDigest) {
		throw new Error("Decision Evidence subject does not bind policy Candidate.");
	}
}
