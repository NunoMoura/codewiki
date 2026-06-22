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
		title: "Production Tetris",
		kind: "full_stack_browser_game",
		prompt: "Build production Tetris.",
		requirements: {
			frontend: ["Responsive UI"],
			backend: ["Local API"],
		},
		acceptanceCriteria: ["plays", "persists scores"],
		qualityGate: { minQualityScore: 82, minScores: {} },
	};
	writeFileSync(join(tasksDir, `${id}.json`), `${JSON.stringify(task)}\n`);
}

function prepare(root, system, runId) {
	return prepareBenchmarkRun({
		tasksDir: join(root, "tasks"),
		outDir: join(root, "runs"),
		taskId: "polished-tetris",
		system,
		model: "openai-codex/gpt-5.5",
		runId,
	});
}

describe("agent-OS benchmark run preparation", () => {
	it("writes a shared prompt, system notes, and result template", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-benchmark-run-"));
		const tasksDir = join(root, "tasks");
		mkdirSync(tasksDir);
		writeTask(tasksDir);

		const result = prepare(root, "codewiki", "run-001");

		assert.equal(result.runId, "run-001");
		assert.equal(existsSync(join(result.runDir, "prompt.md")), true);
		assert.equal(existsSync(join(result.runDir, "system.md")), true);
		const prompt = readFileSync(join(result.runDir, "prompt.md"), "utf8");
		assert.match(prompt, /Build production Tetris/);
		assert.match(prompt, /### Frontend/);
		assert.match(prompt, /### Backend/);
		assert.doesNotMatch(prompt, /Use CodeWiki as the agent OS/);
		assert.match(
			readFileSync(join(result.runDir, "system.md"), "utf8"),
			/project-local Pi package/,
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
				tokens: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
				productionReady: false,
				checks: [{ name: "tests", command: "", status: "skip" }],
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
			},
		);
	});

	it("keeps the user prompt identical across systems", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-benchmark-run-"));
		const tasksDir = join(root, "tasks");
		mkdirSync(tasksDir);
		writeTask(tasksDir);

		const codewiki = prepare(root, "codewiki", "run-codewiki");
		const plain = prepare(root, "plain-pi", "run-plain");

		assert.equal(
			readFileSync(join(codewiki.runDir, "prompt.md"), "utf8"),
			readFileSync(join(plain.runDir, "prompt.md"), "utf8"),
		);
		assert.match(
			readFileSync(join(plain.runDir, "system.md"), "utf8"),
			/without CodeWiki/,
		);
	});
});
