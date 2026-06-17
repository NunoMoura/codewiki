import { exec, type ExecException, type ExecOptions } from "node:child_process";
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

export interface CreateShellWorktreeCommandRunnerOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
	maxBufferBytes?: number;
	shell?: string;
	exec?: ShellWorktreeCommandExec;
}

export function createShellWorktreeCommandRunner(
	options: CreateShellWorktreeCommandRunnerOptions = {},
): WorktreeCommandRunner {
	const run = (options.exec || exec) as ShellWorktreeCommandExec;
	return (command) =>
		new Promise<WorktreeCommandRunnerResult>((resolve) => {
			run(command, shellExecOptions(options), (error, stdout, stderr) => {
				resolve(shellRunnerResult(error, stdout, stderr));
			});
		});
}

function shellExecOptions(
	options: CreateShellWorktreeCommandRunnerOptions,
): ExecOptions {
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
		...(options.shell ? { shell: options.shell } : {}),
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
