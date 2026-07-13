import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseIdeasRecord, type IdeasRecord } from "./records.ts";
import {
	DEFAULT_IDEAS_REF,
	IdeasStoreConflictError,
	type IdeasQuery,
	type IdeasStore,
	type IdeasStoreSnapshot,
	type IdeasWriteInput,
	type IdeasWriteResult,
} from "./store.ts";

const ZERO_OID = "0".repeat(40);
const RECORD_DIRECTORY = "changes";

export interface GitRefIdeasStoreOptions {
	repoRoot: string;
	ref?: string;
}

export class GitRefIdeasStore implements IdeasStore {
	readonly repoRoot: string;
	readonly ref: string;

	constructor(options: GitRefIdeasStoreOptions) {
		this.repoRoot = resolve(options.repoRoot);
		this.ref = options.ref || DEFAULT_IDEAS_REF;
		if (!/^refs\/codewiki\/[A-Za-z0-9._/-]+$/.test(this.ref)) {
			throw new Error(
				`Ideas Store ref must stay under refs/codewiki/: ${this.ref}`,
			);
		}
	}

	async read(): Promise<IdeasStoreSnapshot> {
		await this.assertRepository();
		const head = await this.head();
		if (!head) return { head: null, records: [] };
		const paths = await this.recordPaths(head);
		const records = await Promise.all(
			paths.map(async (path) =>
				parseIdeasRecord(JSON.parse(await this.gitShow(head, path))),
			),
		);
		return {
			head,
			records: records.sort((left, right) =>
				left.change.id.localeCompare(right.change.id),
			),
		};
	}

	async get(changeId: string): Promise<IdeasRecord | undefined> {
		assertChangeId(changeId);
		const head = await this.head();
		if (!head) return undefined;
		const result = await runGit(
			["show", `${head}:${recordPath(changeId)}`],
			this.repoRoot,
			{ allowFailure: true },
		);
		if (result.code !== 0) return undefined;
		return parseIdeasRecord(JSON.parse(result.stdout));
	}

	async query(query: IdeasQuery = {}): Promise<IdeasRecord[]> {
		const normalizedText = query.text?.trim().toLowerCase();
		return (await this.read()).records.filter((record) => {
			if (query.status && record.change.status !== query.status) return false;
			if (query.type && record.change.classification.type !== query.type)
				return false;
			if (query.origin && record.change.provenance.origin !== query.origin)
				return false;
			if (!normalizedText) return true;
			return searchableText(record).includes(normalizedText);
		});
	}

	async write(input: IdeasWriteInput): Promise<IdeasWriteResult> {
		await this.assertRepository();
		const actualHead = await this.head();
		if (actualHead !== input.expectedHead) {
			throw new IdeasStoreConflictError(input.expectedHead, actualHead);
		}
		if (!input.records.length)
			throw new Error("Ideas Store write needs records.");
		const records = input.records.map(parseIdeasRecord);
		assertUniqueRecordIds(records);
		await this.assertRecordRevisions(records, actualHead);
		const temporaryDirectory = await mkdtemp(
			join(tmpdir(), "codewiki-ideas-index-"),
		);
		const indexPath = join(temporaryDirectory, "index");
		try {
			const env = { ...process.env, GIT_INDEX_FILE: indexPath };
			await this.prepareIndex(actualHead, env);
			for (const record of records) await this.stageRecord(record, env);
			const tree = (
				await successfulGit(["write-tree"], this.repoRoot, { env })
			).trim();
			const commit = await this.commitTree(tree, actualHead, input);
			const update = await runGit(
				["update-ref", this.ref, commit, actualHead || ZERO_OID],
				this.repoRoot,
				{ allowFailure: true },
			);
			if (update.code !== 0) {
				throw new IdeasStoreConflictError(
					input.expectedHead,
					await this.head(),
				);
			}
			return {
				previousHead: actualHead,
				head: commit,
				writtenChangeIds: records.map((record) => record.change.id).sort(),
			};
		} finally {
			await rm(temporaryDirectory, { recursive: true, force: true });
		}
	}

	private async assertRepository(): Promise<void> {
		const root = (
			await successfulGit(["rev-parse", "--show-toplevel"], this.repoRoot)
		).trim();
		if (resolve(root) !== this.repoRoot) {
			throw new Error(
				`Ideas Store root mismatch: expected ${this.repoRoot}, found ${root}`,
			);
		}
	}

	private async head(): Promise<string | null> {
		const result = await runGit(
			["rev-parse", "--verify", this.ref],
			this.repoRoot,
			{ allowFailure: true },
		);
		return result.code === 0 ? result.stdout.trim() : null;
	}

	private async recordPaths(head: string): Promise<string[]> {
		const result = await successfulGit(
			["ls-tree", "-r", "--name-only", head, "--", RECORD_DIRECTORY],
			this.repoRoot,
		);
		return result
			.split("\n")
			.map((path) => path.trim())
			.filter((path) => path.endsWith(".json"));
	}

