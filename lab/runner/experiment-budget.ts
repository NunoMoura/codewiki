#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { LAB_LOOP_CANDIDATE_FILES } from "./contract.ts";
import {
	findCandidateLoopFiles,
	runLabExperiment,
	type JudgeCalibrationSummary,
	type LabExperimentCommandName,
	type LabExperimentOptions,
	type LabExperimentReport,
	type LabExperimentStatus,
	type ObjectiveSummary,
	type PipelineSummary,
	type VisibleGateSummary,
} from "./experiment-runner.ts";

export type AutoExperimentRunStatus = LabExperimentStatus | "skipped";
export type AutoExperimentSealedFeedback = "score_only";
export type AutoExperimentBudgetExhaustionReason =
	| "candidate_queue_exhausted"
	| "first_promotion_eligible"
	| "max_runs"
	| "no_candidates"
	| "wall_clock_ms";

export interface AutoExperimentBudget {
	maxWallClockMs: number;
	maxRuns: number;
	maxCandidateFiles: number;
	maxDiffBytes: number;
	stopOnFirstPromotionEligible: boolean;
	sealedFeedback: AutoExperimentSealedFeedback;
}

export interface AutoExperimentOptions {
	repoRoot?: string;
	candidateDirs?: string[];
	candidatesRoot?: string;
	outputDir?: string;
	maxWallClockMs?: number;
	maxRuns?: number;
	maxCandidateFiles?: number;
	maxDiffBytes?: number;
	stopOnFirstPromotionEligible?: boolean;
	sealedFeedback?: AutoExperimentSealedFeedback;
	holdoutFilePath?: string;
	judgeCalibrationFilePath?: string;
	allowRepoLocalSealedInputs?: boolean;
	commands?: LabExperimentCommandName[];
	env?: NodeJS.ProcessEnv;
	keepWorktree?: boolean;
	now?: () => number;
	runExperiment?: (
		options: LabExperimentOptions,
	) => Promise<LabExperimentReport>;
}

export interface AutoExperimentCommandSummary {
	name: LabExperimentCommandName;
	status: LabExperimentStatus;
	exitCode: number;
}

export interface AutoExperimentResultSummary {
	status: LabExperimentStatus;
	commands: AutoExperimentCommandSummary[];
	visible?: VisibleGateSummary;
	pipeline?: PipelineSummary;
	objective?: ObjectiveSummary;
	judgeCalibration?: JudgeCalibrationSummary;
}

export interface AutoExperimentRunReport {
	id: string;
	candidateDir?: string;
	candidateFiles: string[];
	diffBytes: number;
	status: AutoExperimentRunStatus;
	score: number;
	promotionEligible: boolean;
	durationMs: number;
	experiment?: AutoExperimentResultSummary;
	blockers: string[];
}

export interface AutoExperimentBestCandidate {
	id: string;
	candidateDir?: string;
	status: AutoExperimentRunStatus;
	score: number;
	promotionEligible: boolean;
	blockers: string[];
}

export interface AutoExperimentProductionGraphMutationReport {
	checkedFiles: string[];
	changed: boolean;
	changedFiles: string[];
}

export interface AutoExperimentReport {
	version: 1;
	status: LabExperimentStatus;
	outputDir: string;
	budget: AutoExperimentBudget & {
		usedWallClockMs: number;
		runsUsed: number;
		candidateCount: number;
	};
	budgetExhaustionReason: AutoExperimentBudgetExhaustionReason;
	sealedFeedback: AutoExperimentSealedFeedback;
	runs: AutoExperimentRunReport[];
	bestCandidate?: AutoExperimentBestCandidate;
	blockers: string[];
	productionGraphMutation: AutoExperimentProductionGraphMutationReport;
}

interface CandidateSource {
	id: string;
	candidateDir?: string;
}

interface FileSnapshot {
	filePath: string;
	hash: string;
}

