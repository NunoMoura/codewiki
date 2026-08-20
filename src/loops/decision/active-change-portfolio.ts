import type {
	ChangeRevision,
	ChangeRevisionContent,
	OperationId,
} from "../../changes/trace/contracts.ts";
import {operationPayload} from "../../changes/trace/identity.ts";
import type {
	ChangeWorkState,
	ProjectWorkState,
	RelationshipProjection,
} from "../../changes/trace/state.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
export const ACTIVE_CHANGE_PORTFOLIO_SCHEMA_VERSION = "1.0.0" as const;
export const ACTIVE_CHANGE_COMPATIBILITY_CHECK_ID =
	"active_change_compatibility" as const;

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

export interface DecisionActiveChangeBinding {
	readonly changeId: string;
	readonly revision: DecisionSemanticRevision;
	readonly relationships: readonly DecisionRelationshipBinding[];
}

export interface DecisionActivePortfolioBinding {
	readonly schemaVersion: typeof ACTIVE_CHANGE_PORTFOLIO_SCHEMA_VERSION;
	readonly requiredCheckId: typeof ACTIVE_CHANGE_COMPATIBILITY_CHECK_ID;
	readonly digest: Sha256Digest;
	readonly workGraphDigest: Sha256Digest;
	readonly expectedChangeIds: readonly string[];
	readonly comparedChangeIds: readonly string[];
	readonly coverage: "complete";
	readonly changes: readonly DecisionActiveChangeBinding[];
}

export function bindDecisionActivePortfolio(input: {
	readonly state: ProjectWorkState;
	readonly subjectChangeId: string;
}): DecisionActivePortfolioBinding {
	const changes = input.state.changes
		.flatMap((change) => {
			if (change.changeId === input.subjectChangeId) return [];
			const revision = acceptedNonterminalRevision(change);
			if (!revision) return [];
			return [
				{
					changeId: change.changeId,
					revision: semanticRevision(change, revision),
					relationships: activeRelationshipBindings(change, revision.revisionId),
				},
			];
		})
		.sort((left, right) => compareText(left.changeId, right.changeId));
	const expectedChangeIds = changes.map((change) => change.changeId);
	const workGraphDigest = acceptedWorkGraphDigest(input.state);
	const content = toCanonicalJsonValue({
		schemaVersion: ACTIVE_CHANGE_PORTFOLIO_SCHEMA_VERSION,
		requiredCheckId: ACTIVE_CHANGE_COMPATIBILITY_CHECK_ID,
		workGraphDigest,
		expectedChangeIds,
		comparedChangeIds: expectedChangeIds,
		coverage: "complete",
		changes,
	});
	return Object.freeze({
		...(content as unknown as Omit<DecisionActivePortfolioBinding, "digest">),
		digest: canonicalJsonDigest(content),
	});
}

export function assertDecisionActivePortfolioBinding(
	value: unknown,
): asserts value is DecisionActivePortfolioBinding {
	if (!value || typeof value !== "object") {
		throw new Error("Decision active portfolio binding must be an object.");
	}
	const binding = value as DecisionActivePortfolioBinding;
	if (
		binding.schemaVersion !== ACTIVE_CHANGE_PORTFOLIO_SCHEMA_VERSION ||
		binding.requiredCheckId !== ACTIVE_CHANGE_COMPATIBILITY_CHECK_ID ||
		binding.coverage !== "complete" ||
		!Array.isArray(binding.changes) ||
		!Array.isArray(binding.expectedChangeIds) ||
		!Array.isArray(binding.comparedChangeIds)
	) {
		throw new Error("Decision active portfolio coverage is incomplete.");
	}
	const changeIds = binding.changes.map((change) => change.changeId);
	if (
		JSON.stringify(changeIds) !== JSON.stringify(binding.expectedChangeIds) ||
		JSON.stringify(changeIds) !== JSON.stringify(binding.comparedChangeIds) ||
		new Set(changeIds).size !== changeIds.length ||
		changeIds.some((changeId, index) => index > 0 && changeIds[index - 1] >= changeId)
	) {
		throw new Error("Decision active portfolio comparison coverage is incomplete.");
	}
	const content = toCanonicalJsonValue({
		schemaVersion: binding.schemaVersion,
		requiredCheckId: binding.requiredCheckId,
		workGraphDigest: binding.workGraphDigest,
		expectedChangeIds: binding.expectedChangeIds,
		comparedChangeIds: binding.comparedChangeIds,
		coverage: binding.coverage,
		changes: binding.changes,
	});
	if (canonicalJsonDigest(content) !== binding.digest) {
		throw new Error("Decision active portfolio digest is invalid.");
	}
}

