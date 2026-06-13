import type {
	TailCheckpoint,
	TraceClose,
	TraceEvent,
	TraceHead,
	TraceRecord,
} from "./types.ts";

export interface TraceReplayState {
	head: TraceHead;
	events: TraceEvent[];
	checkpoints: TailCheckpoint[];
	close?: TraceClose;
	closed: boolean;
	latestCheckpoint?: TailCheckpoint;
	lastRecordId: string;
	lastSequence: number;
	refs: string[];
}

export function replayTrace(records: TraceRecord[]): TraceReplayState {
	const head = records[0];
	if (!head || head.type !== "trace_head") {
		throw new Error("Trace replay requires trace_head as the first record.");
	}
	const events: TraceEvent[] = [];
	const checkpoints: TailCheckpoint[] = [];
	let close: TraceClose | undefined;
	const seenRecordIds = new Set<string>();
	let lastSequence = 0;
	let lastRecordId = head.traceId;
	for (const record of records.slice(1)) {
		if (record.traceId !== head.traceId) {
			throw new Error(
				`Trace record ${traceRecordLabel(record)} belongs to ${record.traceId}, not ${head.traceId}.`,
			);
		}
		if (record.type === "trace_head")
			throw new Error("Trace file contains multiple trace_head records.");
		if (close) throw new Error("Trace file contains records after trace_close.");
		if (record.type === "trace_event") {
			if (seenRecordIds.has(record.id))
				throw new Error(`Duplicate trace record id: ${record.id}.`);
			if (record.sequence <= lastSequence) {
				throw new Error(
					`Trace event ${record.id} sequence must increase after ${lastSequence}.`,
				);
			}
			assertKnownParent(record, seenRecordIds);
			seenRecordIds.add(record.id);
			events.push(record);
			lastSequence = record.sequence;
			lastRecordId = record.id;
		}
		if (record.type === "tail_checkpoint") {
			if (seenRecordIds.has(record.id))
				throw new Error(`Duplicate trace record id: ${record.id}.`);
			assertKnownParent(record, seenRecordIds);
			seenRecordIds.add(record.id);
			checkpoints.push(record);
			lastRecordId = record.id;
		}
		if (record.type === "trace_close") {
			if (seenRecordIds.has(record.id))
				throw new Error(`Duplicate trace record id: ${record.id}.`);
			assertKnownParent(record, seenRecordIds);
			seenRecordIds.add(record.id);
			close = record;
			lastRecordId = record.id;
		}
	}
	return {
		head,
		events,
		checkpoints,
		close,
		closed: Boolean(close),
		latestCheckpoint: checkpoints.at(-1),
		lastRecordId,
		lastSequence,
		refs: unique(events.flatMap((event) => event.refs)),
	};
}

export function replayEvents(records: TraceRecord[]): TraceEvent[] {
	return records
		.filter((record): record is TraceEvent => record.type === "trace_event")
		.sort((left, right) => left.sequence - right.sequence);
}

export function latestTailCheckpoint(
	records: TraceRecord[],
): TailCheckpoint | undefined {
	return records
		.filter(
			(record): record is TailCheckpoint => record.type === "tail_checkpoint",
		)
		.at(-1);
}

function assertKnownParent(
	record: TraceEvent | TailCheckpoint | TraceClose,
	seenRecordIds: Set<string>,
): void {
	if (record.parentId === null) return;
	if (!seenRecordIds.has(record.parentId)) {
		throw new Error(
			`Trace record ${record.id} has unknown parent ${record.parentId}.`,
		);
	}
}

function traceRecordLabel(record: TraceRecord): string {
	return record.type === "trace_head" ? record.traceId : record.id;
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
