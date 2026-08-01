import {createNextChangeOperation} from "../change-trace/builder.ts";
import {
	authorityBindingSchema,
	type AuthorityBinding,
	type BaseSnapshot,
	type CanonicalChangeOperation,
	type CanonicalInlineSemanticArtifact,
	type ChangeRevision,
	type ChangeRevisionId,
} from "../change-trace/contracts.ts";
import type {GitCommandRunner} from "../change-trace/git-command.ts";
import {
	createChangeRevision,
	operationPayload,
} from "../change-trace/identity.ts";
import {reduceChangeOperation} from "../change-trace/reduce-operation.ts";
import type {ReplayAdmissionPolicy} from "../change-trace/reducer.ts";
import type {
	ChangeWorkState,
	ProjectWorkState,
} from "../change-trace/state.ts";
import {
	createCurrentGitSynchronizer,
	pushSynchronizedStateBatch,
	type ProjectAuthoritySnapshot,
	type SynchronizationObservation,
} from "../change-trace/synchronization.ts";
import type {ChangeIntakeMaterial} from "../changes/intake/contracts.ts";
import {
	changeIntakeProvenanceRefs,
	createChangeIntakeFingerprints,
	findAcceptedChangeIntakeRequest,
	type AcceptedChangeIntakeReference,
	type ChangeIntakeFingerprints,
} from "../changes/intake/deduplicate.ts";
import {normalizeChangeIntakeMaterial} from "../changes/intake/normalize.ts";
import {
	resolveChangeIntakeRoute,
	type AuthenticatedChangeIntakeCorrelation,
	type ChangeIntakeRoute,
} from "../changes/intake/route.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {assertTypeboxSchema} from "../utils/json.ts";

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

async function executeIntake(
	options: Parameters<typeof createChangeIntakeRuntime>[0],
	command: ChangeIntakeCommand,
	signal?: AbortSignal,
): Promise<ChangeIntakeReceipt> {
	signal?.throwIfAborted();
	const parsedCommand = normalizeCommand(command);
	const material = normalizeChangeIntakeMaterial(parsedCommand.material);
	const authorityBinding = normalizeAuthorityBinding(
		parsedCommand.authorityBinding,
	);
	const fingerprints = createChangeIntakeFingerprints(material, authorityBinding);
	await authenticateSource(
		options.authenticateSource,
		material,
		authorityBinding,
		fingerprints,
		signal,
	);
	assertExpectedStateHead(parsedCommand.expectedStateHead);
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
		fingerprints.requestRef,
	);
	if (accepted) {
		return replayReceipt(accepted, fingerprints, observation);
	}
	if (state.stateHead !== parsedCommand.expectedStateHead) {
		throw new Error(
			"Change intake state head is stale; synchronize and semantically reevaluate the material.",
		);
	}
	const directCorrelation = directSourceCorrelation(state, material);
	const suppliedCorrelation = options.correlateSource
		? await options.correlateSource({
				material,
				materialDigest: fingerprints.materialDigest,
				authorityBinding,
				state,
				signal,
			})
		: null;
	const correlation = reconcileCorrelation(
		directCorrelation,
		suppliedCorrelation === null
			? null
			: normalizeCorrelation(suppliedCorrelation),
	);
	const route = resolveChangeIntakeRoute({
		state,
		fingerprints,
		correlation,
		newChangeId: intakeChangeId(material, fingerprints.materialDigest),
	});
	if (route.kind === "exact_replay") {
		return replayReceipt(route.accepted, fingerprints, observation);
	}
	const recordedAt = runtimeTimestamp(options.now?.() ?? new Date());
	const sequence = createIntakeOperationSequence({
		state,
		route,
		material,
		fingerprints,
		baseSnapshot: baseSnapshot(observation),
		authorityBinding,
		recordedAt,
	});
	const {pushResult} = await pushSynchronizedStateBatch({
		repoRoot: options.repoRoot,
		remote: options.remote,
		state,
		records: sequence.operations,
		policy: options.replayPolicy,
		observation,
		runner: options.runner,
		signal,
	});
	if (pushResult.status === "stale") {
		const {observation: raced} = await synchronizeCurrent();
		const racedState = requireFreshState(raced);
		const racedRequest = findAcceptedChangeIntakeRequest(
			racedState,
			fingerprints.requestRef,
		);
		if (racedRequest) {
			return replayReceipt(racedRequest, fingerprints, raced);
		}
		throw new Error(
			"Change intake push became stale; Runtime must refetch and semantically reevaluate the material.",
		);
	}
	const {observation: verified} = await synchronizeCurrent();
	const verifiedState = requireFreshState(verified);
	const acceptedIds = new Set(verifiedState.acceptedOperationIds);
	if (!sequence.operations.every((operation) => acceptedIds.has(operation.operationId))) {
		throw new Error(
			`Accepted Change intake request ${fingerprints.requestDigest} could not be verified.`,
		);
	}
	return intakeReceipt(sequence, fingerprints, verified);
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
	const revision = intakeRevision(input.material, provenanceRefs);
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
	return createChangeRevision({
		title: material.content.summary.split("\n", 1)[0],
		summary: material.content.observedBehavior,
		desiredOutcome,
		acceptanceRequirements: [
			{
				id: "REQ-intake-desired-outcome",
				statement: desiredOutcome,
			},
		],
		constraints,
		nonGoals: [],
		knowledgeRefs: material.content.affectedRefs.filter(isKnowledgeRef),
		sourceRefs: provenanceRefs,
		risk: "moderate",
	});
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

function operationRevision(revision: ChangeRevision): {
	revisionId: ChangeRevisionId;
	content: {
		title: string;
		summary: string;
		desiredOutcome: string;
		acceptanceRequirements: {id: string; statement: string}[];
		constraints: string[];
		nonGoals: string[];
		knowledgeRefs: string[];
		sourceRefs: string[];
		risk: "low" | "moderate" | "high" | "critical";
	};
} {
	return {
		revisionId: revision.revisionId,
		content: {
			title: revision.content.title,
			summary: revision.content.summary,
			desiredOutcome: revision.content.desiredOutcome,
			acceptanceRequirements: revision.content.acceptanceRequirements.map(
				(requirement) => ({...requirement}),
			),
			constraints: [...revision.content.constraints],
			nonGoals: [...revision.content.nonGoals],
			knowledgeRefs: [...revision.content.knowledgeRefs],
			sourceRefs: [...revision.content.sourceRefs],
			risk: revision.content.risk,
		},
	};
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
	material: ChangeIntakeMaterial,
	authorityBinding: AuthorityBinding,
	fingerprints: ChangeIntakeFingerprints,
	signal?: AbortSignal,
): Promise<void> {
	const result = canonicalRecord(
		await authenticator({
			material,
			materialDigest: fingerprints.materialDigest,
			authorityBinding,
			signal,
		}),
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
		authorityBinding.authenticationEvidenceId
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
		throw new Error(`${label} received unsupported field ${extra.sort()[0]}.`);
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

function isKnowledgeRef(ref: string): boolean {
	return ref.startsWith("kb:") || ref.startsWith(".codewiki/kb/");
}
