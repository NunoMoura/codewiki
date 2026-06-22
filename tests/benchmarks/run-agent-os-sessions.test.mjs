import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	buildPiArgs,
	extractUsageFromJsonl,
	parseArgs,
	plannedRuns,
	runBenchmarkSessions,
} from "../../benchmarks/run-agent-os-sessions.mjs";

function writeTask(tasksDir, id) {
	writeFileSync(
		join(tasksDir, `${id}.json`),
		JSON.stringify({
			schemaVersion: 1,
			id,
			title: id,
			kind: "full_stack_browser_game",
			prompt: `Build ${id}.`,
			acceptanceCriteria: ["works"],
			qualityGate: { minQualityScore: 80, minScores: {} },
		}),
	);
}

describe("agent-OS Pi session benchmark runner", () => {
	it("plans separate Pi sessions for each task/system/repetition", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-session-runner-"));
		const tasksDir = join(root, "tasks");
		mkdirSync(tasksDir);
		writeTask(tasksDir, "polished-tetris");
		writeTask(tasksDir, "flight-simulator");

		const options = parseArgs([
			"--tasks",
			tasksDir,
			"--systems",
			"codewiki,plain-pi",
			"--repetitions",
			"2",
			"--run-prefix",
			"fixed",
		]);

		assert.deepEqual(
			plannedRuns(options).map((run) => run.runId),
			[
				"fixed-codewiki-flight-simulator-r1",
				"fixed-codewiki-flight-simulator-r2",
				"fixed-plain-pi-flight-simulator-r1",
				"fixed-plain-pi-flight-simulator-r2",
				"fixed-codewiki-polished-tetris-r1",
				"fixed-codewiki-polished-tetris-r2",
				"fixed-plain-pi-polished-tetris-r1",
				"fixed-plain-pi-polished-tetris-r2",
			],
		);
	});

	it("builds isolated Pi CLI args with the shared prompt", () => {
		const args = buildPiArgs({
			model: "openai-codex/gpt-5.5",
			runId: "run-1",
			sessionDir: "/tmp/sessions",
			prompt: "same prompt",
		});

		assert.deepEqual(args.slice(0, 12), [
			"--approve",
			"--mode",
			"json",
			"--model",
			"openai-codex/gpt-5.5",
			"--session-dir",
			"/tmp/sessions",
			"--session-id",
			"run-1",
			"--name",
			"run-1",
			"-p",
		]);
		assert.equal(args.at(-1), "same prompt");
	});

	it("extracts usage from Pi JSON session output", () => {
		const jsonl = [
			JSON.stringify({ type: "message_end", message: { role: "user" } }),
			JSON.stringify({
				type: "message_end",
				message: {
					role: "assistant",
					usage: {
						input: 10,
						output: 4,
						cacheRead: 6,
						cacheWrite: 2,
						totalTokens: 14,
						cost: { total: 0.01 },
					},
				},
			}),
			JSON.stringify({
				type: "message_end",
				message: {
					role: "assistant",
					usage: { input: 3, output: 2, totalTokens: 5 },
				},
			}),
		].join("\n");

		assert.deepEqual(extractUsageFromJsonl(jsonl), {
			input: 13,
			output: 6,
			cacheRead: 6,
			cacheWrite: 2,
			total: 19,
			cost: 0.01,
		});
	});

	it("dry-runs without invoking Pi and writes command plans", async () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-session-runner-"));
		const tasksDir = join(root, "tasks");
		const outDir = join(root, "runs");
		mkdirSync(tasksDir);
		writeTask(tasksDir, "polished-tetris");
		const options = parseArgs([
			"--tasks",
			tasksDir,
			"--out",
			outDir,
			"--task",
			"polished-tetris",
			"--systems",
			"plain-pi",
			"--run-prefix",
			"fixed",
			"--dry-run",
		]);
		let calls = 0;

		const summaries = await runBenchmarkSessions(options, {
			commandRunner() {
				calls += 1;
				return { status: 0, stdout: "", stderr: "" };
			},
		});

		assert.equal(calls, 0);
		assert.equal(summaries.length, 1);
		const runDir = join(outDir, "fixed-plain-pi-polished-tetris-r1");
		assert.equal(existsSync(join(runDir, "prompt.md")), true);
		assert.equal(existsSync(join(runDir, "command.plan.json")), true);
		const commandPlan = JSON.parse(
			readFileSync(join(runDir, "command.plan.json"), "utf8"),
		);
		assert.equal(commandPlan.args.at(-1), readFileSync(join(runDir, "prompt.md"), "utf8"));
		assert.match(commandPlan.env.PI_CODING_AGENT_DIR, /agent$/);
	});
});
