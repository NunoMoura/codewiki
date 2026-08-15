import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "../../../loops/implementation/types.ts";
import type {
	ImplementationDiagnostic,
	ImplementationEvidenceReportInput,
} from "../evidence-report.ts";
import type {
	CommandExecutionResult,
	CommandRunner,
} from "../adapters/generic-command.ts";
import {
	parseFileLineDiagnostics,
	runShellFreeCommand,
} from "../adapters/generic-command.ts";
import type {
	LanguageReviewContext,
	LanguageReviewPack,
} from "../language-pack.ts";

export type JavaScriptLintTool = "eslint" | "biome" | "lint-script";

export interface JavaScriptLintCommand {
	tool: JavaScriptLintTool;
	command: string;
	args: string[];
	description: string;
}

export interface JavaScriptLintReviewPackOptions {
	runFastCheck?: boolean;
	fastTimeoutMs?: number;
	exitTimeoutMs?: number;
	runCommand?: CommandRunner;
	detectCommand?: (
		context: LanguageReviewContext,
		phase: "fast" | "exit",
	) => JavaScriptLintCommand | undefined;
}

const sourceId = "tsjs.lint";
const defaultFastTimeoutMs = 3000;
const defaultExitTimeoutMs = 15000;

export function createJavaScriptLintReviewPack(
	options: JavaScriptLintReviewPackOptions = {},
): LanguageReviewPack {
	return {
		id: sourceId,
		label: "Biome/ESLint review pack",
		languages: ["typescript", "javascript"],
		fastChecks(context) {
			return options.runFastCheck === true
				? runJavaScriptLintCheck(context, "fast", options)
				: emptyLintEvidence(context, "fast");
		},
		exitEvidence(context) {
			return runJavaScriptLintCheck(context, "exit", options);
		},
	};
}

export const javaScriptLintReviewPack = createJavaScriptLintReviewPack();

export async function runJavaScriptLintCheck(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	options: JavaScriptLintReviewPackOptions = {},
): Promise<ImplementationEvidenceReportInput> {
	const changedPaths = tsjsPaths(context);
	if (changedPaths.length === 0) {
		return {
			...emptyLintEvidence(context, phase),
			checks: [
				{
					command: "javascript lint",
					status: "not-run",
					phase: "verify",
					summary:
						"JavaScript lint not run: no changed TypeScript or JavaScript files matched this pack.",
				},
			],
		};
	}
	const detected = options.detectCommand
		? options.detectCommand(context, phase)
		: detectJavaScriptLintCommand(context.cwd, changedPaths);
	if (!detected) {
		return {
			phase,
			changedPaths,
			sources: [lintPackSource()],
			checks: [
				{
					command: "javascript lint",
					status: "not-run",
					phase: "verify",
					outputRef: changedPaths[0],
					summary:
						"JavaScript lint not run: missing project-local ESLint/Biome binary and package.json lint script using ESLint or Biome.",
				},
			],
		};
	}
	const runCommand = options.runCommand || runShellFreeCommand;
	const execution = await runCommand({
		command: detected.command,
		args: detected.args,
		cwd: context.cwd,
		timeoutMs: timeoutForPhase(context, phase, options),
	});
	const command = [detected.command, ...detected.args].join(" ").trim();
	return {
		phase,
		changedPaths,
		sources: [lintPackSource(detected.description)],
		checks: [
			{
				command,
				status: statusForExecution(execution),
				phase: "verify",
				outputRef: changedPaths[0],
				exitCode: execution.exitCode,
				summary: summaryForExecution(execution, detected.description),
			},
		],
		diagnostics: parseJavaScriptLintDiagnostics(
			`${execution.stdout}\n${execution.stderr}`,
			detected.tool,
		),
		metadata: {
			command,
			durationMs: execution.durationMs,
			timedOut: execution.timedOut === true,
			tool: detected.tool,
		},
	};
}

export function detectJavaScriptLintCommand(
	cwd: string,
	changedPaths: string[] = [],
): JavaScriptLintCommand | undefined {
	const paths = changedPaths.length > 0 ? changedPaths : ["."];
	const eslintBin = localBin(cwd, "eslint");
	if (eslintBin) {
		return {
			tool: "eslint",
			command: eslintBin,
			args: ["--format", "json", ...paths],
			description: "project-local ESLint",
		};
	}
	const biomeBin = localBin(cwd, "biome");
	if (biomeBin) {
		return {
			tool: "biome",
			command: biomeBin,
			args: ["check", "--reporter=json", ...paths],
			description: "project-local Biome",
		};
	}
	const lintScript = readPackageJson(cwd)?.scripts?.lint;
	if (/\beslint\b/.test(lintScript || "")) {
		return {
			tool: "eslint",
			command: npmCommand(),
			args: ["--silent", "run", "lint", "--", "--format", "json"],
			description: "npm ESLint lint script",
		};
	}
	if (/\bbiome\b/.test(lintScript || "")) {
		return {
			tool: "biome",
			command: npmCommand(),
			args: ["--silent", "run", "lint", "--", "--reporter=json"],
			description: "npm Biome lint script",
		};
	}
	return undefined;
}

