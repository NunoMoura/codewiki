#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareBenchmarkRun } from "./prepare-agent-os-run.mjs";

const DEFAULT_MODEL = "openai-codex/gpt-5.5";
const DEFAULT_SYSTEMS = ["codewiki", "plain-pi"];

export function parseArgs(argv) {
	const options = {
		tasksDir: "benchmarks/tasks",
		outDir: "benchmarks/runs",
		taskIds: [],
		systems: DEFAULT_SYSTEMS,
		model: DEFAULT_MODEL,
		repetitions: 1,
		piCommand: "pi",
		dryRun: false,
		skipCodewikiInstall: false,
		packageRoot: undefined,
		runPrefix: undefined,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--task") {
			options.taskIds.push(argv[++index]);
		} else if (arg === "--tasks") {
			options.tasksDir = argv[++index];
		} else if (arg === "--out") {
			options.outDir = argv[++index];
		} else if (arg === "--systems") {
			options.systems = splitCsv(argv[++index]);
		} else if (arg === "--model") {
			options.model = argv[++index];
		} else if (arg === "--repetitions") {
			options.repetitions = Number(argv[++index]);
		} else if (arg === "--pi-command") {
			options.piCommand = argv[++index];
		} else if (arg === "--package-root") {
			options.packageRoot = argv[++index];
		} else if (arg === "--run-prefix") {
			options.runPrefix = argv[++index];
		} else if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg === "--skip-codewiki-install") {
			options.skipCodewikiInstall = true;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (!Number.isInteger(options.repetitions) || options.repetitions < 1) {
		throw new Error("--repetitions must be a positive integer");
	}
	for (const system of options.systems) {
		if (!["codewiki", "plain-pi", "other"].includes(system)) {
			throw new Error(
				"--systems may contain only codewiki, plain-pi, or other",
			);
		}
	}
	return options;
}

function splitCsv(value) {
	return String(value)
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export function listTaskIds(tasksDir) {
	return readdirSync(tasksDir)
		.filter((name) => name.endsWith(".json"))
		.map((name) => name.slice(0, -".json".length))
		.sort();
}

export function plannedRuns(options, now = new Date()) {
	const taskIds = options.taskIds.length
		? options.taskIds
		: listTaskIds(options.tasksDir);
	const prefix =
		options.runPrefix ||
		now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
	const runs = [];
	for (const taskId of taskIds) {
		for (const system of options.systems) {
			for (let repeat = 1; repeat <= options.repetitions; repeat += 1) {
				runs.push({
					taskId,
					system,
					repeat,
					model: options.model,
					runId: `${prefix}-${system}-${taskId}-r${repeat}`,
				});
			}
		}
	}
	return runs;
}

export function buildPiArgs({ model, runId, sessionDir, prompt }) {
	return [
		"--approve",
		"--mode",
		"json",
		"--model",
		model,
		"--session-dir",
		sessionDir,
		"--session-id",
		runId,
		"--name",
		runId,
		"-p",
		prompt,
	];
}

export function extractUsageFromJsonl(jsonl) {
	const usage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0,
		cost: 0,
	};
	for (const line of String(jsonl).split(/\r?\n/)) {
		if (!line.trim()) continue;
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}
		if (event.type !== "message_end") continue;
		const message = event.message;
		if (message?.role !== "assistant" || !message.usage) continue;
		usage.input += number(message.usage.input);
		usage.output += number(message.usage.output);
		usage.cacheRead += number(message.usage.cacheRead);
		usage.cacheWrite += number(message.usage.cacheWrite);
		usage.total += number(message.usage.totalTokens ?? message.usage.total);
		usage.cost += number(message.usage.cost?.total);
	}
	return usage;
}

