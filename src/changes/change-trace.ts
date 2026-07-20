import { createHash } from "node:crypto";
import { changeContentDigest, stableJson } from "./digest.ts";
import { parseChangeRecord, type ChangeRecord } from "./records.ts";
import { normalizeTraceRefs } from "../traces/refs.ts";
import { isChangeId } from "../traces/schema.ts";
import type {
	DecisionTraceEventName,
	TraceEvent,
	TraceHead,
	TraceRecord,
} from "../traces/types.ts";
import { createTraceHead } from "../traces/writer.ts";

const CHANGE_TRACE_EVENT_SCHEMA_VERSION = 1;

export type ChangeTraceOperation =
	| "create"
	| "revise"
	| "add_evidence"
	| "link"
	| "merge"
	| "split"
	| "defer"
	| "reject"
	| "withdraw"
	| "accept";

interface ChangeTraceBatch {
	id: string;
	digest: string;
	changeIds: string[];
}

interface CreateChangeRecordTraceEventInput {
	records: TraceRecord[];
	record: ChangeRecord;
	operation: ChangeTraceOperation;
	actor: string;
	createdAt: string;
	message: string;
	batch?: ChangeTraceBatch;
	additionalRefs?: string[];
	additionalOutput?: Record<string, unknown>;
}

interface ChangeRecordTraceEventOutput {
	[key: string]: unknown;
	schemaVersion: typeof CHANGE_TRACE_EVENT_SCHEMA_VERSION;
	operation: ChangeTraceOperation;
	actor: string;
	message: string;
	changeRecord: ChangeRecord;
	changeDigest: string;
	batch?: ChangeTraceBatch;
}

export function changeTraceId(changeId: string): string {
	const normalized = changeId.trim();
	if (!isChangeId(normalized))
		throw new Error(`Invalid Change id: ${changeId}`);
	return `TRACE-${normalized}`;
}

function changeTraceReference(record: ChangeRecord): string {
	return `change:${record.change.id}@${record.change.revision}`;
}

export function createChangeTraceHead(
	record: ChangeRecord,
	createdAt = record.change.provenance.createdAt,
): TraceHead {
	const parsed = parseChangeRecord(record);
	return createTraceHead({
		traceId: changeTraceId(parsed.change.id),
		changeId: parsed.change.id,
		title: parsed.change.intent.question,
		createdAt,
		origin: {
			kind: parsed.change.provenance.origin,
			...(parsed.change.provenance.discoveredWhile?.traceId
				? {
						parentTraceId: parsed.change.provenance.discoveredWhile.traceId,
					}
				: {}),
			refs: normalizeTraceRefs([
				...parsed.change.classification.targetRefs,
				...parsed.change.evidence.sourceRefs,
				...parsed.change.evidence.proofRefs,
			]),
		},
	});
}

export function createChangeRecordTraceEvent(
	input: CreateChangeRecordTraceEventInput,
): TraceEvent {
	const record = parseChangeRecord(input.record);
	const traceId = changeTraceId(record.change.id);
	assertChangeTraceIdentity(input.records, record.change.id, traceId);
	const events = input.records.filter(
		(candidate): candidate is TraceEvent => candidate.type === "trace_event",
	);
	const parent = lastTraceRecordWithId(input.records);
	const eventName = changeTraceEventName(input.operation);
	const changeDigest = changeContentDigest(record.change);
	const output: ChangeRecordTraceEventOutput = {
		...(input.additionalOutput || {}),
		schemaVersion: CHANGE_TRACE_EVENT_SCHEMA_VERSION,
		operation: input.operation,
		actor: input.actor.trim(),
		message: input.message.trim(),
		changeRecord: record,
		changeDigest,
		...(input.batch ? { batch: normalizedBatch(input.batch) } : {}),
	};
	return {
		type: "trace_event",
		id: changeTraceEventId(record, input.operation),
		parentId: parent?.id || null,
		traceId,
		sequence: Math.max(0, ...events.map((event) => event.sequence)) + 1,
		loop: "decision",
		event: eventName,
		refs: normalizeTraceRefs([
			changeTraceReference(record),
			changeDigest,
			...record.change.classification.targetRefs,
			...record.change.evidence.sourceRefs,
			...record.change.evidence.proofRefs,
			...(input.additionalRefs || []),
		]),
		createdAt: input.createdAt,
		data: {
			iteration: record.recordRevision,
			trigger: `wiki_change.${input.operation}`,
			output,
			exit: {
				status: decisionExitStatus(record),
				conditions: [],
				nextAction: decisionNextAction(record),
			},
			progress: {
				changedRefs: [changeTraceReference(record), changeDigest],
			},
		},
	};
}

