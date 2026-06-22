import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	aggregateBenchmarks,
	loadRuns,
	loadTasks,
	scoreQuality,
	scoreRun,
	validateRun,
	validateTask,
} from "../../benchmarks/score-agent-os.mjs";

function task(id, overrides = {}) {
	return validateTask({
		schemaVersion: 1,
		id,
		title: id,
		kind: "full_stack_browser_game",
		prompt: `Build ${id}`,
		acceptanceCriteria: ["works", "looks good"],
		qualityGate: {
			minQualityScore: 80,
			minScores: {
				functional: 4,
				frontend: 4,
				backend: 4,
				ux: 4,
				maintainability: 4,
				traceability: 4,
			},
		},
		...overrides,
	});
}

function run(taskId, system, overrides = {}) {
	return validateRun({
		schemaVersion: 1,
		runId: `${system}-${taskId}`,
		taskId,
		system,
		model: "test-model",
		durationMs: system === "codewiki" ? 600000 : 900000,
		tokens: {
			input: 7000,
			output: 5000,
			total: system === "codewiki" ? 12000 : 18000,
		},
		productionReady: true,
		checks: [{ name: "tests", command: "npm test", status: "pass" }],
		scores: {
			functional: 5,
			frontend: 4,
			backend: 4,
			ux: 4,
			maintainability: 4,
			traceability: system === "codewiki" ? 5 : 4,
		},
		artifacts: { repo: "file:///tmp/example", commit: "abc123" },
		...overrides,
	});
}

describe("agent-OS benchmark scorer", () => {
	it("computes weighted quality scores", () => {
		assert.equal(
			Math.round(
				scoreQuality({
					functional: 5,
					frontend: 4,
					backend: 4,
					ux: 4,
					maintainability: 4,
					traceability: 5,
				}),
			),
			88,
		);
	});

	it("marks a run production-ready only when checks and score gates pass", () => {
		const scored = scoreRun(run("polished-tetris", "codewiki"), task("polished-tetris"));

		assert.equal(scored.productionReady, true);
		assert.equal(Math.round(scored.qualityScore), 88);
		assert.equal(scored.tokensPerQualityPoint, 12000 / scored.qualityScore);
		assert.equal(scored.secondsPerQualityPoint, 600 / scored.qualityScore);

		const failed = scoreRun(
			run("polished-tetris", "codewiki", {
				checks: [{ name: "tests", command: "npm test", status: "fail" }],
			}),
			task("polished-tetris"),
		);
		assert.equal(failed.productionReady, false);
		assert.deepEqual(failed.blockers, ["not all checks passed"]);
	});

	it("passes the gate when CodeWiki beats the baseline on compared tasks", () => {
		const tasks = [task("polished-tetris"), task("flight-simulator")];
		const runs = [
			run("polished-tetris", "codewiki"),
			run("polished-tetris", "plain-pi"),
			run("flight-simulator", "codewiki"),
			run("flight-simulator", "plain-pi"),
		];

		const summary = aggregateBenchmarks({ tasks, runs, minTasks: 2 });

		assert.equal(summary.gate.status, "pass");
		assert.equal(summary.gate.comparedTasks, 2);
		assert.equal(summary.systems.codewiki.productionReadyRuns, 2);
		assert.equal(summary.systems["plain-pi"].productionReadyRuns, 2);
	});

	it("fails the gate until real candidate and baseline runs exist", () => {
		const summary = aggregateBenchmarks({
			tasks: [task("polished-tetris"), task("flight-simulator")],
			runs: [],
			minTasks: 2,
		});

		assert.equal(summary.gate.status, "fail");
		assert.equal(
			summary.gate.blockers[0],
			"need 2 compared production benchmark tasks, found 0",
		);
	});

	it("loads task and result JSON files from benchmark directories", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-bench-"));
		const tasksDir = join(root, "tasks");
		const resultsDir = join(root, "results");
		mkdirSync(tasksDir);
		mkdirSync(resultsDir);
		writeFileSync(
			join(tasksDir, "polished-tetris.json"),
			JSON.stringify(task("polished-tetris")),
		);
		writeFileSync(
			join(resultsDir, "polished-tetris-codewiki.json"),
			JSON.stringify(run("polished-tetris", "codewiki")),
		);

		assert.equal(loadTasks(tasksDir).length, 1);
		assert.equal(loadRuns(resultsDir).length, 1);
	});
});
