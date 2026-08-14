import { CodewikiTraceError } from "./storage-errors.ts";
import { traceGoalCloseBlockers } from "../../work-state/trace-goals.ts";
import { latestTailCheckpoint, replayTrace } from "./replay.ts";
import type { TraceClose, TraceRecord } from "./types.ts";

export interface TraceRetentionStub {
	traceId: string;
	title: string;
	headRef: string;
	gitRestoreRef: string;
	firstKeptRecordId?: string;
	summary?: string;
	closedAt?: string;
	closeReason?: string;
	createdAt: string;
}

export interface TraceRetentionStubInput {
	records: TraceRecord[];
	gitRestoreRef: string;
	headRef?: string;
}

export interface TraceCloseInput {
	records: TraceRecord[];
	id?: string;
	parentId?: string | null;
	reason?: string;
	gitRestoreRef: string;
	headRef?: string;
	refs?: string[];
	createdAt?: string;
	data?: Record<string, unknown>;
	allowIncomplete?: boolean;
}

export interface TraceHydrationPlan {
	traceId: string;
	gitRestoreRef: string;
	records: TraceRecord[];
	refs: string[];
}

export interface TraceArchiveCompactPlan {
	traceId: string;
	gitRestoreRef: string;
	fullRecordCount: number;
	compactRecords: TraceRecord[];
	closeRecord: TraceClose;
	stub: TraceRetentionStub;
	refs: string[];
}

export interface TraceHydrationInput {
	stub: TraceRetentionStub;
	archivedRecords: TraceRecord[];
}

export interface TraceArchiveCompactInput extends TraceCloseInput {
	summary?: string;
}

export function buildTraceRetentionStub(
	input: TraceRetentionStubInput,
): TraceRetentionStub {
	const state = replayTrace(input.records);
	const checkpoint = latestTailCheckpoint(input.records);
	return {
		traceId: state.head.traceId,
		title: state.head.title,
		headRef: input.headRef || state.head.traceId,
		gitRestoreRef: input.gitRestoreRef.trim(),
		...(checkpoint
			? {
					firstKeptRecordId: checkpoint.firstKeptRecordId,
					summary: checkpoint.summary,
				}
			: {}),
		...(state.close
			? {
					closedAt: state.close.createdAt,
					closeReason: state.close.reason,
				}
			: {}),
		createdAt: state.head.createdAt,
	};
}

export function buildTraceArchiveCompactPlan(
	input: TraceArchiveCompactInput,
): TraceArchiveCompactPlan {
	const state = replayTrace(input.records);
	const restoreGitRef = input.gitRestoreRef.trim();
	const restoreHeadRef = input.headRef?.trim() || state.head.traceId;
	const closeRecord = state.close
		? closeRecordForArchiveCompaction(state.close, input)
		: createTraceCloseRecord(input);
	const compactCheckpoint = {
		type: "tail_checkpoint" as const,
		id: `${state.head.traceId}:archive:checkpoint:${closeRecord.id}`,
		parentId: null,
		traceId: state.head.traceId,
		firstKeptRecordId: closeRecord.id,
		summary:
			input.summary?.trim() ||
			`Trace archived to ${restoreGitRef}; hydrate from Git restore ref for full records.`,
		createdAt: closeRecord.createdAt,
		data: {
			archivedRecordCount: state.closed
				? input.records.length
				: input.records.length + 1,
			gitRestoreRef: restoreGitRef,
			headRef: restoreHeadRef,
			closeRecordId: closeRecord.id,
			...(state.close?.gitRestoreRef && state.close.gitRestoreRef !== restoreGitRef
				? { originalCloseGitRestoreRef: state.close.gitRestoreRef }
				: {}),
			...(state.close?.headRef && state.close.headRef !== restoreHeadRef
				? { originalCloseHeadRef: state.close.headRef }
				: {}),
		},
	};
	const compactClose: TraceClose = {
		...closeRecord,
		parentId: compactCheckpoint.id,
	};
	const compactRecords: TraceRecord[] = [
		state.head,
		compactCheckpoint,
		compactClose,
	];
	replayTrace(compactRecords);
	const stub = buildTraceRetentionStub({
		records: compactRecords,
		gitRestoreRef: restoreGitRef,
		headRef: restoreHeadRef,
	});
	return {
		traceId: state.head.traceId,
		gitRestoreRef: restoreGitRef,
		fullRecordCount: input.records.length,
		compactRecords,
		closeRecord,
		stub,
		refs: traceRetentionRefs(stub),
	};
}

function closeRecordForArchiveCompaction(
	close: TraceClose,
	input: TraceArchiveCompactInput,
): TraceClose {
	const gitRestoreRef = input.gitRestoreRef.trim();
	const headRef = input.headRef?.trim() || close.headRef;
	if (close.gitRestoreRef === gitRestoreRef && close.headRef === headRef) {
		return close;
	}
	return {
		...close,
		gitRestoreRef,
		headRef,
		refs: normalizeRefs([
			...close.refs,
			gitRestoreRef,
			headRef,
			...normalizeRefs(input.refs || []),
		]),
		data: {
			...(close.data || {}),
			originalCloseGitRestoreRef: close.gitRestoreRef,
			originalCloseHeadRef: close.headRef,
		},
	};
}

