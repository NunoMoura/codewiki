#!/usr/bin/env node
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type LabExperimentCommandName =
	| "visible_gate"
	| "pipeline_gate"
	| "objective"
	| "judge_calibration";

export type LabExperimentStatus = "pass" | "fail";

export interface LabExperimentOptions {
	repoRoot?: string;
	candidateDir?: string;
	holdoutFilePath?: string;
	judgeCalibrationFilePath?: string;
	allowRepoLocalSealedInputs?: boolean;
	keepWorktree?: boolean;
	commands?: LabExperimentCommandName[];
	env?: NodeJS.ProcessEnv;
}

export interface LabExperimentCommandReport {
	name: LabExperimentCommandName;
	status: LabExperimentStatus;
	exitCode: number;
	stdoutTail: string[];
	stderrTail: string[];
}

export interface LabExperimentReport {
	version: 1;
	status: LabExperimentStatus;
	worktree: {
		path: string;
		kept: boolean;
	};
	candidateFiles: string[];
	commands: LabExperimentCommandReport[];
	visible?: VisibleGateSummary;
	pipeline?: PipelineSummary;
	objective?: ObjectiveSummary;
	judgeCalibration?: JudgeCalibrationSummary;
	blockers: string[];
}

export interface VisibleGateSummary {
	status: LabExperimentStatus;
	metrics: Record<string, MetricSummary>;
}

export interface PipelineSummary extends MetricSummary {
	status: LabExperimentStatus;
}

export interface ObjectiveSummary {
	status: string;
	mode: string;
	score: number;
	components: Record<string, MetricSummary>;
	sealed: {
		provided: boolean;
		gateStatus?: string;
		caseCount: number;
		falsePasses: number;
		expectedPassRegressions: number;
	};
	blockerCount: number;
}

export interface JudgeCalibrationSummary {
	status: string;
	score: number;
	caseCount: number;
	falsePasses: number;
	overBlocks: number;
	blockerCount: number;
}

export interface MetricSummary {
	score: number;
	caseCount: number;
	falsePasses: number;
	expectedPassRegressions: number;
}

const ALLOWED_CANDIDATE_FILES = [
	"lab/decision/loop.ts",
	"lab/planning/loop.ts",
	"lab/implementation/loop.ts",
] as const;

const DEFAULT_COMMANDS: LabExperimentCommandName[] = [
	"visible_gate",
	"pipeline_gate",
	"objective",
];

export async function runLabExperiment(
	options: LabExperimentOptions = {},
): Promise<LabExperimentReport> {
	const repoRoot = resolve(options.repoRoot || process.cwd());
	const worktreePath = isolatedWorktreePath();
	const candidateFiles = options.candidateDir
		? findCandidateLoopFiles(options.candidateDir)
		: [];
	let report: LabExperimentReport | undefined;
	try {
		createIsolatedWorktree({ repoRoot, worktreePath });
		if (options.candidateDir) {
			applyCandidateLoopFiles({
				candidateDir: options.candidateDir,
				worktreePath,
				candidateFiles,
			});
		}
		const commands = options.commands || DEFAULT_COMMANDS;
		const commandReports: LabExperimentCommandReport[] = [];
		let visible: VisibleGateSummary | undefined;
		let pipeline: PipelineSummary | undefined;
		let objective: ObjectiveSummary | undefined;
		let judgeCalibration: JudgeCalibrationSummary | undefined;
		for (const command of commands) {
			const result = runExperimentCommand({
				command,
				worktreePath,
				options,
			});
			commandReports.push(result.report);
			if (command === "visible_gate") {
				visible = summarizeVisibleGate(result.json, result.report.status);
			}
			if (command === "pipeline_gate") {
				pipeline = summarizePipeline(result.json, result.report.status);
			}
			if (command === "objective") {
				objective = summarizeObjective(result.json);
			}
			if (command === "judge_calibration") {
				judgeCalibration = summarizeJudgeCalibration(result.json);
			}
		}
		const blockers = experimentBlockers({
			commands: commandReports,
			objective,
			judgeCalibration,
		});
		report = {
			version: 1,
			status: blockers.length === 0 ? "pass" : "fail",
			worktree: { path: worktreePath, kept: Boolean(options.keepWorktree) },
			candidateFiles,
			commands: commandReports,
			...(visible ? { visible } : {}),
			...(pipeline ? { pipeline } : {}),
			...(objective ? { objective } : {}),
			...(judgeCalibration ? { judgeCalibration } : {}),
			blockers,
		};
		return report;
	} finally {
		if (!options.keepWorktree)
			rmSync(worktreePath, { recursive: true, force: true });
	}
}

export function findCandidateLoopFiles(candidateDir: string): string[] {
	const root = resolve(candidateDir);
	if (!existsSync(root))
		throw new Error(`Candidate dir does not exist: ${root}`);
	const files = listFiles(root).map((filePath) =>
		normalizePath(relative(root, filePath)),
	);
	const unexpected = files.filter(
		(filePath) => !ALLOWED_CANDIDATE_FILES.includes(filePath as never),
	);
	if (unexpected.length > 0) {
		throw new Error(
			`Candidate dir may only contain ${ALLOWED_CANDIDATE_FILES.join(", ")}; unexpected: ${unexpected.join(", ")}`,
		);
	}
	return files.filter((filePath) =>
		ALLOWED_CANDIDATE_FILES.includes(filePath as never),
	);
}

