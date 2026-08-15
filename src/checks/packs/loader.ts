import {
	mkdtemp,
	mkdir,
	readdir,
	readFile,
	realpath,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve, sep} from "node:path";
import {parseDocument} from "yaml";
import {
	MAX_CHECK_PACKS_PER_STAGE,
	MAX_CHECKS_PER_GATE,
	MAX_PACK_SKILL_BYTES,
	MAX_PACK_SKILL_FILE_BYTES,
	MAX_PACK_SKILL_FILES,
	MAX_PACK_SKILL_MARKDOWN_BYTES,
	MAX_PACK_SKILL_PATH_DEPTH,
	MAX_PACK_SKILL_SET_BYTES,
	assertUniquePackSkillNames,
	createCheckPack,
	createCheckPackSnapshot,
	createPackSkillSetSnapshot,
	createPackSkillSnapshot,
	createPackagedCheck,
	type CheckPack,
	type CheckPackSnapshot,
	type PackSkillFileSnapshot,
	type PackSkillSetSnapshot,
	type PackSkillSnapshot,
} from "./contracts.ts";
import {
	CHECK_STAGES,
	isCheckStage,
	normalizeCheckDefinition,
	type CheckStage,
} from "../contracts.ts";
import {
	createGitCommandRunner,
	type GitCommandRunner,
} from "../../changes/trace/git-command.ts";
import {sha256Digest} from "../../utils/canonical-json.ts";

export const CHECK_PACK_ROOT = ".codewiki/check-packs" as const;
const MAXIMUM_DEFINITION_BYTES = 64 * 1024;
const MAXIMUM_MODEL_BYTES = 256 * 1024;
const MAXIMUM_CODE_BYTES = 1024 * 1024;

export type CheckPackLoadErrorCode =
	| "malformed_check"
	| "malformed_skill"
	| "unsafe_path"
	| "limit_exceeded";

export class CheckPackLoadError extends Error {
	readonly code: CheckPackLoadErrorCode;
	readonly stage: CheckStage;
	readonly packId?: string;
	readonly checkId?: string;
	readonly skillName?: string;

	constructor(input: {
		readonly code: CheckPackLoadErrorCode;
		readonly stage: CheckStage;
		readonly message: string;
		readonly packId?: string;
		readonly checkId?: string;
		readonly skillName?: string;
	}) {
		super(input.message);
		this.name = "CheckPackLoadError";
		this.code = input.code;
		this.stage = input.stage;
		if (input.packId) this.packId = input.packId;
		if (input.checkId) this.checkId = input.checkId;
		if (input.skillName) this.skillName = input.skillName;
	}
}

interface StagePackDirectory {
	readonly packId: string;
	readonly path: string;
}

async function stagePackDirectories(input: {
	readonly repoRoot: string;
	readonly stage: CheckStage;
}): Promise<Readonly<{root: string; packs: readonly StagePackDirectory[]}>> {
	assertStage(input.stage);
	const root = resolve(input.repoRoot, CHECK_PACK_ROOT, input.stage);
	const rootEntries = await readDirectoryOrEmpty(root);
	assertEntryLimit(
		rootEntries.length,
		MAX_CHECK_PACKS_PER_STAGE,
		input.stage,
		"Check Packs",
	);
	const packs: StagePackDirectory[] = [];
	for (const entry of sortedEntries(rootEntries)) {
		assertDirectoryEntry(entry, input.stage, "Check Pack");
		assertIdentifier(entry.name, input.stage, "Check Pack");
		const path = join(root, entry.name);
		await assertContainedRealPath(path, root, input.stage);
		packs.push({packId: entry.name, path});
	}
	return Object.freeze({root, packs: Object.freeze(packs)});
}

export async function loadCheckPackSnapshot(input: {
	readonly repoRoot: string;
	readonly stage: CheckStage;
}): Promise<CheckPackSnapshot> {
	const directories = await stagePackDirectories(input);
	const packs: CheckPack[] = [];
	let checkCount = 0;
	for (const pack of directories.packs) {
		const checkEntries = await readdir(pack.path, {withFileTypes: true});
		const checks = [];
		for (const checkEntry of sortedEntries(checkEntries)) {
			if (checkEntry.name === "skill") continue;
			assertDirectoryEntry(
				checkEntry,
				input.stage,
				`Check Pack ${pack.packId}`,
			);
			assertIdentifier(checkEntry.name, input.stage, "Check", pack.packId);
			checkCount += 1;
			assertEntryLimit(checkCount, MAX_CHECKS_PER_GATE, input.stage, "Checks");
			checks.push(
				await readCheck({
					stage: input.stage,
					packId: pack.packId,
					checkId: checkEntry.name,
					checkRoot: join(pack.path, checkEntry.name),
					stageRoot: directories.root,
				}),
			);
		}
		packs.push(createCheckPack({id: pack.packId, checks}));
	}
	return createCheckPackSnapshot({stage: input.stage, packs});
}

