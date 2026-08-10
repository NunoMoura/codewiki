import {mkdir, open, readFile, readdir, realpath, rm} from "node:fs/promises";
import {dirname, join, resolve} from "node:path";
import type {TriagePreferenceBinding} from "../../changes/triage/policy.ts";
import {
	createGitCommandRunner,
	type GitCommandRunner,
} from "../../change-trace/git-command.ts";
import {
	configFileToPartialWikiConfig,
	loadWikiConfigFile,
	writeWikiConfigFile,
} from "../../project/config-file.ts";
import {wikiConfigDigest} from "../../project/config-digest.ts";
import {
	canonicalJsonDigest,
	sha256Digest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	resolveWikiConfig,
	type WikiConfig,
} from "../../project/config.ts";
import {
	assertCheckPackIdentifier,
	CHECK_PACK_CONFIG_PROTOCOL_VERSION,
	createCustomCheckConfigState,
	createProtectedCustomCheckConfigSnapshot,
	normalizeCheckOverrideConfiguration,
	normalizeCheckPackConfiguration,
	resolveCheckConfiguration,
	type CheckEvaluatorKind,
	type CheckPackConfiguration,
	type CustomCheckConfigState,
	type ProtectedCustomCheckConfigSnapshot,
	type ResolvedCheckConfiguration,
} from "./configuration.ts";
import type {CustomCheckDefinition} from "./contracts.ts";
import type {UserStandardDefinition} from "./user-standards.ts";
import {
	CustomCheckMutationError,
	type CustomCheckMutationStore,
} from "./mutations.ts";

const CUSTOM_CHECK_CONFIG_LOCK_PATH =
	".codewiki/runtime/locks/custom-check-config.lock";
const PROTECTED_CONFIG_PATH = ".codewiki/config.json";
const CHECK_PACK_ROOT = ".codewiki/check-packs";
const MAX_CHECK_PACKS = 64;
const MAX_CHECKS_PER_PACK = 128;
const MAX_CHECK_CONFIG_BYTES = 65_536;
const MAX_CHECK_EVALUATOR_BYTES = 262_144;

export interface ProjectCheckDefinition {
	readonly id: string;
	readonly bindingId: string;
	readonly checkId: string;
	readonly evaluatorKind: CheckEvaluatorKind;
	readonly evaluatorPath: string;
	readonly evaluatorDigest: Sha256Digest;
	readonly evaluatorSource: string;
	readonly configuration: ResolvedCheckConfiguration;
	readonly digest: Sha256Digest;
}

export interface ProjectCheckPack {
	readonly bindingId: string;
	readonly configuration: CheckPackConfiguration;
	readonly configurationDigest: Sha256Digest;
	readonly checks: readonly ProjectCheckDefinition[];
	readonly digest: Sha256Digest;
}

export interface ProjectCheckPackSnapshot {
	readonly version: typeof CHECK_PACK_CONFIG_PROTOCOL_VERSION;
	readonly packs: readonly ProjectCheckPack[];
	readonly digest: Sha256Digest;
}

export function createWikiConfigCustomCheckStore(
	repoRoot: string,
): CustomCheckMutationStore {
	return Object.freeze({
		async load() {
			return configState(await loadWikiConfigFile(repoRoot));
		},
		async preview(
			input: Parameters<CustomCheckMutationStore["preview"]>[0],
		) {
			const current = await loadWikiConfigFile(repoRoot);
			if (wikiConfigDigest(current) !== input.current.projectConfigDigest) {
				throw conflict("Project configuration changed while preparing the mutation.");
			}
			return configState(
				nextConfig({
					current,
					userStandards: input.userStandards,
					triagePreferences: input.triagePreferences,
					customChecks: input.customChecks,
				}),
			);
		},
		async compareAndSwap(
			input: Parameters<CustomCheckMutationStore["compareAndSwap"]>[0],
		) {
			return withCustomCheckConfigLock(repoRoot, async () => {
				const current = await loadWikiConfigFile(repoRoot);
				if (wikiConfigDigest(current) !== input.expectedConfigDigest) {
					throw conflict("Project configuration changed before mutation commit.");
				}
				const next = nextConfig({
					current,
					userStandards: input.userStandards,
					triagePreferences: input.triagePreferences,
					customChecks: input.customChecks,
				});
				if (wikiConfigDigest(next) !== input.expectedNextConfigDigest) {
					throw conflict("Prepared Custom Check configuration no longer matches.");
				}
				await writeWikiConfigFile(repoRoot, next);
				const persisted = await loadWikiConfigFile(repoRoot);
				const state = configState(persisted);
				if (state.projectConfigDigest !== input.expectedNextConfigDigest) {
					throw conflict("Persisted Custom Check configuration failed verification.");
				}
				return state;
			});
		},
	});
}

