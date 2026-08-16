import type {
	ArchiveManifestId,
	BaseSnapshot,
	CanonicalChangeOperation,
	ChangeOperationKind,
	ChangeRevision,
	GitObjectId,
	OperationId,
	PlanningEpochId,
	PlanningEpochRecord,
} from "./contracts.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const CHANGE_REDUCTION_PROTOCOL = Object.freeze({
	id: "codewiki.change-reduction",
	version: "1.0.0",
} as const);

export const WORK_STATE_REDUCER = Object.freeze({
	id: "codewiki.work-state-reducer",
	version: "1.0.0",
} as const);

export type TraceProjectionStatus = "open" | "closed";
export type LoopAttemptProjectionStatus =
	| "active"
	| "passed"
	| "failed"
	| "indeterminate"
	| "cancelled"
	| "stale";
export type ClaimProjectionStatus = "active" | "released" | "taken_over";
export type AssignmentProjectionStatus =
	| "active"
	| "cancel_requested"
	| "completed"
	| "blocked"
	| "failed"
	| "cancelled";
export type IntegrationProjectionStatus =
	| "active"
	| "integrated"
	| "conflict"
	| "failed"
	| "cancelled";

export interface TraceProjection {
	readonly status: TraceProjectionStatus;
	readonly segment: number;
	readonly rootOperationId: OperationId;
	readonly closureOperationId: OperationId | null;
	readonly closureReason: string | null;
	readonly archiveManifestId: ArchiveManifestId | null;
	readonly archivedTailOperationId: OperationId | null;
}

export interface RelationshipProjection {
	readonly operationId: OperationId;
	readonly relationshipId: Sha256Digest;
	readonly type: string;
	readonly sourceRevisionId: Sha256Digest;
	readonly targetChangeId: string;
	readonly targetRevisionId: Sha256Digest;
	readonly supersededByOperationId: OperationId | null;
}

export interface ChangeClaimProjection {
	readonly operationId: OperationId;
	readonly revisionId: Sha256Digest;
	readonly purpose: string;
	readonly actorId: string;
	readonly status: ClaimProjectionStatus;
	readonly terminalOperationId: OperationId | null;
}

export interface LoopAttemptProjection {
	readonly operationId: OperationId;
	readonly loop: "decision" | "planning" | "implementation" | "review";
	readonly changeRevisionId: Sha256Digest;
	readonly privateAttemptDigest?: Sha256Digest;
	readonly status: LoopAttemptProjectionStatus;
	readonly candidateOperationIds: readonly OperationId[];
	readonly currentCandidateId: string | null;
	readonly exitPolicyOperationId: OperationId | null;
	readonly evidenceOperationIds: readonly OperationId[];
	readonly checkResultOperationIds: readonly OperationId[];
	readonly exitReportOperationId: OperationId | null;
	readonly routeOperationId: OperationId | null;
	readonly terminalOperationId: OperationId | null;
}

export interface PlanningEpochBindingProjection {
	readonly operationId: OperationId;
	readonly planningEpochId: PlanningEpochId;
	readonly participantRevisionId: Sha256Digest;
	readonly workItemIds: readonly string[];
}

export interface WorkItemClaimProjection {
	readonly operationId: OperationId;
	readonly planningEpochId: PlanningEpochId;
	readonly workItemId: string;
	readonly assignmentAttemptId: string;
	readonly workerId: string;
	readonly workbenchId: string;
	readonly status: ClaimProjectionStatus;
	readonly terminalOperationId: OperationId | null;
}

export interface AssignmentProjection {
	readonly operationId: OperationId;
	readonly claimOperationId: OperationId;
	readonly planningEpochId: PlanningEpochId;
	readonly workItemId: string;
	readonly assignmentAttemptId: string;
	readonly workerId: string;
	readonly workbenchId: string;
	readonly status: AssignmentProjectionStatus;
	readonly cancelRequestOperationIds: readonly OperationId[];
	readonly workerReportOperationIds: readonly OperationId[];
	readonly terminalOperationId: OperationId | null;
	readonly resultTreeDigest: Sha256Digest | null;
}

export interface IntegrationAttemptProjection {
	readonly operationId: OperationId;
	readonly assignmentOperationIds: readonly OperationId[];
	readonly baseCommit: GitObjectId;
	readonly targetRef: string;
	readonly sourceCandidateIds: readonly string[];
	readonly status: IntegrationProjectionStatus;
	readonly resultOperationIds: readonly OperationId[];
	readonly resultCommit: GitObjectId | null;
	readonly resultTreeDigest: Sha256Digest | null;
}

