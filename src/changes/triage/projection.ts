import {
	assertValidAlignmentGraphSnapshot,
	type AlignmentGraphEdge,
	type AlignmentGraphSnapshot,
} from "../../change-trace/alignment-graph.ts";
import type {ChangeRevision} from "../../change-trace/contracts.ts";
import {operationPayload} from "../../change-trace/identity.ts";
import {compareText, sameText} from "../../change-trace/order.ts";
import type {
	ChangeWorkState,
	ProjectWorkState,
	RelationshipProjection,
} from "../../change-trace/state.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../../utils/canonical-json.ts";
import type {ChangeDefectProfile} from "../defect-profile.ts";
import type {ChangeIntakeMaterial} from "../intake/contracts.ts";
import {normalizeChangeIntakeMaterial} from "../intake/normalize.ts";
import {
	BACKLOG_TRIAGE_PROJECTION_PROTOCOL,
	type BacklogTriageCandidate,
	type BacklogTriageProjection,
	type BacklogTriageProjectionBinding,
	type NormalizedTriageEstimate,
	type TriageCandidateStatus,
	type TriageDecisionReadiness,
	type TriageDefectSummary,
	type TriageDimensionBasis,
	type TriageDimensions,
	type TriageEstimateInput,
	type TriageFreshnessProjection,
	type TriageOverlap,
	type TriageSupportedValue,
} from "./contracts.ts";
import {normalizeTriageEstimates} from "./estimates.ts";
import {
	compareTriageCandidates,
	projectDefaultTriageOrdering,
	projectTriageFairness,
	projectTriageFrontier,
} from "./ordering.ts";

const PROJECTION_REF = `${BACKLOG_TRIAGE_PROJECTION_PROTOCOL.id}@${BACKLOG_TRIAGE_PROJECTION_PROTOCOL.version}`;
const DAY_MILLISECONDS = 86_400_000;
const SENSITIVE_SECURITY_CLASSIFICATIONS = new Set([
	"secret_exposure",
	"privacy_finding",
]);

export interface BuildBacklogTriageProjectionInput {
	readonly workState: ProjectWorkState;
	readonly graph: AlignmentGraphSnapshot;
	readonly asOf: string;
	readonly estimates?: readonly TriageEstimateInput[];
}

interface CandidateContext {
	readonly change: ChangeWorkState;
	readonly revision: ChangeRevision;
	readonly status: TriageCandidateStatus;
	readonly revisionOperationId: string;
	readonly relevantOperations: readonly ChangeWorkState["operations"][number][];
	readonly materials: readonly ChangeIntakeMaterial[];
	readonly lastObservedAt: string;
}

interface ActiveRelationship {
	readonly sourceChangeId: string;
	readonly targetChangeId: string;
	readonly relationship: RelationshipProjection;
	readonly graphEdge: AlignmentGraphEdge | null;
}

type CandidateDraft = Omit<
	BacklogTriageCandidate,
	"frontier" | "fairness" | "defaultOrdering" | "candidateDigest"
>;

interface PreparedTriageProjection {
	readonly asOf: string;
	readonly binding: BacklogTriageProjectionBinding;
	readonly contexts: readonly CandidateContext[];
	readonly estimates: readonly NormalizedTriageEstimate[];
	readonly estimatesByRevision: ReadonlyMap<string, NormalizedTriageEstimate>;
	readonly activeChangeIds: ReadonlySet<string>;
	readonly activeRelationships: readonly ActiveRelationship[];
	readonly duplicatePeers: ReadonlyMap<string, readonly string[]>;
}

export function buildBacklogTriageProjection(
	input: BuildBacklogTriageProjectionInput,
): BacklogTriageProjection {
	const prepared = prepareTriageProjection(input);
	const candidates = projectTriageCandidates(prepared);
	const projected = candidates.slice(0, BACKLOG_TRIAGE_PROJECTION_PROTOCOL.maxCandidates);
	const body = {
		protocol: BACKLOG_TRIAGE_PROJECTION_PROTOCOL,
		asOf: prepared.asOf,
		binding: prepared.binding,
		candidates: projected,
		coverage: projectionCoverage(input, prepared, projected, candidates.length),
	};
	return toCanonicalJsonValue({
		...body,
		projectionDigest: canonicalJsonDigest(body),
	}) as unknown as BacklogTriageProjection;
}

