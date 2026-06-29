import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "../../types.ts";
import type {
	ImplementationDiagnostic,
	ImplementationEvidenceReportInput,
} from "../evidence-report.ts";
import type {
	CommandExecutionResult,
	CommandRunner,
} from "../adapters/generic-command.ts";
import { runShellFreeCommand } from "../adapters/generic-command.ts";
import type {
	LanguageReviewContext,
	LanguageReviewPack,
} from "../language-pack.ts";

export interface TypeScriptCheckCommand {
	command: string;
	args: string[];
	description: string;
}

export interface TypeScriptReviewPackOptions {
	fastDiagnostics?: ImplementationDiagnostic[];
	exitChecks?: CheckResult[];
	exitDiagnostics?: ImplementationDiagnostic[];
	runFastCheck?: boolean;
	fastTimeoutMs?: number;
	exitTimeoutMs?: number;
	runCommand?: CommandRunner;
	detectCommand?: (
		context: LanguageReviewContext,
		phase: "fast" | "exit",
	) => TypeScriptCheckCommand | undefined;
}

const sourceId = "tsjs.typescript";
const defaultFastTimeoutMs = 3000;
const defaultExitTimeoutMs = 15000;

export function createTypeScriptReviewPack(
	options: TypeScriptReviewPackOptions = {},
): LanguageReviewPack {
	return {
		id: sourceId,
		label: "TypeScript/JavaScript review pack",
		languages: ["typescript", "javascript"],
		async fastChecks(context) {
			if (options.fastDiagnostics) {
				return injectedEvidence(context, "fast", {
					diagnostics: options.fastDiagnostics,
				});
			}
			if (options.runFastCheck !== true) {
				return injectedEvidence(context, "fast", {});
			}
			return runTypeScriptCheck(context, "fast", options);
		},
		async exitEvidence(context) {
			if (options.exitChecks || options.exitDiagnostics) {
				return injectedEvidence(context, "exit", {
					checks: options.exitChecks,
					diagnostics: options.exitDiagnostics,
				});
			}
			return runTypeScriptCheck(context, "exit", options);
		},
	};
}

export const typeScriptReviewPack = createTypeScriptReviewPack();

export async function runTypeScriptCheck(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	options: TypeScriptReviewPackOptions = {},
): Promise<ImplementationEvidenceReportInput> {
	const changedPaths = tsjsPaths(context);
	if (changedPaths.length === 0) {
		return injectedEvidence(context, phase, {
			checks: [
				{
					command: "typescript check",
					status: "not-run",
					phase: "verify",
					summary:
						"TypeScript check not run: no changed TypeScript or JavaScript files matched this pack.",
				},
			],
		});
	}
	const detected = options.detectCommand
		? options.detectCommand(context, phase)
		: detectTypeScriptCheckCommand(context.cwd);
	if (!detected) {
		return {
			phase,
			changedPaths,
			sources: [typescriptPackSource()],
			checks: [
				{
					command: "typescript check",
					status: "not-run",
					phase: "verify",
					outputRef: changedPaths[0],
					summary:
						"TypeScript check not run: missing package.json scripts.typecheck and project-local node_modules/typescript/bin/tsc.",
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
		sources: [typescriptPackSource(detected.description)],
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
		diagnostics: parseTypeScriptDiagnostics(
			`${execution.stdout}\n${execution.stderr}`,
		),
		metadata: {
			command,
			durationMs: execution.durationMs,
			timedOut: execution.timedOut === true,
		},
	};
}

export function detectTypeScriptCheckCommand(
	cwd: string,
): TypeScriptCheckCommand | undefined {
	const packageJson = readPackageJson(cwd);
	if (packageJson?.scripts?.typecheck) {
		return {
			command: npmCommand(),
			args: ["--silent", "run", "typecheck"],
			description: "npm typecheck script",
		};
	}
	const localTsc = join(cwd, "node_modules", "typescript", "bin", "tsc");
	if (existsSync(localTsc)) {
		return {
			command: process.execPath,
			args: [localTsc, "--noEmit", "--pretty", "false"],
			description: "project-local TypeScript compiler",
		};
	}
	return undefined;
}

export function parseTypeScriptDiagnostics(
	output: string,
): ImplementationDiagnostic[] {
	return output
		.split(/\r?\n/)
		.flatMap((rawLine): ImplementationDiagnostic[] => {
			const line = stripAnsi(rawLine).trim();
			if (!line) return [];
			const parsed = parseParenDiagnostic(line) || parseColonDiagnostic(line);
			if (!parsed) return [];
			return [parsed];
		});
}

function injectedEvidence(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	input: {
		checks?: CheckResult[];
		diagnostics?: ImplementationDiagnostic[];
	},
): ImplementationEvidenceReportInput {
	const paths = tsjsPaths(context);
	return {
		phase,
		changedPaths: paths,
		sources: [typescriptPackSource()],
		checks: input.checks || [],
		diagnostics: (input.diagnostics || []).filter((diagnostic) =>
			paths.includes(diagnostic.path),
		),
	};
}

function parseParenDiagnostic(
	line: string,
): ImplementationDiagnostic | undefined {
	const match =
		/^(?<path>.+?)\((?<line>\d+),(?<column>\d+)\):\s+(?<severity>error|warning)\s+(?<rule>TS\d+):\s+(?<message>.+)$/i.exec(
			line,
		);
	return diagnosticFromMatch(match);
}

function parseColonDiagnostic(
	line: string,
): ImplementationDiagnostic | undefined {
	const match =
		/^(?<path>.+?):(?<line>\d+):(?<column>\d+)\s+-\s+(?<severity>error|warning)\s+(?<rule>TS\d+):\s+(?<message>.+)$/i.exec(
			line,
		);
	return diagnosticFromMatch(match);
}

function diagnosticFromMatch(
	match: RegExpExecArray | null,
): ImplementationDiagnostic | undefined {
	if (!match?.groups) return undefined;
	return {
		path: match.groups.path.trim(),
		severity: severityFromText(match.groups.severity),
		message: match.groups.message.trim(),
		sourceId,
		ruleId: match.groups.rule,
		language: languageFromPath(match.groups.path),
		range: {
			startLine: Number(match.groups.line),
			startColumn: Number(match.groups.column),
		},
	};
}

function tsjsPaths(context: LanguageReviewContext): string[] {
	return context.changedPaths.filter((path) => /\.[cm]?[jt]sx?$/.test(path));
}

function typescriptPackSource(summary = "TypeScript/JavaScript review pack.") {
	return {
		id: sourceId,
		kind: "language-pack" as const,
		layer: "language-specific" as const,
		summary,
	};
}

function timeoutForPhase(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	options: TypeScriptReviewPackOptions,
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

function npmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function severityFromText(text: string): ImplementationDiagnostic["severity"] {
	return /^error$/i.test(text) ? "error" : "warning";
}

function languageFromPath(path: string): "typescript" | "javascript" {
	return /\.tsx?$/.test(path) ? "typescript" : "javascript";
}

function stripAnsi(value: string): string {
	return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}
