import { existsSync } from "node:fs";
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
import {
	parseFileLineDiagnostics,
	runShellFreeCommand,
} from "../adapters/generic-command.ts";
import type {
	LanguageReviewContext,
	LanguageReviewPack,
} from "../language-pack.ts";

export type PythonReviewTool = "ruff" | "pyright";

export interface PythonReviewCommand {
	tool: PythonReviewTool;
	command: string;
	args: string[];
	description: string;
}

export interface PythonReviewPackOptions {
	runFastCheck?: boolean;
	fastTimeoutMs?: number;
	exitTimeoutMs?: number;
	runCommand?: CommandRunner;
	detectCommand?: (
		context: LanguageReviewContext,
		phase: "fast" | "exit",
	) => PythonReviewCommand | undefined;
}

const ruffSourceId = "python.ruff";
const pyrightSourceId = "python.pyright";
const defaultFastTimeoutMs = 3000;
const defaultExitTimeoutMs = 15000;

export function createPythonRuffReviewPack(
	options: PythonReviewPackOptions = {},
): LanguageReviewPack {
	return pythonReviewPack({
		id: ruffSourceId,
		label: "Ruff review pack",
		tool: "ruff",
		options,
	});
}

export function createPythonPyrightReviewPack(
	options: PythonReviewPackOptions = {},
): LanguageReviewPack {
	return pythonReviewPack({
		id: pyrightSourceId,
		label: "Pyright review pack",
		tool: "pyright",
		options,
	});
}

export const pythonRuffReviewPack = createPythonRuffReviewPack();
export const pythonPyrightReviewPack = createPythonPyrightReviewPack();