function prepareTriageProjection(
	input: BuildBacklogTriageProjectionInput,
): PreparedTriageProjection {
	const asOf = canonicalIsoTimestamp(input.asOf, "Backlog triage asOf");
	const binding = assertProjectionBinding(input.workState, input.graph);
	const contexts = input.workState.changes.flatMap((change) => {
		const context = candidateContext(change);
		return context ? [context] : [];
	});
	const estimates = normalizeTriageEstimates(input.estimates ?? [], binding);
	assertEstimateTargets(estimates, contexts);
	assertEstimateAuthorities(estimates, input.graph);
	return {
		asOf,
		binding,
		contexts,
		estimates,
		estimatesByRevision: new Map(
			estimates.map((estimate) => [estimate.changeRevisionId, estimate]),
		),
		activeChangeIds: new Set(
			input.workState.changes.flatMap((change) =>
				isAcceptedActiveChange(change) ? [change.changeId] : [],
			),
		),
		activeRelationships: collectActiveRelationships(input.workState, input.graph),
		duplicatePeers: duplicatePeerMap(contexts),
	};
}

function projectTriageCandidates(
	prepared: PreparedTriageProjection,
): BacklogTriageCandidate[] {
	const drafts = prepared.contexts.map((context) =>
		projectCandidateDraft({
			context,
			contexts: prepared.contexts,
			asOf: prepared.asOf,
			estimate: prepared.estimatesByRevision.get(context.revision.revisionId),
			activeRelationships: prepared.activeRelationships,
			activeChangeIds: prepared.activeChangeIds,
			duplicatePeers: prepared.duplicatePeers,
		}),
	);
	const withFrontier = drafts.map((draft) => ({
		...draft,
		frontier: projectTriageFrontier(
			draft as BacklogTriageCandidate,
			drafts as BacklogTriageCandidate[],
		),
		fairness: projectTriageFairness(draft.freshness.ageDays),
	}));
	const candidates = withFrontier.map((candidate) => {
		const withOrdering = {
			...candidate,
			defaultOrdering: projectDefaultTriageOrdering(candidate as BacklogTriageCandidate),
		};
		return canonicalCandidate({
			...withOrdering,
			candidateDigest: canonicalJsonDigest(withOrdering),
		});
	});
	return candidates.sort((left, right) => compareTriageCandidates(left, right));
}

function projectionCoverage(
	input: BuildBacklogTriageProjectionInput,
	prepared: PreparedTriageProjection,
	projected: readonly BacklogTriageCandidate[],
	totalCandidateCount: number,
): BacklogTriageProjection["coverage"] {
	return {
		totalChangeCount: input.workState.changes.length,
		eligibleChangeCount: prepared.contexts.length,
		projectedCandidateCount: projected.length,
		estimateCount: prepared.estimates.length,
		unknownDimensionCount: projected.reduce(
			(total, candidate) => total + unknownDimensionCountFor(candidate.dimensions),
			0,
		),
		graphFactCount: input.graph.nodes.length + input.graph.edges.length,
		knowledgeConceptCount: input.graph.coverage.knowledgeConceptCount,
		sourceOwnershipCount: input.graph.coverage.sourceOwnershipCount,
		truncated: projected.length < totalCandidateCount,
	};
}

