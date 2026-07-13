import { normalizeDecisionPolicyProfileId } from "./policy-profiles.ts";
import {
	normalizeDecisionApprovalStatus,
	normalizeDecisionScope,
	normalizeTraceabilityExemption,
} from "./approval.ts";
import type {
	DecisionChange,
	DecisionChangeActionFailure,
	DecisionChangeActionInput,
	DecisionChangeInput,
	SprintProposal,
	SprintProposalInput,
} from "./types.ts";

export interface DecisionChangeActionResult {
	changed: boolean;
	proposal: SprintProposal;
	changedChangeIds: string[];
	failures: DecisionChangeActionFailure[];
}

export function createSprintProposal(
	input: SprintProposalInput,
): SprintProposal {
	const createdAt = input.createdAt || new Date().toISOString();
	const changes = normalizeDecisionChanges(input.changes || []);
	return {
		id: text(input.id) || `SP-${createdAt.slice(0, 10)}`,
		summary: text(input.summary) || "Sprint proposal",
		sourceRefs: stringList(input.sourceRefs),
		changes,
		createdAt,
		updatedAt: input.updatedAt || createdAt,
	};
}

export function normalizeDecisionChanges(
	changes: DecisionChangeInput[] = [],
): DecisionChange[] {
	return changes
		.map((change, index) => normalizeDecisionChange(change, index))
		.filter(
			(change) =>
				change.question ||
				change.currentState ||
				change.desiredState ||
				change.rationale,
		);
}

export function applyDecisionChangeActions(
	proposal: SprintProposal,
	actions: DecisionChangeActionInput[],
	updatedAt = new Date().toISOString(),
): DecisionChangeActionResult {
	const failures = actions
		.map((action) => validateChangeAction(proposal, action))
		.filter((failure): failure is DecisionChangeActionFailure =>
			Boolean(failure),
		);
	if (failures.length) {
		return { changed: false, proposal, changedChangeIds: [], failures };
	}
	const next: SprintProposal = {
		...proposal,
		sourceRefs: [...proposal.sourceRefs],
		changes: proposal.changes.map((change) => cloneDecisionChange(change)),
		updatedAt,
	};
	for (const action of actions) applyChangeAction(next, action);
	return {
		changed: actions.length > 0,
		proposal: next,
		changedChangeIds: unique(actions.map((action) => action.changeId)),
		failures: [],
	};
}

export function approvedProposalChanges(
	proposal: SprintProposal,
): DecisionChange[] {
	return proposal.changes.filter((change) => change.approval === "approved");
}

function normalizeDecisionChange(
	change: DecisionChangeInput,
	index: number,
): DecisionChange {
	const id = text(change.id) || generatedChangeId(index);
	return {
		id,
		question: firstText(change.question, change.id, id),
		kind: normalizeDecisionIntentKind(change.kind),
		policyProfileId: normalizeDecisionPolicyProfileId(
			change.policyProfileId ?? normalizeDecisionIntentKind(change.kind),
		),
		currentState: text(change.currentState),
		desiredState: text(change.desiredState),
		rationale: text(change.rationale),
		userImpact: text(change.userImpact),
		maintainerImpact: text(change.maintainerImpact),
		effort: text(change.effort),
		workScale: normalizeWorkScale(change.workScale),
		planningDepth: normalizePlanningDepth(change.planningDepth),
		...normalizeRouteFields(change),
		affectedLayers: unique(stringList(change.affectedLayers)),
		risk: text(change.risk),
		approval: normalizeDecisionApprovalStatus(change.approval),
		approvalAuthority: text(change.approvalAuthority),
		approvalRef: text(change.approvalRef) || undefined,
		recommendation: text(change.recommendation),
		recommendationRationale: text(change.recommendationRationale),
		agentAssessment: normalizeAgentAssessment(change.agentAssessment),
		alternatives: stringList(change.alternatives),
		sourceRefs: unique(stringList(change.sourceRefs)),
		proofRefs: unique(stringList(change.proofRefs)),
		scope: normalizeDecisionScope(change.scope),
		traceabilityExemption: normalizeTraceabilityExemption(
			change.traceabilityExemption,
		),
		noKbImpactReason: text(change.noKbImpactReason) || undefined,
		targetRefs: unique(stringList(change.targetRefs)),
		hypothesis: text(change.hypothesis) || undefined,
		invariant: text(change.invariant) || undefined,
		probe: text(change.probe) || undefined,
		expectedSafeBehavior: text(change.expectedSafeBehavior) || undefined,
		stopCondition: text(change.stopCondition) || undefined,
		reproduction: text(change.reproduction) || undefined,
		expectedBehavior: text(change.expectedBehavior) || undefined,
		regressionPlan: text(change.regressionPlan) || undefined,
		safetyBoundary: text(change.safetyBoundary) || undefined,
		failureModes: unique(stringList(change.failureModes)),
		negativeTestPlan: text(change.negativeTestPlan) || undefined,
		compatibilityImpact: text(change.compatibilityImpact) || undefined,
		currentPain: text(change.currentPain) || undefined,
		desiredOutcome: text(change.desiredOutcome) || undefined,
		successSignal: text(change.successSignal) || undefined,
		nonGoals: unique(stringList(change.nonGoals)),
		sourceBehavior: text(change.sourceBehavior) || undefined,
		targetBehavior: text(change.targetBehavior) || undefined,
		preservedInvariants: unique(stringList(change.preservedInvariants)),
		equivalenceProof: text(change.equivalenceProof) || undefined,
		rollbackPlan: text(change.rollbackPlan) || undefined,
	};
}

