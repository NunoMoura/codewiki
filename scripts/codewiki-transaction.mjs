import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path, { dirname, resolve } from "node:path";

export const GENERATED_READONLY_PATHS = [
	".wiki/graph.json",
	".wiki/lint.json",
	".wiki/status-state.json",
	".wiki/roadmap-state.json",
	".wiki/roadmap/**",
];

export const DEFAULT_GATEWAY = {
	enabled: true,
	mode: "read-only",
	allow_paths: [
		".wiki/knowledge/**",
		".wiki/roadmap/tasks/**",
		".wiki/evidence/**",
		".wiki/graph.json",
		".wiki/status-state.json",
		".wiki/roadmap-state.json",
		".wiki/roadmap.json",
		".wiki/roadmap-events.jsonl",
		".wiki/events.jsonl",
	],
	write_paths: [".wiki/knowledge/**", ".wiki/evidence/**"],
	generated_readonly_paths: GENERATED_READONLY_PATHS,
	deny_paths: ["**/.env*", "**/*secret*", ".wiki/sources/private/**"],
	network: false,
	max_stdout_bytes: 12000,
	max_read_bytes: 200000,
	max_write_bytes: 50000,
};

export function readJson(file, fallback = null) {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return fallback;
	}
}

export function normalizeRel(value) {
	return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function globToRegExp(glob) {
	const escaped = normalizeRel(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const pattern = escaped
		.replaceAll("**", "__CODEWIKI_GLOBSTAR__")
		.replaceAll("*", "[^/]*")
		.replaceAll("__CODEWIKI_GLOBSTAR__", ".*");
	return new RegExp(`^${pattern}$`);
}

export function matchesAny(relPath, patterns = []) {
	return patterns.some((pattern) => globToRegExp(pattern).test(relPath));
}

export function loadGateway(repo) {
	const config = readJson(path.join(repo, ".wiki", "config.json"), {});
	return {
		...DEFAULT_GATEWAY,
		...(config?.codewiki?.gateway ?? {}),
		...(config?.codewiki?.runtime ?? {}),
	};
}

export function resolveInsideRepo(repo, file) {
	const absolute = resolve(repo, file);
	if (!absolute.startsWith(repo + path.sep) && absolute !== repo)
		throw new Error(`Path escapes repo: ${file}`);
	return { absolute, relPath: normalizeRel(path.relative(repo, absolute)) };
}

export function assertReadable(repo, gateway, file) {
	const target = resolveInsideRepo(repo, file);
	if (matchesAny(target.relPath, gateway.deny_paths))
		throw new Error(`Denied by policy: ${target.relPath}`);
	if (!matchesAny(target.relPath, gateway.allow_paths))
		throw new Error(`Not readable by policy: ${target.relPath}`);
	return target;
}

export function assertWritable(repo, gateway, file) {
	const target = resolveInsideRepo(repo, file);
	if (matchesAny(target.relPath, gateway.deny_paths))
		throw new Error(`Denied by policy: ${target.relPath}`);
	if (matchesAny(target.relPath, gateway.generated_readonly_paths))
		throw new Error(`Generated/read-only path: ${target.relPath}`);
	if (!matchesAny(target.relPath, gateway.write_paths))
		throw new Error(`Not writable by policy: ${target.relPath}`);
	return target;
}

export function applyPatch(repo, gateway, op) {
	if (
		typeof op.path !== "string" ||
		typeof op.oldText !== "string" ||
		typeof op.newText !== "string"
	)
		throw new Error("patch op requires path, oldText, newText");
	const { absolute, relPath } = assertWritable(repo, gateway, op.path);
	const prior = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
	const count = prior.split(op.oldText).length - 1;
	if (count !== 1)
		throw new Error(
			`Patch oldText must match exactly once in ${relPath}; got ${count}`,
		);
	const next = prior.replace(op.oldText, op.newText);
	if (
		Buffer.byteLength(next) >
		Number(gateway.max_write_bytes ?? DEFAULT_GATEWAY.max_write_bytes)
	)
		throw new Error(`Write exceeds max_write_bytes: ${relPath}`);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, next);
	return { kind: "patch", path: relPath };
}

export function applyAppendJsonl(repo, gateway, op) {
	if (typeof op.path !== "string" || op.value === undefined)
		throw new Error("append_jsonl op requires path and value");
	if (!op.path.endsWith(".jsonl"))
		throw new Error("append_jsonl path must end with .jsonl");
	const { absolute, relPath } = assertWritable(repo, gateway, op.path);
	const line = `${JSON.stringify(op.value)}\n`;
	if (
		Buffer.byteLength(line) >
		Number(gateway.max_write_bytes ?? DEFAULT_GATEWAY.max_write_bytes)
	)
		throw new Error(`Append exceeds max_write_bytes: ${relPath}`);
	mkdirSync(dirname(absolute), { recursive: true });
	appendFileSync(absolute, line);
	return { kind: "append_jsonl", path: relPath };
}

export function runRebuild(repo) {
	for (const command of [
		["python3", "scripts/rebuild_docs_meta.py"],
		["python", "scripts/rebuild_docs_meta.py"],
	]) {
		try {
			execFileSync(command[0], command.slice(1), {
				cwd: repo,
				stdio: "pipe",
				timeout: 120000,
			});
			return;
		} catch {}
	}
	throw new Error("Rebuild failed after transaction");
}

export function applyTransaction(repo, gateway, tx) {
	if (!tx || tx.version !== 1 || !Array.isArray(tx.ops))
		throw new Error("Transaction must be { version: 1, ops: [...] }");
	const applied = [];
	for (const op of tx.ops) {
		if (op.kind === "patch") applied.push(applyPatch(repo, gateway, op));
		else if (op.kind === "append_jsonl")
			applied.push(applyAppendJsonl(repo, gateway, op));
		else throw new Error(`Unsupported transaction op: ${op.kind}`);
	}
	if (applied.length > 0) runRebuild(repo);
	return {
		version: 1,
		summary: tx.summary ?? "Applied codewiki transaction.",
		applied,
	};
}

export function applyTransactionFile(repo, gateway, file) {
	return applyTransaction(repo, gateway, readJson(resolve(file)));
}

export function findWikiRoot(start) {
	let current = resolve(start || process.cwd());
	if (existsSync(current) && statSync(current).isFile())
		current = path.dirname(current);
	while (true) {
		if (existsSync(path.join(current, ".wiki", "config.json"))) return current;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
