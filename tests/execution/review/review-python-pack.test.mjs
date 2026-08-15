import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateImplementationExit } from "../../../src/loops/implementation/loop.ts";
import {
	createImplementationEvidenceReport,
	createPythonPyrightReviewPack,
	createPythonRuffReviewPack,
	detectPythonReviewCommand,
	parsePyrightJsonDiagnostics,
	parseRuffJsonDiagnostics,
	runLanguageReviewPacks,
} from "../../../src/execution/review/index.ts";
import { implementationQualityFields } from "../../helpers/implementation-change.mjs";

const planningRef =
	"trace:TRACE-python-review:planning:iteration:1#work:WU-python";

describe("implementation Python review packs", () => {
	it("detects project-local Ruff and Pyright commands", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-python-pack-"));
		try {
			await mkdir(join(root, ".venv", "bin"), { recursive: true });
			await mkdir(join(root, "node_modules", ".bin"), { recursive: true });
			await writeFile(join(root, ".venv", "bin", "ruff"), "");
			await writeFile(join(root, "node_modules", ".bin", "pyright"), "");

			const ruff = detectPythonReviewCommand(root, "ruff", ["src/app.py"]);
			const pyright = detectPythonReviewCommand(root, "pyright", [
				"src/app.py",
			]);

			assert.equal(ruff?.tool, "ruff");
			assert.deepEqual(ruff?.args, [
				"check",
				"--output-format=json",
				"src/app.py",
			]);
			assert.equal(pyright?.tool, "pyright");
			assert.deepEqual(pyright?.args, ["--outputjson", "src/app.py"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("parses Ruff and Pyright JSON diagnostics", () => {
		const ruff = parseRuffJsonDiagnostics(
			JSON.stringify([
				{
					filename: "src/app.py",
					code: "F401",
					message: "imported but unused",
					location: { row: 1, column: 1 },
					end_location: { row: 1, column: 10 },
				},
			]),
		);
		const pyright = parsePyrightJsonDiagnostics(
			JSON.stringify({
				generalDiagnostics: [
					{
						file: "src/app.py",
						severity: "error",
						message: "Expression of type int is not assignable.",
						rule: "reportAssignmentType",
						range: {
							start: { line: 2, character: 4 },
							end: { line: 2, character: 8 },
						},
					},
				],
			}),
		);

		assert.equal(ruff[0].sourceId, "python.ruff");
		assert.equal(ruff[0].ruleId, "F401");
		assert.equal(ruff[0].range?.startLine, 1);
		assert.equal(pyright[0].sourceId, "python.pyright");
		assert.equal(pyright[0].severity, "error");
		assert.equal(pyright[0].range?.startLine, 3);
	});

	it("runs Python packs through injected command runners", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-python-run-"));
		try {
			await mkdir(join(root, ".venv", "bin"), { recursive: true });
			await writeFile(join(root, ".venv", "bin", "ruff"), "");
			const pack = createPythonRuffReviewPack({
				runCommand: async ({ command, args, cwd, timeoutMs }) => {
					assert.equal(command.endsWith("ruff"), true);
					assert.deepEqual(args, [
						"check",
						"--output-format=json",
						"src/app.py",
					]);
					assert.equal(cwd, root);
					assert.equal(timeoutMs, 4444);
					return {
						exitCode: 1,
						stdout: JSON.stringify([
							{
								filename: "src/app.py",
								code: "F401",
								message: "unused import",
								location: { row: 1, column: 1 },
							},
						]),
						stderr: "",
						durationMs: 7,
					};
				},
			});

			const report = await runLanguageReviewPacks([pack], {
				cwd: root,
				phase: "exit",
				changedPaths: ["src/app.py"],
				timeoutMs: 4444,
			});

			assert.equal(report.checks[0].status, "fail");
			assert.equal(report.diagnostics[0].ruleId, "F401");
			assert.equal(report.sources[0].id, "python.ruff");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("feeds Python diagnostics into Implementation exit review", async () => {
		const pyrightReport = await runLanguageReviewPacks(
			[
				createPythonPyrightReviewPack({
					detectCommand: () => ({
						tool: "pyright",
						command: "pyright",
						args: ["--outputjson", "src/app.py"],
						description: "test pyright",
					}),
					runCommand: async () => ({
						exitCode: 1,
						stdout: JSON.stringify({
							generalDiagnostics: [
								{
									file: "src/app.py",
									severity: "error",
									message: "Bad type.",
									rule: "reportAssignmentType",
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
				changedPaths: ["src/app.py"],
			},
		);
		const acceptanceReport = createImplementationEvidenceReport({
			phase: "exit",
			changedPaths: ["src/app.py"],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef: planningRef,
					criterionId: "AC-001",
					evidenceRefs: ["tests/execution/review/review-python-pack.test.mjs"],
				},
			],
		});

		const result = evaluateImplementationExit({
			planningRefs: [planningRef],
			acceptanceRequirements: [
				{
					planningRef,
					criterionId: "AC-001",
					text: "Python evidence is reviewed.",
				},
			],
			planningScopes: [
				{
					planningRef,
					workUnitId: "WU-python",
					componentRefs: [],
					pathScopes: ["src/app.py", "tests/test_app.py"],
					verification: ["pytest"],
				},
			],
			changes: [
				{
					id: "IC-python",
					planningRefs: [planningRef],
					codePaths: ["src/app.py"],
					docPaths: [],
					testPaths: ["tests/test_app.py"],
					publicationRefs: [],
					checks: ["pytest"],
					checkResults: [
						{
							command: "pytest",
							status: "pass",
							outputRef: "tests/test_app.py",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Python evidence is reviewed.",
							evidenceRefs: [
								"tests/execution/review/review-python-pack.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:python" },
					...implementationQualityFields(),
				},
			],
			reviewEvidenceReports: [pyrightReport, acceptanceReport],
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
