import {
	canonicalJson,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	canonicalIsoTimestamp,
	compareCanonicalText as compareText,
	deepFreezeValue as deepFreeze,
} from "./validation.ts";

export const USER_STANDARD_SCHEMA_VERSION = "1.0.0" as const;
export const MAX_USER_STANDARDS = 64;
export const MAX_USER_STANDARD_BYTES = 65_536;
export const MAX_USER_STANDARD_CONTENT_CODE_POINTS = 32_768;
export const MAX_USER_STANDARD_PASSAGES = 32;

const USER_STANDARD_ID = /^user-standard:[0-9a-f]{64}$/u;
const PASSAGE_ID = /^standard-passage:[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SOURCE_KINDS = ["inline", "url"] as const;
const MEDIA_TYPES = ["text/plain", "text/markdown"] as const;
const PROHIBITED_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f]/u;
const PRIVATE_DATA_PATTERNS = [
	/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/iu,
	/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/iu,
	/\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/iu,
	/\bgh[pousr]_[A-Za-z0-9]{20,}\b/u,
] as const;

export type UserStandardSourceKind = (typeof SOURCE_KINDS)[number];
export type UserStandardMediaType = (typeof MEDIA_TYPES)[number];

export interface UserStandardSourceMaterial {
	readonly kind: UserStandardSourceKind;
	readonly mediaType: UserStandardMediaType;
	readonly content: string;
	readonly observedAt: string;
	readonly uri?: string;
}

export interface UserStandardPassageProposal {
	readonly text: string;
}

export interface UserStandardSourceSnapshot extends UserStandardSourceMaterial {
	readonly contentDigest: Sha256Digest;
}

export interface UserStandardProposal {
	readonly name: string;
	readonly source: UserStandardSourceSnapshot;
	readonly passages: readonly UserStandardPassageProposal[];
}

export interface UserStandardPassage {
	readonly passageId: string;
	readonly text: string;
}

export interface UserStandardDefinition {
	readonly schemaVersion: typeof USER_STANDARD_SCHEMA_VERSION;
	readonly userStandardId: string;
	readonly standardDigest: Sha256Digest;
	readonly name: string;
	readonly source: UserStandardSourceSnapshot;
	readonly passages: readonly UserStandardPassage[];
}

export function createUserStandardSourceSnapshot(
	material: UserStandardSourceMaterial,
): UserStandardSourceSnapshot {
	return deepFreeze(
		normalizeSource({value: material, allowRuntimeFields: false}),
	);
}

export function createUserStandardDefinition(
	proposal: UserStandardProposal,
): UserStandardDefinition {
	const normalized = normalizeUserStandardProposal({value: proposal});
	const userStandardId = `user-standard:${canonicalJsonDigest(normalized).slice(
		"sha256:".length,
	)}`;
	return materializeUserStandardDefinition({
		...normalized,
		schemaVersion: USER_STANDARD_SCHEMA_VERSION,
		userStandardId,
	});
}

export function normalizeUserStandardDefinitions(
	value: readonly UserStandardDefinition[],
): UserStandardDefinition[] {
	if (!Array.isArray(value)) {
		throw new Error("User Standards must be an array.");
	}
	if (value.length > MAX_USER_STANDARDS) {
		throw new Error(
			`User Standards cannot exceed ${MAX_USER_STANDARDS} definitions per project.`,
		);
	}
	const normalized = value.map((definition) => {
		assertUserStandardDefinition(definition);
		return materializeUserStandardDefinition(cloneDefinition(definition));
	});
	assertUnique({
		values: normalized.map((definition) => definition.userStandardId),
		label: "User Standard ids",
	});
	return normalized.sort((...definitions) => {
		const [left, right] = definitions;
		return compareText(left.userStandardId, right.userStandardId);
	});
}

export function userStandardConfigurationDigest(
	definitions: readonly UserStandardDefinition[],
): Sha256Digest {
	return canonicalJsonDigest({
		schemaVersion: USER_STANDARD_SCHEMA_VERSION,
		definitions: normalizeUserStandardDefinitions(definitions),
	});
}

