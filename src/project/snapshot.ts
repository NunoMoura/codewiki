import { lstat, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { pathMatchesPattern } from "../knowledge/file-structure-map.ts";

export const DEFAULT_PROJECT_SNAPSHOT_ROOTS = [
	"src",
	"tests",
	".codewiki/kb",
	"README.md",
	"CHANGELOG.md",
	"LICENSE",
	"package.json",
	"package-lock.json",
	"tsconfig.json",
] as const;

export const DEFAULT_PROJECT_SNAPSHOT_EXCLUDES = [
	".git/**",
	"node_modules/**",
	".pi/**",
	".tmp-worktrees/**",
	"dist/**",
	"coverage/**",
	"*.tgz",
] as const;

export interface ProjectSnapshotInput {
	root: string;
	roots?: string[];
	exclude?: string[];
	includeDirectories?: boolean;
}

export interface ProjectSnapshot {
	root: string;
	roots: string[];
	exclude: string[];
	paths: string[];
	files: string[];
	directories: string[];
	missingRoots: string[];
}

export async function collectProjectSnapshot(
	input: ProjectSnapshotInput,
): Promise<ProjectSnapshot> {
	const root = resolve(input.root);
	const roots = normalizePaths(
		input.roots || [...DEFAULT_PROJECT_SNAPSHOT_ROOTS],
	);
	const exclude = normalizePaths([
		...DEFAULT_PROJECT_SNAPSHOT_EXCLUDES,
		...(input.exclude || []),
	]);
	const files = new Set<string>();
	const directories = new Set<string>();
	const missingRoots: string[] = [];
	for (const rootPath of roots) {
		await collectPath({
			root,
			path: rootPath,
			exclude,
			includeDirectories: Boolean(input.includeDirectories),
			files,
			directories,
			missingRoots,
		});
	}
	const sortedFiles = sortPaths([...files]);
	const sortedDirectories = sortPaths([...directories]);
	return {
		root,
		roots,
		exclude,
		paths: sortPaths([...sortedFiles, ...sortedDirectories]),
		files: sortedFiles,
		directories: sortedDirectories,
		missingRoots: sortPaths(missingRoots),
	};
}

async function collectPath(input: {
	root: string;
	path: string;
	exclude: string[];
	includeDirectories: boolean;
	files: Set<string>;
	directories: Set<string>;
	missingRoots: string[];
}): Promise<void> {
	const path = normalizePath(input.path);
	if (!path || excluded(path, input.exclude)) return;
	let stats;
	try {
		stats = await lstat(resolve(input.root, path));
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			input.missingRoots.push(path);
			return;
		}
		throw error;
	}
	if (stats.isDirectory()) {
		if (input.includeDirectories) input.directories.add(path);
		const entries = await readdir(resolve(input.root, path));
		for (const entry of entries) {
			await collectPath({
				...input,
				path: `${path}/${entry}`,
			});
		}
		return;
	}
	if (stats.isFile()) input.files.add(path);
}

function excluded(path: string, patterns: string[]): boolean {
	return patterns.some((pattern) => pathMatchesPattern(path, pattern));
}

function normalizePaths(values: string[]): string[] {
	return sortPaths(values.map(normalizePath).filter(Boolean));
}

function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\.\//, "")
		.replace(/\/$/, "")
		.trim();
}

function sortPaths(paths: string[]): string[] {
	return Array.from(new Set(paths)).sort((left, right) =>
		left.localeCompare(right),
	);
}

export function repoRelativePath(root: string, path: string): string {
	return normalizePath(relative(resolve(root), resolve(root, path)) || path);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
