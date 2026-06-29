import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runJudgeSmoke } from "../../lab/runner/judge-smoke.ts";

describe("loop quality judge smoke", () => {
	it("blocks when no judge endpoint is configured", async () => {
		const report = await runJudgeSmoke({ env: {} });

		assert.equal(report.status, "blocked");
		assert.equal(report.provider, "none");
		assert.match(report.blockers[0], /CODEWIKI_LOOP_QUALITY_JUDGE_URL/);
	});

	it("sends one batch per loop and requires per-standard verdicts", async () => {
		const calls = [];
		const report = await runJudgeSmoke({
			judge: {
				promptVersion: "smoke.test",
				async judge(requests) {
					calls.push(requests);
					return requests.map((request) => ({
						standardId: request.standardId,
						status: "pass",
						score: 92,
						message: "ok",
					}));
				},
			},
		});

		assert.equal(report.status, "pass");
		assert.equal(report.provider, "injected");
		assert.equal(calls.length, 3);
		assert.deepEqual(
			calls.map((requests) => requests[0].judgeInput.loop).sort(),
			["decision", "implementation", "planning"],
		);
		assert.ok(calls.every((requests) => requests.length > 1));
		assert.ok(
			calls.every((requests) =>
				requests.every((request) => request.method === "model_judge"),
			),
		);
	});

	it("fails when the endpoint omits numeric scores", async () => {
		const report = await runJudgeSmoke({
			judge: {
				promptVersion: "smoke.test",
				async judge(requests) {
					return requests.map((request) => ({
						standardId: request.standardId,
						status: "pass",
						message: "ok",
					}));
				},
			},
		});

		assert.equal(report.status, "fail");
		assert.match(report.blockers.join("\n"), /Missing numeric score/);
	});

	it("fails when the endpoint returns pass scores below threshold", async () => {
		const report = await runJudgeSmoke({
			judge: {
				promptVersion: "smoke.test",
				async judge(requests) {
					return requests.map((request) => ({
						standardId: request.standardId,
						status: "pass",
						score: 79,
						message: "ok",
					}));
				},
			},
		});

		assert.equal(report.status, "fail");
		assert.match(report.blockers.join("\n"), /below threshold 80/);
	});

	it("fails when the endpoint omits a per-standard verdict", async () => {
		const report = await runJudgeSmoke({
			judge: {
				promptVersion: "smoke.test",
				async judge(requests) {
					return requests.slice(0, 1).map((request) => ({
						standardId: request.standardId,
						status: "pass",
						score: 92,
						message: "ok",
					}));
				},
			},
		});

		assert.equal(report.status, "fail");
		assert.match(report.blockers.join("\n"), /Missing verdict/);
	});
});