export async function loadPackSkillSetSnapshot(input: {
	readonly repoRoot: string;
	readonly stage: CheckStage;
}): Promise<PackSkillSetSnapshot> {
	const directories = await stagePackDirectories(input);
	const skills: PackSkillSnapshot[] = [];
	const names = new Map<string, PackSkillSnapshot>();
	let totalBytes = 0;
	for (const pack of directories.packs) {
		const packEntries = await readdir(pack.path, {withFileTypes: true});
		const skillEntry = packEntries.find((entry) => entry.name === "skill");
		if (!skillEntry) continue;
		assertSkillDirectoryEntry(
			skillEntry,
			input.stage,
			pack.packId,
			"reserved skill directory",
		);
		const skillContainerRoot = join(pack.path, "skill");
		await assertContainedRealPath(
			skillContainerRoot,
			directories.root,
			input.stage,
		);
		const skillEntries = await readdir(skillContainerRoot, {withFileTypes: true});
		if (skillEntries.length !== 1) {
			throw loadError(
				"malformed_skill",
				input.stage,
				`Check Pack ${pack.packId} skill directory must contain exactly one Skill directory.`,
				pack.packId,
			);
		}
		const [skillEntryRoot] = skillEntries;
		assertSkillDirectoryEntry(
			skillEntryRoot,
			input.stage,
			pack.packId,
			"Skill",
		);
		assertSkillName(skillEntryRoot.name, input.stage, pack.packId);
		const skillRoot = join(skillContainerRoot, skillEntryRoot.name);
		await assertContainedRealPath(skillRoot, directories.root, input.stage);
		const skill = await readPackSkill({
			stage: input.stage,
			packId: pack.packId,
			skillName: skillEntryRoot.name,
			skillRoot,
			stageRoot: directories.root,
		});
		const previous = names.get(skill.name);
		if (previous) {
			throw loadError(
				"malformed_skill",
				input.stage,
				`Pack Skill name ${skill.name} is not unique in stage ${input.stage}: ${previous.packId} and ${skill.packId}.`,
				skill.packId,
				undefined,
				skill.name,
			);
		}
		totalBytes += skill.totalBytes;
		if (totalBytes > MAX_PACK_SKILL_SET_BYTES) {
			throw loadError(
				"limit_exceeded",
				input.stage,
				`Pack Skill set exceeds ${MAX_PACK_SKILL_SET_BYTES} bytes.`,
				skill.packId,
				undefined,
				skill.name,
			);
		}
		names.set(skill.name, skill);
		skills.push(skill);
	}
	return createPackSkillSetSnapshot({stage: input.stage, skills});
}

export async function loadProjectPackSkillSnapshots(input: {
	readonly repoRoot: string;
}): Promise<readonly PackSkillSetSnapshot[]> {
	const snapshots = await Promise.all(
		CHECK_STAGES.map((stage) =>
			loadPackSkillSetSnapshot({repoRoot: input.repoRoot, stage}),
		),
	);
	return validatedProjectSkillSnapshots(snapshots);
}

export interface ProtectedPackSnapshotInput {
	readonly repoRoot: string;
	readonly protectedSourceHead: string;
	readonly stage: CheckStage;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}

async function readProtectedPackTree(
	input: ProtectedPackSnapshotInput,
	runner: GitCommandRunner,
	operation: string,
): Promise<Readonly<{stagePath: string; stdout: string}>> {
	assertStage(input.stage);
	assertGitObjectId(input.protectedSourceHead);
	const stagePath = `${CHECK_PACK_ROOT}/${input.stage}`;
	const tree = await runGitChecked(
		runner,
		{
			repoRoot: input.repoRoot,
			args: [
				"ls-tree",
				"-rz",
				"--full-tree",
				input.protectedSourceHead,
				"--",
				stagePath,
			],
			...(input.signal ? {signal: input.signal} : {}),
		},
		operation,
	);
	return Object.freeze({stagePath, stdout: tree.stdout});
}