function projectCandidateDraft(input: {
	readonly context: CandidateContext;
	readonly contexts: readonly CandidateContext[];
	readonly asOf: string;
	readonly estimate: NormalizedTriageEstimate | undefined;
	readonly activeRelationships: readonly ActiveRelationship[];
	readonly activeChangeIds: ReadonlySet<string>;
	readonly duplicatePeers: ReadonlyMap<string, readonly string[]>;
}): CandidateDraft {
	const {change, revision} = input.context;
	if (canonicalJsonDigest(revision.content) !== revision.revisionId) {
		throw new Error(`Backlog triage Change ${change.changeId} has invalid revision identity.`);
	}
	const profile = revision.content.defectProfile;
	const relationFacts = input.activeRelationships.filter(
		(relation) =>
			relation.sourceChangeId === change.changeId ||
			relation.targetChangeId === change.changeId,
	);
	const sourceKinds = sortedUnique(
		input.context.materials.map((material) => material.materialType),
	);
	const sourceProvenanceRefs = sortedUnique([
		...revision.content.sourceRefs,
		...input.context.materials.flatMap((material) => material.content.sourceRefs),
		...input.context.relevantOperations.map((operation) => operation.operationId),
	]);
	const affectedScope = {
		knowledgeRefs: sortedUnique(revision.content.knowledgeRefs),
		sourceRefs: sortedUnique([
			...revision.content.sourceRefs,
			...(profile?.sourceLocations ?? []),
			...input.context.materials.flatMap((material) => material.content.affectedRefs),
		]),
		components: sortedUnique(profile?.affectedComponents ?? []),
		users: [] as string[],
		owners: [] as string[],
		usersKnown: false,
		ownersKnown: false,
	};
	const overlap = projectOverlap(
		input.context,
		input.contexts,
		relationFacts,
		affectedScope,
	);
	const duplicateChangeIds = input.duplicatePeers.get(change.changeId) ?? [];
	const securitySensitivity = isSecuritySensitive(profile) ? "sensitive" : "unknown";
	const readiness = projectReadiness({
		context: input.context,
		profile,
		relationFacts,
		duplicateChangeIds,
		securitySensitivity,
	});
	const blockedActiveChanges = blockedActiveChangeIds(
		change.changeId,
		input.activeRelationships,
		input.activeChangeIds,
	);
	const dimensions = projectDimensions({
		revisionId: revision.revisionId,
		profile,
		estimate: input.estimate,
		blockedActiveChanges,
		relationFacts,
	});
	const freshness = projectFreshness(input.context, input.asOf);
	return {
		changeId: change.changeId,
		changeRevisionId: revision.revisionId,
		title: revision.content.title,
		summary: revision.content.summary,
		desiredOutcome: revision.content.desiredOutcome,
		decisionQuestion: `Should revision ${revision.revisionId} be approved, deferred, rejected, or withdrawn?`,
		status: input.context.status,
		declaredChangeRisk: revision.content.risk,
		sourceKinds,
		sourceProvenanceRefs,
		sourceCorroborationCount: input.context.materials.length,
		affectedScope,
		defect: profile ? defectSummary(profile) : null,
		securitySensitivity,
		readiness,
		dimensions,
		overlap,
		freshness,
		blocksActiveWork: blockedActiveChanges.length > 0,
		escapedRegression:
			sourceKinds.includes("regression_finding") || profile?.regressionStatus === "confirmed",
	};
}

function candidateContext(change: ChangeWorkState): CandidateContext | null {
	if (
		!change.currentRevision ||
		change.withdrawn ||
		change.trace.status !== "open"
	) {
		return null;
	}
	const revision = change.currentRevision;
	const currentRevisionId = revision.revisionId;
	const latestRoute = latestRouteForCurrentRevision(change);
	const status = candidateStatus(latestRoute);
	if (!status) return null;
	const revisionOperation = currentRevisionOperation(change, currentRevisionId);
	if (!revisionOperation) {
		throw new Error(`Backlog triage Change ${change.changeId} has no current revision operation.`);
	}
	const relevantOperations = change.operations.filter((operation) => {
		if (operation.operationId === revisionOperation.operationId) return true;
		if (operation.body.kind === "change.proposed") {
			return Boolean(operationPayload(operation, "change.proposed").intakeMaterial);
		}
		if (operation.body.kind !== "change.feedback_recorded") return false;
		return (
			operationPayload(operation, "change.feedback_recorded").revisionId ===
			currentRevisionId
		);
	});
	const materials = relevantOperations.flatMap((operation) => {
		if (operation.body.kind === "change.proposed") {
			const artifact = operationPayload(operation, "change.proposed").intakeMaterial?.artifact;
			return artifact ? [normalizeChangeIntakeMaterial(artifact)] : [];
		}
		if (operation.body.kind === "change.feedback_recorded") {
			const artifact = operationPayload(
				operation,
				"change.feedback_recorded",
			).intakeMaterial?.artifact;
			return artifact ? [normalizeChangeIntakeMaterial(artifact)] : [];
		}
		return [];
	});
	const lastObservedAt = relevantOperations
		.map((operation) => operation.body.recordedAt)
		.sort(compareText)
		.at(-1);
	if (!lastObservedAt) {
		throw new Error(`Backlog triage Change ${change.changeId} has no current observations.`);
	}
	return {
		change,
		revision,
		status,
		revisionOperationId: revisionOperation.operationId,
		relevantOperations,
		materials,
		lastObservedAt,
	};
}

interface LatestRuntimeRoute {
	readonly route: string;
	readonly loop: "decision" | "planning" | "implementation";
}

