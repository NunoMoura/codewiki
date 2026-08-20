import {
	CHANGE_OPERATION_KINDS,
	type CanonicalChangeOperation,
	type ChangeOperationKind,
	type ChangeOperationPayload,
	type OperationId,
} from "./contracts.ts";
import {
	assertValidCanonicalChangeOperation,
	candidateOperationPayload as candidatePayload,
	operationPayload as payloadOf,
} from "./identity.ts";
import {
	canonicalStateValue,
	emptyChangeWorkState,
	initialChangeStateDigest,
	nextChangeStateDigest,
	type AssignmentProjection,
	type ChangeClaimProjection,
	type ChangeWorkState,
	type ContradictionProjection,
	type IntegrationAttemptProjection,
	type LoopAttemptProjection,
	type RelationshipProjection,
	type WorkUnitClaimProjection,
} from "./state.ts";
import { canonicalJsonDigest } from "../../utils/canonical-json.ts";
import { throwProtocolFailure } from "./errors.ts";
import { compareText } from "./order.ts";

export type ReductionErrorCode =
	| "CHANGE_ALREADY_EXISTS"
	| "CHANGE_NOT_FOUND"
	| "TRACE_NOT_OPEN"
	| "TRACE_NOT_CLOSED"
	| "MISSING_PARENT"
	| "UNKNOWN_PARENT"
	| "STATE_DIGEST_MISMATCH"
	| "INVALID_PRECONDITION"
	| "ACTIVE_AUTHORITY"
	| "REFERENCE_NOT_FOUND"
	| "BINDING_MISMATCH";

export interface ChangeOperationReductionContext {}

type OperationReducer = (
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
	context: ChangeOperationReductionContext,
) => ChangeWorkState;

const KEEP_PROJECTION: OperationReducer = (state) => state;

const OPERATION_REDUCERS: Readonly<Record<ChangeOperationKind, OperationReducer>> =
	Object.freeze({
		"trace.opened": KEEP_PROJECTION,
		"trace.closed": reduceTraceClosed,
		"trace.reopened": reduceTraceReopened,
		"change.proposed": reduceChangeProposed,
		"change.revised": reduceChangeRevised,
		"change.relationship_recorded": reduceRelationshipRecorded,
		"change.relationship_superseded": reduceRelationshipSuperseded,
		"change.merge_recorded": KEEP_PROJECTION,
		"change.split_recorded": KEEP_PROJECTION,
		"change.withdrawal_recorded": reduceWithdrawalRecorded,
		"change.feedback_recorded": KEEP_PROJECTION,
		"change_claim.acquired": reduceChangeClaimAcquired,
		"change_claim.released": reduceChangeClaimReleased,
		"change_claim.takeover_recorded": reduceChangeClaimTakeover,
		"loop.attempt_started": reduceLoopAttemptStarted,
		"loop.attempt_ended": reduceLoopAttemptEnded,
		"decision.candidate_recorded": reduceCandidateRecorded,
		"planning.candidate_recorded": reduceCandidateRecorded,
		"implementation.candidate_recorded": reduceCandidateRecorded,
		"loop.exit_policy_recorded": reduceExitPolicyRecorded,
		"evidence.recorded": reduceEvidenceRecorded,
		"check.result_recorded": reduceCheckResultRecorded,
		"loop.exit_report_recorded": reduceExitReportRecorded,
		"runtime.route_recorded": reduceRuntimeRouteRecorded,
		"work_unit_claim.acquired": reduceWorkUnitClaimAcquired,
		"work_unit_claim.released": reduceWorkUnitClaimReleased,
		"work_unit_claim.takeover_recorded": reduceWorkUnitClaimTakeover,
		"assignment.dispatched": reduceAssignmentDispatched,
		"assignment.cancel_requested": reduceAssignmentCancelRequested,
		"assignment.terminal_recorded": reduceAssignmentTerminalRecorded,
		"worker.report_recorded": reduceWorkerReportRecorded,
		"integration.attempt_started": reduceIntegrationAttemptStarted,
		"integration.result_recorded": reduceIntegrationResultRecorded,
		"source.branch_merge_recorded": reduceSourceBranchMergeRecorded,
		"source.branch_push_recorded": reduceSourceBranchPushRecorded,
		"review_projection.published": KEEP_PROJECTION,
		"product.publication_recorded": KEEP_PROJECTION,
		"product.release_recorded": KEEP_PROJECTION,
		"delivery.observation_recorded": KEEP_PROJECTION,
		"outcome.observation_recorded": KEEP_PROJECTION,
	});

