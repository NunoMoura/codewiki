import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	buildPromotionEligibilityReport,
	buildPromotionEligibilityReportWithJudgeCalibration,
	buildPromotionGraphDiff,
} from "../../lab/runner/promotion.ts";

const tempRoots = [];

afterEach(() => {
	while (tempRoots.length > 0) {
		rmSync(tempRoots.pop(), { recursive: true, force: true });
	}
});

describe("lab promotion eligibility", () => {
	it("blocks promotion without a sealed holdout and human review", () => {
		const report = buildPromotionEligibilityReport();
		const requirements = Object.fromEntries(
			report.requirements.map((requirement) => [requirement.id, requirement]),
		);

		assert.equal(report.status, "blocked");
		assert.equal(requirements.visible_gate.status, "pass");
		assert.equal(requirements.pipeline_gate.status, "pass");
		assert.equal(requirements.sealed_holdout.status, "block");
		assert.match(requirements.sealed_holdout.message, /No sealed holdout/);
		assert.equal(requirements.objective_threshold.status, "block");
		assert.equal(requirements.graph_diff.status, "pass");
		assert.equal(requirements.judge_calibration.status, "pass");
		assert.equal(requirements.human_review.status, "block");
	});

	it("records graph diff metadata for all semantic loops", () => {
		const diff = buildPromotionGraphDiff();

		assert.deepEqual(
			diff.map((entry) => entry.loop),
			["decision", "planning", "implementation"],
		);
		for (const entry of diff) {
			assert.match(entry.production.path, /^src\//);
			assert.match(entry.candidate.path, /^lab\//);
			assert.match(entry.production.hash, /^sha256:/);
			assert.match(entry.candidate.hash, /^sha256:/);
		}
		assert.ok(diff.some((entry) => entry.changed));
	});

	it("accepts human review refs while still requiring holdout proof", () => {
		const report = buildPromotionEligibilityReport({
			humanReviewRef: "trace:TRACE-review:implementation:iteration:1#review",
		});
		const requirements = Object.fromEntries(
			report.requirements.map((requirement) => [requirement.id, requirement]),
		);

		assert.equal(requirements.human_review.status, "pass");
		assert.equal(requirements.sealed_holdout.status, "block");
		assert.equal(report.status, "blocked");
	});

	it("blocks promotion when required judge calibration is missing", async () => {
		const report = await buildPromotionEligibilityReportWithJudgeCalibration({
			requireJudgeCalibration: true,
		});
		const requirements = Object.fromEntries(
			report.requirements.map((requirement) => [requirement.id, requirement]),
		);

		assert.equal(requirements.judge_calibration.status, "block");
		assert.match(requirements.judge_calibration.message, /required/);
		assert.equal(report.status, "blocked");
	});

	it("blocks promotion when judge calibration fails", async () => {
		const report = await buildPromotionEligibilityReportWithJudgeCalibration({
			judgeCalibrationFilePath: judgeCalibrationFile("fail"),
			judge: fakeJudge({ "promotion-judge-case": "pass" }),
		});
		const requirements = Object.fromEntries(
			report.requirements.map((requirement) => [requirement.id, requirement]),
		);

		assert.equal(requirements.judge_calibration.status, "block");
		assert.match(requirements.judge_calibration.message, /false passes 1/);
	});

	it("accepts passing judge calibration evidence", async () => {
		const report = await buildPromotionEligibilityReportWithJudgeCalibration({
			judgeCalibrationFilePath: judgeCalibrationFile("fail"),
			judge: fakeJudge({ "promotion-judge-case": "fail" }),
		});
		const requirements = Object.fromEntries(
			report.requirements.map((requirement) => [requirement.id, requirement]),
		);

		assert.equal(requirements.judge_calibration.status, "pass");
		assert.match(requirements.judge_calibration.message, /passed/);
		assert.equal(report.status, "blocked");
	});
});

function judgeCalibrationFile(expected) {
	const root = mkdtempSync(join(tmpdir(), "codewiki-promotion-judge-"));
	tempRoots.push(root);
	const filePath = join(root, "judge-calibration.json");
	writeFileSync(
		filePath,
		JSON.stringify(
			{
				version: 1,
				suites: [
					{
						id: "promotion-judge-suite",
						cases: [
							{
								id: "promotion-judge-case",
								description: "Judge calibration case for promotion gating.",
								standardId: "promotion-judge-case",
								method: "agent_self_assessment",
								gate: "soft",
								expected,
								weight: 1,
								standardDescription:
									"Agent assessment must be independently plausible.",
								message: "Generic assessment should not pass.",
								evidenceRefs: ["trace:promotion#judge"],
							},
						],
					},
				],
			},
			null,
			2,
		),
	);
	return filePath;
}

function fakeJudge(verdictsByStandardId) {
	return {
		promptVersion: "judge.test.v1",
		async judge(requests) {
			return requests.map((request) => ({
				standardId: request.standardId,
				status: verdictsByStandardId[request.standardId] || "block",
				message: `verdict ${request.standardId}`,
			}));
		},
	};
}
