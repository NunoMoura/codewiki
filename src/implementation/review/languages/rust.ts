import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
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

export type RustReviewTool = "test" | "clippy";

export interface RustReviewCommand {
	tool: RustReviewTool;
	command: string;
	args: string[];
	description: string;
}

export interface RustReviewPackOptions {
	runFastCheck?: boolean;
	fastTimeoutMs?: number;
	exitTimeoutMs?: number;
	runCommand?: CommandRunner;
	detectCommand?: (
		context: LanguageReviewContext,
		phase: "fast" | "exit",
	) => RustReviewCommand | undefined;
}

const cargoTestSourceId = "rust.cargo-test";
const cargoClippySourceId = "rust.cargo-clippy";
const defaultFastTimeoutMs = 3000;
const defaultExitTimeoutMs = 15000;

export function createRustCargoTestReviewPack(
	options: RustReviewPackOptions = {},
): LanguageReviewPack {
	return rustReviewPack({
		id: cargoTestSourceId,
		label: "Cargo test review pack",
		tool: "test",
		options,
	});
}

export function createRustCargoClippyReviewPack(
	options: RustReviewPackOptions = {},
): LanguageReviewPack {
	return rustReviewPack({
		id: cargoClippySourceId,
		label: "Cargo clippy review pack",
		tool: "clippy",
		options,
	});
}

export const rustCargoTestReviewPack = createRustCargoTestReviewPack();
export const rustCargoClippyReviewPack = createRustCargoClippyReviewPack();