async function readProtectedBlob(input: {
	readonly load: ProtectedPackSnapshotInput;
	readonly runner: GitCommandRunner;
	readonly entry: ProtectedEntry;
	readonly label: "Check Pack" | "Pack Skill";
}): Promise<Buffer> {
	const sizeResult = await runGitChecked(
		input.runner,
		{
			repoRoot: input.load.repoRoot,
			args: ["cat-file", "-s", input.entry.objectId],
			...(input.load.signal ? {signal: input.load.signal} : {}),
		},
		`read protected ${input.label} blob size ${input.entry.path}`,
	);
	const size = Number.parseInt(sizeResult.stdout.trim(), 10);
	if (
		!Number.isSafeInteger(size) ||
		size < 0 ||
		size > input.entry.maximumBytes
	) {
		throw loadError(
			"limit_exceeded",
			input.load.stage,
			`Protected ${input.label} file ${input.entry.path} exceeds ${input.entry.maximumBytes} bytes.`,
			input.entry.packId,
			undefined,
			input.entry.skillName,
		);
	}
	const blob = await runGitChecked(
		input.runner,
		{
			repoRoot: input.load.repoRoot,
			args: ["cat-file", "blob", input.entry.objectId],
			stdoutEncoding: "base64",
			...(input.load.signal ? {signal: input.load.signal} : {}),
		},
		`read protected ${input.label} blob ${input.entry.path}`,
	);
	const bytes = Buffer.from(blob.stdout, "base64");
	if (bytes.byteLength !== size || bytes.toString("base64") !== blob.stdout) {
		throw loadError(
			input.entry.skillName ? "malformed_skill" : "malformed_check",
			input.load.stage,
			`Protected ${input.label} file ${input.entry.path} could not be read byte-exactly.`,
			input.entry.packId,
			undefined,
			input.entry.skillName,
		);
	}
	return bytes;
}

export async function loadProtectedCheckPackSnapshot(
	input: ProtectedPackSnapshotInput,
): Promise<CheckPackSnapshot> {
	const runner = input.runner ?? createGitCommandRunner();
	const tree = await readProtectedPackTree(
		input,
		runner,
		"read protected Check Pack tree",
	);
	const protectedTree = parseProtectedCheckTree(
		tree.stdout,
		input.stage,
		tree.stagePath,
	);
	const materializationRoot = await mkdtemp(join(tmpdir(), "codewiki-check-packs-"));
	try {
		for (const packId of protectedTree.packIds) {
			await mkdir(
				join(materializationRoot, CHECK_PACK_ROOT, input.stage, packId),
				{recursive: true},
			);
		}
		for (const entry of protectedTree.entries) {
			const bytes = await readProtectedBlob({
				load: input,
				runner,
				entry,
				label: "Check Pack",
			});
			let content: string;
			try {
				content = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
			} catch {
				throw loadError(
					"malformed_check",
					input.stage,
					`Protected Check Pack file ${entry.path} must be valid UTF-8.`,
					entry.packId,
				);
			}
			const target = join(materializationRoot, entry.path);
			await mkdir(dirname(target), {recursive: true});
			await writeFile(target, content, "utf8");
		}
		return await loadCheckPackSnapshot({
			repoRoot: materializationRoot,
			stage: input.stage,
		});
	} finally {
		await rm(materializationRoot, {recursive: true, force: true});
	}
}

export async function loadProtectedPackSkillSetSnapshot(
	input: ProtectedPackSnapshotInput,
): Promise<PackSkillSetSnapshot> {
	const runner = input.runner ?? createGitCommandRunner();
	const tree = await readProtectedPackTree(
		input,
		runner,
		"read protected Pack Skill tree",
	);
	const entries = parseProtectedSkillEntries(
		tree.stdout,
		input.stage,
		tree.stagePath,
	);
	const groups = new Map<
		string,
		{
			readonly packId: string;
			readonly skillName: string;
			readonly files: PackSkillFileSnapshot[];
		}
	>();
	let totalBytes = 0;
	for (const entry of entries) {
		const bytes = await readProtectedBlob({
			load: input,
			runner,
			entry,
			label: "Pack Skill",
		});
		totalBytes += bytes.byteLength;
		if (totalBytes > MAX_PACK_SKILL_SET_BYTES) {
			throw loadError(
				"limit_exceeded",
				input.stage,
				`Protected Pack Skill set exceeds ${MAX_PACK_SKILL_SET_BYTES} bytes.`,
				entry.packId,
				undefined,
				entry.skillName,
			);
		}
		const groupKey = `${entry.packId}\0${entry.skillName}`;
		const group: {
			readonly packId: string;
			readonly skillName: string;
			readonly files: PackSkillFileSnapshot[];
		} = groups.get(groupKey) ?? {
			packId: entry.packId,
			skillName: entry.skillName,
			files: [],
		};
		group.files.push({
			path: entry.relativePath,
			executable: entry.executable,
			byteLength: bytes.byteLength,
			digest: sha256Digest(bytes),
			contentBase64: bytes.toString("base64"),
		});
		groups.set(groupKey, group);
	}
	const skills = [...groups.values()]
		.sort((left, right) => {
			const packOrder = left.packId.localeCompare(right.packId);
			return packOrder === 0
				? left.skillName.localeCompare(right.skillName)
				: packOrder;
		})
		.map((group) =>
			packSkillFromFiles(
				{
					stage: input.stage,
					packId: group.packId,
					skillName: group.skillName,
					skillRoot: "",
					stageRoot: "",
				},
				group.files,
			),
		);
	try {
		return createPackSkillSetSnapshot({stage: input.stage, skills});
	} catch (error) {
		const skill = skills[0];
		throw loadError(
			"malformed_skill",
			input.stage,
			errorMessage(error),
			skill?.packId,
			undefined,
			skill?.name,
		);
	}
}

