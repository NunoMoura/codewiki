#!/usr/bin/env -S node --experimental-strip-types
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
	buildWikiState,
	runWikiArchive,
	runWikiConfig,
	runWikiDecide,
	runWikiImplement,
	runWikiPlan,
	runWikiRuntime,
	type RunWikiArchiveInput,
	type RunWikiConfigInput,
	type RunWikiDecideInput,
	type RunWikiImplementInput,
	type RunWikiPlanInput,
	type RunWikiRuntimeInput,
	type TraceRecord,
} from "../api/index.ts";
import { parseSourceMapYaml } from "../knowledge/source-map.ts";
import { readTraceFile } from "../traces/reader.ts";

export interface CliResult {
	status: number;
	stdout?: string;
	stderr?: string;
}

interface ParsedArgs {
	command?: string;
	flags: Record<string, string[]>;
}

export async function runCodewikiCli(argv: string[]): Promise<CliResult> {
	try {
		const parsed = parseArgs(argv);
		if (!parsed.command || parsed.flags.help?.length) {
			return { status: 0, stdout: helpText() };
		}
		if (parsed.command === "state") return stateCommand(parsed.flags);
		if (parsed.command === "config") return configCommand(parsed.flags);
		if (parsed.command === "decide") return decideCommand(parsed.flags);
		if (parsed.command === "plan") return planCommand(parsed.flags);
		if (parsed.command === "implement") return implementCommand(parsed.flags);
		if (parsed.command === "runtime") return runtimeCommand(parsed.flags);
		if (parsed.command === "archive") return archiveCommand(parsed.flags);
		return {
			status: 1,
			stderr: `Unknown command: ${parsed.command}\n${helpText()}`,
		};
	} catch (error) {
		return {
			status: 1,
			stderr: `${error instanceof Error ? error.message : String(error)}\n`,
		};
	}
}

async function stateCommand(
	flags: Record<string, string[]>,
): Promise<CliResult> {
	const repoRoot = one(flags.repo) || process.cwd();
	const records = await readProjectTraceRecords(repoRoot);
	const sourceMap = await readSourceMap(repoRoot);
	const snapshot = buildWikiState({
		records,
		traceId: one(flags.trace),
		generatedAt: one(flags["generated-at"]),
		sourceMap,
		sourcePaths: flags.source || [],
	});
	return jsonResult(snapshot);
}

async function configCommand(
	flags: Record<string, string[]>,
): Promise<CliResult> {
	const input = await optionalInput<RunWikiConfigInput>(flags);
	return jsonResult(runWikiConfig(input));
}

async function decideCommand(
	flags: Record<string, string[]>,
): Promise<CliResult> {
	return jsonResult(
		await runWikiDecide(await requiredInput<RunWikiDecideInput>(flags)),
	);
}

async function planCommand(
	flags: Record<string, string[]>,
): Promise<CliResult> {
	return jsonResult(
		await runWikiPlan(await requiredInput<RunWikiPlanInput>(flags)),
	);
}

async function implementCommand(
	flags: Record<string, string[]>,
): Promise<CliResult> {
	return jsonResult(
		await runWikiImplement(await requiredInput<RunWikiImplementInput>(flags)),
	);
}

async function runtimeCommand(
	flags: Record<string, string[]>,
): Promise<CliResult> {
	return jsonResult(
		await runWikiRuntime(await requiredInput<RunWikiRuntimeInput>(flags)),
	);
}

async function archiveCommand(
	flags: Record<string, string[]>,
): Promise<CliResult> {
	return jsonResult(
		await runWikiArchive(await requiredInput<RunWikiArchiveInput>(flags)),
	);
}