function candidateStatus(latest: LatestRuntimeRoute | null): TriageCandidateStatus | null {
	if (latest === null) return "pending";
	if (latest.route === "decision") return "route_back";
	if (latest.loop !== "decision") return null;
	if (latest.route === "waiting") return "deferred";
	if (latest.route === "repair") return "needs_repair";
	if (latest.route === "escalation") return "escalated";
	return null;
}

function latestRouteForCurrentRevision(
	change: ChangeWorkState,
): LatestRuntimeRoute | null {
	const revision = change.currentRevision;
	if (!revision) return null;
	const attempts = new Map(
		change.loopAttempts.flatMap((attempt) =>
			attempt.changeRevisionId === revision.revisionId
				? [[attempt.operationId, attempt.loop] as const]
				: [],
		),
	);
	let latestRoute: LatestRuntimeRoute | null = null;
	for (const operation of change.operations) {
		if (operation.body.kind !== "runtime.route_recorded") continue;
		const payload = operationPayload(operation, "runtime.route_recorded");
		const loop = attempts.get(payload.attemptOperationId);
		if (loop) latestRoute = {route: payload.route, loop};
	}
	return latestRoute;
}

function isAcceptedActiveChange(change: ChangeWorkState): boolean {
	if (
		!change.currentRevision ||
		change.withdrawn ||
		change.trace.status !== "open"
	) {
		return false;
	}
	const latest = latestRouteForCurrentRevision(change);
	if (!latest) return false;
	if (
		latest.route === "decision" ||
		latest.route === "complete" ||
		latest.route === "withdrawn"
	) {
		return false;
	}
	return latest.loop !== "decision" || latest.route === "planning";
}

function currentRevisionOperation(
	change: ChangeWorkState,
	revisionId: string,
): ChangeWorkState["operations"][number] | undefined {
	for (let index = change.operations.length - 1; index >= 0; index -= 1) {
		const operation = change.operations[index];
		if (
			operation.body.kind === "change.proposed" &&
			operationPayload(operation, "change.proposed").revision.revisionId === revisionId
		) {
			return operation;
		}
		if (
			operation.body.kind === "change.revised" &&
			operationPayload(operation, "change.revised").revision.revisionId === revisionId
		) {
			return operation;
		}
	}
	return undefined;
}

function projectDimensions(input: {
	readonly revisionId: string;
	readonly profile: ChangeDefectProfile | undefined;
	readonly estimate: NormalizedTriageEstimate | undefined;
	readonly blockedActiveChanges: readonly string[];
	readonly relationFacts: readonly ActiveRelationship[];
}): TriageDimensions {
	const estimate = input.estimate?.dimensions;
	const profileBasis = input.profile ? defectBasis(input.revisionId, input.profile) : null;
	const relationBasis = basisFromRelationships(input.relationFacts);
	return {
		urgency: supportedOrUnknown(estimate?.urgency, "urgency"),
		expectedImpact: supportedOrUnknown(estimate?.expectedImpact, "expected impact"),
		effort: supportedOrUnknown(estimate?.effort, "effort"),
		riskOfInaction: supportedOrUnknown(estimate?.riskOfInaction, "risk of inaction"),
		implementationRisk: supportedOrUnknown(
			estimate?.implementationRisk,
			"implementation risk",
		),
		reversibility: supportedOrUnknown(estimate?.reversibility, "reversibility"),
		confidence: projectedConfidence(estimate?.confidence, input.profile, profileBasis),
		workUnblocked: projectedWorkUnblocked(
			input.blockedActiveChanges,
			estimate?.workUnblocked,
			relationBasis,
		),
		protectedEscalation: projectedProtectedEscalation(
			estimate?.protectedEscalation,
			input.profile,
			profileBasis,
		),
	};
}

function projectedConfidence(
	estimate: NormalizedTriageEstimate["dimensions"]["confidence"],
	profile: ChangeDefectProfile | undefined,
	profileBasis: TriageDimensionBasis | null,
): TriageDimensions["confidence"] {
	if (estimate) return estimate;
	if (profile && profileBasis && profile.confidence !== "unknown") {
		return supported(profile.confidence, profileBasis);
	}
	return unknownSupported("confidence");
}

function projectedWorkUnblocked(
	blockedActiveChanges: readonly string[],
	estimate: NormalizedTriageEstimate["dimensions"]["workUnblocked"],
	relationBasis: TriageDimensionBasis,
): TriageDimensions["workUnblocked"] {
	if (blockedActiveChanges.length > 0) {
		return supported(blockedActiveChanges.length, relationBasis);
	}
	return supportedOrUnknown(estimate, "work unblocked");
}

