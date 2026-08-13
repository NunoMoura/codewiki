import {
	CodewikiError,
	type CodewikiRecoveryAction,
} from "./codewiki-error.ts";

export type CodewikiApiErrorCode =
	| "unsupported_action"
	| "append_blocked"
	| "invalid_input"
	| "missing_required";

export interface CodewikiApiErrorInput {
	operation: string;
	code: CodewikiApiErrorCode;
	message: string;
	field?: string;
	recoverable?: boolean;
	retryable?: boolean;
	suggestedAction?: CodewikiRecoveryAction;
	refs?: string[];
	data?: Record<string, unknown>;
	cause?: unknown;
}

export class CodewikiApiError extends CodewikiError {
	readonly operation: string;
	readonly field?: string;

	constructor(input: CodewikiApiErrorInput) {
		super({
			domain: "api",
			code: input.code,
			message: input.message,
			recoverable: input.recoverable ?? true,
			retryable: input.retryable ?? false,
			suggestedAction: input.suggestedAction ?? "fix_input",
			refs: [input.operation, ...(input.refs || [])],
			data: {
				operation: input.operation,
				...(input.field ? { field: input.field } : {}),
				...(input.data || {}),
			},
			cause: input.cause,
		});
		this.name = "CodewikiApiError";
		this.operation = input.operation;
		if (input.field) this.field = input.field;
	}
}

export function createCodewikiApiError(
	input: CodewikiApiErrorInput,
): CodewikiApiError {
	return new CodewikiApiError(input);
}

export function assertKnownInputKeys(
	operation: string,
	input: Record<string, unknown>,
	knownKeys: readonly string[],
): void {
	const known = new Set(knownKeys);
	const unknown = Object.keys(input).filter((key) => !known.has(key));
	if (unknown.length === 0) return;
	throw createCodewikiApiError({
		operation,
		code: "invalid_input",
		field: unknown[0],
		message: `${operation} received unsupported input field ${unknown[0]}. Use the documented structured input shape.`,
		data: { unknownFields: unknown, knownFields: knownKeys },
	});
}

export function requiredStringField(
	operation: string,
	field: string,
	value: unknown,
): string {
	if (typeof value === "string" && value.trim() !== "") return value;
	throw createCodewikiApiError({
		operation,
		code: "missing_required",
		field,
		message: `${operation} requires ${field}.`,
		data: { value },
	});
}

export function requiredArrayField(
	operation: string,
	field: string,
	value: unknown,
): unknown[] {
	if (Array.isArray(value)) return value;
	throw createCodewikiApiError({
		operation,
		code: "missing_required",
		field,
		message: `${operation} requires ${field} array.`,
		data: { value },
	});
}
