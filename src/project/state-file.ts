import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTraceFileSnapshot } from "../traces/reader.ts";
import { isTraceId } from "../traces/schema.ts";
import type { TraceRecord } from "../traces/types.ts";

export async function readProjectTraceRecords(
	repoRoot: string,
): Promise<TraceRecord[]> {
	const snapshot = await readProjectTraceFiles(repoRoot);
	return snapshot.records;
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
			.sort((left, right) => left.localeCompare(right))
			.map(async (file) => {
				const snapshot = await readTraceFileSnapshot(join(tracesDir, file));
				return {
					records: snapshot.records,
					expectedBytes: snapshot.bytes,
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
