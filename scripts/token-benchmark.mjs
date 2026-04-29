#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path, { resolve } from "node:path";
import { findWikiRoot } from "./codewiki-transaction.mjs";

const TOKEN_BYTES = 4;

function usage() {
	return `Usage: node scripts/token-benchmark.mjs [repo] [--json]\n\nMeasures approximate token expenditure for codewiki state surfaces.\nDefault repo is current working directory or nearest ancestor with .wiki/config.json.`;
}

function parseArgs(argv) {
	const args = { repo: process.cwd(), json: false, help: false };
	for (const arg of argv) {
		if (arg === "--json") args.json = true;
		else if (arg === "--help" || arg === "-h") args.help = true;
		else args.repo = arg;
	}
	return args;
}

function walkFiles(root, predicate = () => true) {
	if (!existsSync(root)) return [];
	const out = [];
	const stack = [root];
	while (stack.length) {
		const item = stack.pop();
		const stat = statSync(item);
		if (stat.isDirectory()) {
			for (const child of readdirSync(item)) stack.push(path.join(item, child));
		} else if (stat.isFile() && predicate(item)) {
			out.push(item);
		}
	}
	return out.sort();
}

function readText(file) {
	if (!existsSync(file)) return "";
	return readFileSync(file, "utf8");
}

function readJson(file, fallback = null) {
	try {
		return JSON.parse(readText(file));
	} catch {
		return fallback;
	}
}

function rel(repo, file) {
	return path.relative(repo, file).replaceAll(path.sep, "/");
}

function bundle(repo, files) {
	const existing = [...new Set(files)].filter((file) => existsSync(file));
	const text = existing
		.map((file) => `--- ${rel(repo, file)} ---\n${readText(file)}`)
		.join("\n");
	return {
		files: existing,
		bytes: Buffer.byteLength(text),
		chars: text.length,
	};
}

function tokens(bytes) {
	return Math.ceil(bytes / TOKEN_BYTES);
}

function pctSaved(rawBytes, compactBytes) {
	if (!rawBytes) return 0;
	return Math.round((1 - compactBytes / rawBytes) * 1000) / 10;
}

function latestLines(file, count) {
	const lines = readText(file).split(/\r?\n/).filter(Boolean);
	return lines.slice(Math.max(0, lines.length - count)).join("\n");
}

function makeAgentDefaultText(repo, statusState, roadmapState, taskContext) {
	const project = statusState?.project?.name ?? path.basename(repo);
	const health =
		statusState?.health?.color ?? roadmapState?.health?.color ?? "unknown";
	const summary = statusState?.summary ?? roadmapState?.summary ?? {};
	const next = statusState?.next_step ?? {};
	const resume = statusState?.resume ?? {};
	const openIds =
		roadmapState?.views?.open_task_ids ??
		statusState?.roadmap?.open_task_ids ??
		[];
	const task =
		taskContext?.task ??
		roadmapState?.tasks?.[resume.task_id] ??
		roadmapState?.tasks?.[openIds[0]] ??
		null;
	const packet = {
		project,
		health,
		summary: {
			specs: summary.total_specs,
			open_tasks: summary.open_task_count ?? summary.open_count,
			done_tasks: summary.done_task_count,
			warnings: statusState?.health?.warnings ?? roadmapState?.health?.warnings,
		},
		next_step: {
			command: next.command ?? resume.command,
			reason: next.reason ?? resume.verification,
		},
		resume: {
			source: resume.source,
			task_id: resume.task_id ?? task?.id,
			phase: resume.phase ?? task?.loop?.phase,
			evidence: resume.evidence ?? task?.loop?.evidence?.summary,
		},
		task: task
			? {
					id: task.id,
					title: task.title,
					status: task.status,
					priority: task.priority,
					summary: task.summary,
					goal: task.goal,
					delta: task.delta,
					verification:
						taskContext?.resume?.verification ?? task.goal?.verification,
				}
			: null,
	};
	return JSON.stringify(packet, null, 2);
}

