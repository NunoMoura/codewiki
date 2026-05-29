import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
	applyTransactionFile,
	assertReadable,
	DEFAULT_GATEWAY,
	findWikiRoot,
	loadGateway,
	matchesAny,
	normalizeRel,
	readJson,
} from "./transaction.ts";
import type { GatewayConfig } from "./transaction.ts";

function usage(): string {
	return `Usage:
  node scripts/codewiki-gateway.mjs manifest [repo]
  node scripts/codewiki-gateway.mjs tree [repo]
  node scripts/codewiki-gateway.mjs pack [TASK-###] [repo]
  node scripts/codewiki-gateway.mjs apply <patch.json> [repo]
  CODEWIKI_ALLOW_UNSAFE_RUN=1 node scripts/codewiki-gateway.mjs unsafe-run <script.js> [repo]

Runs policy-bound .codewiki exploration and validated patches. Only stdout enters agent context.

Patch v1 ops:
  {"kind":"patch","path":".codewiki/kb/...","oldText":"...","newText":"..."}
  {"kind":"append_jsonl","path":".codewiki/sources/...jsonl","value":{...}}

Note: unsafe-run executes local JavaScript with Node vm and is not a security sandbox. Prefer think-code for sandboxed analysis.`;
}

interface WalkEntry {
	path: string;
	bytes: number;
}