export interface ContradictionProjection {
	readonly contradictionId: Sha256Digest;
	readonly kind:
		| "check_result"
		| "runtime_route"
		| "integration_result"
		| "delivery_observation"
		| "outcome_observation";
	readonly subject: string;
	readonly operationIds: readonly [OperationId, OperationId];
	readonly values: readonly [string, string];
}

export interface ChangeWorkState {
	readonly changeId: string;
	readonly stateDigest: Sha256Digest;
	readonly tailOperationId: OperationId;
	readonly trace: TraceProjection;
	readonly currentRevision: ChangeRevision | null;
	readonly revisionIds: readonly Sha256Digest[];
	readonly withdrawn: boolean;
	readonly relationships: readonly RelationshipProjection[];
	readonly changeClaims: readonly ChangeClaimProjection[];
	readonly loopAttempts: readonly LoopAttemptProjection[];
	readonly planningEpochBindings: readonly PlanningEpochBindingProjection[];
	readonly workItemClaims: readonly WorkItemClaimProjection[];
	readonly assignments: readonly AssignmentProjection[];
	readonly integrationAttempts: readonly IntegrationAttemptProjection[];
	readonly contradictions: readonly ContradictionProjection[];
	readonly operations: readonly CanonicalChangeOperation[];
}

export interface ProjectWorkStateBody {
	readonly reducer: typeof WORK_STATE_REDUCER;
	readonly stateHead: GitObjectId | null;
	readonly observedBase: BaseSnapshot | null;
	readonly changes: readonly ChangeWorkState[];
	readonly planningEpochs: readonly PlanningEpochRecord[];
	readonly acceptedOperationIds: readonly OperationId[];
}

export interface ProjectWorkState extends ProjectWorkStateBody {
	readonly workStateDigest: Sha256Digest;
}

export function initialChangeStateDigest(changeId: string): Sha256Digest {
	return canonicalJsonDigest({
		protocol: CHANGE_REDUCTION_PROTOCOL,
		changeId,
	});
}

export function nextChangeStateDigest(
	body: Omit<CanonicalChangeOperation["body"], "postStateDigest">,
): Sha256Digest {
	const {preStateDigest, ...transition} = body;
	return canonicalJsonDigest({
		protocol: CHANGE_REDUCTION_PROTOCOL,
		preStateDigest,
		transition,
	});
}

export function createInitialProjectWorkState(): ProjectWorkState {
	return materializeProjectWorkState({
		reducer: WORK_STATE_REDUCER,
		stateHead: null,
		observedBase: null,
		changes: [],
		planningEpochs: [],
		acceptedOperationIds: [],
	});
}

export function materializeProjectWorkState(
	body: ProjectWorkStateBody,
): ProjectWorkState {
	const normalized = canonicalObject<ProjectWorkStateBody>(body);
	return canonicalObject<ProjectWorkState>({
		...normalized,
		workStateDigest: canonicalJsonDigest(normalized),
	});
}

export function emptyChangeWorkState(
	operation: CanonicalChangeOperation,
	segment: number,
): ChangeWorkState {
	const reopened = operation.body.kind === "trace.reopened";
	const payload = operation.body.payload as Record<string, unknown>;
	return canonicalObject({
		changeId: operation.body.changeId,
		stateDigest: operation.body.postStateDigest,
		tailOperationId: operation.operationId,
		trace: {
			status: "open",
			segment,
			rootOperationId: operation.operationId,
			closureOperationId: null,
			closureReason: null,
			archiveManifestId: reopened ? payload.archiveManifestId : null,
			archivedTailOperationId: reopened
				? payload.archivedTailOperationId
				: null,
		},
		currentRevision: null,
		revisionIds: [],
		withdrawn: false,
		relationships: [],
		changeClaims: [],
		loopAttempts: [],
		planningEpochBindings: [],
		workItemClaims: [],
		assignments: [],
		integrationAttempts: [],
		contradictions: [],
		operations: [],
	});
}

export function canonicalStateValue<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}

export function changeById(
	state: ProjectWorkState,
	changeId: string,
): ChangeWorkState | undefined {
	return state.changes.find((change) => change.changeId === changeId);
}

export function planningEpochById(
	state: Pick<ProjectWorkState, "planningEpochs">,
	planningEpochId: PlanningEpochId,
): PlanningEpochRecord | undefined {
	return state.planningEpochs.find(
		(record) => record.operationId === planningEpochId,
	);
}

export function operationKindCount(
	state: ChangeWorkState,
	kind: ChangeOperationKind,
): number {
	return state.operations.filter((operation) => operation.body.kind === kind).length;
}

function canonicalObject<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
