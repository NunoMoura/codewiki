import { parseGitPorcelainPaths } from "../git/status.ts";
import type {
	RuntimeWorktreePlan,
	WorktreeCommand,
	WorktreeCommandRunner,
} from "../git/worktrees.ts";
import type { TraceEvent } from "../traces/types.ts";

const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const MAX_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;
const SAFE_REMOTE_URL = /^(?:https?:\/\/|ssh:\/\/|git:\/\/|file:\/\/|\/|[A-Za-z]:[\\/]|[^\s:@]+@[^\s:]+:)/u;

interface ProjectBranchPushGitInput {
	repoRoot: string;
	mergeEvent: TraceEvent;
	runner: WorktreeCommandRunner;
}

interface ProjectBranchPushGitIdentity {
	traceId: string;
	workItemId: string;
	remote: string;
	targetBranch: string;
	expectedRemoteCommit: string | null;
	commit: string;
	tree: string;
}

export async function assertPushCheckout(
	input: ProjectBranchPushGitInput,
	identity: ProjectBranchPushGitIdentity,
	signal: AbortSignal,
): Promise<void> {
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
		signal,
	);
	const branch = branchOutput.trim();
	if (branch !== identity.targetBranch) {
		throw new Error("Project branch push target is not the checked-out branch.");
	}
	const status = await runGit(
		input,
		identity,
		["-C", input.repoRoot, "status", "--porcelain=v1", "-z"],
		signal,
	);
	const unsafeDirtyPaths = parseGitPorcelainPaths(status).filter(
		(path) =>
			path !== ".codewiki/traces" &&
			!path.startsWith(".codewiki/traces/") &&
			path !== ".codewiki/runtime" &&
			!path.startsWith(".codewiki/runtime/"),
	);
	if (unsafeDirtyPaths.length > 0) {
		throw new Error(
			`Project branch push requires a clean project checkout: ${unsafeDirtyPaths.slice(0, 20).join(", ")}.`,
		);
	}
	const [headCommit, tree] = await Promise.all([
		gitObjectId(input, identity, [
			"-C",
			input.repoRoot,
			"rev-parse",
			identity.targetBranch,
		], signal),
		gitObjectId(input, identity, [
			"-C",
			input.repoRoot,
			"rev-parse",
			`${identity.targetBranch}^{tree}`,
		], signal),
	]);
	if (headCommit !== identity.commit || tree !== identity.tree) {
		throw new Error("Project branch push local branch differs from merge proof.");
	}
	const remoteUrlOutput = await runGit(
		input,
		identity,
		[
			"-C",
			input.repoRoot,
			"remote",
			"get-url",
			"--push",
			identity.remote,
		],
		signal,
	);
	const remoteUrl = remoteUrlOutput.trim();
	assertSafeRemoteUrl(remoteUrl);
}

export async function readRemoteBranchCommit(
	input: ProjectBranchPushGitInput,
	identity: ProjectBranchPushGitIdentity,
	signal: AbortSignal,
): Promise<string | null> {
	const output = await runGit(
		input,
		identity,
		[
			"-C",
			input.repoRoot,
			"-c",
			"credential.interactive=false",
			"ls-remote",
			"--heads",
			"--refs",
			identity.remote,
			identity.targetBranch,
		],
		signal,
	);
	const lines = output
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) return null;
	if (lines.length !== 1) {
		throw new Error("Project branch push remote returned ambiguous branch state.");
	}
	const [commit, ref, ...extra] = lines[0].split(/\s+/u);
	if (
		extra.length > 0 ||
		!GIT_OBJECT_ID.test(commit || "") ||
		ref !== identity.targetBranch
	) {
		throw new Error("Project branch push remote branch response is invalid.");
	}
	return commit;
}

