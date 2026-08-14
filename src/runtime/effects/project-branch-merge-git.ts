import { createHash } from "node:crypto";
import { lstat, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseGitPorcelainPaths } from "../../git/status.ts";
import type {
	RuntimeWorktreePlan,
	WorktreeCommand,
	WorktreeCommandRunner,
} from "../../git/worktrees.ts";
import type { TraceEvent } from "../../changes/trace/types.ts";

const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const MAX_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;

interface ProjectBranchMergeGitInput {
	repoRoot: string;
	integrationEvent: TraceEvent;
	runner: WorktreeCommandRunner;
}

interface ProjectBranchMergeGitIdentity {
	traceId: string;
	workItemId: string;
	integrationJobId: string;
	targetBranch: string;
	expectedTargetCommit: string;
	commit: string;
	tree: string;
}

export async function promoteProjectBranch(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
	signal: AbortSignal,
): Promise<void> {
	const state = await readProjectCheckout(input, identity, signal);
	if (state.headCommit === identity.commit) return;
	if (state.headCommit !== identity.expectedTargetCommit) {
		throw new Error(
			"Project branch moved after Integration proof; refresh before merge.",
		);
	}
	const hooksPath = await prepareDisabledHooksDirectory(input.repoRoot);
	const result = await runGitResult(
		input,
		identity,
		[
			"-C",
			input.repoRoot,
			"-c",
			`core.hooksPath=${hooksPath}`,
			"merge",
			"--ff-only",
			"--no-edit",
			identity.commit,
		],
		"worktree.prepare",
		signal,
	);
	if (result.exitCode !== 0) {
		const afterFailure = await readProjectCheckout(input, identity, signal);
		if (afterFailure.headCommit !== identity.expectedTargetCommit) {
			throw new Error(
				"Project branch merge failed after moving the target unexpectedly.",
			);
		}
		throw new Error(
			`Project branch fast-forward failed (${result.exitCode}): ${result.stderr.trim().slice(0, 2_000)}`,
		);
	}
	await assertMergedCheckout(input, identity, signal);
}

