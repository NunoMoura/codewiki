import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { prepareBenchmarkRun } from "../../benchmarks/prepare-agent-os-run.mjs";

function writeTask(tasksDir, id = "polished-tetris") {
	const task = {
		schemaVersion: 1,
		id,
		title: "Polished Tetris",
		kind: "visual_game",
		prompt: "Build Tetris.",
		acceptanceCriteria: ["plays", "scores"],
		qualityGate: { minQualityScore: 82, minScores: {} },
	};
	writeFileSync(join(tasksDir, `${id}.json`), `${JSON.stringify(task)}\n`);
}

describe("agent-OS benchmark run preparation", () => {
	it("writes a CodeWiki prompt and result template for a task", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-benchmark-run-"));
		const tasksDir = join(root, "tasks");
		const outDir = join(root, "runs");
		mkdirSync(tasksDir);
		writeTask(tasksDir);

		const result = prepareBenchmarkRun({
			tasksDir,
			outDir,
			taskId: "polished-tetris",
			system: "codewiki",
			model: "openai-codex/gpt-5.5",
			runId: "run-001",
		});

		assert.equal(result.runId, "run-001");
		assert.equal(existsSync(join(result.runDir, "prompt.md")), true);
		assert.match(
			readFileSync(join(result.runDir, "prompt.md"), "utf8"),
			/Use CodeWiki as the agent OS/,
		);
		assert.deepEqual(
			JSON.parse(
				readFileSync(join(result.runDir, "result.template.json"), "utf8"),
			),
			{
				schemaVersion: 1,
				runId: "run-001",
				taskId: "polished-tetris",
				system: "codewiki",
				model: "openai-codex/gpt-5.5",
				startedAt: "",
				completedAt: "",
				durationMs: 0,
				tokens: { input: 0, output: 0, total: 0 },
				productionReady: false,
				checks: [{ name: "tests", command: "", status: "skip" }],
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
			},
		);
	});

	it("writes a plain Pi prompt without CodeWiki trace instructions", async () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-benchmark-run-"));
		const tasksDir = join(root, "tasks");
		const outDir = join(root, "runs");
		mkdirSync(tasksDir);
		writeTask(tasksDir, "chess-trainer");

		const result = prepareBenchmarkRun({
			tasksDir,
			outDir,
			taskId: "chess-trainer",
			system: "plain-pi",
			model: "openai-codex/gpt-5.5",
			runId: "run-002",
		});
		const prompt = readFileSync(join(result.runDir, "prompt.md"), "utf8");

		assert.match(prompt, /Use a normal Pi coding workflow/);
		assert.doesNotMatch(prompt, /Preserve \.codewiki\/kb/);
	});
});
