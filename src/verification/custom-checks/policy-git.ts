import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
	createGitCommandRunner,
	type GitCommandRequest,
	type GitCommandResult,
	type GitCommandRunner,
} from "../../change-trace/git-command.ts";
import type {Sha256Digest} from "../../utils/canonical-json.ts";

const CONFIG_PATH = ".codewiki/config.json";
const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TARGET_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/u;
const SAFE_REMOTE_URL = /^(?:https?:\/\/|ssh:\/\/|git:\/\/|file:\/\/|\/|[A-Za-z]:[\\/]|[^\s:@]+@[^\s:]+:)/u;

export interface CustomCheckPolicyCommitProposal {
	readonly expectedProtectedSourceHead: string;
	readonly acceptedProtectedSourceHead: string;
	readonly acceptedTree: string;
	readonly configBlob: string;
	readonly targetRef: string;
	readonly configDigest: Sha256Digest;
	readonly mutationReceiptId: string;
	readonly reviewReceiptId: string;
	readonly acceptanceIntentDigest: Sha256Digest;
}

type CustomCheckPolicyPushResult =
	| {
			readonly status: "accepted";
			readonly replayed: boolean;
			readonly expectedProtectedSourceHead: string;
			readonly acceptedProtectedSourceHead: string;
	  }
	| {
			readonly status: "stale";
			readonly expectedProtectedSourceHead: string;
			readonly observedProtectedSourceHead: string | null;
	  };

export async function fetchCustomCheckPolicyTarget(input: {
	readonly repoRoot: string;
	readonly remote: string;
	readonly protectedBranch: string;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}): Promise<string> {
	const runner = input.runner ?? createGitCommandRunner();
	const targetRef = customCheckPolicyTargetRef(input.protectedBranch);
	assertRemoteName(input.remote);
	await assertSafeRemote(input.repoRoot, input.remote, runner, input.signal);
	await runGitChecked(
		runner,
		{
			repoRoot: input.repoRoot,
			args: [
				"-c",
				"credential.interactive=false",
				"fetch",
				"--no-tags",
				"--no-write-fetch-head",
				input.remote,
				targetRef,
			],
			...(input.signal ? {signal: input.signal} : {}),
		},
		"fetch protected Custom Check policy target",
	);
	const head = await readRemoteCustomCheckPolicyHead({...input, runner});
	if (!head) {
		throw new Error("Protected Custom Check policy branch does not exist.");
	}
	return head;
}

async function readRemoteCustomCheckPolicyHead(input: {
	readonly repoRoot: string;
	readonly remote: string;
	readonly protectedBranch: string;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}): Promise<string | null> {
	const runner = input.runner ?? createGitCommandRunner();
	const targetRef = customCheckPolicyTargetRef(input.protectedBranch);
	assertRemoteName(input.remote);
	await assertSafeRemote(input.repoRoot, input.remote, runner, input.signal);
	const result = await runGitChecked(
		runner,
		{
			repoRoot: input.repoRoot,
			args: [
				"-c",
				"credential.interactive=false",
				"ls-remote",
				"--heads",
				"--refs",
				input.remote,
				targetRef,
			],
			...(input.signal ? {signal: input.signal} : {}),
		},
		"read protected Custom Check policy head",
	);
	const lines = result.stdout
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) return null;
	if (lines.length !== 1) {
		throw new Error("Protected Custom Check policy branch state is ambiguous.");
	}
	const [head, ref, ...extra] = lines[0].split(/\s+/u);
	if (extra.length > 0 || !GIT_OBJECT_ID.test(head || "") || ref !== targetRef) {
		throw new Error("Protected Custom Check policy branch response is invalid.");
	}
	return head;
}

