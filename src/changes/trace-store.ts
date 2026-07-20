import { createHash } from "node:crypto";
import { mkdir, open, readdir, rm, stat, truncate } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readTraceFileSnapshot } from "../traces/reader.ts";
import { isTraceId, traceFilePath } from "../traces/schema.ts";
import type { TraceRecord } from "../traces/types.ts";
import { appendTraceRecords } from "../traces/append.ts";
import { parseChangeRecord, type ChangeRecord } from "./records.ts";
import {
	ChangeStoreConflictError,
	type ChangeQuery,
	type ChangeStore,
	type ChangeStoreSnapshot,
	type ChangeWriteInput,
	type ChangeWriteResult,
} from "./store.ts";
import { stableJson } from "./digest.ts";
import {
	changeRecordFromTrace,
	changeTraceId,
	createChangeRecordTraceEvent,
	createChangeTraceBatch,
	createChangeTraceHead,
	type ChangeTraceOperation,
} from "./change-trace.ts";

const LOCK_WAIT_ATTEMPTS = 100;
const LOCK_WAIT_MS = 25;
const LOCK_STALE_MS = 30_000;

interface ChangeTraceStoreOptions {
	repoRoot: string;
}

interface LoadedChangeTrace {
	path: string;
	bytes: number;
	records: TraceRecord[];
	changeRecord: ChangeRecord;
}

interface RollbackPoint {
	path: string;
	bytes: number;
}

/**
 * Canonical Change store backed by one append-only JSONL Change Trace per Change.
 */
export class ChangeTraceStore implements ChangeStore {
	readonly repoRoot: string;

	constructor(options: ChangeTraceStoreOptions) {
		this.repoRoot = options.repoRoot;
	}

	async read(): Promise<ChangeStoreSnapshot> {
		const traces = await this.loadChangeTraces();
		const records = traces
			.map((trace) => trace.changeRecord)
			.sort((left, right) => left.change.id.localeCompare(right.change.id));
		return {
			head: changeTraceStoreHead(records),
			records,
		};
	}

	async get(changeId: string): Promise<ChangeRecord | undefined> {
		const trace = await this.loadChangeTrace(changeId);
		return trace?.changeRecord;
	}

	async query(query: ChangeQuery = {}): Promise<ChangeRecord[]> {
		const normalizedText = query.text?.trim().toLowerCase();
		const snapshot = await this.read();
		return snapshot.records.filter((record) => {
			if (query.status && record.change.status !== query.status) return false;
			if (query.type && record.change.classification.type !== query.type)
				return false;
			if (query.origin && record.change.provenance.origin !== query.origin)
				return false;
			if (!normalizedText) return true;
			return searchableText(record).includes(normalizedText);
		});
	}

	async write(input: ChangeWriteInput): Promise<ChangeWriteResult> {
		if (!input.records.length)
			throw new Error("Change Trace write needs records.");
		return this.withWriteLock(async () => {
			const snapshot = await this.read();
			if (snapshot.head !== input.expectedHead) {
				throw new ChangeStoreConflictError(input.expectedHead, snapshot.head);
			}
			const records = input.records.map(parseChangeRecord);
			assertUniqueRecordIds(records);
			assertRecordRevisions(records, snapshot.records);
			const currentById = new Map(
				snapshot.records.map((record) => [record.change.id, record]),
			);
			const batch = createChangeTraceBatch(
				records,
				`${snapshot.head || "empty"}\n${input.actor}\n${input.message}`,
			);
			const rollbackPoints: RollbackPoint[] = [];
			const appendRecordAt = async (index: number): Promise<void> => {
				const record = records[index];
				if (!record) return;
				const loaded = await this.loadChangeTrace(record.change.id);
				const existingRecords = loaded?.records || [];
				const previousBytes = loaded?.bytes || 0;
				const operation = changeTraceOperation(
					currentById.get(record.change.id),
					record,
				);
				const event = createChangeRecordTraceEvent({
					records: existingRecords,
					record,
					operation,
					actor: input.actor,
					createdAt: changeRecordTimestamp(record),
					message: input.message,
					batch,
				});
				const appendRecords = loaded
					? [event]
					: [createChangeTraceHead(record), event];
				const path = join(
					this.repoRoot,
					traceFilePath(changeTraceId(record.change.id)),
				);
				rollbackPoints.push({ path, bytes: previousBytes });
				await appendTraceRecords(this.repoRoot, appendRecords, previousBytes);
				await appendRecordAt(index + 1);
			};
			try {
				await appendRecordAt(0);
			} catch (error) {
				await rollbackWrites(rollbackPoints);
				throw error;
			}
			const next = await this.read();
			if (!next.head)
				throw new Error("Change Trace write produced no store head.");
			return {
				previousHead: snapshot.head,
				head: next.head,
				writtenChangeIds: records
					.map((record) => record.change.id)
					.sort((left, right) => left.localeCompare(right)),
			};
		});
	}

	private async loadChangeTraces(): Promise<LoadedChangeTrace[]> {
		const directory = join(this.repoRoot, ".codewiki", "traces");
		let files: string[];
		try {
			files = await readdir(directory);
		} catch (error) {
			if (isNotFound(error)) return [];
			throw error;
		}
		const loaded = await Promise.all(
			files
				.filter((file) => file.endsWith(".jsonl"))
				.filter((file) => isTraceId(file.slice(0, -".jsonl".length)))
				.sort((left, right) => left.localeCompare(right))
				.map(async (file) => {
					const path = join(directory, file);
					const { records, bytes } = await readTraceFileSnapshot(path);
					const changeRecord = changeRecordFromTrace(records);
					return changeRecord
						? { path, bytes, records, changeRecord }
						: undefined;
				}),
		);
		return loaded.filter(
			(trace): trace is LoadedChangeTrace => trace !== undefined,
		);
	}

