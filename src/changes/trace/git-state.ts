import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	parseCanonicalChangeOperation,
	parseStateCommitManifest,
	serializeCanonicalChangeOperation,
	serializeStateCommitManifest,
} from "./identity.ts";
import {
	createManifestForRecords,
	replayAcceptedStateBatches,
	type AcceptedProtocolRecord,
	type AcceptedStateBatch,
	type ReplayAdmissionPolicy,
} from "./reducer.ts";
import type {
	GitObjectId,
	OperationId,
	StateCommitManifest,
} from "./contracts.ts";
import type { ProjectWorkState } from "./state.ts";
import { throwProtocolFailure } from "./errors.ts";
import {
	createGitCommandRunner,
	type GitCommandRequest,
	type GitCommandResult,
	type GitCommandRunner,
} from "./git-command.ts";

export const CODEWIKI_STATE_REF = "refs/heads/codewiki/state" as const;
const STATE_MANIFEST_DIRECTORY = ".codewiki/state/manifests";
const CHANGE_DIRECTORY = ".codewiki/changes";
const FIXED_COMMIT_DATE = "2000-01-01T00:00:00Z";

export interface GitStateCommitProposal {
	readonly expectedStateHead: GitObjectId | null;
	readonly stateCommit: GitObjectId;
	readonly manifest: StateCommitManifest;
	readonly records: readonly AcceptedProtocolRecord[];
}

export type GitStatePushResult =
	| {
			readonly status: "accepted";
			readonly expectedStateHead: GitObjectId | null;
			readonly acceptedStateHead: GitObjectId;
	  }
	| {
			readonly status: "stale";
			readonly expectedStateHead: GitObjectId | null;
			readonly observedStateHead: GitObjectId | null;
	  };

export interface CreateGitStateCommitInput {
	readonly repoRoot: string;
	readonly state: ProjectWorkState;
	readonly records: readonly AcceptedProtocolRecord[];
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}

export interface PushGitStateCommitInput {
	readonly repoRoot: string;
	readonly remote: string;
	readonly proposal: GitStateCommitProposal;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}

export interface ReadGitStateHistoryInput {
	readonly repoRoot: string;
	readonly remote: string;
	readonly runner?: GitCommandRunner;
	readonly signal?: AbortSignal;
}

export interface GitStateHistory {
	readonly remoteStateHead: GitObjectId | null;
	readonly batches: readonly AcceptedStateBatch[];
}

export async function createGitStateCommit(
	input: CreateGitStateCommitInput,
): Promise<GitStateCommitProposal> {
	const runner = input.runner ?? createGitCommandRunner();
	const manifest = createManifestForRecords(input.state, input.records);
	const expectedStateHead = input.state.stateHead;
	const entries = [
		...input.records.map((record) => ({
			path: gitStateRecordPath(record),
			bytes: serializeRecord(record),
		})),
		{
			path: gitStateManifestPath(manifest),
			bytes: serializeStateCommitManifest(manifest),
		},
	].sort((left, right) => compareText(left.path, right.path));
	const scratch = await mkdtemp(join(tmpdir(), "codewiki-state-index-"));
	const indexPath = join(scratch, "index");
	const environment = {GIT_INDEX_FILE: indexPath};
	try {
		await runGitChecked(
			runner,
			{
				repoRoot: input.repoRoot,
				args: expectedStateHead
					? ["read-tree", expectedStateHead]
					: ["read-tree", "--empty"],
				environment,
				signal: input.signal,
			},
			"read state tree",
		);
		const indexedEntries = await Promise.all(
			entries.map(async (entry) => ({
				...entry,
				blob: gitObjectId(
					await runGitChecked(
						runner,
						{
							repoRoot: input.repoRoot,
							args: ["hash-object", "-w", "--stdin"],
							input: entry.bytes,
							signal: input.signal,
						},
						"write state blob",
					),
					"state blob",
				),
			})),
		);
		await runGitChecked(
			runner,
			{
				repoRoot: input.repoRoot,
				args: ["update-index", "--index-info"],
				input: indexedEntries
					.map((entry) => `100644 ${entry.blob}\t${entry.path}\n`)
					.join(""),
				environment,
				signal: input.signal,
			},
			"update state index",
		);
		const tree = gitObjectId(
			await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: ["write-tree"],
					environment,
					signal: input.signal,
				},
				"write state tree",
			),
			"state tree",
		);
		const commitEnvironment = {
			GIT_AUTHOR_NAME: "CodeWiki Runtime",
			GIT_AUTHOR_EMAIL: "runtime@codewiki.invalid",
			GIT_AUTHOR_DATE: FIXED_COMMIT_DATE,
			GIT_COMMITTER_NAME: "CodeWiki Runtime",
			GIT_COMMITTER_EMAIL: "runtime@codewiki.invalid",
			GIT_COMMITTER_DATE: FIXED_COMMIT_DATE,
		};
		const stateCommit = gitObjectId(
			await runGitChecked(
				runner,
				{
					repoRoot: input.repoRoot,
					args: [
						"commit-tree",
						tree,
						...(expectedStateHead ? ["-p", expectedStateHead] : []),
					],
					input: "CodeWiki state batch\n",
					environment: commitEnvironment,
					signal: input.signal,
				},
				"create state commit",
			),
			"state commit",
		);
		return {expectedStateHead, stateCommit, manifest, records: input.records};
	} finally {
		await rm(scratch, {recursive: true, force: true});
	}
}

