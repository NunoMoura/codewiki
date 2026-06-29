import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
	buildHoldoutTemplate,
	buildJudgeCalibrationTemplate,
	writeSealedTemplates,
} from "../../lab/runner/sealed-template.ts";
import { loadLabHoldoutBundle } from "../../lab/runner/holdout.ts";
import { loadJudgeCalibrationBundle } from "../../lab/runner/judge-calibration.ts";

const tempRoots = [];

afterEach(() => {
	while (tempRoots.length > 0) {
		rmSync(tempRoots.pop(), { recursive: true, force: true });
	}
});

describe("sealed bundle templates", () => {
	it("builds holdout and judge calibration templates with valid bundle shape", () => {
		const holdout = buildHoldoutTemplate();
		const judge = buildJudgeCalibrationTemplate();

		assert.equal(holdout.version, 1);
		assert.deepEqual(
			holdout.suites[0].cases.map((testCase) => testCase.loop).sort(),
			["decision", "implementation", "planning"],
		);
		assert.equal(judge.version, 1);
		assert.equal(judge.suites[0].cases.length, 3);
		assert.equal(
			new Set(judge.suites[0].cases.map((testCase) => testCase.standardId))
				.size,
			3,
		);
	});

	it("writes both templates outside the repo by default", () => {
		const outDir = tempRoot("codewiki-sealed-template-");

		const report = writeSealedTemplates({ outDir });

		assert.equal(report.status, "pass");
		assert.equal(report.files.length, 2);
		const holdoutPath = join(outDir, "holdout.template.json");
		const judgePath = join(outDir, "judge-calibration.template.json");
		assert.equal(existsSync(holdoutPath), true);
		assert.equal(existsSync(judgePath), true);
		assert.equal(loadLabHoldoutBundle({ filePath: holdoutPath }).version, 1);
		assert.equal(
			loadJudgeCalibrationBundle({ filePath: judgePath }).version,
			1,
		);
	});

	it("rejects repo-local output without explicit override", () => {
		const outDir = `.tmp-sealed-template-${process.pid}`;
		try {
			const blocked = writeSealedTemplates({ outDir });
			assert.equal(blocked.status, "blocked");
			assert.match(blocked.blockers[0], /outside the repository/);

			const allowed = writeSealedTemplates({ outDir, allowRepoLocal: true });
			assert.equal(allowed.status, "pass");
			assert.equal(allowed.files.length, 2);
		} finally {
			rmSync(outDir, { recursive: true, force: true });
		}
	});

	it("supports single-kind and stdout modes", () => {
		const outDir = tempRoot("codewiki-sealed-template-kind-");

		const holdoutOnly = writeSealedTemplates({ outDir, kind: "holdout" });
		const stdout = writeSealedTemplates({
			kind: "judge-calibration",
			stdout: true,
		});

		assert.deepEqual(
			holdoutOnly.files.map((file) => file.kind),
			["holdout"],
		);
		assert.equal(stdout.status, "pass");
		assert.deepEqual(
			stdout.files.map((file) => file.kind),
			["judge-calibration"],
		);
	});
});

function tempRoot(prefix) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	tempRoots.push(root);
	return root;
}
