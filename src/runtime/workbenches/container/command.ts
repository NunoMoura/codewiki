import { spawn } from "node:child_process";

export interface OciContainerCommandInput {
	executable: "docker" | "podman";
	args: string[];
	stdin?: string;
	environment?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
	timeoutMs: number;
	terminationGraceMs: number;
	maxOutputBytes: number;
}

export interface OciContainerCommandResult {
	exitCode: number;
	stdout?: string;
	stderr?: string;
	cancelled?: boolean;
	timedOut?: boolean;
	outputExceeded?: boolean;
}

export type OciContainerCommandRunner = (
	input: OciContainerCommandInput,
) => Promise<OciContainerCommandResult>;

export async function runOciContainerCommand(
	input: OciContainerCommandInput,
): Promise<OciContainerCommandResult> {
	return new Promise((resolveResult) => {
		let settled = false;
		let cancelled = false;
		let timedOut = false;
		let outputExceeded = false;
		let stdoutBytes = 0;
		let stderrBytes = 0;
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		const child = spawn(input.executable, input.args, {
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
			env: input.environment,
		});
		let killTimer: NodeJS.Timeout | undefined;
		const terminate = (): void => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill("SIGTERM");
			killTimer ||= setTimeout(() => {
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGKILL");
				}
			}, input.terminationGraceMs);
			killTimer.unref?.();
		};
		const onAbort = (): void => {
			cancelled = true;
			terminate();
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			terminate();
		}, input.timeoutMs);
		timeout.unref?.();
		const finish = (exitCode: number): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			input.signal?.removeEventListener("abort", onAbort);
			resolveResult({
				exitCode,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
				...(cancelled ? { cancelled: true } : {}),
				...(timedOut ? { timedOut: true } : {}),
				...(outputExceeded ? { outputExceeded: true } : {}),
			});
		};
		const capture = (
			chunks: Buffer[],
			chunk: Buffer | string,
			stream: "stdout" | "stderr",
		): void => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			if (stream === "stdout") stdoutBytes += buffer.length;
			else stderrBytes += buffer.length;
			if (stdoutBytes + stderrBytes > input.maxOutputBytes) {
				outputExceeded = true;
				terminate();
				return;
			}
			chunks.push(buffer);
		};
		child.stdout.on("data", (chunk) => capture(stdout, chunk, "stdout"));
		child.stderr.on("data", (chunk) => capture(stderr, chunk, "stderr"));
		child.stdin.on("error", () => {
			// Child exit may close stdin before the bounded envelope is written.
		});
		child.once("error", () => finish(127));
		child.once("close", (code) => finish(code ?? 1));
		if (input.signal?.aborted) onAbort();
		else input.signal?.addEventListener("abort", onAbort, { once: true });
		child.stdin.end(input.stdin || "");
	});
}
