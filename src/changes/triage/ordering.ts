import {compareText} from "../../change-trace/order.ts";
import {
	BACKLOG_TRIAGE_PROJECTION_PROTOCOL,
	type BacklogTriageCandidate,
	type DecisionReadiness,
	type TriageDefaultOrdering,
	type TriageEffort,
	type TriageFairness,
	type TriageFrontier,
	type TriageLevel,
	type TriageOrdering,
	type TriageOrderingReason,
} from "./contracts.ts";
import type {
	BacklogTriagePolicy,
	BacklogTriagePolicyCriterion,
	TriagePreferenceDimension,
} from "./policy.ts";

const LEVEL_RANK: Readonly<Record<TriageLevel, number>> = Object.freeze({
	unknown: -1,
	low: 0,
	moderate: 1,
	high: 2,
	critical: 3,
});
const EFFORT_RANK: Readonly<Record<TriageEffort, number>> = Object.freeze({
	unknown: Number.POSITIVE_INFINITY,
	tiny: 0,
	small: 1,
	medium: 2,
	large: 3,
	extra_large: 4,
});
const READINESS_RANK: Readonly<Record<DecisionReadiness, number>> = Object.freeze({
	ready: 0,
	sensitive: 1,
	suspected_conflict: 2,
	needs_information: 3,
	suspected_duplicate: 4,
});
const CONFIDENCE_RANK = Object.freeze({unknown: -1, low: 0, medium: 1, high: 2});
const SEVERITY_RANK = Object.freeze({
	unknown: -1,
	informational: 0,
	low: 1,
	medium: 2,
	high: 3,
	critical: 4,
});
const EXPOSURE_RANK = Object.freeze({
	unknown: -1,
	isolated: 0,
	limited: 1,
	broad: 2,
	systemic: 3,
});
const REGRESSION_RANK = Object.freeze({
	unknown: -1,
	not_regression: 0,
	suspected: 1,
	confirmed: 2,
});
const FRESHNESS_RANK = Object.freeze({stale: 0, aging: 1, fresh: 2});
const AUTHORITY_RANK = Object.freeze({none: 0, asserted: 1, observed: 2, verified: 3, approved: 4});
const POLICY_DIMENSION_RANK: Readonly<
	Record<TriagePreferenceDimension, (candidate: BacklogTriageCandidate) => number>
> = Object.freeze({
	severity: (candidate) =>
		candidate.defect ? SEVERITY_RANK[candidate.defect.severity] : -1,
	exposure: (candidate) =>
		candidate.defect ? EXPOSURE_RANK[candidate.defect.exposure] : -1,
	regression: regressionRank,
	urgency: (candidate) => LEVEL_RANK[candidate.dimensions.urgency.value],
	risk_of_inaction: (candidate) =>
		LEVEL_RANK[candidate.dimensions.riskOfInaction.value],
	impact: (candidate) => LEVEL_RANK[candidate.dimensions.expectedImpact.value],
	strategic_value: (candidate) =>
		LEVEL_RANK[candidate.dimensions.strategicValue.value],
	effort: (candidate) => EFFORT_RANK[candidate.dimensions.effort.value],
	confidence: (candidate) =>
		CONFIDENCE_RANK[candidate.dimensions.confidence.value],
	freshness: (candidate) => FRESHNESS_RANK[candidate.freshness.status],
	age_fairness: (candidate) => candidate.fairness.ageDays,
});
const POLICY_DIMENSION_DISPLAY: Readonly<
	Record<TriagePreferenceDimension, (candidate: BacklogTriageCandidate) => string>
> = Object.freeze({
	severity: (candidate) => candidate.defect?.severity ?? "unknown",
	exposure: (candidate) => candidate.defect?.exposure ?? "unknown",
	regression: regressionDisplay,
	urgency: (candidate) => candidate.dimensions.urgency.value,
	risk_of_inaction: (candidate) => candidate.dimensions.riskOfInaction.value,
	impact: (candidate) => candidate.dimensions.expectedImpact.value,
	strategic_value: (candidate) => candidate.dimensions.strategicValue.value,
	effort: (candidate) => candidate.dimensions.effort.value,
	confidence: (candidate) => candidate.dimensions.confidence.value,
	freshness: (candidate) => candidate.freshness.status,
	age_fairness: (candidate) => String(candidate.fairness.ageDays),
});
const POLICY_DIMENSION_REFS: Readonly<
	Record<TriagePreferenceDimension, (candidate: BacklogTriageCandidate) => string[]>
