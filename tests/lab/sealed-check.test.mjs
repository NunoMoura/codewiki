import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { decisionCases } from "../../lab/decision/cases.ts";
import { implementationCases } from "../../lab/implementation/cases.ts";
import { planningCases } from "../../lab/planning/cases.ts";
import { checkSealedBundles } from "../../lab/runner/sealed-check.ts";
import {
	buildHoldoutTemplate,
	buildJudgeCalibrationTemplate,
} from "../../lab/runner/sealed-template.ts";

const tempRoots = [];

afterEach(() => {
	while (tempRoots.length > 0) {
		rmSync(tempRoots.pop(), { recursive: true, force: true });
	}
});

describe("sealed bundle readiness check", () => {
	it("blocks when no sealed bundle paths are provided", () => {
		const report = checkSealedBundles();

		assert.equal(report.status, "blocked");
		assert.match(report.blockers[0], /Provide --holdout/);
	});

	it("fails generated templates until placeholders are replaced", () => {
		const root = tempRoot("codewiki-sealed-check-template-");
		const holdoutPath = writeJson(root, "holdout.json", buildHoldoutTemplate());
		const judgePath = writeJson(
			root,
			"judge.json",
			buildJudgeCalibrationTemplate(),
		);

		const report = checkSealedBundles({
			holdoutFilePath: holdoutPath,
			judgeCalibrationFilePath: judgePath,
		});

		assert.equal(report.status, "fail");
		assert.match(report.blockers.join("\n"), /template placeholders/);
	});

	it("passes filled off-repo holdout and judge calibration bundles", () => {
		const root = tempRoot("codewiki-sealed-check-valid-");
		const holdoutPath = writeJson(root, "holdout.json", filledHoldoutBundle());
		const judgePath = writeJson(root, "judge.json", filledJudgeBundle());

		const report = checkSealedBundles({
			holdoutFilePath: holdoutPath,
			judgeCalibrationFilePath: judgePath,
		});

		assert.equal(report.status, "pass");
		assert.equal(report.holdout.loopCounts.decision.pass, 1);
		assert.equal(report.holdout.loopCounts.decision.fail, 1);
		assert.equal(report.judgeCalibration.expectedCounts.pass, 1);
		assert.equal(report.judgeCalibration.expectedCounts.fail, 1);
	});

	it("rejects repo-local bundles by default", () => {
		const holdoutPath = `.tmp-sealed-check-${process.pid}.json`;
		try {
			writeFileSync(
				holdoutPath,
				JSON.stringify(filledHoldoutBundle(), null, 2),
			);

			const blocked = checkSealedBundles({ holdoutFilePath: holdoutPath });
			const allowed = checkSealedBundles({
				holdoutFilePath: holdoutPath,
				allowRepoLocal: true,
			});

			assert.equal(blocked.status, "fail");
			assert.match(blocked.blockers.join("\n"), /outside the repository/);
			assert.equal(allowed.status, "pass");
		} finally {
			rmSync(holdoutPath, { force: true });
		}
	});
});

function tempRoot(prefix) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	tempRoots.push(root);
	return root;
}

function writeJson(root, name, value) {
	const filePath = join(root, name);
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
	return filePath;
}

function filledHoldoutBundle() {
	return {
		version: 1,
		suites: [
			{
				id: "private-ready-suite",
				cases: [
					caseFor(decisionCases, "pass"),
					caseFor(decisionCases, "fail"),
					caseFor(planningCases, "pass"),
					caseFor(planningCases, "fail"),
					caseFor(implementationCases, "pass"),
					caseFor(implementationCases, "fail"),
				],
			},
		],
	};
}

function caseFor(cases, expected) {
	const testCase = cases.find((candidate) => candidate.expected === expected);
	assert.ok(testCase, `missing ${expected} case`);
	return testCase;
}

function filledJudgeBundle() {
	return {
		version: 1,
		suites: [
			{
				id: "private-judge-ready-suite",
				cases: [
					{
						id: "semantic-pass-control",
						description: "Human-labeled positive semantic control.",
						standardId: "private-semantic-pass-control",
						method: "model_judge",
						gate: "soft",
						expected: "pass",
						weight: 1,
						graphId: "decision.loop",
						graphVersion: "0.3.0.loop.5",
						standardDescription:
							"Judge whether the semantic packet is sufficient.",
						message: "Grounded evidence supports the positive label.",
						refs: ["private:semantic-pass-control"],
						evidenceRefs: ["private:semantic-pass-control"],
						judgeInput: { loop: "decision", label: "positive-control" },
					},
					{
						id: "semantic-fail-trap",
						description: "Human-labeled false-pass trap.",
						standardId: "private-semantic-fail-trap",
						method: "model_judge",
						gate: "soft",
						expected: "fail",
						weight: 1,
						graphId: "planning.loop",
						graphVersion: "0.3.0.loop.5",
						standardDescription:
							"Judge whether the semantic packet should fail.",
						message: "Human label marks this as a semantic failure.",
						refs: ["private:semantic-fail-trap"],
						evidenceRefs: ["private:semantic-fail-trap"],
						judgeInput: { loop: "planning", label: "fail-trap" },
					},
				],
			},
		],
	};
}