for (const kind of CHANGE_OPERATION_KINDS) {
	if (!OPERATION_REDUCERS[kind]) {
		throw new Error(`Change operation ${kind} has no reducer.`);
	}
}

export function reduceChangeOperation(
	state: ChangeWorkState | null,
	operation: CanonicalChangeOperation,
	context: ChangeOperationReductionContext,
): ChangeWorkState {
	assertValidCanonicalChangeOperation(operation);
	assertChangeIdentity(state, operation);
	assertReductionDigest(state, operation);
	assertParents(state, operation);
	const initial = initialProjection(state, operation);
	assertTraceAdmission(initial, operation);
	const projected = OPERATION_REDUCERS[operation.body.kind](
		initial,
		operation,
		context,
	);
	const contradictions = contradictionsAfter(projected, operation);
	return canonicalStateValue<ChangeWorkState>({
		...projected,
		stateDigest: operation.body.postStateDigest,
		tailOperationId: operation.operationId,
		contradictions,
		operations: [...projected.operations, operation],
	});
}

function initialProjection(
	state: ChangeWorkState | null,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	if (operation.body.kind === "trace.opened") {
		if (state) {
			invalid("CHANGE_ALREADY_EXISTS", operation, "trace.opened requires a new Change.");
		}
		return emptyChangeWorkState(operation, 0);
	}
	if (!state) {
		invalid("CHANGE_NOT_FOUND", operation, `${operation.body.kind} requires an existing Change.`);
	}
	return state;
}

function assertChangeIdentity(
	state: ChangeWorkState | null,
	operation: CanonicalChangeOperation,
): void {
	if (state && state.changeId !== operation.body.changeId) {
		invalid(
			"BINDING_MISMATCH",
			operation,
			`operation Change ${operation.body.changeId} does not match ${state.changeId}.`,
		);
	}
}

function assertReductionDigest(
	state: ChangeWorkState | null,
	operation: CanonicalChangeOperation,
): void {
	const expectedPre =
		state?.stateDigest ?? initialChangeStateDigest(operation.body.changeId);
	if (operation.body.preStateDigest !== expectedPre) {
		invalid(
			"STATE_DIGEST_MISMATCH",
			operation,
			`preStateDigest expected ${expectedPre}.`,
		);
	}
	const {postStateDigest: _postStateDigest, ...bodyWithoutPost} = operation.body;
	const expectedPost = nextChangeStateDigest(bodyWithoutPost);
	if (operation.body.postStateDigest !== expectedPost) {
		invalid(
			"STATE_DIGEST_MISMATCH",
			operation,
			`postStateDigest expected ${expectedPost}.`,
		);
	}
}

function assertParents(
	state: ChangeWorkState | null,
	operation: CanonicalChangeOperation,
): void {
	const parents = operation.body.parents;
	if (parents.length === 0) return;
	if (!state) {
		invalid("MISSING_PARENT", operation, "operation has parents but no Change history.");
	}
	if (!parents.includes(state.tailOperationId)) {
		invalid(
			"MISSING_PARENT",
			operation,
			`current tail ${state.tailOperationId} is not a parent.`,
		);
	}
	const known = new Set(state.operations.map((entry) => entry.operationId));
	for (const parent of parents) {
		if (!known.has(parent)) {
			invalid("UNKNOWN_PARENT", operation, `parent ${parent} is unknown.`);
		}
	}
}

function assertTraceAdmission(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): void {
	if (operation.body.kind === "trace.opened") return;
	if (operation.body.kind === "trace.reopened") {
		if (state.trace.status !== "closed") {
			invalid("TRACE_NOT_CLOSED", operation, "trace.reopened requires a closed Trace.");
		}
		return;
	}
	if (state.trace.status !== "open") {
		invalid("TRACE_NOT_OPEN", operation, `${operation.body.kind} requires an open Trace.`);
	}
}

function reduceTraceReopened(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "trace.reopened");
	return canonicalStateValue({
		...state,
		trace: {
			status: "open",
			segment: state.trace.segment + 1,
			rootOperationId: operation.operationId,
			closureOperationId: null,
			closureReason: null,
			archiveManifestId: payload.archiveManifestId,
			archivedTailOperationId: payload.archivedTailOperationId,
		},
	});
}