> = Object.freeze({
	severity: defectOrSourceRefs,
	exposure: defectOrSourceRefs,
	regression: defectOrSourceRefs,
	urgency: (candidate) => supportRefs(candidate.dimensions.urgency.basis),
	risk_of_inaction: (candidate) =>
		supportRefs(candidate.dimensions.riskOfInaction.basis),
	impact: (candidate) => supportRefs(candidate.dimensions.expectedImpact.basis),
	strategic_value: (candidate) =>
		supportRefs(candidate.dimensions.strategicValue.basis),
	effort: (candidate) => supportRefs(candidate.dimensions.effort.basis),
	confidence: (candidate) => supportRefs(candidate.dimensions.confidence.basis),
	freshness: (candidate) => supportRefs(candidate.freshness.basis),
	age_fairness: (candidate) => supportRefs(candidate.freshness.basis),
});

type FrontierInput = Pick<BacklogTriageCandidate, "changeId" | "readiness" | "dimensions">;

export function projectTriageFrontier(
	candidate: FrontierInput,
	candidates: readonly FrontierInput[],
): TriageFrontier {
	const impact = candidate.dimensions.expectedImpact.value;
	const effort = candidate.dimensions.effort.value;
	const eligible =
		candidate.readiness.value === "ready" && impact !== "unknown" && effort !== "unknown";
	if (!eligible) {
		return Object.freeze({
			eligible: false,
			member: false,
			dimensions: ["expected_impact", "effort"] as const,
			reasonCode: "frontier_requires_ready_known_impact_and_effort",
		});
	}
	const dominated = candidates.some((other) => {
		if (other.changeId === candidate.changeId || other.readiness.value !== "ready") return false;
		const otherImpact = other.dimensions.expectedImpact.value;
		const otherEffort = other.dimensions.effort.value;
		if (otherImpact === "unknown" || otherEffort === "unknown") return false;
		const atLeastAsMuchImpact = LEVEL_RANK[otherImpact] >= LEVEL_RANK[impact];
		const noMoreEffort = EFFORT_RANK[otherEffort] <= EFFORT_RANK[effort];
		const strictlyBetter =
			LEVEL_RANK[otherImpact] > LEVEL_RANK[impact] ||
			EFFORT_RANK[otherEffort] < EFFORT_RANK[effort];
		return atLeastAsMuchImpact && noMoreEffort && strictlyBetter;
	});
	return Object.freeze({
		eligible: true,
		member: !dominated,
		dimensions: ["expected_impact", "effort"] as const,
		reasonCode: dominated ? "dominated_on_impact_and_effort" : "pareto_frontier_member",
	});
}

export function projectTriageFairness(ageDays: number): TriageFairness {
	let band: TriageFairness["band"] = "long_waiting";
	if (ageDays < 7) band = "new";
	else if (ageDays < BACKLOG_TRIAGE_PROJECTION_PROTOCOL.staleDays) {
		band = "established";
	} else if (ageDays < 90) band = "aging";
	return Object.freeze({
		band,
		ageDays,
		ageBoostApplied: ageDays >= BACKLOG_TRIAGE_PROJECTION_PROTOCOL.staleDays,
	});
}

type DefaultOrderingInput = Pick<
	BacklogTriageCandidate,
	| "changeId"
	| "changeRevisionId"
	| "readiness"
	| "dimensions"
	| "blocksActiveWork"
	| "escapedRegression"
	| "frontier"
	| "fairness"
	| "defect"
>;

export function projectDefaultTriageOrdering(
	candidate: DefaultOrderingInput,
): TriageDefaultOrdering {
	return (
		protectedOrdering(candidate) ??
		activeWorkOrdering(candidate) ??
		frontierOrdering(candidate) ??
		clarificationOrdering(candidate) ??
		fairnessOrdering(candidate) ??
		ordering(6, {
			code: `readiness_${candidate.readiness.value}`,
			detail:
				"Incomplete, sensitive, conflicting, or duplicate material remains visible after ready work.",
			refs: candidate.readiness.basis.canonicalRefs,
		})
	);
}

