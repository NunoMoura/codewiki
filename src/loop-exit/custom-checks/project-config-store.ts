import {mkdir, open, rm} from "node:fs/promises";
import {dirname, join} from "node:path";
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
	resolveWikiConfig,
	type WikiConfig,
} from "../../project/config.ts";
import {
	createCustomCheckConfigState,
	createProtectedCustomCheckConfigSnapshot,
	type CustomCheckConfigState,
	type ProtectedCustomCheckConfigSnapshot,
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
