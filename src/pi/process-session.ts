import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { traceTmpPath } from "../runtime/tmp.ts";
import type {
	PiWorkerSession,
	PiWorkerSessionFactory,
	PiWorkerSessionInput,
	PiWorkerSessionResumeInput,
	PiWorkerSessionResumeResult,
} from "./worker-start.ts";

export interface PiProcessSessionFactoryOptions {
	command?: string;
	args?: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	detached?: boolean;
	noSession?: boolean;
	outputDir?: string;
	outputFile?: string | ((input: PiWorkerSessionInput) => string);
	runner?: PiProcessCommandRunner;
	resumeRunner?: PiProcessSessionResumeRunner;
}

export interface PiProcessCommandRunnerInput {
	command: string;
	args: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	detached: boolean;
	outputFile: string;
	workerId: string;
	workUnitId: string;
	traceId: string;
}

export interface PiProcessCommandResult {
	pid?: number;
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	exitCode?: number;
	signal?: NodeJS.Signals | string | null;
	stdout?: string;
	stderr?: string;
}

export type PiProcessCommandRunner = (
	input: PiProcessCommandRunnerInput,
) => Promise<PiProcessCommandResult> | PiProcessCommandResult;

export type PiProcessSessionResumeRunner = (
	input: PiWorkerSessionResumeInput,
) => Promise<PiWorkerSessionResumeResult> | PiWorkerSessionResumeResult;

export function createPiProcessSessionFactory(
	options: PiProcessSessionFactoryOptions = {},
): PiWorkerSessionFactory {
	return {
		async create(input) {
			return new PiProcessSession(input, options);
		},
		async resume(input) {
			if (options.resumeRunner) return await options.resumeRunner(input);
			return {
				state: "detached",
				...(input.sessionId ? { sessionId: input.sessionId } : {}),
				...(input.sessionFile ? { sessionFile: input.sessionFile } : {}),
				...(input.outputFile ? { outputFile: input.outputFile } : {}),
				...(input.pid ? { pid: input.pid } : {}),
				message: "No Pi process resume runner configured.",
			};
		},
	};
}

class PiProcessSession implements PiWorkerSession {
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
	private readonly input: PiWorkerSessionInput;
	private readonly options: PiProcessSessionFactoryOptions;

	constructor(
		input: PiWorkerSessionInput,
		options: PiProcessSessionFactoryOptions,
	) {
		this.input = input;
		this.options = options;
	}

	async prompt(text: string): Promise<void> {
		const commandInput = processCommandInput(this.input, this.options, text);
		const result = await (this.options.runner || runPiProcessCommand)(
			commandInput,
		);
		this.pid = result.pid;
		this.sessionId = result.sessionId;
		this.sessionFile = result.sessionFile;
		this.outputFile = result.outputFile || commandInput.outputFile;
		if (isFailedProcessResult(result)) {
			throw new Error(processFailureMessage(result));
		}
	}
}

function processCommandInput(
	input: PiWorkerSessionInput,
	options: PiProcessSessionFactoryOptions,
	prompt: string,
): PiProcessCommandRunnerInput {
	return {
		command: options.command || "pi",
		args: [
			...(options.args || ["--mode", "json", "-p"]),
			...(options.noSession ? ["--no-session"] : []),
			prompt,
		],
		...(options.cwd ? { cwd: options.cwd } : {}),
		...(options.env ? { env: options.env } : {}),
		detached: options.detached === true,
		outputFile: outputFileForSession(input, options),
		workerId: input.workerId,
		workUnitId: input.workUnitId,
		traceId: input.traceId,
	};
}

function outputFileForSession(
	input: PiWorkerSessionInput,
	options: PiProcessSessionFactoryOptions,
): string {
	if (typeof options.outputFile === "function")
		return options.outputFile(input);
	if (typeof options.outputFile === "string") return options.outputFile;
	return join(
		options.outputDir || defaultOutputDir(input, options),
		`${safeSegment(input.traceId)}-${safeSegment(input.workerId)}.jsonl`,
	);
}

function defaultOutputDir(
	input: PiWorkerSessionInput,
	options: PiProcessSessionFactoryOptions,
): string {
	return resolve(
		options.cwd || process.cwd(),
		traceTmpPath(input.traceId, "runtime"),
		"pi-workers",
	);
}

async function runPiProcessCommand(
	input: PiProcessCommandRunnerInput,
): Promise<PiProcessCommandResult> {
	await mkdir(dirname(input.outputFile), { recursive: true });
	return await new Promise((resolve, reject) => {
		const child = spawn(input.command, input.args, {
			cwd: input.cwd,
			env: input.env,
			detached: input.detached,
			stdio: input.detached ? "ignore" : ["ignore", "pipe", "pipe"],
		});
		if (input.detached) {
			child.once("error", reject);
			child.unref();
			resolve({
				pid: child.pid,
				outputFile: input.outputFile,
			});
			return;
		}
		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr?.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.once("error", reject);
		child.once("close", async (exitCode, signal) => {
			try {
				await mkdir(dirname(input.outputFile), { recursive: true });
				const { writeFile } = await import("node:fs/promises");
				await writeFile(input.outputFile, stdout + stderr);
				resolve({
					pid: child.pid,
					outputFile: input.outputFile,
					exitCode: exitCode ?? 0,
					signal,
					stdout,
					stderr,
				});
			} catch (error) {
				reject(error);
			}
		});
	});
}

function isFailedProcessResult(result: PiProcessCommandResult): boolean {
	return typeof result.exitCode === "number" && result.exitCode !== 0;
}

function processFailureMessage(result: PiProcessCommandResult): string {
	return [
		`pi process exited with code ${result.exitCode}`,
		result.signal ? `signal ${result.signal}` : "",
		result.stderr,
	]
		.filter(Boolean)
		.join(": ");
}

function safeSegment(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}