async function readProjectTraceRecords(
	repoRoot: string,
): Promise<TraceRecord[]> {
	const tracesDir = join(repoRoot, ".codewiki", "traces");
	let files: string[];
	try {
		files = await readdir(tracesDir);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
	const records = await Promise.all(
		files
			.filter((file) => file.endsWith(".jsonl"))
			.sort()
			.map((file) => readTraceFile(join(tracesDir, file))),
	);
	return records.flat();
}

async function readSourceMap(repoRoot: string) {
	const sourceMapPath = join(
		repoRoot,
		".codewiki",
		"kb",
		"system",
		"source-map.yaml",
	);
	try {
		return parseSourceMapYaml(await readFile(sourceMapPath, "utf8"));
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
}

async function requiredInput<T>(flags: Record<string, string[]>): Promise<T> {
	const inputPath = one(flags.input);
	if (!inputPath) throw new Error("Command requires --input <file|->.");
	return withOverrides(JSON.parse(await readInput(inputPath)), flags) as T;
}

async function optionalInput<T>(flags: Record<string, string[]>): Promise<T> {
	const inputPath = one(flags.input);
	const input = inputPath ? JSON.parse(await readInput(inputPath)) : {};
	return withOverrides(input, flags) as T;
}

function withOverrides(
	input: unknown,
	flags: Record<string, string[]>,
): Record<string, unknown> {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("CLI input must be a JSON object.");
	}
	const output = { ...(input as Record<string, unknown>) };
	setString(output, "repoRoot", one(flags.repo));
	setString(output, "mode", one(flags.mode));
	setString(output, "traceId", one(flags.trace));
	setString(output, "expectedTraceId", one(flags["expected-trace"]));
	setString(output, "createdAt", one(flags["created-at"]));
	setNumber(output, "nextSequence", one(flags["next-sequence"]));
	setNumber(output, "expectedBytes", one(flags["expected-bytes"]));
	setNumber(output, "maxWorkers", one(flags["max-workers"]));
	return output;
}

function setString(
	output: Record<string, unknown>,
	key: string,
	value: string | undefined,
): void {
	if (value && value !== "true") output[key] = value;
}

function setNumber(
	output: Record<string, unknown>,
	key: string,
	value: string | undefined,
): void {
	if (!value || value === "true") return;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${key} must be numeric.`);
	output[key] = parsed;
}

function readInput(path: string): Promise<string> {
	if (path === "-") {
		return new Promise((resolve, reject) => {
			let data = "";
			process.stdin.setEncoding("utf8");
			process.stdin.on("data", (chunk) => {
				data += chunk;
			});
			process.stdin.on("end", () => resolve(data));
			process.stdin.on("error", reject);
		});
	}
	return readFile(path, "utf8");
}

function parseArgs(argv: string[]): ParsedArgs {
	const flags: Record<string, string[]> = {};
	let command: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") {
			flags.help = ["true"];
			continue;
		}
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const value = argv[index + 1];
			if (!value || value.startsWith("--")) {
				flags[key] = [...(flags[key] || []), "true"];
				continue;
			}
			flags[key] = [...(flags[key] || []), value];
			index += 1;
			continue;
		}
		if (!command) command = arg;
		else throw new Error(`Unexpected argument: ${arg}`);
	}
	return { command, flags };
}

function one(values: string[] | undefined): string | undefined {
	return values?.at(-1);
}

function jsonResult(value: unknown): CliResult {
	return { status: 0, stdout: `${JSON.stringify(value, null, 2)}\n` };
}

function helpText(): string {
	return [
		"codewiki <command> [options]",
		"",
		"Commands:",
		"  state   Print wiki_state JSON from .codewiki/traces and source-map.",
		"  config     Resolve wiki_config JSON. Use --input <file|-> for patch input.",
		"  decide     Run wiki_decide from --input <file|-> JSON.",
		"  plan       Run wiki_plan from --input <file|-> JSON.",
		"  implement  Run wiki_implement from --input <file|-> JSON.",
		"  runtime    Run wiki_runtime from --input <file|-> JSON.",
		"  archive    Run wiki_archive from --input <file|-> JSON.",
		"",
		"State options:",
		"  --repo <path>          Repository root. Defaults to cwd.",
		"  --trace <trace-id>     Select one trace for per-trace views.",
		"  --source <path>        Include source ownership for a path. Repeatable.",
		"  --generated-at <iso>   Generated timestamp for views.",
		"",
		"Common input options:",
		"  --input <file|->       JSON input object for all run commands.",
		"  --repo <path>          Override repoRoot.",
		"  --mode <preview|append> Override mode.",
		"  --trace <trace-id>     Override traceId.",
		"  --next-sequence <n>    Override nextSequence.",
		"  --expected-bytes <n>   Override expectedBytes.",
		"  --max-workers <n>      Override runtime maxWorkers.",
	].join("\n");
}

function isNotFound(error: unknown): boolean {
	return Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT",
	);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const result = await runCodewikiCli(process.argv.slice(2));
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exitCode = result.status;
}
