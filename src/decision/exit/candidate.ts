import {changeContentDigest} from "../../changes/digest.ts";
import type {ChangeLink, ChangeRecord} from "../../changes/records.ts";
import type {
	ChangeClassification,
	ChangeDeliveryConstraints,
	ChangeEstimates,
	ChangeEvidence,
	ChangeImpact,
	ChangeIntent,
	ChangeKnowledgeImpact,
	ChangeOutcomeContract,
	ChangeProvenance,
	ChangeSafety,
	ChangeValidationIssue,
} from "../../changes/types.ts";
import {
	createLoopCandidate,
	type CandidateObservedBase,
	type LoopCandidate,
} from "../../loop-exit/identity.ts";
import {
	toCanonicalJsonValue,
	type CanonicalJsonValue,
} from "../../utils/canonical-json.ts";
import type {WorkState} from "../../work-state/types.ts";
import type {
	DecisionCandidateProposal,
	DecisionDisposition,
} from "../candidate-proposal.ts";

const DECISION_CANDIDATE_SCHEMA_VERSION = "1.0.0" as const;

export interface DecisionSemanticRevision {
	readonly revision: number;
	readonly intent: ChangeIntent;
	readonly classification: ChangeClassification;
	readonly impact: ChangeImpact;
	readonly knowledge: ChangeKnowledgeImpact;
	readonly outcome: ChangeOutcomeContract;
	readonly delivery: ChangeDeliveryConstraints;
	readonly evidence: ChangeEvidence;
	readonly safety: ChangeSafety;
	readonly estimates: ChangeEstimates;
	readonly provenance: ChangeProvenance;
}

export interface DecisionValidationBinding {
	readonly revisionDigest: string;
	readonly state: "unknown" | "valid" | "invalid";
	readonly validatedRevision: number | null;
	readonly validatedDigest: string | null;
	readonly issues: readonly ChangeValidationIssue[];
}

export interface DecisionRelationshipBinding {
	readonly relation: ChangeLink["relation"];
	readonly targetChangeRef: string;
}

export interface DecisionOverlapBinding {
	readonly changeRef: string;
	readonly status: string;
	readonly sharedTargetRefs: readonly string[];
	readonly accountedByRelationship: boolean;
}

export type DecisionCandidateContent = CanonicalJsonValue & {
	readonly disposition: DecisionDisposition;
	readonly rationale: string;
	readonly revision: DecisionSemanticRevision;
	readonly validation: DecisionValidationBinding;
	readonly relationships: readonly DecisionRelationshipBinding[];
	readonly activeOverlaps: readonly DecisionOverlapBinding[];
	readonly groundingRefs: readonly string[];
	readonly unresolvedFacts: readonly string[];
};

export type DecisionCandidate = LoopCandidate<
	"decision",
	DecisionCandidateContent
>;

interface CreateDecisionCandidateInput {
	readonly record: ChangeRecord;
	readonly workState: WorkState;
	readonly proposal: DecisionCandidateProposal;
	readonly observedBase: CandidateObservedBase;
}

export function createDecisionCandidate(
	input: CreateDecisionCandidateInput,
): DecisionCandidate {
	assertCandidateBase(input);
	const content = materializeDecisionCandidateContent(input);
	return createLoopCandidate<"decision", DecisionCandidateContent>({
		loop: "decision",
		schemaVersion: DECISION_CANDIDATE_SCHEMA_VERSION,
		content,
		observedBase: input.observedBase,
	});
}

function materializeDecisionCandidateContent(
	input: Pick<CreateDecisionCandidateInput, "record" | "workState" | "proposal">,
): DecisionCandidateContent {
	const change = input.record.change;
	return toCanonicalJsonValue({
		disposition: input.proposal.disposition,
		rationale: input.proposal.rationale,
		revision: {
			revision: change.revision,
			intent: change.intent,
			classification: change.classification,
			impact: definedFields(change.impact),
			knowledge: definedFields(change.knowledge),
			outcome: change.outcome,
			delivery: change.delivery,
			evidence: definedFields(change.evidence),
			safety: definedFields(change.safety),
			estimates: change.estimates,
			provenance: normalizedProvenance(change.provenance),
		},
		validation: {
			revisionDigest: changeContentDigest(change),
			state: change.validation.state,
			validatedRevision: change.validation.validatedRevision ?? null,
			validatedDigest: change.validation.validatedDigest ?? null,
			issues: change.validation.issues,
		},
		relationships: input.record.links
			.map((link) => ({
				relation: link.relation,
				targetChangeRef: `change:${link.targetChangeId}`,
			}))
			.sort(compareRelationships),
		activeOverlaps: activeOverlapBindings(input.record, input.workState),
		groundingRefs: sortedUnique([
			...change.evidence.sourceRefs,
			...change.evidence.proofRefs,
			...change.knowledge.topicRefs,
			...change.knowledge.propagationRefs,
		]),
		unresolvedFacts: sortedUnique(
			change.validation.issues.flatMap((issue) =>
				issue.severity === "information" ? [] : [issue.code],
			),
		),
	}) as unknown as DecisionCandidateContent;
}

function assertCandidateBase(input: CreateDecisionCandidateInput): void {
	const projected = input.workState.changes.find(
		(change) => change.id === input.record.change.id,
	);
	if (
		!projected ||
		projected.record.recordRevision !== input.record.recordRevision ||
		changeContentDigest(projected.record.change) !==
			changeContentDigest(input.record.change)
	) {
		throw new Error(
			"Decision Candidate Change record does not match current WorkState.",
		);
	}
	if (input.observedBase.workStateDigest !== input.workState.snapshotDigest) {
		throw new Error(
			"Decision Candidate observed WorkState digest does not match current WorkState.",
		);
	}
}

function activeOverlapBindings(
	record: ChangeRecord,
	workState: WorkState,
): DecisionOverlapBinding[] {
	const targetRefs = new Set(record.change.classification.targetRefs);
	return workState.changes
		.flatMap((candidate) => {
			if (
				candidate.id === record.change.id ||
				["rejected", "withdrawn", "deferred"].includes(
					candidate.record.change.status,
				)
			) {
				return [];
			}
			const sharedTargetRefs = candidate.record.change.classification.targetRefs
				.filter((ref) => targetRefs.has(ref))
				.sort(compareText);
			if (sharedTargetRefs.length === 0) return [];
			return [
				{
					changeRef: `change:${candidate.id}`,
					status: candidate.record.change.status,
					sharedTargetRefs,
					accountedByRelationship: changesAreLinked(
						record,
						candidate.record,
					),
				},
			];
		})
		.sort((left, right) => compareText(left.changeRef, right.changeRef));
}

function changesAreLinked(left: ChangeRecord, right: ChangeRecord): boolean {
	return (
		left.links.some((link) => link.targetChangeId === right.change.id) ||
		right.links.some((link) => link.targetChangeId === left.change.id)
	);
}

function compareRelationships(
	left: DecisionRelationshipBinding,
	right: DecisionRelationshipBinding,
): number {
	return compareText(
		`${left.relation}:${left.targetChangeRef}`,
		`${right.relation}:${right.targetChangeRef}`,
	);
}

function normalizedProvenance(
	value: ChangeProvenance,
): ChangeProvenance {
	return {
		...definedFields(value),
		...(value.discoveredWhile
			? {discoveredWhile: definedFields(value.discoveredWhile)}
			: {}),
	};
}

function definedFields<T extends object>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter((entry) => entry[1] !== undefined),
	) as T;
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
	if (left === right) return 0;
	return left < right ? -1 : 1;
}
