import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	calibrateLoopQualityJudge,
	judgeCalibrationRequest,
	loadJudgeCalibrationBundle,
} from "../../lab/runner/judge-calibration.ts";

const tempRoots = [];

afterEach(() => {
	while (tempRoots.length > 0) {
		rmSync(tempRoots.pop(), { recursive: true, force: true });
	}
});

function tempBundleFile(bundle) {
	const root = mkdtempSync(join(tmpdir(), "codewiki-judge-calibration-"));
	tempRoots.push(root);
	const filePath = join(root, "calibration.json");
	writeFileSync(filePath, JSON.stringify(bundle, null, 2));
	return filePath;
}

function bundle(cases = calibrationCases()) {
	return {
		version: 1,
		suites: [
			{
				id: "sealed-judge-suite",
				description: "private judge calibration labels",
				cases,
			},
		],
	};
}

function calibrationCases() {
	return [
		{
			id: "good-assessment",
			description: "Agent assessment is specific and grounded.",
			standardId: "judge-good-assessment",
			method: "agent_self_assessment",
			gate: "soft",
			expected: "pass",
			weight: 1,
			standardDescription: "Agent assessment should be plausible.",
			message: "Assessment cites user value and project benefit.",
			evidenceRefs: ["trace:demo#good"],
		},
		{
			id: "generic-assessment",
			description: "Agent assessment is generic and should fail.",
			standardId: "judge-generic-assessment",
			method: "agent_self_assessment",
			gate: "soft",
			expected: "fail",
			weight: 2,
			standardDescription: "Agent assessment should be plausible.",
			message: "This is good for users.",
			evidenceRefs: ["trace:demo#generic"],
		},
		{
			id: "unsafe-pass",
			description: "Model judge should block unsafe evidence.",
			standardId: "judge-unsafe-pass",
			method: "model_judge",
			gate: "soft",
			expected: "block",
			weight: 3,
			standardDescription: "Semantic quality should be independently safe.",
			message: "Evidence contradicts the claimed result.",
			evidenceRefs: ["trace:demo#unsafe"],
		},
	];
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

describe("sealed judge calibration", () => {
	it("loads calibration bundles only from outside the repository by default", () => {
		const outsideFile = tempBundleFile(bundle());
		const outside = loadJudgeCalibrationBundle({ filePath: outsideFile });

		assert.equal(outside.suites[0].cases.length, 3);

		const repoFile = join(
			process.cwd(),
			`.tmp-judge-calibration-${process.pid}.json`,
		);
		writeFileSync(repoFile, JSON.stringify(bundle(), null, 2));
		try {
			assert.throws(
				() => loadJudgeCalibrationBundle({ filePath: repoFile }),
				/outside the repository/,
			);
			assert.equal(
				loadJudgeCalibrationBundle({ filePath: repoFile, allowRepoLocal: true })
					.suites[0].cases.length,
				3,
			);
		} finally {
			rmSync(repoFile, { force: true });
		}
	});

	it("passes calibration when judge verdicts match human labels", async () => {
		const loaded = loadJudgeCalibrationBundle({
			filePath: tempBundleFile(bundle()),
		});
		const report = await calibrateLoopQualityJudge(
			loaded,
			fakeJudge({
				"judge-good-assessment": "pass",
				"judge-generic-assessment": "fail",
				"judge-unsafe-pass": "block",
			}),
		);

		assert.equal(report.status, "pass");
		assert.equal(report.score, 100);
		assert.equal(report.falsePasses, 0);
		assert.equal(report.caseCount, 3);
	});

	it("fails calibration on judge false passes", async () => {
		const loaded = loadJudgeCalibrationBundle({
			filePath: tempBundleFile(bundle()),
		});
		const report = await calibrateLoopQualityJudge(
			loaded,
			fakeJudge({
				"judge-good-assessment": "pass",
				"judge-generic-assessment": "pass",
				"judge-unsafe-pass": "pass",
			}),
		);

		assert.equal(report.status, "fail");
		assert.equal(report.falsePasses, 2);
		assert.match(report.blockers.join("\n"), /false pass/);
	});

	it("builds stable judge requests with cache keys", () => {
		const testCase = {
			...calibrationCases()[0],
			suiteId: "sealed-judge-suite",
			refs: [],
			graphId: "decision.loop",
			graphVersion: "test",
		};
		const request = judgeCalibrationRequest(testCase, "judge.test.v1");
		const repeat = judgeCalibrationRequest(testCase, "judge.test.v1");

		assert.equal(request.cacheKey, repeat.cacheKey);
		assert.match(request.cacheKey, /^sha256:/);
		assert.equal(request.promptVersion, "judge.test.v1");
		assert.equal(request.standardId, "judge-good-assessment");
	});
});