function projectedProtectedEscalation(
	estimate: NormalizedTriageEstimate["dimensions"]["protectedEscalation"],
	profile: ChangeDefectProfile | undefined,
	profileBasis: TriageDimensionBasis | null,
): TriageDimensions["protectedEscalation"] {
	if (
		profile &&
		profileBasis &&
		profile.category === "security" &&
		profile.severity === "critical" &&
		(profile.provenance.authority === "verified" ||
			profile.provenance.authority === "approved")
	) {
		return supported(true, profileBasis);
	}
	return supportedOrUnknown(estimate, "protected escalation");
}

function supportedOrUnknown<T>(
	value: TriageSupportedValue<T> | undefined,
	dimension: string,
): TriageSupportedValue<T | "unknown"> {
	return value ?? unknownSupported(dimension);
}

function projectReadiness(input: {
	readonly context: CandidateContext;
	readonly profile: ChangeDefectProfile | undefined;
	readonly relationFacts: readonly ActiveRelationship[];
	readonly duplicateChangeIds: readonly string[];
	readonly securitySensitivity: "unknown" | "sensitive";
}): TriageDecisionReadiness {
	const revision = input.context.revision;
	const missingInformation: string[] = [];
	if (revision.content.acceptanceRequirements.length === 0) {
		missingInformation.push("acceptance_requirements");
	}
	if (revision.content.knowledgeRefs.length === 0 && revision.content.sourceRefs.length === 0) {
		missingInformation.push("grounding_refs");
	}
	const conflictFacts = input.relationFacts.filter(
		(relation) =>
			relation.relationship.type === "blocks" ||
			relation.relationship.type === "constrains",
	);
	const basis = mergeBases([
		revisionBasis(input.context),
		...(input.relationFacts.length > 0
			? [basisFromRelationships(input.relationFacts)]
			: []),
		...(input.profile
			? [defectBasis(input.context.revision.revisionId, input.profile)]
			: []),
	]);
	if (input.securitySensitivity === "sensitive") {
		return readiness("sensitive", ["protected_handling_required"], missingInformation, basis);
	}
	if (conflictFacts.length > 0 || input.context.change.contradictions.length > 0) {
		return readiness("suspected_conflict", ["conflict_or_contradiction_present"], missingInformation, basis);
	}
	if (input.duplicateChangeIds.length > 0) {
		return readiness("suspected_duplicate", ["matching_pending_semantics"], missingInformation, basis);
	}
	if (missingInformation.length > 0) {
		return readiness("needs_information", ["required_decision_context_missing"], missingInformation, basis);
	}
	return readiness("ready", ["bounded_decision_input_complete"], [], basis);
}

function projectOverlap(
	context: CandidateContext,
	contexts: readonly CandidateContext[],
	relationFacts: readonly ActiveRelationship[],
	affectedScope: CandidateDraft["affectedScope"],
): TriageOverlap {
	const confirmed = relationFacts.filter(
		(relation) => relation.relationship.type === "overlaps",
	);
	if (confirmed.length > 0) {
		return {
			status: "confirmed",
			changeIds: sortedUnique(
				confirmed.map((relation) =>
					relation.sourceChangeId === context.change.changeId
						? relation.targetChangeId
						: relation.sourceChangeId,
				),
			),
			sharedRefs: [],
			basis: basisFromRelationships(confirmed),
		};
	}
	const currentRefs = new Set([
		...affectedScope.knowledgeRefs,
		...affectedScope.sourceRefs,
		...affectedScope.components,
	]);
	const possiblePeers: string[] = [];
	const sharedRefs: string[] = [];
	for (const peer of contexts) {
		if (peer.change.changeId === context.change.changeId) continue;
		const {revision} = peer;
		const refs = [
			...revision.content.knowledgeRefs,
			...revision.content.sourceRefs,
			...(revision.content.defectProfile?.affectedComponents ?? []),
		];
		const shared = refs.filter((ref) => currentRefs.has(ref));
		if (shared.length > 0) {
			possiblePeers.push(peer.change.changeId);
			sharedRefs.push(...shared);
		}
	}
	if (possiblePeers.length > 0) {
		return {
			status: "possible",
			changeIds: sortedUnique(possiblePeers),
			sharedRefs: sortedUnique(sharedRefs),
			basis: {
				...revisionBasis(context),
				analysisRefs: [PROJECTION_REF],
				assumptions: ["Shared affected refs indicate possible overlap, not equivalence."],
			},
		};
	}
	return {
		status: "unknown",
		changeIds: [],
		sharedRefs: [],
		basis: unknownBasis("No exact overlap fact or shared affected ref is available."),
	};
}

