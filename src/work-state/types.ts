import type { ChangeRecord } from "../changes/records.ts";
import type { UiPreviewTargetBinding } from "../preview/binding.ts";
import type { TraceLoop } from "../traces/types.ts";

export const WORK_STATE_SCHEMA_VERSION = 1;

export type WorkStateApprovalStatus =
	| "pending"
	| "approved"
	| "deferred"
	| "rejected"
	| "withdrawn";
export type WorkStatePlanningStatus =
	| "unplanned"
	| "planned"
	| "resolved"
	| "incomplete_commit";
export type WorkStateRealizationStatus =
	| "not_started"
	| "active"
	| "realized"
	| "blocked";
export type WorkStateOutcomeStatus =
	| "pending"
	| "observed"
	| "observation_scheduled"
	| "not_observable"
	| "deferred"
	| "failed"
	| "abandoned";

export interface WorkStateApproval {
	status: WorkStateApprovalStatus;
	changeRevision: number;
	changeDigest: string;
	eventId?: string;
	approvedAt?: string;
	approvedBy?: string;
	approvalRef?: string;
}

export interface WorkStateChange {
	id: string;
	traceId: string;
	record: ChangeRecord;
	approval: WorkStateApproval;
	planningStatus: WorkStatePlanningStatus;
	realizationStatus: WorkStateRealizationStatus;
	outcomeStatus: WorkStateOutcomeStatus;
	sprintIds: string[];
	workItemIds: string[];
	assignmentIds: string[];
	blockers: string[];
	currentLoop?: TraceLoop;
	nextAction?: string;
	lastEventId?: string;
}

export interface WorkStateSprint {
	id: string;
	source: "planning";
	planningEpochId?: string;
	digest?: string;
	goal: string;
	participatingChangeIds: string[];
	workItemIds: string[];
	dependencyIds: string[];
	integrationRefs: string[];
	uiPreviewTargets: UiPreviewTargetBinding[];
	complete: boolean;
	blockers: string[];
}

export interface WorkStateIntegrationProof {
	eventId: string;
	jobId: string;
	targetRef: string;
	targetRefs: string[];
	baseCommit: string;
	commit: string;
	tree: string;
	contentProof: string;
	changedPaths: string[];
	workerReportRef: string;
	integratedAt: string;
}

export interface WorkStateMergeProof {
	eventId: string;
	jobId: string;
	integrationEventId: string;
	targetBranch: string;
	previousCommit: string;
	commit: string;
	tree: string;
	contentProof: string;
	authorityKind: "user" | "policy";
	authorityActor: string;
	authorityRef: string;
	mergedAt: string;
}

export interface WorkStatePushProof {
	eventId: string;
	jobId: string;
	mergeEventId: string;
	remote: string;
	targetBranch: string;
	previousRemoteCommit: string | null;
	commit: string;
	tree: string;
	contentProof: string;
	authorityActor: string;
	authorityRef: string;
	pushedAt: string;
}

export interface WorkStatePublicationProof {
	eventId: string;
	jobId: string;
	pushEventId: string;
	targetId: string;
	targetKind: "package-registry" | "artifact-store" | "static-site";
	channel: string;
	destinationRef: string;
	artifactId: string;
	artifactDigest: string;
	artifactVersion: string;
	previousRevision: string | null;
	previousArtifactDigest: string | null;
	revision: string;
	operationId: string;
	adapterId: string;
	authorityActor: string;
	authorityRef: string;
	publishedAt: string;
}

export interface WorkStateWorkItem {
	id: string;
	sprintId: string;
	owningChangeId?: string;
	contributesToChangeIds: string[];
	title: string;
	planningEventId: string;
	planningEpochId?: string;
	dependsOn: string[];
	componentRefs: string[];
	pathScopes: string[];
	acceptanceCriterionIds: string[];
	assignmentIds: string[];
	implemented: boolean;
	integrationProofs?: WorkStateIntegrationProof[];
	mergeProofs?: WorkStateMergeProof[];
	pushProofs?: WorkStatePushProof[];
	publicationProofs?: WorkStatePublicationProof[];
	blockers: string[];
}

export type WorkStateAssignmentStatus =
	| "claimed"
	| "released"
	| "expired"
	| "cancelled";

export interface WorkStateAssignment {
	id: string;
	workItemId: string;
	owningChangeId?: string;
	workerId?: string;
	status: WorkStateAssignmentStatus;
	claimedAt?: string;
	terminalAt?: string;
	expiresAt?: string;
	claimEventId?: string;
	terminalEventId?: string;
}

export interface WorkStateBlocker {
	id: string;
	message: string;
	changeId?: string;
	sprintId?: string;
	workItemId?: string;
	refs: string[];
}

export interface WorkState {
	schemaVersion: typeof WORK_STATE_SCHEMA_VERSION;
	generatedAt?: string;
	snapshotDigest: string;
	changeIds: string[];
	sprintIds: string[];
	workItemIds: string[];
	assignmentIds: string[];
	changes: WorkStateChange[];
	sprints: WorkStateSprint[];
	workItems: WorkStateWorkItem[];
	assignments: WorkStateAssignment[];
	blockers: WorkStateBlocker[];
	sources: {
		traceCount: number;
		recordCount: number;
		changeTraceCount: number;
	};
}
