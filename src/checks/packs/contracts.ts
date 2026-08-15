import {
	CHECK_DEFINITION_SCHEMA_VERSION,
	normalizeCheckDefinition,
	qualifiedCheckId,
	type CheckDefinition,
	type CheckImplementationKind,
	type CheckStage,
} from "../contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const CHECK_PACK_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;
export const MAX_CHECK_PACKS_PER_STAGE = 64;
export const MAX_CHECKS_PER_GATE = 256;

export interface CheckImplementationResource {
	readonly fileName: "CHECK.mjs" | "CHECK.md";
	readonly mediaType: "text/javascript" | "text/markdown";
	readonly content: string;
	readonly digest: Sha256Digest;
}

export interface PackagedCheck {
	readonly stage: CheckStage;
	readonly packId: string;
	readonly checkId: string;
	readonly definition: CheckDefinition;
	readonly definitionDigest: Sha256Digest;
	readonly implementation: CheckImplementationResource;
	readonly checkDigest: Sha256Digest;
}

export interface CheckPack {
	readonly id: string;
	readonly checks: readonly PackagedCheck[];
	readonly digest: Sha256Digest;
}

export interface CheckPackSnapshot {
	readonly schemaVersion: typeof CHECK_PACK_SNAPSHOT_SCHEMA_VERSION;
	readonly stage: CheckStage;
	readonly packs: readonly CheckPack[];
	readonly checkCount: number;
	readonly digest: Sha256Digest;
}

export interface CreatePackagedCheckInput {
	readonly stage: CheckStage;
	readonly packId: string;
	readonly checkId: string;
	readonly definition: CheckDefinition;
	readonly implementationFileName: "CHECK.mjs" | "CHECK.md";
	readonly implementationContent: string;
}

export function createPackagedCheck(
	input: CreatePackagedCheckInput,
): PackagedCheck {
	qualifiedCheckId(input.packId, input.checkId);
	const definition = normalizeCheckDefinition(input.definition);
	if (definition.id !== input.checkId) {
		throw new Error(
			`Check Definition id ${definition.id} does not match directory ${input.checkId}.`,
		);
	}
	const expectedFileName = implementationFileName(definition.implementation.kind);
	if (input.implementationFileName !== expectedFileName) {
		throw new Error(
			`${definition.implementation.kind} Check ${input.packId}/${input.checkId} requires ${expectedFileName}.`,
		);
	}
	if (
		typeof input.implementationContent !== "string" ||
		!input.implementationContent.trim()
	) {
		throw new Error(
			`Check implementation ${input.packId}/${input.checkId} cannot be blank.`,
		);
	}
	if (definition.implementation.kind === "model") {
		assertModelCheckRubric(input.implementationContent);
	}
	const definitionDigest = canonicalJsonDigest(definition);
	const implementation = Object.freeze({
		fileName: input.implementationFileName,
		mediaType:
			input.implementationFileName === "CHECK.mjs"
				? ("text/javascript" as const)
				: ("text/markdown" as const),
		content: input.implementationContent,
		digest: canonicalJsonDigest({content: input.implementationContent}),
	});
	const identity = {
		stage: input.stage,
		packId: input.packId,
		checkId: input.checkId,
		definitionDigest,
		implementationFileName: implementation.fileName,
		implementationDigest: implementation.digest,
	};
	return immutable({
		stage: input.stage,
		packId: input.packId,
		checkId: input.checkId,
		definition,
		definitionDigest,
		implementation,
		checkDigest: canonicalJsonDigest(identity),
	});
}

export function createCheckPack(input: {
	readonly id: string;
	readonly checks: readonly PackagedCheck[];
}): CheckPack {
	qualifiedCheckId(input.id, "identity-check");
	const checks = [...input.checks].sort(compareChecks);
	const seen = new Set<string>();
	for (const check of checks) {
		assertPackagedCheck(check);
		if (check.packId !== input.id) {
			throw new Error(`Check ${check.checkId} does not belong to Pack ${input.id}.`);
		}
		if (seen.has(check.checkId)) {
			throw new Error(`Check Pack ${input.id} contains duplicate Check ${check.checkId}.`);
		}
		seen.add(check.checkId);
	}
	const body = {
		id: input.id,
		checks,
	};
	return immutable({...body, digest: canonicalJsonDigest(body)});
}

export function createCheckPackSnapshot(input: {
	readonly stage: CheckStage;
	readonly packs: readonly CheckPack[];
}): CheckPackSnapshot {
	if (input.packs.length > MAX_CHECK_PACKS_PER_STAGE) {
		throw new Error(
			`Check Pack snapshot exceeds ${MAX_CHECK_PACKS_PER_STAGE} Packs.`,
		);
	}
	const packs = [...input.packs].sort(comparePacks);
	const seen = new Set<string>();
	for (const pack of packs) {
		assertCheckPack(pack, input.stage);
		if (seen.has(pack.id)) {
			throw new Error(`Check Pack snapshot contains duplicate Pack ${pack.id}.`);
		}
		seen.add(pack.id);
	}
	const checkCount = packs.reduce((count, pack) => count + pack.checks.length, 0);
	if (checkCount > MAX_CHECKS_PER_GATE) {
		throw new Error(`Check Pack snapshot exceeds ${MAX_CHECKS_PER_GATE} Checks.`);
	}
	const body = {
		schemaVersion: CHECK_PACK_SNAPSHOT_SCHEMA_VERSION,
		stage: input.stage,
		packs,
		checkCount,
	};
	return immutable({...body, digest: canonicalJsonDigest(body)});
}