export async function pushGitStateCommit(
	input: PushGitStateCommitInput,
): Promise<GitStatePushResult> {
	assertRemoteName(input.remote);
	const runner = input.runner ?? createGitCommandRunner();
	const expected = input.proposal.expectedStateHead ?? "";
	const result = await runner({
		repoRoot: input.repoRoot,
		args: [
			"-c",
			"credential.interactive=false",
			"push",
			"--porcelain",
			"--no-verify",
			`--force-with-lease=${CODEWIKI_STATE_REF}:${expected}`,
			input.remote,
			`${input.proposal.stateCommit}:${CODEWIKI_STATE_REF}`,
		],
		signal: input.signal,
	});
	const observedStateHead = await readRemoteGitStateHead({
		repoRoot: input.repoRoot,
		remote: input.remote,
		runner,
		signal: input.signal,
	});
	if (result.exitCode !== 0) {
		if (observedStateHead !== input.proposal.expectedStateHead) {
			return {
				status: "stale",
				expectedStateHead: input.proposal.expectedStateHead,
				observedStateHead,
			};
		}
		throw new Error(
			`Git state push failed (${result.exitCode}); remote output was redacted.`,
		);
	}
	if (observedStateHead !== input.proposal.stateCommit) {
		throw new Error("Git state push did not reach the exact proposed commit.");
	}
	return {
		status: "accepted",
		expectedStateHead: input.proposal.expectedStateHead,
		acceptedStateHead: input.proposal.stateCommit,
	};
}

export async function readRemoteGitStateHead(
	input: ReadGitStateHistoryInput,
): Promise<GitObjectId | null> {
	assertRemoteName(input.remote);
	const runner = input.runner ?? createGitCommandRunner();
	const result = await runGitChecked(
		runner,
		{
			repoRoot: input.repoRoot,
			args: [
				"-c",
				"credential.interactive=false",
				"ls-remote",
				"--refs",
				input.remote,
				CODEWIKI_STATE_REF,
			],
			signal: input.signal,
		},
		"read remote state head",
	);
	const line = result.stdout.trim();
	if (!line) return null;
	const [objectId, ref, ...extra] = line.split(/\s+/);
	if (extra.length > 0 || ref !== CODEWIKI_STATE_REF) {
		throw new Error("Remote state head response was malformed.");
	}
	return gitObjectIdText(objectId, "remote state head");
}

export async function readGitStateHistory(
	input: ReadGitStateHistoryInput,
): Promise<GitStateHistory> {
	assertRemoteName(input.remote);
	const runner = input.runner ?? createGitCommandRunner();
	const remoteStateHead = await readRemoteGitStateHead({...input, runner});
	if (!remoteStateHead) return {remoteStateHead: null, batches: []};
	const trackingRef = trackingStateRef(input.remote);
	await runGitChecked(
		runner,
		{
			repoRoot: input.repoRoot,
			args: [
				"-c",
				"credential.interactive=false",
				"fetch",
				"--no-tags",
				"--force",
				input.remote,
				`${CODEWIKI_STATE_REF}:${trackingRef}`,
			],
			signal: input.signal,
		},
		"fetch state history",
	);
	const commits = outputLines(
		await runGitChecked(
			runner,
			{
				repoRoot: input.repoRoot,
				args: ["rev-list", "--reverse", trackingRef],
				signal: input.signal,
			},
			"list state history",
		),
	).map((value) => gitObjectIdText(value, "state history commit"));
	const batches = await Promise.all(
		commits.map((commit) =>
			readStateBatch(input.repoRoot, commit, runner, input.signal),
		),
	);
	if (batches.at(-1)?.stateHead !== remoteStateHead) {
		throw new Error("Fetched state history does not reach the observed remote head.");
	}
	return {remoteStateHead, batches};
}

export async function replayGitStateHistory(
	input: ReadGitStateHistoryInput,
	policy: ReplayAdmissionPolicy,
): Promise<ProjectWorkState> {
	const history = await readGitStateHistory(input);
	return replayAcceptedStateBatches(history.batches, policy);
}

