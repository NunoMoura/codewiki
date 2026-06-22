import {
	CodewikiError,
	type CodewikiRecoveryAction,
} from "./codewiki-error.ts";

export type CodewikiTraceErrorCode =
	| "append_conflict"
	| "closed_append"
	| "invalid_append_batch"
	| "invalid_iteration_batch"
	| "invalid_trace";

export interface CodewikiTraceErrorInput {
	code: CodewikiTraceErrorCode;
	message: string;
	path?: string;
	traceId?: string;
	recordId?: string;
	recoverable?: boolean;
	retryable?: boolean;
	suggestedAction?: CodewikiRecoveryAction;
	refs?: string[];
	data?: Record<string, unknown>;
	cause?: unknown;
}

export class CodewikiTraceError extends CodewikiError {
	readonly path?: string;
	readonly traceId?: string;
	readonly recordId?: string;

	constructor(input: CodewikiTraceErrorInput) {
		super({
			domain: "trace",
			code: input.code,
			message: input.message,
			recoverable: input.recoverable ?? true,
			retryable: input.retryable ?? false,
			suggestedAction: input.suggestedAction ?? defaultTraceAction(input.code),
			refs: [
				input.path,
				input.traceId,
				input.recordId,
				...(input.refs || []),
			].filter((value): value is string => Boolean(value)),
			data: {
				...(input.path ? { path: input.path } : {}),
				...(input.traceId ? { traceId: input.traceId } : {}),
				...(input.recordId ? { recordId: input.recordId } : {}),
				...(input.data || {}),
			},
			cause: input.cause,
		});
		this.name = "CodewikiTraceError";
		if (input.path) this.path = input.path;
		if (input.traceId) this.traceId = input.traceId;
		if (input.recordId) this.recordId = input.recordId;
	}
}

export class TraceAppendConflictError extends CodewikiTraceError {
	readonly expectedBytes: number;
	readonly actualBytes: number;

	constructor(path: string, expectedBytes: number, actualBytes: number) {
		super({
			code: "append_conflict",
			message: `Trace append conflict for ${path}: expected ${expectedBytes} bytes, found ${actualBytes}.`,
			path,
			recoverable: true,
			retryable: false,
			suggestedAction: "refresh_trace",
			data: { expectedBytes, actualBytes },
		});
		this.name = "TraceAppendConflictError";
		this.expectedBytes = expectedBytes;
		this.actualBytes = actualBytes;
	}
}

export class TraceClosedAppendError extends CodewikiTraceError {
	readonly closeId: string;

	constructor(path: string, traceId: string, closeId: string) {
		super({
			code: "closed_append",
			message: `Trace ${traceId} is closed by ${closeId}; append is not allowed for ${path}.`,
			path,
			traceId,
			recordId: closeId,
			recoverable: true,
			retryable: false,
			suggestedAction: "refresh_trace",
			data: { closeId },
		});
		this.name = "TraceClosedAppendError";
		this.closeId = closeId;
	}
}

function defaultTraceAction(
	code: CodewikiTraceErrorCode,
): CodewikiRecoveryAction {
	if (code === "append_conflict" || code === "closed_append") {
		return "refresh_trace";
	}
	return "fix_input";
}
