import {
	EVIDENCE_SCHEMA_VERSION,
	type ApprovalReceiptProvider,
	type EvidenceProducer,
	type EvidenceRecord,
	type EvidenceSensitivity,
	type EvidenceSubject,
} from "../../evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../evidence/materialize.ts";
import {reduceEvidenceObligation} from "../../evidence/obligations.ts";
import type {CheckCatalog} from "../../loop-exit/catalog.ts";
import type {ResolvedExitPolicy} from "../../loop-exit/contracts.ts";
import {
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
	const subject = decisionEvidenceSubject(input.candidate, input.changeRef);
	const bundleDigest = canonicalJsonDigest({
		candidateDigest: input.candidate.digest,
		changeRef: input.changeRef,
		actorId: input.actorId,
		authenticatedIdentityRef: input.authenticatedIdentityRef,
		role: input.role,
		channel: input.channel,
		decidedAt: input.decidedAt,
		captureDigests: input.captureDigests ?? [],
		provider: input.provider ?? null,
	});
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "approval_receipt",
			provenanceRefs: [input.authenticatedIdentityRef, input.changeRef],
			payload: {
				actorId: input.actorId,
				authenticatedIdentityRef: input.authenticatedIdentityRef,
				role: input.role,
				decision: "approved",
				channel: input.channel,
				decidedAt: input.decidedAt,
				evidenceBundleDigest: bundleDigest,
				captureDigests: [...(input.captureDigests ?? [])],
				...(input.provider ? {provider: input.provider} : {}),
			},
		},
		{
			subject,
			observedAt: input.observedAt,
			producer: input.producer,
			authority: "approved",
			coverage: "complete",
			sensitivity: input.sensitivity ?? "project",
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
						isEvidenceForCheck(
							evidence,
							check.id,
							check.version,
							obligation.kinds,
						)
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

export function decisionEvidenceSubject(
	candidate: DecisionCandidate,
	changeRef: string,
): EvidenceSubject {
	if (!candidate.observedBase.canonicalRefs.includes(changeRef)) {
		throw new Error("Decision Evidence changeRef is not bound by Candidate.");
	}
	return toCanonicalJsonValue({
		changeRefs: [changeRef],
		changeRevisionDigests: [candidate.content.revision.revisionId],
		candidateDigest: candidate.digest,
		acceptanceRequirementIds: candidate.content.revision.acceptanceRequirements.map(
			(requirement) => requirement.id,
		),
	}) as unknown as EvidenceSubject;
}

function isEvidenceForCheck(
	evidence: EvidenceRecord,
	checkId: string,
	checkVersion: string,
	requiredKinds: readonly EvidenceRecord["kind"][],
): boolean {
	if (!requiredKinds.includes(evidence.kind)) return false;
	if (evidence.kind !== "model_assessment") return true;
	return (
		evidence.payload.checkId === checkId &&
		evidence.payload.checkVersion === checkVersion
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
