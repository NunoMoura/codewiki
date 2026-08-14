import {createNextChangeOperation} from "../../changes/trace/builder.ts";
import {
	authorityBindingSchema,
	type AuthorityBinding,
	type BaseSnapshot,
	type CanonicalChangeOperation,
	type CanonicalInlineSemanticArtifact,
	type ChangeRevision,
	type ChangeRevisionClassification,
	type ChangeRevisionId,
} from "../../changes/trace/contracts.ts";
import type {GitCommandRunner} from "../../changes/trace/git-command.ts";
import {
	createChangeRevision,
	operationPayload,
} from "../../changes/trace/identity.ts";
import {reduceChangeOperation} from "../../changes/trace/reduce-operation.ts";
import type {ReplayAdmissionPolicy} from "../../changes/trace/reducer.ts";
import type {
	ChangeWorkState,
	ProjectWorkState,
} from "../../changes/trace/state.ts";
import {
	createCurrentGitSynchronizer,
	pushSynchronizedStateBatch,
	type ProjectAuthoritySnapshot,
	type SynchronizationObservation,
} from "../../changes/trace/synchronization.ts";
import {
	normalizeChangeDefectProfile,
	type ChangeDefectCategory,
	type ChangeDefectProfile,
	type ChangeSecurityClassification,
} from "../../changes/defect-profile.ts";
import type {ChangeIntakeMaterial} from "../../changes/intake/contracts.ts";
import {
	changeIntakeProvenanceRefs,
	createChangeIntakeFingerprints,
	findAcceptedChangeIntakeRequest,
	type AcceptedChangeIntakeReference,
	type ChangeIntakeFingerprints,
} from "../../changes/intake/deduplicate.ts";
import {normalizeChangeIntakeMaterial} from "../../changes/intake/normalize.ts";
import {
	resolveChangeIntakeRoute,
	type AuthenticatedChangeIntakeCorrelation,
	type ChangeIntakeRoute,
} from "../../changes/intake/route.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertTypeboxSchema} from "../../utils/json.ts";

export const CHANGE_INTAKE_RUNTIME_PROTOCOL = Object.freeze({
	id: "codewiki.change-intake-runtime",
	version: "1.0.0",
} as const);

export interface ChangeIntakeAuthenticationRequest {
	readonly material: ChangeIntakeMaterial;
	readonly materialDigest: Sha256Digest;
	readonly authorityBinding: AuthorityBinding;
	readonly signal?: AbortSignal;
}

export interface AuthenticatedChangeIntakeSource {
	readonly authenticated: true;
	readonly authenticationEvidenceId: string;
}

export type ChangeIntakeSourceAuthenticator = (
	request: ChangeIntakeAuthenticationRequest,
) =>
	| AuthenticatedChangeIntakeSource
	| Promise<AuthenticatedChangeIntakeSource>;

export interface ChangeIntakeCorrelationRequest {
	readonly material: ChangeIntakeMaterial;
	readonly materialDigest: Sha256Digest;
	readonly authorityBinding: AuthorityBinding;
	readonly state: ProjectWorkState;
	readonly signal?: AbortSignal;
}

export type ChangeIntakeSourceCorrelator = (
	request: ChangeIntakeCorrelationRequest,
) =>
	| AuthenticatedChangeIntakeCorrelation
	| null
	| Promise<AuthenticatedChangeIntakeCorrelation | null>;

export interface ChangeIntakeCommand {
	readonly material: unknown;
	readonly authorityBinding: AuthorityBinding;
	readonly expectedStateHead: string | null;
}

export interface ChangeIntakeReceipt {
	readonly protocolId: typeof CHANGE_INTAKE_RUNTIME_PROTOCOL.id;
	readonly protocolVersion: typeof CHANGE_INTAKE_RUNTIME_PROTOCOL.version;
	readonly action: "created" | "reinforced";
	readonly changeId: string;
	readonly revisionId: ChangeRevisionId;
	readonly routeKind: "existing_change" | "new_change";
	readonly routeReason:
		| "accepted_request"
		| "authenticated_correlation"
		| "source_identity"
		| "semantic_duplicate"
		| "independent_material"
		| "independent_discovery";
	readonly materialDigest: Sha256Digest;
	readonly requestDigest: Sha256Digest;
	readonly sourceIdentityDigest: Sha256Digest;
	readonly semanticDigest: Sha256Digest;
	readonly intakeOperationId: Sha256Digest;
	readonly relationshipOperationId: Sha256Digest | null;
	readonly stateHead: string;
	readonly replayed: boolean;
	readonly observation: SynchronizationObservation;
}

export interface ChangeIntakeRuntime {
	readonly execute: (
		command: ChangeIntakeCommand,
		signal?: AbortSignal,
	) => Promise<ChangeIntakeReceipt>;
}

