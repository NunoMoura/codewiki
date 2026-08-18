import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { TraceUiPreviewTargetBinding } from "./binding.ts";

export type PreviewIntegrationVisibility = "integrated" | "conflicted";

export interface PreviewIntegrationState {
	root: ".";
	gitHead: string;
	gitTree: string;
	workingTreeDigest: string;
	dirty: boolean;
	dirtyPaths: string[];
	visibility: PreviewIntegrationVisibility;
	visibleChangeIds: string[];
	conflictingChangeIds: string[];
	sprintIds: string[];
	workUnitIds: string[];
}

export interface ReadPreviewIntegrationStateInput {
	repoRoot: string;
	binding: TraceUiPreviewTargetBinding;
	conflictingChangeIds?: string[];
	runner?: PreviewIntegrationCommandRunner;
}

export type PreviewIntegrationCommandRunner = (
	args: string[],
	cwd: string,
) => Promise<Buffer>;

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_DIRTY_PATHS = 500;

export async function readPreviewIntegrationState(
	input: ReadPreviewIntegrationStateInput,
): Promise<PreviewIntegrationState> {
	const runner = input.runner || runGit;
	const gitHead = requiredObjectId(
		await runner(["rev-parse", "HEAD"], input.repoRoot),
		"Git HEAD",
	);
	const gitTree = requiredObjectId(
		await runner(["rev-parse", "HEAD^{tree}"], input.repoRoot),
		"Git tree",
	);
	const status = await runner(
		[
			"status",
			"--porcelain=v1",
			"-z",
			"--untracked-files=normal",
			"--",
			".",
			":(exclude).codewiki/runtime/**",
			":(exclude).codewiki/traces/**",
		],
		input.repoRoot,
	);
	const dirtyPaths = porcelainPaths(status);
	if (dirtyPaths.length > MAX_DIRTY_PATHS) {
		throw new Error(
			`Preview integration state exceeds ${MAX_DIRTY_PATHS} dirty paths.`,
		);
	}
	const diff = await runner(
		[
			"diff",
			"--binary",
			"HEAD",
			"--",
			".",
			":(exclude).codewiki/runtime/**",
			":(exclude).codewiki/traces/**",
		],
		input.repoRoot,
	);
	const untracked = await runner(
		[
			"ls-files",
			"--others",
			"--exclude-standard",
			"-z",
			"--",
			".",
			":(exclude).codewiki/runtime/**",
			":(exclude).codewiki/traces/**",
		],
		input.repoRoot,
	);
	const untrackedPaths = nulStrings(untracked);
	if (untrackedPaths.length > MAX_DIRTY_PATHS) {
		throw new Error(
			`Preview integration state exceeds ${MAX_DIRTY_PATHS} untracked paths.`,
		);
	}
	const untrackedHashes: Array<[string, string]> = [];
	for (const path of untrackedPaths.sort(compareText)) {
		const digest = requiredObjectId(
			await runner(["hash-object", "--no-filters", "--", path], input.repoRoot),
			`Git object for ${path}`,
		);
		untrackedHashes.push([path, digest]);
	}
	const workingTreeDigest = integrationDigest({
		gitTree,
		status,
		diff,
		untrackedHashes,
	});
	const conflictingChangeIds = unique(input.conflictingChangeIds || []);
	return {
		root: ".",
		gitHead,
		gitTree,
		workingTreeDigest,
		dirty: status.length > 0,
		dirtyPaths,
		visibility: conflictingChangeIds.length > 0 ? "conflicted" : "integrated",
		visibleChangeIds: unique(input.binding.contributingChangeIds).filter(
			(id) => !conflictingChangeIds.includes(id),
		),
		conflictingChangeIds,
		sprintIds: unique(input.binding.sprintIds),
		workUnitIds: unique(input.binding.workUnitIds),
	};
}

async function runGit(args: string[], cwd: string): Promise<Buffer> {
	const result = await execFileAsync("git", args, {
		cwd,
		encoding: "buffer",
		maxBuffer: MAX_GIT_OUTPUT_BYTES,
		windowsHide: true,
	});
	return result.stdout;
}

function requiredObjectId(value: Buffer, label: string): string {
	const text = value.toString("utf8").trim();
	if (!/^[a-f0-9]{40,64}$/i.test(text)) {
		throw new Error(`Preview integration state could not resolve ${label}.`);
	}
	return text.toLowerCase();
}

function porcelainPaths(value: Buffer): string[] {
	const entries = nulStrings(value);
	const paths: string[] = [];
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		if (entry.length < 4) continue;
		paths.push(entry.slice(3));
		if (
			entry[0] === "R" ||
			entry[1] === "R" ||
			entry[0] === "C" ||
			entry[1] === "C"
		) {
			const source = entries[index + 1];
			if (source) paths.push(source);
			index += 1;
		}
	}
	return unique(paths);
}

function nulStrings(value: Buffer): string[] {
	return value
		.toString("utf8")
		.split("\0")
		.filter((entry) => entry.length > 0);
}

function integrationDigest(value: {
	gitTree: string;
	status: Buffer;
	diff: Buffer;
	untrackedHashes: Array<[string, string]>;
}): string {
	const hash = createHash("sha256");
	hash.update("git-tree\0");
	hash.update(value.gitTree);
	hash.update("\0status\0");
	hash.update(value.status);
	hash.update("\0diff\0");
	hash.update(value.diff);
	for (const [path, digest] of value.untrackedHashes) {
		hash.update("\0untracked\0");
		hash.update(path);
		hash.update("\0");
		hash.update(digest);
	}
	return `sha256:${hash.digest("hex")}`;
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