export async function createCustomCheckPolicyCommit(input: {
	readonly repoRoot: string;
	readonly protectedBranch: string;
	readonly expectedProtectedSourceHead: string;
	readonly configBytes: string;
	readonly configDigest: Sha256Digest;
	readonly mutationReceiptId: string;
	readonly reviewReceiptId: string;
	readonly acceptanceIntentDigest: Sha256Digest;
	readonly reviewedAt: string;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}): Promise<CustomCheckPolicyCommitProposal> {
	const runner = input.runner ?? createGitCommandRunner();
	const targetRef = customCheckPolicyTargetRef(input.protectedBranch);
	assertGitObjectId(input.expectedProtectedSourceHead, "expected protected source head");
	const scratch = await mkdtemp(join(tmpdir(), "codewiki-custom-check-policy-index-"));
	const indexPath = join(scratch, "index");
	const environment = {GIT_INDEX_FILE: indexPath};
	try {
		await runGitChecked(
			runner,
			{
				repoRoot: input.repoRoot,
				args: ["read-tree", input.expectedProtectedSourceHead],
				environment,
				...(input.signal ? {signal: input.signal} : {}),
			},
			"read protected Custom Check policy tree",
		);
		const configBlob = gitObjectId(
			await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: ["hash-object", "-w", "--stdin"],
					input: input.configBytes,
					...(input.signal ? {signal: input.signal} : {}),
				},
				"write protected Custom Check config blob",
			),
			"Custom Check config blob",
		);
		await runGitChecked(
			runner,
			{
				repoRoot: input.repoRoot,
				args: ["update-index", "--index-info"],
				input: `100644 ${configBlob}\t${CONFIG_PATH}\n`,
				environment,
				...(input.signal ? {signal: input.signal} : {}),
			},
			"update protected Custom Check policy index",
		);
		const acceptedTree = gitObjectId(
			await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: ["write-tree"],
					environment,
					...(input.signal ? {signal: input.signal} : {}),
				},
				"write protected Custom Check policy tree",
			),
			"Custom Check policy tree",
		);
		const parentTree = gitObjectId(
			await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: ["rev-parse", `${input.expectedProtectedSourceHead}^{tree}`],
					...(input.signal ? {signal: input.signal} : {}),
				},
				"read protected Custom Check parent tree",
			),
			"Custom Check parent tree",
		);
		if (acceptedTree === parentTree) {
			throw new Error("Protected Custom Check policy commit would not change config.");
		}
		await assertOnlyConfigChanged(
			input.repoRoot,
			input.expectedProtectedSourceHead,
			acceptedTree,
			runner,
			input.signal,
		);
		const commitEnvironment = {
			GIT_AUTHOR_NAME: "CodeWiki Runtime",
			GIT_AUTHOR_EMAIL: "runtime@codewiki.invalid",
			GIT_AUTHOR_DATE: input.reviewedAt,
			GIT_COMMITTER_NAME: "CodeWiki Runtime",
			GIT_COMMITTER_EMAIL: "runtime@codewiki.invalid",
			GIT_COMMITTER_DATE: input.reviewedAt,
		};
		const message = [
			"CodeWiki Custom Check policy",
			"",
			`Custom-Check-Mutation: ${input.mutationReceiptId}`,
			`Custom-Check-Policy-Review: ${input.reviewReceiptId}`,
			`Custom-Check-Acceptance-Intent: ${input.acceptanceIntentDigest}`,
			`Config-Digest: ${input.configDigest}`,
			"",
		].join("\n");
		const acceptedProtectedSourceHead = gitObjectId(
			await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: [
						"commit-tree",
						acceptedTree,
						"-p",
						input.expectedProtectedSourceHead,
					],
					input: message,
					environment: commitEnvironment,
					...(input.signal ? {signal: input.signal} : {}),
				},
				"create protected Custom Check policy commit",
			),
			"Custom Check policy commit",
		);
		return Object.freeze({
			expectedProtectedSourceHead: input.expectedProtectedSourceHead,
			acceptedProtectedSourceHead,
			acceptedTree,
			configBlob,
			targetRef,
			configDigest: input.configDigest,
			mutationReceiptId: input.mutationReceiptId,
			reviewReceiptId: input.reviewReceiptId,
			acceptanceIntentDigest: input.acceptanceIntentDigest,
		});
	} finally {
		await rm(scratch, {recursive: true, force: true});
	}
}

export async function pushCustomCheckPolicyCommit(input: {
	readonly repoRoot: string;
	readonly remote: string;
	readonly proposal: CustomCheckPolicyCommitProposal;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}): Promise<CustomCheckPolicyPushResult> {
	assertRemoteName(input.remote);
	const runner = input.runner ?? createGitCommandRunner();
	const protectedBranch = input.proposal.targetRef.slice("refs/heads/".length);
	await assertSafeRemote(input.repoRoot, input.remote, runner, input.signal);
	const before = await readRemoteCustomCheckPolicyHead({
		repoRoot: input.repoRoot,
		remote: input.remote,
		protectedBranch,
		runner,
		...(input.signal ? {signal: input.signal} : {}),
	});
	if (before === input.proposal.acceptedProtectedSourceHead) {
		return acceptedPush(input.proposal, true);
	}
	if (before !== input.proposal.expectedProtectedSourceHead) {
		return stalePush(input.proposal, before);
	}
	const result = await runner({
		repoRoot: input.repoRoot,
		args: [
			"-c",
			"credential.interactive=false",
			"push",
			"--porcelain",
			"--no-verify",
			`--force-with-lease=${input.proposal.targetRef}:${input.proposal.expectedProtectedSourceHead}`,
			input.remote,
			`${input.proposal.acceptedProtectedSourceHead}:${input.proposal.targetRef}`,
		],
		...(input.signal ? {signal: input.signal} : {}),
	});
	const after = await readRemoteCustomCheckPolicyHead({
		repoRoot: input.repoRoot,
		remote: input.remote,
		protectedBranch,
		runner,
		...(input.signal ? {signal: input.signal} : {}),
	});
	if (after === input.proposal.acceptedProtectedSourceHead) {
		return acceptedPush(input.proposal, result.exitCode !== 0);
	}
	if (after !== input.proposal.expectedProtectedSourceHead) {
		return stalePush(input.proposal, after);
	}
	if (result.exitCode !== 0) {
		throw new Error(
			`Protected Custom Check policy push failed (${result.exitCode}); remote output was redacted.`,
		);
	}
	throw new Error("Protected Custom Check policy push did not reach the exact commit.");
}

