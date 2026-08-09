import { createHash } from "node:crypto";
import type { ChangeRecord } from "../changes/records.ts";
import { changeContentDigest } from "../changes/digest.ts";
import type { DecisionDisposition } from "./candidate-proposal.ts";
import type { LoopQualityStandardResult } from "../traces/types.ts";
import type { WorkState } from "../work-state/types.ts";

export const DECISION_CHANGE_GRAPH_ID = "codewiki.decision.change";
export const DECISION_CHANGE_GRAPH_VERSION = "1.0.0";

interface DecisionAuthority {
	kind: "user" | "policy";
	actor: string;
	ref: string;
}

export interface EvaluateChangeDecisionInput {
	record: ChangeRecord;
	workState: WorkState;
	disposition: DecisionDisposition;
	rationale: string;
	authority?: DecisionAuthority;
}

export interface ChangeDecisionQualityResult {
	graph: {
		id: typeof DECISION_CHANGE_GRAPH_ID;
		version: typeof DECISION_CHANGE_GRAPH_VERSION;
		hash: string;
	};
	standards: LoopQualityStandardResult[];
	passed: boolean;
	blocked: boolean;
	qualityRef: string;
}

interface StandardDefinition {
	id: string;
	description: string;
	mode: LoopQualityStandardResult["mode"];
	method: string;
	evaluate(input: EvaluateChangeDecisionInput): {
		status: LoopQualityStandardResult["status"];
		message?: string;
		refs?: string[];
	};
}

const STANDARD_DEFINITIONS: StandardDefinition[] = [
	standard(
		"change_revision_ready",
		"Exact validated Change revision is ready.",
		(input) => {
			const change = input.record.change;
			const digest = changeContentDigest(change);
			return change.validation.state === "valid" &&
				change.validation.validatedRevision === change.revision &&
				change.validation.validatedDigest === digest
				? met([digest])
				: unmet("Change validation must bind the current revision and digest.");
		},
	),
	standard(
		"intention_understood",
		"Intent, states, rationale, and non-goals are explicit.",
		(input) => {
			const intent = input.record.change.intent;
			return [
				intent.question,
				intent.currentState,
				intent.desiredState,
				intent.rationale,
			].every(hasText)
				? met()
				: unmet("Change intent is incomplete.");
		},
	),
	standard("user_value_clear", "User or project value is explicit.", (input) =>
		hasText(input.record.change.impact.user)
			? met()
			: unmet("Change needs explicit user or project value."),
	),
	standard(
		"outcome_contract_complete",
		"Success signals and evidence expectations are bounded.",
		(input) => {
			const outcome = input.record.change.outcome;
			return outcome.successSignals.length > 0 &&
				outcome.evidenceExpectations.length > 0
				? met()
				: unmet("Change needs success signals and evidence expectations.");
		},
	),
	standard(
		"current_state_grounded",
		"Canonical refs ground current state.",
		(input) => {
			const evidence = input.record.change.evidence;
			const refs = [...evidence.sourceRefs, ...evidence.proofRefs];
			return refs.length > 0
				? met(refs)
				: unmet("Change needs canonical current-state refs.");
		},
	),
	standard(
		"evidence_sufficient",
		"Evidence is proportional to risk.",
		(input) => {
			const change = input.record.change;
			const neededProofs =
				change.safety.risk === "high"
					? 2
					: change.safety.risk === "medium"
						? 1
						: 0;
			return change.evidence.sourceRefs.length > 0 &&
				change.evidence.proofRefs.length >= neededProofs
				? met([...change.evidence.sourceRefs, ...change.evidence.proofRefs])
				: unmet(
						`Change risk ${change.safety.risk} needs source grounding and ${neededProofs} proof ref(s).`,
					);
		},
	),
	agentStandard(
		"recommendation_justified",
		"Agent recommendation is explicit and evidenced.",
		(input) => {
			const recommendations = input.record.change.validation.recommendations;
			const expected =
				input.disposition === "approve"
					? "accept"
					: input.disposition === "defer"
						? "defer"
						: input.disposition === "reject"
							? "reject"
							: undefined;
			return recommendations.some(
				(entry) => !expected || entry.value === expected,
			)
				? met(recommendations.flatMap((entry) => entry.evidenceRefs))
				: unmet(
						"Change needs a recommendation matching the requested disposition.",
					);
		},
	),
	agentStandard(
		"intention_validated",
		"Agent assessment protects user and project value.",
		(input) =>
			input.record.change.validation.assessments.length > 0
				? met(
						input.record.change.validation.assessments.flatMap(
							(entry) => entry.evidenceRefs,
						),
					)
				: unmet("Change needs an explicit agent assessment."),
	),
	userStandard(
		"approval_safety",
		"Authority binds exact revision and digest.",
		(input) =>
			input.authority &&
			hasText(input.authority.actor) &&
			hasText(input.authority.ref)
				? met([input.authority.ref])
				: blocked("Decision needs exact user or policy authority."),
	),
	standard(
		"risks_and_alternatives_considered",
		"Risk, alternatives, invariants, and rollback are proportional.",
		riskQuality,
	),
	standard(
		"knowledge_impact_accounted",
		"Knowledge changes or no-impact rationale are complete.",
		(input) => {
			const knowledge = input.record.change.knowledge;
			if (knowledge.topicRefs.length > 0) {
				return knowledge.propagationRefs.length > 0
					? met([...knowledge.topicRefs, ...knowledge.propagationRefs])
					: unmet("Affected Knowledge topics need accepted propagation refs.");
			}
			return hasText(knowledge.noImpactRationale)
				? met()
				: unmet(
						"Change needs Knowledge topics or explicit no-impact rationale.",
					);
		},
	),
	standard(
		"change_kind_classified",
		"Kind-specific quality requirements are satisfied.",
		kindQuality,
	),
	standard(
		"delivery_constraints_safe",
		"Delivery constraints avoid Planning-owned design.",
		(input) => {
			const values = [
				...input.record.change.delivery.constraints,
				...input.record.change.delivery.planningQuestions,
			];
			return values.some((value) =>
				/\b(?:WI|SPR)-[A-Za-z0-9._-]+\b/.test(value),
			)
				? unmet(
						"Change delivery constraints cannot prescribe Work Item or Sprint identities.",
					)
				: met();
		},
	),
	standard(
		"active_change_overlap_accounted",
		"Active overlapping Changes are linked or ordered.",
		overlapQuality,
	),
];

