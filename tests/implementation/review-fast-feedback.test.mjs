import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCommonFastFeedback } from "../../src/implementation/review/index.ts";

describe("implementation common fast feedback", () => {
	it("blocks source edits outside active path scope", () => {
		const result = runCommonFastFeedback({
			changedPaths: ["src/outside.ts"],
			pathScopes: ["src/implementation/review/"],
		});

		assert.equal(result.status, "block");
		assert.equal(result.findings[0].kind, "path-scope");
		assert.equal(result.evidenceReport.phase, "fast");
		assert.equal(result.evidenceReport.diagnostics[0].ruleId, "path-scope");
		assert.match(result.findings[0].message, /outside/);
	});

	it("blocks generated, vendored, and secret-like edits", () => {
		const result = runCommonFastFeedback({
			changedPaths: ["dist/index.js", "src/config.ts"],
			contentByPath: {
				"src/config.ts": `const apiKey = '${"x".repeat(24)}';`,
			},
		});

		assert.equal(result.status, "block");
		assert.equal(
			result.findings.some((finding) => finding.kind === "forbidden-path"),
			true,
		);
		assert.equal(
			result.findings.some((finding) => finding.kind === "secret-like-content"),
			true,
		);
	});

	it("turns blocking diagnostics from adapters into fast blocks", () => {
		const result = runCommonFastFeedback({
			changedPaths: ["src/index.ts"],
			evidenceReport: {
				diagnostics: [
					{
						path: "src/index.ts",
						severity: "error",
						message: "Type error.",
						ruleId: "TS2322",
					},
				],
			},
		});

		assert.equal(result.status, "block");
		assert.equal(result.findings[0].kind, "blocking-diagnostic");
		assert.match(result.findings[0].message, /TS2322/);
	});

	it("warns for KB and trace artifacts instead of treating them as code", () => {
		const result = runCommonFastFeedback({
			changedPaths: [
				".codewiki/kb/system/components/loop-contracts.md",
				".codewiki/traces/TRACE-owned-implementation-review-sprint.jsonl",
			],
		});

		assert.equal(result.status, "warn");
		assert.equal(result.findings.length, 2);
		assert.equal(
			result.findings.every((finding) => finding.kind === "artifact-routing"),
			true,
		);
	});

	it("passes clean scoped code-bearing edits", () => {
		const result = runCommonFastFeedback({
			changedPaths: ["src/implementation/review/fast-feedback.ts"],
			pathScopes: ["src/implementation/review/"],
			contentByPath: {
				"src/implementation/review/fast-feedback.ts": "export const ok = true;",
			},
		});

		assert.equal(result.status, "pass");
		assert.deepEqual(result.findings, []);
		assert.equal(result.evidenceReport.checks[0].status, "pass");
		assert.equal(result.artifactClassifications[0].isCodeBearing, true);
	});
});