export async function loadProtectedProjectPackSkillSnapshots(
	input: Omit<ProtectedPackSnapshotInput, "stage">,
): Promise<readonly PackSkillSetSnapshot[]> {
	const snapshots = await Promise.all(
		CHECK_STAGES.map((stage) =>
			loadProtectedPackSkillSetSnapshot({
				repoRoot: input.repoRoot,
				protectedSourceHead: input.protectedSourceHead,
				stage,
				...(input.runner ? {runner: input.runner} : {}),
				...(input.signal ? {signal: input.signal} : {}),
			}),
		),
	);
	return validatedProjectSkillSnapshots(snapshots);
}

interface ReadPackSkillInput {
	readonly stage: CheckStage;
	readonly packId: string;
	readonly skillName: string;
	readonly skillRoot: string;
	readonly stageRoot: string;
}

interface PackSkillReadState {
	readonly files: PackSkillFileSnapshot[];
	totalBytes: number;
}

interface ParsedPackSkillFrontmatter {
	readonly name: string;
	readonly description: string;
	readonly license?: string;
	readonly compatibility?: string;
	readonly metadata?: Readonly<Record<string, string>>;
	readonly allowedTools?: string;
}

async function readPackSkill(input: ReadPackSkillInput): Promise<PackSkillSnapshot> {
	const state: PackSkillReadState = {files: [], totalBytes: 0};
	await collectPackSkillFiles({
		...input,
		directory: input.skillRoot,
		relativeDirectory: "",
		state,
	});
	return packSkillFromFiles(input, state.files);
}

function packSkillFromFiles(
	input: ReadPackSkillInput,
	files: readonly PackSkillFileSnapshot[],
): PackSkillSnapshot {
	const markdownFile = files.find((file) => file.path === "SKILL.md");
	if (!markdownFile) {
		throw malformedSkill(input, `Pack Skill ${input.packId}/${input.skillName} requires root SKILL.md.`);
	}
	let markdown: string;
	try {
		markdown = new TextDecoder("utf-8", {fatal: true}).decode(
			Buffer.from(markdownFile.contentBase64, "base64"),
		);
	} catch {
		throw malformedSkill(input, `Pack Skill ${input.packId}/${input.skillName} SKILL.md must be valid UTF-8.`);
	}
	const frontmatter = parsePackSkillFrontmatter(markdown, input);
	try {
		return createPackSkillSnapshot({
			stage: input.stage,
			packId: input.packId,
			...frontmatter,
			files,
		});
	} catch (error) {
		throw malformedSkill(input, errorMessage(error));
	}
}

