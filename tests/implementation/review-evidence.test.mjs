import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	blockingDiagnostics,
	classifyImplementationArtifact,
	createImplementationEvidenceReport,
	evidenceRefsForReport,
	isCodeBearingArtifact,
	mergeImplementationEvidenceReports,
} from "../../src/implementation/review/index.ts";

describe("implementation review evidence protocol", () => {
	it("classifies artifacts without assuming TypeScript", () => {
		const examples = new Map([
			["src/index.ts", ["source", "typescript", true, "implementation"]],
			["lib/main.py", ["source", "python", true, "implementation"]],
			["cmd/server/main.go", ["source", "go", true, "implementation"]],
			["crates/core/src/lib.rs", ["source", "rust", true, "implementation"]],
			["scripts/check.sh", ["source", "shell", true, "implementation"]],
			[
				"tests/implementation/review-evidence.test.mjs",
				["test", "javascript", true, "implementation"],
			],
			[
				".codewiki/kb/system/loop-contracts.md",
				["kb", "markdown", false, "decision"],
			],
			[
				".codewiki/traces/TRACE-owned-implementation-review-sprint.jsonl",
				["trace", "json", false, "trace"],
			],
			["README.md", ["docs", "markdown", false, "implementation"]],
			["package.json", ["package", "json", false, "implementation"]],
			["dist/index.js", ["generated", "javascript", false, "none"]],
			["node_modules/pkg/index.js", ["vendor", "javascript", false, "none"]],
		]);

		for (const [path, expected] of examples) {
			const artifact = classifyImplementationArtifact(path);
			assert.deepEqual(
				[
					artifact.kind,
					artifact.language,
					artifact.isCodeBearing,
					artifact.reviewOwner,
				],
				expected,
				path,
			);
		}
		assert.equal(isCodeBearingArtifact("src/index.ts"), true);
		assert.equal(isCodeBearingArtifact(".codewiki/kb/system/lab.md"), false);
	});

	it("normalizes common and language-specific evidence into one report", () => {
		const report = createImplementationEvidenceReport({
			id: "IER-001",
			phase: "fast",
			sources: [
				{
					id: "common.path-scope",
					kind: "common",
					layer: "common",
					summary: "Common scope checker.",
				},
				{
					id: "tsjs.tsc",
					kind: "language-pack",
					layer: "language-specific",
					language: "typescript",
					adapterId: "typescript",
				},
			],
			changedPaths: ["src/implementation/review/evidence-report.ts"],
			checks: [
				{
					command: "npm run typecheck",
					status: "pass",
					outputRef: "tests/implementation/review-evidence.test.mjs",
				},
			],
			diagnostics: [
				{
					path: "src/implementation/review/evidence-report.ts",
					severity: "error",
					message: "Example blocking diagnostic.",
					sourceId: "tsjs.tsc",
					ruleId: "TS0000",
					evidenceRefs: ["src/implementation/review/evidence-report.ts"],
				},
			],
			symbols: [
				{
					name: "createImplementationEvidenceReport",
					path: "src/implementation/review/evidence-report.ts",
					kind: "function",
					exported: true,
				},
			],
			dependencyEdges: [
				{
					from: "src/implementation/review/evidence-report.ts",
					to: "src/implementation/review/artifacts.ts",
					kind: "import",
				},
			],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef:
						"trace:TRACE-owned-implementation-review-sprint:planning:iteration:3#work:WU-common-evidence-protocol",
					criterionId: "AC-001",
					evidenceRefs: ["tests/implementation/review-evidence.test.mjs"],
				},
			],
		});

		assert.equal(report.phase, "fast");
		assert.deepEqual(report.languages, ["typescript"]);
		assert.equal(report.artifactClassifications[0].kind, "source");
		assert.equal(blockingDiagnostics(report).length, 1);
		assert.equal(
			report.sources.some((source) => source.layer === "common"),
			true,
		);
		assert.equal(
			report.sources.some((source) => source.layer === "language-specific"),
			true,
		);
		assert.equal(
			evidenceRefsForReport(report).includes(
				"tests/implementation/review-evidence.test.mjs",
			),
			true,
		);
	});

	it("merges common and language-specific reports without duplicate paths", () => {
		const common = createImplementationEvidenceReport({
			sources: [{ id: "common.scope", kind: "common", layer: "common" }],
			changedPaths: ["src/foo.ts"],
		});
		const tsjs = createImplementationEvidenceReport({
			sources: [
				{
					id: "tsjs.typecheck",
					kind: "language-pack",
					layer: "language-specific",
					language: "typescript",
				},
			],
			changedPaths: ["src/foo.ts", "tests/foo.test.ts"],
			checks: [{ command: "npm run typecheck", status: "pass" }],
		});

		const merged = mergeImplementationEvidenceReports([common, tsjs], {
			id: "merged",
			phase: "exit",
		});

		assert.deepEqual(merged.changedPaths, ["src/foo.ts", "tests/foo.test.ts"]);
		assert.deepEqual(merged.languages, ["typescript"]);
		assert.equal(merged.sources.length, 2);
		assert.equal(merged.checks[0].command, "npm run typecheck");
	});
});
