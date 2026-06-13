import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createRuntimeClaimEvent } from "./claims.ts";
import type { RuntimeDispatchItem, RuntimeDispatchPlan } from "./scheduler.ts";
import {
	appendTraceRecords,
	TraceAppendConflictError,
	type AppendTraceBatchResult,
} from "../traces/append.ts";
import { traceFilePath } from "../traces/schema.ts";
import type { TraceEvent } from "../traces/types.ts";

export interface RuntimeDispatchClaimOptions {
	createdAt: string;
	nextSequenceByTrace: Record<string, number>;
	expiresAt?: string;
	workerIdPrefix?: string;
	claimIdPrefix?: string;
	workerIds?: Record<string, string>;
}

export interface RuntimeDispatchClaimBatch {
	events: TraceEvent[];
	nextSequenceByTrace: Record<string, number>;
}

export interface RuntimeDispatchClaimAppendOptions {
	repoRoot: string;
	expectedBytesByTrace: Record<string, number>;
}

export interface RuntimeDispatchClaimAppendResult {
	events: TraceEvent[];
	results: AppendTraceBatchResult[];
	nextBytesByTrace: Record<string, number>;
}

export function createRuntimeDispatchClaimEvents(
	plan: RuntimeDispatchPlan,
	options: RuntimeDispatchClaimOptions,
): RuntimeDispatchClaimBatch {
	const nextSequenceByTrace = { ...options.nextSequenceByTrace };
	const events = plan.dispatch.map((item, index) =>
		claimEventForDispatchItem({
			item,
			index,
			options,
			nextSequenceByTrace,
		}),
	);
	return { events, nextSequenceByTrace };
}

export async function appendRuntimeDispatchClaims(
	batch: RuntimeDispatchClaimBatch,
	options: RuntimeDispatchClaimAppendOptions,
): Promise<RuntimeDispatchClaimAppendResult> {
	const groups = claimEventsByTrace(batch.events);
	await Promise.all(
		groups.map((group) => assertExpectedTraceBytes(group, options)),
	);
	const results: AppendTraceBatchResult[] = [];
	for (const group of groups) {
		results.push(
			await appendTraceRecords(
				options.repoRoot,
				group.events,
				expectedBytesForTrace(group.traceId, options),
			),
		);
	}
	return {
		events: [...batch.events],
		results,
		nextBytesByTrace: Object.fromEntries(
			results.map((result) => [result.records[0].traceId, result.nextBytes]),
		),
	};
}

interface RuntimeDispatchClaimTraceGroup {
	traceId: string;
	events: TraceEvent[];
}

function claimEventsByTrace(
	events: TraceEvent[],
): RuntimeDispatchClaimTraceGroup[] {
	const groups = new Map<string, TraceEvent[]>();
	for (const event of events) {
		groups.set(event.traceId, [...(groups.get(event.traceId) || []), event]);
	}
	return [...groups.entries()].map(([traceId, traceEvents]) => ({
		traceId,
		events: traceEvents,
	}));
}

async function assertExpectedTraceBytes(
	group: RuntimeDispatchClaimTraceGroup,
	options: RuntimeDispatchClaimAppendOptions,
): Promise<void> {
	const expectedBytes = expectedBytesForTrace(group.traceId, options);
	const path = resolve(options.repoRoot, traceFilePath(group.traceId));
	const actualBytes = await traceBytes(path);
	if (actualBytes !== expectedBytes) {
		throw new TraceAppendConflictError(path, expectedBytes, actualBytes);
	}
}

function expectedBytesForTrace(
	traceId: string,
	options: RuntimeDispatchClaimAppendOptions,
): number {
	const expected = options.expectedBytesByTrace[traceId];
	if (!Number.isInteger(expected) || expected < 0) {
		throw new Error(`Missing expected trace bytes for ${traceId}.`);
	}
	return expected;
}

async function traceBytes(path: string): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return 0;
		throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

function claimEventForDispatchItem(input: {
	item: RuntimeDispatchItem;
	index: number;
	options: RuntimeDispatchClaimOptions;
	nextSequenceByTrace: Record<string, number>;
}): TraceEvent {
	const sequence = nextTraceSequence(
		input.nextSequenceByTrace,
		input.item.traceId,
	);
	const workerId = workerIdForItem(input.item, input.index, input.options);
	const claimId = claimIdForItem(input.item, input.index, input.options);
	return createRuntimeClaimEvent({
		traceId: input.item.traceId,
		id: `${input.item.traceId}:runtime:claim:${input.item.workUnitId}:${sequence}`,
		parentId: input.item.sourceEventId || input.item.planningRefs[0] || null,
		sequence,
		createdAt: input.options.createdAt,
		claimId,
		workerId,
		workUnitId: input.item.workUnitId,
		planningRefs: input.item.planningRefs,
		pathScopes: input.item.pathScopes,
		...(input.options.expiresAt ? { expiresAt: input.options.expiresAt } : {}),
		data: {
			title: input.item.title,
			componentRefs: [...input.item.componentRefs],
		},
	});
}

function nextTraceSequence(
	nextSequenceByTrace: Record<string, number>,
	traceId: string,
): number {
	const sequence = nextSequenceByTrace[traceId];
	if (!Number.isInteger(sequence) || sequence < 1) {
		throw new Error(`Missing next trace sequence for ${traceId}.`);
	}
	nextSequenceByTrace[traceId] = sequence + 1;
	return sequence;
}

function workerIdForItem(
	item: RuntimeDispatchItem,
	index: number,
	options: RuntimeDispatchClaimOptions,
): string {
	return (
		options.workerIds?.[item.workUnitId] ||
		`${options.workerIdPrefix || "worker"}-${String(index + 1).padStart(3, "0")}`
	);
}

function claimIdForItem(
	item: RuntimeDispatchItem,
	index: number,
	options: RuntimeDispatchClaimOptions,
): string {
	return `${options.claimIdPrefix || "claim"}-${item.workUnitId}-${String(index + 1).padStart(3, "0")}`;
}