function reduceTraceClosed(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const activeAuthority = [
		...state.changeClaims.filter((entry) => entry.status === "active"),
		...state.loopAttempts.filter((entry) => entry.status === "active"),
		...state.workUnitClaims.filter((entry) => entry.status === "active"),
		...state.assignments.filter(
			(entry) => entry.status === "active" || entry.status === "cancel_requested",
		),
		...state.integrationAttempts.filter((entry) => entry.status === "active"),
	];
	if (activeAuthority.length > 0) {
		invalid("ACTIVE_AUTHORITY", operation, "Trace cannot close with active authority.");
	}
	const payload = payloadOf(operation, "trace.closed");
	return canonicalStateValue({
		...state,
		trace: {
			...state.trace,
			status: "closed",
			closureOperationId: operation.operationId,
			closureReason: payload.reason,
		},
	});
}

function reduceChangeProposed(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	if (state.currentRevision) {
		invalid("INVALID_PRECONDITION", operation, "Change already has a revision.");
	}
	const revision = payloadOf(operation, "change.proposed").revision;
	return canonicalStateValue({
		...state,
		currentRevision: revision,
		revisionIds: [revision.revisionId],
	});
}

function reduceChangeRevised(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "change.revised");
	requireCurrentRevision(state, payload.previousRevisionId, operation);
	return canonicalStateValue({
		...state,
		currentRevision: payload.revision,
		revisionIds: [...state.revisionIds, payload.revision.revisionId],
		withdrawn: false,
	});
}

function reduceWithdrawalRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	requireCurrentRevision(
		state,
		payloadOf(operation, "change.withdrawal_recorded").revisionId,
		operation,
	);
	return canonicalStateValue({...state, withdrawn: true});
}

function reduceRelationshipRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "change.relationship_recorded");
	requireCurrentRevision(state, payload.relationship.sourceRevisionId, operation);
	const relationship: RelationshipProjection = {
		operationId: operation.operationId,
		relationshipId: payload.relationshipId,
		type: payload.relationship.type,
		sourceRevisionId: payload.relationship.sourceRevisionId,
		targetChangeId: payload.relationship.targetChangeId,
		targetRevisionId: payload.relationship.targetRevisionId,
		supersededByOperationId: null,
	};
	return canonicalStateValue({
		...state,
		relationships: [...state.relationships, relationship],
	});
}

function reduceRelationshipSuperseded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "change.relationship_superseded");
	const relationships = updateProjection({
		entries: state.relationships,
		operationId: payload.relationshipOperationId,
		update: (entry) => {
			if (entry.supersededByOperationId) {
				invalid("INVALID_PRECONDITION", operation, "relationship is already superseded.");
			}
			return {...entry, supersededByOperationId: operation.operationId};
		},
		operation,
		label: "relationship",
	});
	return canonicalStateValue({...state, relationships});
}

function reduceChangeClaimAcquired(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	if (state.changeClaims.some((entry) => entry.status === "active")) {
		invalid("ACTIVE_AUTHORITY", operation, "Change already has an active Change Claim.");
	}
	const payload = payloadOf(operation, "change_claim.acquired");
	requireCurrentRevision(state, payload.revisionId, operation);
	const claim = activeChangeClaimProjection(operation, payload);
	return canonicalStateValue({...state, changeClaims: [...state.changeClaims, claim]});
}

function reduceChangeClaimReleased(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	return updateChangeClaim(state, operation, "released");
}

function reduceChangeClaimTakeover(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "change_claim.takeover_recorded");
	const superseded = updateProjection({
		entries: state.changeClaims,
		operationId: payload.priorClaimOperationId,
		update: (entry) => {
			requireActive(entry.status, operation, "Change Claim");
			return {
				...entry,
				status: "taken_over" as const,
				terminalOperationId: operation.operationId,
			};
		},
		operation,
		label: "Change Claim",
	});
	requireCurrentRevision(state, payload.revisionId, operation);
	const replacement = activeChangeClaimProjection(operation, payload);
	return canonicalStateValue({...state, changeClaims: [...superseded, replacement]});
}

function activeChangeClaimProjection(
	operation: CanonicalChangeOperation,
	payload: Pick<
		ChangeOperationPayload<"change_claim.acquired">,
		"revisionId" | "purpose"
	>,
): ChangeClaimProjection {
	return {
		operationId: operation.operationId,
		revisionId: payload.revisionId,
		purpose: payload.purpose,
		actorId: operation.body.authorityBinding.actorId,
		status: "active",
		terminalOperationId: null,
	};
}

function updateChangeClaim(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
	status: "released",
): ChangeWorkState {
	const claimOperationId = payloadOf(
		operation,
		"change_claim.released",
	).claimOperationId;
	const changeClaims = updateProjection({
		entries: state.changeClaims,
		operationId: claimOperationId,
		update: (entry) => {
			requireActive(entry.status, operation, "Change Claim");
			return {...entry, status, terminalOperationId: operation.operationId};
		},
		operation,
		label: "Change Claim",
	});
	return canonicalStateValue({...state, changeClaims});
}