function projectFreshness(
	context: CandidateContext,
	asOf: string,
): TriageFreshnessProjection {
	const difference = Date.parse(asOf) - Date.parse(context.lastObservedAt);
	if (difference < 0) {
		throw new Error(
			`Backlog triage asOf precedes Change ${context.change.changeId} observation time.`,
		);
	}
	const ageDays = Math.floor(difference / DAY_MILLISECONDS);
	const status = freshnessStatus(ageDays);
	return {
		status,
		ageDays,
		lastObservedAt: context.lastObservedAt,
		basis: revisionBasis(context),
	};
}

function collectActiveRelationships(
	state: ProjectWorkState,
	graph: AlignmentGraphSnapshot,
): ActiveRelationship[] {
	const revisions = new Map(
		state.changes.flatMap((change) =>
			change.currentRevision ? [[change.changeId, change.currentRevision.revisionId] as const] : [],
		),
	);
	const result: ActiveRelationship[] = [];
	for (const source of state.changes) {
		for (const relationship of source.relationships) {
			if (
				relationship.supersededByOperationId ||
				revisions.get(source.changeId) !== relationship.sourceRevisionId ||
				revisions.get(relationship.targetChangeId) !== relationship.targetRevisionId
			) {
				continue;
			}
			const graphEdge =
				graph.edges.find(
					(edge) => edge.attributes.relationshipId === relationship.relationshipId,
				) ?? null;
			result.push({
				sourceChangeId: source.changeId,
				targetChangeId: relationship.targetChangeId,
				relationship,
				graphEdge,
			});
		}
	}
	return result.sort((left, right) =>
		compareText(left.relationship.relationshipId, right.relationship.relationshipId),
	);
}

function blockedActiveChangeIds(
	changeId: string,
	relationships: readonly ActiveRelationship[],
	activeChangeIds: ReadonlySet<string>,
): string[] {
	return sortedUnique(
		relationships.flatMap((relationship) =>
			relationship.sourceChangeId === changeId &&
			relationship.relationship.type === "blocks" &&
			activeChangeIds.has(relationship.targetChangeId)
				? [relationship.targetChangeId]
				: [],
		),
	);
}

function duplicatePeerMap(
	contexts: readonly CandidateContext[],
): ReadonlyMap<string, readonly string[]> {
	const groups = new Map<string, string[]>();
	for (const context of contexts) {
		const content = context.revision.content;
		const key = canonicalJsonDigest({
			summary: content.summary,
			desiredOutcome: content.desiredOutcome,
			acceptanceRequirements: content.acceptanceRequirements,
			constraints: content.constraints,
			nonGoals: content.nonGoals,
			knowledgeRefs: content.knowledgeRefs,
			sourceRefs: content.sourceRefs,
		});
		const group = groups.get(key) ?? [];
		group.push(context.change.changeId);
		groups.set(key, group);
	}
	const peers = new Map<string, readonly string[]>();
	for (const group of groups.values()) {
		if (group.length < 2) continue;
		for (const changeId of group) {
			peers.set(changeId, sortedUnique(group.filter((value) => value !== changeId)));
		}
	}
	return peers;
}

function defectSummary(profile: ChangeDefectProfile): TriageDefectSummary {
	return {
		profileId: canonicalJsonDigest(profile),
		category: profile.category,
		severity: profile.severity,
		confidence: profile.confidence,
		regressionStatus: profile.regressionStatus,
		securityClassifications: profile.security
			? [profile.security.classification]
			: [],
		provenanceAuthority: profile.provenance.authority,
	};
}

function isSecuritySensitive(profile: ChangeDefectProfile | undefined): boolean {
	return Boolean(
		profile &&
			(profile.category === "privacy" ||
				(profile.security &&
					SENSITIVE_SECURITY_CLASSIFICATIONS.has(profile.security.classification))),
	);
}

function defectBasis(
	revisionId: string,
	profile: ChangeDefectProfile,
): TriageDimensionBasis {
	return {
		authority: profile.provenance.authority,
		analysisClass: "deterministic_analysis",
		inputProvenanceClasses: ["canonical_binding"],
		canonicalRefs: sortedUnique([revisionId, canonicalJsonDigest(profile)]),
		observedRefs: sortedUnique(profile.provenance.sourceRefs),
		evidenceRefs: sortedUnique(profile.provenance.evidenceIds),
		analysisRefs: [PROJECTION_REF],
		assumptions: [],
	};
}

