import {compareText} from "../../change-trace/order.ts";
import {
	CHANGE_DEFECT_CATEGORIES,
	CHANGE_DEFECT_SEVERITIES,
} from "../defect-profile.ts";
import {CHANGE_INTAKE_MATERIAL_TYPES} from "../intake/contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	BACKLOG_TRIAGE_PROJECTION_PROTOCOL,
	BACKLOG_TRIAGE_QUERY_PROTOCOL,
	TRIAGE_CONFIDENCE,
	TRIAGE_EFFORTS,
	TRIAGE_LEVELS,
	TRIAGE_ORDERINGS,
	type BacklogTriageCandidate,
	type BacklogTriageProjection,
	type BacklogTriageQueryFilters,
	type BacklogTriageQueryRequest,
	type BacklogTriageQueryResult,
} from "./contracts.ts";
import {
	compareTriageCandidates,
	orderingReasonsFor,
} from "./ordering.ts";
import {assertBacklogTriagePolicy} from "./policy.ts";

const REQUEST_FIELDS = ["protocol", "projectionDigest", "filters", "orderBy", "limit"] as const;
const FILTER_FIELDS = [
	"changeIds",
	"statuses",
	"sourceKinds",
	"readiness",
	"knowledgeRefs",
	"components",
	"categories",
	"severities",
	"securitySensitivity",
	"regressionStatuses",
	"urgency",
	"riskOfInaction",
	"efforts",
	"impacts",
	"confidence",
	"overlap",
	"freshness",
	"blocksActiveWork",
	"frontier",
	"minimumAgeDays",
	"maximumAgeDays",
] as const;
const CANDIDATE_STATUSES = [
	"pending",
	"deferred",
	"needs_repair",
	"escalated",
	"route_back",
] as const;
const READINESS_VALUES = [
	"ready",
	"needs_information",
	"suspected_duplicate",
	"suspected_conflict",
	"sensitive",
] as const;
const REGRESSION_STATUSES = ["unknown", "not_regression", "suspected", "confirmed"] as const;
const OVERLAP_VALUES = ["unknown", "possible", "confirmed"] as const;
const FRESHNESS_VALUES = ["fresh", "aging", "stale"] as const;
const SECURITY_SENSITIVITY_VALUES = ["unknown", "sensitive"] as const;
const TEXT_FILTERS = [
	["changeIds", 160],
	["knowledgeRefs", 500],
	["components", 500],
] as const;
const ENUM_FILTERS: readonly (readonly [string, readonly string[]])[] = [
	["statuses", CANDIDATE_STATUSES],
	["sourceKinds", CHANGE_INTAKE_MATERIAL_TYPES],
	["readiness", READINESS_VALUES],
	["categories", CHANGE_DEFECT_CATEGORIES],
	["severities", CHANGE_DEFECT_SEVERITIES],
	["securitySensitivity", SECURITY_SENSITIVITY_VALUES],
	["regressionStatuses", REGRESSION_STATUSES],
	["urgency", TRIAGE_LEVELS],
	["riskOfInaction", TRIAGE_LEVELS],
	["efforts", TRIAGE_EFFORTS],
	["impacts", TRIAGE_LEVELS],
	["confidence", TRIAGE_CONFIDENCE],
	["overlap", OVERLAP_VALUES],
	["freshness", FRESHNESS_VALUES],
];

export function queryBacklogTriage(
	projection: BacklogTriageProjection,
	request: BacklogTriageQueryRequest,
): BacklogTriageQueryResult {
	assertBacklogTriageProjection(projection);
	const normalizedRequest = normalizeQueryRequest(request);
	if (normalizedRequest.projectionDigest !== projection.projectionDigest) {
		throw new Error("Backlog triage query projectionDigest does not match current projection.");
	}
	const orderBy = normalizedRequest.orderBy ?? "default";
	const limit = normalizedRequest.limit ?? 50;
	const matched = projection.candidates
		.filter((candidate) => matchesFilters(candidate, normalizedRequest.filters))
		.sort((...candidates) =>
			compareTriageCandidates(
				candidates[0],
				candidates[1],
				orderBy,
				projection.policy,
			),
		);
	const returned = matched.slice(0, limit);
	const queryDigest = canonicalJsonDigest(normalizedRequest);
	const body = {
		protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
		projectionDigest: projection.projectionDigest,
		workStateDigest: projection.binding.workStateDigest,
		graphSnapshotDigest: projection.binding.graphSnapshotDigest,
		graphContentDigest: projection.binding.graphContentDigest,
		triagePolicyDigest: projection.binding.triagePolicyDigest,
		orderBy,
		queryDigest,
		items: returned.map((candidate, index) => ({
			rank: index + 1,
			candidate,
			orderingReasons: orderingReasonsFor(
				candidate,
				orderBy,
				projection.policy,
			),
		})),
		coverage: {
			projectedCandidateCount: projection.candidates.length,
			matchedCandidateCount: matched.length,
			returnedCandidateCount: returned.length,
			truncated: returned.length < matched.length,
		},
	};
	return toCanonicalJsonValue({
		...body,
		resultDigest: canonicalJsonDigest(body),
	}) as unknown as BacklogTriageQueryResult;
}

