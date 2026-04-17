import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const WIKI_CONFIG_RELATIVE_PATH = ".docs/config.json";
const GIT_MARKER_PATH = ".git";

export async function findWikiRoot(startDir: string): Promise<string | null> {
  return findAncestorWithPath(startDir, WIKI_CONFIG_RELATIVE_PATH);
}

export async function findRepoRoot(startDir: string): Promise<string | null> {
  return findAncestorWithPath(startDir, GIT_MARKER_PATH);
}

export async function requireWikiRoot(startDir: string): Promise<string> {
  const root = await findWikiRoot(startDir);
  if (root) return root;
  throw new Error(
    `No ${WIKI_CONFIG_RELATIVE_PATH} found from ${startDir} upward. Run /wiki-bootstrap from the repo root (or folder) that should own docs/ and .docs/, then retry.`,
  );
}

export async function resolveSetupRoot(startDir: string): Promise<string> {
  return (await findWikiRoot(startDir)) ?? (await findRepoRoot(startDir)) ?? resolve(startDir);
}

async function findAncestorWithPath(startDir: string, relativePath: string): Promise<string | null> {
  let current = resolve(startDir);
  while (true) {
    const candidate = resolve(current, relativePath);
    if (await pathExists(candidate)) return current;
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