const DEFAULT_MAX_WALL_CLOCK_MS = 10 * 60 * 1000;
const DEFAULT_MAX_RUNS = 1;
const DEFAULT_MAX_CANDIDATE_FILES = 3;
const DEFAULT_MAX_DIFF_BYTES = 120_000;
const PRODUCTION_LOOP_FILES = [
	"src/decision/change-quality.ts",
	"src/planning/portfolio-quality.ts",
	"src/implementation/loop.ts",
] as const;
const DEFAULT_AUTO_COMMANDS: LabExperimentCommandName[] = [
	"visible_gate",
	"pipeline_gate",
	"objective",
];

export async function runBudgetedAutoExperiment(
	options: AutoExperimentOptions = {},
): Promise<AutoExperimentReport> {
	const repoRoot = resolve(options.repoRoot || process.cwd());
	const now = options.now || Date.now;
	const startedAt = now();
	const budget = resolveBudget(options);
	const outputDir = await resolveOutputDir(options.outputDir);
	const candidateSources = resolveCandidateSources(options);
	const productionBefore = snapshotProductionLoopFiles(repoRoot);
	const { runs, budgetExhaustionReason } = await collectAutoExperimentRuns({
		candidateSources,
		repoRoot,
		outputDir,
		budget,
		options,
		now,
		startedAt,
	});
	const productionGraphMutation = compareProductionSnapshots(
		productionBefore,
		snapshotProductionLoopFiles(repoRoot),
	);
	const blockers = reportBlockers({ runs, productionGraphMutation });
	const bestCandidate = bestCandidateFor(runs);
	const status = autoExperimentStatus({ runs, productionGraphMutation });
	const report: AutoExperimentReport = {
		version: 1,
		status,
		outputDir,
		budget: {
			...budget,
			usedWallClockMs: elapsedMs(startedAt, now()),
			runsUsed: runs.length,
			candidateCount: candidateSources.length,
		},
		budgetExhaustionReason,
		sealedFeedback: budget.sealedFeedback,
		runs,
		...(bestCandidate ? { bestCandidate } : {}),
		blockers,
		productionGraphMutation,
	};
	writeFileSync(
		join(outputDir, "auto-experiment-report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	return report;
}

async function collectAutoExperimentRuns(input: {
	candidateSources: CandidateSource[];
	repoRoot: string;
	outputDir: string;
	budget: AutoExperimentBudget;
	options: AutoExperimentOptions;
	now: () => number;
	startedAt: number;
}): Promise<{
	runs: AutoExperimentRunReport[];
	budgetExhaustionReason: AutoExperimentBudgetExhaustionReason;
}> {
	const runs: AutoExperimentRunReport[] = [];
	if (input.candidateSources.length === 0) {
		return { runs, budgetExhaustionReason: "no_candidates" };
	}
	let budgetExhaustionReason: AutoExperimentBudgetExhaustionReason | undefined;
	for (const source of input.candidateSources) {
		if (runs.length >= input.budget.maxRuns) {
			budgetExhaustionReason = "max_runs";
			break;
		}
		if (
			elapsedMs(input.startedAt, input.now()) >= input.budget.maxWallClockMs
		) {
			budgetExhaustionReason = "wall_clock_ms";
			break;
		}
		const run = await runCandidateExperiment({
			source,
			repoRoot: input.repoRoot,
			outputDir: input.outputDir,
			budget: input.budget,
			options: input.options,
			now: input.now,
		});
		runs.push(run);
		if (input.budget.stopOnFirstPromotionEligible && run.promotionEligible) {
			budgetExhaustionReason = "first_promotion_eligible";
			break;
		}
	}
	return {
		runs,
		budgetExhaustionReason:
			budgetExhaustionReason ||
			(runs.length >= input.budget.maxRuns &&
			input.candidateSources.length > runs.length
				? "max_runs"
				: "candidate_queue_exhausted"),
	};
}

function autoExperimentStatus(input: {
	runs: AutoExperimentRunReport[];
	productionGraphMutation: AutoExperimentProductionGraphMutationReport;
}): LabExperimentStatus {
	return input.productionGraphMutation.changed ||
		!input.runs.some((run) => run.status === "pass")
		? "fail"
		: "pass";
}

function resolveBudget(options: AutoExperimentOptions): AutoExperimentBudget {
	const sealedFeedback = options.sealedFeedback || "score_only";
	if (sealedFeedback !== "score_only") {
		throw new Error("sealedFeedback must be score_only.");
	}
	return {
		maxWallClockMs: nonNegativeInteger(
			options.maxWallClockMs,
			"maxWallClockMs",
			DEFAULT_MAX_WALL_CLOCK_MS,
		),
		maxRuns: nonNegativeInteger(options.maxRuns, "maxRuns", DEFAULT_MAX_RUNS),
		maxCandidateFiles: nonNegativeInteger(
			options.maxCandidateFiles,
			"maxCandidateFiles",
			DEFAULT_MAX_CANDIDATE_FILES,
		),
		maxDiffBytes: nonNegativeInteger(
			options.maxDiffBytes,
			"maxDiffBytes",
			DEFAULT_MAX_DIFF_BYTES,
		),
		stopOnFirstPromotionEligible: Boolean(options.stopOnFirstPromotionEligible),
		sealedFeedback,
	};
}

async function resolveOutputDir(
	outputDir: string | undefined,
): Promise<string> {
	if (outputDir) {
		const resolved = resolve(outputDir);
		await mkdir(resolved, { recursive: true });
		return resolved;
	}
	return mkdtemp(join(tmpdir(), "codewiki-auto-experiment-"));
}

function resolveCandidateSources(
	options: AutoExperimentOptions,
): CandidateSource[] {
	if (options.candidateDirs && options.candidateDirs.length > 0) {
		return options.candidateDirs.map((candidateDir) => ({
			id: basename(resolve(candidateDir)),
			candidateDir: resolve(candidateDir),
		}));
	}
	if (options.candidatesRoot) {
		const root = resolve(options.candidatesRoot);
		if (!existsSync(root)) {
			throw new Error(`Candidates root does not exist: ${root}`);
		}
		if (containsLoopCandidateFile(root)) {
			return [{ id: basename(root), candidateDir: root }];
		}
		return readdirSync(root)
			.map((entry) => join(root, entry))
			.filter((entryPath) => lstatSync(entryPath).isDirectory())
			.sort((left, right) => left.localeCompare(right))
			.map((candidateDir) => ({
				id: basename(candidateDir),
				candidateDir,
			}));
	}
	return [{ id: "current", candidateDir: undefined }];
}

async function runCandidateExperiment(input: {
	source: CandidateSource;
	repoRoot: string;
	outputDir: string;
	budget: AutoExperimentBudget;
	options: AutoExperimentOptions;
	now: () => number;
}): Promise<AutoExperimentRunReport> {
	const startedAt = input.now();
	try {
		const candidateFiles = input.source.candidateDir
			? findCandidateLoopFiles(input.source.candidateDir)
			: [];
		const validationBlockers = candidateValidationBlockers({
			repoRoot: input.repoRoot,
			candidateDir: input.source.candidateDir,
			candidateFiles,
			budget: input.budget,
		});
		if (validationBlockers.length > 0) {
			return skippedRun({
				source: input.source,
				candidateFiles,
				diffBytes: candidateDiffBytes({
					repoRoot: input.repoRoot,
					candidateDir: input.source.candidateDir,
					candidateFiles,
				}),
				blockers: validationBlockers,
				durationMs: elapsedMs(startedAt, input.now()),
			});
		}
		copyCandidateArtifact({
			candidateDir: input.source.candidateDir,
			candidateFiles,
			outputDir: input.outputDir,
			candidateId: input.source.id,
		});
		const experiment = await (input.options.runExperiment || runLabExperiment)({
			repoRoot: input.repoRoot,
			candidateDir: input.source.candidateDir,
			holdoutFilePath: input.options.holdoutFilePath,
			judgeCalibrationFilePath: input.options.judgeCalibrationFilePath,
			allowRepoLocalSealedInputs: input.options.allowRepoLocalSealedInputs,
			keepWorktree: input.options.keepWorktree,
			commands: experimentCommands(input.options),
			env: input.options.env,
		});
		const summarized = summarizeExperiment(experiment);
		const score = scoreExperiment(summarized);
		return {
			id: input.source.id,
			...(input.source.candidateDir
				? { candidateDir: input.source.candidateDir }
				: {}),
			candidateFiles,
			diffBytes: candidateDiffBytes({
				repoRoot: input.repoRoot,
				candidateDir: input.source.candidateDir,
				candidateFiles,
			}),
			status: experiment.status,
			score,
			promotionEligible: promotionEligible(summarized, experiment.blockers),
			durationMs: elapsedMs(startedAt, input.now()),
			experiment: summarized,
			blockers: experiment.blockers,
		};
	} catch (error) {
		return skippedRun({
			source: input.source,
			candidateFiles: [],
			diffBytes: 0,
			blockers: [error instanceof Error ? error.message : String(error)],
			durationMs: elapsedMs(startedAt, input.now()),
		});
	}
}

function experimentCommands(
	options: AutoExperimentOptions,
): LabExperimentCommandName[] {
	if (options.commands) return options.commands;
	return options.judgeCalibrationFilePath
		? [...DEFAULT_AUTO_COMMANDS, "judge_calibration"]
		: DEFAULT_AUTO_COMMANDS;
}

function candidateValidationBlockers(input: {
	repoRoot: string;
	candidateDir?: string;
	candidateFiles: string[];
	budget: AutoExperimentBudget;
}): string[] {
	const diffBytes = candidateDiffBytes({
		repoRoot: input.repoRoot,
		candidateDir: input.candidateDir,
		candidateFiles: input.candidateFiles,
	});
	return [
		...(input.candidateFiles.length > input.budget.maxCandidateFiles
			? [
					`Candidate has ${input.candidateFiles.length} candidate file(s), above maxCandidateFiles ${input.budget.maxCandidateFiles}.`,
				]
			: []),
		...(diffBytes > input.budget.maxDiffBytes
			? [
					`Candidate diff is ${diffBytes} byte(s), above maxDiffBytes ${input.budget.maxDiffBytes}.`,
				]
			: []),
	];
}

function skippedRun(input: {
	source: CandidateSource;
	candidateFiles: string[];
	diffBytes: number;
	blockers: string[];
	durationMs: number;
}): AutoExperimentRunReport {
	return {
		id: input.source.id,
		...(input.source.candidateDir
			? { candidateDir: input.source.candidateDir }
			: {}),
		candidateFiles: input.candidateFiles,
		diffBytes: input.diffBytes,
		status: "skipped",
		score: 0,
		promotionEligible: false,
		durationMs: input.durationMs,
		blockers: input.blockers,
	};
}

function summarizeExperiment(
	report: LabExperimentReport,
): AutoExperimentResultSummary {
	return {
		status: report.status,
		commands: report.commands.map((command) => ({
			name: command.name,
			status: command.status,
			exitCode: command.exitCode,
		})),
		...(report.visible ? { visible: report.visible } : {}),
		...(report.pipeline ? { pipeline: report.pipeline } : {}),
		...(report.objective ? { objective: report.objective } : {}),
		...(report.judgeCalibration
			? { judgeCalibration: report.judgeCalibration }
			: {}),
	};
}

function scoreExperiment(summary: AutoExperimentResultSummary): number {
	if (summary.objective) return summary.objective.score;
	const metricScores = [
		...Object.values(summary.visible?.metrics || {}).map(
			(metric) => metric.score,
		),
		...(summary.pipeline ? [summary.pipeline.score] : []),
	];
	if (metricScores.length === 0) return 0;
	return roundScore(
		metricScores.reduce((sum, score) => sum + score, 0) / metricScores.length,
	);
}

function promotionEligible(
	summary: AutoExperimentResultSummary,
	blockers: string[],
): boolean {
	const objective = summary.objective;
	if (!objective) return false;
	return (
		blockers.length === 0 &&
		summary.status === "pass" &&
		objective.status === "pass" &&
		objective.mode === "sealed" &&
		objective.score >= 95 &&
		objective.sealed.provided &&
		objective.sealed.falsePasses === 0 &&
		objective.sealed.expectedPassRegressions === 0 &&
		(summary.judgeCalibration?.falsePasses || 0) === 0
	);
}

function bestCandidateFor(
	runs: AutoExperimentRunReport[],
): AutoExperimentBestCandidate | undefined {
	const scoredRuns = runs.filter((run) => run.status !== "skipped");
	if (scoredRuns.length === 0) return undefined;
	const best = [...scoredRuns].sort(compareRunsForBest)[0];
	return {
		id: best.id,
		...(best.candidateDir ? { candidateDir: best.candidateDir } : {}),
		status: best.status,
		score: best.score,
		promotionEligible: best.promotionEligible,
		blockers: best.blockers,
	};
}

function compareRunsForBest(
	left: AutoExperimentRunReport,
	right: AutoExperimentRunReport,
): number {
	if (left.promotionEligible !== right.promotionEligible) {
		return left.promotionEligible ? -1 : 1;
	}
	if (left.score !== right.score) return right.score - left.score;
	if (left.status !== right.status) return left.status === "pass" ? -1 : 1;
	return left.id.localeCompare(right.id);
}

function reportBlockers(input: {
	runs: AutoExperimentRunReport[];
	productionGraphMutation: AutoExperimentProductionGraphMutationReport;
}): string[] {
	return [
		...(input.productionGraphMutation.changed
			? [
					`Production graph files changed during auto experiment: ${input.productionGraphMutation.changedFiles.join(", ")}.`,
				]
			: []),
		...input.runs.flatMap((run) =>
			run.blockers.map((blocker) => `${run.id}: ${blocker}`),
		),
	];
}

function copyCandidateArtifact(input: {
	candidateDir?: string;
	candidateFiles: string[];
	outputDir: string;
	candidateId: string;
}): void {
	if (!input.candidateDir || input.candidateFiles.length === 0) return;
	const artifactRoot = join(
		input.outputDir,
		"candidates",
		safePathSegment(input.candidateId),
	);
	for (const filePath of input.candidateFiles) {
		const source = join(input.candidateDir, filePath);
		const destination = join(artifactRoot, filePath);
		mkdirSync(resolve(destination, ".."), { recursive: true });
		writeFileSync(destination, readFileSync(source));
	}
}

function candidateDiffBytes(input: {
	repoRoot: string;
	candidateDir?: string;
	candidateFiles: string[];
}): number {
	if (!input.candidateDir) return 0;
	return input.candidateFiles.reduce((sum, filePath) => {
		const candidate = readFileSync(join(input.candidateDir || "", filePath));
		const baselinePath = join(input.repoRoot, filePath);
		const baseline = existsSync(baselinePath)
			? readFileSync(baselinePath)
			: Buffer.alloc(0);
		return candidate.equals(baseline) ? sum : sum + candidate.byteLength;
	}, 0);
}

function snapshotProductionLoopFiles(repoRoot: string): FileSnapshot[] {
	return PRODUCTION_LOOP_FILES.map((filePath) => {
		const fullPath = join(repoRoot, filePath);
		return {
			filePath,
			hash: existsSync(fullPath)
				? hashBuffer(readFileSync(fullPath))
				: "missing",
		};
	});
}

function compareProductionSnapshots(
	before: FileSnapshot[],
	after: FileSnapshot[],
): AutoExperimentProductionGraphMutationReport {
	const changedFiles = before
		.filter(
			(entry) =>
				after.find((item) => item.filePath === entry.filePath)?.hash !==
				entry.hash,
		)
		.map((entry) => entry.filePath);
	return {
		checkedFiles: before.map((entry) => entry.filePath),
		changed: changedFiles.length > 0,
		changedFiles,
	};
}

function containsLoopCandidateFile(root: string): boolean {
	return Object.values(LAB_LOOP_CANDIDATE_FILES).some((filePath) =>
		existsSync(join(root, filePath)),
	);
}

function nonNegativeInteger(
	value: number | undefined,
	name: string,
	fallback: number,
): number {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${name} must be a non-negative integer.`);
	}
	return value;
}

function elapsedMs(startedAt: number, endedAt: number): number {
	return Math.max(0, endedAt - startedAt);
}

function hashBuffer(buffer: Buffer): string {
	return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function roundScore(value: number): number {
	return Math.round(value * 100) / 100;
}

function safePathSegment(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "candidate";
}

function parseAutoExperimentArgs(argv: string[]): AutoExperimentOptions & {
	json: boolean;
	gate: boolean;
} {
	const sealedFeedback = stringFlag(argv, "--sealed-feedback");
	return {
		candidateDirs: stringFlags(argv, "--candidate-dir"),
		candidatesRoot: stringFlag(argv, "--candidates-root"),
		outputDir: stringFlag(argv, "--output-dir"),
		holdoutFilePath: stringFlag(argv, "--holdout"),
		judgeCalibrationFilePath: stringFlag(argv, "--judge-calibration"),
		allowRepoLocalSealedInputs: argv.includes("--allow-repo-local"),
		keepWorktree: argv.includes("--keep-worktrees"),
		commands: commandFlags(argv),
		maxWallClockMs: numberFlag(argv, "--max-wall-clock-ms"),
		maxRuns: numberFlag(argv, "--max-runs"),
		maxCandidateFiles: numberFlag(argv, "--max-candidate-files"),
		maxDiffBytes: numberFlag(argv, "--max-diff-bytes"),
		stopOnFirstPromotionEligible: argv.includes(
			"--stop-on-first-promotion-eligible",
		),
		sealedFeedback: sealedFeedback
			? (sealedFeedback as AutoExperimentSealedFeedback)
			: undefined,
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
			!DEFAULT_AUTO_COMMANDS.includes(command as LabExperimentCommandName) &&
			command !== "judge_calibration"
		) {
			throw new Error(`Unknown auto-experiment command: ${command}`);
		}
	}
	return commands as LabExperimentCommandName[];
}

function stringFlag(argv: string[], flag: string): string | undefined {
	const values = stringFlags(argv, flag);
	return values ? values[0] : undefined;
}

function stringFlags(argv: string[], flag: string): string[] | undefined {
	const values: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === flag && argv[index + 1]) values.push(argv[index + 1]);
	}
	return values.length > 0 ? values : undefined;
}

function numberFlag(argv: string[], flag: string): number | undefined {
	const value = stringFlag(argv, flag);
	if (!value) return undefined;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`${flag} must be a non-negative integer.`);
	}
	return parsed;
}

function printAutoExperimentReport(report: AutoExperimentReport): void {
	console.log(`Auto experiment: ${report.status}`);
	console.log(`Output: ${report.outputDir}`);
	console.log(
		`Runs: ${report.budget.runsUsed}/${report.budget.maxRuns}; stop: ${report.budgetExhaustionReason}`,
	);
	if (report.bestCandidate) {
		console.log(
			`Best: ${report.bestCandidate.id} score ${report.bestCandidate.score} (${report.bestCandidate.status})`,
		);
	}
	for (const run of report.runs) {
		console.log(
			`${run.status === "pass" ? "✓" : run.status === "skipped" ? "-" : "✗"} ${run.id}: ${run.score}`,
		);
		for (const blocker of run.blockers) console.log(`  - ${blocker}`);
	}
	if (report.productionGraphMutation.changed) {
		console.log(
			`Production graph mutation: ${report.productionGraphMutation.changedFiles.join(", ")}`,
		);
	}
}

async function main(argv = process.argv.slice(2)) {
	const args = parseAutoExperimentArgs(argv);
	const report = await runBudgetedAutoExperiment(args);
	if (args.json) console.log(JSON.stringify(report, null, 2));
	else printAutoExperimentReport(report);
	if (args.gate && report.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
