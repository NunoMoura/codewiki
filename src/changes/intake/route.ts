import type {ChangeRevisionId} from "../trace/contracts.ts";
import {
	changeById,
	type ChangeWorkState,
	type ProjectWorkState,
} from "../trace/state.ts";
import type {ChangeIntakeFingerprints} from "./deduplicate.ts";
import {
	findAcceptedChangeIntakeRequest,
	findOpenChangeIntakeSemanticMatch,
	findOpenChangeIntakeSource,
	type AcceptedChangeIntakeReference,
} from "./deduplicate.ts";

export interface AuthenticatedChangeIntakeCorrelation {
	readonly scope: "current_change" | "independent_change";
	readonly changeId: string;
	readonly revisionId: ChangeRevisionId;
}

export type ChangeIntakeRoute =
	| {
			readonly kind: "exact_replay";
			readonly reason: "accepted_request";
			readonly accepted: AcceptedChangeIntakeReference;
	  }
	| {
			readonly kind: "existing_change";
			readonly reason:
				| "authenticated_correlation"
				| "source_identity"
				| "semantic_duplicate";
			readonly change: ChangeWorkState;
			readonly revisionId: ChangeRevisionId;
	  }
	| {
			readonly kind: "new_change";
			readonly reason: "independent_material" | "independent_discovery";
			readonly changeId: string;
			readonly discoveredFrom: AuthenticatedChangeIntakeCorrelation | null;
	  };

export function resolveChangeIntakeRoute(input: {
	readonly state: ProjectWorkState;
	readonly fingerprints: ChangeIntakeFingerprints;
	readonly correlation: AuthenticatedChangeIntakeCorrelation | null;
	readonly newChangeId: string;
}): ChangeIntakeRoute {
	const replay = findAcceptedChangeIntakeRequest(
		input.state,
		input.fingerprints.requestRef,
	);
	if (replay) {
		return Object.freeze({
			kind: "exact_replay",
			reason: "accepted_request",
			accepted: replay,
		});
	}
	const correlation = input.correlation
		? checkedCorrelation(input.state, input.correlation)
		: null;
	const sourceMatch = findOpenChangeIntakeSource(
		input.state,
		input.fingerprints.sourceIdentityRef,
	);
	if (
		correlation &&
		sourceMatch &&
		sourceMatch.change.changeId !== correlation.changeId
	) {
		throw new Error(
			"Authenticated Change intake correlation conflicts with accepted source identity.",
		);
	}
	if (
		correlation?.scope === "current_change" &&
		isOpenChange(correlation.change)
	) {
		return Object.freeze({
			kind: "existing_change",
			reason: "authenticated_correlation",
			change: correlation.change,
			revisionId: correlation.revisionId,
		});
	}
	if (sourceMatch) {
		return existingMatch(sourceMatch.change, "source_identity");
	}
	const semanticMatch = findOpenChangeIntakeSemanticMatch(
		input.state,
		input.fingerprints.semanticRef,
	);
	if (semanticMatch) {
		return existingMatch(semanticMatch.change, "semantic_duplicate");
	}
	return Object.freeze({
		kind: "new_change",
		reason: correlation ? "independent_discovery" : "independent_material",
		changeId: input.newChangeId,
		discoveredFrom: correlation
			? Object.freeze({
					scope: correlation.scope,
					changeId: correlation.changeId,
					revisionId: correlation.revisionId,
				})
			: null,
	});
}

function checkedCorrelation(
	state: ProjectWorkState,
	correlation: AuthenticatedChangeIntakeCorrelation,
): AuthenticatedChangeIntakeCorrelation & {readonly change: ChangeWorkState} {
	const change = changeById(state, correlation.changeId);
	if (!change || !change.revisionIds.includes(correlation.revisionId)) {
		throw new Error(
			"Authenticated Change intake correlation does not identify an accepted Change revision.",
		);
	}
	return Object.freeze({...correlation, change});
}

function existingMatch(
	change: ChangeWorkState,
	reason: "source_identity" | "semantic_duplicate",
): ChangeIntakeRoute {
	if (!change.currentRevision) {
		throw new Error(`Change intake match ${change.changeId} has no current revision.`);
	}
	return Object.freeze({
		kind: "existing_change",
		reason,
		change,
		revisionId: change.currentRevision.revisionId,
	});
}

function isOpenChange(change: ChangeWorkState): boolean {
	return change.trace.status === "open" && !change.withdrawn;
}