function protectedOrdering(candidate: DefaultOrderingInput): TriageDefaultOrdering | null {
	if (!confirmedProtectedEscalation(candidate)) return null;
	return ordering(1, {
		code: "confirmed_protected_escalation",
		detail: "Verified or approved protected escalation requires first Decision attention.",
		refs: supportRefs(candidate.dimensions.protectedEscalation.basis),
	});
}

function activeWorkOrdering(candidate: DefaultOrderingInput): TriageDefaultOrdering | null {
	if (!candidate.blocksActiveWork && !candidate.escapedRegression) return null;
	let code = "escaped_or_reintroduced_regression";
	let detail = "Escaped or reintroduced regression requires early Decision attention.";
	let refs: string[] = [candidate.changeRevisionId];
	if (candidate.blocksActiveWork) {
		code = "active_work_blocked";
		detail = "Pending intent blocks active accepted work.";
		refs = supportRefs(candidate.dimensions.workUnblocked.basis);
	} else if (candidate.defect) {
		refs = [candidate.defect.profileId];
	}
	return ordering(2, {code, detail, refs});
}

function frontierOrdering(candidate: DefaultOrderingInput): TriageDefaultOrdering | null {
	if (!candidate.frontier.member || candidate.readiness.value !== "ready") return null;
	return ordering(3, {
		code: "decision_ready_pareto_frontier",
		detail: "Decision-ready candidate is not dominated on expected impact and effort.",
		refs: sortedUnique([
			...supportRefs(candidate.dimensions.expectedImpact.basis),
			...supportRefs(candidate.dimensions.effort.basis),
		]),
	});
}

function clarificationOrdering(candidate: DefaultOrderingInput): TriageDefaultOrdering | null {
	if (
		candidate.readiness.value !== "needs_information" ||
		LEVEL_RANK[candidate.dimensions.expectedImpact.value] < LEVEL_RANK.high ||
		EFFORT_RANK[candidate.dimensions.effort.value] > EFFORT_RANK.small
	) {
		return null;
	}
	return ordering(4, {
		code: "high_value_low_cost_clarification",
		detail: "High-impact, low-effort candidate needs bounded clarification.",
		refs: candidate.readiness.basis.canonicalRefs,
	});
}

function fairnessOrdering(candidate: DefaultOrderingInput): TriageDefaultOrdering | null {
	if (candidate.readiness.value !== "ready" && !candidate.fairness.ageBoostApplied) {
		return null;
	}
	if (candidate.fairness.ageBoostApplied) {
		return ordering(5, {
			code: "bounded_age_fairness",
			detail: "Bounded age fairness prevents indefinite starvation.",
			refs: [candidate.changeRevisionId],
		});
	}
	return ordering(5, {
		code: "decision_ready_fairness",
		detail: "Ready candidate participates in age-based fair ordering.",
		refs: [candidate.changeRevisionId],
	});
}

export function compareTriageCandidates(
	left: BacklogTriageCandidate,
	right: BacklogTriageCandidate,
	orderBy: TriageOrdering = "default",
	policy?: BacklogTriagePolicy,
): number {
	const difference = compareSelectedOrder(left, right, orderBy);
	return difference || compareDefault({left, right, policy});
}