async function readStateBatch(
	repoRoot: string,
	commit: GitObjectId,
	runner: GitCommandRunner,
	signal?: AbortSignal,
): Promise<AcceptedStateBatch> {
	const parents = outputWords(
		await runGitChecked(
			runner,
			{repoRoot, args: ["rev-list", "--parents", "-n", "1", commit], signal},
			"read state commit parent",
		),
	);
	if (parents[0] !== commit || parents.length > 2) {
		throw new Error(`State commit ${commit} must have at most one exact parent.`);
	}
	const previousStateHead = parents[1] ? gitObjectIdText(parents[1], "state parent") : null;
	const manifestPaths = outputLines(
		await runGitChecked(
			runner,
			{
				repoRoot,
				args: [
					"diff-tree",
					"--root",
					"--no-commit-id",
					"--name-only",
					"-r",
					commit,
					"--",
					STATE_MANIFEST_DIRECTORY,
				],
				signal,
			},
			"find state manifest",
		),
	);
	if (manifestPaths.length !== 1) {
		throw new Error(`State commit ${commit} must add exactly one manifest.`);
	}
	const manifestResult = await runGitChecked(
		runner,
		{
			repoRoot,
			args: ["show", `${commit}:${manifestPaths[0]}`],
			signal,
		},
		"read state manifest",
	);
	const manifest = parseStateCommitManifest(manifestResult.stdout);
	if (manifest.body.previousStateHead !== previousStateHead) {
		throw new Error(`State commit ${commit} parent does not match its manifest.`);
	}
	if (manifestPaths[0] !== gitStateManifestPath(manifest)) {
		throw new Error(`State commit ${commit} manifest path does not match identity.`);
	}
	const recordPaths = outputLines(
		await runGitChecked(
			runner,
			{
				repoRoot,
				args: [
					"ls-tree",
					"-r",
					"--name-only",
					commit,
					"--",
					CHANGE_DIRECTORY,
					],
				signal,
			},
			"list state records",
		),
	);
	const records = await Promise.all(
		manifest.body.operationIds.map(async (operationId) => {
			const suffix = `/${digestHex(operationId)}.json`;
			const matches = recordPaths.filter((path) => path.endsWith(suffix));
			if (matches.length !== 1) {
				throw new Error(
					`State record ${operationId} has ${matches.length} matching paths.`,
				);
			}
			const path = matches[0];
			const recordResult = await runGitChecked(
				runner,
				{repoRoot, args: ["show", `${commit}:${path}`], signal},
				"read state record",
			);
			const record: AcceptedProtocolRecord = parseCanonicalChangeOperation(recordResult.stdout);
			if (
				record.operationId !== operationId ||
				gitStateRecordPath(record) !== path
			) {
				throw new Error(`State record ${operationId} path or identity mismatch.`);
			}
			return record;
		}),
	);
	return {stateHead: commit, manifest, records};
}

export function gitStateRecordPath(record: AcceptedProtocolRecord): string {
	return `${CHANGE_DIRECTORY}/${record.body.changeId}/operations/${digestHex(record.operationId)}.json`;
}

export function gitStateManifestPath(manifest: StateCommitManifest): string {
	return `${STATE_MANIFEST_DIRECTORY}/${digestHex(manifest.manifestId)}.json`;
}

function serializeRecord(record: AcceptedProtocolRecord): string {
	return serializeCanonicalChangeOperation(record);
}

function digestHex(operationId: OperationId): string {
	return operationId.slice("sha256:".length);
}

function trackingStateRef(remote: string): string {
	return `refs/codewiki/remotes/${remote}/state`;
}

function assertRemoteName(remote: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(remote)) {
		throw new Error("Git remote name is invalid.");
	}
}

async function runGitChecked(
	runner: GitCommandRunner,
	request: GitCommandRequest,
	operation: string,
): Promise<GitCommandResult> {
	let result: GitCommandResult;
	try {
		result = await runner(request);
	} catch (error) {
		if (request.signal?.aborted) throw error;
		return throwProtocolFailure(
			"GitStateTransportError",
			"GIT_COMMAND_UNAVAILABLE",
			null,
			`Git ${operation} was unavailable; command output was redacted.`,
		);
	}
	if (result.exitCode !== 0) {
		return throwProtocolFailure(
			"GitStateTransportError",
			"GIT_COMMAND_FAILED",
			null,
			`Git ${operation} failed (${result.exitCode}); command output was redacted.`,
		);
	}
	return result;
}

export function isGitStateTransportError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.name === "GitStateTransportError" &&
		"code" in error &&
		(error.code === "GIT_COMMAND_FAILED" ||
			error.code === "GIT_COMMAND_UNAVAILABLE")
	);
}

function gitObjectId(result: GitCommandResult, label: string): GitObjectId {
	return gitObjectIdText(result.stdout.trim(), label);
}

function gitObjectIdText(value: string | undefined, label: string): GitObjectId {
	if (!value || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value)) {
		throw new Error(`Git ${label} is not an object ID.`);
	}
	return value;
}

function outputLines(result: GitCommandResult): string[] {
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function outputWords(result: GitCommandResult): string[] {
	return result.stdout.trim().split(/\s+/).filter(Boolean);
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