export async function discoverProjectCheckPacks(input: {
	readonly repoRoot: string;
	readonly projectChecks: WikiConfig["checks"];
}): Promise<ProjectCheckPackSnapshot> {
	const repoRoot = await realpath(input.repoRoot);
	const packsRoot = join(repoRoot, CHECK_PACK_ROOT);
	let entries;
	try {
		entries = await readdir(packsRoot, {withFileTypes: true});
	} catch (error) {
		if (isMissing(error)) return emptyProjectCheckPackSnapshot();
		throw error;
	}
	await assertExactRealPath(packsRoot, join(repoRoot, CHECK_PACK_ROOT), "Check Pack root");
	if (entries.length > MAX_CHECK_PACKS) {
		throw new Error(`Project cannot contain more than ${MAX_CHECK_PACKS} Check Packs.`);
	}
	const packs: ProjectCheckPack[] = [];
	for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
		if (!entry.isDirectory() || entry.isSymbolicLink()) {
			throw new Error(`Check Pack root contains unsupported entry ${entry.name}.`);
		}
		const bindingId = assertCheckPackIdentifier(entry.name, "Check Pack binding id");
		packs.push(
			await readProjectCheckPack({repoRoot, packsRoot, bindingId, projectChecks: input.projectChecks}),
		);
	}
	const frozenPacks = Object.freeze(packs);
	return Object.freeze({
		version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
		packs: frozenPacks,
		digest: canonicalJsonDigest({
			version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
			packs: packs.map((pack) => ({bindingId: pack.bindingId, digest: pack.digest})),
		}),
	});
}

export async function loadProjectCheckPacks(
	repoRoot: string,
): Promise<ProjectCheckPackSnapshot> {
	const config = await loadWikiConfigFile(repoRoot);
	return discoverProjectCheckPacks({repoRoot, projectChecks: config.checks});
}

async function readProjectCheckPack(input: {
	readonly repoRoot: string;
	readonly packsRoot: string;
	readonly bindingId: string;
	readonly projectChecks: WikiConfig["checks"];
}): Promise<ProjectCheckPack> {
	const packRoot = join(input.packsRoot, input.bindingId);
	await assertExactRealPath(packRoot, packRoot, `Check Pack ${input.bindingId}`);
	const entries = await readdir(packRoot, {withFileTypes: true});
	assertExactEntries(entries, ["config.json", "checks"], `Check Pack ${input.bindingId}`);
	const configuration = normalizeCheckPackConfiguration(
		await readBoundedJson(join(packRoot, "config.json"), MAX_CHECK_CONFIG_BYTES),
	);
	const checksRoot = join(packRoot, "checks");
	await assertExactRealPath(checksRoot, checksRoot, `Check Pack ${input.bindingId} checks`);
	const checkEntries = await readdir(checksRoot, {withFileTypes: true});
	if (
		checkEntries.length === 0 ||
		checkEntries.length > MAX_CHECKS_PER_PACK
	) {
		throw new Error(
			`Check Pack ${input.bindingId} must contain between 1 and ${MAX_CHECKS_PER_PACK} Checks.`,
		);
	}
	const checks: ProjectCheckDefinition[] = [];
	for (const entry of checkEntries.sort((left, right) => compareText(left.name, right.name))) {
		if (!entry.isDirectory() || entry.isSymbolicLink()) {
			throw new Error(`Check Pack ${input.bindingId} checks contains unsupported entry ${entry.name}.`);
		}
		const checkId = assertCheckPackIdentifier(entry.name, "Check id");
		checks.push(
			await readProjectCheck({
				repoRoot: input.repoRoot,
				packRoot,
				bindingId: input.bindingId,
				checkId,
				projectChecks: input.projectChecks,
				packConfiguration: configuration,
			}),
		);
	}
	const configurationDigest = canonicalJsonDigest(configuration);
	const packIdentity = {
		version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
		bindingId: input.bindingId,
		configurationDigest,
		checks: checks.map((check) => ({id: check.id, digest: check.digest})),
	};
	return Object.freeze({
		bindingId: input.bindingId,
		configuration,
		configurationDigest,
		checks: Object.freeze(checks),
		digest: canonicalJsonDigest(packIdentity),
	});
}

