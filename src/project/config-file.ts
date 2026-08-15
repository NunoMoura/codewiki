import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCodewikiConfigError } from "./config-errors.ts";
import {
	createGitCommandRunner,
	type GitCommandRunner,
} from "../changes/trace/git-command.ts";
import {canonicalJsonDigest, type Sha256Digest} from "../utils/canonical-json.ts";
import {
	runWikiConfig,
	resolveWikiConfig,
	type PartialWikiConfig,
	type RunWikiConfigInput,
	type RunWikiConfigResult,
	type WikiConfig,
} from "./config.ts";

export const WIKI_CONFIG_PATH = ".codewiki/config.json";

export interface WikiConfigFileResult extends RunWikiConfigResult {
	path: string;
	written: boolean;
}

export async function loadWikiConfigFile(
	repoRoot: string,
): Promise<WikiConfig> {
	const raw = await readOptionalJson(configPath(repoRoot));
	return resolveWikiConfig(configFileToPartialWikiConfig(raw));
}

export async function loadProtectedWikiConfigFile(input: {
	readonly repoRoot: string;
	readonly protectedSourceHead: string;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}): Promise<WikiConfig> {
	if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(input.protectedSourceHead)) {
		throw new Error("Protected source head must be a Git object id.");
	}
	const runner = input.runner ?? createGitCommandRunner();
	const result = await runner({
		repoRoot: input.repoRoot,
		args: ["show", `${input.protectedSourceHead}:${WIKI_CONFIG_PATH}`],
		...(input.signal ? {signal: input.signal} : {}),
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`Unable to read protected project configuration: ${result.stderr.trim() || "Git failed"}`,
		);
	}
	let value: unknown;
	try {
		value = JSON.parse(result.stdout);
	} catch {
		throw new Error("Protected project configuration must contain valid JSON.");
	}
	return resolveWikiConfig(configFileToPartialWikiConfig(value));
}

export async function resolveWikiConfigFile(
	repoRoot: string,
	input: RunWikiConfigInput = {},
): Promise<WikiConfigFileResult> {
	const current = input.current
		? resolveWikiConfig(input.current)
		: await loadWikiConfigFile(repoRoot);
	const result = runWikiConfig({ current, patch: input.patch });
	return { ...result, path: WIKI_CONFIG_PATH, written: false };
}

export function serializeWikiConfigFile(config: WikiConfig): string {
	return `${JSON.stringify(resolveWikiConfig(config), null, "\t")}\n`;
}

export function wikiConfigDigest(config: WikiConfig): Sha256Digest {
	return canonicalJsonDigest(resolveWikiConfig(config));
}

export async function writeWikiConfigFile(
	repoRoot: string,
	config: WikiConfig,
): Promise<void> {
	const path = configPath(repoRoot);
	const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
	await mkdir(dirname(path), { recursive: true });
	try {
		await writeFile(temporaryPath, serializeWikiConfigFile(config), {
			encoding: "utf8",
			mode: 0o600,
		});
		await rename(temporaryPath, path);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

export async function updateWikiConfigFile(
	repoRoot: string,
	input: RunWikiConfigInput = {},
): Promise<WikiConfigFileResult> {
	const result = await resolveWikiConfigFile(repoRoot, input);
	await writeWikiConfigFile(repoRoot, result.config);
	return { ...result, written: true };
}

export function configFileToPartialWikiConfig(
	value: unknown,
): PartialWikiConfig {
	const record = validateConfigFileKeys(value);
	const runtime = objectRecord(record.runtime);
	const codewiki = objectRecord(record.codewiki);
	const agency = objectRecord(codewiki.agency);
	const parallelism = objectRecord(agency.parallelism);
	const approvalCadence = text(agency.approval_cadence);
	const stopConditions = stringList(agency.stop_gates);
	return {
		project: text(record.project) || text(record.project_name) || undefined,
		preview: objectRecord(record.preview),
		runtime: {
			...runtime,
			...(number(parallelism.max_sessions) !== undefined &&
			runtime.maxWorkers === undefined
				? { maxWorkers: number(parallelism.max_sessions) }
				: {}),
			...(approvalCadence &&
			objectRecord(runtime.approval).cadence === undefined
				? { approval: { cadence: cadenceFromLegacy(approvalCadence) } }
				: {}),
			...(stopConditions.length > 0 && runtime.stopConditions === undefined
				? { stopConditions }
				: {}),
		},
		retention: objectRecord(record.retention),
		hosts: objectRecord(record.hosts),
		quality: objectRecord(record.quality),
		userStandards: record.userStandards as PartialWikiConfig["userStandards"],
		triagePreferences:
			record.triagePreferences as PartialWikiConfig["triagePreferences"],
	};
}

function validateConfigFileKeys(value: unknown): Record<string, unknown> {
	const record = requiredObjectRecord(value, WIKI_CONFIG_PATH);
	assertKnownKeys(record, WIKI_CONFIG_PATH, [
		"project",
		"preview",
		"runtime",
		"retention",
		"hosts",
		"quality",
		"userStandards",
		"triagePreferences",
		"project_name",
		"codewiki",
	]);
	const codewiki = optionalObjectRecord(
		record.codewiki,
		`${WIKI_CONFIG_PATH}.codewiki`,
	);
	if (codewiki) {
		assertKnownKeys(codewiki, `${WIKI_CONFIG_PATH}.codewiki`, ["agency"]);
		const agency = optionalObjectRecord(
			codewiki.agency,
			`${WIKI_CONFIG_PATH}.codewiki.agency`,
		);
		if (agency) {
			assertKnownKeys(agency, `${WIKI_CONFIG_PATH}.codewiki.agency`, [
				"parallelism",
				"approval_cadence",
				"stop_gates",
			]);
			const parallelism = optionalObjectRecord(
				agency.parallelism,
				`${WIKI_CONFIG_PATH}.codewiki.agency.parallelism`,
			);
			if (parallelism) {
				assertKnownKeys(
					parallelism,
					`${WIKI_CONFIG_PATH}.codewiki.agency.parallelism`,
					["max_sessions"],
				);
			}
		}
	}
	return record;
}

function optionalObjectRecord(
	value: unknown,
	path: string,
): Record<string, unknown> | undefined {
	return value === undefined ? undefined : requiredObjectRecord(value, path);
}

function requiredObjectRecord(
	value: unknown,
	path: string,
): Record<string, unknown> {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	throw createCodewikiConfigError({
		path,
		code: "invalid_type",
		message: `${path} must be a JSON object.`,
		value,
	});
}

function assertKnownKeys(
	record: Record<string, unknown>,
	path: string,
	allowed: readonly string[],
): void {
	for (const key of Object.keys(record)) {
		if (allowed.includes(key)) continue;
		const keyPath = `${path}.${key}`;
		throw createCodewikiConfigError({
			path: keyPath,
			code: "unknown_key",
			message: `${keyPath} is an unknown config key.`,
			value: record[key],
		});
	}
}

function configPath(repoRoot: string): string {
	return join(repoRoot, WIKI_CONFIG_PATH);
}

async function readOptionalJson(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return {};
		throw createCodewikiConfigError({
			path,
			message: `wiki_config file ${path} must contain valid JSON.`,
			cause: error,
		});
	}
}

function cadenceFromLegacy(
	value: string,
): "always" | "per_iteration" | "on_risk" | "never" {
	if (value === "never") return "never";
	if (value === "risk" || value === "on_risk") return "on_risk";
	return "per_iteration";
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function number(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value;
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}
