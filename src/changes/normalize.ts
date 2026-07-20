import type {
	Change,
	ChangeAssessment,
	ChangeRecommendation,
	ChangeStatusTransition,
	ChangeValidationIssue,
} from "./types.ts";

export function normalizeChange(change: Change): Change {
	return {
		schemaVersion: change.schemaVersion,
		id: text(change.id),
		revision: change.revision,
		status: change.status,
		lastStatusTransition: change.lastStatusTransition
			? normalizeStatusTransition(change.lastStatusTransition)
			: undefined,
		intent: {
			question: text(change.intent.question),
			currentState: text(change.intent.currentState),
			desiredState: text(change.intent.desiredState),
			rationale: text(change.intent.rationale),
			nonGoals: stringList(change.intent.nonGoals),
			alternatives: stringList(change.intent.alternatives),
		},
		classification: {
			kind: change.classification.kind,
			type: change.classification.type,
			scope: change.classification.scope,
			affectedLayers: stringList(change.classification.affectedLayers),
			targetRefs: stringList(change.classification.targetRefs),
		},
		impact: {
			user: text(change.impact.user),
			maintainer: text(change.impact.maintainer),
			compatibility: optionalText(change.impact.compatibility),
		},
		knowledge: {
			topicRefs: stringList(change.knowledge.topicRefs),
			propagationRefs: stringList(change.knowledge.propagationRefs),
			noImpactRationale: optionalText(change.knowledge.noImpactRationale),
		},
		outcome: {
			successSignals: stringList(change.outcome.successSignals),
			evidenceExpectations: stringList(change.outcome.evidenceExpectations),
		},
		delivery: {
			constraints: stringList(change.delivery.constraints),
			planningQuestions: stringList(change.delivery.planningQuestions),
		},
		evidence: {
			sourceRefs: stringList(change.evidence.sourceRefs),
			proofRefs: stringList(change.evidence.proofRefs),
			reproduction: optionalText(change.evidence.reproduction),
			expectedBehavior: optionalText(change.evidence.expectedBehavior),
			sourceBehavior: optionalText(change.evidence.sourceBehavior),
			targetBehavior: optionalText(change.evidence.targetBehavior),
		},
		safety: {
			risk: change.safety.risk,
			invariants: stringList(change.safety.invariants),
			safetyBoundary: optionalText(change.safety.safetyBoundary),
			failureModes: stringList(change.safety.failureModes),
			rollbackPlan: optionalText(change.safety.rollbackPlan),
			negativeTestPlan: optionalText(change.safety.negativeTestPlan),
			regressionPlan: optionalText(change.safety.regressionPlan),
		},
		validation: {
			state: change.validation.state,
			issues: change.validation.issues.map(normalizeValidationIssue),
			assessments: change.validation.assessments.map(normalizeAssessment),
			recommendations: change.validation.recommendations.map(
				normalizeRecommendation,
			),
			validatorVersion: optionalText(change.validation.validatorVersion),
			validatedRevision: change.validation.validatedRevision,
			validatedDigest: optionalText(change.validation.validatedDigest),
		},
		estimates: {
			effort: change.estimates.effort,
			workScale: change.estimates.workScale,
		},
		provenance: {
			origin: change.provenance.origin,
			createdBy: text(change.provenance.createdBy),
			createdAt: text(change.provenance.createdAt),
			updatedAt: text(change.provenance.updatedAt),
			discoveredWhile: change.provenance.discoveredWhile
				? {
						traceId: optionalText(change.provenance.discoveredWhile.traceId),
						taskId: optionalText(change.provenance.discoveredWhile.taskId),
					}
				: undefined,
		},
	};
}

function normalizeStatusTransition(
	transition: ChangeStatusTransition,
): ChangeStatusTransition {
	return {
		changeId: text(transition.changeId),
		revision: transition.revision,
		contentDigest: text(transition.contentDigest),
		from: transition.from,
		to: transition.to,
		changedBy: text(transition.changedBy),
		changedAt: text(transition.changedAt),
		reason: optionalText(transition.reason),
		authority: optionalText(transition.authority),
		ref: optionalText(transition.ref),
	};
}

function normalizeValidationIssue(
	issue: ChangeValidationIssue,
): ChangeValidationIssue {
	return {
		code: text(issue.code),
		severity: issue.severity,
		message: text(issue.message),
		refs: stringList(issue.refs),
	};
}

function normalizeAssessment(assessment: ChangeAssessment): ChangeAssessment {
	return {
		actor: text(assessment.actor),
		stance: assessment.stance,
		rationale: text(assessment.rationale),
		concerns: stringList(assessment.concerns),
		evidenceRefs: stringList(assessment.evidenceRefs),
	};
}

function normalizeRecommendation(
	recommendation: ChangeRecommendation,
): ChangeRecommendation {
	return {
		actor: text(recommendation.actor),
		value: recommendation.value,
		rationale: text(recommendation.rationale),
		evidenceRefs: stringList(recommendation.evidenceRefs),
	};
}

function stringList(values: string[]): string[] {
	return [...new Set(values.map(text).filter(Boolean))];
}

function optionalText(value: string | undefined): string | undefined {
	const normalized = text(value);
	return normalized || undefined;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
