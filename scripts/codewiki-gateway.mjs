#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
	applyTransactionFile,
	assertReadable,
	DEFAULT_GATEWAY,
	findWikiRoot,
	loadGateway,
	matchesAny,
	normalizeRel,
	readJson,
} from "./codewiki-transaction.mjs";

function usage() {
	return `Usage:
  node scripts/codewiki-gateway.mjs tree [repo]
  node scripts/codewiki-gateway.mjs pack [TASK-###] [repo]
  node scripts/codewiki-gateway.mjs apply <transaction.json> [repo]
  node scripts/codewiki-gateway.mjs run <script.js> [repo]

Runs policy-bound .wiki exploration and validated transactions. Only stdout enters agent context.

Transaction v1 ops:
  {"kind":"patch","path":".wiki/knowledge/...","oldText":"...","newText":"..."}
  {"kind":"append_jsonl","path":".wiki/evidence/...jsonl","value":{...}}

Note: run is read-only fallback and not a security sandbox.`;
}

function walk(repo, gateway, start = ".wiki") {
	const out = [];
	const stack = [path.join(repo, start)];
	while (stack.length) {
		const current = stack.pop();
		if (!existsSync(current)) continue;
		const stat = statSync(current);
		if (stat.isDirectory()) {
			for (const child of readdirSync(current))
				stack.push(path.join(current, child));
			continue;
		}
		const relPath = normalizeRel(path.relative(repo, current));
		if (matchesAny(relPath, gateway.deny_paths)) continue;
		if (!matchesAny(relPath, gateway.allow_paths)) continue;
		out.push({ path: relPath, bytes: stat.size });
	}
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

function makeApi(repo, gateway) {
	let bytesRead = 0;
	const readAllowedText = (file) => {
		const { absolute } = assertReadable(repo, gateway, file);
		const text = readFileSync(absolute, "utf8");
		bytesRead += Buffer.byteLength(text);
		if (
			bytesRead >
			Number(gateway.max_read_bytes ?? DEFAULT_GATEWAY.max_read_bytes)
		)
			throw new Error("Gateway max_read_bytes exceeded");
		return text;
	};
	return {
		repo,
		gateway: { ...gateway, deny_paths: [...(gateway.deny_paths ?? [])] },
		tree: (start = ".wiki") => walk(repo, gateway, start),
		readText: readAllowedText,
		readJson: (file) => JSON.parse(readAllowedText(file)),
		grep: (pattern, start = ".wiki") => {
			const regex = new RegExp(pattern, "i");
			return walk(repo, gateway, start).flatMap((entry) => {
				const text = readAllowedText(entry.path);
				return text.split(/\r?\n/).flatMap((line, index) =>
					regex.test(line)
						? [
								{
									path: entry.path,
									line: index + 1,
									text: line.slice(0, 300),
								},
							]
						: [],
				);
			});
		},
	};
}

function currentTaskPack(repo, taskId) {
	const status = readJson(path.join(repo, ".wiki", "status-state.json"), {});
	const roadmap = readJson(path.join(repo, ".wiki", "roadmap-state.json"), {});
	const id =
		taskId || status?.resume?.task_id || roadmap?.views?.open_task_ids?.[0];
	const context = id
		? readJson(
				path.join(repo, ".wiki", "roadmap", "tasks", id, "context.json"),
				null,
			)
		: null;
	return {
		project: status?.project?.name ?? path.basename(repo),
		health: status?.health,
		summary: status?.summary,
		next_step: status?.next_step,
		resume: status?.resume,
		task_context: context,
	};
}

async function runUserScript(repo, gateway, scriptPath) {
	const script = readFileSync(path.resolve(scriptPath), "utf8");
	const logs = [];
	const api = makeApi(repo, gateway);
	const print = (...args) =>
		logs.push(
			args
				.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
				.join(" "),
		);
	const fn = new Function(
		"api",
		"print",
		`"use strict"; return (async () => {\n${script}\n})()`,
	);
	const result = await fn(api, print);
	if (result !== undefined)
		logs.push(
			typeof result === "string" ? result : JSON.stringify(result, null, 2),
		);
	return logs.join("\n");
}

async function main() {
	const [command, first, second] = process.argv.slice(2);
	if (!command || command === "--help" || command === "-h")
		return console.log(usage());
	const repoArg =
		command === "run" || command === "apply"
			? second
			: command === "pack" && first?.startsWith("TASK-")
				? second
				: first;
	const repo = findWikiRoot(repoArg || process.cwd());
	if (!repo) throw new Error("No .wiki/config.json found");
	const gateway = loadGateway(repo);
	if (!gateway.enabled)
		throw new Error("Codewiki gateway disabled in .wiki/config.json");
	let output;
	if (command === "tree") output = JSON.stringify(walk(repo, gateway), null, 2);
	else if (command === "pack")
		output = JSON.stringify(
			currentTaskPack(repo, first?.startsWith("TASK-") ? first : undefined),
			null,
			2,
		);
	else if (command === "apply")
		output = JSON.stringify(
			applyTransactionFile(repo, gateway, first),
			null,
			2,
		);
	else if (command === "run")
		output = await runUserScript(repo, gateway, first);
	else throw new Error(`Unknown command: ${command}`);
	const limit = Number(
		gateway.max_stdout_bytes ?? DEFAULT_GATEWAY.max_stdout_bytes,
	);
	const bytes = Buffer.byteLength(output);
	if (bytes > limit)
		output = `${output.slice(0, limit)}\n[truncated by codewiki gateway: ${bytes} bytes > ${limit}]`;
	console.log(output);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