export function parseJavaScriptLintDiagnostics(
	output: string,
	tool: JavaScriptLintTool,
): ImplementationDiagnostic[] {
	return tool === "eslint"
		? parseEslintJsonDiagnostics(output)
		: parseBiomeJsonDiagnostics(output).concat(
				parseFileLineDiagnostics({ stdout: output, stderr: "", sourceId }),
			);
}

export function parseEslintJsonDiagnostics(
	output: string,
): ImplementationDiagnostic[] {
	const parsed = safeJson(output);
	if (!Array.isArray(parsed)) return [];
	return parsed.flatMap((fileResult): ImplementationDiagnostic[] => {
		const file = record(fileResult);
		const path = text(file.filePath);
		return array(file.messages).flatMap((messageRecord) => {
			const message = record(messageRecord);
			const textMessage = text(message.message);
			if (!path || !textMessage) return [];
			return [
				{
					path,
					severity: Number(message.severity) === 2 ? "error" : "warning",
					message: textMessage,
					sourceId,
					ruleId: text(message.ruleId) || undefined,
					language: languageFromPath(path),
					range: {
						startLine: number(message.line),
						startColumn: number(message.column),
					},
				},
			];
		});
	});
}

export function parseBiomeJsonDiagnostics(
	output: string,
): ImplementationDiagnostic[] {
	const parsed = record(safeJson(output));
	return array(parsed.diagnostics).flatMap((diagnosticRecord) => {
		const diagnostic = record(diagnosticRecord);
		const location = record(diagnostic.location);
		const path =
			text(location.path) ||
			text(record(location.resource).path) ||
			text(record(location.resource).filename);
		const message = text(diagnostic.description) || text(diagnostic.message);
		if (!path || !message) return [];
		return [
			{
				path,
				severity: biomeSeverity(diagnostic.severity),
				message,
				sourceId,
				ruleId: text(record(diagnostic.category).name) || undefined,
				language: languageFromPath(path),
			},
		];
	});
}

function emptyLintEvidence(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
): ImplementationEvidenceReportInput {
	return {
		phase,
		changedPaths: tsjsPaths(context),
		sources: [lintPackSource()],
	};
}

function tsjsPaths(context: LanguageReviewContext): string[] {
	return context.changedPaths.filter((path) => /\.[cm]?[jt]sx?$/.test(path));
}

function lintPackSource(summary = "Biome/ESLint review pack.") {
	return {
		id: sourceId,
		kind: "language-pack" as const,
		layer: "language-specific" as const,
		summary,
	};
}

function localBin(cwd: string, name: string): string | undefined {
	const binary = join(
		cwd,
		"node_modules",
		".bin",
		process.platform === "win32" ? `${name}.cmd` : name,
	);
	return existsSync(binary) ? binary : undefined;
}

function timeoutForPhase(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	options: JavaScriptLintReviewPackOptions,
): number {
	return (
		context.timeoutMs ||
		(phase === "fast" ? options.fastTimeoutMs : options.exitTimeoutMs) ||
		(phase === "fast" ? defaultFastTimeoutMs : defaultExitTimeoutMs)
	);
}

function statusForExecution(
	execution: CommandExecutionResult,
): CheckResult["status"] {
	if (execution.timedOut) return "blocked";
	return execution.exitCode === 0 ? "pass" : "fail";
}

function summaryForExecution(
	execution: CommandExecutionResult,
	description: string,
): string {
	if (execution.timedOut) return `${description} timed out.`;
	return execution.exitCode === 0
		? `${description} passed.`
		: `${description} failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function readPackageJson(
	cwd: string,
): { scripts?: Record<string, string> } | undefined {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(join(cwd, "package.json"), "utf8"),
		);
		return typeof parsed === "object" && parsed !== null
			? (parsed as { scripts?: Record<string, string> })
			: undefined;
	} catch {
		return undefined;
	}
}

function safeJson(output: string): unknown {
	try {
		return JSON.parse(output);
	} catch {
		return undefined;
	}
}

function biomeSeverity(value: unknown): ImplementationDiagnostic["severity"] {
	return text(value).toLowerCase() === "error" ? "error" : "warning";
}

function languageFromPath(path: string): "typescript" | "javascript" {
	return /\.tsx?$/.test(path) ? "typescript" : "javascript";
}

function npmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function array(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}
