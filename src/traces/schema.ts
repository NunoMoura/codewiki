import type {
	TailCheckpoint,
	TraceClose,
	TraceEvent,
	TraceHead,
	TraceRecord,
} from "./types.ts";

export const TRACE_SCHEMA_VERSION = 1;
export const TRACE_FILE_GLOB = ".codewiki/traces/TRACE-*.jsonl";

export const TRACE_RECORD_TYPE_VALUES = [
	"trace_head",
	"trace_event",
	"tail_checkpoint",
	"trace_close",
] as const;

export const TRACE_LOOP_VALUES = [
	"decision",
	"planning",
	"implementation",
] as const;

export interface TraceValidationIssue {
	path: string;
	message: string;
}

export interface TraceValidationResult<T> {
	ok: boolean;
	issues: TraceValidationIssue[];
	value?: T;
}

export class TraceValidationError extends Error {
	readonly issues: TraceValidationIssue[];

	constructor(issues: TraceValidationIssue[]) {
		super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
		this.name = "TraceValidationError";
		this.issues = issues;
	}
}

export function traceFilePath(traceId: string): string {
	const normalized = traceId.trim();
	if (!isTraceId(normalized)) throw new Error(`Invalid trace id: ${traceId}`);
	return `.codewiki/traces/${normalized}.jsonl`;
}

export function isTraceId(value: unknown): value is string {
	return typeof value === "string" && /^TRACE-[A-Za-z0-9._-]+$/.test(value);
}

export function validateTraceRecord(
	value: unknown,
): TraceValidationResult<TraceRecord> {
	const issues: TraceValidationIssue[] = [];
	if (!isRecord(value))
		return invalid("$", "Trace record must be a JSON object.");
	if (!TRACE_RECORD_TYPE_VALUES.includes(value.type as never)) {
		issue(
			issues,
			"$.type",
			"Trace record type must be trace_head, trace_event, tail_checkpoint, or trace_close.",
		);
		return { ok: false, issues };
	}
	if (value.type === "trace_head")
		validateTraceHead(issues, value as Partial<TraceHead>);
	if (value.type === "trace_event")
		validateTraceEvent(issues, value as Partial<TraceEvent>);
	if (value.type === "tail_checkpoint")
		validateTailCheckpoint(issues, value as Partial<TailCheckpoint>);
	if (value.type === "trace_close")
		validateTraceClose(issues, value as Partial<TraceClose>);
	return {
		ok: issues.length === 0,
		issues,
		...(issues.length === 0 ? { value: value as unknown as TraceRecord } : {}),
	};
}

export function assertValidTraceRecord(value: unknown): TraceRecord {
	const result = validateTraceRecord(value);
	if (!result.ok || !result.value)
		throw new TraceValidationError(result.issues);
	return result.value;
}

function validateTraceHead(
	issues: TraceValidationIssue[],
	value: Partial<TraceHead>,
): void {
	requireTraceId(issues, value.traceId, "$.traceId");
	requireString(issues, value.title, "$.title");
	requireString(issues, value.createdAt, "$.createdAt");
}

function validateTraceEvent(
	issues: TraceValidationIssue[],
	value: Partial<TraceEvent>,
): void {
	requireString(issues, value.id, "$.id");
	requireNullableString(issues, value.parentId, "$.parentId");
	requireTraceId(issues, value.traceId, "$.traceId");
	if (!Number.isInteger(value.sequence) || Number(value.sequence) < 1) {
		issue(
			issues,
			"$.sequence",
			"Trace event sequence must be a positive integer.",
		);
	}
	if (!TRACE_LOOP_VALUES.includes(value.loop as never)) {
		issue(
			issues,
			"$.loop",
			"Trace event loop must be decision, planning, or implementation.",
		);
	}
	requireString(issues, value.event, "$.event");
	requireStringArray(issues, value.refs, "$.refs");
	requireString(issues, value.createdAt, "$.createdAt");
	if (value.data !== undefined && !isRecord(value.data)) {
		issue(
			issues,
			"$.data",
			"Trace event data must be a JSON object when present.",
		);
	}
}

function validateTailCheckpoint(
	issues: TraceValidationIssue[],
	value: Partial<TailCheckpoint>,
): void {
	requireString(issues, value.id, "$.id");
	requireNullableString(issues, value.parentId, "$.parentId");
	requireTraceId(issues, value.traceId, "$.traceId");
	requireString(issues, value.firstKeptRecordId, "$.firstKeptRecordId");
	requireString(issues, value.summary, "$.summary");
	requireString(issues, value.createdAt, "$.createdAt");
	if (value.data !== undefined && !isRecord(value.data)) {
		issue(
			issues,
			"$.data",
			"Tail checkpoint data must be a JSON object when present.",
		);
	}
}

function validateTraceClose(
	issues: TraceValidationIssue[],
	value: Partial<TraceClose>,
): void {
	requireString(issues, value.id, "$.id");
	requireNullableString(issues, value.parentId, "$.parentId");
	requireTraceId(issues, value.traceId, "$.traceId");
	requireString(issues, value.reason, "$.reason");
	requireString(issues, value.gitRestoreRef, "$.gitRestoreRef");
	requireString(issues, value.headRef, "$.headRef");
	requireStringArray(issues, value.refs, "$.refs");
	requireString(issues, value.createdAt, "$.createdAt");
	if (value.data !== undefined && !isRecord(value.data)) {
		issue(
			issues,
			"$.data",
			"Trace close data must be a JSON object when present.",
		);
	}
}

function requireTraceId(
	issues: TraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	if (!isTraceId(value))
		issue(issues, path, "Trace id must start with TRACE- and be path-safe.");
}

function requireString(
	issues: TraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		issue(issues, path, "Field must be a non-empty string.");
	}
}

function requireNullableString(
	issues: TraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	if (value !== null && typeof value !== "string") {
		issue(issues, path, "Field must be a string or null.");
	}
}

function requireStringArray(
	issues: TraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	if (!Array.isArray(value)) {
		issue(issues, path, "Field must be an array of strings.");
		return;
	}
	value.forEach((item, index) =>
		requireString(issues, item, `${path}[${index}]`),
	);
}

function invalid(path: string, message: string): TraceValidationResult<never> {
	return { ok: false, issues: [{ path, message }] };
}

function issue(
	issues: TraceValidationIssue[],
	path: string,
	message: string,
): void {
	issues.push({ path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