function compareSelectedOrder(
	left: BacklogTriageCandidate,
	right: BacklogTriageCandidate,
	orderBy: TriageOrdering,
): number {
	if (orderBy === "urgency") {
		return descendingKnown(
			LEVEL_RANK[left.dimensions.urgency.value],
			LEVEL_RANK[right.dimensions.urgency.value],
		);
	}
	if (orderBy === "risk_of_inaction") {
		return descendingKnown(
			LEVEL_RANK[left.dimensions.riskOfInaction.value],
			LEVEL_RANK[right.dimensions.riskOfInaction.value],
		);
	}
	if (orderBy === "expected_impact") {
		return descendingKnown(
			LEVEL_RANK[left.dimensions.expectedImpact.value],
			LEVEL_RANK[right.dimensions.expectedImpact.value],
		);
	}
	if (orderBy === "effort") {
		return ascendingKnown(
			EFFORT_RANK[left.dimensions.effort.value],
			EFFORT_RANK[right.dimensions.effort.value],
		);
	}
	if (orderBy === "decision_readiness") {
		return READINESS_RANK[left.readiness.value] - READINESS_RANK[right.readiness.value];
	}
	if (orderBy === "confidence") {
		return descendingKnown(
			CONFIDENCE_RANK[left.dimensions.confidence.value],
			CONFIDENCE_RANK[right.dimensions.confidence.value],
		);
	}
	if (orderBy === "work_unblocked") {
		return descendingKnown(
			numericDimension(left.dimensions.workUnblocked.value),
			numericDimension(right.dimensions.workUnblocked.value),
		);
	}
	if (orderBy === "newest") {
		return (
			Date.parse(right.freshness.lastObservedAt) -
			Date.parse(left.freshness.lastObservedAt)
		);
	}
	if (orderBy === "oldest") {
		return (
			Date.parse(left.freshness.lastObservedAt) -
			Date.parse(right.freshness.lastObservedAt)
		);
	}
	return 0;
}

export function orderingReasonsFor(
	candidate: BacklogTriageCandidate,
	orderBy: TriageOrdering,
	policy?: BacklogTriagePolicy,
): readonly TriageOrderingReason[] {
	const preferenceReasons = policy
		? policy.criteria.map((criterion) =>
				policyOrderingReason(candidate, criterion, policy),
			)
		: [];
	if (orderBy === "default") {
		return Object.freeze([
			...candidate.defaultOrdering.reasons,
			...preferenceReasons,
		]);
	}
	const reason = orderingDimension(candidate, orderBy);
	return Object.freeze([
		reason,
		...candidate.defaultOrdering.reasons,
		...preferenceReasons,
	]);
}

function confirmedProtectedEscalation(
	candidate: Pick<BacklogTriageCandidate, "dimensions">,
): boolean {
	const supported = candidate.dimensions.protectedEscalation;
	return (
		supported.value === true &&
		AUTHORITY_RANK[supported.basis.authority] >= AUTHORITY_RANK.verified
	);
}

function compareDefault(input: {
	readonly left: BacklogTriageCandidate;
	readonly right: BacklogTriageCandidate;
	readonly policy: BacklogTriagePolicy | undefined;
}): number {
	const {left, right, policy} = input;
	return (
		left.defaultOrdering.tier - right.defaultOrdering.tier ||
		comparePolicyCriteria({left, right, policy}) ||
		descendingKnown(
			LEVEL_RANK[left.dimensions.urgency.value],
			LEVEL_RANK[right.dimensions.urgency.value],
		) ||
		descendingKnown(
			LEVEL_RANK[left.dimensions.riskOfInaction.value],
			LEVEL_RANK[right.dimensions.riskOfInaction.value],
		) ||
		descendingKnown(
			LEVEL_RANK[left.dimensions.expectedImpact.value],
			LEVEL_RANK[right.dimensions.expectedImpact.value],
		) ||
		ascendingKnown(
			EFFORT_RANK[left.dimensions.effort.value],
			EFFORT_RANK[right.dimensions.effort.value],
		) ||
		right.fairness.ageDays - left.fairness.ageDays ||
		compareText(left.changeId, right.changeId)
	);
}

function comparePolicyCriteria(input: {
	readonly left: BacklogTriageCandidate;
	readonly right: BacklogTriageCandidate;
	readonly policy: BacklogTriagePolicy | undefined;
}): number {
	const {left, right, policy} = input;
	if (!policy) return 0;
	for (const criterion of policy.criteria) {
		const leftValue = policyDimensionRank(left, criterion.dimension);
		const rightValue = policyDimensionRank(right, criterion.dimension);
		const difference = criterion.direction === "ascending"
			? ascendingKnown(leftValue, rightValue)
			: descendingKnown(leftValue, rightValue);
		if (difference !== 0) return difference;
	}
	return 0;
}

function policyDimensionRank(
	candidate: BacklogTriageCandidate,
	dimension: TriagePreferenceDimension,
): number {
	return POLICY_DIMENSION_RANK[dimension](candidate);
}

