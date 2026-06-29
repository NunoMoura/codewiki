import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { decisionCases } from "../../lab/decision/cases.ts";
import { implementationCases } from "../../lab/implementation/cases.ts";
import { planningCases } from "../../lab/planning/cases.ts";
import { buildLabObjectiveReport } from "../../lab/runner/objective.ts";

const HOLDOUT_CASES = [
	decisionCases.find((testCase) => testCase.expected === "pass"),
	decisionCases.find((testCase) => testCase.expected === "fail"),
	planningCases.find((testCase) => testCase.expected === "pass"),
	planningCases.find((testCase) => testCase.expected === "fail"),
	implementationCases.find((testCase) => testCase.expected === "pass"),
	implementationCases.find((testCase) => testCase.expected === "fail"),
].filter(Boolean);

describe("CodeWiki lab objective", () => {
	it("reports visible-only objective scores without sealed holdout proof", () => {
		const report = buildLabObjectiveReport();

		assert.equal(report.version, 1);
		assert.equal(report.mode, "visible-only");
		assert.equal(report.status, "visible-only");
		assert.equal(report.score, 90);
		assert.equal(report.maxMeaningfulScore, 90);
		assert.equal(report.components.DEC.score, 100);
		assert.equal(report.components.PEC.score, 100);
		assert.equal(report.components.IEC.score, 100);
		assert.equal(report.components.PCE.score, 100);
		assert.equal(report.components.HCE.score, 0);
		assert.equal(report.hardGates.falsePasses, 0);
		assert.equal(report.hardGates.expectedPassRegressions, 0);
		assert.equal(report.hardGates.blockers.length, 0);
		assert.deepEqual(report.topLossContributors, []);
		assert.match(report.warnings[0], /No sealed holdout/);
	});

	it("includes sealed holdout cases when an external bundle is mounted", () => {
		const tempRoot = mkdtempSync(join(tmpdir(), "codewiki-lab-objective-"));
		try {
			const holdoutPath = join(tempRoot, "holdout.json");
			writeFileSync(holdoutPath, JSON.stringify(holdoutBundle(), null, 2));

			const report = buildLabObjectiveReport({ holdoutFilePath: holdoutPath });

			assert.equal(report.mode, "sealed");
			assert.equal(report.status, "pass");
			assert.equal(report.score, 100);
			assert.equal(report.maxMeaningfulScore, 100);
			assert.equal(report.components.HCE.score, 100);
			assert.equal(report.components.HCE.caseCount, HOLDOUT_CASES.length);
			assert.equal(report.holdout.filePath, holdoutPath);
			assert.equal(report.holdout.gateStatus, "pass");
			assert.deepEqual(report.topLossContributors, []);
			assert.deepEqual(report.warnings, []);
		} finally {
			rmSync(tempRoot, { recursive: true, force: true });
		}
	});
});

function holdoutBundle() {
	return {
		version: 1,
		suites: [
			{
				id: "private-objective-smoke-suite",
				description:
					"Synthetic external holdout smoke used to verify the lab objective.",
				cases: HOLDOUT_CASES,
			},
		],
	};
}
