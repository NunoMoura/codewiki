import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	adapterSupportsPhase,
	createGenericCommandAdapter,
	createSarifEvidenceReport,
	parseFileLineDiagnostics,
	sarifDiagnosticsFromJson,
} from "../../../src/execution/review/index.ts";

describe("implementation review adapter foundation", () => {
	it("runs generic commands through injected runners and normalizes diagnostics", async () => {
		const adapter = createGenericCommandAdapter({
			id: "fake-linter",
			label: "Fake Linter",
			command: "fake-linter",
			languages: ["typescript"],
			phases: ["fast", "exit"],
			runCommand: async ({ command, args, cwd, timeoutMs }) => {
				assert.equal(command, "fake-linter");
				assert.deepEqual(args, ["src/example.ts"]);
				assert.equal(typeof cwd, "string");
				assert.equal(timeoutMs, 3000);
				return {
					exitCode: 1,
					stdout: "src/example.ts:2:3 error Example failure\n",
					stderr: "",
					durationMs: 12,
				};
			},
		});

		const result = await adapter.run({
			cwd: process.cwd(),
			phase: "fast",
			changedPaths: ["src/example.ts"],
		});

		assert.equal(adapterSupportsPhase(adapter, "fast"), true);
		assert.equal(result.adapterId, "fake-linter");
		assert.equal(result.exitCode, 1);
		assert.equal(result.report.phase, "fast");
		assert.equal(result.report.checks[0].status, "fail");
		assert.equal(result.report.diagnostics[0].severity, "error");
		assert.equal(result.report.diagnostics[0].language, "typescript");
		assert.equal(result.report.sources[0].layer, "language-specific");
	});

	it("returns unavailable adapter evidence without invoking command runner", async () => {
		const adapter = createGenericCommandAdapter({
			id: "missing-tool",
			command: "missing-tool",
			detect: () => ({
				available: false,
				command: "missing-tool",
				reason: "tool not installed",
				installHint: "Install missing-tool.",
			}),
			runCommand: async () => {
				throw new Error("runner should not execute unavailable tools");
			},
		});

		const result = await adapter.run({
			cwd: process.cwd(),
			phase: "exit",
			changedPaths: ["src/example.ts"],
		});

		assert.equal(result.availability.available, false);
		assert.equal(result.report.changedPaths[0], "src/example.ts");
		assert.equal(result.report.diagnostics.length, 0);
	});

	it("parses generic file-line diagnostics", () => {
		const diagnostics = parseFileLineDiagnostics({
			sourceId: "generic",
			stdout: "src/a.py:4:2 warning unused import\nnotes without path",
			stderr: "src/b.go:8 error compile failed",
		});

		assert.equal(diagnostics.length, 2);
		assert.equal(diagnostics[0].path, "src/a.py");
		assert.equal(diagnostics[0].severity, "warning");
		assert.equal(diagnostics[0].range?.startLine, 4);
		assert.equal(diagnostics[0].range?.startColumn, 2);
		assert.equal(diagnostics[1].path, "src/b.go");
		assert.equal(diagnostics[1].severity, "error");
	});

	it("ingests SARIF diagnostics as normalized evidence", () => {
		const sarif = {
			runs: [
				{
					results: [
						{
							ruleId: "no-hardcoded-secret",
							level: "error",
							message: { text: "Hardcoded secret found." },
							locations: [
								{
									physicalLocation: {
										artifactLocation: { uri: "src/secret.ts" },
										region: { startLine: 10, startColumn: 5 },
									},
								},
							],
						},
					],
				},
			],
		};

		const diagnostics = sarifDiagnosticsFromJson(sarif, {
			sourceId: "semgrep",
			language: "typescript",
		});
		assert.equal(diagnostics.length, 1);
		assert.equal(diagnostics[0].ruleId, "no-hardcoded-secret");
		assert.equal(diagnostics[0].severity, "error");

		const report = createSarifEvidenceReport(JSON.stringify(sarif), {
			sourceId: "semgrep",
			phase: "exit",
			language: "typescript",
			changedPaths: ["src/secret.ts"],
		});
		assert.equal(report.sources[0].layer, "language-specific");
		assert.equal(report.diagnostics[0].path, "src/secret.ts");
		assert.deepEqual(report.languages, ["typescript"]);
	});
});
