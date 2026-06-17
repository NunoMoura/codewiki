import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
	createRuntimeClaimEvent,
	createRuntimeClaimReleaseEvent,
} from "./claims.ts";
import type { WorktreeRef } from "../git/worktrees.ts";
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
	worktreesByWorkUnit?: Record<string, WorktreeRef>;
}

export interface RuntimeDispatchClaimBatch {
	events: TraceEvent[];
	nextSequenceByTrace: Record<string, number>;
}

export interface RuntimeFailedWorkerStartInput {
	traceId: string;
	workerId: string;
	workUnitId: string;
	planningRefs: string[];
	error?: string;
	sessionId?: string;
	sessionFile?: string;
}

export interface RuntimeFailedWorkerStartReleaseOptions {
	createdAt: string;
	nextSequenceByTrace: Record<string, number>;
	releaseIdPrefix?: string;
}

export interface RuntimeWorkerCompletionReleaseInput {
	traceId?: string;
	workerId: string;
	workUnitId: string;
	claimId?: string;
	claim_id?: string;
	planningRefs?: string[];
	planning_refs?: string[];
	status?: string;
	message?: string;
	refs?: string[];
	sessionId?: string;
	session_id?: string;
	sessionFile?: string;
	session_file?: string;
}

export interface RuntimeWorkerCompletionReleaseOptions {
	createdAt: string;
	nextSequenceByTrace: Record<string, number>;
	releaseIdPrefix?: string;
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

export function createRuntimeFailedWorkerStartReleaseEvents(
	failures: RuntimeFailedWorkerStartInput[],
	claimEvents: TraceEvent[],
	options: RuntimeFailedWorkerStartReleaseOptions,
): RuntimeDispatchClaimBatch {
	const claims = claimMetadataByWorkUnit(claimEvents);
	const nextSequenceByTrace = { ...options.nextSequenceByTrace };
	const events = failures.map((failure) =>
		failedWorkerStartReleaseEvent({
			failure,
			claim: claims.get(claimKey(failure.traceId, failure.workUnitId)),
			options,
			nextSequenceByTrace,
		}),
	);
	return { events, nextSequenceByTrace };
}

export function createRuntimeWorkerCompletionReleaseEvents(
	completions: RuntimeWorkerCompletionReleaseInput[],
	claimEvents: TraceEvent[],
	options: RuntimeWorkerCompletionReleaseOptions,
): RuntimeDispatchClaimBatch {
	const claims = claimMetadataIndexes(claimEvents);
	const nextSequenceByTrace = { ...options.nextSequenceByTrace };
	const events = completions.map((completion) =>
		workerCompletionReleaseEvent({
			completion,
			claim: claimMetadataForCompletion(claims, completion),
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

interface RuntimeClaimMetadata {
	traceId: string;
	workUnitId: string;
	workerId?: string;
	claimId?: string;
	parentId: string;
	planningRefs: string[];
	pathScopes: string[];
}

interface RuntimeClaimMetadataIndexes {
	byWorkUnit: Map<string, RuntimeClaimMetadata>;
	byClaimId: Map<string, RuntimeClaimMetadata>;
	byWorkUnitId: Map<string, RuntimeClaimMetadata>;
}

function claimMetadataByWorkUnit(
	events: TraceEvent[],
): Map<string, RuntimeClaimMetadata> {
	return claimMetadataIndexes(events).byWorkUnit;
}

function claimMetadataIndexes(
	events: TraceEvent[],
): RuntimeClaimMetadataIndexes {
	const indexes: RuntimeClaimMetadataIndexes = {
		byWorkUnit: new Map(),
		byClaimId: new Map(),
		byWorkUnitId: new Map(),
	};
	for (const event of events) addClaimMetadata(indexes, event);
	return indexes;
}

function addClaimMetadata(
	indexes: RuntimeClaimMetadataIndexes,
	event: TraceEvent,
): void {
	const workUnitId = text(event.data?.workUnitId);
	if (!workUnitId) return;
	const metadata = claimMetadata(event, workUnitId);
	indexes.byWorkUnit.set(claimKey(event.traceId, workUnitId), metadata);
	indexes.byWorkUnitId.set(workUnitId, metadata);
	if (metadata.claimId) indexes.byClaimId.set(metadata.claimId, metadata);
}

function claimMetadata(
	event: TraceEvent,
	workUnitId: string,
): RuntimeClaimMetadata {
	return {
		traceId: event.traceId,
		workUnitId,
		...(text(event.data?.workerId)
			? { workerId: text(event.data?.workerId) }
			: {}),
		...(text(event.data?.claimId)
			? { claimId: text(event.data?.claimId) }
			: {}),
		parentId: event.id,
		planningRefs: stringList(event.data?.planningRefs),
		pathScopes: stringList(event.data?.pathScopes),
	};
}

function failedWorkerStartReleaseEvent(input: {
	failure: RuntimeFailedWorkerStartInput;
	claim?: RuntimeClaimMetadata;
	options: RuntimeFailedWorkerStartReleaseOptions;
	nextSequenceByTrace: Record<string, number>;
}): TraceEvent {
	const sequence = nextTraceSequence(
		input.nextSequenceByTrace,
		input.failure.traceId,
	);
	const planningRefs = input.claim?.planningRefs.length
		? input.claim.planningRefs
		: input.failure.planningRefs;
	const pathScopes = input.claim?.pathScopes || [];
	return createRuntimeClaimReleaseEvent({
		traceId: input.failure.traceId,
		id: failedStartReleaseId(input.failure, sequence, input.options),
		parentId: input.claim?.parentId || null,
		sequence,
		createdAt: input.options.createdAt,
		event: "runtime.claim.released",
		claimId: input.claim?.claimId,
		workerId: input.failure.workerId,
		workUnitId: input.failure.workUnitId,
		planningRefs,
		pathScopes,
		reason: "worker_start_failed",
		data: {
			status: "failed",
			failurePhase: "worker_start",
			...(input.failure.error ? { error: input.failure.error } : {}),
			...(input.failure.sessionId
				? { sessionId: input.failure.sessionId }
				: {}),
			...(input.failure.sessionFile
				? { sessionFile: input.failure.sessionFile }
				: {}),
		},
	});
}

function workerCompletionReleaseEvent(input: {
	completion: RuntimeWorkerCompletionReleaseInput;
	claim?: RuntimeClaimMetadata;
	options: RuntimeWorkerCompletionReleaseOptions;
	nextSequenceByTrace: Record<string, number>;
}): TraceEvent {
	const traceId = requiredCompletionTraceId(input.completion, input.claim);
	const sequence = nextTraceSequence(input.nextSequenceByTrace, traceId);
	const status = completionStatus(input.completion.status);
	return createRuntimeClaimReleaseEvent({
		traceId,
		id: workerCompletionReleaseId(
			input.completion,
			traceId,
			sequence,
			input.options,
		),
		parentId: input.claim?.parentId || null,
		sequence,
		createdAt: input.options.createdAt,
		event: "runtime.claim.released",
		claimId:
			input.claim?.claimId ||
			text(input.completion.claimId ?? input.completion.claim_id),
		workerId: input.completion.workerId,
		workUnitId: input.completion.workUnitId,
		planningRefs: completionPlanningRefs(input.completion, input.claim),
		pathScopes: input.claim?.pathScopes || [],
		reason: `worker_${status}`,
		refs: input.completion.refs,
		data: completionReleaseData(input.completion, status),
	});
}

function claimMetadataForCompletion(
	indexes: RuntimeClaimMetadataIndexes,
	completion: RuntimeWorkerCompletionReleaseInput,
): RuntimeClaimMetadata | undefined {
	const claimId = text(completion.claimId ?? completion.claim_id);
	if (claimId && indexes.byClaimId.has(claimId))
		return indexes.byClaimId.get(claimId);
	const traceId = text(completion.traceId);
	if (traceId)
		return indexes.byWorkUnit.get(claimKey(traceId, completion.workUnitId));
	return indexes.byWorkUnitId.get(completion.workUnitId);
}

function requiredCompletionTraceId(
	completion: RuntimeWorkerCompletionReleaseInput,
	claim?: RuntimeClaimMetadata,
): string {
	const traceId = text(completion.traceId) || claim?.traceId;
	if (!traceId)
		throw new Error(
			`Missing trace id for completed worker ${completion.workUnitId}.`,
		);
	return traceId;
}

function completionPlanningRefs(
	completion: RuntimeWorkerCompletionReleaseInput,
	claim?: RuntimeClaimMetadata,
): string[] {
	if (claim?.planningRefs.length) return claim.planningRefs;
	return unique([
		...stringList(completion.planningRefs),
		...stringList(completion.planning_refs),
	]);
}

function completionReleaseData(
	completion: RuntimeWorkerCompletionReleaseInput,
	status: "completed" | "blocked" | "failed",
): Record<string, unknown> {
	return {
		status,
		completionStatus: status,
		...(text(completion.message) ? { message: text(completion.message) } : {}),
		...optionalTextField(
			"sessionId",
			completion.sessionId ?? completion.session_id,
		),
		...optionalTextField(
			"sessionFile",
			completion.sessionFile ?? completion.session_file,
		),
	};
}

function completionStatus(value: unknown): "completed" | "blocked" | "failed" {
	const status = text(value).toLowerCase();
	if (status === "blocked" || status === "failed") return status;
	return "completed";
}

function workerCompletionReleaseId(
	completion: RuntimeWorkerCompletionReleaseInput,
	traceId: string,
	sequence: number,
	options: RuntimeWorkerCompletionReleaseOptions,
): string {
	return `${options.releaseIdPrefix || `${traceId}:runtime:release`}:${completion.workUnitId}:${sequence}`;
}

function failedStartReleaseId(
	failure: RuntimeFailedWorkerStartInput,
	sequence: number,
	options: RuntimeFailedWorkerStartReleaseOptions,
): string {
	return `${options.releaseIdPrefix || `${failure.traceId}:runtime:release`}:${failure.workUnitId}:${sequence}`;
}

function claimKey(traceId: string, workUnitId: string): string {
	return `${traceId}\0${workUnitId}`;
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

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function optionalTextField<Key extends string>(
	key: Key,
	value: unknown,
): Partial<Record<Key, string>> {
	const output = text(value);
	return output ? ({ [key]: output } as Partial<Record<Key, string>>) : {};
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
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
			...(input.options.worktreesByWorkUnit?.[input.item.workUnitId]
				? {
						worktree: input.options.worktreesByWorkUnit[input.item.workUnitId],
					}
				: {}),
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
