import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTraceFile } from "../traces/reader.ts";
import { isTraceId } from "../traces/schema.ts";
import type { TraceRecord } from "../traces/types.ts";
import { buildWorkState } from "./projector.ts";
import type { WorkState } from "./types.ts";

interface BuildProjectWorkStateInput {
	repoRoot: string;
	generatedAt?: string;
}

export async function buildProjectWorkState(
	input: BuildProjectWorkStateInput,
): Promise<WorkState> {
	return buildWorkState({
		records: await readProjectTraceRecords(input.repoRoot),
		...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
	});
}

export async function readProjectTraceRecords(
	repoRoot: string,
): Promise<TraceRecord[]> {
	const directory = join(repoRoot, ".codewiki", "traces");
	let files: string[];
	try {
		files = await readdir(directory);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
	const traces = await Promise.all(
		files
			.filter((file) => file.endsWith(".jsonl"))
			.filter((file) => isTraceId(file.slice(0, -".jsonl".length)))
			.sort((left, right) => left.localeCompare(right))
			.map((file) => readTraceFile(join(directory, file))),
	);
	return traces.flat();
}

function isNotFound(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