export function createChangeIntakeRuntime(options: {
	readonly repoRoot: string;
	readonly remote: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
	readonly replayPolicy: ReplayAdmissionPolicy;
	readonly authenticateSource: ChangeIntakeSourceAuthenticator;
	readonly correlateSource?: ChangeIntakeSourceCorrelator;
	readonly runner?: GitCommandRunner;
	readonly materializationRoot?: string;
	readonly now?: () => Date;
}): ChangeIntakeRuntime {
	let sequence: Promise<unknown> = Promise.resolve();
	return Object.freeze({
		execute(command: ChangeIntakeCommand, signal?: AbortSignal) {
			const result = sequence.then(() => executeIntake(options, command, signal));
			sequence = result.then(
				() => undefined,
				() => undefined,
			);
			return result;
		},
	});
}

interface PreparedIntakeRequest {
	readonly material: ChangeIntakeMaterial;
	readonly authorityBinding: AuthorityBinding;
	readonly fingerprints: ChangeIntakeFingerprints;
	readonly expectedStateHead: string | null;
}

async function executeIntake(
	options: Parameters<typeof createChangeIntakeRuntime>[0],
	command: ChangeIntakeCommand,
	signal?: AbortSignal,
): Promise<ChangeIntakeReceipt> {
	const prepared = await prepareIntakeRequest(options, command, signal);
	const synchronizeCurrent = createCurrentGitSynchronizer({
		repoRoot: options.repoRoot,
		remote: options.remote,
		repositoryIdentity: options.repositoryIdentity,
		currentProject: options.currentProject,
		policy: options.replayPolicy,
		runner: options.runner,
		materializationRoot: options.materializationRoot,
		signal,
	});
	const {observation} = await synchronizeCurrent();
	const state = requireFreshState(observation);
	const accepted = findAcceptedChangeIntakeRequest(
		state,
		prepared.fingerprints.requestRef,
	);
	if (accepted) {
		return replayReceipt(accepted, prepared.fingerprints, observation);
	}
	if (state.stateHead !== prepared.expectedStateHead) {
		throw new Error(
			"Change intake state head is stale; synchronize and semantically reevaluate the material.",
		);
	}
	const route = await routePreparedIntake(options, prepared, state, signal);
	if (route.kind === "exact_replay") {
		return replayReceipt(route.accepted, prepared.fingerprints, observation);
	}
	const sequence = createIntakeOperationSequence({
		state,
		route,
		material: prepared.material,
		fingerprints: prepared.fingerprints,
		baseSnapshot: baseSnapshot(observation),
		authorityBinding: prepared.authorityBinding,
		recordedAt: runtimeTimestamp(options.now?.() ?? new Date()),
	});
	return commitIntakeSequence({
		options,
		state,
		observation,
		sequence,
		fingerprints: prepared.fingerprints,
		synchronizeCurrent,
		signal,
	});
}

async function prepareIntakeRequest(
	options: Parameters<typeof createChangeIntakeRuntime>[0],
	command: ChangeIntakeCommand,
	signal?: AbortSignal,
): Promise<PreparedIntakeRequest> {
	signal?.throwIfAborted();
	const parsed = normalizeCommand(command);
	const material = normalizeChangeIntakeMaterial(parsed.material);
	const authorityBinding = normalizeAuthorityBinding(parsed.authorityBinding);
	const fingerprints = createChangeIntakeFingerprints(material, authorityBinding);
	await authenticateSource(options.authenticateSource, {
		material,
		materialDigest: fingerprints.materialDigest,
		authorityBinding,
		signal,
	});
	assertExpectedStateHead(parsed.expectedStateHead);
	return Object.freeze({
		material,
		authorityBinding,
		fingerprints,
		expectedStateHead: parsed.expectedStateHead,
	});
}

async function routePreparedIntake(
	options: Parameters<typeof createChangeIntakeRuntime>[0],
	prepared: PreparedIntakeRequest,
	state: ProjectWorkState,
	signal?: AbortSignal,
): Promise<ChangeIntakeRoute> {
	const direct = directSourceCorrelation(state, prepared.material);
	const supplied = options.correlateSource
		? await options.correlateSource({
				material: prepared.material,
				materialDigest: prepared.fingerprints.materialDigest,
				authorityBinding: prepared.authorityBinding,
				state,
				signal,
			})
		: null;
	const correlation = reconcileCorrelation(
		direct,
		supplied === null ? null : normalizeCorrelation(supplied),
	);
	return resolveChangeIntakeRoute({
		state,
		fingerprints: prepared.fingerprints,
		correlation,
		newChangeId: intakeChangeId(
			prepared.material,
			prepared.fingerprints.materialDigest,
		),
	});
}

