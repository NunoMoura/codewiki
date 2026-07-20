import type { ChangeRecord } from "../changes/records.ts";
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
	complete: boolean;
	blockers: string[];
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