function reduceLoopAttemptStarted(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "loop.attempt_started");
	requireCurrentRevision(state, payload.changeRevisionId, operation);
	if (
		state.loopAttempts.some(
			(entry) => entry.loop === payload.loop && entry.status === "active",
		)
	) {
		invalid("ACTIVE_AUTHORITY", operation, `${payload.loop} already has an active attempt.`);
	}
	if (payload.loop === "review" && !payload.privateAttemptDigest) {
		invalid(
			"BINDING_MISMATCH",
			operation,
			"Review attempt requires its private attempt digest.",
		);
	}
	const attempt: LoopAttemptProjection = {
		operationId: operation.operationId,
		loop: payload.loop,
		changeRevisionId: payload.changeRevisionId,
		...(payload.privateAttemptDigest
			? {privateAttemptDigest: payload.privateAttemptDigest}
			: {}),
		status: "active",
		candidateOperationIds: [],
		currentCandidateId: payload.loop === "review" ? payload.routeId : null,
		exitPolicyOperationId: null,
		evidenceOperationIds: [],
		checkResultOperationIds: [],
		exitReportOperationId: null,
		routeOperationId: null,
		terminalOperationId: null,
	};
	return canonicalStateValue({...state, loopAttempts: [...state.loopAttempts, attempt]});
}

function reduceCandidateRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = candidatePayload(operation);
	const expectedLoop = operation.body.kind.split(".")[0];
	const loopAttempts = updateAttempt(state, payload.attemptOperationId, operation, (attempt) => {
		requireActive(attempt.status, operation, "Loop attempt");
		if (attempt.loop !== expectedLoop) {
			invalid(
				"BINDING_MISMATCH",
				operation,
				`${operation.body.kind} cannot bind ${attempt.loop} attempt.`,
			);
		}
		return {
			...attempt,
			candidateOperationIds: [...attempt.candidateOperationIds, operation.operationId],
			currentCandidateId: payload.candidate.id,
			exitPolicyOperationId: null,
			checkResultOperationIds: [],
			exitReportOperationId: null,
			routeOperationId: null,
		};
	});
	return canonicalStateValue({...state, loopAttempts});
}

function reduceExitPolicyRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "loop.exit_policy_recorded");
	const loopAttempts = updateAttempt(state, payload.attemptOperationId, operation, (attempt) => {
		requireActive(attempt.status, operation, "Loop attempt");
		requireCandidate(attempt, payload.candidateId, operation);
		return {...attempt, exitPolicyOperationId: operation.operationId};
	});
	return canonicalStateValue({...state, loopAttempts});
}

function reduceEvidenceRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "evidence.recorded");
	const loopAttempts = updateAttempt(state, payload.attemptOperationId, operation, (attempt) => {
		requireActive(attempt.status, operation, "Loop attempt");
		if (payload.candidateId) requireCandidate(attempt, payload.candidateId, operation);
		return {
			...attempt,
			evidenceOperationIds: [...attempt.evidenceOperationIds, operation.operationId],
		};
	});
	return canonicalStateValue({...state, loopAttempts});
}

function reduceCheckResultRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "check.result_recorded");
	const loopAttempts = updateAttempt(state, payload.attemptOperationId, operation, (attempt) => {
		requireActive(attempt.status, operation, "Loop attempt");
		requireCandidate(attempt, payload.candidateId, operation);
		if (!attempt.exitPolicyOperationId) {
			invalid("INVALID_PRECONDITION", operation, "Check Result requires an Exit Policy.");
		}
		const evidenceIds = evidenceIdsForAttempt(state, attempt);
		for (const evidenceId of payload.evidenceRecordIds) {
			if (!evidenceIds.has(evidenceId)) {
				invalid("REFERENCE_NOT_FOUND", operation, `Evidence ${evidenceId} is not recorded.`);
			}
		}
		return {
			...attempt,
			checkResultOperationIds: [...attempt.checkResultOperationIds, operation.operationId],
		};
	});
	return canonicalStateValue({...state, loopAttempts});
}

function reduceExitReportRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "loop.exit_report_recorded");
	const loopAttempts = updateAttempt(state, payload.attemptOperationId, operation, (attempt) => {
		requireActive(attempt.status, operation, "Loop attempt");
		requireCandidate(attempt, payload.candidateId, operation);
		const resultIds = checkResultIdsForAttempt(state, attempt);
		for (const resultId of payload.resultIds) {
			if (!resultIds.has(resultId)) {
				invalid("REFERENCE_NOT_FOUND", operation, `Check Result ${resultId} is not recorded.`);
			}
		}
		return {...attempt, exitReportOperationId: operation.operationId};
	});
	return canonicalStateValue({...state, loopAttempts});
}

function reduceRuntimeRouteRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "runtime.route_recorded");
	const loopAttempts = updateAttempt(state, payload.attemptOperationId, operation, (attempt) => {
		requireActive(attempt.status, operation, "Loop attempt");
		const exitReport = operationById(state, attempt.exitReportOperationId, operation);
		if (
			payloadOf(exitReport, "loop.exit_report_recorded").report.id !==
			payload.exitReportId
		) {
			invalid("BINDING_MISMATCH", operation, "Runtime Route Exit Report does not match.");
		}
		return {...attempt, routeOperationId: operation.operationId};
	});
	return canonicalStateValue({...state, loopAttempts});
}

function reduceLoopAttemptEnded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "loop.attempt_ended");
	const loopAttempts = updateAttempt(state, payload.attemptOperationId, operation, (attempt) => {
		requireActive(attempt.status, operation, "Loop attempt");
		if (payload.status === "passed" && (!attempt.exitReportOperationId || !attempt.routeOperationId)) {
			invalid(
				"INVALID_PRECONDITION",
				operation,
				"Passing Loop attempt requires Exit Report and Runtime Route.",
			);
		}
		return {...attempt, status: payload.status, terminalOperationId: operation.operationId};
	});
	return canonicalStateValue({...state, loopAttempts});
}

function reduceWorkUnitClaimAcquired(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
	context: ChangeOperationReductionContext,
): ChangeWorkState {
	const payload = payloadOf(operation, "work_unit_claim.acquired");
	assertWorkUnitClaimAdmission(state, operation, context);
	const claim = activeWorkUnitClaimProjection(operation, payload);
	return canonicalStateValue({
		...state,
		workUnitClaims: [...state.workUnitClaims, claim],
	});
}

function reduceWorkUnitClaimReleased(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const claimOperationId = payloadOf(
		operation,
		"work_unit_claim.released",
	).claimOperationId;
	const workUnitClaims = updateProjection({
		entries: state.workUnitClaims,
		operationId: claimOperationId,
		update: (entry) => {
			requireActive(entry.status, operation, "Work Unit Claim");
			return {
				...entry,
				status: "released" as const,
				terminalOperationId: operation.operationId,
			};
		},
		operation,
		label: "Work Unit Claim",
	});
	return canonicalStateValue({...state, workUnitClaims});
}

function reduceWorkUnitClaimTakeover(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
	context: ChangeOperationReductionContext,
): ChangeWorkState {
	const payload = payloadOf(operation, "work_unit_claim.takeover_recorded");
	const superseded = updateProjection({
		entries: state.workUnitClaims,
		operationId: payload.priorClaimOperationId,
		update: (entry) => {
			requireActive(entry.status, operation, "Work Unit Claim");
			return {
				...entry,
				status: "taken_over" as const,
				terminalOperationId: operation.operationId,
			};
		},
		operation,
		label: "Work Unit Claim",
	});
	assertWorkUnitClaimAdmission(
		{...state, workUnitClaims: superseded},
		operation,
		context,
	);
	const replacement = activeWorkUnitClaimProjection(operation, payload);
	return canonicalStateValue({
		...state,
		workUnitClaims: [...superseded, replacement],
	});
}

function activeWorkUnitClaimProjection(
	operation: CanonicalChangeOperation,
	payload: Pick<
		ChangeOperationPayload<"work_unit_claim.acquired">,
		| "workGraphDeltaId"
		| "workUnitId"
		| "assignmentAttemptId"
		| "workerId"
		| "workbenchId"
	>,
): WorkUnitClaimProjection {
	return {
		operationId: operation.operationId,
		workGraphDeltaId: payload.workGraphDeltaId,
		workUnitId: payload.workUnitId,
		assignmentAttemptId: payload.assignmentAttemptId,
		workerId: payload.workerId,
		workbenchId: payload.workbenchId,
		status: "active",
		terminalOperationId: null,
	};
}

function assertWorkUnitClaimAdmission(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
	_context: ChangeOperationReductionContext,
): void {
	const payload = workUnitClaimPayload(operation);
	if (
		state.workUnitClaims.some(
			(entry) => entry.workUnitId === payload.workUnitId && entry.status === "active",
		)
	) {
		invalid("ACTIVE_AUTHORITY", operation, "Work Unit already has an active Claim.");
	}
}