async function commitIntakeSequence(input: {
	readonly options: Parameters<typeof createChangeIntakeRuntime>[0];
	readonly state: ProjectWorkState;
	readonly observation: SynchronizationObservation;
	readonly sequence: IntakeOperationSequence;
	readonly fingerprints: ChangeIntakeFingerprints;
	readonly synchronizeCurrent: ReturnType<typeof createCurrentGitSynchronizer>;
	readonly signal?: AbortSignal;
}): Promise<ChangeIntakeReceipt> {
	const {pushResult} = await pushSynchronizedStateBatch({
		repoRoot: input.options.repoRoot,
		remote: input.options.remote,
		state: input.state,
		records: input.sequence.operations,
		policy: input.options.replayPolicy,
		observation: input.observation,
		runner: input.options.runner,
		signal: input.signal,
	});
	if (pushResult.status === "stale") {
		const {observation: raced} = await input.synchronizeCurrent();
		const racedState = requireFreshState(raced);
		const racedRequest = findAcceptedChangeIntakeRequest(
			racedState,
			input.fingerprints.requestRef,
		);
		if (racedRequest) {
			return replayReceipt(racedRequest, input.fingerprints, raced);
		}
		throw new Error(
			"Change intake push became stale; Runtime must refetch and semantically reevaluate the material.",
		);
	}
	const {observation: verified} = await input.synchronizeCurrent();
	const verifiedState = requireFreshState(verified);
	const acceptedIds = new Set(verifiedState.acceptedOperationIds);
	if (
		!input.sequence.operations.every((operation) =>
			acceptedIds.has(operation.operationId),
		)
	) {
		throw new Error(
			`Accepted Change intake request ${input.fingerprints.requestDigest} could not be verified.`,
		);
	}
	return intakeReceipt(input.sequence, input.fingerprints, verified);
}

interface IntakeOperationSequence {
	readonly action: "created" | "reinforced";
	readonly changeId: string;
	readonly revisionId: ChangeRevisionId;
	readonly route: Exclude<ChangeIntakeRoute, {readonly kind: "exact_replay"}>;
	readonly operations: readonly CanonicalChangeOperation[];
	readonly intakeOperationId: Sha256Digest;
	readonly relationshipOperationId: Sha256Digest | null;
}

function createIntakeOperationSequence(input: {
	readonly state: ProjectWorkState;
	readonly route: Exclude<ChangeIntakeRoute, {readonly kind: "exact_replay"}>;
	readonly material: ChangeIntakeMaterial;
	readonly fingerprints: ChangeIntakeFingerprints;
	readonly baseSnapshot: BaseSnapshot;
	readonly authorityBinding: AuthorityBinding;
	readonly recordedAt: string;
}): IntakeOperationSequence {
	if (input.route.kind === "existing_change") {
		return createFeedbackSequence({...input, route: input.route});
	}
	return createNewChangeSequence({...input, route: input.route});
}

function createFeedbackSequence(input: {
	readonly state: ProjectWorkState;
	readonly route: Extract<ChangeIntakeRoute, {readonly kind: "existing_change"}>;
	readonly material: ChangeIntakeMaterial;
	readonly fingerprints: ChangeIntakeFingerprints;
	readonly baseSnapshot: BaseSnapshot;
	readonly authorityBinding: AuthorityBinding;
	readonly recordedAt: string;
}): IntakeOperationSequence {
	const operation = createNextChangeOperation(input.route.change, {
		changeId: input.route.change.changeId,
		kind: "change.feedback_recorded",
		baseSnapshot: input.baseSnapshot,
		authorityBinding: input.authorityBinding,
		recordedAt: input.recordedAt,
		payload: {
			revisionId: input.route.revisionId,
			intakeMaterial: intakeMaterialArtifact(
				input.material,
				input.fingerprints.materialDigest,
			),
			classification: feedbackClassification(input.material),
			summary: feedbackSummary(input.material),
			provenanceRefs: [
				...changeIntakeProvenanceRefs(input.material, input.fingerprints),
			],
		},
	});
	reduceChangeOperation(input.route.change, operation, {
		planningEpochs: input.state.planningEpochs,
	});
	return Object.freeze({
		action: "reinforced",
		changeId: input.route.change.changeId,
		revisionId: input.route.revisionId,
		route: input.route,
		operations: Object.freeze([operation]),
		intakeOperationId: operation.operationId,
		relationshipOperationId: null,
	});
}