export function createTraceCloseRecord(input: TraceCloseInput): TraceClose {
	const state = replayTrace(input.records);
	if (state.closed)
		throw new Error(`Trace ${state.head.traceId} is already closed.`);
	const gitRestoreRef = input.gitRestoreRef.trim();
	if (!gitRestoreRef) throw new Error("Trace close requires gitRestoreRef.");
	const headRef = input.headRef?.trim() || state.head.traceId;
	if (!input.allowIncomplete) {
		const blockers = traceGoalCloseBlockers(input.records);
		if (blockers.length > 0) {
			throw new CodewikiTraceError({
				code: "invalid_trace",
				message: `Trace ${state.head.traceId} cannot close before its goal is complete: ${blockers.join(" ")}`,
				traceId: state.head.traceId,
				data: { blockers },
			});
		}
	}
	const parentId =
		input.parentId !== undefined
			? input.parentId
			: state.lastRecordId === state.head.traceId
				? null
				: state.lastRecordId;
	return {
		type: "trace_close",
		id:
			input.id?.trim() ||
			`${state.head.traceId}:archive:close:${state.lastSequence + 1}`,
		parentId,
		traceId: state.head.traceId,
		reason: input.reason?.trim() || "Trace closed for retention.",
		gitRestoreRef,
		headRef,
		refs: normalizeRefs([
			...traceRetentionRefs({
				...buildTraceRetentionStub({
					records: input.records,
					gitRestoreRef,
					headRef,
				}),
				gitRestoreRef,
				headRef,
			}),
			...normalizeRefs(input.refs || []),
		]),
		createdAt: input.createdAt || new Date().toISOString(),
		...(input.data ? { data: input.data } : {}),
	};
}

export function buildTraceHydrationPlan(
	input: TraceHydrationInput,
): TraceHydrationPlan {
	const state = replayTrace(input.archivedRecords);
	if (state.head.traceId !== input.stub.traceId) {
		throw new Error(
			`Hydration trace mismatch: ${state.head.traceId} does not match ${input.stub.traceId}.`,
		);
	}
	assertHydrationStubMatchesTrace(input.stub, state);
	return {
		traceId: input.stub.traceId,
		gitRestoreRef: input.stub.gitRestoreRef,
		records: hydratedRecords(input.stub, input.archivedRecords, state),
		refs: traceRetentionRefs(input.stub),
	};
}

function hydratedRecords(
	stub: TraceRetentionStub,
	archivedRecords: TraceRecord[],
	state: ReturnType<typeof replayTrace>,
): TraceRecord[] {
	if (state.close || !stub.closedAt) return [...archivedRecords];
	return [
		...archivedRecords,
		createTraceCloseRecord({
			records: archivedRecords,
			gitRestoreRef: stub.gitRestoreRef,
			headRef: stub.headRef,
			reason: stub.closeReason,
			createdAt: stub.closedAt,
		}),
	];
}

function assertHydrationStubMatchesTrace(
	stub: TraceRetentionStub,
	state: ReturnType<typeof replayTrace>,
): void {
	const close = state.close;
	if (!close) {
		if (stub.closedAt && stub.gitRestoreRef.trim()) return;
		if (stub.closedAt || stub.closeReason) {
			throw new Error(
				`Hydration close mismatch: stub for ${stub.traceId} is closed but archived records are open.`,
			);
		}
		return;
	}
	const compactCloseMatch = stub.firstKeptRecordId === close.id;
	if (
		close.gitRestoreRef.trim() !== stub.gitRestoreRef.trim() &&
		!compactCloseMatch
	) {
		throw new Error(
			`Hydration restore ref mismatch: ${close.gitRestoreRef} does not match ${stub.gitRestoreRef}.`,
		);
	}
	if (close.headRef.trim() !== stub.headRef.trim() && !compactCloseMatch) {
		throw new Error(
			`Hydration head ref mismatch: ${close.headRef} does not match ${stub.headRef}.`,
		);
	}
	if (stub.closedAt && close.createdAt !== stub.closedAt) {
		throw new Error(
			`Hydration close time mismatch: ${close.createdAt} does not match ${stub.closedAt}.`,
		);
	}
	if (stub.closeReason && close.reason !== stub.closeReason) {
		throw new Error(
			`Hydration close reason mismatch: ${close.reason} does not match ${stub.closeReason}.`,
		);
	}
}

export function traceRetentionRefs(stub: TraceRetentionStub): string[] {
	return normalizeRefs([
		stub.headRef,
		stub.gitRestoreRef,
		...(stub.firstKeptRecordId ? [stub.firstKeptRecordId] : []),
	]);
}

function normalizeRefs(refs: string[]): string[] {
	return Array.from(
		new Set(refs.map((ref) => String(ref || "").trim()).filter(Boolean)),
	);
}