	private async gitShow(head: string, path: string): Promise<string> {
		return successfulGit(["show", `${head}:${path}`], this.repoRoot);
	}

	private async assertRecordRevisions(
		records: IdeasRecord[],
		head: string | null,
	): Promise<void> {
		for (const record of records) {
			const current = head
				? await this.recordAt(head, record.change.id)
				: undefined;
			if (!current && record.recordRevision !== 1) {
				throw new Error(
					`New Ideas record ${record.change.id} must start at record revision 1.`,
				);
			}
			if (current && record.recordRevision <= current.recordRevision) {
				throw new Error(
					`Ideas record ${record.change.id} must advance beyond record revision ${current.recordRevision}.`,
				);
			}
		}
	}

	private async recordAt(
		head: string,
		changeId: string,
	): Promise<IdeasRecord | undefined> {
		const result = await runGit(
			["show", `${head}:${recordPath(changeId)}`],
			this.repoRoot,
			{ allowFailure: true },
		);
		return result.code === 0
			? parseIdeasRecord(JSON.parse(result.stdout))
			: undefined;
	}

	private async prepareIndex(
		head: string | null,
		env: NodeJS.ProcessEnv,
	): Promise<void> {
		await successfulGit(
			head ? ["read-tree", head] : ["read-tree", "--empty"],
			this.repoRoot,
			{
				env,
			},
		);
	}

	private async stageRecord(
		record: IdeasRecord,
		env: NodeJS.ProcessEnv,
	): Promise<void> {
		const body = `${JSON.stringify(record, null, 2)}\n`;
		const blob = (
			await successfulGit(["hash-object", "-w", "--stdin"], this.repoRoot, {
				env,
				input: body,
			})
		).trim();
		await successfulGit(
			[
				"update-index",
				"--add",
				"--cacheinfo",
				"100644",
				blob,
				recordPath(record.change.id),
			],
			this.repoRoot,
			{ env },
		);
	}

	private async commitTree(
		tree: string,
		parent: string | null,
		input: IdeasWriteInput,
	): Promise<string> {
		const actor = safeActor(input.actor);
		const env = {
			...process.env,
			GIT_AUTHOR_NAME: actor,
			GIT_AUTHOR_EMAIL: "codewiki-ideas@localhost",
			GIT_AUTHOR_DATE: input.createdAt,
			GIT_COMMITTER_NAME: actor,
			GIT_COMMITTER_EMAIL: "codewiki-ideas@localhost",
			GIT_COMMITTER_DATE: input.createdAt,
		};
		return (
			await successfulGit(
				[
					"commit-tree",
					tree,
					...(parent ? ["-p", parent] : []),
					"-m",
					input.message.trim() || "Update Ideas Store",
				],
				this.repoRoot,
				{ env },
			)
		).trim();
	}
}

interface GitRunOptions {
	allowFailure?: boolean;
	env?: NodeJS.ProcessEnv;
	input?: string;
}

interface GitRunResult {
	code: number;
	stdout: string;
	stderr: string;
}

async function successfulGit(
	args: string[],
	cwd: string,
	options: GitRunOptions = {},
): Promise<string> {
	const result = await runGit(args, cwd, options);
	if (result.code !== 0) {
		throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
	}
	return result.stdout;
}

function runGit(
	args: string[],
	cwd: string,
	options: GitRunOptions = {},
): Promise<GitRunResult> {
	return new Promise((resolveResult, reject) => {
		const child = spawn("git", args, {
			cwd,
			env: options.env || process.env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		child.on("close", (code) => {
			const result = {
				code: code ?? 1,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
			};
			if (result.code !== 0 && !options.allowFailure) {
				reject(new Error(`git ${args[0]} failed: ${result.stderr.trim()}`));
				return;
			}
			resolveResult(result);
		});
		child.stdin.end(options.input || "");
	});
}

function recordPath(changeId: string): string {
	assertChangeId(changeId);
	return `${RECORD_DIRECTORY}/${changeId}.json`;
}

function assertChangeId(changeId: string): void {
	if (!/^CHG-[A-Za-z0-9._-]+$/.test(changeId)) {
		throw new Error(`Invalid Ideas Change id: ${changeId}`);
	}
}

function assertUniqueRecordIds(records: IdeasRecord[]): void {
	const ids = records.map((record) => record.change.id);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Ideas Store write contains duplicate Change ids.");
	}
}

function searchableText(record: IdeasRecord): string {
	return [
		record.change.id,
		record.change.intent.question,
		record.change.intent.currentState,
		record.change.intent.desiredState,
		record.change.intent.rationale,
		...record.change.classification.affectedLayers,
		...record.change.classification.targetRefs,
	]
		.join(" ")
		.toLowerCase();
}

function safeActor(value: string): string {
	return (
		value
			.replace(/[<>\n\r]/g, " ")
			.trim()
			.slice(0, 120) || "CodeWiki Ideas"
	);
}
