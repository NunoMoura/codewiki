import { existsSync } from "node:fs";
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
import { runShellFreeCommand } from "../adapters/generic-command.ts";
import type {
	LanguageReviewContext,
	LanguageReviewPack,
} from "../language-pack.ts";

export interface ShellcheckReviewCommand {
	command: string;
	args: string[];
	description: string;
}

export interface ShellcheckReviewPackOptions {
	runFastCheck?: boolean;
	fastTimeoutMs?: number;
	exitTimeoutMs?: number;
	runCommand?: CommandRunner;
	detectCommand?: (
		context: LanguageReviewContext,
		phase: "fast" | "exit",
	) => ShellcheckReviewCommand | undefined;
}

const shellcheckSourceId = "shell.shellcheck";
const defaultFastTimeoutMs = 3000;
const defaultExitTimeoutMs = 15000;

export function createShellcheckReviewPack(
	options: ShellcheckReviewPackOptions = {},
): LanguageReviewPack {
	return {
		id: shellcheckSourceId,
		label: "ShellCheck review pack",
		languages: ["shell"],
		fastChecks(context) {
			return options.runFastCheck === true
				? runShellcheckReviewCheck(context, "fast", options)
				: emptyShellEvidence(context, "fast");
		},
		exitEvidence(context) {
			return runShellcheckReviewCheck(context, "exit", options);
		},
	};
}

export const shellcheckReviewPack = createShellcheckReviewPack();

export async function runShellcheckReviewCheck(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	options: ShellcheckReviewPackOptions = {},
): Promise<ImplementationEvidenceReportInput> {
	const changedPaths = shellcheckPaths(context);
	if (changedPaths.length === 0) {
		return {
			...emptyShellEvidence(context, phase),
			checks: [
				{
					command: "shellcheck --format=json",
					status: "not-run",
					phase: "verify",
					summary:
						"ShellCheck not run: no changed shell script files matched this pack.",
				},
			],
		};
	}
	const detected = options.detectCommand
		? options.detectCommand(context, phase)
		: detectShellcheckReviewCommand(context.cwd, changedPaths);
	if (!detected) {
		return {
			phase,
			changedPaths,
			sources: [shellcheckSource()],
			checks: [
				{
					command: "shellcheck --format=json",
					status: "not-run",
					phase: "verify",
					outputRef: changedPaths[0],
					summary:
						"ShellCheck not run: shellcheck executable not found in node_modules/.bin or PATH.",
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
		sources: [shellcheckSource(detected.description)],
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
		diagnostics: parseShellcheckJsonDiagnostics(
			`${execution.stdout}\n${execution.stderr}`,
		),
		metadata: {
			command,
			durationMs: execution.durationMs,
			timedOut: execution.timedOut === true,
			tool: "shellcheck",
		},
	};
}

export function detectShellcheckReviewCommand(
	cwd: string,
	changedPaths: string[] = [],
): ShellcheckReviewCommand | undefined {
	const paths = changedPaths.length > 0 ? changedPaths : ["."];
	const binary = shellcheckBinary(cwd);
	if (!binary) return undefined;
	return {
		command: binary,
		args: ["--format=json", ...paths],
		description: "ShellCheck",
	};
}

export function parseShellcheckJsonDiagnostics(
	output: string,
	sourceId = shellcheckSourceId,
): ImplementationDiagnostic[] {
	const parsed = record(safeJsonObject(output));
	return array(parsed.comments).flatMap((entry): ImplementationDiagnostic[] => {
		const item = record(entry);
		const path = text(item.file);
		const message = text(item.message);
		if (!path || !message) return [];
		return [
			{
				path,
				severity: severityFromShellcheck(item.level),
				message,
				sourceId,
				ruleId: codeFromShellcheck(item.code),
				language: "shell",
				range: {
					startLine: number(item.line),
					startColumn: number(item.column),
					endLine: number(item.endLine),
					endColumn: number(item.endColumn),
				},
			},
		];
	});
}

function emptyShellEvidence(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
): ImplementationEvidenceReportInput {
	return {
		phase,
		changedPaths: shellcheckPaths(context),
		sources: [shellcheckSource()],
	};
}

function shellcheckPaths(context: LanguageReviewContext): string[] {
	return context.changedPaths.filter((path) =>
		/\.(sh|bash|dash|ksh|zsh)$/.test(path.toLowerCase()),
	);
}

function shellcheckSource(summary = "ShellCheck review pack.") {
	return {
		id: shellcheckSourceId,
		kind: "language-pack" as const,
		layer: "language-specific" as const,
		language: "shell" as const,
		summary,
	};
}

function shellcheckBinary(cwd: string): string | undefined {
	const names =
		process.platform === "win32"
			? ["shellcheck.exe", "shellcheck.cmd"]
			: ["shellcheck"];
	const localRoot = join(cwd, "node_modules", ".bin");
	for (const name of names) {
		const candidate = join(localRoot, name);
		if (existsSync(candidate)) return candidate;
	}
	return executableFromPath("shellcheck");
}

function executableFromPath(command: string): string | undefined {
	const pathValue = process.env.PATH || "";
	const extensions =
		process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
	for (const root of pathValue.split(
		process.platform === "win32" ? ";" : ":",
	)) {
		for (const extension of extensions) {
			const candidate = join(root, `${command}${extension}`);
			if (existsSync(candidate)) return candidate;
		}
	}
	return undefined;
}

function timeoutForPhase(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	options: ShellcheckReviewPackOptions,
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

function severityFromShellcheck(
	value: unknown,
): ImplementationDiagnostic["severity"] {
	const level = text(value).toLowerCase();
	if (level === "error") return "error";
	if (level === "warning") return "warning";
	if (level === "info") return "info";
	return "hint";
}

function codeFromShellcheck(value: unknown): string | undefined {
	if (typeof value === "number" && Number.isInteger(value)) return `SC${value}`;
	const code = text(value);
	return code ? (code.startsWith("SC") ? code : `SC${code}`) : undefined;
}

function safeJsonObject(output: string): unknown {
	const trimmed = output.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start < 0 || end <= start) return undefined;
		try {
			return JSON.parse(trimmed.slice(start, end + 1));
		} catch {
			return undefined;
		}
	}
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
