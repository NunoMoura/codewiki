import type { TSchema } from "typebox";
import { Errors } from "typebox/value";

export function parseJsonObject<T>(text: string, label = "JSON input"): T {
	try {
		return JSON.parse(text) as T;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid ${label}: ${reason}`);
	}
}

export function assertExactKeys(
	value: unknown,
	allowed: readonly string[],
	label: string,
): void {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const allowedKeys = new Set(allowed);
	const unsupported = Reflect.ownKeys(value).find(
		(key) => typeof key !== "string" || !allowedKeys.has(key),
	);
	if (unsupported !== undefined) {
		throw new Error(`${label} received unsupported field ${String(unsupported)}.`);
	}
}

export function assertTypeboxSchema(
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
