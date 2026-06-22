import { createCodewikiApiError } from "../error-handling/api-errors.ts";

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
