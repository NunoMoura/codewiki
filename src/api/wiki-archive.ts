import { appendTraceRecord, type AppendTraceResult } from "../traces/append.ts";
import {
	buildTraceHydrationPlan,
	buildTraceRetentionStub,
	createTraceCloseRecord,
	traceRetentionRefs,
	type TraceHydrationPlan,
	type TraceRetentionStub,
} from "../traces/retention.ts";
import type { TraceClose, TraceRecord } from "../traces/types.ts";

export type WikiArchiveMode = "preview" | "append";
export type WikiArchiveAction = "retention_stub" | "close" | "hydrate";

export interface RunWikiArchiveInput {
	action?: WikiArchiveAction;
	mode?: WikiArchiveMode;
	records?: TraceRecord[];
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
	repoRoot?: string;
	expectedBytes?: number;
}

export interface RunWikiArchiveResult {
	action: WikiArchiveAction;
	mode: WikiArchiveMode;
	stub?: TraceRetentionStub;
	closeRecord?: TraceClose;
	hydration?: TraceHydrationPlan;
	refs: string[];
	append?: AppendTraceResult;
}

export async function runWikiArchive(
	input: RunWikiArchiveInput,
): Promise<RunWikiArchiveResult> {
	const action = input.action || "retention_stub";
	const mode = input.mode || "preview";
	if (action === "retention_stub") return retentionStubResult(input, mode);
	if (action === "close") return closeResult(input, mode);
	if (action === "hydrate") return hydrationResult(input, mode);
	throw new Error(`Unsupported wiki_archive action ${action}.`);
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
	return { action: "retention_stub", mode, stub, refs: traceRetentionRefs(stub) };
}

async function closeResult(
	input: RunWikiArchiveInput,
	mode: WikiArchiveMode,
): Promise<RunWikiArchiveResult> {
	const records = requiredRecords(input.records);
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
	const stub = buildTraceRetentionStub({
		records: [...records, closeRecord],
		gitRestoreRef: closeRecord.gitRestoreRef,
		headRef: closeRecord.headRef,
	});
	const append =
		mode === "append"
			? await appendTraceRecord(
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
		refs: closeRecord.refs,
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
		throw new Error(`wiki_archive ${action} only supports preview mode.`);
	}
}

function requiredRecords(records: TraceRecord[] | undefined): TraceRecord[] {
	if (!records?.length) throw new Error("wiki_archive requires records.");
	return records;
}

function requiredArchivedRecords(
	records: TraceRecord[] | undefined,
): TraceRecord[] {
	if (!records?.length) {
		throw new Error("wiki_archive hydrate requires archivedRecords.");
	}
	return records;
}

function requiredStub(stub: TraceRetentionStub | undefined): TraceRetentionStub {
	if (!stub) throw new Error("wiki_archive hydrate requires stub.");
	return stub;
}

function requiredGitRestoreRef(value: string | undefined): string {
	if (!value?.trim()) throw new Error("wiki_archive requires gitRestoreRef.");
	return value;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) throw new Error("wiki_archive append mode requires repoRoot.");
	return value;
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new Error("wiki_archive append mode requires expectedBytes >= 0.");
	}
	return value;
}