function createIsolatedWorktree(input: {
	repoRoot: string;
	worktreePath: string;
}): void {
	mkdirSync(input.worktreePath, { recursive: true });
	for (const entry of [
		"package.json",
		"package-lock.json",
		"tsconfig.json",
		"tsconfig.build.json",
		"src",
		"lab",
		"tests",
	]) {
		const source = join(input.repoRoot, entry);
		if (!existsSync(source)) continue;
		const destination = join(input.worktreePath, entry);
		cpSync(source, destination, {
			recursive: true,
			filter: (sourcePath) => !sourcePath.includes(`${entry}/node_modules`),
		});
	}
	const sourceNodeModules = join(input.repoRoot, "node_modules");
	if (existsSync(sourceNodeModules)) {
		symlinkSync(
			sourceNodeModules,
			join(input.worktreePath, "node_modules"),
			"dir",
		);
	}
}

function applyCandidateLoopFiles(input: {
	candidateDir: string;
	worktreePath: string;
	candidateFiles: string[];
}): void {
	for (const filePath of input.candidateFiles) {
		const source = join(resolve(input.candidateDir), filePath);
		const destination = join(input.worktreePath, filePath);
		mkdirSync(resolve(destination, ".."), { recursive: true });
		writeFileSync(destination, readFileSync(source));
	}
}

function runExperimentCommand(input: {
	command: LabExperimentCommandName;
	worktreePath: string;
	options: LabExperimentOptions;
}): { report: LabExperimentCommandReport; json?: unknown } {
	const args = commandArgs(input.command, input.options);
	const result = spawnSync(process.execPath, args, {
		cwd: input.worktreePath,
		env: { ...process.env, ...(input.options.env || {}) },
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	const exitCode = result.status ?? 1;
	const stdout = result.stdout || "";
	const stderr = result.stderr || "";
	const sealed = sealedCommandOutput(input.command, input.options);
	return {
		report: {
			name: input.command,
			status: exitCode === 0 ? "pass" : "fail",
			exitCode,
			stdoutTail: sealed ? [] : tailLines(stdout),
			stderrTail: sealed ? [] : tailLines(stderr),
		},
		json: parseJson(stdout),
	};
}

function sealedCommandOutput(
	command: LabExperimentCommandName,
	options: LabExperimentOptions,
): boolean {
	return (
		(command === "objective" && Boolean(options.holdoutFilePath)) ||
		command === "judge_calibration"
	);
}

function commandArgs(
	command: LabExperimentCommandName,
	options: LabExperimentOptions,
): string[] {
	if (command === "visible_gate") {
		return [
			"--experimental-strip-types",
			"lab/runner/score.ts",
			"--gate",
			"--json",
		];
	}
	if (command === "pipeline_gate") {
		return [
			"--experimental-strip-types",
			"lab/pipeline/score.ts",
			"--gate",
			"--json",
		];
	}
	if (command === "objective") {
		return [
			"--experimental-strip-types",
			"lab/runner/objective.ts",
			"--json",
			...(options.holdoutFilePath
				? ["--file", options.holdoutFilePath, "--require-holdout"]
				: []),
			...(options.allowRepoLocalSealedInputs ? ["--allow-repo-local"] : []),
		];
	}
	return [
		"--experimental-strip-types",
		"lab/runner/judge-calibration.ts",
		"--json",
		...(options.judgeCalibrationFilePath
			? ["--file", options.judgeCalibrationFilePath]
			: []),
		...(options.allowRepoLocalSealedInputs ? ["--allow-repo-local"] : []),
	];
}

function summarizeVisibleGate(
	json: unknown,
	status: LabExperimentStatus,
): VisibleGateSummary | undefined {
	const record = objectRecord(json);
	if (!record) return undefined;
	const scores = objectRecord(record.scores);
	if (!scores) return undefined;
	return {
		status,
		metrics: Object.fromEntries(
			Object.entries(scores).map(([loop, score]) => [
				loop,
				metricSummary(score),
			]),
		),
	};
}

function summarizePipeline(
	json: unknown,
	status: LabExperimentStatus,
): PipelineSummary | undefined {
	const record = objectRecord(json);
	if (!record) return undefined;
	return { status, ...metricSummary(record) };
}

function summarizeObjective(json: unknown): ObjectiveSummary | undefined {
	const report = objectRecord(json);
	if (!report) return undefined;
	const components = objectRecord(report.components) || {};
	const hce = metricSummary(components.HCE);
	const hardGates = objectRecord(report.hardGates);
	const holdout = objectRecord(report.holdout);
	return {
		status: String(report.status || "unknown"),
		mode: String(report.mode || "unknown"),
		score: numberValue(report.score),
		components: Object.fromEntries(
			Object.entries(components).map(([metric, component]) => [
				metric,
				metricSummary(component),
			]),
		),
		sealed: {
			provided: Boolean(holdout),
			...(holdout?.gateStatus
				? { gateStatus: String(holdout.gateStatus) }
				: {}),
			caseCount: hce.caseCount,
			falsePasses: hce.falsePasses,
			expectedPassRegressions: hce.expectedPassRegressions,
		},
		blockerCount: Array.isArray(hardGates?.blockers)
			? hardGates.blockers.length
			: 0,
	};
}

function summarizeJudgeCalibration(
	json: unknown,
): JudgeCalibrationSummary | undefined {
	const report = objectRecord(json);
	if (!report) return undefined;
	return {
		status: String(report.status || "unknown"),
		score: numberValue(report.score),
		caseCount: numberValue(report.caseCount),
		falsePasses: numberValue(report.falsePasses),
		overBlocks: numberValue(report.overBlocks),
		blockerCount: Array.isArray(report.blockers) ? report.blockers.length : 0,
	};
}

function metricSummary(value: unknown): MetricSummary {
	const record = objectRecord(value) || {};
	return {
		score: numberValue(record.score),
		caseCount: numberValue(record.caseCount),
		falsePasses: numberValue(record.falsePasses),
		expectedPassRegressions: numberValue(record.expectedPassRegressions),
	};
}

function experimentBlockers(input: {
	commands: LabExperimentCommandReport[];
	objective?: ObjectiveSummary;
	judgeCalibration?: JudgeCalibrationSummary;
}): string[] {
	return [
		...input.commands
			.filter((command) => command.status !== "pass")
			.map(
				(command) =>
					`${command.name} failed with exit code ${command.exitCode}.`,
			),
		...(input.objective?.sealed.falsePasses
			? [
					`Sealed objective has ${input.objective.sealed.falsePasses} false pass(es).`,
				]
			: []),
		...(input.judgeCalibration?.falsePasses
			? [
					`Judge calibration has ${input.judgeCalibration.falsePasses} false pass(es).`,
				]
			: []),
	];
}

function listFiles(root: string): string[] {
	return readdirSync(root).flatMap((entry) => {
		const filePath = join(root, entry);
		const stat = lstatSync(filePath);
		return stat.isDirectory() ? listFiles(filePath) : [filePath];
	});
}

function isolatedWorktreePath(): string {
	return join(tmpdir(), `codewiki-experiment-${process.pid}-${Date.now()}`);
}

function parseJson(stdout: string): unknown | undefined {
	const trimmed = stdout.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start < 0 || end < start) return undefined;
		try {
			return JSON.parse(trimmed.slice(start, end + 1));
		} catch {
			return undefined;
		}
	}
}

