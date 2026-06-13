import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { collectProjectSnapshot } from "../project/snapshot.ts";

export interface ContentProof {
	commit?: string;
	tree?: string;
	workingTreeDigest?: string;
}

export interface WorkingTreeDigestInput {
	root: string;
	paths: string[];
	exclude?: string[];
	algorithm?: "sha256";
}

export async function createWorkingTreeContentProof(
	input: WorkingTreeDigestInput,
): Promise<ContentProof> {
	return { workingTreeDigest: await createWorkingTreeDigest(input) };
}

export async function createWorkingTreeDigest(
	input: WorkingTreeDigestInput,
): Promise<string> {
	const algorithm = input.algorithm || "sha256";
	const files = await workingTreeDigestFiles(input);
	if (files.length === 0) {
		throw new Error("Working-tree digest requires at least one file.");
	}
	const hash = createHash(algorithm);
	for (const file of files) {
		const bytes = await readFile(resolve(input.root, file));
		hash.update("file\0");
		hash.update(file);
		hash.update("\0");
		hash.update(String(bytes.length));
		hash.update("\0");
		hash.update(bytes);
		hash.update("\0");
	}
	return `${algorithm}:${hash.digest("hex")}`;
}

export async function workingTreeDigestFiles(
	input: WorkingTreeDigestInput,
): Promise<string[]> {
	const files = new Set<string>();
	for (const path of normalizePaths(input.paths)) {
		const stats = await statExistingPath(input.root, path);
		if (stats.isFile()) {
			files.add(path);
			continue;
		}
		if (stats.isDirectory()) {
			const snapshot = await collectProjectSnapshot({
				root: input.root,
				roots: [path],
				exclude: input.exclude,
			});
			for (const file of snapshot.files) files.add(file);
		}
	}
	return sortPaths([...files]);
}

async function statExistingPath(root: string, path: string) {
	try {
		return await lstat(resolve(root, path));
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new Error(`Missing working-tree digest path: ${path}`);
		}
		throw error;
	}
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
