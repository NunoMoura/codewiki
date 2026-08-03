import type {
	BaseSnapshot,
	ChangeRevisionContent,
	OperationId,
} from "../../change-trace/contracts.ts";
import {
	changeById,
	type ChangeWorkState,
	type ProjectWorkState,
	type RelationshipProjection,
} from "../../change-trace/state.ts";
import {createLoopCandidate, type LoopCandidate} from "../../loop-exit/identity.ts";
import {
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	parseDecisionCandidateProposal,
	type DecisionCandidateProposal,
	type DecisionDisposition,
} from "../candidate-proposal.ts";

const DECISION_CANDIDATE_SCHEMA_VERSION = "2.0.0" as const;

export interface DecisionSemanticRevision extends ChangeRevisionContent {
	readonly ordinal: number;
	readonly revisionId: Sha256Digest;
}

export interface DecisionRelationshipBinding {
	readonly operationId: OperationId;
	readonly relationshipId: Sha256Digest;
	readonly type: string;
	readonly sourceRevisionId: Sha256Digest;
	readonly targetChangeId: string;
	readonly targetRevisionId: Sha256Digest;
}

export interface DecisionOverlapBinding {
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly sharedTargetRefs: readonly string[];
	readonly accountingRelationshipIds: readonly Sha256Digest[];
	readonly accountedByRelationship: boolean;
}

export type DecisionCandidateContent = CanonicalJsonValue & {
	readonly changeId: string;
	readonly disposition: DecisionDisposition;
	readonly rationale: string;
	readonly revision: DecisionSemanticRevision;
	readonly relationships: readonly DecisionRelationshipBinding[];
	readonly activeOverlaps: readonly DecisionOverlapBinding[];
};

export type DecisionCandidate = LoopCandidate<
	"decision",
	DecisionCandidateContent
>;

export interface CreateDecisionCandidateInput {
	readonly state: ProjectWorkState;
	readonly changeId: string;
	readonly proposal: DecisionCandidateProposal;
}

export function createDecisionCandidate(
	input: CreateDecisionCandidateInput,
): DecisionCandidate {
	const change = currentDecisionChange({
		state: input.state,
		changeId: input.changeId,
	});
	const revision = change.currentRevision;
	if (!revision) {
		throw new Error(`Decision Candidate Change ${input.changeId} has no revision.`);
	}
	const proposal = parseDecisionCandidateProposal(input.proposal);
	const content = materializeDecisionCandidateContent({
		state: input.state,
		change,
		proposal,
	});
	return createLoopCandidate<"decision", DecisionCandidateContent>({
		loop: "decision",
		schemaVersion: DECISION_CANDIDATE_SCHEMA_VERSION,
		content,
		observedBase: decisionObservedBase({state: input.state, change}),
	});
}

function materializeDecisionCandidateContent(input: {
	readonly state: ProjectWorkState;
	readonly change: ChangeWorkState;
	readonly proposal: DecisionCandidateProposal;
}): DecisionCandidateContent {
	const revision = input.change.currentRevision;
	if (!revision) {
		throw new Error(`Decision Candidate Change ${input.change.changeId} has no revision.`);
	}
	const ordinal = input.change.revisionIds.indexOf(revision.revisionId) + 1;
	if (ordinal < 1) {
		throw new Error("Decision Candidate current revision is absent from revision history.");
	}
	return toCanonicalJsonValue({
		changeId: input.change.changeId,
		disposition: input.proposal.disposition,
		rationale: input.proposal.rationale,
		revision: {
			ordinal,
			revisionId: revision.revisionId,
			...revision.content,
		},
		relationships: activeRelationships(input.change),
		activeOverlaps: activeOverlapBindings({
			change: input.change,
			state: input.state,
		}),
	}) as unknown as DecisionCandidateContent;
}

function currentDecisionChange(input: {
	readonly state: ProjectWorkState;
	readonly changeId: string;
}): ChangeWorkState {
	const {state, changeId} = input;
	const change = changeById(state, changeId);
	if (!change?.currentRevision || change.withdrawn) {
		throw new Error(
			`Decision Candidate requires current non-withdrawn Change ${changeId}.`,
		);
	}
	if (!state.observedBase) {
		throw new Error("Decision Candidate requires an observed project base.");
	}
	return change;
}