function acceptedPush(
	proposal: CustomCheckPolicyCommitProposal,
	replayed: boolean,
): CustomCheckPolicyPushResult {
	return Object.freeze({
		status: "accepted" as const,
		replayed,
		expectedProtectedSourceHead: proposal.expectedProtectedSourceHead,
		acceptedProtectedSourceHead: proposal.acceptedProtectedSourceHead,
	});
}

function stalePush(
	proposal: CustomCheckPolicyCommitProposal,
	observedProtectedSourceHead: string | null,
): CustomCheckPolicyPushResult {
	return Object.freeze({
		status: "stale" as const,
		expectedProtectedSourceHead: proposal.expectedProtectedSourceHead,
		observedProtectedSourceHead,
	});
}

async function assertOnlyConfigChanged(
	repoRoot: string,
	parent: string,
	tree: string,
	runner: GitCommandRunner,
	signal?: AbortSignal,
): Promise<void> {
	const result = await runGitChecked(
		runner,
		{
			repoRoot,
			args: ["diff-tree", "--no-commit-id", "--name-only", "-r", parent, tree],
			...(signal ? {signal} : {}),
		},
		"verify protected Custom Check policy diff",
	);
	const paths = result.stdout
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter(Boolean);
	if (paths.length !== 1 || paths[0] !== CONFIG_PATH) {
		throw new Error("Protected Custom Check policy commit may change only config.json.");
	}
}

async function assertSafeRemote(
	repoRoot: string,
	remote: string,
	runner: GitCommandRunner,
	signal?: AbortSignal,
): Promise<void> {
	const result = await runGitChecked(
		runner,
		{
			repoRoot,
			args: ["remote", "get-url", "--push", remote],
			...(signal ? {signal} : {}),
		},
		"read protected Custom Check policy remote",
	);
	const value = result.stdout.trim();
	if (
		!value ||
		value.length > 4_096 ||
		/[\u0000-\u001f]/u.test(value) ||
		value.startsWith("ext::") ||
		!SAFE_REMOTE_URL.test(value) ||
		/^https?:\/\/[^/]*@/u.test(value)
	) {
		throw new Error("Protected Custom Check policy remote URL is unsupported.");
	}
}

export function customCheckPolicyTargetRef(value: string): string {
	if (
		!TARGET_BRANCH.test(value) ||
		value.includes("..") ||
		value.includes("@{") ||
		value.includes("//") ||
		value.endsWith("/") ||
		value.endsWith(".") ||
		value.endsWith(".lock") ||
		value.split("/").some((segment) => !segment || segment.startsWith("."))
	) {
		throw new Error("Protected Custom Check policy branch is invalid.");
	}
	return `refs/heads/${value}`;
}

function assertRemoteName(value: string): void {
	if (!REMOTE_NAME.test(value)) {
		throw new Error("Protected Custom Check policy remote name is invalid.");
	}
}

function assertGitObjectId(value: string, label: string): void {
	if (!GIT_OBJECT_ID.test(value)) {
		throw new Error(`${label} must be a Git object id.`);
	}
}

function gitObjectId(result: GitCommandResult, label: string): string {
	const value = result.stdout.trim();
	assertGitObjectId(value, label);
	return value;
}

async function runGitChecked(
	runner: GitCommandRunner,
	request: GitCommandRequest,
	operation: string,
): Promise<GitCommandResult> {
	const result = await runner(request);
	if (result.exitCode !== 0) {
		throw new Error(`Could not ${operation}; Git output was redacted.`);
	}
	return result;
}