function normalizeQueryRequest(
	request: BacklogTriageQueryRequest,
): BacklogTriageQueryRequest {
	assertExactKeys(request, REQUEST_FIELDS, "Backlog triage query");
	assertExactKeys(request.protocol, ["id", "version", "maxResults"], "Backlog triage query protocol");
	if (
		request.protocol.id !== BACKLOG_TRIAGE_QUERY_PROTOCOL.id ||
		request.protocol.version !== BACKLOG_TRIAGE_QUERY_PROTOCOL.version ||
		request.protocol.maxResults !== BACKLOG_TRIAGE_QUERY_PROTOCOL.maxResults
	) {
		throw new Error("Backlog triage query protocol does not match the supported version.");
	}
	assertSha256Digest(request.projectionDigest, "Backlog triage query projectionDigest");
	const orderBy = request.orderBy ?? "default";
	if (!TRIAGE_ORDERINGS.includes(orderBy)) {
		throw new Error(`Backlog triage query orderBy must be one of: ${TRIAGE_ORDERINGS.join(", ")}.`);
	}
	const limit = request.limit ?? 50;
	if (
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > BACKLOG_TRIAGE_QUERY_PROTOCOL.maxResults
	) {
		throw new Error(
			`Backlog triage query limit must be an integer from 1 to ${BACKLOG_TRIAGE_QUERY_PROTOCOL.maxResults}.`,
		);
	}
	const filters = request.filters ? normalizeFilters(request.filters) : undefined;
	return toCanonicalJsonValue({
		protocol: BACKLOG_TRIAGE_QUERY_PROTOCOL,
		projectionDigest: request.projectionDigest,
		...(filters ? {filters} : {}),
		orderBy,
		limit,
	}) as unknown as BacklogTriageQueryRequest;
}

function normalizeFilters(filters: BacklogTriageQueryFilters): BacklogTriageQueryFilters {
	assertExactKeys(filters, FILTER_FIELDS, "Backlog triage query filters");
	const values = filters as unknown as Readonly<Record<string, unknown>>;
	const normalized: Record<string, unknown> = {};
	for (const [field, maxCodePoints] of TEXT_FILTERS) {
		if (values[field] !== undefined) {
			normalized[field] = textList(
				values[field] as readonly unknown[],
				field,
				32,
				maxCodePoints,
			);
		}
	}
	for (const [field, allowed] of ENUM_FILTERS) {
		if (values[field] !== undefined) {
			normalized[field] = enumList(
				values[field] as readonly unknown[],
				allowed,
				field,
			);
		}
	}
	for (const field of ["blocksActiveWork", "frontier"] as const) {
		if (values[field] !== undefined) {
			normalized[field] = booleanValue(values[field], field);
		}
	}
	const minimumAgeDays = optionalAge(filters.minimumAgeDays, "minimumAgeDays");
	const maximumAgeDays = optionalAge(filters.maximumAgeDays, "maximumAgeDays");
	if (
		minimumAgeDays !== undefined &&
		maximumAgeDays !== undefined &&
		minimumAgeDays > maximumAgeDays
	) {
		throw new Error("Backlog triage query minimumAgeDays must not exceed maximumAgeDays.");
	}
	if (minimumAgeDays !== undefined) normalized.minimumAgeDays = minimumAgeDays;
	if (maximumAgeDays !== undefined) normalized.maximumAgeDays = maximumAgeDays;
	return toCanonicalJsonValue(normalized) as unknown as BacklogTriageQueryFilters;
}

function matchesFilters(
	candidate: BacklogTriageCandidate,
	filters: BacklogTriageQueryFilters | undefined,
): boolean {
	if (!filters) return true;
	const selections: readonly (readonly [
		readonly unknown[] | undefined,
		readonly unknown[],
	])[] = [
		[filters.changeIds, [candidate.changeId]],
		[filters.statuses, [candidate.status]],
		[filters.sourceKinds, candidate.sourceKinds],
		[filters.readiness, [candidate.readiness.value]],
		[filters.knowledgeRefs, candidate.affectedScope.knowledgeRefs],
		[filters.components, candidate.affectedScope.components],
		[filters.categories, candidate.defect ? [candidate.defect.category] : []],
		[filters.severities, candidate.defect ? [candidate.defect.severity] : []],
		[filters.securitySensitivity, [candidate.securitySensitivity]],
		[
			filters.regressionStatuses,
			candidate.defect ? [candidate.defect.regressionStatus] : [],
		],
		[filters.urgency, [candidate.dimensions.urgency.value]],
		[filters.riskOfInaction, [candidate.dimensions.riskOfInaction.value]],
		[filters.efforts, [candidate.dimensions.effort.value]],
		[filters.impacts, [candidate.dimensions.expectedImpact.value]],
		[filters.confidence, [candidate.dimensions.confidence.value]],
		[filters.overlap, [candidate.overlap.status]],
		[filters.freshness, [candidate.freshness.status]],
	];
	if (!selections.every(([filter, values]) => matches(filter, values))) return false;
	return (
		(filters.blocksActiveWork === undefined ||
			candidate.blocksActiveWork === filters.blocksActiveWork) &&
		(filters.frontier === undefined || candidate.frontier.member === filters.frontier) &&
		(filters.minimumAgeDays === undefined ||
			candidate.freshness.ageDays >= filters.minimumAgeDays) &&
		(filters.maximumAgeDays === undefined ||
			candidate.freshness.ageDays <= filters.maximumAgeDays)
	);
}

