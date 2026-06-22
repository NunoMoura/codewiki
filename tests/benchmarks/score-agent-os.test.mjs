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
		kind: "visual_game",
		prompt: `Build ${id}`,
		acceptanceCriteria: ["works", "looks good"],
		qualityGate: {
			minQualityScore: 80,
			minScores: {
				functional: 4,
				visual: 4,
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
		tokens: { input: 7000, output: 5000, total: system === "codewiki" ? 12000 : 18000 },
		productionReady: true,
		checks: [{ name: "tests", command: "npm test", status: "pass" }],
		scores: {
			functional: 5,
			visual: 4,
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
			scoreQuality({
				functional: 5,
				visual: 4,
				ux: 4,
				maintainability: 4,
				traceability: 5,
			}),
			90,
		);
	});

	it("marks a run production-ready only when checks and score gates pass", () => {
		const scored = scoreRun(run("snake", "codewiki"), task("snake"));

		assert.equal(scored.productionReady, true);
		assert.equal(scored.qualityScore, 90);
		assert.equal(scored.tokensPerQualityPoint, 12000 / 90);
		assert.equal(scored.secondsPerQualityPoint, 600 / 90);

		const failed = scoreRun(
			run("snake", "codewiki", {
				checks: [{ name: "tests", command: "npm test", status: "fail" }],
			}),
			task("snake"),
		);
		assert.equal(failed.productionReady, false);
		assert.deepEqual(failed.blockers, ["not all checks passed"]);
	});

	it("passes the gate when CodeWiki beats the baseline on compared tasks", () => {
		const tasks = [task("snake"), task("kanban")];
		const runs = [
			run("snake", "codewiki"),
			run("snake", "plain-pi"),
			run("kanban", "codewiki"),
			run("kanban", "plain-pi"),
		];

		const summary = aggregateBenchmarks({ tasks, runs, minTasks: 2 });

		assert.equal(summary.gate.status, "pass");
		assert.equal(summary.gate.comparedTasks, 2);
		assert.equal(summary.systems.codewiki.productionReadyRuns, 2);
		assert.equal(summary.systems["plain-pi"].productionReadyRuns, 2);
	});

	it("fails the gate until real candidate and baseline runs exist", () => {
		const summary = aggregateBenchmarks({
			tasks: [task("snake"), task("kanban")],
			runs: [],
			minTasks: 2,
		});

		assert.equal(summary.gate.status, "fail");
		assert.equal(summary.gate.blockers[0], "need 2 compared production benchmark tasks, found 0");
	});

	it("loads task and result JSON files from benchmark directories", () => {
		const root = mkdtempSync(join(tmpdir(), "codewiki-bench-"));
		const tasksDir = join(root, "tasks");
		const resultsDir = join(root, "results");
		mkdirSync(tasksDir);
		mkdirSync(resultsDir);
		writeFileSync(join(tasksDir, "snake.json"), JSON.stringify(task("snake")));
		writeFileSync(
			join(resultsDir, "snake-codewiki.json"),
			JSON.stringify(run("snake", "codewiki")),
		);

		assert.equal(loadTasks(tasksDir).length, 1);
		assert.equal(loadRuns(resultsDir).length, 1);
	});
});