function validateChangeAction(
	proposal: SprintProposal,
	action: DecisionChangeActionInput,
): DecisionChangeActionFailure | null {
	const changeId = text(action.changeId);
	if (!changeId)
		return {
			changeId: "",
			action: action.action,
			error: "changeId is required.",
		};
	const change = proposal.changes.find((item) => item.id === changeId);
	if (!change)
		return {
			changeId,
			action: action.action,
			error: `Proposed change not found: ${changeId}`,
		};
	if (action.action === "alternative" && !text(action.alternative)) {
		return {
			changeId,
			action: action.action,
			error: "Alternative text is required.",
		};
	}
	if (action.action === "edit") {
		const [edited] = normalizeDecisionChanges([
			{ ...change, ...(action.change || {}), id: change.id },
		]);
		if (!edited)
			return {
				changeId,
				action: action.action,
				error: "Edit produced an invalid change.",
			};
	}
	return null;
}

function applyChangeAction(
	proposal: SprintProposal,
	action: DecisionChangeActionInput,
): void {
	const change = proposal.changes.find((item) => item.id === action.changeId);
	if (!change) return;
	if (action.action === "accept") change.approval = "approved";
	if (action.action === "reject") change.approval = "rejected";
	if (action.action === "defer") change.approval = "deferred";
	if (action.action === "alternative") {
		change.alternatives = unique([
			...change.alternatives,
			text(action.alternative),
		]);
		change.approval = "edited";
	}
	if (action.action === "edit") {
		const [edited] = normalizeDecisionChanges([
			{ ...change, ...(action.change || {}), id: change.id },
		]);
		if (edited) Object.assign(change, edited);
	}
}

function cloneDecisionChange(change: DecisionChange): DecisionChange {
	return {
		...change,
		affectedLayers: [...change.affectedLayers],
		agentAssessment: {
			...change.agentAssessment,
			concerns: [...change.agentAssessment.concerns],
		},
		alternatives: [...change.alternatives],
		sourceRefs: [...change.sourceRefs],
		proofRefs: [...change.proofRefs],
		directImplementationScope: cloneDirectImplementationScope(
			change.directImplementationScope,
		),
		targetRefs: [...change.targetRefs],
		failureModes: [...change.failureModes],
		nonGoals: [...change.nonGoals],
		preservedInvariants: [...change.preservedInvariants],
	};
}

function normalizeAgentAssessment(
	value: DecisionChangeInput["agentAssessment"],
): DecisionChange["agentAssessment"] {
	return {
		stance: text(value?.stance),
		userAlignment: text(value?.userAlignment),
		projectBenefit: text(value?.projectBenefit),
		rationale: text(value?.rationale),
		concerns: stringList(value?.concerns),
	};
}

function generatedChangeId(index: number): string {
	return `CHG-${String(index + 1).padStart(3, "0")}`;
}

