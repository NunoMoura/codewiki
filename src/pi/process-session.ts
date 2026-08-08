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
import {
	verifyWorkerExecutionUsage,
	type WorkerExecutionPolicySnapshot,
	type WorkerExecutionVerification,
	type WorkerExecutionUsage,
} from "../runtime/workers/execution-policy.ts";
import type {
	WorkerSession,
	WorkerSessionFactory,
	WorkerSessionInput,
	WorkerSessionResumeInput,
	WorkerSessionResumeResult,
} from "../runtime/workers/start.ts";

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
	outputFile?: string | ((input: WorkerSessionInput) => string);
	runner?: PiProcessCommandRunner;
	resumeRunner?: PiProcessSessionResumeRunner;
	terminationGraceMs?: number;
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
	timeoutMs?: number;
	terminationGraceMs?: number;
	signal?: AbortSignal;
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
	usage?: WorkerExecutionUsage;
	cancelled?: boolean;
	timedOut?: boolean;
	timeoutMs?: number;
}

export type PiProcessCommandRunner = (
	input: PiProcessCommandRunnerInput,
) => Promise<PiProcessCommandResult> | PiProcessCommandResult;

export type PiProcessSessionResumeRunner = (
	input: WorkerSessionResumeInput,
) => Promise<WorkerSessionResumeResult> | WorkerSessionResumeResult;

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
): WorkerSessionFactory {
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

type PolicyAwareWorkerSessionInput = WorkerSessionInput & {
	executionPolicy?: WorkerExecutionPolicySnapshot;
};

class PiProcessSession implements WorkerSession {
	sessionId?: string;
	sessionFile?: string;
	outputFile?: string;
	pid?: number;
	executionVerification?: WorkerExecutionVerification;
	private readonly input: PolicyAwareWorkerSessionInput;
	private readonly options: PiProcessSessionFactoryOptions;

	constructor(
		input: PolicyAwareWorkerSessionInput,
		options: PiProcessSessionFactoryOptions,
	) {
		this.input = input;
		this.options = options;
	}

	async prompt(
		text: string,
		_options?: unknown,
		signal?: AbortSignal,
	): Promise<void> {
		const commandInput = processCommandInput(
			this.input,
			this.options,
			text,
			signal,
		);
		const startedAt = Date.now();
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
		if (this.input.executionPolicy) {
			this.executionVerification = verifyWorkerExecutionUsage(
				this.input.executionPolicy,
				result.usage ||
					workerUsageFromOutput(result.stdout, Date.now() - startedAt),
			);
		}
	}
}

function processCommandInput(
	input: PolicyAwareWorkerSessionInput,
	options: PiProcessSessionFactoryOptions,
	prompt: string,
	signal?: AbortSignal,
): PiProcessCommandRunnerInput {
	const policy = input.executionPolicy;
	if (policy && options.detached) {
		throw new Error(
			"Policy-controlled Pi workers require foreground usage monitoring.",
		);
	}
	if (policy && options.model && !sameModel(options.model, policy)) {
		throw new Error("Worker execution policy route mismatch.");
	}
	const model = policy
		? {
				provider: policy.route.provider,
				model: policy.route.model,
				thinking: policy.route.thinking,
			}
		: options.model;
	return {
		command: options.command || "pi",
		args: [
			...(options.args || ["--mode", "json", "-p"]),
			...(options.noSession ? ["--no-session"] : []),
			...piModelArgs(model),
			...(policy ? ["--tools", policy.route.allowedTools.join(",")] : []),
			prompt,
		],
		...(options.cwd ? { cwd: options.cwd } : {}),
		...(options.env ? { env: options.env } : {}),
		detached: options.detached === true,
		outputFile: outputFileForSession(input, options),
		workerId: input.workerId,
		workUnitId: input.workUnitId,
		traceId: input.traceId,
		...(policy ? { timeoutMs: policy.route.timeoutMs } : {}),
		...(options.terminationGraceMs === undefined
			? {}
			: { terminationGraceMs: options.terminationGraceMs }),
		...(signal ? { signal } : {}),
	};
}

function sameModel(
	model: PiModelInvocation,
	policy: WorkerExecutionPolicySnapshot,
): boolean {
	return (
		model.provider === policy.route.provider &&
		model.model === policy.route.model &&
		model.thinking === policy.route.thinking
	);
}

function workerUsageFromOutput(
	output: string | undefined,
	latencyMs: number,
): WorkerExecutionUsage | undefined {
	if (!output) return undefined;
	let inputTokens = 0;
	let outputTokens = 0;
	let totalTokens = 0;
	let costUsd = 0;
	let found = false;
	for (const line of output.split(/\r?\n/)) {
		try {
			const event = JSON.parse(line) as Record<string, unknown>;
			const message = record(event.message);
			const raw = record(message?.usage);
			if (!raw) continue;
			const cost = record(raw.cost);
			const eventInput = number(raw.input);
			const eventOutput = number(raw.output);
			const eventTotal = number(raw.totalTokens);
			const eventCost = number(cost?.total);
			if (
				eventInput === undefined ||
				eventOutput === undefined ||
				eventTotal === undefined ||
				eventCost === undefined
			)
				continue;
			found = true;
			inputTokens += eventInput;
			outputTokens += eventOutput;
			totalTokens += eventTotal;
			costUsd += eventCost;
		} catch {
			// Non-JSON process output carries no authoritative usage.
		}
	}
	return found
		? { inputTokens, outputTokens, totalTokens, costUsd, latencyMs }
		: undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function number(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
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
	input: WorkerSessionInput,
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
	input: WorkerSessionInput,
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
	if (input.signal?.aborted) {
		throw new Error("Pi worker process cancelled before start.");
	}
	return await new Promise((resolve, reject) => {
		const child = spawn(input.command, input.args, {
			cwd: input.cwd,
			env: input.env,
			detached: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let cancelled = false;
		let timedOut = false;
		let forceKillTimer: NodeJS.Timeout | undefined;
		const terminationGraceMs = Math.min(
			Math.max(input.terminationGraceMs ?? 1_000, 0),
			30_000,
		);
		const terminate = (): void => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill("SIGTERM");
			forceKillTimer = setTimeout(() => {
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGKILL");
				}
			}, terminationGraceMs);
			forceKillTimer.unref();
		};
		const onAbort = (): void => {
			if (timedOut) return;
			cancelled = true;
			terminate();
		};
		const cleanup = (): void => {
			if (timeoutTimer) clearTimeout(timeoutTimer);
			if (forceKillTimer) clearTimeout(forceKillTimer);
			input.signal?.removeEventListener("abort", onAbort);
		};
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr?.on("data", (chunk) => {
			stderr += String(chunk);
		});
		const timeoutTimer = input.timeoutMs
			? setTimeout(() => {
					if (cancelled) return;
					timedOut = true;
					terminate();
				}, input.timeoutMs)
			: undefined;
		input.signal?.addEventListener("abort", onAbort, { once: true });
		if (input.signal?.aborted) onAbort();
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("close", async (exitCode, processSignal) => {
			cleanup();
			try {
				await mkdir(dirname(input.outputFile), { recursive: true });
				const { writeFile } = await import("node:fs/promises");
				await writeFile(input.outputFile, stdout + stderr);
				resolve({
					pid: child.pid,
					outputFile: input.outputFile,
					exitCode: exitCode ?? (processSignal ? 1 : 0),
					signal: processSignal,
					stdout,
					stderr,
					...(cancelled ? { cancelled: true } : {}),
					...(timedOut
						? { timedOut: true, timeoutMs: input.timeoutMs }
						: {}),
				});
			} catch (error) {
				reject(error);
			}
		});
	});
}

function isFailedProcessResult(result: PiProcessCommandResult): boolean {
	return (
		result.cancelled === true ||
		result.timedOut === true ||
		(typeof result.exitCode === "number" && result.exitCode !== 0)
	);
}

function processFailureMessage(result: PiProcessCommandResult): string {
	if (result.cancelled) return "Pi worker process cancelled.";
	if (result.timedOut) {
		return `Pi worker exceeded timeout ${result.timeoutMs ?? "unknown"}ms.`;
	}
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