function tailLines(value: string): string[] {
	return value.trim().split(/\r?\n/).filter(Boolean).slice(-12);
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizePath(value: string): string {
	return value.split("\\").join("/");
}

function parseExperimentArgs(argv: string[]): LabExperimentOptions & {
	json: boolean;
	gate: boolean;
} {
	return {
		candidateDir: stringFlag(argv, "--candidate-dir"),
		holdoutFilePath: stringFlag(argv, "--holdout"),
		judgeCalibrationFilePath: stringFlag(argv, "--judge-calibration"),
		allowRepoLocalSealedInputs: argv.includes("--allow-repo-local"),
		keepWorktree: argv.includes("--keep"),
		commands: commandFlags(argv),
		json: argv.includes("--json"),
		gate: argv.includes("--gate"),
	};
}

function commandFlags(argv: string[]): LabExperimentCommandName[] | undefined {
	const only = stringFlag(argv, "--only");
	if (!only) return undefined;
	const commands = only
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
	for (const command of commands) {
		if (
			!DEFAULT_COMMANDS.includes(command as LabExperimentCommandName) &&
			command !== "judge_calibration"
		) {
			throw new Error(`Unknown experiment command: ${command}`);
		}
	}
	return commands as LabExperimentCommandName[];
}

function stringFlag(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	if (index < 0) return undefined;
	return argv[index + 1];
}

function printExperimentReport(report: LabExperimentReport): void {
	console.log(`Experiment: ${report.status}`);
	console.log(
		`Candidate files: ${report.candidateFiles.join(", ") || "current"}`,
	);
	for (const command of report.commands) {
		console.log(`${command.status === "pass" ? "✓" : "✗"} ${command.name}`);
	}
	if (report.objective) {
		console.log(
			`Objective: ${report.objective.score} (${report.objective.mode}, ${report.objective.status})`,
		);
	}
	if (report.judgeCalibration) {
		console.log(
			`Judge calibration: ${report.judgeCalibration.score} (${report.judgeCalibration.status}, false pass ${report.judgeCalibration.falsePasses})`,
		);
	}
	for (const blocker of report.blockers) console.log(`  - ${blocker}`);
	if (report.worktree.kept)
		console.log(`Worktree kept: ${report.worktree.path}`);
}

async function main(argv = process.argv.slice(2)) {
	const args = parseExperimentArgs(argv);
	const report = await runLabExperiment(args);
	if (args.json) console.log(JSON.stringify(report, null, 2));
	else printExperimentReport(report);
	if (args.gate && report.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
