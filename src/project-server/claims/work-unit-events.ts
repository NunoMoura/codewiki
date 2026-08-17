import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
	createProjectServerClaimEvent,
	createProjectServerClaimReleaseEvent,
} from "./events.ts";
import {
	executionErrorData,
	type CodewikiExecutionError,
} from "../../error-handling/codewiki-error.ts";
import type { WorktreeRef } from "../../git/worktrees.ts";
import type {
	ProjectServerWorkUnitClaimCandidate,
	ProjectServerWorkUnitClaimSelection,
} from "./work-unit-selection.ts";
import {
	CodewikiTraceError,
	TraceAppendConflictError,
} from "../../changes/trace/storage-errors.ts";
import {
	appendProjectServerTraceRecords,
	type AppendTraceBatchResult,
} from "../persistence/trace.ts";
import { traceFilePath } from "../../changes/trace/schema.ts";
import type { TraceEvent } from "../../changes/trace/types.ts";

export interface ProjectServerWorkUnitClaimEventOptions {
	createdAt: string;
	nextSequenceByTrace: Record<string, number>;
	expiresAt?: string;
	workerIdPrefix?: string;
	claimIdPrefix?: string;
	workerIds?: Record<string, string>;
	worktreesByWorkUnit?: Record<string, WorktreeRef>;
}

export interface ProjectServerWorkUnitClaimEventBatch {
	events: TraceEvent[];
	nextSequenceByTrace: Record<string, number>;
}

export interface ProjectServerWorkerCompletionReleaseInput {
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
	executionError?: CodewikiExecutionError;
	sessionId?: string;
	session_id?: string;
	sessionFile?: string;
	session_file?: string;
}

export interface ProjectServerWorkerCompletionReleaseOptions {
	createdAt: string;
	nextSequenceByTrace: Record<string, number>;
	releaseIdPrefix?: string;
}

export interface ProjectServerWorkUnitClaimAppendOptions {
	repoRoot: string;
	expectedBytesByTrace: Record<string, number>;
}

export interface ProjectServerWorkUnitClaimAppendResult {
	events: TraceEvent[];
	results: AppendTraceBatchResult[];
	nextBytesByTrace: Record<string, number>;
}

export function createProjectServerWorkUnitClaimEvents(
	plan: ProjectServerWorkUnitClaimSelection,
	options: ProjectServerWorkUnitClaimEventOptions,
): ProjectServerWorkUnitClaimEventBatch {
	const nextSequenceByTrace = { ...options.nextSequenceByTrace };
	const events = plan.selected.map((item, index) =>
		claimEventForCandidate({
			item,
			index,
			options,
			nextSequenceByTrace,
		}),
	);
	return { events, nextSequenceByTrace };
}