async function collectPackSkillFiles(input: ReadPackSkillInput & {
	readonly directory: string;
	readonly relativeDirectory: string;
	readonly state: PackSkillReadState;
}): Promise<void> {
	const entries = await readdir(input.directory, {withFileTypes: true});
	for (const entry of sortedEntries(entries)) {
		const relativePath = input.relativeDirectory
			? `${input.relativeDirectory}/${entry.name}`
			: entry.name;
		const absolutePath = join(input.directory, entry.name);
		if (entry.isSymbolicLink()) {
			throw loadError(
				"unsafe_path",
				input.stage,
				`Pack Skill path ${input.packId}/${input.skillName}/${relativePath} cannot be a symbolic link.`,
				input.packId,
				undefined,
				input.skillName,
			);
		}
		await assertContainedRealPath(absolutePath, input.stageRoot, input.stage);
		if (entry.isDirectory()) {
			if (relativePath.split("/").length >= MAX_PACK_SKILL_PATH_DEPTH) {
				throw malformedSkill(input, `Pack Skill path ${relativePath} is too deeply nested.`);
			}
			await collectPackSkillFiles({
				...input,
				directory: absolutePath,
				relativeDirectory: relativePath,
			});
			continue;
		}
		if (!entry.isFile()) {
			throw loadError(
				"unsafe_path",
				input.stage,
				`Pack Skill path ${input.packId}/${input.skillName}/${relativePath} must be a regular file or directory.`,
				input.packId,
				undefined,
				input.skillName,
			);
		}
		const bytes = await readFile(absolutePath);
		const maximumBytes =
			relativePath === "SKILL.md"
				? MAX_PACK_SKILL_MARKDOWN_BYTES
				: MAX_PACK_SKILL_FILE_BYTES;
		if (bytes.byteLength > maximumBytes) {
			throw loadError(
				"limit_exceeded",
				input.stage,
				`Pack Skill file ${relativePath} exceeds ${maximumBytes} bytes.`,
				input.packId,
				undefined,
				input.skillName,
			);
		}
		input.state.totalBytes += bytes.byteLength;
		if (input.state.totalBytes > MAX_PACK_SKILL_BYTES) {
			throw loadError(
				"limit_exceeded",
				input.stage,
				`Pack Skill ${input.packId}/${input.skillName} exceeds ${MAX_PACK_SKILL_BYTES} bytes.`,
				input.packId,
				undefined,
				input.skillName,
			);
		}
		if (input.state.files.length >= MAX_PACK_SKILL_FILES) {
			throw loadError(
				"limit_exceeded",
				input.stage,
				`Pack Skill ${input.packId}/${input.skillName} exceeds ${MAX_PACK_SKILL_FILES} files.`,
				input.packId,
				undefined,
				input.skillName,
			);
		}
		const fileStat = await stat(absolutePath);
		input.state.files.push({
			path: relativePath,
			executable: (fileStat.mode & 0o111) !== 0,
			byteLength: bytes.byteLength,
			digest: sha256Digest(bytes),
			contentBase64: bytes.toString("base64"),
		});
	}
}

function parsePackSkillFrontmatter(
	markdown: string,
	input: ReadPackSkillInput,
): ParsedPackSkillFrontmatter {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
	if (!match || !markdown.slice(match[0].length).trim()) {
		throw malformedSkill(
			input,
			`Pack Skill ${input.packId}/${input.skillName} requires YAML frontmatter followed by Markdown instructions.`,
		);
	}
	const document = parseDocument(match[1], {
		strict: true,
		uniqueKeys: true,
		schema: "core",
	});
	if (document.errors.length > 0 || document.warnings.length > 0) {
		throw malformedSkill(input, `Pack Skill ${input.packId}/${input.skillName} frontmatter is malformed.`);
	}
	let value: unknown;
	try {
		value = document.toJS({maxAliasCount: 0});
	} catch {
		throw malformedSkill(input, `Pack Skill ${input.packId}/${input.skillName} frontmatter cannot contain aliases.`);
	}
	if (!isPlainRecord(value)) {
		throw malformedSkill(input, `Pack Skill ${input.packId}/${input.skillName} frontmatter must be a map.`);
	}
	assertExactSkillFrontmatterKeys(value, input);
	const name = requiredSkillFrontmatterText(value.name, "name", input);
	if (name !== input.skillName) {
		throw malformedSkill(
			input,
			`Pack Skill frontmatter name ${name} must match parent directory ${input.skillName}.`,
		);
	}
	return {
		name,
		description: requiredSkillFrontmatterText(
			value.description,
			"description",
			input,
		),
		...optionalFrontmatterText(value.license, "license", input),
		...optionalFrontmatterText(
			value.compatibility,
			"compatibility",
			input,
		),
		...optionalSkillMetadata(value.metadata, input),
		...optionalAllowedTools(value["allowed-tools"], input),
	};
}

function assertExactSkillFrontmatterKeys(
	value: Record<string, unknown>,
	input: ReadPackSkillInput,
): void {
	const allowed = new Set([
		"name",
		"description",
		"license",
		"compatibility",
		"metadata",
		"allowed-tools",
	]);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw malformedSkill(input, `Pack Skill frontmatter field ${key} is unsupported; use metadata for extensions.`);
		}
	}
}

function requiredSkillFrontmatterText(
	value: unknown,
	field: string,
	input: ReadPackSkillInput,
): string {
	if (typeof value !== "string") {
		throw malformedSkill(input, `Pack Skill frontmatter ${field} must be text.`);
	}
	return value;
}

function optionalFrontmatterText(
	value: unknown,
	field: "license" | "compatibility",
	input: ReadPackSkillInput,
): Readonly<Record<"license" | "compatibility", string>> | object {
	if (value === undefined) return {};
	return {[field]: requiredSkillFrontmatterText(value, field, input)};
}

