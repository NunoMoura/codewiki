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
import {
	createCheckPack,
	createCheckPackSnapshot,
	createPackagedCheck,
	type CheckPack,
	type CheckPackSnapshot,
} from "./contracts.ts";
import {
	isCheckStage,
	normalizeCheckDefinition,
	type CheckStage,
} from "../contracts.ts";
import {
	createGitCommandRunner,
	type GitCommandRunner,
} from "../../changes/trace/git-command.ts";

export const CHECK_PACK_ROOT = ".codewiki/check-packs" as const;
const MAXIMUM_PACKS = 32;
const MAXIMUM_CHECKS = 256;
const MAXIMUM_DEFINITION_BYTES = 64 * 1024;
const MAXIMUM_MODEL_BYTES = 256 * 1024;
const MAXIMUM_CODE_BYTES = 1024 * 1024;

export type CheckPackLoadErrorCode =
	| "malformed_check"
	| "unsafe_path"
	| "limit_exceeded";

export class CheckPackLoadError extends Error {
	readonly code: CheckPackLoadErrorCode;
	readonly stage: CheckStage;
	readonly packId?: string;
	readonly checkId?: string;

	constructor(input: {
		readonly code: CheckPackLoadErrorCode;
		readonly stage: CheckStage;
		readonly message: string;
		readonly packId?: string;
		readonly checkId?: string;
	}) {
		super(input.message);
		this.name = "CheckPackLoadError";
		this.code = input.code;
		this.stage = input.stage;
		if (input.packId) this.packId = input.packId;
		if (input.checkId) this.checkId = input.checkId;
	}
}

export async function loadCheckPackSnapshot(input: {
	readonly repoRoot: string;
	readonly stage: CheckStage;
}): Promise<CheckPackSnapshot> {
	assertStage(input.stage);
	const root = resolve(input.repoRoot, CHECK_PACK_ROOT, input.stage);
	const rootEntries = await readDirectoryOrEmpty(root);
	assertEntryLimit(rootEntries.length, MAXIMUM_PACKS, input.stage, "Check Packs");
	const packs: CheckPack[] = [];
	let checkCount = 0;
	for (const packEntry of sortedEntries(rootEntries)) {
		assertDirectoryEntry(packEntry, input.stage, "Check Pack");
		assertIdentifier(packEntry.name, input.stage, "Check Pack");
		const packRoot = join(root, packEntry.name);
		await assertContainedRealPath(packRoot, root, input.stage);
		const checkEntries = await readdir(packRoot, {withFileTypes: true});
		const checks = [];
		for (const checkEntry of sortedEntries(checkEntries)) {
			assertDirectoryEntry(
				checkEntry,
				input.stage,
				`Check Pack ${packEntry.name}`,
			);
			assertIdentifier(checkEntry.name, input.stage, "Check", packEntry.name);
			checkCount += 1;
			assertEntryLimit(checkCount, MAXIMUM_CHECKS, input.stage, "Checks");
			checks.push(
				await readCheck({
					stage: input.stage,
					packId: packEntry.name,
					checkId: checkEntry.name,
					checkRoot: join(packRoot, checkEntry.name),
					stageRoot: root,
				}),
			);
		}
		packs.push(createCheckPack({id: packEntry.name, checks}));
	}
	return createCheckPackSnapshot({stage: input.stage, packs});
}

export async function loadProtectedCheckPackSnapshot(input: {
	readonly repoRoot: string;
	readonly protectedSourceHead: string;
	readonly stage: CheckStage;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}): Promise<CheckPackSnapshot> {
	assertStage(input.stage);
	assertGitObjectId(input.protectedSourceHead);
	const runner = input.runner ?? createGitCommandRunner();
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
		"read protected Check Pack tree",
	);
	const entries = parseProtectedEntries(tree.stdout, input.stage, stagePath);
	const materializationRoot = await mkdtemp(join(tmpdir(), "codewiki-check-packs-"));
	try {
		for (const entry of entries) {
			const sizeResult = await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: ["cat-file", "-s", entry.objectId],
					...(input.signal ? {signal: input.signal} : {}),
				},
				`read protected Check Pack blob size ${entry.path}`,
			);
			const size = Number.parseInt(sizeResult.stdout.trim(), 10);
			if (!Number.isSafeInteger(size) || size < 0 || size > entry.maximumBytes) {
				throw loadError(
					"limit_exceeded",
					input.stage,
					`Protected Check Pack file ${entry.path} exceeds its byte limit.`,
				);
			}
			const blob = await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: ["cat-file", "blob", entry.objectId],
					...(input.signal ? {signal: input.signal} : {}),
				},
				`read protected Check Pack blob ${entry.path}`,
			);
			if (Buffer.byteLength(blob.stdout, "utf8") !== size) {
				throw loadError(
					"malformed_check",
					input.stage,
					`Protected Check Pack file ${entry.path} must be valid UTF-8.`,
				);
			}
			const target = join(materializationRoot, entry.path);
			await mkdir(dirname(target), {recursive: true});
			await writeFile(target, blob.stdout, "utf8");
		}
		return await loadCheckPackSnapshot({
			repoRoot: materializationRoot,
			stage: input.stage,
		});
	} finally {
		await rm(materializationRoot, {recursive: true, force: true});
	}
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

interface ProtectedEntry {
	readonly objectId: string;
	readonly path: string;
	readonly maximumBytes: number;
}

function parseProtectedEntries(
	stdout: string,
	stage: CheckStage,
	stagePath: string,
): ProtectedEntry[] {
	const entries: ProtectedEntry[] = [];
	for (const record of stdout.split("\0").filter(Boolean)) {
		const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/u.exec(record);
		if (!match) {
			throw loadError("malformed_check", stage, "Protected Check Pack tree is malformed.");
		}
		const [, mode, type, objectId, path] = match;
		if (mode === "120000" || type !== "blob") {
			throw loadError(
				"unsafe_path",
				stage,
				`Protected Check Pack path ${path} must be a regular blob.`,
			);
		}
		const suffix = path.slice(stagePath.length + 1);
		const parts = suffix.split("/");
		if (
			!path.startsWith(`${stagePath}/`) ||
			parts.length !== 3 ||
			!parts.every((part) => part && part !== "." && part !== "..")
		) {
			throw loadError(
				"unsafe_path",
				stage,
				`Protected Check Pack path ${path} does not match stage/pack/check/file layout.`,
			);
		}
		entries.push({
			objectId,
			path,
			maximumBytes: fileByteLimit(parts[2], stage),
		});
	}
	if (entries.length > MAXIMUM_CHECKS * 2) {
		throw loadError("limit_exceeded", stage, "Protected Check Pack tree contains too many files.");
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
	packId?: string,
	checkId?: string,
): CheckPackLoadError {
	return new CheckPackLoadError({
		code,
		stage,
		message,
		...(packId ? {packId} : {}),
		...(checkId ? {checkId} : {}),
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
