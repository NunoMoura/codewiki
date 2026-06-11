import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface GitAnchor {
	head: string;
	dirty: boolean;
	dirty_paths: string[];
	paths: Record<string, string>;
}

export class GitCache {
	private readonly repoRoot: string;
	private headCommit: string | null = null;
	private dirtyPaths: string[] | null = null;
	private blobOids: Map<string, string> | null = null;

	constructor(repoRoot: string) {
		this.repoRoot = repoRoot;
	}

	private exec(args: string[]): string {
		try {
			return execFileSync("git", args, {
				cwd: this.repoRoot,
				encoding: "utf8",
				stdio: "pipe",
			}).trim();
		} catch {
			return "";
		}
	}

	public getHeadCommit(): string {
		if (this.headCommit === null) {
			this.headCommit = this.exec(["rev-parse", "HEAD"]);
		}
		return this.headCommit;
	}

	public getDirtyPaths(): string[] {
		if (this.dirtyPaths === null) {
			const raw = this.exec(["status", "--porcelain", "--untracked-files=no"]);
			this.dirtyPaths = uniqueSorted(
				raw.split(/\r?\n/).flatMap(parseDirtyStatusLine),
			);
		}
		return this.dirtyPaths;
	}

	/**
	 * Instant blob lookup using ls-tree instead of N+1 `git log`
	 */
	public prefetchAllBlobOids(): void {
		if (this.blobOids !== null) return;
		this.blobOids = new Map<string, string>();
		const raw = this.exec(["ls-tree", "-r", "HEAD"]);
		if (!raw) return;
		raw.split(/\r?\n/).forEach((line) => {
			const parsed = parseLsTreeLine(line);
			if (parsed) this.blobOids?.set(parsed.filepath, parsed.oid);
		});
	}

	public getFileHash(relPath: string): string {
		this.prefetchAllBlobOids();
		return this.blobOids?.get(relPath) || "";
	}

	public buildAnchor(scopedPaths: string[] = []): GitAnchor {
		const uniqueScoped = uniqueSorted(scopedPaths.map((p) => p.trim()));
		const dirty_paths = scopedDirtyPaths(this.getDirtyPaths(), uniqueScoped);
		return {
			head: this.getHeadCommit(),
			dirty: dirty_paths.length > 0,
			dirty_paths,
			paths: this.scopedPathHashes(uniqueScoped),
		};
	}

	private scopedPathHashes(scopedPaths: string[]): Record<string, string> {
		return Object.fromEntries(
			scopedPaths.flatMap((path) => {
				if (!existsSync(join(this.repoRoot, path))) return [];
				return [[path, this.getFileHash(path)]];
			}),
		);
	}
}

function parseDirtyStatusLine(line: string): string[] {
	if (line.length < 4) return [];
	const rawPath = line.slice(3).trim();
	if (!rawPath) return [];
	const renameTarget = rawPath.split(" -> ").pop();
	return [renameTarget?.trim() || rawPath];
}

function parseLsTreeLine(
	line: string,
): { oid: string; filepath: string } | null {
	// Format: <mode> SP <type> SP <object> TAB <file>
	const match = line.match(/^\d+\s+\w+\s+([a-f0-9]+)\t(.+)$/);
	if (!match) return null;
	const [, oid, filepath] = match;
	return { oid, filepath };
}

function scopedDirtyPaths(allDirty: string[], scopedPaths: string[]): string[] {
	if (scopedPaths.length === 0) return allDirty;
	return allDirty.filter((dirty) =>
		scopedPaths.some((scoped) => dirty === scoped || dirty.startsWith(`${scoped}/`)),
	);
}

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean))).sort();
}