export const DECISION_CHANGE_QUALITY_STANDARDS = STANDARD_DEFINITIONS.map(
	({ id, description, mode, method }) => ({ id, description, mode, method }),
);

export const DECISION_CHANGE_GRAPH_HASH = graphHash(STANDARD_DEFINITIONS);

export function evaluateChangeDecision(
	input: EvaluateChangeDecisionInput,
): ChangeDecisionQualityResult {
	const standards = STANDARD_DEFINITIONS.map((definition) => {
		const result = definition.evaluate(input);
		return {
			id: definition.id,
			status: result.status,
			mode: definition.mode,
			description: definition.description,
			...(result.message ? { message: result.message } : {}),
			...(result.refs?.length ? { refs: unique(result.refs) } : {}),
			graphId: DECISION_CHANGE_GRAPH_ID,
			graphVersion: DECISION_CHANGE_GRAPH_VERSION,
			graphHash: DECISION_CHANGE_GRAPH_HASH,
			method: definition.method,
			gate: "hard",
			score: result.status === "met" ? 100 : 0,
			scoreThreshold: 100,
			repairTarget: definition.id,
		} satisfies LoopQualityStandardResult;
	});
	const qualityRef = `sha256:${createHash("sha256")
		.update(JSON.stringify(standards))
		.digest("hex")}`;
	return {
		graph: {
			id: DECISION_CHANGE_GRAPH_ID,
			version: DECISION_CHANGE_GRAPH_VERSION,
			hash: DECISION_CHANGE_GRAPH_HASH,
		},
		standards,
		passed: standards.every((entry) => entry.status === "met"),
		blocked: standards.some((entry) => entry.status === "blocked"),
		qualityRef,
	};
}

