import { spawn } from "node:child_process";
import type { ImplementationLanguage } from "../artifacts.ts";
import type { ImplementationDiagnostic } from "../evidence-report.ts";
import { createImplementationEvidenceReport } from "../evidence-report.ts";
import type {
	ToolAdapter,
	ToolAdapterRunInput,
	ToolAvailability,
} from "../adapter.ts";
import { unavailableToolResult } from "../adapter.ts";

export interface CommandExecutionResult {
	exitCode?: number;
	stdout: string;
	stderr: string;
	timedOut?: boolean;
	durationMs?: number;
}

export type CommandRunner = (input: {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
	environment?: Record<string, string | undefined>;
	signal?: AbortSignal;
}) => Promise<CommandExecutionResult>;

export interface GenericCommandAdapterConfig {
	id: string;
	label?: string;
	command: string;
	args?: string[] | ((input: ToolAdapterRunInput) => string[]);
	languages?: ImplementationLanguage[];
	phases?: ToolAdapter["phases"];
	timeoutMs?: number;
	installHint?: string;
	detect?: (
		input: ToolAdapterRunInput,
	) => ToolAvailability | Promise<ToolAvailability>;
	runCommand?: CommandRunner;
	parseDiagnostics?: (input: {
		stdout: string;
		stderr: string;
		sourceId: string;
	}) => ImplementationDiagnostic[];
}

const defaultTimeoutMs = 3000;

export function createGenericCommandAdapter(
	config: GenericCommandAdapterConfig,
): ToolAdapter {
	const runCommand = config.runCommand || runShellFreeCommand;
	const phases = config.phases || ["fast", "exit"];
	const parseDiagnostics = config.parseDiagnostics || parseFileLineDiagnostics;
	return {
		id: config.id,
		label: config.label || config.id,
		languages: config.languages || [],
		phases,
		async detect(input) {
			if (config.detect) return config.detect(input);
			return {
				available: Boolean(config.command),
				command: config.command,
				installHint: config.installHint,
			};
		},
		async run(input) {
			const startedAt = Date.now();
			const availability = await this.detect(input);
			if (!availability.available) {
				return unavailableToolResult({
					adapterId: config.id,
					phase: input.phase,
					availability,
					durationMs: Date.now() - startedAt,
					report: {
						changedPaths: input.changedPaths,
						sources: [sourceFor(config.id, config.label, config.languages)],
					},
				});
			}
			const args =
				typeof config.args === "function"
					? config.args(input)
					: config.args || input.changedPaths || [];
			const execution = await runCommand({
				command: config.command,
				args,
				cwd: input.cwd,
				timeoutMs: input.timeoutMs ?? config.timeoutMs ?? defaultTimeoutMs,
				environment: input.environment,
				signal: input.signal,
			});
			const durationMs = execution.durationMs ?? Date.now() - startedAt;
			const diagnostics = parseDiagnostics({
				stdout: execution.stdout,
				stderr: execution.stderr,
				sourceId: config.id,
			});
			return {
				adapterId: config.id,
				phase: input.phase,
				availability,
				durationMs,
				exitCode: execution.exitCode,
				stdout: execution.stdout,
				stderr: execution.stderr,
				timedOut: execution.timedOut,
				report: createImplementationEvidenceReport({
					phase: input.phase,
					sources: [sourceFor(config.id, config.label, config.languages)],
					changedPaths: input.changedPaths,
					checks: [
						{
							command: [config.command, ...args].join(" ").trim(),
							status: checkStatusForExecution(execution),
							outputRef: input.changedPaths?.[0],
							summary: executionSummary(execution),
						},
					],
					diagnostics,
				}),
			};
		},
	};
}

export function parseFileLineDiagnostics(input: {
	stdout: string;
	stderr: string;
	sourceId: string;
}): ImplementationDiagnostic[] {
	return `${input.stdout}\n${input.stderr}`
		.split(/\r?\n/)
		.flatMap((line): ImplementationDiagnostic[] => {
			const match =
				/^(?<path>[^:\s][^:]*):(\d+)(?::(\d+))?[:\s]+(?<rest>.+)$/.exec(
					line.trim(),
				);
			if (!match?.groups) return [];
			const rest = match.groups.rest.trim();
			return [
				{
					path: match.groups.path,
					severity: severityFromText(rest),
					message: rest,
					sourceId: input.sourceId,
					range: {
						startLine: Number(match[2]),
						...(match[3] ? { startColumn: Number(match[3]) } : {}),
					},
				},
			];
		});
}

export function runShellFreeCommand(input: {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
	environment?: Record<string, string | undefined>;
	signal?: AbortSignal;
}): Promise<CommandExecutionResult> {
	return new Promise((resolve, reject) => {
		const startedAt = Date.now();
		const child = spawn(input.command, input.args, {
			cwd: input.cwd,
			env: { ...process.env, ...(input.environment || {}) },
			shell: false,
		});
		let stdout = "";
		let stderr = "";
		let finished = false;
		const timeout = setTimeout(() => {
			finished = true;
			child.kill("SIGTERM");
			resolve({
				stdout,
				stderr,
				timedOut: true,
				durationMs: Date.now() - startedAt,
			});
		}, input.timeoutMs);
		input.signal?.addEventListener("abort", () => {
			if (finished) return;
			finished = true;
			clearTimeout(timeout);
			child.kill("SIGTERM");
			resolve({
				stdout,
				stderr,
				timedOut: true,
				durationMs: Date.now() - startedAt,
			});
		});
		child.stdout?.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr?.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) => {
			if (finished) return;
			finished = true;
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (exitCode) => {
			if (finished) return;
			finished = true;
			clearTimeout(timeout);
			resolve({
				exitCode: exitCode ?? undefined,
				stdout,
				stderr,
				durationMs: Date.now() - startedAt,
			});
		});
	});
}

function sourceFor(
	id: string,
	label = id,
	languages: ImplementationLanguage[] = [],
) {
	return {
		id,
		kind: "tool" as const,
		layer:
			languages.length > 0
				? ("language-specific" as const)
				: ("common" as const),
		...(languages.length === 1 ? { language: languages[0] } : {}),
		summary: label,
	};
}

function checkStatusForExecution(execution: CommandExecutionResult) {
	if (execution.timedOut) return "blocked" as const;
	if (execution.exitCode === 0) return "pass" as const;
	return "fail" as const;
}

function executionSummary(execution: CommandExecutionResult): string {
	if (execution.timedOut)
		return "Command timed out before producing final evidence.";
	return execution.exitCode === 0
		? "Command completed successfully."
		: `Command exited with code ${execution.exitCode ?? "unknown"}.`;
}

function severityFromText(text: string): ImplementationDiagnostic["severity"] {
	if (/\berror\b/i.test(text)) return "error";
	if (/\bwarn(?:ing)?\b/i.test(text)) return "warning";
	if (/\bhint\b/i.test(text)) return "hint";
	return "info";
}