function createNewChangeSequence(input: {
	readonly state: ProjectWorkState;
	readonly route: Extract<ChangeIntakeRoute, {readonly kind: "new_change"}>;
	readonly material: ChangeIntakeMaterial;
	readonly fingerprints: ChangeIntakeFingerprints;
	readonly baseSnapshot: BaseSnapshot;
	readonly authorityBinding: AuthorityBinding;
	readonly recordedAt: string;
}): IntakeOperationSequence {
	if (input.state.changes.some((change) => change.changeId === input.route.changeId)) {
		throw new Error(`Change intake identity collision for ${input.route.changeId}.`);
	}
	const provenanceRefs = changeIntakeProvenanceRefs(
		input.material,
		input.fingerprints,
	);
	const revision = intakeRevision(
		input.material,
		provenanceRefs,
		input.authorityBinding.authenticationEvidenceId,
	);
	const opened = createNextChangeOperation(null, {
		changeId: input.route.changeId,
		kind: "trace.opened",
		baseSnapshot: input.baseSnapshot,
		authorityBinding: input.authorityBinding,
		recordedAt: operationTimestamp(input.recordedAt, 0),
		payload: {
			origin: intakeOrigin(input.material),
			provenanceRefs: [...provenanceRefs],
		},
	});
	const openedState = reduceChangeOperation(null, opened, {
		planningEpochs: input.state.planningEpochs,
	});
	const proposed = createNextChangeOperation(openedState, {
		changeId: input.route.changeId,
		kind: "change.proposed",
		baseSnapshot: input.baseSnapshot,
		authorityBinding: input.authorityBinding,
		recordedAt: operationTimestamp(input.recordedAt, 1),
		payload: {
			revision: operationRevision(revision),
			intakeMaterial: intakeMaterialArtifact(
				input.material,
				input.fingerprints.materialDigest,
			),
			provenance: {
				kind: intakeOrigin(input.material),
				refs: [...provenanceRefs],
			},
		},
	});
	const proposedState = reduceChangeOperation(openedState, proposed, {
		planningEpochs: input.state.planningEpochs,
	});
	const operations: CanonicalChangeOperation[] = [opened, proposed];
	let relationshipOperationId: Sha256Digest | null = null;
	if (input.route.discoveredFrom) {
		const relationship = {
			type: "discovered_from" as const,
			sourceRevisionId: revision.revisionId,
			targetChangeId: input.route.discoveredFrom.changeId,
			targetRevisionId: input.route.discoveredFrom.revisionId,
			rationale: "Authenticated source material identified an independent discrepancy.",
			provenanceRefs: [...provenanceRefs],
		};
		const relationshipOperation = createNextChangeOperation(proposedState, {
			changeId: input.route.changeId,
			kind: "change.relationship_recorded",
			baseSnapshot: input.baseSnapshot,
			authorityBinding: input.authorityBinding,
			recordedAt: operationTimestamp(input.recordedAt, 2),
			payload: {
				relationshipId: canonicalJsonDigest(relationship),
				relationship,
			},
		});
		reduceChangeOperation(proposedState, relationshipOperation, {
			planningEpochs: input.state.planningEpochs,
		});
		operations.push(relationshipOperation);
		relationshipOperationId = relationshipOperation.operationId;
	}
	return Object.freeze({
		action: "created",
		changeId: input.route.changeId,
		revisionId: revision.revisionId,
		route: input.route,
		operations: Object.freeze(operations),
		intakeOperationId: proposed.operationId,
		relationshipOperationId,
	});
}

function intakeRevision(
	material: ChangeIntakeMaterial,
	provenanceRefs: readonly string[],
	authenticationEvidenceId: string | undefined,
): ChangeRevision {
	const desiredOutcome =
		material.content.desiredBehavior ??
		"Decision records a testable desired outcome before Planning.";
	const constraints = [
		"Intake grants no approval, priority, execution, risk, route, or Check outcome authority.",
	];
	if (material.content.reproduction) {
		constraints.push(`Source reproduction: ${material.content.reproduction}`);
	}
	if (material.content.claimedCategory) {
		constraints.push(`Source claimed category: ${material.content.claimedCategory}.`);
	}
	if (material.content.claimedSeverity) {
		constraints.push(`Source claimed severity: ${material.content.claimedSeverity}.`);
	}
	if (material.content.claimedConfidence) {
		constraints.push(`Source claimed confidence: ${material.content.claimedConfidence}.`);
	}
	const defectProfile = intakeDefectProfile({
		material,
		authenticationEvidenceId,
	});
	const knowledgeRefs = material.content.affectedRefs.filter(isKnowledgeRef);
	return createChangeRevision({
		title: material.content.summary.split("\n", 1)[0],
		intent: {
			currentState: material.content.observedBehavior,
			desiredState: desiredOutcome,
			rationale: material.content.summary,
			nonGoals: [],
			alternatives: [],
		},
		classification: intakeClassification(material),
		impact:
			material.materialType === "user_suggestion" ||
			material.materialType === "outcome_finding"
				? {user: desiredOutcome}
				: {},
		knowledge: {
			topicRefs: knowledgeRefs,
			propagationRefs:
				material.materialType === "knowledge_drift"
					? material.binding.topicRefs
					: [],
		},
		outcome: {
			successSignals: [desiredOutcome],
			evidenceExpectations: [],
		},
		delivery: {constraints, planningQuestions: []},
		evidence: {
			sourceRefs: provenanceRefs,
			proofRefs: [],
			...(material.content.reproduction
				? {reproduction: material.content.reproduction}
				: {}),
			...(material.content.desiredBehavior
				? {
						expectedBehavior: material.content.desiredBehavior,
						targetBehavior: material.content.desiredBehavior,
					}
				: {}),
			sourceBehavior: material.content.observedBehavior,
		},
		safety: {
			risk: "unknown",
			invariants: [],
			failureModes: [],
		},
		acceptanceRequirements: [
			{
				id: "REQ-intake-desired-outcome",
				statement: desiredOutcome,
			},
		],
		...(defectProfile ? {defectProfile} : {}),
	});
}

