import { join } from "node:path";
import { createCodewikiOperationError } from "../../error-handling/operation-errors.ts";
import { traceGoalCloseBlockers } from "../../views/trace-goals.ts";
import {
	appendRuntimeTraceRecord,
	type AppendTraceResult,
} from "../persistence/trace.ts";
import {
	replaceTraceRecords,
	type ReplaceTraceRecordsResult,
} from "../../changes/trace/append.ts";
import {
	buildTraceCloseReleaseNotes,
	type TraceCloseReleaseNotes,
} from "../../changes/trace/release-notes.ts";
import {
	buildTraceArchiveCompactPlan,
	buildTraceHydrationPlan,
	buildTraceRetentionStub,
	createTraceCloseRecord,
	traceRetentionRefs,
	type TraceHydrationPlan,
	type TraceRetentionStub,
} from "../../changes/trace/retention.ts";
import { readTraceFile } from "../../changes/trace/reader.ts";
import { traceFilePath } from "../../changes/trace/schema.ts";
import type { TraceClose, TraceRecord } from "../../changes/trace/types.ts";

export type WikiArchiveMode = "preview" | "append";
export type WikiArchiveAction =
	| "retention_stub"
	| "close"
	| "hydrate"
	| "compact";

export interface RunWikiArchiveInput {
	action?: WikiArchiveAction;
	mode?: WikiArchiveMode;
	records?: TraceRecord[];
	traceId?: string;
	archivedRecords?: TraceRecord[];
	stub?: TraceRetentionStub;
	gitRestoreRef?: string;
	headRef?: string;
	closeId?: string;
	parentId?: string | null;
	reason?: string;
	refs?: string[];
	createdAt?: string;
	data?: Record<string, unknown>;
	summary?: string;
	repoRoot?: string;
	expectedBytes?: number;
}

export interface RunWikiArchiveResult {
	action: WikiArchiveAction;
	mode: WikiArchiveMode;
	stub?: TraceRetentionStub;
	closeRecord?: TraceClose;
	hydration?: TraceHydrationPlan;
	releaseNotes?: TraceCloseReleaseNotes;
	compactRecords?: TraceRecord[];
	refs: string[];
	append?: AppendTraceResult | ReplaceTraceRecordsResult;
}

export async function runWikiArchive(
	input: RunWikiArchiveInput,
): Promise<RunWikiArchiveResult> {
	const action = input.action ?? "retention_stub";
	const mode = input.mode ?? "preview";
	if (action === "retention_stub") return retentionStubResult(input, mode);
	if (action === "close") return closeResult(input, mode);
	if (action === "hydrate") return hydrationResult(input, mode);
	if (action === "compact") return compactResult(input, mode);
	throw createCodewikiOperationError({
		operation: "wiki_archive",
		code: "unsupported_action",
		field: "action",
		message: `Unsupported wiki_archive action ${action}.`,
		data: { action },
	});
}

function retentionStubResult(
	input: RunWikiArchiveInput,
	mode: WikiArchiveMode,
): RunWikiArchiveResult {
	assertPreviewOnly(mode, "retention_stub");
	const stub = buildTraceRetentionStub({
		records: requiredRecords(input.records),
		gitRestoreRef: requiredGitRestoreRef(input.gitRestoreRef),
		headRef: input.headRef,
	});
	return {
		action: "retention_stub",
		mode,
		stub,
		refs: traceRetentionRefs(stub),
	};
}

async function closeResult(
	input: RunWikiArchiveInput,
	mode: WikiArchiveMode,
): Promise<RunWikiArchiveResult> {
	const records = await closeRecords(input);
	const closeBlockers = traceGoalCloseBlockers(records);
	if (closeBlockers.length > 0) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "append_blocked",
			message: `wiki_archive close blocked by incomplete trace goal: ${closeBlockers.join(" ")}`,
			suggestedAction: "fix_input",
			data: { blockers: closeBlockers },
		});
	}
	const closeRecord = createTraceCloseRecord({
		records,
		id: input.closeId,
		parentId: input.parentId,
		reason: input.reason,
		gitRestoreRef: requiredGitRestoreRef(input.gitRestoreRef),
		headRef: input.headRef,
		refs: input.refs,
		createdAt: input.createdAt,
		data: input.data,
	});
	const closedRecords = [...records, closeRecord];
	const stub = buildTraceRetentionStub({
		records: closedRecords,
		gitRestoreRef: closeRecord.gitRestoreRef,
		headRef: closeRecord.headRef,
	});
	const releaseNotes = buildTraceCloseReleaseNotes(closedRecords);
	const append =
		mode === "append"
			? await appendRuntimeTraceRecord(
					requiredRepoRoot(input.repoRoot),
					closeRecord,
					requiredExpectedBytes(input.expectedBytes),
				)
			: undefined;
	return {
		action: "close",
		mode,
		stub,
		closeRecord,
		releaseNotes,
		refs: closeRecord.refs,
		...(append ? { append } : {}),
	};
}

