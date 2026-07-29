import type { TSchema } from "typebox";
import { Errors } from "typebox/value";
import type { SemanticLoop } from "../semantic-loop.ts";

export function candidateContentRecord(
	value: unknown,
	loop: SemanticLoop,
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Runtime ${loop} candidate must be an object.`);
	}
	return value as Record<string, unknown>;
}

export function assertCandidateContentKeys(
	loop: SemanticLoop,
	candidate: Record<string, unknown>,
	allowedKeys: readonly string[],
	runtimeKeys: readonly string[],
): void {
	const claimed = runtimeKeys.filter((key) => key in candidate);
	if (claimed.length > 0) {
		throw new Error(
			`Runtime ${loop} candidate cannot supply runtime-owned fields: ${claimed.join(", ")}.`,
		);
	}
	const unsupported = Object.keys(candidate).filter(
		(key) => !allowedKeys.includes(key),
	);
	if (unsupported.length > 0) {
		throw new Error(
			`Runtime ${loop} candidate received unsupported fields: ${unsupported.join(", ")}.`,
		);
	}
}

export function requiredCandidateText(
	value: unknown,
	loop: SemanticLoop,
	field: string,
): asserts value is string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Runtime ${loop} candidate ${field} is required.`);
	}
}

export function candidateNestedRecord(
	value: unknown,
	label: string,
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

export function assertCandidateNestedKeys(
	value: Record<string, unknown>,
	allowedKeys: readonly string[],
	label: string,
): void {
	const unsupported = Object.keys(value).find(
		(key) => !allowedKeys.includes(key),
	);
	if (unsupported) {
		throw new Error(`${label} received unsupported field ${unsupported}.`);
	}
}

export function assertCandidateSchema(
	schema: TSchema,
	value: unknown,
	label: string,
): void {
	const [error] = Errors(schema, value);
	if (!error) return;
	if (error.keyword === "additionalProperties") {
		const field = (error.params.additionalProperties as string[])[0];
		const location = error.instancePath || "/";
		throw new Error(
			`${label} received unsupported field ${field} at ${location}.`,
		);
	}
	const location = error.instancePath || "/";
	throw new Error(`${label} is invalid at ${location}: ${error.message}.`);
}
