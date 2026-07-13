import type { AcceptedChangeBundle } from "../changes/accepted-bundle.ts";
import type { Change, ChangeKind } from "../changes/types.ts";
import { createSprintProposal } from "./proposal.ts";
import type {
	DecisionIntentKind,
	DecisionWorkScale,
	DecisionChangeInput,
	SprintProposal,
} from "./types.ts";

export function sprintProposalFromAcceptedChanges(
	bundle: AcceptedChangeBundle,
): SprintProposal {
	return createSprintProposal({
		id: `SP-${bundle.traceId}`,
		summary: bundle.changes
			.map((snapshot) => snapshot.change.intent.desiredState)
			.join(" "),
		createdAt: bundle.acceptedAt,
		updatedAt: bundle.acceptedAt,
		sourceRefs: unique([
			`git:${bundle.sourceRef}@${bundle.sourceHead}`,
			...bundle.changes.flatMap(
				(snapshot) => snapshot.change.evidence.sourceRefs,
			),
		]),
		changes: bundle.changes.map((snapshot) =>
			decisionInput(snapshot.change, bundle),
		),
	});
}

function decisionInput(
	change: Change,
	bundle: AcceptedChangeBundle,
): DecisionChangeInput {
	return {
		id: change.id,
		question: change.intent.question,
		kind: decisionIntentKind(change.classification.kind),
		currentState: change.intent.currentState,
		desiredState: change.intent.desiredState,
		rationale: change.intent.rationale,
		userImpact: change.impact.user,
		maintainerImpact: change.impact.maintainer,
		effort: change.estimates.effort || "medium",
		workScale: workScale(change.estimates.workScale),
		planningDepth: "standard",
		routeTarget: "planning",
		routeRationale:
			"Accepted Change enters its independent trace through Planning.",
		affectedLayers: change.classification.affectedLayers,
		risk: change.safety.risk,
		approval: "approved",
		approvalAuthority: "user",
		approvalRef: bundle.digest,
		recommendation: "approve",
		recommendationRationale: change.intent.rationale,
		agentAssessment: {
			stance: "aligned",
			userAlignment: change.impact.user,
			projectBenefit: change.intent.desiredState,
			rationale: change.intent.rationale,
			concerns: change.safety.failureModes,
		},
		alternatives: [],
		sourceRefs: unique([
			...change.evidence.sourceRefs,
			...change.classification.targetRefs,
		]),
		proofRefs: change.evidence.proofRefs,
		scope: change.classification.scope,
		targetRefs: change.classification.targetRefs,
		currentPain: change.intent.currentState,
		desiredOutcome: change.intent.desiredState,
		successSignal:
			change.validation.successSignal || change.intent.desiredState,
		nonGoals: change.intent.nonGoals,
		regressionPlan: change.validation.regressionPlan,
		safetyBoundary: change.safety.safetyBoundary,
		failureModes: change.safety.failureModes,
		negativeTestPlan: change.safety.negativeTestPlan,
		compatibilityImpact: change.impact.maintainer,
		rollbackPlan: change.safety.rollbackPlan,
	};
}

function decisionIntentKind(kind: ChangeKind): DecisionIntentKind {
	if (kind === "fix" || kind === "harden" || kind === "migrate") return kind;
	return "improve";
}

function workScale(value: string | undefined): DecisionWorkScale {
	if (
		value === "tiny" ||
		value === "small" ||
		value === "normal" ||
		value === "large"
	) {
		return value;
	}
	return "normal";
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}