export async function pushProjectBranch(
	input: ProjectBranchPushGitInput,
	identity: ProjectBranchPushGitIdentity,
	signal: AbortSignal,
): Promise<void> {
	const result = await runGitResult(
		input,
		identity,
		[
			"-C",
			input.repoRoot,
			"-c",
			"credential.interactive=false",
			"push",
			"--porcelain",
			"--no-verify",
			identity.remote,
			`${identity.commit}:${identity.targetBranch}`,
		],
		signal,
	);
	if (result.exitCode !== 0) {
		throw new Error(
			`Project branch push failed (${result.exitCode}); remote output was redacted.`,
		);
	}
	assertPushReportedUpdate(result.stdout, identity.targetBranch);
	const remoteCommit = await readRemoteBranchCommit(input, identity, signal);
	if (remoteCommit !== identity.commit) {
		throw new Error("Project branch push did not reach exact remote commit.");
	}
}

function assertPushReportedUpdate(
	output: string,
	targetBranch: string,
): void {
	const updates = output.split(/\r?\n/u).flatMap((line) =>
		line.includes("\t") ? [line.split("\t")] : [],
	);
	if (
		updates.length !== 1 ||
		!([" ", "*"] as string[]).includes(updates[0][0] || "") ||
		!(updates[0][1] || "").endsWith(`:${targetBranch}`)
	) {
		throw new Error(
			"Project branch push did not report one exact remote update.",
		);
	}
}

async function runGit(
	input: ProjectBranchPushGitInput,
	identity: ProjectBranchPushGitIdentity,
	args: string[],
	signal: AbortSignal,
): Promise<string> {
	const result = await runGitResult(input, identity, args, signal);
	if (result.exitCode !== 0) {
		throw new Error(
			`Project branch push Git inspection failed (${result.exitCode}); remote output was redacted.`,
		);
	}
	return result.stdout;
}

async function runGitResult(
	input: ProjectBranchPushGitInput,
	identity: ProjectBranchPushGitIdentity,
	args: string[],
	signal: AbortSignal,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	signal.throwIfAborted();
	const command: WorktreeCommand = { executable: "git", args };
	const result = await input.runner(command, {
		plan: pushRunnerPlan(input, identity),
		step: args.includes("push") ? "worktree.prepare" : "worktree.verify",
		command: `git ${args.join(" ")}`,
		commandIndex: 0,
		dryRun: false,
		signal,
	});
	signal.throwIfAborted();
	if (!result || !Number.isInteger(result.exitCode)) {
		throw new Error("Project branch push Git runner returned no exit status.");
	}
	const stdout = String(result.stdout || "");
	const stderr = String(result.stderr || "");
	if (
		Buffer.byteLength(stdout, "utf8") > MAX_GIT_OUTPUT_BYTES ||
		Buffer.byteLength(stderr, "utf8") > MAX_GIT_OUTPUT_BYTES
	) {
		throw new Error("Project branch push Git output exceeds 8 MiB.");
	}
	return { exitCode: result.exitCode as number, stdout, stderr };
}

function pushRunnerPlan(
	input: ProjectBranchPushGitInput,
	identity: ProjectBranchPushGitIdentity,
): RuntimeWorktreePlan {
	return {
		workUnitId: identity.workItemId,
		traceId: identity.traceId,
		workerId: "codewiki-project-branch-push",
		required: true,
		reason: "guarded project branch push",
		pathScopes: [],
		worktree: {
			path: input.repoRoot,
			branch: identity.targetBranch,
			baseRef: identity.commit,
			baseSha: identity.commit,
		},
		commands: {
			worktreePrepare: [],
			worktreeVerify: [],
			worktreeCleanup: [],
		},
	};
}

async function gitObjectId(
	input: ProjectBranchPushGitInput,
	identity: ProjectBranchPushGitIdentity,
	args: string[],
	signal: AbortSignal,
): Promise<string> {
	const output = await runGit(input, identity, args, signal);
	const value = output.trim();
	if (!GIT_OBJECT_ID.test(value)) {
		throw new Error("Project branch push Git object identity is invalid.");
	}
	return value;
}

function assertSafeRemoteUrl(value: string): void {
	if (
		!value ||
		value.length > 4_096 ||
		/[\u0000-\u001f]/u.test(value) ||
		value.startsWith("ext::") ||
		!SAFE_REMOTE_URL.test(value)
	) {
		throw new Error("Project branch push remote URL is unsupported.");
	}
	if (/^https?:\/\/[^/]*@/u.test(value)) {
		throw new Error("Project branch push remote URL cannot contain credentials.");
	}
}