async function compactResult(
	input: RunWikiArchiveInput,
	mode: WikiArchiveMode,
): Promise<RunWikiArchiveResult> {
	const records = requiredRecords(input.records);
	const plan = buildTraceArchiveCompactPlan({
		records,
		id: input.closeId,
		parentId: input.parentId,
		reason: input.reason,
		gitRestoreRef: requiredGitRestoreRef(input.gitRestoreRef),
		headRef: input.headRef,
		refs: input.refs,
		createdAt: input.createdAt,
		data: input.data,
		summary: input.summary,
	});
	const releaseNotes = buildTraceCloseReleaseNotes(
		records.some((record) => record.type === "trace_close")
			? records
			: [...records, plan.closeRecord],
	);
	const append =
		mode === "append"
			? await replaceTraceRecords(
					requiredRepoRoot(input.repoRoot),
					plan.compactRecords,
					requiredExpectedBytes(input.expectedBytes),
				)
			: undefined;
	return {
		action: "compact",
		mode,
		stub: plan.stub,
		closeRecord: plan.closeRecord,
		releaseNotes,
		compactRecords: plan.compactRecords,
		refs: plan.refs,
		...(append ? { append } : {}),
	};
}

function hydrationResult(
	input: RunWikiArchiveInput,
	mode: WikiArchiveMode,
): RunWikiArchiveResult {
	assertPreviewOnly(mode, "hydrate");
	const hydration = buildTraceHydrationPlan({
		stub: requiredStub(input.stub),
		archivedRecords: requiredArchivedRecords(input.archivedRecords),
	});
	return {
		action: "hydrate",
		mode,
		hydration,
		refs: hydration.refs,
	};
}

function assertPreviewOnly(mode: WikiArchiveMode, action: string): void {
	if (mode !== "preview") {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "invalid_input",
			field: "mode",
			message: `wiki_archive ${action} only supports preview mode.`,
			data: { action, mode },
		});
	}
}

async function closeRecords(input: RunWikiArchiveInput): Promise<TraceRecord[]> {
	if (input.records) return requiredRecords(input.records);
	if (!input.traceId) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "invalid_input",
			field: "traceId",
			message: "wiki_archive close requires records or traceId.",
		});
	}
	const repoRoot = requiredRepoRoot(input.repoRoot);
	return readTraceFile(join(repoRoot, traceFilePath(input.traceId)));
}

function requiredRecords(records: TraceRecord[] | undefined): TraceRecord[] {
	if (!records?.length) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "missing_required",
			field: "records",
			message: "wiki_archive requires records.",
		});
	}
	return records;
}

function requiredArchivedRecords(
	records: TraceRecord[] | undefined,
): TraceRecord[] {
	if (!records?.length) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "missing_required",
			field: "archivedRecords",
			message: "wiki_archive hydrate requires archivedRecords.",
		});
	}
	return records;
}

function requiredStub(
	stub: TraceRetentionStub | undefined,
): TraceRetentionStub {
	if (!stub) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "missing_required",
			field: "stub",
			message: "wiki_archive hydrate requires stub.",
		});
	}
	return stub;
}

function requiredGitRestoreRef(value: string | undefined): string {
	if (!value?.trim()) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "missing_required",
			field: "gitRestoreRef",
			message: "wiki_archive requires gitRestoreRef.",
		});
	}
	return value;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "missing_required",
			field: "repoRoot",
			message: "wiki_archive append mode requires repoRoot.",
		});
	}
	return value;
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw createCodewikiOperationError({
			operation: "wiki_archive",
			code: "invalid_input",
			field: "expectedBytes",
			message: "wiki_archive append mode requires expectedBytes >= 0.",
			data: { value },
		});
	}
	return value;
}