async function readProjectCheck(input: {
	readonly repoRoot: string;
	readonly packRoot: string;
	readonly bindingId: string;
	readonly checkId: string;
	readonly projectChecks: WikiConfig["checks"];
	readonly packConfiguration: CheckPackConfiguration;
}): Promise<ProjectCheckDefinition> {
	const checkRoot = join(input.packRoot, "checks", input.checkId);
	await assertExactRealPath(checkRoot, checkRoot, `Check ${input.bindingId}/${input.checkId}`);
	const entries = await readdir(checkRoot, {withFileTypes: true});
	const evaluatorEntries = entries.filter((entry) => entry.name.startsWith("CHECK."));
	if (evaluatorEntries.length !== 1) {
		throw new Error(
			`Check ${input.bindingId}/${input.checkId} must contain exactly one CHECK.* evaluator.`,
		);
	}
	const evaluatorEntry = evaluatorEntries[0];
	if (!evaluatorEntry.isFile() || evaluatorEntry.isSymbolicLink()) {
		throw new Error(`Check ${input.bindingId}/${input.checkId} evaluator must be a regular file.`);
	}
	const evaluatorKind = evaluatorKindFor(evaluatorEntry.name);
	const expectedEntries = [evaluatorEntry.name];
	if (entries.some((entry) => entry.name === "config.json")) expectedEntries.push("config.json");
	assertExactEntries(entries, expectedEntries, `Check ${input.bindingId}/${input.checkId}`);
	const evaluatorPath = [
		CHECK_PACK_ROOT,
		input.bindingId,
		"checks",
		input.checkId,
		evaluatorEntry.name,
	].join("/");
	const evaluatorSource = await readBoundedText(
		join(checkRoot, evaluatorEntry.name),
		MAX_CHECK_EVALUATOR_BYTES,
	);
	if (!evaluatorSource.trim()) {
		throw new Error(`Check ${input.bindingId}/${input.checkId} evaluator cannot be blank.`);
	}
	if (evaluatorKind === "model" && /^\uFEFF?---(?:\r?\n|$)/u.test(evaluatorSource)) {
		throw new Error(`Check ${input.bindingId}/${input.checkId} CHECK.md cannot use frontmatter.`);
	}
	const override = entries.some((entry) => entry.name === "config.json")
		? normalizeCheckOverrideConfiguration(
				await readBoundedJson(join(checkRoot, "config.json"), MAX_CHECK_CONFIG_BYTES),
			)
		: undefined;
	const configuration = resolveCheckConfiguration({
		evaluatorKind,
		project: input.projectChecks,
		pack: input.packConfiguration,
		check: override,
	});
	const id = `check-pack:${input.bindingId}:${input.checkId}`;
	const evaluatorDigest = sha256Digest(evaluatorSource);
	const identity = {
		version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
		id,
		evaluatorKind,
		evaluatorPath,
		evaluatorDigest,
		configurationDigest: configuration.digest,
	};
	return Object.freeze({
		...identity,
		bindingId: input.bindingId,
		checkId: input.checkId,
		evaluatorSource,
		configuration,
		digest: canonicalJsonDigest(identity),
	});
}

function evaluatorKindFor(name: string): CheckEvaluatorKind {
	if (name === "CHECK.md") return "model";
	if (name === "CHECK.mjs") return "node_esm";
	throw new Error(
		`Unsupported Check evaluator ${name}; supported evaluators are CHECK.md and CHECK.mjs.`,
	);
}

async function readBoundedJson(path: string, maximumBytes: number): Promise<unknown> {
	const source = await readBoundedText(path, maximumBytes);
	try {
		return JSON.parse(source) as unknown;
	} catch (error) {
		throw new Error(`${path} must contain valid JSON: ${String(error)}`);
	}
}

async function readBoundedText(path: string, maximumBytes: number): Promise<string> {
	const bytes = await readFile(path);
	if (bytes.byteLength > maximumBytes) {
		throw new Error(`${path} exceeds ${maximumBytes} bytes.`);
	}
	try {
		return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
	} catch {
		throw new Error(`${path} must contain valid UTF-8.`);
	}
}

function assertExactEntries(
	entries: readonly {readonly name: string; isSymbolicLink(): boolean}[],
	expected: readonly string[],
	label: string,
): void {
	const names = entries.map((entry) => entry.name).sort(compareText);
	const allowed = [...expected].sort(compareText);
	if (
		names.length !== allowed.length ||
		names.some((name, index) => name !== allowed[index]) ||
		entries.some((entry) => entry.isSymbolicLink())
	) {
		throw new Error(`${label} entries must be exactly: ${allowed.join(", ")}.`);
	}
}

