import assert from "node:assert/strict";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { runBudgetedAutoExperiment } from "../../lab/runner/experiment-budget.ts";

const tempRoots = [];

const PRODUCTION_LOOP_FILES = [
	"src/decision/loop.ts",
	"src/planning/loop.ts",
	"src/implementation/loop.ts",
];

afterEach(() => {
	while (tempRoots.length > 0) {
		rmSync(tempRoots.pop(), { recursive: true, force: true });
	}
});

function tempRoot(prefix = "codewiki-auto-experiment-test-") {
	const root = mkdtempSync(join(tmpdir(), prefix));
	tempRoots.push(root);
	return root;
}

describe("budgeted auto experiment harness", () => {
	it("stops when max run budget is exhausted", async () => {
		const first = candidateDir("one", {
			"lab/decision/loop.ts": readFileSync("lab/decision/loop.ts", "utf8"),
		});
		const second = candidateDir("two", {
			"lab/planning/loop.ts": readFileSync("lab/planning/loop.ts", "utf8"),
		});
		let calls = 0;

		const report = await runBudgetedAutoExperiment({
			candidateDirs: [first, second],
			outputDir: tempRoot(),
			maxRuns: 1,
			runExperiment: async () => {
				calls += 1;
				return fakeExperimentReport({ score: 90 });
			},
		});

		assert.equal(calls, 1);
		assert.equal(report.runs.length, 1);
		assert.equal(report.budgetExhaustionReason, "max_runs");
	});

	it("stops between runs when wall clock budget expires", async () => {
		const first = candidateDir("one", {
			"lab/decision/loop.ts": readFileSync("lab/decision/loop.ts", "utf8"),
		});
		const second = candidateDir("two", {
			"lab/planning/loop.ts": readFileSync("lab/planning/loop.ts", "utf8"),
		});
		let now = 0;

		const report = await runBudgetedAutoExperiment({
			candidateDirs: [first, second],
			outputDir: tempRoot(),
			maxRuns: 2,
			maxWallClockMs: 10,
			now: () => now,
			runExperiment: async () => {
				now = 11;
				return fakeExperimentReport({ score: 90 });
			},
		});

		assert.equal(report.runs.length, 1);
		assert.equal(report.budgetExhaustionReason, "wall_clock_ms");
	});

	it("enforces candidate file count limits before running", async () => {
		const root = candidateDir("too-many", {
			"lab/decision/loop.ts": readFileSync("lab/decision/loop.ts", "utf8"),
			"lab/planning/loop.ts": readFileSync("lab/planning/loop.ts", "utf8"),
		});
		let calls = 0;

		const report = await runBudgetedAutoExperiment({
			candidateDirs: [root],
			outputDir: tempRoot(),
			maxCandidateFiles: 1,
			runExperiment: async () => {
				calls += 1;
				return fakeExperimentReport({ score: 90 });
			},
		});

		assert.equal(calls, 0);
		assert.equal(report.status, "fail");
		assert.equal(report.runs[0].status, "skipped");
		assert.match(report.runs[0].blockers[0], /above maxCandidateFiles 1/);
	});

	it("enforces diff byte limits before running", async () => {
		const root = candidateDir("large-diff", {
			"lab/decision/loop.ts":
				'export const changed = "this candidate is too large";\n',
		});
		let calls = 0;

		const report = await runBudgetedAutoExperiment({
			candidateDirs: [root],
			outputDir: tempRoot(),
			maxDiffBytes: 4,
			runExperiment: async () => {
				calls += 1;
				return fakeExperimentReport({ score: 90 });
			},
		});

		assert.equal(calls, 0);
		assert.equal(report.runs[0].status, "skipped");
		assert.match(report.runs[0].blockers[0], /above maxDiffBytes 4/);
	});

	it("keeps sealed command output out of score-only reports", async () => {
		const root = candidateDir("sealed", {
			"lab/decision/loop.ts": readFileSync("lab/decision/loop.ts", "utf8"),
		});

		const report = await runBudgetedAutoExperiment({
			candidateDirs: [root],
			outputDir: tempRoot(),
			runExperiment: async () =>
				fakeExperimentReport({ score: 100, secretOutput: true, sealed: true }),
		});

		assert.equal(report.sealedFeedback, "score_only");
		assert.equal(report.runs[0].score, 100);
		assert.equal(report.runs[0].experiment.objective.sealed.provided, true);
		assert.equal(JSON.stringify(report).includes("SECRET_SEALED_CASE"), false);
		assert.deepEqual(
			Object.keys(report.runs[0].experiment.commands[0]).sort(),
			["exitCode", "name", "status"],
		);
	});

	it("rejects non-candidate paths and does not mutate production loop graphs", async () => {
		const before = productionLoopContents();
		const root = candidateDir("malicious", {
			"src/decision/loop.ts": "export const bad = true;\n",
		});
		let calls = 0;

		const report = await runBudgetedAutoExperiment({
			candidateDirs: [root],
			outputDir: tempRoot(),
			runExperiment: async () => {
				calls += 1;
				return fakeExperimentReport({ score: 90 });
			},
		});

		assert.equal(calls, 0);
		assert.equal(report.runs[0].status, "skipped");
		assert.match(
			report.runs[0].blockers[0],
			/unexpected: src\/decision\/loop\.ts/,
		);
		assert.equal(report.productionGraphMutation.changed, false);
		assert.deepEqual(productionLoopContents(), before);
	});
});

function candidateDir(name, files) {
	const root = tempRoot(`codewiki-auto-${name}-`);
	for (const [filePath, content] of Object.entries(files)) {
		const fullPath = join(root, filePath);
		mkdirSync(join(fullPath, ".."), { recursive: true });
		writeFileSync(fullPath, content);
	}
	return root;
}

function productionLoopContents() {
	return Object.fromEntries(
		PRODUCTION_LOOP_FILES.map((filePath) => [
			filePath,
			readFileSync(filePath, "utf8"),
		]),
	);
}

function fakeExperimentReport({ score, secretOutput = false, sealed = false }) {
	const status = score >= 95 && sealed ? "pass" : "visible-only";
	return {
		version: 1,
		status: "pass",
		worktree: { path: "/tmp/secret-worktree", kept: false },
		candidateFiles: ["lab/decision/loop.ts"],
		commands: [
			{
				name: "objective",
				status: "pass",
				exitCode: 0,
				stdoutTail: secretOutput ? ["SECRET_SEALED_CASE"] : [],
				stderrTail: secretOutput ? ["SECRET_SEALED_CASE"] : [],
			},
		],
		objective: {
			status,
			mode: sealed ? "sealed" : "visible-only",
			score,
			components: {},
			sealed: {
				provided: sealed,
				caseCount: sealed ? 3 : 0,
				falsePasses: 0,
				expectedPassRegressions: 0,
			},
			blockerCount: 0,
		},
		blockers: [],
	};
}
