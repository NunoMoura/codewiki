import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	collectWorkerOutputFiles,
	collectWorkerReports,
	normalizeWorkerCompletion,
} from "../../src/project-server/workers/reports.ts";

function workerObservation(overrides = {}) {
	return {
		workerId: "pi-worker-001",
		workUnitId: "WU-a",
		traceId: "TRACE-pi-a",
		planningRefs: ["trace:TRACE-pi-a:planning:iteration:1#work:WU-a"],
		claimId: "claim-WU-a-001",
		sessionId: "session-pi-worker-001",
		sessionFile:
			".codewiki/runtime/tmp/TRACE-pi-a/runtime/pi-workers/pi-worker-001.session.jsonl",
		status: "started",
		...overrides,
	};
}

describe("worker completion normalization", () => {
	it("converts structured session output into implementation worker reports", () => {
		const result = normalizeWorkerCompletion({
			worker: workerObservation(),
			output: JSON.stringify({
				status: "completed",
				message: "Worker finished.",
				changed_files: ["src/project-server/claims/work-unit-events.ts"],
				checks_run: ["npm test"],
				head_sha: "abc1234",
				tree_sha: "def5678",
				working_tree_digest: "sha256:abc123",
				validation_ref: "tests/project-server/worker-reports.test.mjs",
				changes: [
					{
						id: "IC-worker-a",
						checkResults: [{ command: "npm test", status: "pass" }],
						acceptanceEvidenceItems: [
							{
								criterionId: "AC-001",
								summary: "Worker evidence normalized.",
								evidenceRefs: ["tests/project-server/worker-reports.test.mjs"],
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
		assert.equal(
			result.sessionFile,
			".codewiki/runtime/tmp/TRACE-pi-a/runtime/pi-workers/pi-worker-001.session.jsonl",
		);
		assert.equal(result.status, "completed");
		assert.deepEqual(result.planningRefs, [
			"trace:TRACE-pi-a:planning:iteration:1#work:WU-a",
		]);
		assert.equal(result.message, "Worker finished.");
		assert.deepEqual(result.proof?.changedPaths, [
			"src/project-server/claims/work-unit-events.ts",
		]);
		assert.deepEqual(result.proof?.checksRun, ["npm test"]);
		assert.equal(result.proof?.headSha, "abc1234");
		assert.equal(result.proof?.treeSha, "def5678");
		assert.equal(result.proof?.workingTreeDigest, "sha256:abc123");
		assert.equal(
			result.proof?.validationRef,
			"tests/project-server/worker-reports.test.mjs",
		);
		assert.equal(result.changeInputs[0].id, "IC-worker-a");
	});

	it("parses fenced CodeWiki worker reports from prose completion output", () => {
		const planningRef = "trace:TRACE-pi-a:planning:iteration:1#work:WU-a";
		const result = normalizeWorkerCompletion({
			worker: workerObservation(),
			output: `Worker done.\n\n\`\`\`codewiki-worker-report\n${JSON.stringify({
				status: "completed",
				workUnitRef: planningRef,
				message: "Implemented worker report parsing.",
				notes: "Implementation loop must still evaluate exit.",
				changedFiles: ["src/project-server/workers/reports.ts"],
				checksRun: ["node --test tests/project-server/worker-reports.test.mjs"],
				contentProofRefs: ["sha256:abcdef"],
				residualRisks: ["No runtime process adapter yet."],
				changes: [
					{
						id: "IC-worker-report",
						planningRefs: [planningRef],
						checkResults: [
							{
								command: "node --test tests/project-server/worker-reports.test.mjs",
								status: "pass",
							},
						],
						acceptanceEvidenceItems: [
							{
								criterionId: "AC-001",
								summary: "Report evidence normalized.",
								evidenceRefs: ["tests/project-server/worker-reports.test.mjs"],
							},
						],
					},
				],
			})}\n\`\`\``,
		});

		assert.equal(result.status, "completed");
		assert.deepEqual(result.planningRefs, [planningRef]);
		assert.deepEqual(result.proof?.changedPaths, ["src/project-server/workers/reports.ts"]);
		assert.deepEqual(result.proof?.checksRun, [
			"node --test tests/project-server/worker-reports.test.mjs",
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

	it("normalizes blocked, failed, and cancelled completions without log refs", () => {
		const blocked = normalizeWorkerCompletion({
			worker: workerObservation(),
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
		const failed = normalizeWorkerCompletion({
			worker: workerObservation({ status: "failed", error: "spawn failed" }),
			output: "plain text is not structured JSON",
		});
		const cancelled = normalizeWorkerCompletion({
			worker: workerObservation({
				status: "cancelled",
				error: "assignment cancelled",
			}),
		});

		assert.equal(blocked.status, "blocked");
		assert.equal(blocked.message, "Needs planning scope change.");
		assert.equal(failed.status, "failed");
		assert.equal(
			failed.message,
			"Worker completion output is missing a codewiki-worker-report block. plain text is not structured JSON spawn failed",
		);
		assert.equal(failed.refs, undefined);
		assert.equal(cancelled.status, "cancelled");
		assert.equal(cancelled.message, "assignment cancelled");
	});

	it("fails invalid fenced CodeWiki worker reports", () => {
		const result = normalizeWorkerCompletion({
			worker: workerObservation(),
			output: "```codewiki-worker-report\nnot json\n```",
		});
		const arrayReport = normalizeWorkerCompletion({
			worker: workerObservation(),
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
		const result = normalizeWorkerCompletion({
			worker: workerObservation(),
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
		const result = normalizeWorkerCompletion({
			worker: workerObservation(),
			output: `\`\`\`codewiki-worker-report\n${JSON.stringify({
				status: "completed | blocked | failed | cancelled",
				changedFiles: ["src/project-server/workers/reports.ts"],
			})}\n\`\`\``,
		});

		assert.equal(result.status, "failed");
		assert.match(
			result.message,
			/Worker completion status "completed \| blocked \| failed \| cancelled" is invalid\./,
		);
	});

	it("guards completed worker output without implementation evidence", () => {
		const result = normalizeWorkerCompletion({
			worker: workerObservation(),
			output: { status: "completed", message: "Looks done." },
		});

		assert.equal(result.status, "failed");
		assert.equal(
			result.message,
			"completion_guard: completed worker produced no implementation evidence. Looks done.",
		);
	});

	it("collects worker output files in execution order", async () => {
		const base = join(process.cwd(), ".tmp-worktrees/pi-worker-reports");
		await mkdir(base, { recursive: true });
		const root = await mkdtemp(join(base, "run-"));
		try {
			const firstOutput = join(root, "first.jsonl");
			const missingOutput = join(root, "missing.jsonl");
			await writeFile(
				firstOutput,
				`\`\`\`codewiki-worker-report\n${JSON.stringify({
					status: "completed",
					changedFiles: ["src/project-server/workers/reports.ts"],
				})}\n\`\`\``,
			);

			const completions = await collectWorkerOutputFiles([
				workerObservation({
					workUnitId: "WU-a",
					workerId: "worker-a",
					outputFile: firstOutput,
				}),
				workerObservation({
					workUnitId: "WU-b",
					workerId: "worker-b",
					outputFile: missingOutput,
				}),
			]);
			const results = collectWorkerReports(completions);

			assert.equal(
				completions[0].output.includes("codewiki-worker-report"),
				true,
			);
			assert.equal(completions[1].worker.outputFile, missingOutput);
			assert.equal(results[0].status, "completed");
			assert.deepEqual(results[0].proof?.changedPaths, [
				"src/project-server/workers/reports.ts",
			]);
			assert.equal(results[1].status, "failed");
			assert.match(
				results[1].message,
				/Worker completion output file is unreadable:/,
			);
			assert.match(results[1].message, /ENOENT/);
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(base, { recursive: true, force: true });
		}
	});

	it("fails collection when a worker did not provide an output file", async () => {
		const completions = await collectWorkerOutputFiles([
			workerObservation({ workerId: "worker-no-output", outputFile: undefined }),
		]);
		const results = collectWorkerReports(completions);

		assert.equal(
			completions[0].error,
			"Worker completion output file is missing for worker worker-no-output.",
		);
		assert.equal(results[0].status, "failed");
		assert.equal(
			results[0].message,
			"Worker completion output file is missing for worker worker-no-output.",
		);
	});

	it("collects multiple completions in execution order", () => {
		const results = collectWorkerReports([
			{
				worker: workerObservation({ workUnitId: "WU-a", workerId: "worker-a" }),
				output: {
					status: "completed",
					changedFiles: ["src/project-server/workers/reports.ts"],
				},
			},
			{
				worker: workerObservation({ workUnitId: "WU-b", workerId: "worker-b" }),
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
