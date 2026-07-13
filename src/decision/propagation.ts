import type { DecisionChange, SprintProposal } from "./types.ts";

export interface DecisionStateDelta {
	id: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	affectedLayers: string[];
	sourceRefs: string[];
	missingFields: string[];
}

export function decisionStateDeltas(
	proposal: SprintProposal,
): DecisionStateDelta[] {
	return proposal.changes
		.filter((change) => change.approval === "approved")
		.map((change) => decisionChangeStateDelta(change));
}

export function decisionStateDeltaGaps(proposal: SprintProposal): string[] {
	const changes = decisionStateDeltas(proposal);
	if (proposal.changes.length > 0 && changes.length === 0) {
		return ["decision:no_approved_changes"];
	}
	return changes.flatMap((change) =>
		change.missingFields.map(
			(field) => `decision_change:${change.id}:${field}`,
		),
	);
}

export function decisionPropagationRefs(proposal: SprintProposal): string[] {
	return Array.from(
		new Set(
			decisionStateDeltas(proposal).flatMap((change) => change.sourceRefs),
		),
	);
}

function decisionChangeStateDelta(change: DecisionChange): DecisionStateDelta {
	const missingFields = [
		change.currentState ? "" : "missing_current_state",
		change.desiredState ? "" : "missing_desired_state",
		change.rationale ? "" : "missing_rationale",
	].filter(Boolean);
	return {
		id: change.id,
		currentState: change.currentState,
		desiredState: change.desiredState,
		rationale: change.rationale,
		affectedLayers: [...change.affectedLayers],
		sourceRefs: [...change.sourceRefs, ...change.proofRefs],
		missingFields,
	};
}
