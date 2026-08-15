import {
	CHECK_DEFINITION_SCHEMA_VERSION,
	isCheckStage,
	normalizeCheckDefinition,
	qualifiedCheckId,
	type CheckDefinition,
	type CheckImplementationKind,
	type CheckStage,
} from "../contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	sha256Digest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const CHECK_PACK_SNAPSHOT_SCHEMA_VERSION = "2.0.0" as const;
export const PACK_SKILL_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;
export const PACK_SKILL_SET_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;
export const MAX_CHECK_PACKS_PER_STAGE = 64;
export const MAX_CHECKS_PER_GATE = 256;
export const MAX_PACK_SKILL_FILES = 128;
export const MAX_PACK_SKILL_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_PACK_SKILL_MARKDOWN_BYTES = 512 * 1024;
export const MAX_PACK_SKILL_BYTES = 8 * 1024 * 1024;
export const MAX_PACK_SKILL_SET_BYTES = 32 * 1024 * 1024;
export const MAX_PACK_SKILL_PATH_BYTES = 512;
export const MAX_PACK_SKILL_PATH_DEPTH = 16;

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
	readonly checkPackDigest: Sha256Digest;
}

export interface PackSkillFileSnapshot {
	readonly path: string;
	readonly executable: boolean;
	readonly byteLength: number;
	readonly digest: Sha256Digest;
	readonly contentBase64: string;
}

export interface PackSkillSnapshot {
	readonly schemaVersion: typeof PACK_SKILL_SNAPSHOT_SCHEMA_VERSION;
	readonly stage: CheckStage;
	readonly packId: string;
	readonly name: string;
	readonly description: string;
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata?: Readonly<Record<string, string>>;
	readonly allowedTools?: string;
	readonly files: readonly PackSkillFileSnapshot[];
	readonly fileCount: number;
	readonly totalBytes: number;
	readonly skillDigest: Sha256Digest;
}

export interface PackSkillSetSnapshot {
	readonly schemaVersion: typeof PACK_SKILL_SET_SNAPSHOT_SCHEMA_VERSION;
	readonly stage: CheckStage;
	readonly skills: readonly PackSkillSnapshot[];
	readonly skillCount: number;
	readonly totalBytes: number;
	readonly skillSetDigest: Sha256Digest;
}

export type CreatePackSkillSnapshotInput = Omit<
	PackSkillSnapshot,
	"schemaVersion" | "fileCount" | "totalBytes" | "skillDigest"
>;

export interface CreatePackagedCheckInput {
	readonly stage: CheckStage;
	readonly packId: string;
	readonly checkId: string;
	readonly definition: CheckDefinition;
	readonly implementationFileName: "CHECK.mjs" | "CHECK.md";
	readonly implementationContent: string;
}

export function createPackSkillSnapshot(
	input: CreatePackSkillSnapshotInput,
): PackSkillSnapshot {
	assertSkillStage(input.stage);
	qualifiedCheckId(input.packId, "pack-skill");
	const name = normalizedSkillName(input.name);
	const description = normalizedSkillText(
		input.description,
		"Pack Skill description",
		1_024,
	);
	const license = optionalSkillText(input.license, "Pack Skill license", 1_024);
	const compatibility = optionalSkillText(
		input.compatibility,
		"Pack Skill compatibility",
		500,
	);
	const metadata = normalizedSkillMetadata(input.metadata);
	const allowedTools = optionalSkillTools(input.allowedTools);
	if (!Array.isArray(input.files) || input.files.length > MAX_PACK_SKILL_FILES) {
		throw new Error(
			`Pack Skill ${input.packId}/${name} exceeds ${MAX_PACK_SKILL_FILES} files.`,
		);
	}
	const files = input.files.map(normalizedSkillFile).sort(compareSkillFiles);
	const seen = new Set<string>();
	let totalBytes = 0;
	for (const file of files) {
		if (seen.has(file.path)) {
			throw new Error(`Pack Skill ${input.packId}/${name} contains duplicate file ${file.path}.`);
		}
		seen.add(file.path);
		totalBytes += file.byteLength;
	}
	if (!seen.has("SKILL.md")) {
		throw new Error(`Pack Skill ${input.packId}/${name} requires root SKILL.md.`);
	}
	if (totalBytes > MAX_PACK_SKILL_BYTES) {
		throw new Error(
			`Pack Skill ${input.packId}/${name} exceeds ${MAX_PACK_SKILL_BYTES} bytes.`,
		);
	}
	const body = {
		schemaVersion: PACK_SKILL_SNAPSHOT_SCHEMA_VERSION,
		stage: input.stage,
		packId: input.packId,
		name,
		description,
		...(license === undefined ? {} : {license}),
		...(compatibility === undefined ? {} : {compatibility}),
		...(metadata === undefined ? {} : {metadata}),
		...(allowedTools === undefined ? {} : {allowedTools}),
		files,
		fileCount: files.length,
		totalBytes,
	};
	return immutable({...body, skillDigest: canonicalJsonDigest(body)});
}

