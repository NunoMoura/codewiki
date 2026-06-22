#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUT_DIR = "benchmarks/runs";
const DEFAULT_MODEL = "openai-codex/gpt-5.5";

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`Failed to read JSON ${path}: ${error.message}`);
	}
}

function slug(value) {
	return String(value)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function timestamp() {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

export function parseArgs(argv) {
	const options = {
		tasksDir: "benchmarks/tasks",
		outDir: DEFAULT_OUT_DIR,
		taskId: undefined,
		system: undefined,
		model: DEFAULT_MODEL,
		runId: undefined,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--task") {
			options.taskId = argv[++index];
		} else if (arg === "--system") {
			options.system = argv[++index];
		} else if (arg === "--model") {
			options.model = argv[++index];
		} else if (arg === "--run-id") {
			options.runId = argv[++index];
		} else if (arg === "--tasks") {
			options.tasksDir = argv[++index];
		} else if (arg === "--out") {
			options.outDir = argv[++index];
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (!options.taskId) {
		throw new Error("--task is required");
	}
	if (!options.system) {
		throw new Error("--system is required");
	}
	if (!options.model) {
		throw new Error("--model is required");
	}
	if (!["codewiki", "plain-pi", "other"].includes(options.system)) {
		throw new Error("--system must be codewiki, plain-pi, or other");
	}
	options.runId ??= `${timestamp()}-${slug(options.system)}-${slug(options.taskId)}`;
	return options;
}

export function prepareBenchmarkRun(options) {
	const taskPath = join(options.tasksDir, `${options.taskId}.json`);
	const task = readJson(taskPath);
	if (task.id !== options.taskId) {
		throw new Error(
			`${taskPath} id ${task.id} does not match ${options.taskId}`,
		);
	}
	const runDir = join(options.outDir, options.runId);
	mkdirSync(runDir, { recursive: true });
	const prompt = renderPrompt({ task });
	const systemNotes = renderSystemNotes({ system: options.system });
	const template = resultTemplate({
		task,
		system: options.system,
		model: options.model,
		runId: options.runId,
	});
	const metadata = {
		schemaVersion: 1,
		runId: options.runId,
		taskId: task.id,
		system: options.system,
		model: options.model,
		promptInvariant: true,
		promptPath: "prompt.md",
		systemNotesPath: "system.md",
		resultTemplatePath: "result.template.json",
	};
	const readme = renderRunReadme({
		task,
		system: options.system,
		model: options.model,
		runId: options.runId,
	});
	writeFileSync(join(runDir, "prompt.md"), prompt);
	writeFileSync(join(runDir, "system.md"), systemNotes);
	writeFileSync(
		join(runDir, "task.json"),
		JSON.stringify(task, null, "\t") + "\n",
	);
	writeFileSync(
		join(runDir, "run.json"),
		JSON.stringify(metadata, null, "\t") + "\n",
	);
	writeFileSync(
		join(runDir, "result.template.json"),
		JSON.stringify(template, null, "\t") + "\n",
	);
	writeFileSync(join(runDir, "README.md"), readme);
	return {
		runId: options.runId,
		runDir,
		taskPath,
		promptPath: join(runDir, "prompt.md"),
		systemNotesPath: join(runDir, "system.md"),
		resultTemplatePath: join(runDir, "result.template.json"),
	};
}

export function renderPrompt({ task }) {
	const criteria = task.acceptanceCriteria
		.map((criterion, index) => `${index + 1}. ${criterion}`)
		.join("\n");
	return `# Benchmark task: ${task.title}

Task id: ${task.id}
Task kind: ${task.kind}

## User prompt

${task.prompt}

${renderRequirements(task.requirements)}## Acceptance criteria

${criteria}

## Required final benchmark report

When work is complete, write a concise benchmark report with:

- run command and preview instructions;
- checks run and pass/fail status;
- artifact refs: repo/archive, commit or immutable id, preview URL or local run
  command, screenshot/video path if available, and trace/session refs;
- token counts if available from the host/session metadata;
- elapsed wall-clock time;
- honest notes about any acceptance criterion that is not fully satisfied.

## Fairness rules

- Use the project workflow and tools available in the session, but do not change
  the product scope.
- Do not use paid services, hosted databases, proprietary assets, or network-only
  dependencies for core functionality.
- Prefer simple local code that a reviewer can run from a fresh checkout.
- Do not claim production readiness unless the result is shippable for this task.
- Do not fabricate tests, screenshots, token counts, elapsed time, traces, or
  session refs.
`;
}

function renderRequirements(requirements) {
	if (!requirements || typeof requirements !== "object") return "";
	const sections = Object.entries(requirements).map(([name, items]) => {
		if (!Array.isArray(items) || items.length === 0) return "";
		const title = name
			.replace(/([a-z])([A-Z])/g, "$1 $2")
			.replace(/^./, (value) => value.toUpperCase());
		return `### ${title}\n\n${items.map((item) => `- ${item}`).join("\n")}\n`;
	});
	const rendered = sections.filter(Boolean).join("\n");
	return rendered ? `## Requirements\n\n${rendered}\n` : "";
}

function renderSystemNotes({ system }) {
	if (system === "codewiki") return codewikiNotes();
	if (system === "plain-pi") return plainPiNotes();
	return otherSystemNotes();
}

function codewikiNotes() {
	return `# System notes: codewiki

These notes are for the benchmark host/reviewer. They are not part of the shared
user prompt.

- Run in a fresh project with CodeWiki installed as a project-local Pi package.
- Keep the user prompt identical to baseline runs.
- Let CodeWiki's Pi extension, tools, commands, and injected prompt guidance be
  the system difference under test.
- Preserve .codewiki/kb/** and .codewiki/traces/TRACE-*.jsonl as run artifacts.
- Do not hand-edit trace JSON to make the benchmark look better.
`;
}

function plainPiNotes() {
	return `# System notes: plain-pi

These notes are for the benchmark host/reviewer. They are not part of the shared
user prompt.

- Run in a fresh project without CodeWiki installed or loaded.
- Keep the user prompt identical to CodeWiki runs.
- Preserve the Pi session output and project artifact for audit.
- Do not create CodeWiki traces or KB files.
`;
}

function otherSystemNotes() {
	return `# System notes: other

These notes are for the benchmark host/reviewer. They are not part of the shared
user prompt.

- Run in a fresh project.
- Keep the user prompt identical to CodeWiki and baseline runs.
- Record the exact tool, model, prompt, and host setup.
- Preserve enough artifacts for another reviewer to reproduce or audit the run.
`;
}

function resultTemplate({ task, system, model, runId }) {
	return {
		schemaVersion: 1,
		runId,
		taskId: task.id,
		system,
		model,
		startedAt: "",
		completedAt: "",
		durationMs: 0,
		tokens: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0,
		},
		productionReady: false,
		checks: [
			{
				name: "tests",
				command: "",
				status: "skip",
			},
		],
		scores: {
			functional: 0,
			frontend: 0,
			backend: 0,
			ux: 0,
			maintainability: 0,
			traceability: 0,
		},
		artifacts: {
			repo: "",
			commit: "",
			preview: "",
			screenshotOrVideo: "",
			testOutput: "",
			sourceArchive: "",
			sessionOutput: "",
			traceRefs: [],
			sessionRefs: [],
		},
		notes:
			"Fill this from a real completed benchmark run and human review. Do not fabricate scores, tokens, or production readiness.",
	};
}

function renderRunReadme({ task, system, model, runId }) {
	return `# Benchmark run ${runId}

- Task: ${task.id} (${task.title})
- System: ${system}
- Model: ${model}

Files:

- prompt.md — shared prompt sent to every system for this task.
- system.md — host/reviewer notes for this system; not part of the shared user
  prompt.
- task.json — immutable task spec snapshot for this run.
- run.json — run metadata generated by the harness.
- result.template.json — copy to benchmarks/results/${runId}.json only after a
  real run has finished and a reviewer has filled metrics, checks, scores, and
  artifact refs.

Generated run directories are local scratch. Commit only final human-scored
result JSON files and intentional artifact refs.
`;
}

async function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	const result = prepareBenchmarkRun(options);
	console.log(JSON.stringify(result, null, 2));
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
