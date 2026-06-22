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

function parseArgs(argv) {
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
	const prompt = renderPrompt({
		task,
		system: options.system,
		model: options.model,
	});
	const template = resultTemplate({
		task,
		system: options.system,
		model: options.model,
		runId: options.runId,
	});
	const readme = renderRunReadme({
		task,
		system: options.system,
		model: options.model,
		runId: options.runId,
	});
	writeFileSync(join(runDir, "prompt.md"), prompt);
	writeFileSync(
		join(runDir, "task.json"),
		JSON.stringify(task, null, "\t") + "\n",
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
		resultTemplatePath: join(runDir, "result.template.json"),
	};
}

function renderPrompt({ task, system, model }) {
	const criteria = task.acceptanceCriteria
		.map((criterion, index) => `${index + 1}. ${criterion}`)
		.join("\n");
	const systemInstructions =
		system === "codewiki"
			? codewikiInstructions()
			: system === "plain-pi"
				? plainPiInstructions()
				: otherSystemInstructions();
	return `# Benchmark task: ${task.title}

Model: ${model}
System under test: ${system}
Task id: ${task.id}
Task kind: ${task.kind}

## User prompt

${task.prompt}

## Acceptance criteria

${criteria}

## System-specific instructions

${systemInstructions}

## Required final report

When work is complete, write a concise benchmark report with:

- run command and preview instructions;
- checks run and pass/fail status;
- artifact refs: repo/archive, commit or immutable id, preview URL or local run
  command, screenshot/video path if available, and trace/session refs;
- token counts if available from the host/session metadata;
- elapsed wall-clock time;
- honest notes about any acceptance criterion that is not fully satisfied.

Do not claim production readiness unless the result is shippable for this task.
`;
}

function codewikiInstructions() {
	return `Use CodeWiki as the agent OS for the run.

- Start from a fresh temporary project.
- Install the current packed/local CodeWiki package project-locally in that
  temporary project.
- Use CodeWiki's direct /wiki-* commands and wiki_* tools for decision,
  planning, implementation evidence, state, and archive where available.
- Preserve .codewiki/kb/** and .codewiki/traces/TRACE-*.jsonl as benchmark
  artifacts.
- Runtime may coordinate worker work, but semantic completion must come from
  implementation evidence, not worker completion alone.
- Do not hand-edit trace JSON to make the benchmark look better.
- Do not use a future CodeWiki frontend; this benchmark is agent-OS only.`;
}

function plainPiInstructions() {
	return `Use a normal Pi coding workflow without CodeWiki semantic loops.

- Start from a fresh temporary project.
- Do not install or load CodeWiki.
- Do not create CodeWiki traces or KB files.
- Use ordinary Pi tool use, local files, and tests to complete the task.
- Preserve the Pi session ref or exported session artifact for audit.`;
}

function otherSystemInstructions() {
	return `Use the declared baseline workflow.

- Start from a fresh temporary project.
- Record the exact tool, model, prompt, and host setup.
- Preserve enough artifacts for another reviewer to reproduce or audit the run.`;
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
			visual: 0,
			ux: 0,
			maintainability: 0,
			traceability: 0,
		},
		artifacts: {
			repo: "",
			commit: "",
			preview: "",
			screenshotOrVideo: "",
			traceRefs: [],
			sessionRefs: [],
		},
		notes:
			"Fill this from the completed benchmark run. Do not fabricate scores, tokens, or production readiness.",
	};
}

function renderRunReadme({ task, system, model, runId }) {
	return `# Benchmark run ${runId}

- Task: ${task.id} (${task.title})
- System: ${system}
- Model: ${model}

Files:

- prompt.md — prompt to run in the selected system.
- task.json — immutable task spec snapshot for this run.
- result.template.json — copy to benchmarks/results/${runId}.json after filling
  real metrics, checks, scores, and artifact refs.

Generated run directories are local scratch. Commit only the final result JSON
when the run is real and auditable.
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