export function changeRecordFromTrace(
	records: TraceRecord[],
): ChangeRecord | undefined {
	const head = records[0];
	if (!head || head.type !== "trace_head" || !head.changeId) return undefined;
	const event = lastChangeRecordEvent(records);
	if (!event) return undefined;
	const record = changeRecordOutput(event);
	if (!record) return undefined;
	if (record.change.id !== head.changeId) {
		throw new Error(
			`Change Trace ${head.traceId} binds ${head.changeId} but event ${event.id} carries ${record.change.id}.`,
		);
	}
	return record;
}

export function changeRecordOutput(
	event: TraceEvent,
): ChangeRecord | undefined {
	const output = objectValue(event.data?.output);
	if (!output || output.schemaVersion !== CHANGE_TRACE_EVENT_SCHEMA_VERSION) {
		return undefined;
	}
	try {
		return parseChangeRecord(output.changeRecord);
	} catch {
		return undefined;
	}
}

export function createChangeTraceBatch(
	records: ChangeRecord[],
	seed: string,
): ChangeTraceBatch {
	const parsed = records
		.map(parseChangeRecord)
		.sort((left, right) => left.change.id.localeCompare(right.change.id));
	const digest = `sha256:${createHash("sha256")
		.update(stableJson(parsed))
		.digest("hex")}`;
	return {
		id: `CTB-${createHash("sha256")
			.update(`${seed}\n${digest}`)
			.digest("hex")
			.slice(0, 20)}`,
		digest,
		changeIds: parsed.map((record) => record.change.id),
	};
}

function changeTraceEventName(
	operation: ChangeTraceOperation,
): DecisionTraceEventName {
	if (operation === "create") return "change_received";
	if (operation === "accept") return "change_approved";
	if (operation === "defer") return "change_deferred";
	if (operation === "reject") return "change_rejected";
	if (operation === "withdraw") return "change_withdrawn";
	return "change_revised";
}

export function changeTraceEventId(
	record: ChangeRecord,
	operation: ChangeTraceOperation,
): string {
	return `evt-${record.change.id}-${String(record.recordRevision).padStart(6, "0")}-${operation}`;
}

function decisionExitStatus(record: ChangeRecord): "continue" | "exit" {
	return ["accepted", "deferred", "rejected", "withdrawn"].includes(
		record.change.status,
	)
		? "exit"
		: "continue";
}

function decisionNextAction(record: ChangeRecord): string {
	if (record.change.status === "accepted") {
		return "Include this approved Change in the next relevant Planning horizon.";
	}
	if (["deferred", "rejected", "withdrawn"].includes(record.change.status)) {
		return `Retain the ${record.change.status} Change journey for accountability.`;
	}
	if (record.change.validation.state !== "valid") {
		return "Refine and validate the current Change revision.";
	}
	return "Review and approve or disposition the exact Change revision.";
}

function assertChangeTraceIdentity(
	records: TraceRecord[],
	changeId: string,
	traceId: string,
): void {
	if (records.length === 0) return;
	const head = records[0];
	if (head?.type !== "trace_head") {
		throw new Error(`Change Trace ${traceId} must start with trace_head.`);
	}
	if (head.traceId !== traceId || head.changeId !== changeId) {
		throw new Error(
			`Change Trace identity mismatch: expected ${traceId}/${changeId}.`,
		);
	}
}

function normalizedBatch(batch: ChangeTraceBatch): ChangeTraceBatch {
	return {
		id: batch.id.trim(),
		digest: batch.digest.trim(),
		changeIds: [...new Set(batch.changeIds.map((value) => value.trim()))].sort(
			(left, right) => left.localeCompare(right),
		),
	};
}

function lastTraceRecordWithId(
	records: TraceRecord[],
): Exclude<TraceRecord, TraceHead> | undefined {
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (record && record.type !== "trace_head") return record;
	}
	return undefined;
}

function lastChangeRecordEvent(records: TraceRecord[]): TraceEvent | undefined {
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (
			record?.type === "trace_event" &&
			record.loop === "decision" &&
			changeRecordOutput(record) !== undefined
		) {
			return record;
		}
	}
	return undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
