import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateImplementationExit } from "../../../src/loops/implementation/loop.ts";
import {
	createImplementationEvidenceReport,
	createJavaScriptLintReviewPack,
	createTypeScriptReviewPack,
	detectJavaScriptLintCommand,
	detectTypeScriptCheckCommand,
	mergeImplementationEvidenceReports,
	parseEslintJsonDiagnostics,
	parseJavaScriptLintDiagnostics,
	parseTypeScriptDiagnostics,
	reviewPackSelectionForPolicy,
	runCommonFastFeedback,
	runLanguageReviewPacks,
	selectLanguageReviewPacks,
	summarizeReviewEvidenceReports,
	typeScriptReviewPack,
} from "../../../src/execution/review/index.ts";
import { implementationQualityFields } from "../../helpers/implementation-change.mjs";

describe("implementation language-specific review packs", () => {
	it("selects packs by changed path language", () => {
		const selected = selectLanguageReviewPacks(
			[typeScriptReviewPack],
			["src/index.ts", "README.md"],
		);
		assert.deepEqual(
			selected.map((pack) => pack.id),
			["tsjs.typescript"],
		);

		const none = selectLanguageReviewPacks(
			[typeScriptReviewPack],
			["src/main.py"],
		);
		assert.deepEqual(none, []);
	});

	it("auto-detects matching packs for multi-language changes without project config", () => {
		const selection = reviewPackSelectionForPolicy({}, [
			"src/index.ts",
			"service/app.py",
			"cmd/server/main.go",
			"crates/core/src/lib.rs",
			"scripts/build.sh",
			"README.md",
		]);

		assert.deepEqual(
			selection.selectedPacks.map((pack) => pack.id),
			[
				"tsjs.typescript",
				"tsjs.lint",
				"python.ruff",
				"python.pyright",
				"go.test",
				"go.vet",
				"rust.cargo-test",
				"rust.cargo-clippy",
				"shell.shellcheck",
			],
		);
		assert.deepEqual(selection.skippedPacks, []);
	});

	it("merges decision evidence policy required packs into selection", () => {
		const selection = reviewPackSelectionForPolicy(
			{ enabledPacks: ["tsjs.lint"], disabledPacks: ["tsjs.typescript"] },
			["src/index.ts"],
			{},
			{
				id: "evidence.fix",
				requiredClasses: ["review_evidence"],
				requiredReviewPacks: ["tsjs.typescript"],
				acceptanceLinksRequired: true,
				allowFastCacheForAcceptance: false,
			},
		);

		assert.deepEqual(
			selection.selectedPacks.map((pack) => pack.id),
			["tsjs.typescript", "tsjs.lint"],
		);
		assert.equal(
			selection.skippedPacks.some(
				(pack) => pack.id === "tsjs.typescript" && pack.reason === "disabled",
			),
			false,
		);
	});

	it("summarizes skipped packs and not-run reasons", async () => {
		const skippedReport = await runLanguageReviewPacks([typeScriptReviewPack], {
			cwd: process.cwd(),
			phase: "exit",
			changedPaths: ["src/main.py"],
		});
		const skippedSummary = summarizeReviewEvidenceReports([skippedReport]);
		assert.equal(skippedSummary.skippedPacks[0].id, "tsjs.typescript");
		assert.equal(skippedSummary.skippedPacks[0].reason, "no-matching-files");

		const root = await mkdtemp(join(tmpdir(), "codewiki-tsjs-missing-"));
		try {
			const notRunReport = await runLanguageReviewPacks(
				[typeScriptReviewPack],
				{
					cwd: root,
					phase: "exit",
					changedPaths: ["src/index.ts"],
				},
			);
			const notRunSummary = summarizeReviewEvidenceReports([notRunReport]);
			assert.equal(notRunSummary.packRuns[0].status, "not-run");
			assert.match(
				notRunSummary.packRuns[0].summary,
				/missing package\.json scripts\.typecheck/,
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("runs TS/JS fast checks as language-specific evidence", async () => {
		const pack = createTypeScriptReviewPack({
			fastDiagnostics: [
				{
					path: "src/index.ts",
					severity: "error",
					message: "Type mismatch.",
					ruleId: "TS2322",
					sourceId: "tsjs.typescript",
				},
			],
		});

		const report = await runLanguageReviewPacks([pack], {
			cwd: process.cwd(),
			phase: "fast",
			changedPaths: ["src/index.ts", "README.md"],
		});

		assert.equal(report.phase, "fast");
		assert.deepEqual(report.languages, ["markdown", "typescript"]);
		assert.equal(report.sources[0].layer, "language-specific");
		assert.equal(report.diagnostics[0].ruleId, "TS2322");
	});

	it("runs TS/JS exit evidence from package-script checks", async () => {
		const pack = createTypeScriptReviewPack({
			exitChecks: [
				{
					command: "npm run typecheck",
					status: "pass",
					outputRef: "tsconfig.json",
				},
			],
		});

		const report = await runLanguageReviewPacks([pack], {
			cwd: process.cwd(),
			phase: "exit",
			changedPaths: ["src/index.ts"],
		});

		assert.equal(report.phase, "exit");
		assert.equal(report.checks[0].command, "npm run typecheck");
		assert.equal(report.sources[0].layer, "language-specific");
	});

	it("parses TypeScript compiler diagnostics", () => {
		const diagnostics = parseTypeScriptDiagnostics(`
			src/index.ts(1,7): error TS2322: Type 'string' is not assignable.
			src/other.ts:2:4 - warning TS6133: 'value' is declared but never read.
		`);

		assert.equal(diagnostics.length, 2);
		assert.equal(diagnostics[0].path, "src/index.ts");
		assert.equal(diagnostics[0].severity, "error");
		assert.equal(diagnostics[0].ruleId, "TS2322");
		assert.equal(diagnostics[0].range?.startLine, 1);
		assert.equal(diagnostics[1].severity, "warning");
		assert.equal(diagnostics[1].ruleId, "TS6133");
	});

	it("detects package typecheck scripts and runs under budget", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-tsjs-"));
		try {
			await writeFile(
				join(root, "package.json"),
				JSON.stringify({ scripts: { typecheck: "tsc --noEmit" } }),
			);
			const detected = detectTypeScriptCheckCommand(root);
			assert.equal(detected?.description, "npm typecheck script");
			assert.deepEqual(detected?.args, ["--silent", "run", "typecheck"]);

			const pack = createTypeScriptReviewPack({
				runCommand: async ({ command, args, cwd, timeoutMs }) => {
					assert.equal(command, detected?.command);
					assert.deepEqual(args, detected?.args);
					assert.equal(cwd, root);
					assert.equal(timeoutMs, 1234);
					return {
						exitCode: 1,
						stdout: "src/index.ts(1,7): error TS2322: Type mismatch.\n",
						stderr: "",
						durationMs: 20,
					};
				},
			});

			const report = await runLanguageReviewPacks([pack], {
				cwd: root,
				phase: "exit",
				changedPaths: ["src/index.ts"],
				timeoutMs: 1234,
			});

			assert.equal(report.checks[0].status, "fail");
			assert.match(report.checks[0].command, /npm.*typecheck/);
			assert.equal(report.diagnostics[0].ruleId, "TS2322");
			assert.equal(report.metadata.timedOut, false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("feeds TypeScript diagnostics into Implementation exit review", async () => {
		const planningRef =
			"trace:TRACE-tsjs-review:planning:iteration:1#work:WU-tsjs";
		const pack = createTypeScriptReviewPack({
			detectCommand: () => ({
				command: "npm",
				args: ["run", "typecheck"],
				description: "test typecheck",
			}),
			runCommand: async () => ({
				exitCode: 1,
				stdout: "src/index.ts(1,7): error TS2322: Type mismatch.\n",
				stderr: "",
				durationMs: 5,
			}),
		});
		const tsjsReport = await runLanguageReviewPacks([pack], {
			cwd: process.cwd(),
			phase: "exit",
			changedPaths: ["src/index.ts"],
		});
		const acceptanceLinkReport = createImplementationEvidenceReport({
			phase: "exit",
			changedPaths: ["src/index.ts"],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef: planningRef,
					criterionId: "AC-001",
					evidenceRefs: ["tests/execution/review/review-language-pack.test.mjs"],
				},
			],
		});

		const result = evaluateImplementationExit({
			planningRefs: [planningRef],
			acceptanceRequirements: [
				{
					planningRef,
					criterionId: "AC-001",
					text: "TypeScript evidence is reviewed.",
				},
			],
			planningScopes: [
				{
					planningRef,
					workUnitId: "WU-tsjs",
					componentRefs: [],
					pathScopes: ["src/index.ts", "tests/index.test.ts"],
					verification: ["npm run typecheck"],
				},
			],
			changes: [
				{
					id: "IC-tsjs",
					planningRefs: [planningRef],
					codePaths: ["src/index.ts"],
					docPaths: [],
					testPaths: ["tests/index.test.ts"],
					publicationRefs: [],
					checks: ["npm run typecheck"],
					checkResults: [
						{
							command: "npm run typecheck",
							status: "pass",
							outputRef: "tests/index.test.ts",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "TypeScript evidence is reviewed.",
							evidenceRefs: [
								"tests/execution/review/review-language-pack.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:tsjs" },
					...implementationQualityFields(),
				},
			],
			reviewEvidenceReports: [tsjsReport, acceptanceLinkReport],
		});

		assert.equal(result.passed, false);
		assert.equal(
			result.issues.some(
				(issue) => issue.code === "review_blocking_diagnostic",
			),
			true,
		);
	});

	it("detects and runs ESLint/Biome lint evidence", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-jslint-"));
		try {
			await writeFile(
				join(root, "package.json"),
				JSON.stringify({ scripts: { lint: "eslint src/index.ts" } }),
			);
			const detected = detectJavaScriptLintCommand(root, ["src/index.ts"]);
			assert.equal(detected?.tool, "eslint");
			assert.deepEqual(detected?.args, [
				"--silent",
				"run",
				"lint",
				"--",
				"--format",
				"json",
			]);

			const pack = createJavaScriptLintReviewPack({
				runCommand: async ({ timeoutMs }) => {
					assert.equal(timeoutMs, 2222);
					return {
						exitCode: 1,
						stdout: JSON.stringify([
							{
								filePath: "src/index.ts",
								messages: [
									{
										severity: 2,
										message: "Unexpected any.",
										ruleId: "@typescript-eslint/no-explicit-any",
										line: 3,
										column: 5,
									},
								],
							},
						]),
						stderr: "",
						durationMs: 10,
					};
				},
			});
			const report = await runLanguageReviewPacks([pack], {
				cwd: root,
				phase: "exit",
				changedPaths: ["src/index.ts"],
				timeoutMs: 2222,
			});

			assert.equal(report.checks[0].status, "fail");
			assert.equal(report.diagnostics[0].sourceId, "tsjs.lint");
			assert.equal(
				report.diagnostics[0].ruleId,
				"@typescript-eslint/no-explicit-any",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("parses ESLint and Biome lint diagnostics", () => {
		const eslintDiagnostics = parseEslintJsonDiagnostics(
			JSON.stringify([
				{
					filePath: "src/index.ts",
					messages: [
						{
							severity: 1,
							message: "Prefer const.",
							ruleId: "prefer-const",
							line: 2,
							column: 1,
						},
					],
				},
			]),
		);
		const biomeDiagnostics = parseJavaScriptLintDiagnostics(
			JSON.stringify({
				diagnostics: [
					{
						severity: "error",
						description: "Biome lint failure.",
						location: { path: "src/index.ts" },
						category: { name: "lint/style/useConst" },
					},
				],
			}),
			"biome",
		);

		assert.equal(eslintDiagnostics[0].severity, "warning");
		assert.equal(eslintDiagnostics[0].ruleId, "prefer-const");
		assert.equal(biomeDiagnostics[0].severity, "error");
		assert.equal(biomeDiagnostics[0].ruleId, "lint/style/useConst");
	});

	it("combines common and language-specific findings in one review report", async () => {
		const common = createImplementationEvidenceReport({
			phase: "fast",
			changedPaths: ["src/index.ts"],
			sources: [{ id: "common.scope", kind: "common", layer: "common" }],
		});
		const tsjs = await runLanguageReviewPacks(
			[
				createTypeScriptReviewPack({
					fastDiagnostics: [
						{
							path: "src/index.ts",
							severity: "error",
							message: "Type mismatch.",
							sourceId: "tsjs.typescript",
						},
					],
				}),
			],
			{
				cwd: process.cwd(),
				phase: "fast",
				changedPaths: ["src/index.ts"],
			},
		);
		const merged = mergeImplementationEvidenceReports([common, tsjs], {
			phase: "fast",
		});
		const feedback = runCommonFastFeedback({
			changedPaths: ["src/index.ts"],
			pathScopes: ["src/"],
			evidenceReport: merged,
		});

		assert.equal(
			merged.sources.some((source) => source.layer === "common"),
			true,
		);
		assert.equal(
			merged.sources.some((source) => source.layer === "language-specific"),
			true,
		);
		assert.equal(feedback.status, "block");
		assert.equal(feedback.findings[0].kind, "blocking-diagnostic");
	});
});
