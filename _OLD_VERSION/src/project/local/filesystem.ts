/**
 * project/local/filesystem.ts
 *
 * Local filesystem I/O implementation used by the built-in CodeWiki runtime.
 * Can be replaced with any other storage backend (e.g. in-memory for tests).
 */

import { readFile, writeFile, mkdir, appendFile, access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Path checks
// ---------------------------------------------------------------------------

export async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export async function isDirectory(path: string): Promise<boolean> {
	try {
		const stat = await import("node:fs/promises").then((fs) => fs.stat(path));
		return stat.isDirectory();
	} catch {
		return false;
	}
}

export async function readText(path: string): Promise<string> {
	return readFile(path, "utf8");
}

export async function writeText(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf8");
}

// ---------------------------------------------------------------------------
// JSON read helpers
// ---------------------------------------------------------------------------

export async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function maybeReadJson<T>(path: string): Promise<T | null> {
	if (!(await pathExists(path))) return null;
	return readJson<T>(path);
}

export function maybeReadJsonSync<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// JSON write helpers
// ---------------------------------------------------------------------------

export async function writeJson(path: string, data: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// JSONL append helpers
// ---------------------------------------------------------------------------

export async function appendJsonl(path: string, record: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await appendFile(path, JSON.stringify(record) + "\n", "utf8");
}