async function prepareDisabledHooksDirectory(repoRoot: string): Promise<string> {
	const hooksPath = resolve(repoRoot, ".codewiki", "runtime", "empty-hooks");
	for (const path of [
		resolve(repoRoot, ".codewiki"),
		resolve(repoRoot, ".codewiki", "runtime"),
		hooksPath,
	]) {
		try {
			const metadata = await lstat(path);
			if (metadata.isSymbolicLink()) {
				throw new Error("Project branch merge hooks path cannot be symbolic.");
			}
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
	}
	await mkdir(hooksPath, { recursive: true, mode: 0o700 });
	const entries = await readdir(hooksPath);
	if (entries.length > 0) {
		throw new Error("Project branch merge disabled-hooks directory is not empty.");
	}
	return hooksPath;
}

export async function verifyIntegrationCommit(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
	signal: AbortSignal,
): Promise<void> {
	const [commit, tree, parent, message, changedPaths, patch] = await Promise.all([
		gitObjectId(input, identity, [
			"-C",
			input.repoRoot,
			"rev-parse",
			`${identity.commit}^{commit}`,
		], signal),
		gitObjectId(input, identity, [
			"-C",
			input.repoRoot,
			"rev-parse",
			`${identity.commit}^{tree}`,
		], signal),
		gitObjectId(input, identity, [
			"-C",
			input.repoRoot,
			"rev-parse",
			`${identity.commit}^`,
		], signal),
		runGit(input, identity, [
			"-C",
			input.repoRoot,
			"show",
			"-s",
			"--format=%B",
			identity.commit,
		], "worktree.verify", signal),
		runGit(input, identity, [
			"-C",
			input.repoRoot,
			"diff-tree",
			"--no-commit-id",
			"--name-only",
			"-r",
			"-z",
			identity.commit,
		], "worktree.verify", signal),
		runGit(input, identity, [
			"-C",
			input.repoRoot,
			"diff",
			"--binary",
			"--full-index",
			"--no-ext-diff",
			identity.expectedTargetCommit,
			identity.commit,
			"--",
		], "worktree.verify", signal),
	]);
	if (
		commit !== identity.commit ||
		tree !== identity.tree ||
		parent !== identity.expectedTargetCommit
	) {
		throw new Error("Project branch merge Integration Git identity changed.");
	}
	if (
		!message
			.split(/\r?\n/u)
			.includes(`CodeWiki-Integration-Job: ${identity.integrationJobId}`)
	) {
		throw new Error("Project branch merge Integration commit trailer is missing.");
	}
	const eventPaths = stringList(input.integrationEvent.data?.changedPaths).sort(
		compareText,
	);
	if (!sameStrings(parseNulPaths(changedPaths).sort(compareText), eventPaths)) {
		throw new Error("Project branch merge Integration changed paths differ.");
	}
	if (sha256Ref(patch) !== text(input.integrationEvent.data?.integratedPatchDigest)) {
		throw new Error("Project branch merge Integration patch proof differs.");
	}
	await runGit(input, identity, [
		"-C",
		input.repoRoot,
		"diff",
		"--check",
		identity.expectedTargetCommit,
		identity.commit,
		"--",
	], "worktree.verify", signal);
}

async function readProjectCheckout(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
	signal: AbortSignal,
): Promise<{ headCommit: string }> {
	const branchOutput = await runGit(
		input,
		identity,
		[
			"-C",
			input.repoRoot,
			"symbolic-ref",
			"--quiet",
			"HEAD",
		],
		"worktree.verify",
		signal,
	);
	const branch = branchOutput.trim();
	if (branch !== identity.targetBranch) {
		throw new Error("Project branch merge target is not the checked-out branch.");
	}
	const status = await runGit(input, identity, [
		"-C",
		input.repoRoot,
		"status",
		"--porcelain=v1",
		"-z",
	], "worktree.verify", signal);
	const unsafeDirtyPaths = parseGitPorcelainPaths(status).filter(
		(path) =>
			path !== ".codewiki/traces" &&
			!path.startsWith(".codewiki/traces/") &&
			path !== ".codewiki/runtime" &&
			!path.startsWith(".codewiki/runtime/"),
	);
	if (unsafeDirtyPaths.length > 0) {
		throw new Error(
			`Project branch merge requires a clean project checkout: ${unsafeDirtyPaths.slice(0, 20).join(", ")}.`,
		);
	}
	const headCommit = await gitObjectId(input, identity, [
		"-C",
		input.repoRoot,
		"rev-parse",
		identity.targetBranch,
	], signal);
	return { headCommit };
}

export async function assertMergedCheckout(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
	signal: AbortSignal,
): Promise<void> {
	const state = await readProjectCheckout(input, identity, signal);
	if (state.headCommit !== identity.commit) {
		throw new Error("Project branch did not reach exact Integration commit.");
	}
	const tree = await gitObjectId(input, identity, [
		"-C",
		input.repoRoot,
		"rev-parse",
		`${identity.targetBranch}^{tree}`,
	], signal);
	if (tree !== identity.tree) {
		throw new Error("Project branch merged tree differs from Integration proof.");
	}
}

async function runGit(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
	args: string[],
	step: "worktree.prepare" | "worktree.verify",
	signal: AbortSignal,
): Promise<string> {
	const result = await runGitResult(input, identity, args, step, signal);
	if (result.exitCode !== 0) {
		throw new Error(
			`Project branch Git command failed (${result.exitCode}): ${result.stderr.trim().slice(0, 2_000)}`,
		);
	}
	return result.stdout;
}

async function runGitResult(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
	args: string[],
	step: "worktree.prepare" | "worktree.verify",
	signal: AbortSignal,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	signal.throwIfAborted();
	const command: WorktreeCommand = { executable: "git", args };
	const result = await input.runner(command, {
		plan: mergeRunnerPlan(input, identity),
		step,
		command: `git ${args.join(" ")}`,
		commandIndex: 0,
		dryRun: false,
		signal,
	});
	signal.throwIfAborted();
	if (!result || !Number.isInteger(result.exitCode)) {
		throw new Error("Project branch Git runner returned no exit status.");
	}
	const stdout = String(result.stdout || "");
	const stderr = String(result.stderr || "");
	if (
		Buffer.byteLength(stdout, "utf8") > MAX_GIT_OUTPUT_BYTES ||
		Buffer.byteLength(stderr, "utf8") > MAX_GIT_OUTPUT_BYTES
	) {
		throw new Error("Project branch Git output exceeds 8 MiB.");
	}
	return { exitCode: result.exitCode as number, stdout, stderr };
}

function mergeRunnerPlan(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
): RuntimeWorktreePlan {
	return {
		workUnitId: identity.workItemId,
		traceId: identity.traceId,
		workerId: "codewiki-project-branch-merge",
		required: true,
		reason: "guarded project branch merge",
		pathScopes: stringList(input.integrationEvent.data?.changedPaths),
		worktree: {
			path: input.repoRoot,
			branch: identity.targetBranch,
			baseRef: identity.expectedTargetCommit,
			baseSha: identity.expectedTargetCommit,
		},
		commands: {
			worktreePrepare: [],
			worktreeVerify: [],
			worktreeCleanup: [],
		},
	};
}

async function gitObjectId(
	input: ProjectBranchMergeGitInput,
	identity: ProjectBranchMergeGitIdentity,
	args: string[],
	signal: AbortSignal,
): Promise<string> {
	const output = await runGit(
		input,
		identity,
		args,
		"worktree.verify",
		signal,
	);
	return gitObjectIdText(output.trim());
}

function parseNulPaths(value: string): string[] {
	return unique(
		value
			.split("\0")
			.map((path) => path.trim())
			.filter(Boolean),
	);
}

function gitObjectIdText(value: unknown): string {
	const resolved = typeof value === "string" ? value.trim() : "";
	if (!GIT_OBJECT_ID.test(resolved)) {
		throw new Error("Project branch merge Git object identity is invalid.");
	}
	return resolved;
}

function sha256Ref(value: string): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? unique(value.filter((entry): entry is string => typeof entry === "string"))
		: [];
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function sameStrings(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "ENOENT"
	);
}
