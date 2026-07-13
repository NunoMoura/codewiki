import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
	TraceHostExecutionModel,
	TraceHostSessionController,
	TraceHostSessionFactory,
	TraceHostSessionInput,
	TraceHostSessionStart,
} from "../runtime/trace-host-runner.ts";
import { traceTmpPath } from "../runtime/tmp.ts";
import { runDetachedTraceHostCommand } from "./trace-host-process.ts";
import type {
	PiWorkerSession,
	PiWorkerSessionFactory,
	PiWorkerSessionInput,
	PiWorkerSessionResumeInput,
	PiWorkerSessionResumeResult,
} from "./worker-start.ts";

export type PiModelInvocation = TraceHostExecutionModel;

export interface PiTraceHostSessionFactoryOptions {
	command?: string;
	args?: string[];
	env?: NodeJS.ProcessEnv;
	noSession?: boolean;
	model?:
		| PiModelInvocation
		| ((input: TraceHostSessionInput) => PiModelInvocation);
	timeoutMs?: number;
	outputFile?: string | ((input: TraceHostSessionInput) => string);
	runner?: PiProcessCommandRunner;
}

export interface PiProcessSessionFactoryOptions {
	command?: string;
	args?: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	detached?: boolean;
	noSession?: boolean;
	model?: PiModelInvocation;
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
	outputMode?: "raw" | "trace-host";
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
	controller?: TraceHostSessionController;
}

export type PiProcessCommandRunner = (
	input: PiProcessCommandRunnerInput,
) => Promise<PiProcessCommandResult> | PiProcessCommandResult;

export type PiProcessSessionResumeRunner = (
	input: PiWorkerSessionResumeInput,
) => Promise<PiWorkerSessionResumeResult> | PiWorkerSessionResumeResult;

export function createPiTraceHostSessionFactory(
	options: PiTraceHostSessionFactoryOptions = {},
): TraceHostSessionFactory {
	return (input) => startPiTraceHostSession(input, options);
}

async function startPiTraceHostSession(
	input: TraceHostSessionInput,
	options: PiTraceHostSessionFactoryOptions,
) {
	try {
		const outputFile = resolveTraceHostOutputFile(input, options);
		const commandInput = traceHostProcessCommand(input, options, outputFile);
		await mkdir(dirname(outputFile), { recursive: true });
		const result = await (options.runner || runPiProcessCommand)(
			commandInput.process,
		);
		return traceHostSessionStart(
			input,
			result,
			outputFile,
			commandInput.resumeSessionId,
			options.timeoutMs,
			commandInput.model,
		);
	} catch (error) {
		throw new Error(
			`Failed to start trace host ${input.traceId}: ${errorMessage(error)}`,
			{
				cause: error,
			},
		);
	}
}

function traceHostProcessCommand(
	input: TraceHostSessionInput,
	options: PiTraceHostSessionFactoryOptions,
	outputFile: string,
): {
	process: PiProcessCommandRunnerInput;
	resumeSessionId?: string;
	model?: PiModelInvocation;
} {
	const resumeSessionId = validatedResumeSessionId(input.resumeSessionId);
	const model =
		typeof options.model === "function" ? options.model(input) : options.model;
	if (resumeSessionId && options.noSession) {
		throw new Error("Trace host resume cannot disable session persistence.");
	}
	return {
		process: {
			command: options.command || "pi",
			args: [
				...(options.args || ["--mode", "json", "-p"]),
				...(options.noSession ? ["--no-session"] : []),
				...piModelArgs(model),
				...(resumeSessionId ? ["--session", resumeSessionId] : []),
				input.prompt,
			],
			cwd: input.repoRoot,
			env: options.env || process.env,
			detached: true,
			outputFile,
			workerId: `trace-host:${input.traceId}`,
			workUnitId: `trace:${input.target}`,
			traceId: input.traceId,
			outputMode: "trace-host",
		},
		...(resumeSessionId ? { resumeSessionId } : {}),
		...(model ? { model } : {}),
	};
}