	private async loadChangeTrace(
		changeId: string,
	): Promise<LoadedChangeTrace | undefined> {
		const path = join(this.repoRoot, traceFilePath(changeTraceId(changeId)));
		let snapshot: Awaited<ReturnType<typeof readTraceFileSnapshot>>;
		try {
			snapshot = await readTraceFileSnapshot(path);
		} catch (error) {
			if (isNotFound(error)) return undefined;
			throw error;
		}
		const changeRecord = changeRecordFromTrace(snapshot.records);
		if (!changeRecord) {
			throw new Error(`Trace for ${changeId} does not contain Change state.`);
		}
		return { path, ...snapshot, changeRecord };
	}

	private async withWriteLock<T>(run: () => Promise<T>): Promise<T> {
		const lockPath = join(
			this.repoRoot,
			".codewiki",
			"runtime",
			"locks",
			"change-traces.lock",
		);
		await mkdir(dirname(lockPath), { recursive: true });
		for (let attempt = 0; attempt < LOCK_WAIT_ATTEMPTS; attempt += 1) {
			try {
				const handle = await open(lockPath, "wx", 0o600);
				try {
					await handle.writeFile(
						`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
						"utf8",
					);
					return await run();
				} finally {
					await handle.close();
					await rm(lockPath, { force: true });
				}
			} catch (error) {
				if (!isAlreadyExists(error)) throw error;
				if (await staleLock(lockPath)) {
					await rm(lockPath, { force: true });
					continue;
				}
				await delay(LOCK_WAIT_MS);
			}
		}
		throw new Error("Timed out waiting for Change Trace write lock.");
	}
}

function changeTraceStoreHead(records: ChangeRecord[]): string | null {
	if (records.length === 0) return null;
	const normalized = records
		.map(parseChangeRecord)
		.sort((left, right) => left.change.id.localeCompare(right.change.id));
	return createHash("sha1").update(stableJson(normalized)).digest("hex");
}

function assertRecordRevisions(
	incoming: ChangeRecord[],
	current: ChangeRecord[],
): void {
	const currentById = new Map(
		current.map((record) => [record.change.id, record]),
	);
	for (const record of incoming) {
		const existing = currentById.get(record.change.id);
		if (!existing && record.recordRevision !== 1) {
			throw new Error(
				`New Change ${record.change.id} must start at record revision 1.`,
			);
		}
		if (existing && record.recordRevision !== existing.recordRevision + 1) {
			throw new Error(
				`Change ${record.change.id} record revision must advance from ${existing.recordRevision} to ${existing.recordRevision + 1}.`,
			);
		}
	}
}

function assertUniqueRecordIds(records: ChangeRecord[]): void {
	const ids = records.map((record) => record.change.id);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Change Trace write contains duplicate Change ids.");
	}
}

function changeTraceOperation(
	current: ChangeRecord | undefined,
	next: ChangeRecord,
): ChangeTraceOperation {
	if (!current) return "create";
	if (current.change.status !== next.change.status) {
		if (next.change.status === "accepted") return "accept";
		if (next.change.status === "deferred") return "defer";
		if (next.change.status === "rejected") return "reject";
		if (next.change.status === "withdrawn") return "withdraw";
	}
	const addedRelations = next.links
		.slice(current.links.length)
		.map((link) => link.relation);
	if (addedRelations.some((relation) => relation.startsWith("merged_"))) {
		return "merge";
	}
	if (addedRelations.some((relation) => relation.startsWith("split_"))) {
		return "split";
	}
	if (next.links.length > current.links.length) return "link";
	if (
		next.change.evidence.sourceRefs.length >
			current.change.evidence.sourceRefs.length ||
		next.change.evidence.proofRefs.length >
			current.change.evidence.proofRefs.length
	) {
		return "add_evidence";
	}
	return "revise";
}

function changeRecordTimestamp(record: ChangeRecord): string {
	return (
		record.change.lastStatusTransition?.changedAt ||
		record.change.provenance.updatedAt
	);
}

async function rollbackWrites(points: RollbackPoint[]): Promise<void> {
	for (let index = points.length - 1; index >= 0; index -= 1) {
		const point = points[index];
		if (!point) continue;
		try {
			if (point.bytes === 0) await rm(point.path, { force: true });
			else await truncate(point.path, point.bytes);
		} catch {
			// Preserve original write failure. WorkState will expose malformed partial state.
		}
	}
}

async function staleLock(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		return Date.now() - info.mtimeMs > LOCK_STALE_MS;
	} catch (error) {
		if (isNotFound(error)) return false;
		throw error;
	}
}

function searchableText(record: ChangeRecord): string {
	return [
		record.change.id,
		record.change.intent.question,
		record.change.intent.currentState,
		record.change.intent.desiredState,
		record.change.intent.rationale,
		...record.change.intent.nonGoals,
		...record.change.intent.alternatives,
		...record.change.classification.affectedLayers,
		...record.change.classification.targetRefs,
		...record.change.knowledge.topicRefs,
		...record.change.knowledge.propagationRefs,
		...record.change.outcome.successSignals,
		...record.change.outcome.evidenceExpectations,
		...record.change.evidence.sourceRefs,
		...record.change.evidence.proofRefs,
	]
		.join("\n")
		.toLowerCase();
}

function isNotFound(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

function isAlreadyExists(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "EEXIST"
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
