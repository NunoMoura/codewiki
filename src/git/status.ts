import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitStatusSnapshotInput {
	repoRoot: string;
	baseRef?: string;
	strict?: boolean;
	runner?: GitCommandRunner;
}

export interface GitCommandContext {
	repoRoot: string;
	purpose: "repo_root" | "base_sha" | "dirty_paths";
}

export interface GitCommandResult {
	stdout?: string | Buffer;
	stderr?: string | Buffer;
	exitCode?: number;
}

export type GitCommandRunner = (
	args: string[],
	context: GitCommandContext,
) => Promise<GitCommandResult> | GitCommandResult;

export interface GitStatusSnapshot {
	repoRoot: string;
	gitRoot?: string;
	isGitRepository: boolean;
	baseRef: string;
	baseSha?: string;
	dirtyPaths: string[];
	errors: string[];
}

export interface RuntimeWorktreeGitInputs {
	baseRef: string;
	baseSha?: string;
	dirtyPaths: string[];
}

export async function collectGitStatusSnapshot(
	input: GitStatusSnapshotInput,
): Promise<GitStatusSnapshot> {
	const baseRef = input.baseRef || "HEAD";
	const runner = input.runner || defaultGitRunner(input.repoRoot);
	const base = {
		repoRoot: input.repoRoot,
		baseRef,
		dirtyPaths: [],
		errors: [],
	};
	const gitRoot = await runGitCommand(
		runner,
		["rev-parse", "--show-toplevel"],
		{
			repoRoot: input.repoRoot,
			purpose: "repo_root",
		},
	);
	if (!gitRoot.ok) return nonGitSnapshot(base, gitRoot.error, input.strict);
	const [baseSha, dirtyPaths] = await Promise.all([
		runGitCommand(runner, ["rev-parse", "--verify", baseRef], {
			repoRoot: input.repoRoot,
			purpose: "base_sha",
		}),
		runGitCommand(runner, ["status", "--porcelain=v1", "-z"], {
			repoRoot: input.repoRoot,
			purpose: "dirty_paths",
		}),
	]);
	const errors = [baseSha.error, dirtyPaths.error].filter(
		(error): error is string => Boolean(error),
	);
	if (input.strict && errors.length > 0) throw new Error(errors.join(" "));
	return {
		...base,
		gitRoot: gitRoot.stdout.trim(),
		isGitRepository: true,
		...(baseSha.ok ? { baseSha: baseSha.stdout.trim() } : {}),
		dirtyPaths: dirtyPaths.ok ? parseGitPorcelainPaths(dirtyPaths.stdout) : [],
		errors,
	};
}

export function runtimeWorktreeInputsFromGitStatus(
	snapshot: GitStatusSnapshot,
): RuntimeWorktreeGitInputs {
	return {
		baseRef: snapshot.baseSha || snapshot.baseRef,
		...(snapshot.baseSha ? { baseSha: snapshot.baseSha } : {}),
		dirtyPaths: [...snapshot.dirtyPaths],
	};
}

export function parseGitPorcelainPaths(output: string | Buffer): string[] {
	const entries = String(output || "").split("\0");
	const paths: string[] = [];
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		if (!entry) continue;
		const status = entry.slice(0, 2);
		const path = normalizeGitPath(entry.slice(3));
		if (path) paths.push(path);
		if (status.includes("R") || status.includes("C")) {
			const oldPath = normalizeGitPath(entries[index + 1] || "");
			if (oldPath) paths.push(oldPath);
			index += 1;
		}
	}
	return sortUnique(paths);
}

function nonGitSnapshot(
	base: Omit<GitStatusSnapshot, "isGitRepository">,
	error: string | undefined,
	strict: boolean | undefined,
): GitStatusSnapshot {
	if (strict) throw new Error(error || "Not a Git repository.");
	return {
		...base,
		isGitRepository: false,
		errors: error ? [error] : [],
	};
}

async function runGitCommand(
	runner: GitCommandRunner,
	args: string[],
	context: GitCommandContext,
): Promise<{ ok: boolean; stdout: string; error?: string }> {
	try {
		const result = await runner(args, context);
		const stdout = bufferText(result.stdout);
		const stderr = bufferText(result.stderr);
		if ((result.exitCode || 0) !== 0) {
			return { ok: false, stdout, error: commandError(args, stderr) };
		}
		return { ok: true, stdout };
	} catch (error) {
		return { ok: false, stdout: "", error: errorMessage(error) };
	}
}

function defaultGitRunner(repoRoot: string): GitCommandRunner {
	return async (args) => {
		try {
			const result = await execFileAsync("git", ["-C", repoRoot, ...args], {
				encoding: "buffer",
				maxBuffer: 10 * 1024 * 1024,
			});
			return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
		} catch (error) {
			if (isExecError(error)) {
				return {
					stdout: error.stdout,
					stderr: error.stderr,
					exitCode: typeof error.code === "number" ? error.code : 1,
				};
			}
			throw error;
		}
	};
}

function commandError(args: string[], stderr: string): string {
	return stderr || `git ${args.join(" ")} failed.`;
}

function bufferText(value: string | Buffer | undefined): string {
	return Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
}

function normalizeGitPath(path: string): string {
	return path
		.trim()
		.replace(/^"|"$/g, "")
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "");
}

function sortUnique(paths: string[]): string[] {
	return Array.from(new Set(paths.filter(Boolean))).sort((left, right) =>
		left.localeCompare(right),
	);
}

function isExecError(error: unknown): error is NodeJS.ErrnoException & {
	stdout?: string | Buffer;
	stderr?: string | Buffer;
} {
	return typeof error === "object" && error !== null && "code" in error;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