function intakeClassification(
	material: ChangeIntakeMaterial,
): ChangeRevisionClassification {
	const byMaterialType: Record<
		ChangeIntakeMaterial["materialType"],
		Omit<ChangeRevisionClassification, "targetRefs">
	> = {
		user_suggestion: {
			kind: "unknown",
			type: "unknown",
			scope: "unknown",
			affectedLayers: [],
		},
		pull_request_finding: {
			kind: "fix",
			type: "behavior_change",
			scope: "source",
			affectedLayers: ["source"],
		},
		worker_discovery: {
			kind: "unknown",
			type: "unknown",
			scope: "source",
			affectedLayers: ["source"],
		},
		regression_finding: {
			kind: "fix",
			type: "incident_resolution",
			scope: "source",
			affectedLayers: ["source"],
		},
		security_scanner_finding: {
			kind: "harden",
			type: "security_change",
			scope: "source",
			affectedLayers: ["security", "source"],
		},
		delivery_observation: {
			kind: "fix",
			type: "release_change",
			scope: "runtime",
			affectedLayers: ["delivery", "runtime"],
		},
		outcome_finding: {
			kind: "improve",
			type: "behavior_change",
			scope: "product",
			affectedLayers: ["product"],
		},
		knowledge_drift: {
			kind: "fix",
			type: "documentation_change",
			scope: "documentation",
			affectedLayers: ["knowledge"],
		},
	};
	return {
		...byMaterialType[material.materialType],
		targetRefs: [...material.content.affectedRefs],
	};
}

function intakeDefectProfile(input: {
	readonly material: ChangeIntakeMaterial;
	readonly authenticationEvidenceId: string | undefined;
}): ChangeDefectProfile | undefined {
	const {material, authenticationEvidenceId} = input;
	if (
		material.materialType === "user_suggestion" &&
		!material.content.claimedCategory &&
		!material.content.claimedSeverity &&
		!material.content.claimedConfidence &&
		!material.content.claimedSecurity &&
		!material.content.reproduction
	) {
		return undefined;
	}
	const category = intakeDefectCategory(material);
	const securityClassification = intakeSecurityClassification(category, material);
	const security = material.content.claimedSecurity ??
		(securityClassification
			? {
					classification: securityClassification,
					identifiers: [],
					cvss: [],
					sarif: [],
					kev: [],
				}
			: undefined);
	return normalizeChangeDefectProfile({
		protocolId: "codewiki.change-defect-profile",
		protocolVersion: "1.0.0",
		category,
		severity: material.content.claimedSeverity ?? "unknown",
		likelihood: "unknown",
		exposure: "unknown",
		confidence: material.content.claimedConfidence ?? "unknown",
		reproducibility: material.content.reproduction ? "reported" : "unknown",
		regressionStatus:
			material.materialType === "regression_finding" ? "suspected" : "unknown",
		affectedVersions: [],
		affectedTrees: intakeAffectedTrees(material),
		affectedComponents: material.content.affectedRefs.filter(isKnowledgeRef),
		observedBehavior: material.content.observedBehavior,
		...(material.content.desiredBehavior
			? {expectedBehavior: material.content.desiredBehavior}
			: {}),
		sourceLocations: material.content.affectedRefs.filter(isSourceLocation),
		ruleRefs: intakeRuleRefs(material),
		...(security ? {security} : {}),
		provenance: {
			authority: "asserted",
			evidenceIds: authenticationEvidenceId ? [authenticationEvidenceId] : [],
			sourceRefs: [...material.content.sourceRefs],
		},
	});
}

function intakeDefectCategory(
	material: ChangeIntakeMaterial,
): ChangeDefectCategory {
	if (material.content.claimedCategory) return material.content.claimedCategory;
	if (material.content.claimedSecurity) return "security";
	switch (material.materialType) {
		case "security_scanner_finding":
			return "security";
		case "regression_finding":
			return "reliability";
		case "delivery_observation":
			return "delivery";
		case "outcome_finding":
			return "outcome";
		case "knowledge_drift":
			return "knowledge";
		default:
			return "behavior";
	}
}