function reduceAssignmentDispatched(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "assignment.dispatched");
	const claim = activeWorkUnitClaim(state, payload.claimOperationId, operation);
	for (const field of [
		"workGraphDeltaId",
		"workUnitId",
		"assignmentAttemptId",
		"workerId",
		"workbenchId",
	] as const) {
		if (claim[field] !== payload[field]) {
			invalid("BINDING_MISMATCH", operation, `Assignment ${field} does not match Claim.`);
		}
	}
	const assignment: AssignmentProjection = {
		operationId: operation.operationId,
		claimOperationId: payload.claimOperationId,
		workGraphDeltaId: payload.workGraphDeltaId,
		workUnitId: payload.workUnitId,
		assignmentAttemptId: payload.assignmentAttemptId,
		workerId: payload.workerId,
		workbenchId: payload.workbenchId,
		status: "active",
		cancelRequestOperationIds: [],
		workerReportOperationIds: [],
		terminalOperationId: null,
		resultTreeDigest: null,
	};
	return canonicalStateValue({...state, assignments: [...state.assignments, assignment]});
}

function reduceAssignmentCancelRequested(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const assignmentOperationId = payloadOf(
		operation,
		"assignment.cancel_requested",
	).assignmentOperationId;
	const assignments = updateAssignment(state, assignmentOperationId, operation, (entry) => {
		requireAssignmentActive(entry, operation);
		return {
			...entry,
			status: "cancel_requested",
			cancelRequestOperationIds: [...entry.cancelRequestOperationIds, operation.operationId],
		};
	});
	return canonicalStateValue({...state, assignments});
}

function reduceWorkerReportRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "worker.report_recorded");
	activeWorkUnitClaim(state, payload.claimOperationId, operation);
	const assignments = updateAssignment(
		state,
		payload.assignmentOperationId,
		operation,
		(entry) => {
			requireAssignmentActive(entry, operation);
			if (entry.claimOperationId !== payload.claimOperationId) {
				invalid("BINDING_MISMATCH", operation, "Worker Report Claim does not match.");
			}
			return {
				...entry,
				workerReportOperationIds: [...entry.workerReportOperationIds, operation.operationId],
			};
		},
	);
	return canonicalStateValue({...state, assignments});
}

function reduceAssignmentTerminalRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "assignment.terminal_recorded");
	const assignments = updateAssignment(
		state,
		payload.assignmentOperationId,
		operation,
		(entry) => {
			requireAssignmentActive(entry, operation);
			return {
				...entry,
				status: payload.status,
				terminalOperationId: operation.operationId,
				resultTreeDigest: payload.resultTreeDigest ?? null,
			};
		},
	);
	return canonicalStateValue({...state, assignments});
}

function reduceIntegrationAttemptStarted(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "integration.attempt_started");
	for (const assignmentOperationId of payload.assignmentOperationIds) {
		const assignment = state.assignments.find(
			(entry) => entry.operationId === assignmentOperationId,
		);
		if (!assignment || assignment.status !== "completed") {
			invalid(
				"INVALID_PRECONDITION",
				operation,
				`Assignment ${assignmentOperationId} is not completed.`,
			);
		}
	}
	if (state.integrationAttempts.some((entry) => entry.status === "active")) {
		invalid("ACTIVE_AUTHORITY", operation, "Integration attempt already active.");
	}
	const attempt: IntegrationAttemptProjection = {
		operationId: operation.operationId,
		assignmentOperationIds: payload.assignmentOperationIds,
		baseCommit: payload.baseCommit,
		targetRef: payload.targetRef,
		sourceCandidateIds: payload.sourceCandidateIds,
		status: "active",
		resultOperationIds: [],
		resultCommit: null,
		resultTreeDigest: null,
	};
	return canonicalStateValue({
		...state,
		integrationAttempts: [...state.integrationAttempts, attempt],
	});
}

function reduceIntegrationResultRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "integration.result_recorded");
	const integrationAttempts = updateProjection({
		entries: state.integrationAttempts,
		operationId: payload.integrationAttemptOperationId,
		update: (entry) => {
			requireActive(entry.status, operation, "Integration attempt");
			if (payload.status === "integrated" && (!payload.resultCommit || !payload.resultTreeDigest)) {
				invalid(
					"INVALID_PRECONDITION",
					operation,
					"Integrated result requires commit and tree digest.",
				);
			}
			return {
				...entry,
				status: payload.status,
				resultOperationIds: [...entry.resultOperationIds, operation.operationId],
				resultCommit: payload.resultCommit ?? null,
				resultTreeDigest: payload.resultTreeDigest ?? null,
			};
		},
		operation,
		label: "Integration attempt",
	});
	return canonicalStateValue({...state, integrationAttempts});
}

function reduceSourceBranchMergeRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "source.branch_merge_recorded");
	const integration = state.integrationAttempts.find(
		(entry) => entry.operationId === payload.integrationAttemptOperationId,
	);
	if (
		!integration ||
		integration.status !== "integrated" ||
		integration.resultCommit !== payload.resultCommit ||
		integration.resultTreeDigest !== payload.resultTreeDigest
	) {
		invalid("BINDING_MISMATCH", operation, "Source merge does not match Integration result.");
	}
	return state;
}

function reduceSourceBranchPushRecorded(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): ChangeWorkState {
	const payload = payloadOf(operation, "source.branch_push_recorded");
	if (payload.observedRemoteHead !== payload.sourceCommit) {
		invalid("BINDING_MISMATCH", operation, "Observed push head does not match source commit.");
	}
	return state;
}

function updateAttempt(
	state: ChangeWorkState,
	attemptOperationId: OperationId,
	operation: CanonicalChangeOperation,
	update: (attempt: LoopAttemptProjection) => LoopAttemptProjection,
): readonly LoopAttemptProjection[] {
	return updateProjection({
		entries: state.loopAttempts,
		operationId: attemptOperationId,
		update,
		operation,
		label: "Loop attempt",
	});
}

function updateAssignment(
	state: ChangeWorkState,
	assignmentOperationId: OperationId,
	operation: CanonicalChangeOperation,
	update: (assignment: AssignmentProjection) => AssignmentProjection,
): readonly AssignmentProjection[] {
	return updateProjection({
		entries: state.assignments,
		operationId: assignmentOperationId,
		update,
		operation,
		label: "Assignment",
	});
}

interface ProjectionUpdate<T extends {readonly operationId: OperationId}> {
	readonly entries: readonly T[];
	readonly operationId: OperationId;
	readonly update: (entry: T) => T;
	readonly operation: CanonicalChangeOperation;
	readonly label: string;
}

function updateProjection<T extends {readonly operationId: OperationId}>({
	entries,
	operationId,
	update,
	operation,
	label,
}: ProjectionUpdate<T>): readonly T[] {
	const index = entries.findIndex((entry) => entry.operationId === operationId);
	if (index < 0) {
		invalid("REFERENCE_NOT_FOUND", operation, `${label} ${operationId} is absent.`);
	}
	return entries.map((entry, entryIndex) =>
		entryIndex === index ? update(entry) : entry,
	);
}

function activeWorkUnitClaim(
	state: ChangeWorkState,
	claimOperationId: OperationId,
	operation: CanonicalChangeOperation,
): WorkUnitClaimProjection {
	const claim = state.workUnitClaims.find(
		(entry) => entry.operationId === claimOperationId,
	);
	if (!claim) {
		invalid("REFERENCE_NOT_FOUND", operation, `Work Unit Claim ${claimOperationId} is absent.`);
	}
	requireActive(claim.status, operation, "Work Unit Claim");
	return claim;
}

function requireAssignmentActive(
	assignment: AssignmentProjection,
	operation: CanonicalChangeOperation,
): void {
	if (assignment.status !== "active" && assignment.status !== "cancel_requested") {
		invalid("INVALID_PRECONDITION", operation, "Assignment is already terminal.");
	}
}

function requireActive(
	status: string,
	operation: CanonicalChangeOperation,
	label: string,
): void {
	if (status !== "active") {
		invalid("INVALID_PRECONDITION", operation, `${label} is not active.`);
	}
}

function requireCurrentRevision(
	state: ChangeWorkState,
	revisionId: string,
	operation: CanonicalChangeOperation,
): void {
	if (state.currentRevision?.revisionId !== revisionId) {
		invalid("BINDING_MISMATCH", operation, `revision ${revisionId} is not current.`);
	}
}

function requireCandidate(
	attempt: LoopAttemptProjection,
	candidateId: string,
	operation: CanonicalChangeOperation,
): void {
	if (attempt.currentCandidateId !== candidateId) {
		invalid("BINDING_MISMATCH", operation, `Candidate ${candidateId} is not current.`);
	}
}

function evidenceIdsForAttempt(
	state: ChangeWorkState,
	attempt: LoopAttemptProjection,
): ReadonlySet<string> {
	return new Set(
		attempt.evidenceOperationIds.map(
			(operationId) =>
				payloadOf(operationById(state, operationId), "evidence.recorded")
					.evidence.id,
		),
	);
}