export function assertPackSkillSnapshot(
	snapshot: PackSkillSnapshot,
	expectedStage?: CheckStage,
): void {
	assertExactKeys(
		snapshot,
		[
			"schemaVersion",
			"stage",
			"packId",
			"name",
			"description",
			"license",
			"compatibility",
			"metadata",
			"allowedTools",
			"files",
			"fileCount",
			"totalBytes",
			"skillDigest",
		],
		"Pack Skill snapshot",
	);
	if (snapshot.schemaVersion !== PACK_SKILL_SNAPSHOT_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported Pack Skill snapshot version ${String(snapshot.schemaVersion)}.`,
		);
	}
	if (expectedStage !== undefined && snapshot.stage !== expectedStage) {
		throw new Error(
			`Pack Skill snapshot stage ${snapshot.stage} does not match ${expectedStage}.`,
		);
	}
	assertSha256Digest(snapshot.skillDigest, "Pack Skill digest");
	const expected = createPackSkillSnapshot(snapshot);
	if (snapshot.skillDigest !== expected.skillDigest) {
		throw new Error(`Pack Skill ${snapshot.packId}/${snapshot.name} digest does not match its content.`);
	}
	if (
		snapshot.fileCount !== expected.fileCount ||
		snapshot.totalBytes !== expected.totalBytes
	) {
		throw new Error(`Pack Skill ${snapshot.packId}/${snapshot.name} file totals do not match.`);
	}
}

export function createPackSkillSetSnapshot(input: {
	readonly stage: CheckStage;
	readonly skills: readonly PackSkillSnapshot[];
}): PackSkillSetSnapshot {
	assertSkillStage(input.stage);
	if (!Array.isArray(input.skills) || input.skills.length > MAX_CHECK_PACKS_PER_STAGE) {
		throw new Error(
			`Pack Skill set exceeds ${MAX_CHECK_PACKS_PER_STAGE} Skills.`,
		);
	}
	const skills = [...input.skills].sort(comparePackSkills);
	const packIds = new Set<string>();
	const names = new Set<string>();
	let totalBytes = 0;
	for (const skill of skills) {
		assertPackSkillSnapshot(skill, input.stage);
		if (packIds.has(skill.packId)) {
			throw new Error(`Check Pack ${skill.packId} contains more than one Pack Skill.`);
		}
		if (names.has(skill.name)) {
			throw new Error(`Pack Skill name ${skill.name} is not unique in stage ${input.stage}.`);
		}
		packIds.add(skill.packId);
		names.add(skill.name);
		totalBytes += skill.totalBytes;
	}
	if (totalBytes > MAX_PACK_SKILL_SET_BYTES) {
		throw new Error(`Pack Skill set exceeds ${MAX_PACK_SKILL_SET_BYTES} bytes.`);
	}
	const body = {
		schemaVersion: PACK_SKILL_SET_SNAPSHOT_SCHEMA_VERSION,
		stage: input.stage,
		skills,
		skillCount: skills.length,
		totalBytes,
	};
	const identity = {
		...body,
		skills: skills.map((skill) => ({
			packId: skill.packId,
			name: skill.name,
			skillDigest: skill.skillDigest,
		})),
	};
	return immutable({...body, skillSetDigest: canonicalJsonDigest(identity)});
}

export function assertPackSkillSetSnapshot(
	snapshot: PackSkillSetSnapshot,
	expectedStage?: CheckStage,
): void {
	assertExactKeys(
		snapshot,
		[
			"schemaVersion",
			"stage",
			"skills",
			"skillCount",
			"totalBytes",
			"skillSetDigest",
		],
		"Pack Skill set snapshot",
	);
	if (snapshot.schemaVersion !== PACK_SKILL_SET_SNAPSHOT_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported Pack Skill set snapshot version ${String(snapshot.schemaVersion)}.`,
		);
	}
	if (expectedStage !== undefined && snapshot.stage !== expectedStage) {
		throw new Error(
			`Pack Skill set stage ${snapshot.stage} does not match ${expectedStage}.`,
		);
	}
	assertSha256Digest(snapshot.skillSetDigest, "Pack Skill set digest");
	const expected = createPackSkillSetSnapshot({
		stage: snapshot.stage,
		skills: snapshot.skills,
	});
	if (snapshot.skillSetDigest !== expected.skillSetDigest) {
		throw new Error("Pack Skill set digest does not match its content.");
	}
	if (
		snapshot.skillCount !== expected.skillCount ||
		snapshot.totalBytes !== expected.totalBytes
	) {
		throw new Error("Pack Skill set totals do not match its Skills.");
	}
}