function intakeSecurityClassification(
	category: ChangeDefectCategory,
	material: ChangeIntakeMaterial,
): ChangeSecurityClassification | null {
	if (category === "privacy") return "privacy_finding";
	if (category === "dependency") return "dependency_advisory";
	if (category === "configuration") return "misconfiguration";
	if (category === "security") {
		return material.materialType === "security_scanner_finding"
			? "weakness"
			: "suspected_vulnerability";
	}
	return null;
}

function intakeAffectedTrees(material: ChangeIntakeMaterial): readonly string[] {
	switch (material.materialType) {
		case "worker_discovery":
		case "regression_finding":
			return [material.binding.baseTree, material.binding.resultTree];
		case "security_scanner_finding":
			return [material.binding.tree];
		default:
			return [];
	}
}

function intakeRuleRefs(material: ChangeIntakeMaterial): readonly string[] {
	switch (material.materialType) {
		case "pull_request_finding":
			return [`${material.binding.providerId}:${material.binding.findingId}`];
		case "worker_discovery":
			return [material.binding.workerReportId];
		case "regression_finding":
		case "security_scanner_finding":
			return [material.binding.findingId];
		default:
			return [];
	}
}

function intakeMaterialArtifact(
	material: ChangeIntakeMaterial,
	materialDigest: Sha256Digest,
): CanonicalInlineSemanticArtifact {
	return Object.freeze({
		id: `intake-material:${materialDigest.slice("sha256:".length)}`,
		digest: materialDigest,
		schemaVersion: material.protocolVersion,
		artifact: toCanonicalJsonValue(material),
	});
}

function operationRevision(
	revision: ChangeRevision,
): Parameters<
	typeof createNextChangeOperation<"change.proposed">
>[1]["payload"]["revision"] {
	return structuredClone(revision) as Parameters<
		typeof createNextChangeOperation<"change.proposed">
	>[1]["payload"]["revision"];
}

function directSourceCorrelation(
	state: ProjectWorkState,
	material: ChangeIntakeMaterial,
): AuthenticatedChangeIntakeCorrelation | null {
	switch (material.materialType) {
		case "worker_discovery": {
			const match = uniqueChange(
				state,
				(change) =>
					change.assignments.some(
						(assignment) =>
							assignment.operationId === material.binding.assignmentOperationId &&
							assignment.claimOperationId ===
								material.binding.workItemClaimOperationId,
					),
				"worker Assignment",
			);
			return match
				? correlationFor(match, "independent_change")
				: null;
		}
		case "regression_finding": {
			const match = uniqueChange(
				state,
				(change) =>
					change.operations.some(
						(operation) =>
							operation.operationId === material.binding.traceOperationId,
					),
				"regression Trace operation",
			);
			return match ? correlationFor(match, "current_change") : null;
		}
		case "delivery_observation":
		case "outcome_finding": {
			const match = uniqueChange(
				state,
				(change) =>
					change.revisionIds.includes(material.binding.changeRevisionId),
				"Change revision",
			);
			return match
				? Object.freeze({
						scope: "current_change",
						changeId: match.changeId,
						revisionId: material.binding.changeRevisionId,
					})
				: null;
		}
		default:
			return null;
	}
}

function uniqueChange(
	state: ProjectWorkState,
	predicate: (change: ChangeWorkState) => boolean,
	label: string,
): ChangeWorkState | null {
	const matches = state.changes.filter(predicate);
	if (matches.length > 1) {
		throw new Error(`Change intake ${label} correlation is ambiguous.`);
	}
	return matches[0] ?? null;
}

function correlationFor(
	change: ChangeWorkState,
	scope: AuthenticatedChangeIntakeCorrelation["scope"],
): AuthenticatedChangeIntakeCorrelation | null {
	if (!change.currentRevision) return null;
	return Object.freeze({
		scope,
		changeId: change.changeId,
		revisionId: change.currentRevision.revisionId,
	});
}

function reconcileCorrelation(
	direct: AuthenticatedChangeIntakeCorrelation | null,
	supplied: AuthenticatedChangeIntakeCorrelation | null,
): AuthenticatedChangeIntakeCorrelation | null {
	if (!direct) return supplied;
	if (!supplied) return direct;
	if (
		direct.changeId !== supplied.changeId ||
		direct.revisionId !== supplied.revisionId
	) {
		throw new Error(
			"Authenticated Change intake source correlation conflicts with exact source bindings.",
		);
	}
	return supplied;
}

async function authenticateSource(
	authenticator: ChangeIntakeSourceAuthenticator,
	request: ChangeIntakeAuthenticationRequest,
): Promise<void> {
	const result = canonicalRecord(
		await authenticator(request),
		"Change intake authentication",
	);
	assertExactKeys(
		result,
		["authenticated", "authenticationEvidenceId"],
		"Change intake authentication",
	);
	if (
		result.authenticated !== true ||
		typeof result.authenticationEvidenceId !== "string" ||
		!result.authenticationEvidenceId.trim()
	) {
		throw new Error("Change intake source authentication failed.");
	}
	if (
		result.authenticationEvidenceId !==
		request.authorityBinding.authenticationEvidenceId
	) {
		throw new Error(
			"Change intake authentication Evidence does not match authority binding.",
		);
	}
}