export function assertCheckPackSnapshot(
	snapshot: CheckPackSnapshot,
	expectedStage?: CheckStage,
): void {
	assertExactKeys(
		snapshot,
		["schemaVersion", "stage", "packs", "checkCount", "digest"],
		"Check Pack snapshot",
	);
	if (snapshot.schemaVersion !== CHECK_PACK_SNAPSHOT_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported Check Pack snapshot version ${String(snapshot.schemaVersion)}.`,
		);
	}
	if (expectedStage !== undefined && snapshot.stage !== expectedStage) {
		throw new Error(
			`Check Pack snapshot stage ${snapshot.stage} does not match ${expectedStage}.`,
		);
	}
	if (!Array.isArray(snapshot.packs)) {
		throw new Error("Check Pack snapshot packs must be an array.");
	}
	const expected = createCheckPackSnapshot({
		stage: snapshot.stage,
		packs: snapshot.packs,
	});
	if (snapshot.digest !== expected.digest) {
		throw new Error("Check Pack snapshot digest does not match its content.");
	}
	if (snapshot.checkCount !== expected.checkCount) {
		throw new Error("Check Pack snapshot checkCount does not match its Packs.");
	}
}

export function packagedChecks(
	snapshot: CheckPackSnapshot,
): PackagedCheck[] {
	assertCheckPackSnapshot(snapshot);
	return snapshot.packs.flatMap((pack) => pack.checks);
}

export function requiredPackagedCheck(
	snapshot: CheckPackSnapshot,
	packId: string,
	checkId: string,
): PackagedCheck {
	const check = snapshot.packs
		.find((pack) => pack.id === packId)
		?.checks.find((entry) => entry.checkId === checkId);
	if (!check) throw new Error(`Check ${packId}/${checkId} is absent from snapshot.`);
	return check;
}

function assertCheckPack(pack: CheckPack, stage: CheckStage): void {
	assertExactKeys(pack, ["id", "checks", "digest"], "Check Pack");
	const expected = createCheckPack({id: pack.id, checks: pack.checks});
	if (pack.digest !== expected.digest) {
		throw new Error(`Check Pack ${pack.id} digest does not match its content.`);
	}
	for (const check of pack.checks) {
		if (check.stage !== stage) {
			throw new Error(`Check ${pack.id}/${check.checkId} has wrong stage ${check.stage}.`);
		}
	}
}

function assertPackagedCheck(check: PackagedCheck): void {
	assertExactKeys(
		check,
		[
			"stage",
			"packId",
			"checkId",
			"definition",
			"definitionDigest",
			"implementation",
			"checkDigest",
		],
		"Packaged Check",
	);
	assertSha256Digest(check.definitionDigest, "Packaged Check definition digest");
	assertSha256Digest(check.implementation.digest, "Packaged Check implementation digest");
	assertSha256Digest(check.checkDigest, "Packaged Check digest");
	const expected = createPackagedCheck({
		stage: check.stage,
		packId: check.packId,
		checkId: check.checkId,
		definition: check.definition,
		implementationFileName: check.implementation.fileName,
		implementationContent: check.implementation.content,
	});
	if (
		check.definitionDigest !== expected.definitionDigest ||
		check.implementation.digest !== expected.implementation.digest ||
		check.checkDigest !== expected.checkDigest
	) {
		throw new Error(`Packaged Check ${check.packId}/${check.checkId} identity is invalid.`);
	}
}

export function assertModelCheckRubric(content: string): void {
	const required = ["Requirement", "Pass", "Fail", "Feedback"] as const;
	const headings = [...content.matchAll(/^#{1,6}\s+(Requirement|Pass|Fail|Feedback)\s*$/gimu)];
	if (
		headings.length !== required.length ||
		headings.some((heading, index) => heading[1] !== required[index])
	) {
		throw new Error(
			"Model CHECK.md requires exactly one ordered Requirement, Pass, Fail, and Feedback section.",
		);
	}
	for (let index = 0; index < headings.length; index += 1) {
		const start = (headings[index].index ?? 0) + headings[index][0].length;
		const end = headings[index + 1]?.index ?? content.length;
		if (!content.slice(start, end).trim()) {
			throw new Error(`Model CHECK.md ${required[index]} section cannot be empty.`);
		}
	}
}

function implementationFileName(
	kind: CheckImplementationKind,
): "CHECK.mjs" | "CHECK.md" {
	return kind === "code" ? "CHECK.mjs" : "CHECK.md";
}

function compareChecks(left: PackagedCheck, right: PackagedCheck): number {
	return compareText(left.checkId, right.checkId);
}

function comparePacks(left: CheckPack, right: CheckPack): number {
	return compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
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
	}
}

function immutable<T>(value: T): T {
	return toCanonicalJsonValue(value) as unknown as T;
}

export const CHECK_JSON_SCHEMA_VERSION = CHECK_DEFINITION_SCHEMA_VERSION;
