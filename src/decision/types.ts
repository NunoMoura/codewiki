import type { ContentProof } from "../git/content-proof.ts";

export const CHANGE_TYPE_VALUES = [
	"product",
	"system",
	"task",
	"code",
] as const;
export const TRACEABILITY_EXEMPTION_VALUES = [
	"generated",
	"runtime",
	"mechanical",
] as const;
export const DECISION_APPROVAL_STATUS_VALUES = [
	"pending",
	"approved",
	"rejected",
	"deferred",
	"edited",
] as const;

export type ChangeType = (typeof CHANGE_TYPE_VALUES)[number];
export type TraceabilityExemption =
	(typeof TRACEABILITY_EXEMPTION_VALUES)[number];
export type DecisionApprovalStatus =
	(typeof DECISION_APPROVAL_STATUS_VALUES)[number];
export type DecisionRisk = "low" | "medium" | "high" | string;

export interface DecisionRowInput {
	id?: string;
	question?: string;
	currentState?: string;
	desiredState?: string;
	rationale?: string;
	affectedLayers?: string[];
	risk?: DecisionRisk;
	approval?: DecisionApprovalStatus | string;
	alternatives?: string[];
	sourceRefs?: string[];
	proofRefs?: string[];
	changeType?: ChangeType | string;
	traceabilityExemption?: TraceabilityExemption | string;
	noKbImpactReason?: string;
}

export interface DecisionRow {
	id: string;
	question: string;
	currentState: string;
	desiredState: string;
	rationale: string;
	affectedLayers: string[];
	risk: DecisionRisk;
	approval: DecisionApprovalStatus;
	alternatives: string[];
	sourceRefs: string[];
	proofRefs: string[];
	changeType: ChangeType | string;
	traceabilityExemption?: TraceabilityExemption | string;
	noKbImpactReason?: string;
}

export interface DecisionTableInput {
	id?: string;
	summary?: string;
	sourceRefs?: string[];
	rows?: DecisionRowInput[];
	createdAt?: string;
	updatedAt?: string;
}

export interface DecisionTable {
	id: string;
	summary: string;
	sourceRefs: string[];
	rows: DecisionRow[];
	createdAt: string;
	updatedAt: string;
}

export interface KnowledgeDelta {
	updatedRefs: string[];
	sections: string[];
	beforeDigest?: string;
	afterDigest?: string;
	noImpactReason?: string;
	summary?: string;
}

export interface CurrentStatePacket {
	summary: string;
	refs: string[];
	observedAt?: string;
	contentProof?: ContentProof;
}

export interface DecisionOutput {
	id: string;
	traceId: string;
	tableId: string;
	summary: string;
	approvedRowIds: string[];
	requirementIds: string[];
	knowledgeDelta: KnowledgeDelta;
	currentStatePacket: CurrentStatePacket;
	refs: string[];
	createdAt: string;
}

export type DecisionRowAction =
	| "accept"
	| "reject"
	| "defer"
	| "alternative"
	| "edit";

export interface DecisionRowActionInput {
	rowId: string;
	action: DecisionRowAction;
	row?: DecisionRowInput;
	alternative?: string;
}

export interface DecisionRowActionFailure {
	rowId: string;
	action: string;
	error: string;
}