function normalizeDecisionIntentKind(value: unknown): string {
	const normalized = text(value).toLowerCase();
	if (normalized === "debugging") return "debug";
	if (["bug", "bugfix", "defect"].includes(normalized)) return "fix";
	if (["security", "safety"].includes(normalized)) return "harden";
	if (["enhance", "enhancement"].includes(normalized)) return "improve";
	if (["migration", "refactor", "refactoring"].includes(normalized)) {
		return "migrate";
	}
	return normalized;
}

function normalizeWorkScale(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	if (normalized === "trivial") return "tiny";
	if (["medium", "regular"].includes(normalized)) return "normal";
	if (["big", "broad"].includes(normalized)) return "large";
	return normalized;
}

function normalizePlanningDepth(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	if (
		["micro-plan", "microplan", "fast-track", "fasttrack"].includes(normalized)
	) {
		return "micro";
	}
	if (["full", "full-plan", "standard-plan", "normal"].includes(normalized)) {
		return "standard";
	}
	return normalized;
}

function normalizeRouteFields(
	change: DecisionChangeInput,
): Pick<
	DecisionChange,
	| "routeTarget"
	| "routeKind"
	| "routeRationale"
	| "implementationMode"
	| "directImplementationScope"
> {
	const routeTarget = normalizeRouteTarget(change.routeTarget);
	const implementationMode = normalizeImplementationMode(
		change.implementationMode,
	);
	return {
		routeTarget,
		routeKind: normalizeRouteKind(change.routeKind, routeTarget),
		routeRationale: text(change.routeRationale),
		...(implementationMode ? { implementationMode } : {}),
		directImplementationScope: normalizeDirectImplementationScope(
			change.directImplementationScope,
		),
	};
}

function normalizeRouteTarget(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/_/g, "-");
	if (!normalized) return "planning";
	if (["plan", "planning", "planning-implementation"].includes(normalized)) {
		return "planning";
	}
	if (
		[
			"implement",
			"implementation",
			"direct-implementation",
			"implementation-direct",
		].includes(normalized)
	) {
		return "implementation";
	}
	return normalized;
}

function normalizeImplementationMode(value: unknown): string {
	const normalized = text(value).toLowerCase().replace(/-/g, "_");
	if (
		["targeted", "checks", "targeted_checks", "without_tdd", "no_tdd"].includes(
			normalized,
		)
	) {
		return "targeted_checks";
	}
	if (["test_first", "test_first_tdd"].includes(normalized)) return "tdd";
	return normalized;
}

function normalizeRouteKind(value: unknown, routeTarget: string): string {
	const normalized = text(value).toLowerCase().replace(/-/g, "_");
	if (normalized) return normalized;
	return routeTarget === "implementation" ? "direct_implementation" : "advance";
}

function normalizeDirectImplementationScope(
	value: DecisionChangeInput["directImplementationScope"],
): DecisionChange["directImplementationScope"] {
	return {
		acceptance: unique(stringList(value?.acceptance)),
		acceptanceCriteria: normalizeAcceptanceCriteria(
			objectList(value?.acceptanceCriteria),
		),
		componentRefs: unique(stringList(value?.componentRefs)),
		pathScopes: unique(stringList(value?.pathScopes)),
		verification: unique(stringList(value?.verification)),
	};
}

function normalizeAcceptanceCriteria(
	criteria: unknown[],
): DecisionChange["directImplementationScope"]["acceptanceCriteria"] {
	return objectList<{ id?: string; text?: string }>(criteria).map(
		(criterion, index) => ({
			id: text(criterion.id) || `AC-${String(index + 1).padStart(3, "0")}`,
			text: text(criterion.text),
		}),
	);
}

function cloneDirectImplementationScope(
	scope: DecisionChange["directImplementationScope"],
): DecisionChange["directImplementationScope"] {
	return {
		acceptance: [...scope.acceptance],
		acceptanceCriteria: scope.acceptanceCriteria.map((criterion) => ({
			...criterion,
		})),
		componentRefs: [...scope.componentRefs],
		pathScopes: [...scope.pathScopes],
		verification: [...scope.verification],
	};
}

function firstText(...values: unknown[]): string {
	for (const value of values) {
		const result = text(value);
		if (result) return result;
	}
	return "";
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function objectList<T = Record<string, unknown>>(value: unknown): T[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is T => typeof item === "object" && item !== null,
			)
		: [];
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}
