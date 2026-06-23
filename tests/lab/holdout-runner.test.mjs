import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { decisionCases } from "../../lab/decision/cases.ts";
import { implementationCases } from "../../lab/implementation/cases.ts";
import { planningCases } from "../../lab/planning/cases.ts";
import { loadLabHoldoutBundle } from "../../lab/runner/holdout.ts";
import { scoreHoldoutBundle } from "../../lab/runner/holdout-score.ts";

const HOLDOUT_CASES = [
	decisionCases.find((testCase) => testCase.expected === "pass"),
	decisionCases.find((testCase) => testCase.expected === "fail"),
	planningCases.find((testCase) => testCase.expected === "pass"),
	planningCases.find((testCase) => testCase.expected === "fail"),
	implementationCases.find((testCase) => testCase.expected === "pass"),
	implementationCases.find((testCase) => testCase.expected === "fail"),
].filter(Boolean);

describe("lab holdout runner", () => {
	it("loads and scores external holdout bundles without exposing them as repo fixtures", () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "codewiki-lab-holdout-"));
		try {
			const holdoutPath = join(tempRoot, "holdout.json");
			writeFileSync(holdoutPath, JSON.stringify(holdoutBundle(), null, 2));

			const bundle = loadLabHoldoutBundle({ filePath: holdoutPath });
			assert.equal(bundle.version, 1);
			assert.equal(bundle.suites[0].cases.length, HOLDOUT_CASES.length);

			const report = scoreHoldoutBundle(bundle);
			assert.equal(report.gate.status, "pass");
			assert.equal(report.suites.length, 1);
			assert.equal(report.suites[0].scores.decision.falsePasses, 0);
			assert.equal(report.suites[0].scores.planning.falsePasses, 0);
			assert.equal(report.suites[0].scores.implementation.falsePasses, 0);
			assert.equal(report.suites[0].scores.decision.caseCount, 2);
			assert.equal(report.suites[0].scores.planning.caseCount, 2);
			assert.equal(report.suites[0].scores.implementation.caseCount, 2);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("rejects repo-local holdout bundles by default", () => {
		const holdoutPath = ".codewiki-lab-holdout-test.json";
		try {
			writeFileSync(holdoutPath, JSON.stringify(holdoutBundle(), null, 2));
			assert.throws(
				() => loadLabHoldoutBundle({ filePath: holdoutPath }),
				/holdout files must live outside the repository/i,
			);
			assert.doesNotThrow(() =>
				loadLabHoldoutBundle({ filePath: holdoutPath, allowRepoLocal: true }),
			);
		} finally {
			rmSync(holdoutPath, { force: true });
		}
	});

	it("fails holdout suites that omit a semantic loop", () => {
		const bundle = {
			version: 1,
			filePath: "synthetic-hidden.json",
			suites: [
				{
					id: "missing-loop-suite",
					cases: [
						decisionCases.find((testCase) => testCase.expected === "pass"),
					],
				},
			],
		};
		const report = scoreHoldoutBundle(bundle);
		assert.equal(report.gate.status, "fail");
		assert.deepEqual(report.gate.blockers, [
			"missing-loop-suite: PEC has no holdout cases in this suite.",
			"missing-loop-suite: IEC has no holdout cases in this suite.",
		]);
	});
});

function holdoutBundle() {
	return {
		version: 1,
		suites: [
			{
				id: "private-smoke-suite",
				description:
					"Synthetic external holdout smoke used to verify the blind runner protocol.",
				cases: HOLDOUT_CASES,
			},
		],
	};
}