function checkResultIdsForAttempt(
	state: ChangeWorkState,
	attempt: LoopAttemptProjection,
): ReadonlySet<string> {
	return new Set(
		attempt.checkResultOperationIds.map(
			(operationId) =>
				payloadOf(operationById(state, operationId), "check.result_recorded")
					.result.id,
		),
	);
}

function operationById(
	state: ChangeWorkState,
	operationId: OperationId | null,
	requestingOperation?: CanonicalChangeOperation,
): CanonicalChangeOperation {
	const found = operationId
		? state.operations.find((entry) => entry.operationId === operationId)
		: undefined;
	if (!found) {
		if (!requestingOperation) {
			throw new Error(`Operation ${String(operationId)} is absent.`);
		}
		invalid(
			"REFERENCE_NOT_FOUND",
			requestingOperation,
			`operation ${String(operationId)} is absent.`,
		);
	}
	return found;
}

function contradictionsAfter(
	state: ChangeWorkState,
	operation: CanonicalChangeOperation,
): readonly ContradictionProjection[] {
	const current = contradictionValue(operation);
	if (!current) return state.contradictions;
	const additions = state.operations.flatMap((previous) => {
		const prior = contradictionValue(previous);
		if (!prior || prior.kind !== current.kind || prior.subject !== current.subject) {
			return [];
		}
		if (prior.value === current.value) return [];
		const pair = [
			{operationId: previous.operationId, value: prior.value},
			{operationId: operation.operationId, value: current.value},
		].sort((left, right) => compareText(left.operationId, right.operationId));
		const contradiction: ContradictionProjection = {
			contradictionId: canonicalJsonDigest({
				kind: current.kind,
				subject: current.subject,
				operationIds: pair.map((entry) => entry.operationId),
				values: pair.map((entry) => entry.value),
			}),
			kind: current.kind,
			subject: current.subject,
			operationIds: [pair[0].operationId, pair[1].operationId],
			values: [pair[0].value, pair[1].value],
		};
		return [contradiction];
	});
	const known = new Set(state.contradictions.map((entry) => entry.contradictionId));
	return [...state.contradictions, ...additions.filter((entry) => !known.has(entry.contradictionId))];
}

function contradictionValue(operation: CanonicalChangeOperation): {
	kind: ContradictionProjection["kind"];
	subject: string;
	value: string;
} | null {
	switch (operation.body.kind) {
		case "check.result_recorded": {
			const payload = payloadOf(operation, "check.result_recorded");
			return {
				kind: "check_result",
				subject: `${payload.attemptOperationId}:${payload.candidateId}:${payload.checkId}@${payload.checkVersion}`,
				value: payload.status,
			};
		}
		case "runtime.route_recorded": {
			const payload = payloadOf(operation, "runtime.route_recorded");
			return {
				kind: "runtime_route",
				subject: `${payload.attemptOperationId}:${payload.exitReportId}`,
				value: payload.route,
			};
		}
		case "integration.result_recorded": {
			const payload = payloadOf(operation, "integration.result_recorded");
			return {
				kind: "integration_result",
				subject: payload.integrationAttemptOperationId,
				value: payload.status,
			};
		}
		case "delivery.observation_recorded": {
			const payload = payloadOf(operation, "delivery.observation_recorded");
			return {
				kind: "delivery_observation",
				subject: payload.subjectOperationId,
				value: payload.status,
			};
		}
		case "outcome.observation_recorded": {
			const payload = payloadOf(operation, "outcome.observation_recorded");
			return {
				kind: "outcome_observation",
				subject: payload.deliveryOperationId ?? operation.body.changeId,
				value: payload.status,
			};
		}
		default:
			return null;
	}
}

function workUnitClaimPayload(
	operation: CanonicalChangeOperation,
): ChangeOperationPayload<"work_unit_claim.acquired"> {
	if (
		operation.body.kind !== "work_unit_claim.acquired" &&
		operation.body.kind !== "work_unit_claim.takeover_recorded"
	) {
		throw new Error(`Expected Work Unit Claim operation, received ${operation.body.kind}.`);
	}
	return operation.body.payload as ChangeOperationPayload<"work_unit_claim.acquired">;
}

function invalid(
	code: ReductionErrorCode,
	operation: CanonicalChangeOperation,
	message: string,
): never {
	return throwProtocolFailure(
		"ChangeReductionError",
		code,
		operation.operationId,
		message,
	);
}