function summarizeEvents(repo, files) {
	const summaries = [];
	for (const file of files) {
		const text = readText(file);
		const lines = text.split(/\r?\n/).filter(Boolean);
		const bytes = Buffer.byteLength(text);
		summaries.push({
			file: rel(repo, file),
			lines: lines.length,
			bytes,
			est_tokens: tokens(bytes),
			avg_bytes_per_event: lines.length ? Math.round(bytes / lines.length) : 0,
		});
	}
	return summaries;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(usage());
		return;
	}

	const repo = findWikiRoot(args.repo);
	if (!repo)
		throw new Error(`No .wiki/config.json found from ${resolve(args.repo)}`);

	const wiki = path.join(repo, ".wiki");
	const knowledgeFiles = walkFiles(path.join(wiki, "knowledge"), (file) =>
		/\.(md|mdx|txt)$/i.test(file),
	);
	const evidenceFiles = walkFiles(path.join(wiki, "evidence"), (file) =>
		/\.jsonl$/i.test(file),
	);
	const taskContextFiles = walkFiles(
		path.join(wiki, "roadmap", "tasks"),
		(file) => path.basename(file) === "context.json",
	);
	const stateFiles = [
		path.join(wiki, "status-state.json"),
		path.join(wiki, "roadmap-state.json"),
	];
	const lifecycleFiles = [
		path.join(wiki, "roadmap.json"),
		path.join(wiki, "roadmap-events.jsonl"),
		path.join(wiki, "events.jsonl"),
	];
	const rawTruthFiles = [
		...knowledgeFiles,
		...evidenceFiles,
		...lifecycleFiles,
	];

	const statusState = readJson(path.join(wiki, "status-state.json"), {});
	const roadmapState = readJson(path.join(wiki, "roadmap-state.json"), {});
	const resumeTaskId =
		statusState?.resume?.task_id ??
		roadmapState?.views?.open_task_ids?.[0] ??
		null;
	const taskContextPath = resumeTaskId
		? path.join(wiki, "roadmap", "tasks", resumeTaskId, "context.json")
		: null;
	const taskContext = taskContextPath ? readJson(taskContextPath, null) : null;
	const latestCycleText = [
		`--- ${rel(repo, path.join(wiki, "roadmap-events.jsonl"))} last 20 ---`,
		latestLines(path.join(wiki, "roadmap-events.jsonl"), 20),
		`--- ${rel(repo, path.join(wiki, "events.jsonl"))} last 20 ---`,
		latestLines(path.join(wiki, "events.jsonl"), 20),
	].join("\n");

	const profiles = [
		{
			id: "raw-truth",
			label: "Raw wiki truth + lifecycle logs",
			notes:
				"Knowledge markdown, evidence, roadmap, roadmap events, repo events.",
			...bundle(repo, rawTruthFiles),
		},
		{
			id: "raw-cycle",
			label: "Raw implementation/verification cycle",
			notes:
				"Roadmap plus full roadmap/repo event logs. Likely hot-path overhead.",
			...bundle(repo, lifecycleFiles),
		},
		{
			id: "generated-state",
			label: "Generated status + roadmap state",
			notes: "Current generated read models agents/status UI can consume.",
			...bundle(repo, stateFiles),
		},
		{
			id: "all-task-contexts",
			label: "All task context shards",
			notes: "Every generated task-local context packet.",
			...bundle(repo, taskContextFiles),
		},
		{
			id: "current-task-context",
			label: `Current task context shard${resumeTaskId ? ` (${resumeTaskId})` : ""}`,
			notes: "Task-local resume packet for current/next work.",
			...bundle(repo, taskContextPath ? [taskContextPath] : []),
		},
		{
			id: "agent-default-packet",
			label: "Synthetic compact agent default packet",
			notes: "Target shape: status summary + next action + one task packet.",
			files: [],
			chars: makeAgentDefaultText(repo, statusState, roadmapState, taskContext)
				.length,
			bytes: Buffer.byteLength(
				makeAgentDefaultText(repo, statusState, roadmapState, taskContext),
			),
		},
		{
			id: "latest-cycle-events",
			label: "Latest lifecycle events only",
			notes: "Last 20 roadmap events + last 20 repo events.",
			files: [],
			chars: latestCycleText.length,
			bytes: Buffer.byteLength(latestCycleText),
		},
	];

	const rawTruth = profiles.find((profile) => profile.id === "raw-truth");
	const rawCycle = profiles.find((profile) => profile.id === "raw-cycle");
	const result = {
		repo,
		generated_at: new Date().toISOString(),
		token_estimate: "ceil(utf8_bytes / 4)",
		scope: {
			knowledge_files: knowledgeFiles.length,
			evidence_files: evidenceFiles.length,
			task_context_files: taskContextFiles.length,
			resume_task_id: resumeTaskId,
		},
		profiles: profiles.map((profile) => ({
			id: profile.id,
			label: profile.label,
			notes: profile.notes,
			file_count: profile.files?.length ?? 0,
			bytes: profile.bytes,
			est_tokens: tokens(profile.bytes),
			saved_vs_raw_truth_pct: pctSaved(rawTruth.bytes, profile.bytes),
			saved_vs_raw_cycle_pct: pctSaved(rawCycle.bytes, profile.bytes),
		})),
		lifecycle_events: summarizeEvents(repo, [
			path.join(wiki, "roadmap-events.jsonl"),
			path.join(wiki, "events.jsonl"),
		]),
	};

	if (args.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	console.log(`codewiki token benchmark: ${repo}`);
	console.log(`token estimate: ${result.token_estimate}`);
	console.log(
		`scope: ${result.scope.knowledge_files} knowledge files, ${result.scope.evidence_files} evidence logs, ${result.scope.task_context_files} task contexts, resume=${result.scope.resume_task_id ?? "none"}`,
	);
	console.log("");
	console.log(
		"| profile | files | bytes | est tokens | saved vs raw truth | saved vs raw cycle |",
	);
	console.log("|---|---:|---:|---:|---:|---:|");
	for (const profile of result.profiles) {
		console.log(
			`| ${profile.label} | ${profile.file_count} | ${profile.bytes.toLocaleString()} | ${profile.est_tokens.toLocaleString()} | ${profile.saved_vs_raw_truth_pct}% | ${profile.saved_vs_raw_cycle_pct}% |`,
		);
	}
	console.log("");
	console.log("Lifecycle event log pressure:");
	for (const eventFile of result.lifecycle_events) {
		console.log(
			`- ${eventFile.file}: ${eventFile.lines} events, ${eventFile.bytes.toLocaleString()} bytes, ~${eventFile.est_tokens.toLocaleString()} tokens, avg ${eventFile.avg_bytes_per_event} bytes/event`,
		);
	}
	console.log("");
	console.log(
		"Interpretation: optimize profiles agents read every turn first. If raw-cycle is large, implementation/verification should read latest-cycle-events or current-task-context, not full logs/roadmap.",
	);
}

main();