function riskQuality(input: EvaluateChangeDecisionInput) {
	const change = input.record.change;
	if (
		change.safety.failureModes.length === 0 ||
		change.intent.alternatives.length === 0
	) {
		return unmet("Change needs failure modes and considered alternatives.");
	}
	if (change.safety.risk === "low") return met();
	if (
		!hasText(change.safety.rollbackPlan) ||
		!hasText(change.safety.regressionPlan)
	) {
		return unmet(
			"Medium/high-risk Change needs rollback and regression plans.",
		);
	}
	if (change.safety.risk === "medium") return met();
	return change.safety.invariants.length > 0 &&
		hasText(change.safety.safetyBoundary) &&
		hasText(change.safety.negativeTestPlan)
		? met()
		: unmet(
				"High-risk Change needs invariants, safety boundary, and negative-test plan.",
			);
}

function kindQuality(input: EvaluateChangeDecisionInput) {
	const change = input.record.change;
	switch (change.classification.kind) {
		case "fix":
			return hasText(change.evidence.reproduction) &&
				hasText(change.evidence.expectedBehavior)
				? met()
				: unmet("Fix needs reproduction and expected behavior.");
		case "harden":
			return hasText(change.safety.safetyBoundary) &&
				hasText(change.safety.negativeTestPlan)
				? met()
				: unmet("Hardening needs safety boundary and negative-test plan.");
		case "migrate":
			return change.safety.invariants.length > 0 &&
				hasText(change.evidence.sourceBehavior) &&
				hasText(change.evidence.targetBehavior)
				? met()
				: unmet("Migration needs invariants plus source and target behavior.");
		case "remove":
			return hasText(change.safety.rollbackPlan)
				? met()
				: unmet("Removal needs rollback plan.");
		case "improve":
		case "introduce":
			return change.outcome.successSignals.length > 0
				? met()
				: unmet("Change needs observable success signals.");
	}
}

function overlapQuality(input: EvaluateChangeDecisionInput) {
	const change = input.record.change;
	const targetRefs = new Set(change.classification.targetRefs);
	const overlapping = input.workState.changes.filter((candidate) => {
		if (candidate.id === change.id) return false;
		if (
			["rejected", "withdrawn", "deferred"].includes(
				candidate.record.change.status,
			)
		)
			return false;
		return candidate.record.change.classification.targetRefs.some((ref) =>
			targetRefs.has(ref),
		);
	});
	const unlinked = overlapping.filter(
		(candidate) =>
			!input.record.links.some(
				(link) => link.targetChangeId === candidate.id,
			) &&
			!candidate.record.links.some((link) => link.targetChangeId === change.id),
	);
	return unlinked.length === 0
		? met(overlapping.map((entry) => `change:${entry.id}`))
		: unmet(
				`Overlapping active Changes need explicit links: ${unlinked.map((entry) => entry.id).join(", ")}.`,
				unlinked.map((entry) => `change:${entry.id}`),
			);
}

function standard(
	id: string,
	description: string,
	evaluate: StandardDefinition["evaluate"],
): StandardDefinition {
	return {
		id,
		description,
		mode: "deterministic",
		method: "deterministic",
		evaluate,
	};
}

function agentStandard(
	id: string,
	description: string,
	evaluate: StandardDefinition["evaluate"],
): StandardDefinition {
	return {
		id,
		description,
		mode: "agent",
		method: "agent_self_assessment",
		evaluate,
	};
}

function userStandard(
	id: string,
	description: string,
	evaluate: StandardDefinition["evaluate"],
): StandardDefinition {
	return { id, description, mode: "user", method: "human_authority", evaluate };
}

function met(refs: string[] = []) {
	return { status: "met" as const, ...(refs.length ? { refs } : {}) };
}

function unmet(message: string, refs: string[] = []) {
	return {
		status: "unmet" as const,
		message,
		...(refs.length ? { refs } : {}),
	};
}

function blocked(message: string) {
	return { status: "blocked" as const, message };
}

function hasText(value: string | undefined): boolean {
	return Boolean(value?.trim());
}

function unique(values: string[]): string[] {
	return [...new Set(values.filter(hasText))].sort((left, right) =>
		left.localeCompare(right),
	);
}

function graphHash(definitions: StandardDefinition[]): string {
	return `sha256:${createHash("sha256")
		.update(
			JSON.stringify(
				definitions.map(({ id, description, mode, method }) => ({
					id,
					description,
					mode,
					method,
				})),
			),
		)
		.digest("hex")}`;
}
