import type {CheckCatalog} from "../../loop-exit/catalog.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "../../loop-exit/runner.ts";
import type {DecisionCandidate, DecisionCandidateContent} from "./candidate.ts";

interface DecisionCodeEvaluation {
	readonly satisfied: boolean;
	readonly finding?: string;
}

type DecisionCodeEvaluator = (
	content: DecisionCandidateContent,
) => DecisionCodeEvaluation;

const DECISION_CODE_EVALUATORS: Readonly<Record<string, DecisionCodeEvaluator>> =
	Object.freeze({
		active_change_overlap_accounted: (content) =>
			content.activeOverlaps.every((overlap) => overlap.accountedByRelationship)
				? satisfied()
				: unsatisfied("Active overlapping Changes require an explicit relationship."),
		approval_safety: () => satisfied(),
		change_kind_classified: kindClassified,
		change_revision_ready: (content) =>
			content.validation.state === "valid" &&
			content.validation.validatedRevision === content.revision.revision &&
			content.validation.validatedDigest === content.validation.revisionDigest
				? satisfied()
				: unsatisfied(
						"Change validation must bind the exact current revision and digest.",
					),
		cli_behavior_verified: (content) =>
			hasText(content.revision.impact.compatibility) &&
			content.revision.outcome.evidenceExpectations.length > 0
				? satisfied()
				: unsatisfied(
						"CLI changes require compatibility and observable behavior evidence.",
					),
		current_state_grounded: (content) =>
			content.revision.evidence.sourceRefs.length > 0 &&
			content.groundingRefs.length > 0
				? satisfied()
				: unsatisfied("Canonical source refs must ground current state."),
		delivery_constraints_safe: deliveryConstraintsSafe,
		dependency_risk_controlled: (content) =>
			hasText(content.revision.impact.compatibility) &&
			content.revision.evidence.sourceRefs.length > 0 &&
			content.revision.safety.failureModes.length > 0
				? satisfied()
				: unsatisfied(
						"Dependency changes require compatibility, provenance, and failure evidence.",
					),
		evidence_sufficient: evidenceSufficient,
		fix_reproducible: (content) =>
			hasText(content.revision.evidence.reproduction) &&
			hasText(content.revision.evidence.expectedBehavior)
				? satisfied()
				: unsatisfied("Fix candidates require reproduction and expected behavior."),
		hardening_boundaries_complete: (content) =>
			hasText(content.revision.safety.safetyBoundary) &&
			hasText(content.revision.safety.negativeTestPlan) &&
			content.revision.safety.failureModes.length > 0
				? satisfied()
				: unsatisfied(
						"Hardening candidates require safety, failure, and negative-test boundaries.",
					),
		improvement_outcome_observable: (content) =>
			content.revision.outcome.successSignals.length > 0
				? satisfied()
				: unsatisfied("Improvement candidates require observable success signals."),
		intention_understood: intentionUnderstood,
		knowledge_impact_accounted: knowledgeImpactAccounted,
		migration_invariants_preserved: (content) =>
			content.revision.safety.invariants.length > 0 &&
			hasText(content.revision.evidence.sourceBehavior) &&
			hasText(content.revision.evidence.targetBehavior)
				? satisfied()
				: unsatisfied(
						"Migration candidates require invariants and bounded source/target behavior.",
					),
		outcome_contract_complete: (content) =>
			content.revision.outcome.successSignals.length > 0 &&
			content.revision.outcome.evidenceExpectations.length > 0
				? satisfied()
				: unsatisfied(
						"Outcome contract requires success signals and evidence expectations.",
					),
		persistent_data_safety_reviewed: (content) =>
			content.revision.safety.invariants.length > 0 &&
			hasText(content.revision.safety.rollbackPlan) &&
			hasText(content.revision.safety.regressionPlan)
				? satisfied()
				: unsatisfied(
						"Persistent-data changes require invariants, rollback, and regression evidence.",
					),
		release_intent_authorized: (content) =>
			content.revision.delivery.constraints.length > 0 &&
			content.revision.outcome.evidenceExpectations.length > 0
				? satisfied()
				: unsatisfied(
						"Release intent requires explicit delivery constraints and evidence expectations.",
					),
		risks_and_alternatives_considered: riskAndAlternatives,
		user_value_clear: (content) =>
			hasText(content.revision.impact.user)
				? satisfied()
				: unsatisfied("User or project value must be explicit."),
	});

export function createDecisionCodeExecutors(
	catalog: CheckCatalog,
): LoopCheckExecutor[] {
	return Object.entries(DECISION_CODE_EVALUATORS).flatMap(
		([checkId, evaluate]) => {
			const registration = catalog.get(checkId, "decision");
			if (!registration) return [];
			if (registration.check.execution.kind !== "code") {
				throw new Error(`Decision evaluator ${checkId} is not a Code Check.`);
			}
			return [
				{
					loop: "decision" as const,
					checkId,
					checkVersion: registration.check.version,
					execution: {...registration.check.execution},
					execute: (context: LoopCheckExecutorContext) =>
						observation(context, evaluate),
				},
			];
		},
	);
}