function acceptedNonterminalRevision(
	change: ChangeWorkState,
): ChangeRevision | null {
	if (change.withdrawn || change.trace.status !== "open") return null;
	for (const attempt of [...change.loopAttempts].reverse()) {
		if (attempt.loop !== "decision" || !attempt.routeOperationId) continue;
		const routeOperation = change.operations.find(
			(operation) => operation.operationId === attempt.routeOperationId,
		);
		if (
			routeOperation?.body.kind !== "runtime.route_recorded" ||
			operationPayload(routeOperation, "runtime.route_recorded").route !== "planning"
		) {
			continue;
		}
		return revisionById(change, attempt.changeRevisionId) ?? null;
	}
	return null;
}

function acceptedWorkGraphDigest(state: ProjectWorkState): Sha256Digest {
	const workGraphDeltaIds = state.changes
		.flatMap((change) =>
			change.loopAttempts.flatMap((attempt) => {
				if (
					attempt.loop !== "planning" ||
					!attempt.currentCandidateId ||
					!attempt.routeOperationId
				) {
					return [];
				}
				const routeOperation = change.operations.find(
					(operation) => operation.operationId === attempt.routeOperationId,
				);
				return routeOperation?.body.kind === "runtime.route_recorded" &&
					operationPayload(routeOperation, "runtime.route_recorded").route ===
						"implementation"
					? [attempt.currentCandidateId]
					: [];
			}),
		)
		.sort(compareText);
	return canonicalJsonDigest({
		schemaVersion: ACTIVE_CHANGE_PORTFOLIO_SCHEMA_VERSION,
		workGraphDeltaIds,
	});
}

function semanticRevision(
	change: ChangeWorkState,
	revision: ChangeRevision,
): DecisionSemanticRevision {
	const ordinal = change.revisionIds.indexOf(revision.revisionId) + 1;
	if (ordinal < 1) {
		throw new Error(
			`Accepted Change ${change.changeId} revision is absent from revision history.`,
		);
	}
	return {ordinal, revisionId: revision.revisionId, ...revision.content};
}

function revisionById(
	change: ChangeWorkState,
	revisionId: Sha256Digest,
): ChangeRevision | undefined {
	const currentRevision = change.currentRevision;
	if (currentRevision?.revisionId === revisionId) return currentRevision;
	for (const operation of change.operations) {
		if (
			operation.body.kind !== "change.proposed" &&
			operation.body.kind !== "change.revised"
		) {
			continue;
		}
		const payload = operationPayload(operation, operation.body.kind);
		if (payload.revision.revisionId === revisionId) return payload.revision;
	}
	return undefined;
}

function activeRelationshipBindings(
	change: ChangeWorkState,
	revisionId: Sha256Digest,
): DecisionRelationshipBinding[] {
	return change.relationships
		.filter(
			(relationship) =>
				!relationship.supersededByOperationId &&
				relationship.sourceRevisionId === revisionId,
		)
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

function compareRelationships(
	left: DecisionRelationshipBinding,
	right: DecisionRelationshipBinding,
): number {
	return (
		compareText(left.targetChangeId, right.targetChangeId) ||
		compareText(left.relationshipId, right.relationshipId)
	);
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