async function assertExactRealPath(
	path: string,
	expected: string,
	label: string,
): Promise<void> {
	const actual = await realpath(path);
	const expectedPath = resolve(expected);
	if (actual !== expectedPath) {
		throw new Error(`${label} cannot use a symlink or escape the repository.`);
	}
}

function emptyProjectCheckPackSnapshot(): ProjectCheckPackSnapshot {
	return Object.freeze({
		version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
		packs: Object.freeze([]),
		digest: canonicalJsonDigest({
			version: CHECK_PACK_CONFIG_PROTOCOL_VERSION,
			packs: [],
		}),
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

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

export async function loadProtectedCustomCheckConfigSnapshot(input: {
	readonly repoRoot: string;
	readonly protectedSourceHead: string;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}): Promise<ProtectedCustomCheckConfigSnapshot> {
	assertGitObjectId(input.protectedSourceHead);
	const runner = input.runner ?? createGitCommandRunner();
	await runGitChecked(
		runner,
		{
			repoRoot: input.repoRoot,
			args: ["cat-file", "-e", `${input.protectedSourceHead}^{commit}`],
			...(input.signal ? {signal: input.signal} : {}),
		},
		"verify protected source head",
	);
	const result = await runGitChecked(
		runner,
		{
			repoRoot: input.repoRoot,
			args: ["show", `${input.protectedSourceHead}:${PROTECTED_CONFIG_PATH}`],
			...(input.signal ? {signal: input.signal} : {}),
		},
		"read protected project configuration",
	);
	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Protected project configuration is invalid JSON: ${reason}`);
	}
	const config = resolveWikiConfig(configFileToPartialWikiConfig(raw));
	return createProtectedCustomCheckConfigSnapshot({
		protectedSourceHead: input.protectedSourceHead,
		projectConfigDigest: wikiConfigDigest(config),
		userStandards: config.userStandards,
		triagePreferences: config.triagePreferences,
		customChecks: config.customChecks,
	});
}

function nextConfig(input: {
	readonly current: WikiConfig;
	readonly userStandards: readonly UserStandardDefinition[];
	readonly triagePreferences: readonly TriagePreferenceBinding[];
	readonly customChecks: readonly CustomCheckDefinition[];
}): WikiConfig {
	return resolveWikiConfig({
		...input.current,
		userStandards: [...input.userStandards],
		triagePreferences: [...input.triagePreferences],
		customChecks: [...input.customChecks],
	});
}

function configState(config: WikiConfig): CustomCheckConfigState {
	return createCustomCheckConfigState({
		projectConfigDigest: wikiConfigDigest(config),
		userStandards: config.userStandards,
		triagePreferences: config.triagePreferences,
		customChecks: config.customChecks,
	});
}

export async function withCustomCheckConfigLock<T>(
	repoRoot: string,
	run: () => Promise<T>,
): Promise<T> {
	const path = join(repoRoot, CUSTOM_CHECK_CONFIG_LOCK_PATH);
	await mkdir(dirname(path), {recursive: true});
	let handle;
	try {
		handle = await open(path, "wx", 0o600);
	} catch (error) {
		if (isAlreadyExists(error)) {
			throw conflict("Another Custom Check configuration mutation is in progress.");
		}
		throw error;
	}
	try {
		return await run();
	} finally {
		await handle.close();
		await rm(path, {force: true});
	}
}

async function runGitChecked(
	runner: GitCommandRunner,
	request: Parameters<GitCommandRunner>[0],
	operation: string,
) {
	const result = await runner(request);
	if (result.exitCode !== 0) {
		const detail = (
			result.stderr.trim() ||
			result.stdout.trim() ||
			"unknown Git error"
		).slice(0, 1_000);
		throw new Error(`Could not ${operation}: ${detail}`);
	}
	return result;
}

function assertGitObjectId(value: string): void {
	if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)) {
		throw new Error("protectedSourceHead must be a full Git object id.");
	}
}

function isAlreadyExists(error: unknown): boolean {
	return Boolean(
		error &&
		typeof error === "object" &&
		"code" in error &&
		(error as {code?: unknown}).code === "EEXIST",
	);
}

function conflict(message: string): CustomCheckMutationError {
	return new CustomCheckMutationError("conflict", message);
}