function optionalSkillMetadata(
	value: unknown,
	input: ReadPackSkillInput,
): {readonly metadata: Readonly<Record<string, string>>} | object {
	if (value === undefined) return {};
	if (!isPlainRecord(value)) {
		throw malformedSkill(input, "Pack Skill frontmatter metadata must be a string map.");
	}
	const metadata: Record<string, string> = Object.create(null);
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== "string") {
			throw malformedSkill(input, "Pack Skill frontmatter metadata must be a string map.");
		}
		metadata[key] = entry;
	}
	return {metadata};
}

function optionalAllowedTools(
	value: unknown,
	input: ReadPackSkillInput,
): {readonly allowedTools: string} | object {
	if (value === undefined) return {};
	return {
		allowedTools: requiredSkillFrontmatterText(value, "allowed-tools", input),
	};
}

function malformedSkill(input: ReadPackSkillInput, message: string): CheckPackLoadError {
	return loadError(
		"malformed_skill",
		input.stage,
		message,
		input.packId,
		undefined,
		input.skillName,
	);
}

function assertSkillDirectoryEntry(
	entry: {name: string; isDirectory(): boolean; isSymbolicLink(): boolean},
	stage: CheckStage,
	packId: string,
	label: string,
): void {
	if (entry.isSymbolicLink()) {
		throw loadError(
			"unsafe_path",
			stage,
			`Check Pack ${packId} ${label} cannot be a symbolic link.`,
			packId,
		);
	}
	if (!entry.isDirectory()) {
		throw loadError(
			"malformed_skill",
			stage,
			`Check Pack ${packId} ${label} must be a directory.`,
			packId,
		);
	}
}

function assertSkillName(value: string, stage: CheckStage, packId: string): void {
	if (value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
		throw loadError(
			"malformed_skill",
			stage,
			`Check Pack ${packId} Skill name ${value} is invalid.`,
			packId,
			undefined,
			value,
		);
	}
}

function validatedProjectSkillSnapshots(
	snapshots: readonly PackSkillSetSnapshot[],
): readonly PackSkillSetSnapshot[] {
	try {
		assertUniquePackSkillNames(snapshots);
	} catch (error) {
		const duplicate = firstDuplicateProjectSkill(snapshots);
		throw loadError(
			"malformed_skill",
			duplicate?.stage ?? "decision",
			errorMessage(error),
			duplicate?.packId,
			undefined,
			duplicate?.name,
		);
	}
	return Object.freeze([...snapshots]);
}

function firstDuplicateProjectSkill(
	snapshots: readonly PackSkillSetSnapshot[],
): PackSkillSnapshot | undefined {
	const names = new Set<string>();
	for (const snapshot of snapshots) {
		for (const skill of snapshot.skills) {
			if (names.has(skill.name)) return skill;
			names.add(skill.name);
		}
	}
	return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value) as unknown;
	return prototype === Object.prototype || prototype === null;
}

interface ReadCheckInput {
	readonly stage: CheckStage;
	readonly packId: string;
	readonly checkId: string;
	readonly checkRoot: string;
	readonly stageRoot: string;
}

async function readCheck(input: ReadCheckInput) {
	await assertContainedRealPath(input.checkRoot, input.stageRoot, input.stage);
	const entries = sortedEntries(await readdir(input.checkRoot, {withFileTypes: true}));
	for (const entry of entries) {
		if (!entry.isFile() || entry.isSymbolicLink()) {
			throw loadError(
				"unsafe_path",
				input.stage,
				`Check ${input.packId}/${input.checkId} may contain regular files only.`,
				input.packId,
				input.checkId,
			);
		}
	}
	const names = entries.map((entry) => entry.name);
	const implementations = names.filter(
		(name) => name === "CHECK.mjs" || name === "CHECK.md",
	);
	if (
		names.length !== 2 ||
		!names.includes("check.json") ||
		implementations.length !== 1
	) {
		throw loadError(
			"malformed_check",
			input.stage,
			`Check ${input.packId}/${input.checkId} requires check.json and exactly one CHECK.md or CHECK.mjs.`,
			input.packId,
			input.checkId,
		);
	}
	try {
		const definitionText = await readBoundedUtf8(
			join(input.checkRoot, "check.json"),
			MAXIMUM_DEFINITION_BYTES,
		);
		const definition = normalizeCheckDefinition(JSON.parse(definitionText));
		const implementationFileName = implementations[0] as "CHECK.mjs" | "CHECK.md";
		const implementationContent = await readBoundedUtf8(
			join(input.checkRoot, implementationFileName),
			implementationFileName === "CHECK.mjs"
				? MAXIMUM_CODE_BYTES
				: MAXIMUM_MODEL_BYTES,
		);
		return createPackagedCheck({
			stage: input.stage,
			packId: input.packId,
			checkId: input.checkId,
			definition,
			implementationFileName,
			implementationContent,
		});
	} catch (error) {
		if (error instanceof CheckPackLoadError) throw error;
		throw loadError(
			"malformed_check",
			input.stage,
			`Check ${input.packId}/${input.checkId} is invalid: ${errorMessage(error)}`,
			input.packId,
			input.checkId,
		);
	}
}