function traceHostSessionStart(
	input: TraceHostSessionInput,
	result: PiProcessCommandResult,
	outputFile: string,
	resumeSessionId?: string,
	timeoutMs?: number,
	executionModel?: PiModelInvocation,
): TraceHostSessionStart {
	if (isFailedProcessResult(result)) {
		throw new Error(processFailureMessage(result));
	}
	if (!result.controller) {
		throw new Error(
			"Trace host process runner returned no session controller.",
		);
	}
	return {
		traceId: input.traceId,
		target: input.target,
		sessionRef:
			resumeSessionId ||
			result.sessionId ||
			(result.pid ? `pi-process:${result.pid}` : `pi-output:${outputFile}`),
		controller: result.controller,
		...(result.pid ? { pid: result.pid } : {}),
		...(timeoutMs ? { timeoutMs } : {}),
		...(executionModel ? { executionModel: { ...executionModel } } : {}),
	};
}

function validatedResumeSessionId(
	value: string | undefined,
): string | undefined {
	if (value === undefined) return undefined;
	if (
		value.length < 1 ||
		value.length > 160 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
	) {
		throw new Error("Trace host resume session id is invalid.");
	}
	return value;
}

function resolveTraceHostOutputFile(
	input: TraceHostSessionInput,
	options: PiTraceHostSessionFactoryOptions,
): string {
	if (typeof options.outputFile === "function")
		return options.outputFile(input);
	if (typeof options.outputFile === "string") return options.outputFile;
	return resolve(
		input.repoRoot,
		traceTmpPath(input.traceId, "trace-host"),
		"session.log",
	);
}

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
			...piModelArgs(options.model),
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

function piModelArgs(model: PiModelInvocation | undefined): string[] {
	if (!model) return [];
	return [
		"--provider",
		model.provider,
		"--model",
		model.model,
		"--thinking",
		model.thinking,
	];
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
	if (input.detached && input.outputMode === "trace-host") {
		return runDetachedTraceHostCommand(input);
	}
	if (input.detached) return await runDetachedPiProcessCommand(input);
	return await runForegroundPiProcessCommand(input);
}

async function runDetachedPiProcessCommand(
	input: PiProcessCommandRunnerInput,
): Promise<PiProcessCommandResult> {
	const { open } = await import("node:fs/promises");
	const output = await open(input.outputFile, "a");
	try {
		return await new Promise((resolve, reject) => {
			const child = spawn(input.command, input.args, {
				cwd: input.cwd,
				env: input.env,
				detached: true,
				stdio: ["ignore", output.fd, output.fd],
			});
			child.once("error", reject);
			child.once("spawn", () => {
				child.unref();
				resolve({
					pid: child.pid,
					outputFile: input.outputFile,
					controller: traceHostProcessController(child),
				});
			});
		});
	} finally {
		await output.close();
	}
}

function traceHostProcessController(
	child: ChildProcess,
): TraceHostSessionController {
	return {
		isRunning: () => processIsRunning(child),
		async stop() {
			if (!processIsRunning(child)) return;
			child.kill("SIGTERM");
			if (await waitForProcessExit(child, 2_000)) return;
			child.kill("SIGKILL");
			if (!(await waitForProcessExit(child, 2_000))) {
				throw new Error("Trace host process did not exit after SIGKILL.");
			}
		},
	};
}

function processIsRunning(child: ChildProcess): boolean {
	return child.exitCode === null && child.signalCode === null;
}

function waitForProcessExit(
	child: ChildProcess,
	timeoutMs: number,
): Promise<boolean> {
	if (!processIsRunning(child)) return Promise.resolve(true);
	return new Promise((resolve) => {
		const done = (exited: boolean) => {
			clearTimeout(timer);
			child.off("exit", onExit);
			resolve(exited);
		};
		const onExit = () => done(true);
		const timer = setTimeout(() => done(!processIsRunning(child)), timeoutMs);
		child.once("exit", onExit);
	});
}

async function runForegroundPiProcessCommand(
	input: PiProcessCommandRunnerInput,
): Promise<PiProcessCommandResult> {
	return await new Promise((resolve, reject) => {
		const child = spawn(input.command, input.args, {
			cwd: input.cwd,
			env: input.env,
			detached: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function safeSegment(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}
