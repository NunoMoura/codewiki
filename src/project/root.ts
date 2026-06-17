import { access, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function codewikiRoot(projectRoot: string): string {
	return `${projectRoot}/.codewiki`;
}

export async function findCodewikiProjectRoot(
	startPath = process.cwd(),
): Promise<string | undefined> {
	let current = resolve(startPath);
	while (true) {
		if (await isCodewikiProjectRoot(current)) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

export async function resolveCodewikiProjectRoot(
	explicitRoot?: string,
	options: { allowMissing?: boolean } = {},
): Promise<string> {
	if (explicitRoot) return resolve(explicitRoot);
	const discovered = await findCodewikiProjectRoot();
	if (discovered) return discovered;
	if (options.allowMissing) return process.cwd();
	throw new Error(
		"No CodeWiki project found. Run CodeWiki bootstrap from the project root.",
	);
}

async function isCodewikiProjectRoot(path: string): Promise<boolean> {
	return (
		(await pathExists(resolve(path, ".codewiki", "config.json"))) ||
		(await isDirectory(resolve(path, ".codewiki", "kb")))
	);
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
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