interface ProtectedRecord {
	readonly mode: string;
	readonly type: string;
	readonly objectId: string;
	readonly path: string;
	readonly parts: readonly string[];
}

function parseProtectedRecord(
	record: string,
	stage: CheckStage,
	stagePath: string,
): ProtectedRecord {
	const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/u.exec(record);
	if (!match) {
		throw loadError("malformed_check", stage, "Protected Check Pack tree is malformed.");
	}
	const [, mode, type, objectId, path] = match;
	if (!path.startsWith(`${stagePath}/`)) {
		throw loadError(
			"unsafe_path",
			stage,
			`Protected Check Pack path ${path} is outside stage ${stage}.`,
		);
	}
	const parts = path.slice(stagePath.length + 1).split("/");
	if (
		parts.length < 2 ||
		parts.some((part) => !part || part === "." || part === "..")
	) {
		throw loadError(
			"unsafe_path",
			stage,
			`Protected Check Pack path ${path} contains unsafe components.`,
		);
	}
	return {mode, type, objectId, path, parts};
}

function assertProtectedRegularBlob(
	record: ProtectedRecord,
	stage: CheckStage,
): void {
	if (
		record.type !== "blob" ||
		(record.mode !== "100644" && record.mode !== "100755")
	) {
		throw loadError(
			"unsafe_path",
			stage,
			`Protected Check Pack path ${record.path} must be a regular blob.`,
		);
	}
}

interface ProtectedEntry {
	readonly objectId: string;
	readonly path: string;
	readonly maximumBytes: number;
	readonly executable: boolean;
	readonly packId: string;
	readonly skillName?: string;
}

interface ProtectedCheckTree {
	readonly entries: readonly ProtectedEntry[];
	readonly packIds: readonly string[];
}

function parseProtectedCheckTree(
	stdout: string,
	stage: CheckStage,
	stagePath: string,
): ProtectedCheckTree {
	const entries: ProtectedEntry[] = [];
	const packIds = new Set<string>();
	for (const record of stdout.split("\0").filter(Boolean)) {
		const parsed = parseProtectedRecord(record, stage, stagePath);
		const [packId, directory, fileName] = parsed.parts;
		packIds.add(packId);
		if (directory === "skill") continue;
		if (parsed.parts.length !== 3) {
			throw loadError(
				"unsafe_path",
				stage,
				`Protected Check Pack path ${parsed.path} does not match stage/pack/check/file layout.`,
			);
		}
		assertProtectedRegularBlob(parsed, stage);
		entries.push({
			objectId: parsed.objectId,
			path: parsed.path,
			maximumBytes: fileByteLimit(fileName, stage),
			executable: parsed.mode === "100755",
			packId,
		});
	}
	if (entries.length > MAX_CHECKS_PER_GATE * 2) {
		throw loadError("limit_exceeded", stage, "Protected Check Pack tree contains too many Check files.");
	}
	return Object.freeze({
		entries: Object.freeze(entries.sort((left, right) => left.path.localeCompare(right.path))),
		packIds: Object.freeze([...packIds].sort((left, right) => left.localeCompare(right))),
	});
}

interface ProtectedSkillEntry extends ProtectedEntry {
	readonly packId: string;
	readonly skillName: string;
	readonly relativePath: string;
}

