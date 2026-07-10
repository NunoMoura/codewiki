import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildWikiState, type WikiStateSnapshot } from "../api/state.ts";
import {
	defaultReviewEvidenceCache,
	type ReviewEvidenceCacheReader,
} from "../implementation/review/index.ts";
import { parseTraceText } from "../traces/reader.ts";
import { isTraceId } from "../traces/schema.ts";
import type { TraceRecord } from "../traces/types.ts";

export interface BuildProjectWikiStateInput {
	repoRoot: string;
	traceId?: string;
	generatedAt?: string;
	reviewEvidenceCache?: ReviewEvidenceCacheReader;
	reviewEvidenceMaxAgeMs?: number;
	traceFiles?: ProjectTraceFiles;
}

export async function buildProjectWikiState(
	input: BuildProjectWikiStateInput,
): Promise<WikiStateSnapshot> {
	const traceFiles =
		input.traceFiles || (await readProjectTraceFiles(input.repoRoot));
	return buildWikiState({
		records: traceFiles.records,
		traceId: input.traceId,
		generatedAt: input.generatedAt,
		expectedBytesByTrace: traceFiles.expectedBytesByTrace,
		reviewEvidenceCache:
			input.reviewEvidenceCache || defaultReviewEvidenceCache,
		reviewEvidenceMaxAgeMs: input.reviewEvidenceMaxAgeMs,
	});
}

export async function readProjectTraceRecords(
	repoRoot: string,
): Promise<TraceRecord[]> {
	return (await readProjectTraceFiles(repoRoot)).records;
}

export interface ProjectTraceFiles {
	records: TraceRecord[];
	expectedBytesByTrace: Record<string, number>;
}

export async function readProjectTraceFiles(
	repoRoot: string,
): Promise<ProjectTraceFiles> {
	const tracesDir = join(repoRoot, ".codewiki", "traces");
	let files: string[];
	try {
		files = await readdir(tracesDir);
	} catch (error) {
		if (isNotFound(error)) return { records: [], expectedBytesByTrace: {} };
		throw error;
	}
	const traces = await Promise.all(
		files
			.filter((file) => file.endsWith(".jsonl"))
			.filter((file) => isTraceId(file.slice(0, -".jsonl".length)))
			.sort()
			.map(async (file) => {
				const text = await readFile(join(tracesDir, file), "utf8");
				const records = parseTraceText(text);
				return {
					records,
					expectedBytes: Buffer.byteLength(text, "utf8"),
				};
			}),
	);
	return {
		records: traces.flatMap((trace) => trace.records),
		expectedBytesByTrace: Object.fromEntries(
			traces.flatMap((trace) => {
				const traceId = trace.records[0]?.traceId;
				return traceId ? [[traceId, trace.expectedBytes]] : [];
			}),
		),
	};
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}