function observation(
	context: LoopCheckExecutorContext,
	evaluate: DecisionCodeEvaluator,
): CheckExecutorObservation {
	const candidate = context.candidate as DecisionCandidate;
	if (
		candidate.loop !== "decision" ||
		candidate.schemaVersion !== "1.0.0"
	) {
		return {
			disposition: "unsatisfied",
			findings: ["Decision Candidate schema is unsupported."],
			issueClass: "candidate_contract",
		};
	}
	const result = evaluate(candidate.content);
	return result.satisfied
		? {disposition: "satisfied"}
		: {
				disposition: "unsatisfied",
				findings: [result.finding ?? "Decision requirement was not established."],
				issueClass: "decision_semantics",
			};
}

function intentionUnderstood(
	content: DecisionCandidateContent,
): DecisionCodeEvaluation {
	const intent = content.revision.intent;
	return [intent.question, intent.currentState, intent.desiredState, intent.rationale].every(
		hasText,
	)
		? satisfied()
		: unsatisfied("Decision intent, current state, desired state, and rationale are required.");
}

function evidenceSufficient(
	content: DecisionCandidateContent,
): DecisionCodeEvaluation {
	const risk = content.revision.safety.risk;
	const minimumProofs = minimumProofCount(risk);
	return content.revision.evidence.sourceRefs.length > 0 &&
		content.revision.evidence.proofRefs.length >= minimumProofs
		? satisfied()
		: unsatisfied(
				`Risk ${risk} requires source grounding and ${minimumProofs} proof ref(s).`,
			);
}

function minimumProofCount(risk: "low" | "medium" | "high"): number {
	if (risk === "high") return 2;
	if (risk === "medium") return 1;
	return 0;
}

function knowledgeImpactAccounted(
	content: DecisionCandidateContent,
): DecisionCodeEvaluation {
	const knowledge = content.revision.knowledge;
	if (knowledge.topicRefs.length > 0) {
		return knowledge.propagationRefs.length > 0
			? satisfied()
			: unsatisfied("Affected Knowledge topics require accepted propagation refs.");
	}
	return hasText(knowledge.noImpactRationale)
		? satisfied()
		: unsatisfied("Decision requires Knowledge refs or an explicit no-impact rationale.");
}

function riskAndAlternatives(
	content: DecisionCandidateContent,
): DecisionCodeEvaluation {
	const safety = content.revision.safety;
	if (
		safety.failureModes.length === 0 ||
		content.revision.intent.alternatives.length === 0
	) {
		return unsatisfied("Decision requires failure modes and considered alternatives.");
	}
	if (safety.risk === "low") return satisfied();
	if (!hasText(safety.rollbackPlan) || !hasText(safety.regressionPlan)) {
		return unsatisfied("Medium/high risk requires rollback and regression plans.");
	}
	if (safety.risk === "medium") return satisfied();
	return safety.invariants.length > 0 &&
		hasText(safety.safetyBoundary) &&
		hasText(safety.negativeTestPlan)
		? satisfied()
		: unsatisfied(
				"High risk requires invariants, a safety boundary, and a negative-test plan.",
			);
}

function kindClassified(
	content: DecisionCandidateContent,
): DecisionCodeEvaluation {
	switch (content.revision.classification.kind) {
		case "fix":
			return DECISION_CODE_EVALUATORS.fix_reproducible(content);
		case "harden":
			return DECISION_CODE_EVALUATORS.hardening_boundaries_complete(content);
		case "migrate":
			return DECISION_CODE_EVALUATORS.migration_invariants_preserved(content);
		case "remove":
			return hasText(content.revision.safety.rollbackPlan)
				? satisfied()
				: unsatisfied("Removal requires a rollback plan.");
		case "improve":
		case "introduce":
			return DECISION_CODE_EVALUATORS.improvement_outcome_observable(content);
		default:
			return unsatisfied("Decision Change kind is unsupported.");
	}
}

function deliveryConstraintsSafe(
	content: DecisionCandidateContent,
): DecisionCodeEvaluation {
	const delivery = content.revision.delivery;
	const prescribesPlanningIdentity = [
		...delivery.constraints,
		...delivery.planningQuestions,
	].some((value) => /\b(?:WI|SPR)-[A-Za-z0-9._-]+\b/.test(value));
	return prescribesPlanningIdentity
		? unsatisfied("Delivery constraints cannot prescribe Work Item or Sprint identities.")
		: satisfied();
}

function satisfied(): DecisionCodeEvaluation {
	return {satisfied: true};
}

function unsatisfied(finding: string): DecisionCodeEvaluation {
	return {satisfied: false, finding};
}

function hasText(value: string | undefined): boolean {
	return Boolean(value?.trim());
}