function parseProtectedSkillEntries(
	stdout: string,
	stage: CheckStage,
	stagePath: string,
): ProtectedSkillEntry[] {
	const entries: ProtectedSkillEntry[] = [];
	const counts = new Map<string, number>();
	for (const record of stdout.split("\0").filter(Boolean)) {
		const parsed = parseProtectedRecord(record, stage, stagePath);
		const [packId, directory, skillName, ...fileParts] = parsed.parts;
		if (directory !== "skill") continue;
		if (parsed.parts.length < 4 || fileParts.length === 0) {
			throw loadError(
				"unsafe_path",
				stage,
				`Protected Pack Skill path ${parsed.path} does not match pack/skill/name/file layout.`,
				packId,
				undefined,
				skillName,
			);
		}
		assertIdentifier(packId, stage, "Check Pack");
		assertSkillName(skillName, stage, packId);
		assertProtectedRegularBlob(parsed, stage);
		const relativePath = fileParts.join("/");
		if (fileParts.length > MAX_PACK_SKILL_PATH_DEPTH) {
			throw loadError(
				"limit_exceeded",
				stage,
				`Protected Pack Skill path ${relativePath} is too deeply nested.`,
				packId,
				undefined,
				skillName,
			);
		}
		const groupKey = `${packId}\0${skillName}`;
		const count = (counts.get(groupKey) ?? 0) + 1;
		if (count > MAX_PACK_SKILL_FILES) {
			throw loadError(
				"limit_exceeded",
				stage,
				`Pack Skill ${packId}/${skillName} exceeds ${MAX_PACK_SKILL_FILES} files.`,
				packId,
				undefined,
				skillName,
			);
		}
		counts.set(groupKey, count);
		entries.push({
			objectId: parsed.objectId,
			path: parsed.path,
			maximumBytes:
				relativePath === "SKILL.md"
					? MAX_PACK_SKILL_MARKDOWN_BYTES
					: MAX_PACK_SKILL_FILE_BYTES,
			executable: parsed.mode === "100755",
			packId,
			skillName,
			relativePath,
		});
	}
	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function fileByteLimit(name: string, stage: CheckStage): number {
	if (name === "check.json") return MAXIMUM_DEFINITION_BYTES;
	if (name === "CHECK.md") return MAXIMUM_MODEL_BYTES;
	if (name === "CHECK.mjs") return MAXIMUM_CODE_BYTES;
	throw loadError(
		"malformed_check",
		stage,
		`Protected Check Pack contains unsupported file ${name}.`,
	);
}

async function readBoundedUtf8(path: string, maximumBytes: number): Promise<string> {
	const metadata = await stat(path);
	if (!metadata.isFile() || metadata.size > maximumBytes) {
		throw new Error(`${path} exceeds ${maximumBytes} bytes.`);
	}
	const buffer = await readFile(path);
	return new TextDecoder("utf-8", {fatal: true}).decode(buffer);
}

async function assertContainedRealPath(
	path: string,
	root: string,
	stage: CheckStage,
): Promise<void> {
	const [resolvedPath, resolvedRoot] = await Promise.all([realpath(path), realpath(root)]);
	const child = relative(resolvedRoot, resolvedPath);
	if (!child || child.startsWith("..") || child.includes(`${sep}..${sep}`)) {
		throw loadError(
			"unsafe_path",
			stage,
			`Check Pack path ${path} escapes stage root.`,
		);
	}
}

async function readDirectoryOrEmpty(path: string) {
	try {
		return await readdir(path, {withFileTypes: true});
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}
}

function sortedEntries<T extends {name: string}>(entries: readonly T[]): T[] {
	return [...entries].sort((left, right) => left.name.localeCompare(right.name));
}

function assertDirectoryEntry(
	entry: {name: string; isDirectory(): boolean; isSymbolicLink(): boolean},
	stage: CheckStage,
	label: string,
): void {
	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw loadError(
			"unsafe_path",
			stage,
			`${label} entry ${entry.name} must be a real directory.`,
		);
	}
}

function assertIdentifier(
	value: string,
	stage: CheckStage,
	label: string,
	packId?: string,
): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
		throw loadError(
			"malformed_check",
			stage,
			`${label} identifier ${value} is invalid.`,
			packId,
		);
	}
}

function assertEntryLimit(
	actual: number,
	maximum: number,
	stage: CheckStage,
	label: string,
): void {
	if (actual > maximum) {
		throw loadError(
			"limit_exceeded",
			stage,
			`${label} exceed maximum ${maximum}.`,
		);
	}
}

function assertStage(stage: CheckStage): void {
	if (!isCheckStage(stage)) throw new Error(`Check stage ${String(stage)} is invalid.`);
}

function assertGitObjectId(value: string): void {
	if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value)) {
		throw new Error("Protected source head must be a Git object id.");
	}
}

async function runGitChecked(
	runner: GitCommandRunner,
	request: Parameters<GitCommandRunner>[0],
	operation: string,
) {
	const result = await runner(request);
	if (result.exitCode !== 0) {
		throw new Error(`Unable to ${operation}: ${result.stderr.trim() || "Git failed"}`);
	}
	return result;
}

function loadError(
	code: CheckPackLoadErrorCode,
	stage: CheckStage,
	message: string,
	...identity: [packId?: string, checkId?: string, skillName?: string]
): CheckPackLoadError {
	const [packId, checkId, skillName] = identity;
	return new CheckPackLoadError({
		code,
		stage,
		message,
		...(packId ? {packId} : {}),
		...(checkId ? {checkId} : {}),
		...(skillName ? {skillName} : {}),
	});
}

function isMissing(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as {code?: unknown}).code === "ENOENT"
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