function revisionBasis(context: CandidateContext): TriageDimensionBasis {
	return {
		authority: "none",
		analysisClass: "deterministic_analysis",
		inputProvenanceClasses: ["canonical_binding"],
		canonicalRefs: sortedUnique([
			context.revision.revisionId,
			context.revisionOperationId,
			...context.relevantOperations.map((operation) => operation.operationId),
		]),
		observedRefs: [],
		evidenceRefs: [],
		analysisRefs: [PROJECTION_REF],
		assumptions: [],
	};
}

function basisFromRelationships(
	relationships: readonly ActiveRelationship[],
): TriageDimensionBasis {
	if (relationships.length === 0) return unknownBasis("No applicable relationship fact is available.");
	const provenance = relationships.flatMap((relationship) =>
		relationship.graphEdge ? [relationship.graphEdge.provenance] : [],
	);
	return {
		authority: "none",
		analysisClass: "deterministic_analysis",
		inputProvenanceClasses: sortedUnique(
			provenance.map((item) => item.class),
		) as TriageDimensionBasis["inputProvenanceClasses"],
		canonicalRefs: sortedUnique([
			...relationships.map((item) => item.relationship.operationId),
			...provenance.flatMap((item) => item.canonicalRefs),
		]),
		observedRefs: sortedUnique(provenance.flatMap((item) => item.observedRefs)),
		evidenceRefs: [],
		analysisRefs: sortedUnique([
			PROJECTION_REF,
			...provenance.flatMap((item) => item.analysisRefs),
		]),
		assumptions: [],
	};
}

function mergeBases(bases: readonly TriageDimensionBasis[]): TriageDimensionBasis {
	const strongestAuthority = [...bases]
		.map((basis) => basis.authority)
		.sort((left, right) => authorityRank(right) - authorityRank(left))[0] ?? "none";
	return {
		authority: strongestAuthority,
		analysisClass: bases.some((basis) => basis.analysisClass === "inferred_analysis")
			? "inferred_analysis"
			: "deterministic_analysis",
		inputProvenanceClasses: sortedUnique(
			bases.flatMap((basis) => basis.inputProvenanceClasses),
		) as TriageDimensionBasis["inputProvenanceClasses"],
		canonicalRefs: sortedUnique(bases.flatMap((basis) => basis.canonicalRefs)),
		observedRefs: sortedUnique(bases.flatMap((basis) => basis.observedRefs)),
		evidenceRefs: sortedUnique(bases.flatMap((basis) => basis.evidenceRefs)),
		analysisRefs: sortedUnique(bases.flatMap((basis) => basis.analysisRefs)),
		assumptions: sortedUnique(bases.flatMap((basis) => basis.assumptions)),
	};
}

function unknownSupported<T extends "unknown">(dimension: string): TriageSupportedValue<T> {
	return supported(
		"unknown" as T,
		unknownBasis(`No supported ${dimension} observation is available for this snapshot.`),
	);
}

function unknownBasis(assumption: string): TriageDimensionBasis {
	return {
		authority: "none",
		analysisClass: "deterministic_analysis",
		inputProvenanceClasses: [],
		canonicalRefs: [],
		observedRefs: [],
		evidenceRefs: [],
		analysisRefs: [PROJECTION_REF],
		assumptions: [assumption],
	};
}

function supported<T>(value: T, basis: TriageDimensionBasis): TriageSupportedValue<T> {
	return {value, basis};
}

function readiness(
	value: TriageDecisionReadiness["value"],
	reasonCodes: readonly string[],
	missingInformation: readonly string[],
	basis: TriageDimensionBasis,
): TriageDecisionReadiness {
	return {
		value,
		reasonCodes: sortedUnique(reasonCodes),
		missingInformation: sortedUnique(missingInformation),
		basis,
	};
}

