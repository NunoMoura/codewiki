import {
	buildTraceRetentionStub,
	traceRetentionRefs,
	type TraceRetentionStub,
} from "../traces/retention.ts";
import type { TraceRecord } from "../traces/types.ts";

export type WikiArchiveMode = "preview";
export type WikiArchiveAction = "retention_stub";

export interface RunWikiArchiveInput {
	action?: WikiArchiveAction;
	mode?: WikiArchiveMode;
	records: TraceRecord[];
	gitRestoreRef: string;
	headRef?: string;
}

export interface RunWikiArchiveResult {
	action: WikiArchiveAction;
	mode: WikiArchiveMode;
	stub: TraceRetentionStub;
	refs: string[];
}

export function runWikiArchive(
	input: RunWikiArchiveInput,
): RunWikiArchiveResult {
	const action = input.action || "retention_stub";
	if (action !== "retention_stub") {
		throw new Error(`Unsupported wiki_archive action ${action}.`);
	}
	const mode = input.mode || "preview";
	const stub = buildTraceRetentionStub({
		records: input.records,
		gitRestoreRef: input.gitRestoreRef,
		headRef: input.headRef,
	});
	return { action, mode, stub, refs: traceRetentionRefs(stub) };
}