export async function runRustReviewCheck(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	tool: RustReviewTool,
	options: RustReviewPackOptions = {},
): Promise<ImplementationEvidenceReportInput> {
	const changedPaths = rustPaths(context);
	const sourceId = sourceIdForTool(tool);
	if (changedPaths.length === 0) {
		return {
			...emptyRustEvidence(context, phase, tool),
			checks: [
				{
					command: tool === "test" ? "cargo test" : "cargo clippy",
					status: "not-run",
					phase: "verify",
					summary: `${tool === "test" ? "cargo test" : "cargo clippy"} not run: no changed Rust files or Cargo manifest files matched this pack.`,
				},
			],
		};
	}
	const detected = options.detectCommand
		? options.detectCommand(context, phase)
		: detectRustReviewCommand(context.cwd, tool, changedPaths);
	if (!detected) {
		return {
			phase,
			changedPaths,
			sources: [rustPackSource(tool)],
			checks: [
				{
					command: tool === "test" ? "cargo test" : "cargo clippy",
					status: "not-run",
					phase: "verify",
					outputRef: changedPaths[0],
					summary: `${tool === "test" ? "cargo test" : "cargo clippy"} not run: cargo executable or Cargo.toml manifest was not detected.`,
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
		sources: [rustPackSource(tool, detected.description)],
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
		diagnostics: parseRustDiagnostics(
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

export function detectRustReviewCommand(
	cwd: string,
	tool: RustReviewTool,
	changedPaths: string[] = [],
): RustReviewCommand | undefined {
	const cargo = executableFromPath("cargo");
	if (!cargo) return undefined;
	const manifestPath = findCargoManifest(cwd, changedPaths);
	if (!manifestPath) return undefined;
	const manifestArgs =
		manifestPath === "Cargo.toml" ? [] : ["--manifest-path", manifestPath];
	return tool === "test"
		? {
				tool,
				command: cargo,
				args: ["test", ...manifestArgs, "--message-format=json"],
				description: "cargo test",
			}
		: {
				tool,
				command: cargo,
				args: [
					"clippy",
					...manifestArgs,
					"--all-targets",
					"--all-features",
					"--message-format=json",
				],
				description: "cargo clippy",
			};
}

export function parseRustDiagnostics(
	output: string,
	sourceId = cargoTestSourceId,
): ImplementationDiagnostic[] {
	const jsonDiagnostics = parseCargoJsonDiagnostics(output, sourceId);
	return jsonDiagnostics.length > 0
		? jsonDiagnostics
		: parseRustTextDiagnostics(output, sourceId);
}

export function parseCargoJsonDiagnostics(
	output: string,
	sourceId = cargoTestSourceId,
): ImplementationDiagnostic[] {
	return output.split(/\r?\n/).flatMap((line): ImplementationDiagnostic[] => {
		const event = record(safeJson(line));
		if (event.reason !== "compiler-message") return [];
		const message = record(event.message);
		const spans = array(message.spans).map(record);
		const span =
			spans.find((candidate) => candidate.is_primary === true) || spans[0];
		const path = text(span?.file_name);
		if (!path) return [];
		return [
			{
				path,
				severity: severityFromRustLevel(message.level),
				message: text(message.message) || "Rust compiler diagnostic.",
				sourceId,
				ruleId: text(record(message.code).code) || undefined,
				language: "rust",
				range: {
					startLine: number(span.line_start),
					startColumn: number(span.column_start),
					endLine: number(span.line_end),
					endColumn: number(span.column_end),
				},
			},
		];
	});
}

export function parseRustTextDiagnostics(
	output: string,
	sourceId = cargoTestSourceId,
): ImplementationDiagnostic[] {
	const diagnostics: ImplementationDiagnostic[] = [];
	let pending:
		| {
				severity: ImplementationDiagnostic["severity"];
				message: string;
				ruleId?: string;
		  }
		| undefined;
	for (const rawLine of output.split(/\r?\n/)) {
		const line = stripAnsi(rawLine).trim();
		const header =
			/^(?<severity>error|warning)(?:\[(?<rule>[^\]]+)\])?:\s*(?<message>.+)$/i.exec(
				line,
			);
		if (header?.groups) {
			pending = {
				severity: severityFromRustLevel(header.groups.severity),
				message: header.groups.message.trim(),
				...(header.groups.rule ? { ruleId: header.groups.rule } : {}),
			};
			continue;
		}
		const arrow = /^-->\s+(?<path>.+?\.rs):(?<line>\d+):(?<column>\d+)/.exec(
			line,
		);
		if (arrow?.groups) {
			diagnostics.push({
				path: arrow.groups.path,
				severity: pending?.severity || "error",
				message: pending?.message || "Rust compiler diagnostic.",
				sourceId,
				ruleId: pending?.ruleId,
				language: "rust",
				range: {
					startLine: Number(arrow.groups.line),
					startColumn: Number(arrow.groups.column),
				},
			});
			continue;
		}
		const panic =
			/^thread .+ panicked at (?<path>.+?\.rs):(?<line>\d+):(?<column>\d+)/.exec(
				line,
			);
		if (panic?.groups) {
			diagnostics.push({
				path: panic.groups.path,
				severity: "error",
				message: "Rust test panic.",
				sourceId,
				language: "rust",
				range: {
					startLine: Number(panic.groups.line),
					startColumn: Number(panic.groups.column),
				},
			});
		}
	}
	return diagnostics;
}

function rustReviewPack(input: {
	id: string;
	label: string;
	tool: RustReviewTool;
	options: RustReviewPackOptions;
}): LanguageReviewPack {
	return {
		id: input.id,
		label: input.label,
		languages: ["rust"],
		fastChecks(context) {
			return input.options.runFastCheck === true
				? runRustReviewCheck(context, "fast", input.tool, input.options)
				: emptyRustEvidence(context, "fast", input.tool);
		},
		exitEvidence(context) {
			return runRustReviewCheck(context, "exit", input.tool, input.options);
		},
	};
}

function emptyRustEvidence(
	context: LanguageReviewContext,
	phase: "fast" | "exit",
	tool: RustReviewTool,
): ImplementationEvidenceReportInput {
	return {
		phase,
		changedPaths: rustPaths(context),
		sources: [rustPackSource(tool)],
	};
}

function rustPaths(context: LanguageReviewContext): string[] {
	return context.changedPaths.filter(
		(path) =>
			path.endsWith(".rs") ||
			path.endsWith("Cargo.toml") ||
			path.endsWith("Cargo.lock"),
	);
}

function rustPackSource(
	tool: RustReviewTool,
	summary = `${tool} review pack.`,
) {
	return {
		id: sourceIdForTool(tool),
		kind: "language-pack" as const,
		layer: "language-specific" as const,
		language: "rust" as const,
		summary,
	};
}

function sourceIdForTool(tool: RustReviewTool): string {
	return tool === "test" ? cargoTestSourceId : cargoClippySourceId;
}

function findCargoManifest(
	cwd: string,
	changedPaths: string[],
): string | undefined {
	if (existsSync(join(cwd, "Cargo.toml"))) return "Cargo.toml";
	const candidates = Array.from(
		new Set(changedPaths.flatMap((path) => cargoManifestCandidates(path))),
	);
	return candidates.find((candidate) => existsSync(join(cwd, candidate)));
}

function cargoManifestCandidates(path: string): string[] {
	const normalized = path.replace(/\\/g, "/");
	if (normalized.endsWith("Cargo.toml")) return [normalized];
	const candidates: string[] = [];
	let current = dirname(normalized).replace(/\\/g, "/");
	while (current && current !== ".") {
		candidates.push(join(current, "Cargo.toml").replace(/\\/g, "/"));
		const next = dirname(current).replace(/\\/g, "/");
		if (next === current) break;
		current = next;
	}
	return candidates;
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
	options: RustReviewPackOptions,
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

function severityFromRustLevel(
	value: unknown,
): ImplementationDiagnostic["severity"] {
	const level = text(value).toLowerCase();
	if (level === "error" || level === "failure") return "error";
	if (level === "warning") return "warning";
	if (level === "help") return "hint";
	return "info";
}

function safeJson(output: string): unknown {
	try {
		return JSON.parse(output);
	} catch {
		return undefined;
	}
}

function stripAnsi(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
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
