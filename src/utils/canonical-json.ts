import { createHash } from "node:crypto";

export type Sha256Digest = `sha256:${string}`;
export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
	| CanonicalJsonPrimitive
	| readonly CanonicalJsonValue[]
	| { readonly [key: string]: CanonicalJsonValue };

export function toCanonicalJsonValue(value: unknown): CanonicalJsonValue {
	return canonicalize(value, "$", new Set<object>());
}

export function canonicalJson(value: unknown): string {
	return JSON.stringify(toCanonicalJsonValue(value));
}

export function canonicalJsonDigest(value: unknown): Sha256Digest {
	return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function assertSha256Digest(
	value: unknown,
	field: string,
): Sha256Digest {
	if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
		throw new Error(`${field} must be a lowercase sha256 digest.`);
	}
	return value as Sha256Digest;
}

function canonicalize(
	value: unknown,
	path: string,
	ancestors: Set<object>,
): CanonicalJsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) invalid(path, "number must be finite");
		return Object.is(value, -0) ? 0 : value;
	}
	if (typeof value !== "object") {
		invalid(path, `${typeof value} is not a JSON value`);
	}
	if (ancestors.has(value)) invalid(path, "cyclic reference");

	ancestors.add(value);
	try {
		return Array.isArray(value)
			? canonicalArray(value, path, ancestors)
			: canonicalObject(value, path, ancestors);
	} finally {
		ancestors.delete(value);
	}
}

function canonicalArray(
	value: unknown[],
	path: string,
	ancestors: Set<object>,
): readonly CanonicalJsonValue[] {
	if (Object.getOwnPropertySymbols(value).length > 0) {
		invalid(path, "symbol properties are not JSON");
	}
	const allowedKeys = new Set(["length"]);
	const result: CanonicalJsonValue[] = [];
	for (let index = 0; index < value.length; index += 1) {
		const key = String(index);
		allowedKeys.add(key);
		if (!Object.hasOwn(value, index)) {
			invalid(`${path}[${index}]`, "sparse array entry");
		}
		assertDataProperty(value, key, `${path}[${index}]`);
		result.push(canonicalize(value[index], `${path}[${index}]`, ancestors));
	}
	for (const key of Object.getOwnPropertyNames(value)) {
		if (!allowedKeys.has(key)) {
			invalid(path, `array property ${JSON.stringify(key)} is not JSON`);
		}
	}
	return Object.freeze(result);
}

function canonicalObject(
	value: object,
	path: string,
	ancestors: Set<object>,
): { readonly [key: string]: CanonicalJsonValue } {
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		invalid(path, "object must have a plain prototype");
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		invalid(path, "symbol properties are not JSON");
	}

	const source = value as Record<string, unknown>;
	const result: Record<string, CanonicalJsonValue> = Object.create(null);
	for (const key of Object.getOwnPropertyNames(value).sort(compareText)) {
		assertDataProperty(value, key, `${path}.${key}`);
		result[key] = canonicalize(source[key], `${path}.${key}`, ancestors);
	}
	return Object.freeze(result);
}

function assertDataProperty(value: object, key: string, path: string): void {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
		invalid(path, "property must be enumerable data");
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function invalid(path: string, reason: string): never {
	throw new Error(`Cannot canonicalize JSON at ${path}: ${reason}.`);
}
