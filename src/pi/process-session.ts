import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
	TraceHostSessionFactory,
	TraceHostSessionInput,
	TraceHostSessionStart,
} from "../runtime/trace-host-runner.ts";
import { traceTmpPath } from "../runtime/persistence/tmp.ts";
import {
	isFailedProcessResult,
	piModelArgs,
	processFailureMessage,
	type PiModelInvocation,
	type PiProcessCommandResult,
	type PiProcessCommandRunner,
	type PiProcessCommandRunnerInput,
} from "../harnesses/pi/process-session.ts";
import { runDetachedTraceHostCommand } from "./trace-host-process.ts";

export type { PiModelInvocation } from "../harnesses/pi/process-session.ts";

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
		const result = options.runner
			? await options.runner(commandInput.process)
			: await runDetachedTraceHostCommand(commandInput.process);
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


function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