export function assertUserStandardDefinition(
	value: UserStandardDefinition,
): void {
	assertRecord({value, label: "User Standard definition"});
	assertKnownKeys({value, label: "User Standard definition", allowed: [
		"schemaVersion",
		"userStandardId",
		"standardDigest",
		"name",
		"source",
		"passages",
	]});
	if (value.schemaVersion !== USER_STANDARD_SCHEMA_VERSION) {
		throw new Error(
			`User Standard schemaVersion must be ${USER_STANDARD_SCHEMA_VERSION}.`,
		);
	}
	if (!USER_STANDARD_ID.test(value.userStandardId)) {
		throw new Error("User Standard userStandardId is invalid.");
	}
	if (!DIGEST.test(value.standardDigest)) {
		throw new Error("User Standard standardDigest is invalid.");
	}
	const normalized = normalizeUserStandardProposal({
		value,
		allowRuntimeFields: true,
	});
	const expected = canonicalJsonDigest({
		...normalized,
		schemaVersion: value.schemaVersion,
		userStandardId: value.userStandardId,
	});
	if (value.standardDigest !== expected) {
		throw new Error(
			`User Standard ${value.userStandardId} standardDigest does not match definition.`,
		);
	}
	const bytes = Buffer.byteLength(canonicalJson(value), "utf8");
	if (bytes > MAX_USER_STANDARD_BYTES) {
		throw new Error(
			`User Standard ${value.userStandardId} exceeds ${MAX_USER_STANDARD_BYTES} UTF-8 bytes.`,
		);
	}
}

function normalizeUserStandardProposal(input: {
	readonly value: UserStandardProposal | UserStandardDefinition;
	readonly allowRuntimeFields?: boolean;
}): {
	readonly name: string;
	readonly source: UserStandardSourceSnapshot;
	readonly passages: readonly UserStandardPassage[];
} {
	const {value, allowRuntimeFields = false} = input;
	assertRecord({value, label: "User Standard proposal"});
	assertKnownKeys({value, label: "User Standard proposal", allowed: [
		"name",
		"source",
		"passages",
		...(allowRuntimeFields
			? ["schemaVersion", "userStandardId", "standardDigest"]
			: []),
	]});
	const name = boundedText({
		value: value.name,
		label: "User Standard name",
		maximum: 80,
	});
	const source = normalizeSource({
		value: value.source,
		allowRuntimeFields: true,
	});
	const passages = normalizePassages({value: value.passages, source});
	return {
		name,
		source,
		passages,
	};
}

function normalizeSource(input: {
	readonly value: UserStandardSourceMaterial | UserStandardSourceSnapshot;
	readonly allowRuntimeFields: boolean;
}): UserStandardSourceSnapshot {
	const {value, allowRuntimeFields} = input;
	assertRecord({value, label: "User Standard source"});
	assertKnownKeys({value, label: "User Standard source", allowed: [
		"kind",
		"mediaType",
		"content",
		"observedAt",
		"uri",
		...(allowRuntimeFields ? ["contentDigest"] : []),
	]});
	if (!SOURCE_KINDS.includes(value.kind)) {
		throw new Error(`User Standard source kind ${String(value.kind)} is invalid.`);
	}
	if (!MEDIA_TYPES.includes(value.mediaType)) {
		throw new Error(
			`User Standard source mediaType ${String(value.mediaType)} is invalid.`,
		);
	}
	const content = boundedText({
		value: value.content,
		label: "User Standard source content",
		maximum: MAX_USER_STANDARD_CONTENT_CODE_POINTS,
	});
	const observedAt = canonicalIsoTimestamp(
		value.observedAt,
		"User Standard source observedAt",
	);
	const uri = value.kind === "url" ? normalizeUserStandardHttpsUri(value.uri) : undefined;
	if (value.kind === "inline" && value.uri !== undefined) {
		throw new Error("Inline User Standard source cannot contain uri.");
	}
	const semanticSource = {
		kind: value.kind,
		mediaType: value.mediaType,
		content,
		observedAt,
		...(uri ? {uri} : {}),
	};
	const contentDigest = canonicalJsonDigest(semanticSource);
	if (allowRuntimeFields && !("contentDigest" in value)) {
		throw new Error(
			"User Standard proposal requires a Runtime-materialized source snapshot.",
		);
	}
	if (
		allowRuntimeFields &&
		("contentDigest" in value) &&
		value.contentDigest !== contentDigest
	) {
		throw new Error("User Standard source contentDigest does not match source.");
	}
	return Object.freeze({
		...semanticSource,
		contentDigest,
	});
}

