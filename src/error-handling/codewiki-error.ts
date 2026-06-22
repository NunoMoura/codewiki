export type CodewikiErrorDomain =
	| "api"
	| "config"
	| "host"
	| "runtime"
	| "trace";

export type CodewikiRecoveryAction =
	| "fix_input"
	| "refresh_trace"
	| "retry"
	| "ask_user"
	| "release_claim"
	| "route_to_trace_host"
	| "stop";

export interface CodewikiErrorInput {
	domain: CodewikiErrorDomain;
	code: string;
	message: string;
	recoverable?: boolean;
	retryable?: boolean;
	suggestedAction?: CodewikiRecoveryAction;
	refs?: string[];
	data?: Record<string, unknown>;
	cause?: unknown;
}

export interface CodewikiErrorPacket {
	name: string;
	domain: CodewikiErrorDomain;
	code: string;
	message: string;
	recoverable: boolean;
	retryable: boolean;
	suggestedAction: CodewikiRecoveryAction;
	refs: string[];
	data?: Record<string, unknown>;
}

export class CodewikiError extends Error {
	readonly domain: CodewikiErrorDomain;
	readonly code: string;
	readonly recoverable: boolean;
	readonly retryable: boolean;
	readonly suggestedAction: CodewikiRecoveryAction;
	readonly refs: string[];
	readonly data?: Record<string, unknown>;

	constructor(input: CodewikiErrorInput) {
		super(
			input.message,
			input.cause === undefined ? undefined : { cause: input.cause },
		);
		this.name = "CodewikiError";
		this.domain = input.domain;
		this.code = input.code;
		this.recoverable = input.recoverable ?? true;
		this.retryable = input.retryable ?? false;
		this.suggestedAction = input.suggestedAction ?? "fix_input";
		this.refs = unique(input.refs || []);
		if (input.data) this.data = { ...input.data };
	}
}

export function createCodewikiError(input: CodewikiErrorInput): CodewikiError {
	return new CodewikiError(input);
}

export function isCodewikiError(value: unknown): value is CodewikiError {
	return (
		value instanceof CodewikiError ||
		(typeof value === "object" &&
			value !== null &&
			"domain" in value &&
			"code" in value &&
			"suggestedAction" in value &&
			"recoverable" in value &&
			"retryable" in value)
	);
}

export function codewikiErrorData(
	error: CodewikiError | undefined,
): CodewikiErrorPacket | undefined {
	if (!error) return undefined;
	return {
		name: error.name,
		domain: error.domain,
		code: error.code,
		message: error.message,
		recoverable: error.recoverable,
		retryable: error.retryable,
		suggestedAction: error.suggestedAction,
		refs: [...error.refs],
		...(error.data ? { data: { ...error.data } } : {}),
	};
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
	);
}
