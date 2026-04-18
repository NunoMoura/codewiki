import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const PREFERRED_WIKI_CONFIG_RELATIVE_PATH = ".wiki/config.json";
export const LEGACY_WIKI_CONFIG_RELATIVE_PATH = ".wiki/config.json";
export const WIKI_CONFIG_RELATIVE_PATHS = [PREFERRED_WIKI_CONFIG_RELATIVE_PATH, LEGACY_WIKI_CONFIG_RELATIVE_PATH] as const;
const GIT_MARKER_PATH = ".git";

export async function findWikiRoot(startDir: string): Promise<string | null> {
  return findAncestorWithAnyPath(startDir, WIKI_CONFIG_RELATIVE_PATHS);
}

export async function findRepoRoot(startDir: string): Promise<string | null> {
  return findAncestorWithAnyPath(startDir, [GIT_MARKER_PATH]);
}

export async function requireWikiRoot(startDir: string): Promise<string> {
  const root = await findWikiRoot(startDir);
  if (root) return root;
  throw new Error(
    `No ${WIKI_CONFIG_RELATIVE_PATHS.join(" or ")} found from ${startDir} upward. Run /wiki-bootstrap from the repo root (or folder) that should own wiki/ and .wiki/, then retry.`,
  );
}

export async function resolveWikiConfigPath(root: string): Promise<string | null> {
  for (const relativePath of WIKI_CONFIG_RELATIVE_PATHS) {
    const candidate = resolve(root, relativePath);
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

export async function resolveSetupRoot(startDir: string): Promise<string> {
  return (await findWikiRoot(startDir)) ?? (await findRepoRoot(startDir)) ?? resolve(startDir);
}

async function findAncestorWithAnyPath(startDir: string, relativePaths: readonly string[]): Promise<string | null> {
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
