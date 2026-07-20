import { assertValidTraceRecord } from "./schema.ts";
import { normalizeTraceRefs } from "./refs.ts";
import type {
	TailCheckpoint,
	TraceHead,
	TraceOrigin,
	TraceRecord,
} from "./types.ts";

export interface CreateTraceHeadInput {
	traceId: string;
	changeId?: string;
	title: string;
	createdAt?: string;
	origin?: TraceOriginInput;
}

export interface TraceOriginInput {
	kind: string;
	parentTraceId?: string;
	triggerTraceId?: string;
	triggerId?: string;
	planningRef?: string;
	sourceRef?: string;
	runKey?: string;
	refs?: string[];
}

export interface CreateTriggerRunTraceHeadInput {
	traceId: string;
	title: string;
	triggerTraceId: string;
	triggerId: string;
	planningRef: string;
	runKey: string;
	createdAt?: string;
	sourceRef?: string;
	refs?: string[];
}

export interface CreateTailCheckpointInput {
	id: string;
	parentId: string | null;
	traceId: string;
	firstKeptRecordId: string;
	summary: string;
	createdAt?: string;
	data?: Record<string, unknown>;
}

export function createTraceHead(input: CreateTraceHeadInput): TraceHead {
	return {
		type: "trace_head",
		traceId: input.traceId.trim(),
		...(input.changeId ? { changeId: input.changeId.trim() } : {}),
		title: input.title.trim(),
		createdAt: input.createdAt || new Date().toISOString(),
		...traceOriginProperty(input.origin),
	};
}

export function createTriggerRunTraceHead(
	input: CreateTriggerRunTraceHeadInput,
): TraceHead {
	return createTraceHead({
		traceId: input.traceId,
		title: input.title,
		createdAt: input.createdAt,
		origin: {
			kind: "trigger_run",
			parentTraceId: input.triggerTraceId,
			triggerTraceId: input.triggerTraceId,
			triggerId: input.triggerId,
			planningRef: input.planningRef,
			runKey: input.runKey,
			...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
			refs: normalizeTraceRefs([
				input.triggerTraceId,
				input.triggerId,
				input.planningRef,
				input.runKey,
				input.sourceRef || "",
				...(input.refs || []),
			]),
		},
	});
}

function traceOriginProperty(input: TraceOriginInput | undefined): {
	origin?: TraceOrigin;
} {
	if (!input) return {};
	const origin: TraceOrigin = {
		kind: input.kind.trim(),
		...(input.parentTraceId
			? { parentTraceId: input.parentTraceId.trim() }
			: {}),
		...(input.triggerTraceId
			? { triggerTraceId: input.triggerTraceId.trim() }
			: {}),
		...(input.triggerId ? { triggerId: input.triggerId.trim() } : {}),
		...(input.planningRef ? { planningRef: input.planningRef.trim() } : {}),
		...(input.sourceRef ? { sourceRef: input.sourceRef.trim() } : {}),
		...(input.runKey ? { runKey: input.runKey.trim() } : {}),
		refs: normalizeTraceRefs(input.refs || []),
	};
	return { origin };
}

export function createTailCheckpoint(
	input: CreateTailCheckpointInput,
): TailCheckpoint {
	return {
		type: "tail_checkpoint",
		id: input.id.trim(),
		parentId: input.parentId,
		traceId: input.traceId.trim(),
		firstKeptRecordId: input.firstKeptRecordId.trim(),
		summary: input.summary.trim(),
		createdAt: input.createdAt || new Date().toISOString(),
		...(input.data ? { data: input.data } : {}),
	};
}

export function formatTraceLine(record: TraceRecord): string {
	return `${JSON.stringify(assertValidTraceRecord(record))}\n`;
}

export function formatTraceText(records: TraceRecord[]): string {
	return records.map(formatTraceLine).join("");
}
