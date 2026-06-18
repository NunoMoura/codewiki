import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	collectPiWorkerResults,
	normalizePiWorkerCompletion,
} from "../../src/pi/worker-results.ts";

function dispatch(overrides = {}) {
	return {
		workerId: "pi-worker-001",
		workUnitId: "WU-a",
		traceId: "TRACE-pi-a",
		planningRefs: ["trace:TRACE-pi-a:planning:iteration:1#work:WU-a"],
		claimId: "claim-WU-a-001",
		sessionId: "session-pi-worker-001",
		sessionFile: "/tmp/pi-worker-001.jsonl",
		status: "started",
		...overrides,
	};
}

describe("Pi worker completion normalization", () => {
	it("converts structured session output into implementation worker results", () => {
		const result = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: JSON.stringify({
				status: "completed",
				message: "Worker finished.",
				changed_files: ["src/runtime/dispatcher.ts"],
				checks_run: ["npm test"],
				head_sha: "abc1234",
				tree_sha: "def5678",
				working_tree_digest: "sha256:abc123",
				validation_ref: "tests/runtime/pi-worker-results.test.mjs",
				changes: [
					{
						id: "IC-worker-a",
						checkResults: [{ command: "npm test", status: "pass" }],
						acceptanceEvidenceItems: [
							{
								criterionId: "AC-001",
								summary: "Worker evidence normalized.",
								evidenceRefs: ["tests/runtime/pi-worker-results.test.mjs"],
							},
						],
					},
				],
			}),
		});

		assert.equal(result.workerId, "pi-worker-001");
		assert.equal(result.workUnitId, "WU-a");
		assert.equal(result.claimId, "claim-WU-a-001");
		assert.equal(result.sessionId, "session-pi-worker-001");
		assert.equal(result.sessionFile, "/tmp/pi-worker-001.jsonl");
		assert.equal(result.status, "completed");
		assert.deepEqual(result.planningRefs, [
			"trace:TRACE-pi-a:planning:iteration:1#work:WU-a",
		]);
		assert.equal(result.message, "Worker finished.");
		assert.deepEqual(result.changedFiles, ["src/runtime/dispatcher.ts"]);
		assert.deepEqual(result.checksRun, ["npm test"]);
		assert.equal(result.headSha, "abc1234");
		assert.equal(result.treeSha, "def5678");
		assert.equal(result.workingTreeDigest, "sha256:abc123");
		assert.equal(
			result.validationRef,
			"tests/runtime/pi-worker-results.test.mjs",
		);
		assert.equal(result.changeInputs[0].id, "IC-worker-a");
	});

	it("parses fenced CodeWiki worker reports from prose completion output", () => {
		const planningRef = "trace:TRACE-pi-a:planning:iteration:1#work:WU-a";
		const result = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: `Worker done.\n\n\`\`\`codewiki-worker-report\n${JSON.stringify({
				status: "completed",
				workUnitRef: planningRef,
				message: "Implemented worker report parsing.",
				notes: "Implementation loop must still evaluate exit.",
				changedFiles: ["src/pi/worker-results.ts"],
				checksRun: ["node --test tests/runtime/pi-worker-results.test.mjs"],
				contentProofRefs: ["sha256:abcdef"],
				residualRisks: ["No runtime process adapter yet."],
				changes: [
					{
						id: "IC-worker-report",
						planningRefs: [planningRef],
						checkResults: [
							{
								command:
									"node --test tests/runtime/pi-worker-results.test.mjs",
								status: "pass",
							},
						],
						acceptanceEvidenceItems: [
							{
								criterionId: "AC-001",
								summary: "Report evidence normalized.",
								evidenceRefs: ["tests/runtime/pi-worker-results.test.mjs"],
							},
						],
					},
				],
			})}\n\`\`\``,
		});

		assert.equal(result.status, "completed");
		assert.deepEqual(result.planningRefs, [planningRef]);
		assert.deepEqual(result.changedFiles, ["src/pi/worker-results.ts"]);
		assert.deepEqual(result.checksRun, [
			"node --test tests/runtime/pi-worker-results.test.mjs",
		]);
		assert.equal(result.refs.includes("sha256:abcdef"), true);
		assert.equal(
			result.message,
			"Implemented worker report parsing. Implementation loop must still evaluate exit. No runtime process adapter yet.",
		);
		assert.equal(result.changeInputs[0].id, "IC-worker-report");
		assert.equal(result.changeInputs[0].checkResults[0].status, "pass");
		assert.equal(
			result.changeInputs[0].acceptanceEvidenceItems[0].criterionId,
			"AC-001",
		);
	});

	it("normalizes blocked and failed completions without log refs", () => {
		const blocked = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: {
				status: "blocked",
				blockers: [
					{
						message: "Needs planning scope change.",
						refs: ["trace:TRACE-pi-a:planning:iteration:1#work:WU-a"],
					},
				],
			},
		});
		const failed = normalizePiWorkerCompletion({
			dispatch: dispatch({ status: "failed", error: "spawn failed" }),
			output: "plain text is not structured JSON",
		});

		assert.equal(blocked.status, "blocked");
		assert.equal(blocked.message, "Needs planning scope change.");
		assert.equal(failed.status, "failed");
		assert.equal(
			failed.message,
			"Worker completion output is missing a codewiki-worker-report block. plain text is not structured JSON spawn failed",
		);
		assert.equal(failed.refs, undefined);
	});

	it("fails invalid fenced CodeWiki worker reports", () => {
		const result = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: "```codewiki-worker-report\nnot json\n```",
		});
		const arrayReport = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: "```codewiki-worker-report\n[]\n```",
		});

		assert.equal(result.status, "failed");
		assert.match(
			result.message,
			/Worker codewiki-worker-report is not valid JSON\./,
		);
		assert.equal(arrayReport.status, "failed");
		assert.match(
			arrayReport.message,
			/Worker codewiki-worker-report is not valid JSON\./,
		);
	});

	it("fails ambiguous completions with multiple worker reports", () => {
		const result = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: [
				"```codewiki-worker-report",
				JSON.stringify({ status: "completed", changedFiles: ["src/a.ts"] }),
				"```",
				"```json codewiki-worker-report",
				JSON.stringify({ status: "failed", message: "Actually failed." }),
				"```",
			].join("\n"),
		});

		assert.equal(result.status, "failed");
		assert.match(
			result.message,
			/Worker completion output contains multiple codewiki-worker-report blocks\./,
		);
	});

	it("fails worker reports with invalid status values", () => {
		const result = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: `\`\`\`codewiki-worker-report\n${JSON.stringify({
				status: "completed | blocked | failed",
				changedFiles: ["src/pi/worker-results.ts"],
			})}\n\`\`\``,
		});

		assert.equal(result.status, "failed");
		assert.match(
			result.message,
			/Worker completion status "completed \| blocked \| failed" is invalid\./,
		);
	});

	it("guards completed worker output without implementation evidence", () => {
		const result = normalizePiWorkerCompletion({
			dispatch: dispatch(),
			output: { status: "completed", message: "Looks done." },
		});

		assert.equal(result.status, "failed");
		assert.equal(
			result.message,
			"completion_guard: completed worker produced no implementation evidence. Looks done.",
		);
	});

	it("collects multiple completions in dispatch order", () => {
		const results = collectPiWorkerResults([
			{
				dispatch: dispatch({ workUnitId: "WU-a", workerId: "worker-a" }),
				output: { status: "completed", changedFiles: ["src/pi/dispatcher.ts"] },
			},
			{
				dispatch: dispatch({ workUnitId: "WU-b", workerId: "worker-b" }),
				output: { status: "failed", message: "check failed" },
			},
		]);

		assert.deepEqual(
			results.map((result) => [
				result.workUnitId,
				result.workerId,
				result.status,
			]),
			[
				["WU-a", "worker-a", "completed"],
				["WU-b", "worker-b", "failed"],
			],
		);
	});
});
