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

export type GoReviewTool = "test" | "vet";

export interface GoReviewCommand {
	tool: GoReviewTool;
	command: string;
	args: string[];
	description: string;
}

export interface GoReviewPackOptions {
	runFastCheck?: boolean;
	fastTimeoutMs?: number;
	exitTimeoutMs?: number;
	runCommand?: CommandRunner;
	detectCommand?: (
		context: LanguageReviewContext,
		phase: "fast" | "exit",
	) => GoReviewCommand | undefined;
}

const goTestSourceId = "go.test";
const goVetSourceId = "go.vet";
const defaultFastTimeoutMs = 3000;
const defaultExitTimeoutMs = 15000;

export function createGoTestReviewPack(
	options: GoReviewPackOptions = {},
): LanguageReviewPack {
	return goReviewPack({
		id: goTestSourceId,
		label: "Go test review pack",
		tool: "test",
		options,
	});
}

export function createGoVetReviewPack(
	options: GoReviewPackOptions = {},
): LanguageReviewPack {
	return goReviewPack({
		id: goVetSourceId,
		label: "Go vet review pack",
		tool: "vet",
		options,
	});
}

export const goTestReviewPack = createGoTestReviewPack();
export const goVetReviewPack = createGoVetReviewPack();

export async function runGoReviewCheck(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	tool: GoReviewTool,
	options: GoReviewPackOptions = {},
): Promise<ImplementationEvidenceReportInput> {
	const changedPaths = goPaths(context);
	const sourceId = sourceIdForTool(tool);
	if (changedPaths.length === 0) {
		return {
			...emptyGoEvidence(context, phase, tool),
			checks: [
				{
					command: `go ${tool}`,
					status: "not-run",
					phase: "verify",
					summary: `go ${tool} not run: no changed Go files or Go module files matched this pack.`,
				},
			],
		};
	}
	const detected = options.detectCommand
		? options.detectCommand(context, phase)
		: detectGoReviewCommand(context.cwd, tool);
	if (!detected) {
		return {
			phase,
			changedPaths,
			sources: [goPackSource(tool)],
			checks: [
				{
					command: `go ${tool}`,
					status: "not-run",
					phase: "verify",
					outputRef: changedPaths[0],
					summary: `go ${tool} not run: go executable not found on PATH.`,
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
		sources: [goPackSource(tool, detected.description)],
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
		diagnostics: parseGoDiagnostics(
			`${execution.stdout}\n${execution.stderr}`,
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

export function detectGoReviewCommand(
	_cwd: string,
	tool: GoReviewTool,
): GoReviewCommand | undefined {
	const binary = executableFromPath("go");
	if (!binary) return undefined;
	return {
		tool,
		command: binary,
		args: [tool, "./..."],
		description: tool === "test" ? "go test" : "go vet",
	};
}

export function parseGoDiagnostics(
	output: string,
	sourceId = goTestSourceId,
): ImplementationDiagnostic[] {
	return output
		.split(/\r?\n/)
		.flatMap((rawLine): ImplementationDiagnostic[] => {
			const line = stripAnsi(rawLine).trim();
			if (!line) return [];
			const match =
				/^(?<path>(?:\.\/)?[^:\s].*?\.go):(?<line>\d+)(?::(?<column>\d+))?:\s*(?<message>.+)$/.exec(
					line,
				);
			if (!match?.groups) return [];
			return [
				{
					path: normalizeGoPath(match.groups.path),
					severity: "error",
					message: match.groups.message.trim(),
					sourceId,
					language: "go",
					range: {
						startLine: Number(match.groups.line),
						...(match.groups.column
							? { startColumn: Number(match.groups.column) }
							: {}),
					},
				},
			];
		});
}

function goReviewPack(input: {
	id: string;
	label: string;
	tool: GoReviewTool;
	options: GoReviewPackOptions;
}): LanguageReviewPack {
	return {
		id: input.id,
		label: input.label,
		languages: ["go"],
		fastChecks(context) {
			return input.options.runFastCheck === true
				? runGoReviewCheck(context, "fast", input.tool, input.options)
				: emptyGoEvidence(context, "fast", input.tool);
		},
		exitEvidence(context) {
			return runGoReviewCheck(context, "exit", input.tool, input.options);
		},
	};
}

function emptyGoEvidence(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	tool: GoReviewTool,
): ImplementationEvidenceReportInput {
	return {
		phase,
		changedPaths: goPaths(context),
		sources: [goPackSource(tool)],
	};
}

function goPaths(context: LanguageReviewContext): string[] {
	return context.changedPaths.filter(
		(path) =>
			path.endsWith(".go") ||
			path.endsWith("go.mod") ||
			path.endsWith("go.sum"),
	);
}

function goPackSource(tool: GoReviewTool, summary = `${tool} review pack.`) {
	return {
		id: sourceIdForTool(tool),
		kind: "language-pack" as const,
		layer: "language-specific" as const,
		language: "go" as const,
		summary,
	};
}

function sourceIdForTool(tool: GoReviewTool): string {
	return tool === "test" ? goTestSourceId : goVetSourceId;
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
	options: GoReviewPackOptions,
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

function normalizeGoPath(path: string): string {
	return path.replace(/^\.\//, "");
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}
