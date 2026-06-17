import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildWikiState, type WikiStateSnapshot } from "../api/state.ts";
import { parseSourceMapYaml } from "../knowledge/source-map.ts";
import { readTraceFile } from "../traces/reader.ts";
import type { TraceRecord } from "../traces/types.ts";

export interface BuildProjectWikiStateInput {
	repoRoot: string;
	traceId?: string;
	generatedAt?: string;
	sourcePaths?: string[];
}

export async function buildProjectWikiState(
	input: BuildProjectWikiStateInput,
): Promise<WikiStateSnapshot> {
	return buildWikiState({
		records: await readProjectTraceRecords(input.repoRoot),
		traceId: input.traceId,
		generatedAt: input.generatedAt,
		sourceMap: await readProjectSourceMap(input.repoRoot),
		sourcePaths: input.sourcePaths || [],
	});
}

export async function readProjectTraceRecords(
	repoRoot: string,
): Promise<TraceRecord[]> {
	const tracesDir = join(repoRoot, ".codewiki", "traces");
	let files: string[];
	try {
		files = await readdir(tracesDir);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
	const records = await Promise.all(
		files
			.filter((file) => file.endsWith(".jsonl"))
			.sort()
			.map((file) => readTraceFile(join(tracesDir, file))),
	);
	return records.flat();
}

export async function readProjectSourceMap(repoRoot: string) {
	const sourceMapPath = join(
		repoRoot,
		".codewiki",
		"kb",
		"system",
		"source-map.yaml",
	);
	try {
		return parseSourceMapYaml(await readFile(sourceMapPath, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}
