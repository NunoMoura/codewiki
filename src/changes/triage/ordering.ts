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
const AUTHORITY_RANK = Object.freeze({none: 0, asserted: 1, observed: 2, verified: 3, approved: 4});

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
): number {
	const difference = compareSelectedOrder(left, right, orderBy);
	return difference || compareDefault(left, right);
}

function compareSelectedOrder(
	left: BacklogTriageCandidate,
	right: BacklogTriageCandidate,
	orderBy: TriageOrdering,
): number {
	switch (orderBy) {
		case "urgency":
			return descendingKnown(
				LEVEL_RANK[left.dimensions.urgency.value],
				LEVEL_RANK[right.dimensions.urgency.value],
			);
		case "risk_of_inaction":
			return descendingKnown(
				LEVEL_RANK[left.dimensions.riskOfInaction.value],
				LEVEL_RANK[right.dimensions.riskOfInaction.value],
			);
		case "expected_impact":
			return descendingKnown(
				LEVEL_RANK[left.dimensions.expectedImpact.value],
				LEVEL_RANK[right.dimensions.expectedImpact.value],
			);
		case "effort":
			return ascendingKnown(
				EFFORT_RANK[left.dimensions.effort.value],
				EFFORT_RANK[right.dimensions.effort.value],
			);
		case "decision_readiness":
			return READINESS_RANK[left.readiness.value] - READINESS_RANK[right.readiness.value];
		case "confidence":
			return descendingKnown(
				CONFIDENCE_RANK[left.dimensions.confidence.value],
				CONFIDENCE_RANK[right.dimensions.confidence.value],
			);
		case "work_unblocked":
			return descendingKnown(
				numericDimension(left.dimensions.workUnblocked.value),
				numericDimension(right.dimensions.workUnblocked.value),
			);
		case "newest":
			return (
				Date.parse(right.freshness.lastObservedAt) -
				Date.parse(left.freshness.lastObservedAt)
			);
		case "oldest":
			return (
				Date.parse(left.freshness.lastObservedAt) -
				Date.parse(right.freshness.lastObservedAt)
			);
		default:
			return 0;
	}
}

export function orderingReasonsFor(
	candidate: BacklogTriageCandidate,
	orderBy: TriageOrdering,
): readonly TriageOrderingReason[] {
	if (orderBy === "default") return candidate.defaultOrdering.reasons;
	const reason = orderingDimension(candidate, orderBy);
	return Object.freeze([reason, ...candidate.defaultOrdering.reasons].slice(0, 4));
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

function compareDefault(left: BacklogTriageCandidate, right: BacklogTriageCandidate): number {
	return (
		left.defaultOrdering.tier - right.defaultOrdering.tier ||
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
	switch (orderBy) {
		case "urgency":
			supported = candidate.dimensions.urgency;
			break;
		case "risk_of_inaction":
			supported = candidate.dimensions.riskOfInaction;
			break;
		case "expected_impact":
			supported = candidate.dimensions.expectedImpact;
			break;
		case "effort":
			supported = candidate.dimensions.effort;
			break;
		case "confidence":
			supported = candidate.dimensions.confidence;
			break;
		default:
			break;
	}
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