function normalizeCommand(value: unknown): ChangeIntakeCommand {
	const command = canonicalRecord(value, "Change intake command");
	assertExactKeys(
		command,
		["material", "authorityBinding", "expectedStateHead"],
		"Change intake command",
	);
	return Object.freeze({
		material: command.material,
		authorityBinding: command.authorityBinding as unknown as AuthorityBinding,
		expectedStateHead: command.expectedStateHead as string | null,
	});
}

function normalizeAuthorityBinding(value: AuthorityBinding): AuthorityBinding {
	assertTypeboxSchema(authorityBindingSchema, value, "Change intake authority");
	if (!value.authenticationEvidenceId) {
		throw new Error("Change intake authority requires authentication Evidence.");
	}
	return toCanonicalJsonValue(value) as unknown as AuthorityBinding;
}

function normalizeCorrelation(value: unknown): AuthenticatedChangeIntakeCorrelation {
	const correlation = canonicalRecord(value, "Change intake correlation");
	assertExactKeys(
		correlation,
		["scope", "changeId", "revisionId"],
		"Change intake correlation",
	);
	if (
		correlation.scope !== "current_change" &&
		correlation.scope !== "independent_change"
	) {
		throw new Error("Change intake correlation scope is invalid.");
	}
	if (
		typeof correlation.changeId !== "string" ||
		!/^CHG-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(correlation.changeId)
	) {
		throw new Error("Change intake correlation changeId is invalid.");
	}
	if (
		typeof correlation.revisionId !== "string" ||
		!/^sha256:[0-9a-f]{64}$/u.test(correlation.revisionId)
	) {
		throw new Error("Change intake correlation revisionId is invalid.");
	}
	return Object.freeze({
		scope: correlation.scope,
		changeId: correlation.changeId,
		revisionId: correlation.revisionId as ChangeRevisionId,
	});
}

function replayReceipt(
	accepted: AcceptedChangeIntakeReference,
	fingerprints: ChangeIntakeFingerprints,
	observation: SynchronizationObservation,
): ChangeIntakeReceipt {
	const state = requireFreshState(observation);
	const operation = accepted.operation;
	if (operation.body.kind === "change.proposed") {
		const payload = operationPayload(operation, "change.proposed");
		return receipt({
			action: "created",
			changeId: accepted.change.changeId,
			revisionId: payload.revision.revisionId,
			routeKind: "new_change",
			routeReason: "accepted_request",
			intakeOperationId: operation.operationId,
			relationshipOperationId: acceptedRelationshipOperationId(
				accepted.change,
				fingerprints.requestRef,
			),
			fingerprints,
			stateHead: requiredStateHead(state),
			replayed: true,
			observation,
		});
	}
	const payload = operationPayload(operation, "change.feedback_recorded");
	return receipt({
		action: "reinforced",
		changeId: accepted.change.changeId,
		revisionId: payload.revisionId,
		routeKind: "existing_change",
		routeReason: "accepted_request",
		intakeOperationId: operation.operationId,
		relationshipOperationId: null,
		fingerprints,
		stateHead: requiredStateHead(state),
		replayed: true,
		observation,
	});
}

function acceptedRelationshipOperationId(
	change: ChangeWorkState,
	requestRef: string,
): Sha256Digest | null {
	for (const operation of change.operations) {
		if (operation.body.kind !== "change.relationship_recorded") continue;
		const payload = operationPayload(operation, "change.relationship_recorded");
		if (payload.relationship.provenanceRefs.includes(requestRef)) {
			return operation.operationId;
		}
	}
	return null;
}

function intakeReceipt(
	sequence: IntakeOperationSequence,
	fingerprints: ChangeIntakeFingerprints,
	observation: SynchronizationObservation,
): ChangeIntakeReceipt {
	return receipt({
		action: sequence.action,
		changeId: sequence.changeId,
		revisionId: sequence.revisionId,
		routeKind: sequence.route.kind,
		routeReason: sequence.route.reason,
		intakeOperationId: sequence.intakeOperationId,
		relationshipOperationId: sequence.relationshipOperationId,
		fingerprints,
		stateHead: requiredStateHead(requireFreshState(observation)),
		replayed: false,
		observation,
	});
}

