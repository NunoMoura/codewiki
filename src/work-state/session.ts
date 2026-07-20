import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readTraceFileSnapshot, readTraceFileTail } from "../traces/reader.ts";
import { isTraceId } from "../traces/schema.ts";
import type { TraceRecord } from "../traces/types.ts";
import { buildWorkState } from "./projector.ts";
import type { WorkState } from "./types.ts";

interface CachedTrace {
	path: string;
	bytes: number;
	mtimeMs: number;
	device: number;
	inode: number;
	endsWithNewline: boolean;
	records: TraceRecord[];
}

export interface WorkStateRefreshResult {
	workState: WorkState;
	records: TraceRecord[];
	expectedBytesByTrace: Record<string, number>;
	loadedTraceIds: string[];
	tailedTraceIds: string[];
	reusedTraceIds: string[];
	removedTraceIds: string[];
}

/**
 * Long-lived, Pi-style JSONL reader: load each trace once, retain an in-memory
 * index, then parse only appended LF-delimited records on later refreshes.
 */
export class WorkStateSession {
	readonly repoRoot: string;
	private readonly traces = new Map<string, CachedTrace>();

	constructor(repoRoot: string) {
		this.repoRoot = repoRoot;
	}

	async refresh(generatedAt?: string): Promise<WorkStateRefreshResult> {
		const directory = join(this.repoRoot, ".codewiki", "traces");
		const files = await traceFiles(directory);
		const currentIds = new Set(files.map(traceIdFromFile));
		const removedTraceIds = [...this.traces.keys()]
			.filter((traceId) => !currentIds.has(traceId))
			.sort(compareText);
		for (const traceId of removedTraceIds) this.traces.delete(traceId);

		const loadedTraceIds: string[] = [];
		const tailedTraceIds: string[] = [];
		const reusedTraceIds: string[] = [];
		for (const file of files) {
			const traceId = traceIdFromFile(file);
			const path = join(directory, file);
			const metadata = await stat(path);
			const cached = this.traces.get(traceId);
			if (
				cached &&
				cached.bytes === metadata.size &&
				cached.mtimeMs === metadata.mtimeMs &&
				cached.device === metadata.dev &&
				cached.inode === metadata.ino
			) {
				reusedTraceIds.push(traceId);
				continue;
			}
			if (
				cached?.endsWithNewline &&
				cached.device === metadata.dev &&
				cached.inode === metadata.ino &&
				metadata.size > cached.bytes
			) {
				const tail = await readTraceFileTail(path, cached.bytes);
				this.traces.set(traceId, {
					path,
					bytes: cached.bytes + tail.bytes,
					mtimeMs: metadata.mtimeMs,
					device: metadata.dev,
					inode: metadata.ino,
					endsWithNewline: tail.endsWithNewline,
					records: [...cached.records, ...tail.records],
				});
				tailedTraceIds.push(traceId);
				continue;
			}
			const snapshot = await readTraceFileSnapshot(path);
			this.traces.set(traceId, {
				path,
				bytes: snapshot.bytes,
				mtimeMs: metadata.mtimeMs,
				device: metadata.dev,
				inode: metadata.ino,
				endsWithNewline: snapshot.endsWithNewline,
				records: snapshot.records,
			});
			loadedTraceIds.push(traceId);
		}

		const records = [...this.traces.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.flatMap(([, trace]) => trace.records);
		return {
			workState: buildWorkState({
				records,
				...(generatedAt ? { generatedAt } : {}),
			}),
			records,
			expectedBytesByTrace: Object.fromEntries(
				[...this.traces.entries()].map(([traceId, trace]) => [
					traceId,
					trace.bytes,
				]),
			),
			loadedTraceIds,
			tailedTraceIds,
			reusedTraceIds,
			removedTraceIds,
		};
	}

	invalidate(traceId?: string): void {
		if (traceId) {
			this.traces.delete(traceId);
			return;
		}
		this.traces.clear();
	}
}

async function traceFiles(directory: string): Promise<string[]> {
	let files: string[];
	try {
		files = await readdir(directory);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
	return files
		.filter((file) => file.endsWith(".jsonl"))
		.filter((file) => isTraceId(traceIdFromFile(file)))
		.sort(compareText);
}

function traceIdFromFile(file: string): string {
	return file.slice(0, -".jsonl".length);
}

function isNotFound(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
