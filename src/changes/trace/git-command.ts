import { spawn } from "node:child_process";

export interface GitCommandRequest {
	readonly repoRoot: string;
	readonly args: readonly string[];
	readonly input?: string;
	readonly environment?: Readonly<Record<string, string>>;
	readonly signal?: AbortSignal;
	readonly stdoutEncoding?: "utf8" | "base64";
}

export interface GitCommandResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type GitCommandRunner = (
	request: GitCommandRequest,
) => Promise<GitCommandResult>;

export interface CreateGitCommandRunnerOptions {
	readonly maxOutputBytes?: number;
	readonly environment?: NodeJS.ProcessEnv;
}

export function createGitCommandRunner(
	options: CreateGitCommandRunnerOptions = {},
): GitCommandRunner {
	const maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024;
	const baseEnvironment = options.environment ?? process.env;
	return (request) =>
		new Promise<GitCommandResult>((resolve, reject) => {
			const child = spawn("git", [...request.args], {
				cwd: request.repoRoot,
				env: {...baseEnvironment, ...request.environment},
				stdio: ["pipe", "pipe", "pipe"],
				signal: request.signal,
				windowsHide: true,
			});
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			let outputBytes = 0;
			let settled = false;
			const fail = (error: Error): void => {
				if (settled) return;
				settled = true;
				child.kill("SIGKILL");
				reject(error);
			};
			const collect = (target: Buffer[], value: Buffer): void => {
				outputBytes += value.length;
				if (outputBytes > maxOutputBytes) {
					fail(new Error(`Git command exceeded ${maxOutputBytes} output bytes.`));
					return;
				}
				target.push(value);
			};
			child.stdout.on("data", (value: Buffer) => collect(stdout, value));
			child.stderr.on("data", (value: Buffer) => collect(stderr, value));
			child.on("error", fail);
			child.on("close", (code, signal) => {
				if (settled) return;
				settled = true;
				if (signal) {
					reject(new Error(`Git command terminated by ${signal}.`));
					return;
				}
				resolve({
					exitCode: code ?? 1,
					stdout: Buffer.concat(stdout).toString(request.stdoutEncoding ?? "utf8"),
					stderr: Buffer.concat(stderr).toString("utf8"),
				});
			});
			if (request.input === undefined) {
				child.stdin.end();
			} else {
				child.stdin.end(request.input, "utf8");
			}
		});
}