function normalizePassages(input: {
	readonly value: readonly (UserStandardPassageProposal | UserStandardPassage)[];
	readonly source: UserStandardSourceSnapshot;
}): UserStandardPassage[] {
	const {value, source} = input;
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error("User Standard passages must contain at least one passage.");
	}
	if (value.length > MAX_USER_STANDARD_PASSAGES) {
		throw new Error(
			`User Standard passages cannot exceed ${MAX_USER_STANDARD_PASSAGES} entries.`,
		);
	}
	const passages = value.map((entry) => {
		assertRecord({value: entry, label: "User Standard passage"});
		const record = entry as unknown as Record<string, unknown>;
		assertKnownKeys({
			value: record,
			label: "User Standard passage",
			allowed: ["text", "passageId"],
		});
		const text = boundedText({
			value: record.text,
			label: "User Standard passage text",
			maximum: 2_000,
		});
		if (!source.content.includes(text)) {
			throw new Error(
				"User Standard passage must occur in normalized source content.",
			);
		}
		const passageId = `standard-passage:${canonicalJsonDigest({
			sourceDigest: source.contentDigest,
			text,
		}).slice("sha256:".length)}`;
		if (record.passageId !== undefined && record.passageId !== passageId) {
			throw new Error("User Standard passageId does not match passage content.");
		}
		return Object.freeze({passageId, text});
	});
	assertUnique({
		values: passages.map((passage) => passage.passageId),
		label: "User Standard passage ids",
	});
	return passages.sort((...entries) => {
		const [left, right] = entries;
		return compareText(left.passageId, right.passageId);
	});
}

function materializeUserStandardDefinition(
	input: Omit<UserStandardDefinition, "standardDigest">,
): UserStandardDefinition {
	const normalized = normalizeUserStandardProposal({
		value: input,
		allowRuntimeFields: true,
	});
	const semanticDefinition = {
		...normalized,
		schemaVersion: input.schemaVersion,
		userStandardId: input.userStandardId,
	};
	const definition: UserStandardDefinition = {
		...semanticDefinition,
		standardDigest: canonicalJsonDigest(semanticDefinition),
	};
	assertUserStandardDefinition(definition);
	return deepFreeze(cloneDefinition(definition));
}

function cloneDefinition(
	definition: UserStandardDefinition,
): UserStandardDefinition {
	return {
		...definition,
		source: {...definition.source},
		passages: definition.passages.map((passage) => ({...passage})),
	};
}

export function normalizeUserStandardHttpsUri(value: unknown): string {
	if (typeof value !== "string" || !value.trim() || value.length > 2_048) {
		throw new Error("URL User Standard source must contain a bounded HTTPS URI.");
	}
	let parsed: URL;
	try {
		parsed = new URL(value.trim());
	} catch {
		throw new Error("URL User Standard source must contain a bounded HTTPS URI.");
	}
	if (parsed.protocol !== "https:") {
		throw new Error("URL User Standard source must contain an HTTPS URI.");
	}
	if (parsed.username || parsed.password) {
		throw new Error("User Standard source URI cannot contain credentials.");
	}
	if (parsed.hash) {
		throw new Error("User Standard source URI cannot contain a fragment.");
	}
	return parsed.toString();
}

function boundedText(input: {
	readonly value: unknown;
	readonly label: string;
	readonly maximum: number;
}): string {
	const {value, label, maximum} = input;
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
	if (!normalized) throw new Error(`${label} cannot be blank.`);
	if (PROHIBITED_TEXT.test(normalized)) {
		throw new Error(`${label} contains prohibited control characters.`);
	}
	if (PRIVATE_DATA_PATTERNS.some((pattern) => pattern.test(normalized))) {
		throw new Error("User Standard contains credential-like private data.");
	}
	if ([...normalized].length > maximum) {
		throw new Error(`${label} cannot exceed ${maximum} Unicode code points.`);
	}
	return normalized;
}

function assertKnownKeys(input: {
	readonly value: object;
	readonly label: string;
	readonly allowed: readonly string[];
}): void {
	const {value, label, allowed} = input;
	const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unsupported.length > 0) {
		throw new Error(
			`${label} received unsupported field${unsupported.length === 1 ? "" : "s"} ${unsupported.join(", ")}.`,
		);
	}
}

function assertRecord(input: {readonly value: unknown; readonly label: string}): void {
	const {value, label} = input;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
}

function assertUnique(input: {
	readonly values: readonly string[];
	readonly label: string;
}): void {
	const {values, label} = input;
	if (new Set(values).size !== values.length) {
		throw new Error(`${label} cannot contain duplicates.`);
	}
}

export function isUserStandardId(value: unknown): value is string {
	return typeof value === "string" && USER_STANDARD_ID.test(value);
}

export function isUserStandardPassageId(value: unknown): value is string {
	return typeof value === "string" && PASSAGE_ID.test(value);
}
