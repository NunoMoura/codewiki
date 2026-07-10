import {
	exec,
	execFile,
	type ExecException,
	type ExecFileOptions,
	type ExecOptions,
} from "node:child_process";
import type {
	WorktreeCommandRunner,
	WorktreeCommandRunnerResult,
} from "./worktrees.ts";

export type ShellWorktreeCommandExec = (
	command: string,
	options: ExecOptions,
	callback: (
		error: ExecException | null,
		stdout: string | Buffer,
		stderr: string | Buffer,
	) => void,
) => unknown;

export type WorktreeCommandExecFile = (
	executable: string,
	args: string[],
	options: ExecFileOptions,
	callback: (
		error: ExecException | null,
		stdout: string | Buffer,
		stderr: string | Buffer,
	) => void,
) => unknown;

export interface CreateShellWorktreeCommandRunnerOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
	maxBufferBytes?: number;
	shell?: string;
	exec?: ShellWorktreeCommandExec;
	execFile?: WorktreeCommandExecFile;
}

export function createShellWorktreeCommandRunner(
	options: CreateShellWorktreeCommandRunnerOptions = {},
): WorktreeCommandRunner {
	const runShell = (options.exec || exec) as ShellWorktreeCommandExec;
	const runProcess = (options.execFile || execFile) as WorktreeCommandExecFile;
	return (command) =>
		new Promise<WorktreeCommandRunnerResult>((resolve) => {
			const callback = (
				error: ExecException | null,
				stdout: string | Buffer,
				stderr: string | Buffer,
			) => resolve(shellRunnerResult(error, stdout, stderr));
			if (typeof command === "string") {
				runShell(command, shellExecOptions(options), callback);
				return;
			}
			runProcess(
				command.executable,
				command.args,
				processExecOptions(options),
				callback,
			);
		});
}

function shellExecOptions(
	options: CreateShellWorktreeCommandRunnerOptions,
): ExecOptions {
	return {
		...processExecOptions(options),
		...(options.shell ? { shell: options.shell } : {}),
	};
}

function processExecOptions(
	options: CreateShellWorktreeCommandRunnerOptions,
): Omit<ExecOptions, "shell"> {
	return {
		windowsHide: true,
		...(options.cwd ? { cwd: options.cwd } : {}),
		...(options.env ? { env: options.env } : {}),
		...(Number.isInteger(options.timeoutMs)
			? { timeout: options.timeoutMs }
			: {}),
		...(Number.isInteger(options.maxBufferBytes)
			? { maxBuffer: options.maxBufferBytes }
			: {}),
	};
}

function shellRunnerResult(
	error: ExecException | null,
	stdout: string | Buffer,
	stderr: string | Buffer,
): WorktreeCommandRunnerResult {
	const stdoutText = outputText(stdout);
	const stderrText = outputText(stderr);
	const execErrorText =
		error && typeof error.code !== "number" ? error.message : "";
	return {
		...(stdoutText ? { stdout: stdoutText } : {}),
		...(stderrText || execErrorText
			? { stderr: [stderrText, execErrorText].filter(Boolean).join("\n") }
			: {}),
		exitCode: error ? execExitCode(error) : 0,
	};
}

function execExitCode(error: ExecException): number {
	return typeof error.code === "number" ? error.code : 1;
}

function outputText(value: string | Buffer): string {
	return Buffer.isBuffer(value) ? value.toString("utf8") : value;
}