function receipt(input: {
	readonly action: ChangeIntakeReceipt["action"];
	readonly changeId: string;
	readonly revisionId: ChangeRevisionId;
	readonly routeKind: ChangeIntakeReceipt["routeKind"];
	readonly routeReason: ChangeIntakeReceipt["routeReason"];
	readonly intakeOperationId: Sha256Digest;
	readonly relationshipOperationId: Sha256Digest | null;
	readonly fingerprints: ChangeIntakeFingerprints;
	readonly stateHead: string;
	readonly replayed: boolean;
	readonly observation: SynchronizationObservation;
}): ChangeIntakeReceipt {
	return Object.freeze({
		protocolId: CHANGE_INTAKE_RUNTIME_PROTOCOL.id,
		protocolVersion: CHANGE_INTAKE_RUNTIME_PROTOCOL.version,
		action: input.action,
		changeId: input.changeId,
		revisionId: input.revisionId,
		routeKind: input.routeKind,
		routeReason: input.routeReason,
		materialDigest: input.fingerprints.materialDigest,
		requestDigest: input.fingerprints.requestDigest,
		sourceIdentityDigest: input.fingerprints.sourceIdentityDigest,
		semanticDigest: input.fingerprints.semanticDigest,
		intakeOperationId: input.intakeOperationId,
		relationshipOperationId: input.relationshipOperationId,
		stateHead: input.stateHead,
		replayed: input.replayed,
		observation: input.observation,
	});
}

function baseSnapshot(observation: SynchronizationObservation): BaseSnapshot {
	if (!observation.teamSnapshot) {
		throw new Error("Change intake requires an exact team snapshot.");
	}
	return Object.freeze({
		remoteStateHead: observation.teamSnapshot.remoteStateHead,
		sourceHead: observation.teamSnapshot.protectedSourceHead,
		knowledgeDigest: observation.teamSnapshot.knowledgeDigest,
		configDigest: observation.teamSnapshot.configDigest,
		policyDigest: observation.teamSnapshot.policyDigest,
	});
}

function requireFreshState(
	observation: SynchronizationObservation,
): ProjectWorkState {
	if (
		observation.status !== "fresh" ||
		!observation.workState ||
		!observation.teamSnapshot
	) {
		throw new Error(
			`Change intake requires fresh synchronization; current status is ${observation.status}.`,
		);
	}
	return observation.workState;
}

function requiredStateHead(state: ProjectWorkState): string {
	if (!state.stateHead) {
		throw new Error("Accepted Change intake has no Git state head.");
	}
	return state.stateHead;
}

function intakeChangeId(
	material: ChangeIntakeMaterial,
	materialDigest: Sha256Digest,
): string {
	return `CHG-intake-${material.materialType.replaceAll("_", "-")}-${materialDigest.slice("sha256:".length, "sha256:".length + 16)}`;
}

function feedbackClassification(
	material: ChangeIntakeMaterial,
): "clarification" | "concern" | "request" | "outcome" {
	if (material.materialType === "user_suggestion") return "request";
	if (
		material.materialType === "delivery_observation" ||
		material.materialType === "outcome_finding"
	) {
		return "outcome";
	}
	return "concern";
}

function feedbackSummary(material: ChangeIntakeMaterial): string {
	return `${material.content.summary}: ${material.content.observedBehavior}`;
}

function intakeOrigin(material: ChangeIntakeMaterial): "user" | "discovered" {
	return material.materialType === "user_suggestion" ? "user" : "discovered";
}

function operationTimestamp(base: string, offset: number): string {
	return new Date(new Date(base).getTime() + offset).toISOString();
}

function runtimeTimestamp(date: Date): string {
	if (!Number.isFinite(date.getTime())) {
		throw new Error("Change intake Runtime clock returned an invalid time.");
	}
	return date.toISOString();
}

function assertExpectedStateHead(value: string | null): void {
	if (value !== null && !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value)) {
		throw new Error("Change intake expectedStateHead is invalid.");
	}
}

function assertExactKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
	label: string,
): void {
	const allowedSet = new Set(allowed);
	const extra = Object.keys(value).filter((key) => !allowedSet.has(key));
	if (extra.length > 0) {
		throw new Error(
			`${label} received unsupported field ${extra.sort(compareText)[0]}.`,
		);
	}
	for (const key of allowed) {
		if (!Object.hasOwn(value, key)) {
			throw new Error(`${label} is missing required field ${key}.`);
		}
	}
}

function canonicalRecord(
	value: unknown,
	label: string,
): Record<string, CanonicalJsonValue> {
	let canonical: CanonicalJsonValue;
	try {
		canonical = toCanonicalJsonValue(value);
	} catch {
		throw new Error(`${label} must be canonical JSON data.`);
	}
	if (canonical === null || typeof canonical !== "object" || Array.isArray(canonical)) {
		throw new Error(`${label} must be an object.`);
	}
	return canonical as Record<string, CanonicalJsonValue>;
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function isKnowledgeRef(ref: string): boolean {
	return ref.startsWith("kb:") || ref.startsWith(".codewiki/kb/");
}

function isSourceLocation(ref: string): boolean {
	return (
		ref.startsWith("src/") ||
		ref.startsWith("tests/") ||
		ref === ".codewiki/config.json" ||
		ref === "package.json" ||
		ref === "package-lock.json"
	);
}