function number(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function runBenchmarkSessions(
	options,
	{ commandRunner = defaultCommandRunner, cwd = process.cwd() } = {},
) {
	const plan = plannedRuns(options);
	const summaries = [];
	for (const item of plan) {
		const prepared = prepareBenchmarkRun({
			tasksDir: options.tasksDir,
			outDir: options.outDir,
			taskId: item.taskId,
			system: item.system,
			model: item.model,
			runId: item.runId,
		});
		const projectDir = join(prepared.runDir, "project");
		const sessionDir = join(prepared.runDir, "sessions");
		const agentDir = join(prepared.runDir, "agent");
		mkdirSync(projectDir, { recursive: true });
		mkdirSync(sessionDir, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		writeProjectScaffold(projectDir, item);
		const prompt = readFileSync(prepared.promptPath, "utf8");
		const env = {
			...process.env,
			PI_CODING_AGENT_DIR: agentDir,
			PI_CODING_AGENT_SESSION_DIR: sessionDir,
		};
		if (item.system === "codewiki" && !options.skipCodewikiInstall) {
			installCodeWikiLocal({
				projectDir,
				runDir: prepared.runDir,
				packageRoot: options.packageRoot,
				commandRunner,
				cwd,
				env,
				piCommand: options.piCommand,
			});
		}
		const piArgs = buildPiArgs({
			model: item.model,
			runId: item.runId,
			sessionDir,
			prompt,
		});
		const commandPlan = {
			command: options.piCommand,
			args: piArgs,
			cwd: projectDir,
			env,
		};
		if (options.dryRun) {
			writeJson(join(prepared.runDir, "command.plan.json"), commandPlan);
			summaries.push({ ...item, runDir: prepared.runDir, dryRun: true });
			continue;
		}
		const startedAt = new Date().toISOString();
		const started = Date.now();
		const result = commandRunner(commandPlan);
		const completedAt = new Date().toISOString();
		const durationMs = Date.now() - started;
		const stdout = String(result.stdout ?? "");
		const stderr = String(result.stderr ?? "");
		writeFileSync(join(prepared.runDir, "session.jsonl"), stdout);
		writeFileSync(join(prepared.runDir, "stderr.log"), stderr);
		const usage = extractUsageFromJsonl(stdout);
		const draft = JSON.parse(readFileSync(prepared.resultTemplatePath, "utf8"));
		draft.startedAt = startedAt;
		draft.completedAt = completedAt;
		draft.durationMs = durationMs;
		draft.tokens = {
			input: usage.input,
			output: usage.output,
			cacheRead: usage.cacheRead,
			cacheWrite: usage.cacheWrite,
			total: usage.total,
			cost: usage.cost,
		};
		draft.artifacts.sessionOutput = join(prepared.runDir, "session.jsonl");
		draft.artifacts.sessionRefs = [item.runId];
		writeJson(join(prepared.runDir, "result.draft.json"), draft);
		const summary = {
			...item,
			runDir: prepared.runDir,
			projectDir,
			startedAt,
			completedAt,
			durationMs,
			exitCode: result.status ?? result.exitCode ?? 0,
			tokens: draft.tokens,
		};
		writeJson(join(prepared.runDir, "run-summary.json"), summary);
		summaries.push(summary);
	}
	return summaries;
}

function writeProjectScaffold(projectDir, item) {
	writeJson(join(projectDir, "package.json"), {
		name: `codewiki-benchmark-${item.taskId}`,
		private: true,
		type: "module",
	});
	writeFileSync(
		join(projectDir, "README.md"),
		`# ${item.taskId} benchmark project\n\nRun id: ${item.runId}\nSystem: ${item.system}\n\n`,
	);
}

function installCodeWikiLocal({
	projectDir,
	runDir,
	packageRoot,
	commandRunner,
	cwd,
	env,
	piCommand,
}) {
	let packageInstallRoot = packageRoot;
	if (!packageInstallRoot) {
		const packDir = join(runDir, "pack");
		mkdirSync(packDir, { recursive: true });
		const pack = commandRunner({
			command: "npm",
			args: ["pack", "--pack-destination", packDir],
			cwd,
			env,
		});
		assertCommandOk(pack, "npm pack");
		const tarball = String(pack.stdout || "")
			.trim()
			.split(/\r?\n/)
			.at(-1);
		if (!tarball) throw new Error("npm pack did not report a tarball");
		const projectPiNpm = join(projectDir, ".pi", "npm");
		mkdirSync(projectPiNpm, { recursive: true });
		const install = commandRunner({
			command: "npm",
			args: ["install", "--prefix", projectPiNpm, join(packDir, tarball)],
			cwd,
			env,
		});
		assertCommandOk(install, "npm install codewiki package");
		packageInstallRoot = join(projectPiNpm, "node_modules", "codewiki");
	}
	if (!existsSync(packageInstallRoot)) {
		throw new Error(`CodeWiki package root not found: ${packageInstallRoot}`);
	}
	const piInstall = commandRunner({
		command: piCommand,
		args: ["install", "-l", packageInstallRoot, "--approve"],
		cwd: projectDir,
		env,
	});
	assertCommandOk(piInstall, "pi install codewiki");
}

function assertCommandOk(result, label) {
	const status = result.status ?? result.exitCode ?? 0;
	if (status !== 0) {
		throw new Error(
			`${label} failed with exit ${status}\nSTDOUT:\n${result.stdout || ""}\nSTDERR:\n${result.stderr || ""}`,
		);
	}
}

function defaultCommandRunner(input) {
	return spawnSync(input.command, input.args, {
		cwd: input.cwd,
		env: input.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

async function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	const summaries = await runBenchmarkSessions(options);
	console.log(JSON.stringify(summaries, null, 2));
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