function policyOrderingReason(
	candidate: BacklogTriageCandidate,
	criterion: BacklogTriagePolicyCriterion,
	policy: BacklogTriagePolicy,
): TriageOrderingReason {
	const bindings = policy.bindings.filter((binding) =>
		criterion.bindingIds.includes(binding.bindingId),
	);
	const value = policyDimensionDisplayValue(candidate, criterion.dimension);
	return {
		code: `standard_preference_${criterion.dimension}_${value}`,
		detail: `Accepted User Standard preference compares ${criterion.dimension.replaceAll("_", " ")} ${criterion.direction}; candidate value is ${value}.`,
		refs: sortedUnique([
			...criterion.bindingIds,
			...bindings.flatMap((binding) => [
				binding.userStandardId,
				binding.passageId,
			]),
			...POLICY_DIMENSION_REFS[criterion.dimension](candidate),
		]),
	};
}

function policyDimensionDisplayValue(
	candidate: BacklogTriageCandidate,
	dimension: TriagePreferenceDimension,
): string {
	return POLICY_DIMENSION_DISPLAY[dimension](candidate);
}

function regressionRank(candidate: BacklogTriageCandidate): number {
	if (candidate.defect) {
		return REGRESSION_RANK[candidate.defect.regressionStatus];
	}
	return candidate.escapedRegression ? REGRESSION_RANK.confirmed : -1;
}

function regressionDisplay(candidate: BacklogTriageCandidate): string {
	if (candidate.defect) return candidate.defect.regressionStatus;
	return candidate.escapedRegression ? "confirmed" : "unknown";
}

function defectOrSourceRefs(candidate: BacklogTriageCandidate): string[] {
	return candidate.defect
		? [candidate.defect.profileId]
		: [...candidate.sourceProvenanceRefs];
}

function orderingDimension(
	candidate: BacklogTriageCandidate,
	orderBy: Exclude<TriageOrdering, "default">,
): TriageOrderingReason {
	if (orderBy === "decision_readiness") {
		return {
			code: `ordered_by_readiness_${candidate.readiness.value}`,
			detail: `Decision readiness is ${candidate.readiness.value}.`,
			refs: candidate.readiness.basis.canonicalRefs,
		};
	}
	if (orderBy === "newest" || orderBy === "oldest") {
		return {
			code: `ordered_by_${orderBy}`,
			detail: `Last observed at ${candidate.freshness.lastObservedAt}.`,
			refs: candidate.freshness.basis.canonicalRefs,
		};
	}
	let supported: {
		readonly value: unknown;
		readonly basis: BacklogTriageCandidate["dimensions"]["urgency"]["basis"];
	} = candidate.dimensions.workUnblocked;
	if (orderBy === "urgency") supported = candidate.dimensions.urgency;
	if (orderBy === "risk_of_inaction") {
		supported = candidate.dimensions.riskOfInaction;
	}
	if (orderBy === "expected_impact") {
		supported = candidate.dimensions.expectedImpact;
	}
	if (orderBy === "effort") supported = candidate.dimensions.effort;
	if (orderBy === "confidence") supported = candidate.dimensions.confidence;
	return {
		code: `ordered_by_${orderBy}_${String(supported.value)}`,
		detail: `${orderBy.replaceAll("_", " ")} is ${String(supported.value)}.`,
		refs: supportRefs(supported.basis),
	};
}

function ordering(
	tier: TriageDefaultOrdering["tier"],
	reason: TriageOrderingReason,
): TriageDefaultOrdering {
	return Object.freeze({tier, reasons: Object.freeze([{...reason, refs: sortedUnique(reason.refs)}])});
}

function supportRefs(basis: BacklogTriageCandidate["dimensions"]["urgency"]["basis"]): string[] {
	return sortedUnique([
		...basis.canonicalRefs,
		...basis.observedRefs,
		...basis.evidenceRefs,
		...basis.analysisRefs,
	]);
}

function ascendingKnown(left: number, right: number): number {
	if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
	if (!Number.isFinite(right)) return -1;
	return left - right;
}

function descendingKnown(left: number, right: number): number {
	if (left < 0) return right < 0 ? 0 : 1;
	if (right < 0) return -1;
	return right - left;
}

function numericDimension(value: number | "unknown"): number {
	return value === "unknown" ? -1 : value;
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}
