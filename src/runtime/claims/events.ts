import { normalizeTraceRefs } from "../../traces/refs.ts";
import type { TraceEvent } from "../../traces/types.ts";

export type RuntimeClaimEventName = "runtime.work_unit.claimed";
export type RuntimeClaimReleaseEventName =
	| "runtime.work_unit.claim.released"
	| "runtime.work_unit.claim.expired"
	| "runtime.work_unit.claim.cancelled";

export interface TraceClaim {
	traceId: string;
	pathScopes: string[];
	expiresAt: string;
}

export interface CreateRuntimeClaimEventInput {
	traceId: string;
	id: string;
	parentId: string | null;
	sequence: number;
	createdAt: string;
	event?: RuntimeClaimEventName;
	claimId?: string;
	workerId: string;
	workUnitId: string;
	planningRefs: string[];
	pathScopes: string[];
	expiresAt?: string;
	refs?: string[];
	data?: Record<string, unknown>;
}

export interface CreateRuntimeClaimReleaseEventInput {
	traceId: string;
	id: string;
	parentId: string | null;
	sequence: number;
	createdAt: string;
	event?: RuntimeClaimReleaseEventName;
	claimId?: string;
	workerId?: string;
	workUnitId: string;
	planningRefs: string[];
	pathScopes?: string[];
	reason?: string;
	refs?: string[];
	data?: Record<string, unknown>;
}

export function createRuntimeClaimEvent(
	input: CreateRuntimeClaimEventInput,
): TraceEvent {
	return {
		type: "trace_event",
		id: input.id,
		parentId: input.parentId,
		traceId: input.traceId,
		sequence: input.sequence,
		event: input.event || "runtime.work_unit.claimed",
		refs: claimRefs(input),
		createdAt: input.createdAt,
		data: {
			claimId: input.claimId || input.id,
			workerId: input.workerId,
			workUnitId: input.workUnitId,
			planningRefs: [...input.planningRefs],
			pathScopes: [...input.pathScopes],
			...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
			...(input.data || {}),
		},
	};
}

export function createRuntimeClaimReleaseEvent(
	input: CreateRuntimeClaimReleaseEventInput,
): TraceEvent {
	return {
		type: "trace_event",
		id: input.id,
		parentId: input.parentId,
		traceId: input.traceId,
		sequence: input.sequence,
		event: input.event || "runtime.work_unit.claim.released",
		refs: claimReleaseRefs(input),
		createdAt: input.createdAt,
		data: {
			claimId: input.claimId || input.id,
			...(input.workerId ? { workerId: input.workerId } : {}),
			workUnitId: input.workUnitId,
			planningRefs: [...input.planningRefs],
			...(input.pathScopes ? { pathScopes: [...input.pathScopes] } : {}),
			...(input.reason ? { reason: input.reason } : {}),
			...(input.data || {}),
		},
	};
}

function claimRefs(input: CreateRuntimeClaimEventInput): string[] {
	return normalizeTraceRefs([
		...input.planningRefs,
		...input.pathScopes,
		...(input.refs || []),
	]);
}

function claimReleaseRefs(
	input: CreateRuntimeClaimReleaseEventInput,
): string[] {
	return normalizeTraceRefs([
		...input.planningRefs,
		...(input.pathScopes || []),
		...(input.refs || []),
	]);
}