function matches(filter: readonly unknown[] | undefined, values: readonly unknown[]): boolean {
	return !filter || values.some((value) => filter.includes(value));
}

export function assertBacklogTriageProjection(
	projection: BacklogTriageProjection,
): void {
	if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
		throw new Error("Backlog triage projection must be an object.");
	}
	assertExactKeys(
		projection,
		[
			"protocol",
			"asOf",
			"binding",
			"policy",
			"candidates",
			"coverage",
			"projectionDigest",
		],
		"Backlog triage projection",
	);
	assertExactKeys(
		projection.binding,
		[
			"remoteStateHead",
			"sourceHead",
			"knowledgeDigest",
			"configDigest",
			"policyDigest",
			"triagePolicyDigest",
			"workStateDigest",
			"graphSnapshotDigest",
			"graphContentDigest",
		],
		"Backlog triage projection binding",
	);
	assertExactKeys(
		projection.protocol,
		["id", "version", "maxCandidates", "freshDays", "staleDays"],
		"Backlog triage projection protocol",
	);
	if (
		projection.protocol.id !== BACKLOG_TRIAGE_PROJECTION_PROTOCOL.id ||
		projection.protocol.version !== BACKLOG_TRIAGE_PROJECTION_PROTOCOL.version ||
		projection.protocol.maxCandidates !==
			BACKLOG_TRIAGE_PROJECTION_PROTOCOL.maxCandidates ||
		projection.protocol.freshDays !== BACKLOG_TRIAGE_PROJECTION_PROTOCOL.freshDays ||
		projection.protocol.staleDays !== BACKLOG_TRIAGE_PROJECTION_PROTOCOL.staleDays
	) {
		throw new Error("Backlog triage projection protocol is unsupported.");
	}
	assertBacklogTriagePolicy(projection.policy);
	if (
		projection.binding.triagePolicyDigest !== projection.policy.policyDigest ||
		projection.binding.configDigest !== projection.policy.projectConfigDigest
	) {
		throw new Error("Backlog triage projection policy binding is invalid.");
	}
	const {projectionDigest, ...body} = projection;
	assertSha256Digest(projectionDigest, "Backlog triage projectionDigest");
	if (canonicalJsonDigest(body) !== projectionDigest) {
		throw new Error("Backlog triage projection digest is invalid.");
	}
	for (const candidate of projection.candidates) {
		const {candidateDigest, ...candidateBody} = candidate;
		if (canonicalJsonDigest(candidateBody) !== candidateDigest) {
			throw new Error(`Backlog triage candidate ${candidate.changeId} digest is invalid.`);
		}
	}
}

function enumList(
	input: readonly unknown[],
	values: readonly string[],
	label: string,
): string[] {
	const normalized = textList(input, label, 32, 500);
	for (const value of normalized) {
		if (!values.includes(value)) {
			throw new Error(`Backlog triage query ${label} must contain only: ${values.join(", ")}.`);
		}
	}
	return normalized;
}

function textList(
	input: readonly unknown[],
	label: string,
	maximum: number,
	maxCodePoints: number,
): string[] {
	if (!Array.isArray(input)) throw new Error(`Backlog triage query ${label} must be an array.`);
	if (input.length < 1 || input.length > maximum) {
		throw new Error(`Backlog triage query ${label} must contain 1 to ${maximum} values.`);
	}
	const values = input.map((value, index) => {
		if (typeof value !== "string") {
			throw new Error(`Backlog triage query ${label}[${index}] must be text.`);
		}
		const normalized = value.normalize("NFC").trim();
		if (!normalized || [...normalized].length > maxCodePoints || /\p{Cc}/u.test(normalized)) {
			throw new Error(`Backlog triage query ${label}[${index}] is invalid.`);
		}
		return normalized;
	});
	if (new Set(values).size !== values.length) {
		throw new Error(`Backlog triage query ${label} must not contain duplicates.`);
	}
	return values.sort(compareText);
}

function optionalAge(value: unknown, label: string): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 36_500) {
		throw new Error(`Backlog triage query ${label} must be an integer from 0 to 36500.`);
	}
	return value as number;
}

function booleanValue(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`Backlog triage query ${label} must be boolean.`);
	}
	return value;
}
