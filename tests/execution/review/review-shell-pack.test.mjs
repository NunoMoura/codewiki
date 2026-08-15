import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateImplementationExit } from "../../../src/loops/implementation/loop.ts";
import {
	createImplementationEvidenceReport,
	createShellcheckReviewPack,
	detectShellcheckReviewCommand,
	parseShellcheckJsonDiagnostics,
	runLanguageReviewPacks,
} from "../../../src/execution/review/index.ts";
import { implementationQualityFields } from "../../helpers/implementation-change.mjs";

const planningRef =
	"trace:TRACE-shell-review:planning:iteration:1#work:WU-shell";

describe("implementation ShellCheck review pack", () => {
	it("detects project-local and PATH ShellCheck commands", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-shell-detect-"));
		const previousPath = process.env.PATH;
		try {
			await mkdir(join(root, "node_modules", ".bin"), { recursive: true });
			await writeFile(join(root, "node_modules", ".bin", "shellcheck"), "");
			const local = detectShellcheckReviewCommand(root, ["scripts/build.sh"]);
			assert.equal(local?.command.endsWith("shellcheck"), true);
			assert.deepEqual(local?.args, ["--format=json", "scripts/build.sh"]);

			await rm(join(root, "node_modules"), { recursive: true, force: true });
			const bin = join(root, "bin");
			await mkdir(bin, { recursive: true });
			await writeFile(join(bin, "shellcheck"), "");
			process.env.PATH = `${bin}:${previousPath || ""}`;
			const fromPath = detectShellcheckReviewCommand(root, [
				"scripts/test.bash",
			]);
			assert.equal(fromPath?.command.endsWith("shellcheck"), true);
			assert.deepEqual(fromPath?.args, ["--format=json", "scripts/test.bash"]);
		} finally {
			process.env.PATH = previousPath;
			await rm(root, { recursive: true, force: true });
		}
	});

	it("parses ShellCheck JSON diagnostics", () => {
		const diagnostics = parseShellcheckJsonDiagnostics(
			JSON.stringify({
				comments: [
					{
						file: "scripts/build.sh",
						line: 3,
						endLine: 3,
						column: 8,
						endColumn: 14,
						level: "error",
						code: 2086,
						message: "Double quote to prevent globbing and word splitting.",
					},
					{
						file: "scripts/build.sh",
						line: 5,
						column: 1,
						level: "style",
						code: "SC2148",
						message: "Tips depend on target shell and yours is unknown.",
					},
				],
			}),
		);

		assert.equal(diagnostics[0].sourceId, "shell.shellcheck");
		assert.equal(diagnostics[0].ruleId, "SC2086");
		assert.equal(diagnostics[0].severity, "error");
		assert.equal(diagnostics[0].range?.startLine, 3);
		assert.equal(diagnostics[1].ruleId, "SC2148");
		assert.equal(diagnostics[1].severity, "hint");
	});

	it("runs ShellCheck through injected command runner", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-shell-run-"));
		try {
			const pack = createShellcheckReviewPack({
				detectCommand: () => ({
					command: "shellcheck",
					args: ["--format=json", "scripts/build.sh"],
					description: "ShellCheck",
				}),
				runCommand: async ({ command, args, cwd, timeoutMs }) => {
					assert.equal(command, "shellcheck");
					assert.deepEqual(args, ["--format=json", "scripts/build.sh"]);
					assert.equal(cwd, root);
					assert.equal(timeoutMs, 4444);
					return {
						exitCode: 1,
						stdout: JSON.stringify({
							comments: [
								{
									file: "scripts/build.sh",
									line: 4,
									column: 2,
									level: "error",
									code: 2046,
									message: "Quote this to prevent word splitting.",
								},
							],
						}),
						stderr: "",
						durationMs: 6,
					};
				},
			});

			const report = await runLanguageReviewPacks([pack], {
				cwd: root,
				phase: "exit",
				changedPaths: ["scripts/build.sh"],
				timeoutMs: 4444,
			});

			assert.equal(report.checks[0].status, "fail");
			assert.equal(report.sources[0].id, "shell.shellcheck");
			assert.equal(report.diagnostics[0].ruleId, "SC2046");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("feeds ShellCheck diagnostics into Implementation exit review", async () => {
		const shellReport = await runLanguageReviewPacks(
			[
				createShellcheckReviewPack({
					detectCommand: () => ({
						command: "shellcheck",
						args: ["--format=json", "scripts/build.sh"],
						description: "ShellCheck",
					}),
					runCommand: async () => ({
						exitCode: 1,
						stdout: JSON.stringify({
							comments: [
								{
									file: "scripts/build.sh",
									line: 7,
									column: 3,
									level: "error",
									code: 2086,
									message:
										"Double quote to prevent globbing and word splitting.",
								},
							],
						}),
						stderr: "",
						durationMs: 5,
					}),
				}),
			],
			{
				cwd: process.cwd(),
				phase: "exit",
				changedPaths: ["scripts/build.sh"],
			},
		);
		const acceptanceReport = createImplementationEvidenceReport({
			phase: "exit",
			changedPaths: ["scripts/build.sh"],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef: planningRef,
					criterionId: "AC-001",
					evidenceRefs: ["tests/execution/review/review-shell-pack.test.mjs"],
				},
			],
		});

		const result = evaluateImplementationExit({
			planningRefs: [planningRef],
			acceptanceRequirements: [
				{
					planningRef,
					criterionId: "AC-001",
					text: "Shell evidence is reviewed.",
				},
			],
			planningScopes: [
				{
					planningRef,
					workUnitId: "WU-shell",
					componentRefs: [],
					pathScopes: ["scripts/build.sh", "tests/build.bats"],
					verification: ["shellcheck scripts/build.sh"],
				},
			],
			changes: [
				{
					id: "IC-shell",
					planningRefs: [planningRef],
					codePaths: ["scripts/build.sh"],
					docPaths: [],
					testPaths: ["tests/build.bats"],
					publicationRefs: [],
					checks: ["shellcheck scripts/build.sh"],
					checkResults: [
						{
							command: "shellcheck scripts/build.sh",
							status: "pass",
							outputRef: "scripts/build.sh",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Shell evidence is reviewed.",
							evidenceRefs: ["tests/execution/review/review-shell-pack.test.mjs"],
						},
					],
					contentProof: { workingTreeDigest: "sha256:shell" },
					...implementationQualityFields(),
				},
			],
			reviewEvidenceReports: [shellReport, acceptanceReport],
		});

		assert.equal(result.passed, false);
		assert.equal(
			result.issues.some(
				(issue) => issue.code === "review_blocking_diagnostic",
			),
			true,
		);
	});
});
