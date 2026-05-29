import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { WikiProject } from "../project/types.ts";
import { pathExists } from "../project/local/filesystem.ts";
import { unique } from "../shared/utils.ts";

export interface SourceContractSnapshot {
	version: 1;
	tools: string[];
	commands: string[];
	api_exports: string[];
	package: {
		name: string;
		type: string;
		files: string[];
		pi_extensions: string[];
		pi_skills: string[];
		knip_entry: string[];
	};
	source_files: string[];
	digest: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const TOOL_NAME_RE = /\bname:\s*["'`]((?:codewiki|wiki)_[a-z0-9_]+)["'`]/g;
const COMMAND_NAME_RE = /\.registerCommand\(\s*["'`]([^"'`]+)["'`]/g;
const EXPORT_BLOCK_RE = /export\s+(?:type\s+)?\{([^}]+)\}/g;
const EXPORT_STAR_RE = /export\s+\*\s+from\s+["']([^"']+)["']/g;
const SOURCE_RE = /^(.*?)(?:\s+as\s+.+)?$/;

function normalizeRel(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

async function walkFiles(dir: string): Promise<string[]> {
	if (!(await pathExists(dir))) return [];
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === ".git") continue;
		const child = resolve(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walkFiles(child)));
		else if (SOURCE_EXTENSIONS.has(child.slice(child.lastIndexOf("."))))
			out.push(child);
	}
	return out.sort();
}

async function readIfExists(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return "";
	}
}

function collectMatches(text: string, pattern: RegExp): string[] {
	const out: string[] = [];
	for (const match of text.matchAll(pattern)) {
		const value = String(match[1] || "").trim();
		if (value) out.push(value);
	}
	return unique(out).sort();
}

function parseExportNames(text: string): string[] {
	const names: string[] = [];
	for (const match of text.matchAll(EXPORT_BLOCK_RE)) {
		for (const raw of String(match[1] || "").split(",")) {
			const name = raw.trim().match(SOURCE_RE)?.[1]?.trim();
			if (name) names.push(name);
		}
	}
	for (const match of text.matchAll(EXPORT_STAR_RE)) {
		const ref = String(match[1] || "").trim();
		if (ref) names.push(`* from ${ref}`);
	}
	return unique(names).sort();
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? unique(
				value.map((item) => String(item || "").trim()).filter(Boolean),
			).sort()
		: [];
}

async function readPackageContract(project: WikiProject) {
	const packagePath = resolve(project.root, "package.json");
	const data = JSON.parse(await readFile(packagePath, "utf8"));
	return {
		name: String(data.name || ""),
		type: String(data.type || ""),
		files: asStringArray(data.files),
		pi_extensions: asStringArray(data.pi?.extensions),
		pi_skills: asStringArray(data.pi?.skills),
		knip_entry: asStringArray(data.knip?.entry),
	};
}

export async function generateSourceContractSnapshot(
	project: WikiProject,
): Promise<SourceContractSnapshot> {
	const sourceFiles = await walkFiles(
		resolve(project.root, "src", "adapters", "pi"),
	);
	const toolNames: string[] = [];
	const commandNames: string[] = [];
	for (const file of sourceFiles) {
		const text = await readFile(file, "utf8");
		toolNames.push(...collectMatches(text, TOOL_NAME_RE));
		commandNames.push(...collectMatches(text, COMMAND_NAME_RE));
	}

	const apiFiles = [
		resolve(project.root, "src", "api", "index.ts"),
		resolve(project.root, "src", "api", "tools.ts"),
	].filter(existsSync);
	const apiExports: string[] = [];
	for (const file of apiFiles) {
		apiExports.push(...parseExportNames(await readIfExists(file)));
	}

	const packageContract = await readPackageContract(project);
	const relSourceFiles = unique(
		[...sourceFiles, ...apiFiles, resolve(project.root, "package.json")].map(
			(file) => normalizeRel(relative(project.root, file)),
		),
	).sort();
	const stablePayload = {
		version: 1 as const,
		tools: unique(toolNames).sort(),
		commands: unique(commandNames).sort(),
		api_exports: unique(apiExports).sort(),
		package: packageContract,
		source_files: relSourceFiles,
	};
	return {
		...stablePayload,
		digest: `sha256:${createHash("sha256")
			.update(JSON.stringify(stablePayload))
			.digest("hex")}`,
	};
}
