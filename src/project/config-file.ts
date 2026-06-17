import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

export async function writeWikiConfigFile(
	repoRoot: string,
	config: WikiConfig,
): Promise<void> {
	const resolved = resolveWikiConfig(config);
	const path = configPath(repoRoot);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(resolved, null, "\t")}\n`, "utf8");
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
	const record = objectRecord(value);
	const runtime = objectRecord(record.runtime);
	const codewiki = objectRecord(record.codewiki);
	const agency = objectRecord(codewiki.agency);
	const parallelism = objectRecord(agency.parallelism);
	const approvalCadence = text(agency.approval_cadence);
	const stopConditions = stringList(agency.stop_gates);
	return {
		project: text(record.project) || text(record.project_name) || undefined,
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
	};
}

function configPath(repoRoot: string): string {
	return join(repoRoot, WIKI_CONFIG_PATH);
}

async function readOptionalJson(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return {};
		throw error;
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
