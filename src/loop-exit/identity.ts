import type { SemanticLoop } from "../semantic-loop.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../utils/canonical-json.ts";
import type {
	CanonicalJsonValue,
	Sha256Digest,
} from "../utils/canonical-json.ts";
import type { CheckDefinition, CheckJsonValue } from "./contracts.ts";

export {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../utils/canonical-json.ts";
export type {
	CanonicalJsonPrimitive,
	CanonicalJsonValue,
	Sha256Digest,
} from "../utils/canonical-json.ts";
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

interface LoopQualifiedCheckIdentityInput {
	readonly loop: SemanticLoop;
	readonly check: CheckDefinition;
	readonly configuration: Readonly<Record<string, CheckJsonValue>>;
	readonly catalogDigest: string;
}

export function checkRequirementDigest(requirement: string): Sha256Digest {
	if (!requirement.trim()) throw new Error("Check requirement cannot be blank.");
	return canonicalJsonDigest({ requirement });
}

export function loopQualifiedCheckDigest(
	input: LoopQualifiedCheckIdentityInput,
): Sha256Digest {
	assertSha256Digest(input.catalogDigest, "catalogDigest");
	const expectedRequirementDigest = checkRequirementDigest(
		input.check.requirement,
	);
	if (input.check.requirementDigest !== expectedRequirementDigest) {
		throw new Error(
			`Check ${input.check.id} requirement digest mismatch: expected ${expectedRequirementDigest}.`,
		);
	}
	return canonicalJsonDigest({
		loop: input.loop,
		check: input.check,
		configuration: input.configuration,
		catalogDigest: input.catalogDigest,
	});
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

function assertDataProperty(value: object, key: string, path: string): void {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
		throw new Error(
			`Cannot canonicalize JSON at ${path}: property must be enumerable data.`,
		);
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
