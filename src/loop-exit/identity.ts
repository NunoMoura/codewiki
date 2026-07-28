import { createHash } from "node:crypto";
import type { SemanticLoop } from "../semantic-loop.ts";

export type Sha256Digest = `sha256:${string}`;
export type CandidateId<TLoop extends SemanticLoop = SemanticLoop> =
	`candidate:${TLoop}:${string}`;

export interface CandidateObservedBase {
	readonly workStateDigest: Sha256Digest;
	readonly knowledgeSnapshotDigest: Sha256Digest;
	readonly sourceSnapshotDigest?: Sha256Digest;
	readonly gitTreeDigest?: Sha256Digest;
	readonly canonicalRefs: readonly string[];
}

export interface LoopCandidate<
	TLoop extends SemanticLoop = SemanticLoop,
	TContent extends CanonicalJsonValue = CanonicalJsonValue,
> {
	readonly id: CandidateId<TLoop>;
	readonly digest: Sha256Digest;
	readonly loop: TLoop;
	readonly schemaVersion: string;
	readonly content: TContent;
	readonly observedBase: CandidateObservedBase;
}

export interface CreateLoopCandidateInput<
	TLoop extends SemanticLoop = SemanticLoop,
	TContent extends CanonicalJsonValue = CanonicalJsonValue,
> {
	readonly loop: TLoop;
	readonly schemaVersion: string;
	readonly content: TContent;
	readonly observedBase: CandidateObservedBase;
}

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

export function createLoopCandidate<
	TLoop extends SemanticLoop,
	TContent extends CanonicalJsonValue,
>(
	input: CreateLoopCandidateInput<TLoop, TContent>,
): LoopCandidate<TLoop, TContent> {
	assertExactKeys(
		input,
		["loop", "schemaVersion", "content", "observedBase"],
		"Candidate input",
	);
	if (!isSemanticLoop(input.loop)) {
		throw new Error(`Candidate loop ${String(input.loop)} is invalid.`);
	}
	if (!/^\d+\.\d+\.\d+$/.test(input.schemaVersion)) {
		throw new Error("Candidate schemaVersion must be a semantic version.");
	}
	assertExactKeys(
		input.observedBase,
		[
			"workStateDigest",
			"knowledgeSnapshotDigest",
			"sourceSnapshotDigest",
			"gitTreeDigest",
			"canonicalRefs",
		],
		"Candidate observedBase",
	);
	const observedBase = normalizedObservedBase(input.observedBase);
	const body = toCanonicalJsonValue({
		loop: input.loop,
		schemaVersion: input.schemaVersion,
		content: input.content,
		observedBase,
	});
	const digest = canonicalJsonDigest(body);
	const candidate = toCanonicalJsonValue({
		...(body as Record<string, CanonicalJsonValue>),
		id: `candidate:${input.loop}:${digest.slice("sha256:".length)}`,
		digest,
	});
	return candidate as unknown as LoopCandidate<TLoop, TContent>;
}

function normalizedObservedBase(
	base: CandidateObservedBase,
): CandidateObservedBase {
	const normalized: {
		workStateDigest: Sha256Digest;
		knowledgeSnapshotDigest: Sha256Digest;
		sourceSnapshotDigest?: Sha256Digest;
		gitTreeDigest?: Sha256Digest;
		canonicalRefs: readonly string[];
	} = {
		workStateDigest: assertSha256Digest(
			base.workStateDigest,
			"Candidate observedBase.workStateDigest",
		),
		knowledgeSnapshotDigest: assertSha256Digest(
			base.knowledgeSnapshotDigest,
			"Candidate observedBase.knowledgeSnapshotDigest",
		),
		canonicalRefs: Object.freeze(normalizedRefs(base.canonicalRefs)),
	};
	if (base.sourceSnapshotDigest !== undefined) {
		normalized.sourceSnapshotDigest = assertSha256Digest(
			base.sourceSnapshotDigest,
			"Candidate observedBase.sourceSnapshotDigest",
		);
	}
	if (base.gitTreeDigest !== undefined) {
		normalized.gitTreeDigest = assertSha256Digest(
			base.gitTreeDigest,
			"Candidate observedBase.gitTreeDigest",
		);
	}
	return Object.freeze(normalized);
}

function normalizedRefs(refs: readonly string[]): string[] {
	if (!Array.isArray(refs)) {
		throw new Error("Candidate observedBase.canonicalRefs must be an array.");
	}
	const normalized = refs.map((ref, index) => {
		if (
			typeof ref !== "string" ||
			ref.trim().length === 0 ||
			ref !== ref.trim()
		) {
			throw new Error(
				`Candidate observedBase.canonicalRefs[${index}] must be trimmed non-empty text.`,
			);
		}
		return ref;
	});
	return [...new Set(normalized)].sort(compareText);
}

function assertExactKeys(
	value: object,
	allowed: readonly string[],
	label: string,
): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const allowedKeys = new Set(allowed);
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !allowedKeys.has(key)) {
			throw new Error(`${label} contains unsupported field ${String(key)}.`);
		}
		assertDataProperty(value, key, `${label}.${key}`);
	}
}

function isSemanticLoop(value: unknown): value is SemanticLoop {
	return value === "decision" || value === "planning" || value === "implementation";
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
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

function invalid(path: string, reason: string): never {
	throw new Error(`Cannot canonicalize JSON at ${path}: ${reason}.`);
}
