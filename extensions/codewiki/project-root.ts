import { access, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const PREFERRED_WIKI_CONFIG_RELATIVE_PATH = ".wiki/config.json";
export const LEGACY_WIKI_CONFIG_RELATIVE_PATH = ".docs/config.json";
export const WIKI_CONFIG_RELATIVE_PATHS = [
	PREFERRED_WIKI_CONFIG_RELATIVE_PATH,
	LEGACY_WIKI_CONFIG_RELATIVE_PATH,
] as const;
const GIT_MARKER_PATH = ".git";
const DISCOVERY_EXCLUDED_DIRS = new Set([
	".git",
	".hg",
	".svn",
	".pi",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".turbo",
]);

export async function findWikiRoot(startDir: string): Promise<string | null> {
	return findAncestorWithAnyPath(startDir, WIKI_CONFIG_RELATIVE_PATHS);
}

export async function findWikiRootsBelow(
	startDir: string,
	options: { maxDepth?: number; maxResults?: number } = {},
): Promise<string[]> {
	const maxDepth = options.maxDepth ?? 4;
	const maxResults = options.maxResults ?? 24;
	const roots: string[] = [];
	const seen = new Set<string>();
	const start = resolve(startDir);

	await walk(start, 0);
	return roots.sort((a, b) => a.localeCompare(b));

	async function walk(dir: string, depth: number): Promise<void> {
		if (roots.length >= maxResults || seen.has(dir)) return;
		seen.add(dir);

		if (await hasAnyPath(dir, WIKI_CONFIG_RELATIVE_PATHS)) {
			roots.push(dir);
			return;
		}

		if (depth >= maxDepth) return;

		let entries: Array<{ name: string; isDirectory(): boolean }>;
		try {
			entries = (await readdir(dir, { withFileTypes: true })) as Array<{
				name: string;
				isDirectory(): boolean;
			}>;
		} catch {
			return;
		}

		for (const entry of entries) {
			if (roots.length >= maxResults) return;
			if (!entry.isDirectory()) continue;
			if (DISCOVERY_EXCLUDED_DIRS.has(entry.name)) continue;
			await walk(resolve(dir, entry.name), depth + 1);
		}
	}
}

export async function findRepoRoot(startDir: string): Promise<string | null> {
	return findAncestorWithAnyPath(startDir, [GIT_MARKER_PATH]);
}

export async function requireWikiRoot(startDir: string): Promise<string> {
	const root = await findWikiRoot(startDir);
	if (root) return root;
	throw new Error(
		[
			`No ${WIKI_CONFIG_RELATIVE_PATHS.join(" or ")} found from ${startDir} upward.`,
			"codewiki loads globally, but each command targets a repo-local wiki.",
			"Next steps: cd into target repo, pass an explicit repo path to the wiki command, or run /wiki-bootstrap at the repo root if the repo has no wiki yet.",
		].join(" "),
	);
}

export async function resolveWikiConfigPath(
	root: string,
): Promise<string | null> {
	for (const relativePath of WIKI_CONFIG_RELATIVE_PATHS) {
		const candidate = resolve(root, relativePath);
		if (await pathExists(candidate)) return candidate;
	}
	return null;
}

export async function resolveSetupRoot(startDir: string): Promise<string> {
	return (
		(await findWikiRoot(startDir)) ??
		(await findRepoRoot(startDir)) ??
		resolve(startDir)
	);
}

async function findAncestorWithAnyPath(
	startDir: string,
	relativePaths: readonly string[],
): Promise<string | null> {
	let current = resolve(startDir);
	while (true) {
		for (const relativePath of relativePaths) {
			const candidate = resolve(current, relativePath);
			if (await pathExists(candidate)) return current;
		}
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

async function hasAnyPath(
	root: string,
	relativePaths: readonly string[],
): Promise<boolean> {
	for (const relativePath of relativePaths) {
		if (await pathExists(resolve(root, relativePath))) return true;
	}
	return false;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
