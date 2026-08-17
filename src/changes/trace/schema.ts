import { CodewikiTraceError } from "./storage-errors.ts";
import { isSemanticEventName } from "./events.ts";
import type {
	TailCheckpoint,
	TraceClose,
	TraceEvent,
	TraceHead,
	TraceOrigin,
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

export class TraceValidationError extends CodewikiTraceError {
	readonly issues: TraceValidationIssue[];

	constructor(issues: TraceValidationIssue[]) {
		super({
			code: "invalid_trace",
			message: issues
				.map((issue) => `${issue.path}: ${issue.message}`)
				.join("; "),
			data: { issues },
		});
		this.name = "TraceValidationError";
		this.issues = issues;
	}
}

export function traceFilePath(traceId: string): string {
	const normalized = traceId.trim();
	if (!isTraceId(normalized)) {
		throw new CodewikiTraceError({
			code: "invalid_trace",
			message: `Invalid trace id: ${traceId}`,
			traceId,
		});
	}
	return `.codewiki/traces/${normalized}.jsonl`;
}

export function isTraceId(value: unknown): value is string {
	return typeof value === "string" && /^TRACE-[A-Za-z0-9._-]+$/.test(value);
}

export function isChangeId(value: unknown): value is string {
	return typeof value === "string" && /^CHG-[A-Za-z0-9._-]+$/.test(value);
}

export function assertProjectServerSemanticJobId(
	value: string | undefined,
	operation: string,
): void {
	if (value === undefined) return;
	if (!/^runtime-reaction:[a-f0-9]{64}$/.test(value)) {
		throw new Error(`${operation} runtimeJobId is invalid.`);
	}
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
	if (value.changeId !== undefined && !isChangeId(value.changeId)) {
		issue(
			issues,
			"$.changeId",
			"Change id must start with CHG- and be path-safe.",
		);
	}
	requireString(issues, value.title, "$.title");
	requireString(issues, value.createdAt, "$.createdAt");
	if (value.origin !== undefined) {
		validateTraceOrigin(issues, value.origin as Partial<TraceOrigin>);
	}
}

function validateTraceOrigin(
	issues: TraceValidationIssue[],
	value: Partial<TraceOrigin>,
): void {
	if (!isRecord(value)) {
		issue(issues, "$.origin", "Trace origin must be a JSON object.");
		return;
	}
	requireString(issues, value.kind, "$.origin.kind");
	if (value.parentTraceId !== undefined)
		requireTraceId(issues, value.parentTraceId, "$.origin.parentTraceId");
	if (value.triggerTraceId !== undefined)
		requireTraceId(issues, value.triggerTraceId, "$.origin.triggerTraceId");
	requireOptionalString(issues, value.triggerId, "$.origin.triggerId");
	requireOptionalString(issues, value.planningRef, "$.origin.planningRef");
	requireOptionalString(issues, value.sourceRef, "$.origin.sourceRef");
	requireOptionalString(issues, value.runKey, "$.origin.runKey");
	requireStringArray(issues, value.refs, "$.origin.refs");
	if (value.kind === "trigger_run") {
		if (!value.triggerTraceId)
			issue(
				issues,
				"$.origin.triggerTraceId",
				"Trigger run origin requires triggerTraceId.",
			);
		if (!value.triggerId)
			issue(
				issues,
				"$.origin.triggerId",
				"Trigger run origin requires triggerId.",
			);
		if (!value.planningRef)
			issue(
				issues,
				"$.origin.planningRef",
				"Trigger run origin requires planningRef.",
			);
		if (!value.runKey)
			issue(issues, "$.origin.runKey", "Trigger run origin requires runKey.");
		if (!Array.isArray(value.refs) || value.refs.length === 0)
			issue(issues, "$.origin.refs", "Trigger run origin requires refs.");
	}
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
	requireString(issues, value.event, "$.event");
	validateTraceEventLoop(issues, value);
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

function validateTraceEventLoop(
	issues: TraceValidationIssue[],
	value: Partial<TraceEvent>,
): void {
	const loop = value.loop;
	const event = typeof value.event === "string" ? value.event : "";
	if (event.startsWith("runtime.")) {
		if (loop !== undefined) {
			issue(
				issues,
				"$.loop",
				"Runtime coordination trace events must omit semantic loop.",
			);
		}
		return;
	}
	if (!TRACE_LOOP_VALUES.includes(loop as never)) {
		issue(
			issues,
			"$.loop",
			"Semantic trace event loop must be decision, planning, or implementation.",
		);
		return;
	}
	const semanticLoop = loop as (typeof TRACE_LOOP_VALUES)[number];
	if (!isSemanticEventName(semanticLoop, event)) {
		issue(
			issues,
			"$.event",
			`Semantic trace event ${event} is not valid for loop ${semanticLoop}.`,
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

function requireOptionalString(
	issues: TraceValidationIssue[],
	value: unknown,
	path: string,
): void {
	if (value !== undefined && (typeof value !== "string" || !value.trim())) {
		issue(issues, path, "Field must be a non-empty string when present.");
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