export function createProjectServerWorkerCompletionReleaseEvents(
	completions: ProjectServerWorkerCompletionReleaseInput[],
	claimEvents: TraceEvent[],
	options: ProjectServerWorkerCompletionReleaseOptions,
): ProjectServerWorkUnitClaimEventBatch {
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

export async function appendProjectServerWorkUnitClaims(
	batch: ProjectServerWorkUnitClaimEventBatch,
	options: ProjectServerWorkUnitClaimAppendOptions,
): Promise<ProjectServerWorkUnitClaimAppendResult> {
	const groups = claimEventsByTrace(batch.events);
	await Promise.all(
		groups.map((group) => assertExpectedTraceBytes(group, options)),
	);
	const results: AppendTraceBatchResult[] = [];
	for (const group of groups) {
		results.push(
			await appendProjectServerTraceRecords(
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

interface ProjectServerWorkUnitClaimTraceGroup {
	traceId: string;
	events: TraceEvent[];
}

interface ProjectServerClaimMetadata {
	traceId: string;
	workUnitId: string;
	workerId?: string;
	claimId?: string;
	parentId: string;
	planningRefs: string[];
	pathScopes: string[];
}

interface ProjectServerClaimMetadataIndexes {
	byWorkUnit: Map<string, ProjectServerClaimMetadata>;
	byClaimId: Map<string, ProjectServerClaimMetadata>;
	byWorkUnitId: Map<string, ProjectServerClaimMetadata>;
}

function claimMetadataIndexes(
	events: TraceEvent[],
): ProjectServerClaimMetadataIndexes {
	const indexes: ProjectServerClaimMetadataIndexes = {
		byWorkUnit: new Map(),
		byClaimId: new Map(),
		byWorkUnitId: new Map(),
	};
	for (const event of events) addClaimMetadata(indexes, event);
	return indexes;
}

function addClaimMetadata(
	indexes: ProjectServerClaimMetadataIndexes,
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
): ProjectServerClaimMetadata {
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

function workerCompletionReleaseEvent(input: {
	completion: ProjectServerWorkerCompletionReleaseInput;
	claim?: ProjectServerClaimMetadata;
	options: ProjectServerWorkerCompletionReleaseOptions;
	nextSequenceByTrace: Record<string, number>;
}): TraceEvent {
	const traceId = requiredCompletionTraceId(input.completion, input.claim);
	const sequence = nextTraceSequence(input.nextSequenceByTrace, traceId);
	const status = completionStatus(input.completion.status);
	return createProjectServerClaimReleaseEvent({
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
		event: "runtime.work_unit.claim.released",
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
	indexes: ProjectServerClaimMetadataIndexes,
	completion: ProjectServerWorkerCompletionReleaseInput,
): ProjectServerClaimMetadata | undefined {
	const claimId = text(completion.claimId ?? completion.claim_id);
	if (claimId && indexes.byClaimId.has(claimId))
		return indexes.byClaimId.get(claimId);
	const traceId = text(completion.traceId);
	if (traceId)
		return indexes.byWorkUnit.get(claimKey(traceId, completion.workUnitId));
	return indexes.byWorkUnitId.get(completion.workUnitId);
}

function requiredCompletionTraceId(
	completion: ProjectServerWorkerCompletionReleaseInput,
	claim?: ProjectServerClaimMetadata,
): string {
	const traceId = text(completion.traceId) || claim?.traceId;
	if (!traceId)
		throw new Error(
			`Missing trace id for completed worker ${completion.workUnitId}.`,
		);
	return traceId;
}

function completionPlanningRefs(
	completion: ProjectServerWorkerCompletionReleaseInput,
	claim?: ProjectServerClaimMetadata,
): string[] {
	if (claim?.planningRefs.length) return claim.planningRefs;
	return unique([
		...stringList(completion.planningRefs),
		...stringList(completion.planning_refs),
	]);
}

function completionReleaseData(
	completion: ProjectServerWorkerCompletionReleaseInput,
	status: "completed" | "blocked" | "failed" | "cancelled",
): Record<string, unknown> {
	return {
		status,
		completionStatus: status,
		...(text(completion.message) ? { message: text(completion.message) } : {}),
		...(completion.executionError
			? { executionError: executionErrorData(completion.executionError) }
			: {}),
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

function completionStatus(
	value: unknown,
): "completed" | "blocked" | "failed" | "cancelled" {
	const status = text(value).toLowerCase();
	if (status === "blocked" || status === "failed" || status === "cancelled") {
		return status;
	}
	return "completed";
}

function workerCompletionReleaseId(
	completion: ProjectServerWorkerCompletionReleaseInput,
	traceId: string,
	sequence: number,
	options: ProjectServerWorkerCompletionReleaseOptions,
): string {
	return `${options.releaseIdPrefix || `${traceId}:runtime:release`}:${completion.workUnitId}:${sequence}`;
}

function claimKey(traceId: string, workUnitId: string): string {
	return `${traceId}\0${workUnitId}`;
}

function claimEventsByTrace(
	events: TraceEvent[],
): ProjectServerWorkUnitClaimTraceGroup[] {
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
	group: ProjectServerWorkUnitClaimTraceGroup,
	options: ProjectServerWorkUnitClaimAppendOptions,
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
	options: ProjectServerWorkUnitClaimAppendOptions,
): number {
	const expected = options.expectedBytesByTrace[traceId];
	if (!Number.isInteger(expected) || expected < 0) {
		throw new CodewikiTraceError({
			code: "append_conflict",
			message: `Missing expected trace bytes for ${traceId}.`,
			traceId,
			data: { expected },
		});
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

function claimEventForCandidate(input: {
	item: ProjectServerWorkUnitClaimCandidate;
	index: number;
	options: ProjectServerWorkUnitClaimEventOptions;
	nextSequenceByTrace: Record<string, number>;
}): TraceEvent {
	const sequence = nextTraceSequence(
		input.nextSequenceByTrace,
		input.item.traceId,
	);
	const workerId = workerIdForItem(input.item, input.index, input.options);
	const claimId = claimIdForItem(input.item, input.index, input.options);
	return createProjectServerClaimEvent({
		traceId: input.item.traceId,
		id: `${input.item.traceId}:runtime:claim:${input.item.workUnitId}:${sequence}`,
		parentId: parentIdForClaimCandidate(input.item),
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

function parentIdForClaimCandidate(
	item: ProjectServerWorkUnitClaimCandidate,
): string | null {
	for (const ref of [
		item.sourceEventId,
		...item.planningRefs,
		...item.traceRefs,
	]) {
		const parentId = parentEventId(ref);
		if (parentId) return parentId;
	}
	return null;
}

function parentEventId(value: unknown): string | undefined {
	const ref = text(value);
	if (!ref) return undefined;
	if (ref.startsWith("trace:")) {
		const candidate = ref.slice("trace:".length).split("#")[0];
		return looksLikeTraceEventId(candidate) ? candidate : undefined;
	}
	if (ref.includes("#")) {
		const candidate = ref.split("#")[0];
		return looksLikeTraceEventId(candidate) ? candidate : undefined;
	}
	return looksLikeTraceEventId(ref) ? ref : undefined;
}

function looksLikeTraceEventId(value: string): boolean {
	return (
		/:(decision|planning|implementation):iteration:/.test(value) ||
		/:runtime:(claim|release):/.test(value)
	);
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
	item: ProjectServerWorkUnitClaimCandidate,
	index: number,
	options: ProjectServerWorkUnitClaimEventOptions,
): string {
	return (
		options.workerIds?.[item.workUnitId] ||
		`${options.workerIdPrefix || "worker"}-${String(index + 1).padStart(3, "0")}`
	);
}

function claimIdForItem(
	item: ProjectServerWorkUnitClaimCandidate,
	index: number,
	options: ProjectServerWorkUnitClaimEventOptions,
): string {
	return `${options.claimIdPrefix || "claim"}-${item.workUnitId}-${String(index + 1).padStart(3, "0")}`;
}