export function assertUniquePackSkillNames(
	snapshots: readonly PackSkillSetSnapshot[],
): void {
	const stages = new Set<CheckStage>();
	const names = new Map<string, PackSkillSnapshot>();
	for (const snapshot of snapshots) {
		assertPackSkillSetSnapshot(snapshot);
		if (stages.has(snapshot.stage)) {
			throw new Error(`Project Pack Skill snapshots repeat stage ${snapshot.stage}.`);
		}
		stages.add(snapshot.stage);
		for (const skill of snapshot.skills) {
			const previous = names.get(skill.name);
			if (previous) {
				throw new Error(
					`Pack Skill name ${skill.name} is not project-unique: ${previous.stage}/${previous.packId} and ${skill.stage}/${skill.packId}.`,
				);
			}
			names.set(skill.name, skill);
		}
	}
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
	return immutable({...body, checkPackDigest: canonicalJsonDigest(body)});
}

export function assertCheckPackSnapshot(
	snapshot: CheckPackSnapshot,
	expectedStage?: CheckStage,
): void {
	assertExactKeys(
		snapshot,
		["schemaVersion", "stage", "packs", "checkCount", "checkPackDigest"],
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
	if (snapshot.checkPackDigest !== expected.checkPackDigest) {
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

function assertSkillStage(stage: CheckStage): void {
	if (!isCheckStage(stage)) {
		throw new Error(`Pack Skill stage ${String(stage)} is invalid.`);
	}
}

function normalizedSkillName(value: string): string {
	if (
		typeof value !== "string" ||
		value.length > 64 ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)
	) {
		throw new Error(
			"Pack Skill name must contain 1-64 lowercase letters, digits, or single hyphens.",
		);
	}
	return value;
}

function normalizedSkillText(
	value: string,
	label: string,
	maximumLength: number,
): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be text.`);
	}
	const normalized = value.trim();
	if (!normalized || normalized.length > maximumLength) {
		throw new Error(`${label} must contain 1-${maximumLength} characters.`);
	}
	return normalized;
}

function optionalSkillText(
	value: string | undefined,
	label: string,
	maximumLength: number,
): string | undefined {
	return value === undefined
		? undefined
		: normalizedSkillText(value, label, maximumLength);
}

function optionalSkillTools(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	return normalizedSkillText(value, "Pack Skill allowed-tools", 4_096)
		.split(/\s+/u)
		.join(" ");
}

function normalizedSkillMetadata(
	value: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
	if (value === undefined) return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Pack Skill metadata must be a string map.");
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new Error("Pack Skill metadata cannot contain symbol keys.");
	}
	const keys = Object.getOwnPropertyNames(value).sort(compareText);
	if (keys.length > 64) {
		throw new Error("Pack Skill metadata exceeds 64 entries.");
	}
	const normalized: Record<string, string> = Object.create(null);
	for (const key of keys) {
		normalized[key] = normalizedSkillMetadataEntry(value, key);
	}
	return immutable(normalized);
}

function normalizedSkillMetadataEntry(
	value: Readonly<Record<string, string>>,
	key: string,
): string {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (
		!descriptor ||
		!descriptor.enumerable ||
		!("value" in descriptor) ||
		typeof descriptor.value !== "string" ||
		!key ||
		key.length > 128 ||
		descriptor.value.length > 1_024
	) {
		throw new Error("Pack Skill metadata requires bounded string keys and values.");
	}
	return descriptor.value;
}

function normalizedSkillFile(
	file: PackSkillFileSnapshot,
): PackSkillFileSnapshot {
	assertExactKeys(
		file,
		["path", "executable", "byteLength", "digest", "contentBase64"],
		"Pack Skill file",
	);
	const path = normalizedSkillPath(file.path);
	if (typeof file.executable !== "boolean") {
		throw new Error(`Pack Skill file ${path} executable flag must be boolean.`);
	}
	const maximumBytes =
		path === "SKILL.md"
			? MAX_PACK_SKILL_MARKDOWN_BYTES
			: MAX_PACK_SKILL_FILE_BYTES;
	if (
		!Number.isSafeInteger(file.byteLength) ||
		file.byteLength < 0 ||
		file.byteLength > maximumBytes
	) {
		throw new Error(`Pack Skill file ${path} exceeds ${maximumBytes} bytes.`);
	}
	if (typeof file.contentBase64 !== "string") {
		throw new Error(`Pack Skill file ${path} content must be canonical base64.`);
	}
	const bytes = Buffer.from(file.contentBase64, "base64");
	if (
		bytes.toString("base64") !== file.contentBase64 ||
		bytes.byteLength !== file.byteLength
	) {
		throw new Error(`Pack Skill file ${path} content is not canonical base64.`);
	}
	assertSha256Digest(file.digest, `Pack Skill file ${path} digest`);
	if (file.digest !== sha256Digest(bytes)) {
		throw new Error(`Pack Skill file ${path} digest does not match its bytes.`);
	}
	return immutable({
		path,
		executable: file.executable,
		byteLength: file.byteLength,
		digest: file.digest,
		contentBase64: file.contentBase64,
	});
}

function normalizedSkillPath(value: string): string {
	if (
		typeof value !== "string" ||
		!value ||
		value.startsWith("/") ||
		value.includes("\\") ||
		Buffer.byteLength(value, "utf8") > MAX_PACK_SKILL_PATH_BYTES
	) {
		throw new Error("Pack Skill file path is invalid or too long.");
	}
	const parts = value.split("/");
	if (
		parts.length > MAX_PACK_SKILL_PATH_DEPTH ||
		parts.some(
			(part) =>
				!part ||
				part === "." ||
				part === ".." ||
				/[\u0000-\u001f\u007f]/u.test(part),
		)
	) {
		throw new Error(`Pack Skill file path ${value} is unsafe.`);
	}
	return value;
}

function compareSkillFiles(
	left: PackSkillFileSnapshot,
	right: PackSkillFileSnapshot,
): number {
	return compareText(left.path, right.path);
}

function comparePackSkills(
	left: PackSkillSnapshot,
	right: PackSkillSnapshot,
): number {
	const packOrder = compareText(left.packId, right.packId);
	return packOrder === 0 ? compareText(left.name, right.name) : packOrder;
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