function assertEstimateAuthorities(
	estimates: readonly NormalizedTriageEstimate[],
	graph: AlignmentGraphSnapshot,
): void {
	const evidenceNodes = new Map(
		graph.nodes.flatMap((node) =>
			node.type === "evidence" ? [[node.id, node] as const] : [],
		),
	);
	for (const estimate of estimates) {
		for (const dimension of Object.values(estimate.dimensions)) {
			if (!dimension || dimension.basis.authority === "asserted") continue;
			const supportingNodes = dimension.basis.evidenceRefs.flatMap((reference) => {
				const node = evidenceNodes.get(reference) ?? evidenceNodes.get(`evidence:${reference}`);
				return node ? [node] : [];
			});
			if (
				supportingNodes.length === 0 ||
				!supportingNodes.some(
					(node) =>
						typeof node.attributes.authority === "string" &&
						authorityRank(node.attributes.authority as TriageDimensionBasis["authority"]) >=
							authorityRank(dimension.basis.authority),
				)
			) {
				throw new Error(
					`Backlog triage estimate ${estimate.estimateDigest} lacks ${dimension.basis.authority} Evidence in the bound graph.`,
				);
			}
		}
	}
}

function assertEstimateTargets(
	estimates: readonly NormalizedTriageEstimate[],
	contexts: readonly CandidateContext[],
): void {
	const current = new Set(
		contexts.map(
			(context) => `${context.change.changeId}\u0000${context.revision.revisionId}`,
		),
	);
	for (const estimate of estimates) {
		if (!current.has(`${estimate.changeId}\u0000${estimate.changeRevisionId}`)) {
			throw new Error(
				`Backlog triage estimate does not target an eligible current revision: ${estimate.changeId} ${estimate.changeRevisionId}.`,
			);
		}
	}
}

function assertProjectionBinding(
	state: ProjectWorkState,
	graph: AlignmentGraphSnapshot,
): BacklogTriageProjectionBinding {
	const {workStateDigest, ...stateBody} = state;
	if (canonicalJsonDigest(stateBody) !== workStateDigest) {
		throw new Error("Backlog triage WorkState digest is invalid.");
	}
	if (!state.stateHead || !state.observedBase) {
		throw new Error("Backlog triage requires an accepted WorkState base.");
	}
	assertValidAlignmentGraphSnapshot(graph);
	if (
		graph.baseBinding.remoteStateHead !== state.stateHead ||
		graph.baseBinding.sourceHead !== state.observedBase.sourceHead ||
		graph.baseBinding.knowledgeDigest !== state.observedBase.knowledgeDigest ||
		graph.baseBinding.configDigest !== state.observedBase.configDigest ||
		graph.baseBinding.policyDigest !== state.observedBase.policyDigest ||
		graph.baseBinding.workStateDigest !== state.workStateDigest
	) {
		throw new Error("Backlog triage Alignment Graph base does not match WorkState.");
	}
	if (!sameText(graph.projectedRecordIds, state.acceptedOperationIds)) {
		throw new Error("Backlog triage Alignment Graph record coverage does not match WorkState.");
	}
	return {
		remoteStateHead: state.stateHead,
		sourceHead: state.observedBase.sourceHead,
		knowledgeDigest: state.observedBase.knowledgeDigest,
		configDigest: state.observedBase.configDigest,
		policyDigest: state.observedBase.policyDigest,
		workStateDigest: state.workStateDigest,
		graphSnapshotDigest: graph.graphSnapshotDigest,
		graphContentDigest: graph.graphContentDigest,
	};
}

function canonicalIsoTimestamp(value: unknown, label: string): string {
	if (typeof value !== "string" || !value) throw new Error(`${label} must be text.`);
	const timestamp = new Date(value);
	if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== value) {
		throw new Error(`${label} must be a canonical ISO timestamp.`);
	}
	return value;
}

function unknownDimensionCountFor(dimensions: TriageDimensions): number {
	return Object.values(dimensions).filter((dimension) => dimension.value === "unknown").length;
}

function freshnessStatus(ageDays: number): TriageFreshnessProjection["status"] {
	if (ageDays < BACKLOG_TRIAGE_PROJECTION_PROTOCOL.freshDays) return "fresh";
	if (ageDays < BACKLOG_TRIAGE_PROJECTION_PROTOCOL.staleDays) return "aging";
	return "stale";
}

function authorityRank(authority: TriageDimensionBasis["authority"]): number {
	switch (authority) {
		case "approved":
			return 4;
		case "verified":
			return 3;
		case "observed":
			return 2;
		case "asserted":
			return 1;
		default:
			return 0;
	}
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort(compareText);
}

function canonicalCandidate(candidate: BacklogTriageCandidate): BacklogTriageCandidate {
	return toCanonicalJsonValue(candidate) as unknown as BacklogTriageCandidate;
}
