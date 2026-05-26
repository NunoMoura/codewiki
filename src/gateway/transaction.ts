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
	".codewiki/index_graph.json",
	".codewiki/roadmap/tasks/**",
];

export interface GatewayConfig {
	enabled?: boolean;
	mode?: string;
	allow_paths?: string[];
	write_paths?: string[];
	generated_readonly_paths?: string[];
	deny_paths?: string[];
	network?: boolean;
	max_stdout_bytes?: number;
	max_read_bytes?: number;
	max_write_bytes?: number;
}

export const DEFAULT_GATEWAY: GatewayConfig = {
	enabled: true,
	mode: "read-only",
	allow_paths: [
		".codewiki/kb/**",
		".codewiki/roadmap/queue.json",
		".codewiki/roadmap/tasks/**",
		".codewiki/sources/**",
		".codewiki/research/**",
		".codewiki/session/queue.json",
		".codewiki/index_graph.json",
	],
	write_paths: [".codewiki/kb/**", ".codewiki/sources/**", ".codewiki/research/**"],
	generated_readonly_paths: GENERATED_READONLY_PATHS,
	deny_paths: ["**/.env*", "**/*secret*", ".codewiki/sources/private/**"],
	network: false,
	max_stdout_bytes: 12000,
	max_read_bytes: 200000,
	max_write_bytes: 50000,
};

export function readJson(file: string, fallback: any = null): any {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return fallback;
	}
}

export function normalizeRel(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function globToRegExp(glob: string): RegExp {
	const escaped = normalizeRel(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const pattern = escaped
		.replaceAll("**", "__CODEWIKI_GLOBSTAR__")
		.replaceAll("*", "[^/]*")
		.replaceAll("__CODEWIKI_GLOBSTAR__", ".*");
	return new RegExp(`^${pattern}$`);
}

export function matchesAny(relPath: string, patterns: string[] = []): boolean {
	return patterns.some((pattern) => globToRegExp(pattern).test(relPath));
}

export function loadGateway(repo: string): GatewayConfig {
	const config = readJson(path.join(repo, ".codewiki", "config.json"), {});
	return {
		...DEFAULT_GATEWAY,
		...(config?.codewiki?.gateway ?? {}),
		...(config?.codewiki?.runtime ?? {}),
	};
}

export function resolveInsideRepo(repo: string, file: string) {
	const absolute = resolve(repo, file);
	if (!absolute.startsWith(repo + path.sep) && absolute !== repo)
		throw new Error(`Path escapes repo: ${file}`);
	return { absolute, relPath: normalizeRel(path.relative(repo, absolute)) };
}

export function assertReadable(repo: string, gateway: GatewayConfig, file: string) {
	const target = resolveInsideRepo(repo, file);
	if (matchesAny(target.relPath, gateway.deny_paths))
		throw new Error(`Denied by policy: ${target.relPath}`);
	if (!matchesAny(target.relPath, gateway.allow_paths))
		throw new Error(`Not readable by policy: ${target.relPath}`);
	return target;
}

export function assertWritable(repo: string, gateway: GatewayConfig, file: string) {
	const target = resolveInsideRepo(repo, file);
	if (matchesAny(target.relPath, gateway.deny_paths))
		throw new Error(`Denied by policy: ${target.relPath}`);
	if (matchesAny(target.relPath, gateway.generated_readonly_paths))
		throw new Error(`Generated/read-only path: ${target.relPath}`);
	if (!matchesAny(target.relPath, gateway.write_paths))
		throw new Error(`Not writable by policy: ${target.relPath}`);
	return target;
}

export interface PatchOp {
	kind: "patch";
	path: string;
	oldText: string;
	newText: string;
}

export interface AppendJsonlOp {
	kind: "append_jsonl";
	path: string;
	value: any;
}

export type TransactionOp = PatchOp | AppendJsonlOp;

export interface Transaction {
	version: number;
	summary?: string;
	ops: TransactionOp[];
}

export function applyPatch(repo: string, gateway: GatewayConfig, op: PatchOp) {
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

export function applyAppendJsonl(repo: string, gateway: GatewayConfig, op: AppendJsonlOp) {
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

export async function runRebuild(repo: string) {
	try {
		const { CodewikiRebuilder } = await import("../application/graph/rebuilder.ts");
		const builder = new CodewikiRebuilder(repo);
		await builder.rebuildAll();
	} catch (e) {
		throw new Error("Rebuild failed after patch: " + String(e));
	}
}

export async function applyTransaction(repo: string, gateway: GatewayConfig, tx: Transaction) {
	if (!tx || tx.version !== 1 || !Array.isArray(tx.ops))
		throw new Error("Patch must be { version: 1, ops: [...] }");
	const applied = [];
	for (const op of tx.ops) {
		if (op.kind === "patch") applied.push(applyPatch(repo, gateway, op as PatchOp));
		else if (op.kind === "append_jsonl")
			applied.push(applyAppendJsonl(repo, gateway, op as AppendJsonlOp));
		else throw new Error(`Unsupported patch op: ${(op as any).kind}`);
	}
	if (applied.length > 0) await runRebuild(repo);
	return {
		version: 1,
		summary: tx.summary ?? "Applied codewiki patch.",
		applied,
	};
}

export async function applyTransactionFile(repo: string, gateway: GatewayConfig, file: string) {
	return await applyTransaction(repo, gateway, readJson(resolve(file)));
}

export function findWikiRoot(start?: string): string | null {
	let current = resolve(start || process.cwd());
	if (existsSync(current) && statSync(current).isFile())
		current = path.dirname(current);
	while (true) {
		if (existsSync(path.join(current, ".codewiki", "config.json"))) return current;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
