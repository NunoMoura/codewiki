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
			const paths = new Set<string>();
			for (const line of raw.split(/\r?\n/)) {
				if (line.length < 4) continue;
				let p = line.substring(3).trim();
				if (p.includes(" -> ")) {
					p = p.split(" -> ").pop()!.trim();
				}
				if (p) paths.add(p);
			}
			this.dirtyPaths = Array.from(paths).sort();
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
		for (const line of raw.split(/\r?\n/)) {
			// Format: <mode> SP <type> SP <object> TAB <file>
			const match = line.match(/^\d+\s+\w+\s+([a-f0-9]+)\t(.+)$/);
			if (match) {
				const [, oid, filepath] = match;
				this.blobOids.set(filepath, oid);
			}
		}
	}

	public getFileHash(relPath: string): string {
		this.prefetchAllBlobOids();
		return this.blobOids!.get(relPath) || "";
	}

	public buildAnchor(scopedPaths: string[] = []): GitAnchor {
		const uniqueScoped = Array.from(new Set(scopedPaths.map((p) => p.trim()))).filter(Boolean).sort();
		const allDirty = this.getDirtyPaths();
		
		const dirty_paths = allDirty.filter((dirty) => {
			if (uniqueScoped.length === 0) return true;
			return uniqueScoped.some((scoped) => dirty === scoped || dirty.startsWith(`${scoped}/`));
		});

		const paths: Record<string, string> = {};
		for (const p of uniqueScoped) {
			if (existsSync(join(this.repoRoot, p))) {
				paths[p] = this.getFileHash(p);
			}
		}

		return {
			head: this.getHeadCommit(),
			dirty: dirty_paths.length > 0,
			dirty_paths,
			paths,
		};
	}
}