function walk(
	repo: string,
	gateway: GatewayConfig,
	start = ".codewiki",
): WalkEntry[] {
	const out: WalkEntry[] = [];
	const stack = [path.join(repo, start)];
	while (stack.length) {
		const current = stack.pop()!;
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

function makeApi(repo: string, gateway: GatewayConfig) {
	let bytesRead = 0;
	const readAllowedText = (file: string) => {
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
		tree: (start = ".codewiki") => walk(repo, gateway, start),
		readText: readAllowedText,
		readJson: (file: string) => JSON.parse(readAllowedText(file)),
		grep: (pattern: string, start = ".codewiki") => {
			const needle = pattern.trim();
			if (!needle) return [];
			const regex = new RegExp(escapeRegExp(needle), "i");
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capabilityManifest() {
	return {
		version: 1,
		capabilities: [
			{
				name: "codewiki.state",
				class: "read",
				summary:
					"Read compact repo, health, roadmap, session, and task context state.",
				args_schema: "codewikiStateToolInputSchema",
				result_schema: "CodeWiki state snapshot",
				writes: [],
				audit: ["repo", "sections", "taskId", "refresh"],
			},
			{
				name: "codewiki.roadmap",
				class: "semantic-write",
				summary:
					"Create, update, close, cancel, append evidence to roadmap tasks, or update sprint metadata.",
				args_schema: "codewikiRoadmapToolInputSchema",
				result_schema: "CodeWiki roadmap mutation result",
				writes: [".codewiki/roadmap/queue.json"],
				audit: [
					"repo",
					"action",
					"taskId",
					"evidence",
					"files_touched",
					"issues",
				],
			},
			{
				name: "codewiki.session",
				class: "session-write",
				summary:
					"Record Pi session focus and runtime notes linked to roadmap tasks.",
				args_schema: "codewikiSessionToolInputSchema",
				result_schema: "CodeWiki session link result",
				writes: ["Pi session history (adapter-owned)"],
				audit: ["repo", "action", "taskId", "session"],
			},
			{
				name: "codewiki.artifact_status",
				class: "coordination-write",
				summary:
					"Mark, release, heartbeat, wait on, or list runtime artifact status for parallel work.",
				args_schema: "codewikiArtifactStatusToolInputSchema",
				result_schema: "CodeWiki artifact status result",
				writes: [".codewiki/session/queue.json", ".codewiki/index_graph.json"],
				audit: ["repo", "action", "recordId", "taskId", "scopes", "session"],
			},
			{
				name: "codewiki.patch",
				class: "validated-write",
				summary:
					"Apply exact-text knowledge patches or append-only source/research patches.",
				args_schema: "patch v1 JSON",
				result_schema: "patch apply result",
				writes: [
					".codewiki/kb/**/*.md",
					".codewiki/sources/**/*.jsonl",
					".codewiki/research/**/*.jsonl",
				],
				audit: ["repo", "summary", "ops", "paths"],
			},
			{
				name: "codewiki.rebuild",
				class: "derived-write",
				summary:
					"Regenerate graph, lint, status, roadmap state, and task context views.",
				args_schema: "rebuild command config",
				result_schema: "rebuild result",
				writes: [
					".codewiki/index_graph.json",
					".codewiki/roadmap/tasks/*/context.json",
					".codewiki/roadmap/tasks/*/task.json",
				],
				audit: ["repo", "command", "exitCode"],
			},
		],
	};
}

function currentTaskPack(repo: string, taskId?: string) {
	const indexGraph = readJson(
		path.join(repo, ".codewiki", "index_graph.json"),
		{},
	);
	const status = indexGraph.lenses?.status ?? {};
	const roadmap = indexGraph.lenses?.roadmap ?? {};
	const id =
		taskId || status?.resume?.task_id || roadmap?.views?.open_task_ids?.[0];
	const context = id
		? readJson(
				path.join(repo, ".codewiki", "roadmap", "tasks", id, "context.json"),
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

async function runUserScript(
	repo: string,
	gateway: GatewayConfig,
	scriptPath: string,
) {
	const script = readFileSync(path.resolve(scriptPath), "utf8");
	const logs: string[] = [];
	const api = makeApi(repo, gateway);
	const print = (...args: any[]) =>
		logs.push(
			args
				.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
				.join(" "),
		);

	const context = vm.createContext({ api, print, console: { log: print } });
	const result = await vm.runInContext(
		`(async () => {\n${script}\n})()`,
		context,
	);

	if (result !== undefined)
		logs.push(
			typeof result === "string" ? result : JSON.stringify(result, null, 2),
		);
	return logs.join("\n");
}

export async function gatewayMain(args: string[]) {
	const [command, first, second] = args;
	if (!command || command === "--help" || command === "-h") return usage();
	if (command === "run") {
		throw new Error(
			"Gateway command 'run' was removed because Node vm is not a security sandbox. Use 'unsafe-run' with CODEWIKI_ALLOW_UNSAFE_RUN=1, or prefer think-code.",
		);
	}
	const repoArg =
		command === "unsafe-run" || command === "apply"
			? second
			: command === "pack" && first?.startsWith("TASK-")
				? second
				: first;
	const repo = findWikiRoot(repoArg || process.cwd());
	if (!repo) throw new Error("No .codewiki/config.json found");
	const gateway = loadGateway(repo);
	if (!gateway.enabled)
		throw new Error("Codewiki gateway disabled in .codewiki/config.json");
	let output: string | undefined;
	if (command === "manifest")
		output = JSON.stringify(capabilityManifest(), null, 2);
	else if (command === "tree")
		output = JSON.stringify(walk(repo, gateway), null, 2);
	else if (command === "pack")
		output = JSON.stringify(
			currentTaskPack(repo, first?.startsWith("TASK-") ? first : undefined),
			null,
			2,
		);
	else if (command === "apply")
		output = JSON.stringify(
			await applyTransactionFile(repo, gateway, first),
			null,
			2,
		);
	else if (command === "unsafe-run") {
		if (process.env.CODEWIKI_ALLOW_UNSAFE_RUN !== "1") {
			throw new Error(
				"unsafe-run requires CODEWIKI_ALLOW_UNSAFE_RUN=1 and should only execute trusted local scripts.",
			);
		}
		output = await runUserScript(repo, gateway, first);
	} else throw new Error(`Unknown command: ${command}`);
	const limit = Number(
		gateway.max_stdout_bytes ?? DEFAULT_GATEWAY.max_stdout_bytes,
	);
	const bytes = Buffer.byteLength(output);
	if (bytes > limit)
		output = `${output.slice(0, limit)}\n[truncated by codewiki gateway: ${bytes} bytes > ${limit}]`;
	return output;
}