function decisionObservedBase(input: {
	readonly state: ProjectWorkState;
	readonly change: ChangeWorkState;
}): {
	readonly workStateDigest: Sha256Digest;
	readonly knowledgeSnapshotDigest: Sha256Digest;
	readonly canonicalRefs: readonly string[];
} {
	const {state, change} = input;
	const base = state.observedBase as BaseSnapshot;
	const revision = change.currentRevision;
	if (!revision) {
		throw new Error(`Decision Candidate Change ${change.changeId} has no revision.`);
	}
	return {
		workStateDigest: state.workStateDigest,
		knowledgeSnapshotDigest: base.knowledgeDigest,
		canonicalRefs: sortedUnique([
			`change:${change.changeId}`,
			revision.revisionId,
			change.tailOperationId,
			`source:${base.sourceHead}`,
			`config:${base.configDigest}`,
			`policy:${base.policyDigest}`,
			...(base.remoteStateHead ? [`state:${base.remoteStateHead}`] : []),
		]),
	};
}

function activeRelationships(
	change: ChangeWorkState,
): DecisionRelationshipBinding[] {
	return change.relationships
		.filter((relationship) => !relationship.supersededByOperationId)
		.map(relationshipBinding)
		.sort(compareRelationships);
}

function relationshipBinding(
	relationship: RelationshipProjection,
): DecisionRelationshipBinding {
	return {
		operationId: relationship.operationId,
		relationshipId: relationship.relationshipId,
		type: relationship.type,
		sourceRevisionId: relationship.sourceRevisionId,
		targetChangeId: relationship.targetChangeId,
		targetRevisionId: relationship.targetRevisionId,
	};
}

function activeOverlapBindings(input: {
	readonly change: ChangeWorkState;
	readonly state: ProjectWorkState;
}): DecisionOverlapBinding[] {
	const {change, state} = input;
	const currentRevision = change.currentRevision;
	if (!currentRevision) return [];
	const targetRefs = new Set(currentRevision.content.classification.targetRefs);
	return state.changes
		.flatMap((candidate) => {
			if (
				candidate.changeId === change.changeId ||
				candidate.withdrawn ||
				!candidate.currentRevision
			) {
				return [];
			}
			const sharedTargetRefs = candidate.currentRevision.content.classification.targetRefs
				.filter((ref) => targetRefs.has(ref))
				.sort(compareText);
			if (sharedTargetRefs.length === 0) return [];
			const accountingRelationshipIds = relationshipIdsBetween({
				left: change,
				right: candidate,
			});
			return [
				{
					changeId: candidate.changeId,
					changeRevisionId: candidate.currentRevision.revisionId,
					sharedTargetRefs,
					accountingRelationshipIds,
					accountedByRelationship: accountingRelationshipIds.length > 0,
				},
			];
		})
		.sort((left, right) => compareText(left.changeId, right.changeId));
}

function relationshipIdsBetween(input: {
	readonly left: ChangeWorkState;
	readonly right: ChangeWorkState;
}): Sha256Digest[] {
	const {left, right} = input;
	return sortedUnique([
		...left.relationships
			.filter(
				(relationship) =>
					!relationship.supersededByOperationId &&
					relationship.targetChangeId === right.changeId,
			)
			.map((relationship) => relationship.relationshipId),
		...right.relationships
			.filter(
				(relationship) =>
					!relationship.supersededByOperationId &&
					relationship.targetChangeId === left.changeId,
			)
			.map((relationship) => relationship.relationshipId),
	]);
}

function compareRelationships(
	...values: [DecisionRelationshipBinding, DecisionRelationshipBinding]
): number {
	const [left, right] = values;
	return compareText(
		`${left.type}:${left.targetChangeId}:${left.relationshipId}`,
		`${right.type}:${right.targetChangeId}:${right.relationshipId}`,
	);
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort(compareText);
}

function compareText(...values: [string, string]): number {
	const [left, right] = values;
	if (left === right) return 0;
	return left < right ? -1 : 1;
}