export async function runPythonReviewCheck(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	tool: PythonReviewTool,
	options: PythonReviewPackOptions = {},
): Promise<ImplementationEvidenceReportInput> {
	const changedPaths = pythonPaths(context);
	const sourceId = sourceIdForTool(tool);
	if (changedPaths.length === 0) {
		return {
			...emptyPythonEvidence(context, phase, tool),
			checks: [
				{
					command: `${tool} check`,
					status: "not-run",
					phase: "verify",
					summary: `${tool} not run: no changed Python files matched this pack.`,
				},
			],
		};
	}
	const detected = options.detectCommand
		? options.detectCommand(context, phase)
		: detectPythonReviewCommand(context.cwd, tool, changedPaths);
	if (!detected) {
		return {
			phase,
			changedPaths,
			sources: [pythonPackSource(tool)],
			checks: [
				{
					command: `${tool} check`,
					status: "not-run",
					phase: "verify",
					outputRef: changedPaths[0],
					summary: `${tool} not run: command not found in .venv/bin, venv/bin, node_modules/.bin, or PATH.`,
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
		sources: [pythonPackSource(tool, detected.description)],
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
		diagnostics: parsePythonDiagnostics(
			`${execution.stdout}\n${execution.stderr}`,
			tool,
			sourceId,
		),
		metadata: {
			command,
			durationMs: execution.durationMs,
			timedOut: execution.timedOut === true,
			tool,
		},
	};
}

export function detectPythonReviewCommand(
	cwd: string,
	tool: PythonReviewTool,
	changedPaths: string[] = [],
): PythonReviewCommand | undefined {
	const paths = changedPaths.length > 0 ? changedPaths : ["."];
	const binary = pythonToolBinary(cwd, tool);
	if (!binary) return undefined;
	return tool === "ruff"
		? {
				tool,
				command: binary,
				args: ["check", "--output-format=json", ...paths],
				description: "project-local Ruff",
			}
		: {
				tool,
				command: binary,
				args: ["--outputjson", ...paths],
				description: "project-local Pyright",
			};
}

export function parsePythonDiagnostics(
	output: string,
	tool: PythonReviewTool,
	sourceId = sourceIdForTool(tool),
): ImplementationDiagnostic[] {
	const parsed =
		tool === "ruff"
			? parseRuffJsonDiagnostics(output, sourceId)
			: parsePyrightJsonDiagnostics(output, sourceId);
	return parsed.length > 0
		? parsed
		: parseFileLineDiagnostics({ stdout: output, stderr: "", sourceId });
}

export function parseRuffJsonDiagnostics(
	output: string,
	sourceId = ruffSourceId,
): ImplementationDiagnostic[] {
	const parsed = safeJson(output);
	if (!Array.isArray(parsed)) return [];
	return parsed.flatMap((entry): ImplementationDiagnostic[] => {
		const item = record(entry);
		const path = text(item.filename);
		const message = text(item.message);
		if (!path || !message) return [];
		const location = record(item.location);
		const endLocation = record(item.end_location);
		return [
			{
				path,
				severity: "error",
				message,
				sourceId,
				ruleId: text(item.code) || undefined,
				language: "python",
				range: {
					startLine: number(location.row),
					startColumn: number(location.column),
					endLine: number(endLocation.row),
					endColumn: number(endLocation.column),
				},
			},
		];
	});
}

export function parsePyrightJsonDiagnostics(
	output: string,
	sourceId = pyrightSourceId,
): ImplementationDiagnostic[] {
	const parsed = record(safeJson(output));
	return array(parsed.generalDiagnostics).flatMap((entry) => {
		const item = record(entry);
		const path = text(item.file);
		const message = text(item.message);
		if (!path || !message) return [];
		const range = record(item.range);
		const start = record(range.start);
		const end = record(range.end);
		return [
			{
				path,
				severity: severityFromPyright(item.severity),
				message,
				sourceId,
				ruleId: text(item.rule) || undefined,
				language: "python" as const,
				range: {
					startLine: oneBased(number(start.line)),
					startColumn: oneBased(number(start.character)),
					endLine: oneBased(number(end.line)),
					endColumn: oneBased(number(end.character)),
				},
			},
		];
	});
}

function pythonReviewPack(input: {
	id: string;
	label: string;
	tool: PythonReviewTool;
	options: PythonReviewPackOptions;
}): LanguageReviewPack {
	return {
		id: input.id,
		label: input.label,
		languages: ["python"],
		fastChecks(context) {
			return input.options.runFastCheck === true
				? runPythonReviewCheck(context, "fast", input.tool, input.options)
				: emptyPythonEvidence(context, "fast", input.tool);
		},
		exitEvidence(context) {
			return runPythonReviewCheck(context, "exit", input.tool, input.options);
		},
	};
}

function emptyPythonEvidence(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	tool: PythonReviewTool,
): ImplementationEvidenceReportInput {
	return {
		phase,
		changedPaths: pythonPaths(context),
		sources: [pythonPackSource(tool)],
	};
}

function pythonPaths(context: LanguageReviewContext): string[] {
	return context.changedPaths.filter((path) => path.endsWith(".py"));
}

function pythonPackSource(
	tool: PythonReviewTool,
	summary = `${tool} review pack.`,
) {
	return {
		id: sourceIdForTool(tool),
		kind: "language-pack" as const,
		layer: "language-specific" as const,
		language: "python" as const,
		summary,
	};
}

function sourceIdForTool(tool: PythonReviewTool): string {
	return tool === "ruff" ? ruffSourceId : pyrightSourceId;
}

function pythonToolBinary(
	cwd: string,
	tool: PythonReviewTool,
): string | undefined {
	const names =
		process.platform === "win32" ? [`${tool}.exe`, `${tool}.cmd`] : [tool];
	const roots = [
		join(cwd, ".venv", process.platform === "win32" ? "Scripts" : "bin"),
		join(cwd, "venv", process.platform === "win32" ? "Scripts" : "bin"),
		join(cwd, "node_modules", ".bin"),
	];
	for (const root of roots) {
		for (const name of names) {
			const candidate = join(root, name);
			if (existsSync(candidate)) return candidate;
		}
	}
	return executableFromPath(tool);
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
	options: PythonReviewPackOptions,
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

function safeJson(output: string): unknown {
	try {
		return JSON.parse(output);
	} catch {
		return undefined;
	}
}

function severityFromPyright(
	value: unknown,
): ImplementationDiagnostic["severity"] {
	const severity = text(value).toLowerCase();
	if (severity === "error") return "error";
	if (severity === "warning") return "warning";
	if (severity === "information") return "info";
	return "hint";
}

function oneBased(value: number | undefined): number | undefined {
	return value === undefined ? undefined : value + 1;
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
