#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WEIGHTS = Object.freeze({
	functional: 0.35,
	visual: 0.2,
	ux: 0.15,
	maintainability: 0.15,
	traceability: 0.15,
});

const SCORE_KEYS = Object.keys(DEFAULT_WEIGHTS);
const EPSILON = 1e-9;

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value;
}

function assertString(value, label) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${label} must be a non-empty string`);
	}
	return value;
}

function optionalNumber(value, label) {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be a non-negative finite number`);
	}
	return value;
}

function assertScore(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) {
		throw new Error(`${label} must be a score from 0 to 5`);
	}
	return value;
}

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`Failed to read JSON ${path}: ${error.message}`);
	}
}

function jsonFiles(dir) {
	try {
		return readdirSync(dir)
			.filter((entry) => entry.endsWith(".json"))
			.sort()
			.map((entry) => join(dir, entry));
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export function validateTask(task, source = "task") {
	assertObject(task, source);
	if (task.schemaVersion !== 1) {
		throw new Error(`${source}.schemaVersion must be 1`);
	}
	assertString(task.id, `${source}.id`);
	assertString(task.title, `${source}.title`);
	assertString(task.kind, `${source}.kind`);
	assertString(task.prompt, `${source}.prompt`);
	if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) {
		throw new Error(`${source}.acceptanceCriteria must be a non-empty array`);
	}
	for (const [index, criterion] of task.acceptanceCriteria.entries()) {
		assertString(criterion, `${source}.acceptanceCriteria[${index}]`);
	}
	const qualityGate = assertObject(task.qualityGate, `${source}.qualityGate`);
	optionalNumber(qualityGate.minQualityScore, `${source}.qualityGate.minQualityScore`);
	const minScores = assertObject(qualityGate.minScores ?? {}, `${source}.qualityGate.minScores`);
	for (const key of SCORE_KEYS) {
		if (minScores[key] !== undefined) {
			assertScore(minScores[key], `${source}.qualityGate.minScores.${key}`);
		}
	}
	const weights = task.weights ?? DEFAULT_WEIGHTS;
	assertObject(weights, `${source}.weights`);
	for (const key of SCORE_KEYS) {
		optionalNumber(weights[key], `${source}.weights.${key}`);
	}
	return task;
}

export function validateRun(run, source = "run") {
	assertObject(run, source);
	if (run.schemaVersion !== 1) {
		throw new Error(`${source}.schemaVersion must be 1`);
	}
	assertString(run.runId, `${source}.runId`);
	assertString(run.taskId, `${source}.taskId`);
	assertString(run.system, `${source}.system`);
	assertString(run.model, `${source}.model`);
	optionalNumber(run.durationMs, `${source}.durationMs`);
	const tokens = assertObject(run.tokens, `${source}.tokens`);
	optionalNumber(tokens.input, `${source}.tokens.input`);
	optionalNumber(tokens.output, `${source}.tokens.output`);
	optionalNumber(tokens.total, `${source}.tokens.total`);
	if (tokens.total === undefined && tokens.input === undefined && tokens.output === undefined) {
		throw new Error(`${source}.tokens must include total or input/output counts`);
	}
	const scores = assertObject(run.scores, `${source}.scores`);
	for (const key of SCORE_KEYS) {
		assertScore(scores[key], `${source}.scores.${key}`);
	}
	if (!Array.isArray(run.checks)) {
		throw new Error(`${source}.checks must be an array`);
	}
	for (const [index, check] of run.checks.entries()) {
		assertObject(check, `${source}.checks[${index}]`);
		assertString(check.name, `${source}.checks[${index}].name`);
		if (!["pass", "fail", "skip"].includes(check.status)) {
			throw new Error(`${source}.checks[${index}].status must be pass, fail, or skip`);
		}
	}
	return run;
}

export function loadTasks(tasksDir = "benchmarks/tasks") {
	return jsonFiles(tasksDir).map((path) => validateTask({ ...readJson(path), sourcePath: path }, path));
}

export function loadRuns(resultsDir = "benchmarks/results") {
	return jsonFiles(resultsDir).map((path) => validateRun({ ...readJson(path), sourcePath: path }, path));
}

export function scoreQuality(scores, weights = DEFAULT_WEIGHTS) {
	let totalWeight = 0;
	let weightedScore = 0;
	for (const key of SCORE_KEYS) {
		const weight = weights[key] ?? DEFAULT_WEIGHTS[key];
		totalWeight += weight;
		weightedScore += assertScore(scores[key], `scores.${key}`) * weight;
	}
	if (totalWeight <= 0) {
		throw new Error("score weights must sum above zero");
	}
	return (weightedScore / totalWeight) * 20;
}

export function totalTokens(tokens) {
	const total = tokens.total ?? (tokens.input ?? 0) + (tokens.output ?? 0);
	if (total <= 0) {
		throw new Error("token total must be above zero");
	}
	return total;
}

function passedChecks(run) {
	return run.checks.length > 0 && run.checks.every((check) => check.status === "pass");
}

function meetsMinScores(scores, minScores = {}) {
	const failures = [];
	for (const key of SCORE_KEYS) {
		const minimum = minScores[key];
		if (minimum !== undefined && scores[key] + EPSILON < minimum) {
			failures.push(`${key} ${scores[key]} < ${minimum}`);
		}
	}
	return failures;
}

export function scoreRun(run, task) {
	validateRun(run, run.sourcePath ?? run.runId);
	validateTask(task, task?.sourcePath ?? task?.id ?? "task");
	const qualityScore = scoreQuality(run.scores, task.weights ?? DEFAULT_WEIGHTS);
	const tokenTotal = totalTokens(run.tokens);
	const durationMs = run.durationMs ?? elapsedMs(run);
	const minQualityScore = task.qualityGate?.minQualityScore ?? 80;
	const minScoreFailures = meetsMinScores(
		run.scores,
		task.qualityGate?.minScores ?? {},
	);
	const blockers = [];
	if (run.productionReady !== true) {
		blockers.push("productionReady is not true");
	}
	if (!passedChecks(run)) {
		blockers.push("not all checks passed");
	}
	if (qualityScore + EPSILON < minQualityScore) {
		blockers.push(`qualityScore ${round(qualityScore)} < ${minQualityScore}`);
	}
	blockers.push(...minScoreFailures);
	const qualityDenominator = Math.max(qualityScore, EPSILON);
	return {
		runId: run.runId,
		taskId: run.taskId,
		system: run.system,
		model: run.model,
		qualityScore,
		tokens: tokenTotal,
		durationMs,
		productionReady: blockers.length === 0,
		blockers,
		tokensPerQualityPoint: tokenTotal / qualityDenominator,
		secondsPerQualityPoint: durationMs / 1000 / qualityDenominator,
		sourcePath: run.sourcePath,
	};
}

function elapsedMs(run) {
	if (!run.startedAt || !run.completedAt) {
		throw new Error(`${run.runId}.durationMs is required when timestamps are absent`);
	}
	const started = Date.parse(run.startedAt);
	const completed = Date.parse(run.completedAt);
	if (!Number.isFinite(started) || !Number.isFinite(completed) || completed <= started) {
		throw new Error(`${run.runId} timestamps must produce a positive duration`);
	}
	return completed - started;
}

function betterRun(left, right) {
	if (!right) {
		return left;
	}
	if (left.productionReady !== right.productionReady) {
		return left.productionReady ? left : right;
	}
	if (Math.abs(left.qualityScore - right.qualityScore) > EPSILON) {
		return left.qualityScore > right.qualityScore ? left : right;
	}
	if (Math.abs(left.tokensPerQualityPoint - right.tokensPerQualityPoint) > EPSILON) {
		return left.tokensPerQualityPoint < right.tokensPerQualityPoint ? left : right;
	}
	return left.secondsPerQualityPoint <= right.secondsPerQualityPoint ? left : right;
}

function geometricMean(values) {
	const positive = values.filter((value) => value > 0);
	if (positive.length === 0) {
		return null;
	}
	const logSum = positive.reduce((sum, value) => sum + Math.log(value), 0);
	return Math.exp(logSum / positive.length);
}

export function aggregateBenchmarks({
	tasks,
	runs,
	candidateSystem = "codewiki",
	baselineSystem = "plain-pi",
	minTasks = 2,
} = {}) {
	const taskList = tasks ?? loadTasks();
	const runList = runs ?? loadRuns();
	const taskById = new Map(taskList.map((task) => [task.id, task]));
	const unknownTaskRuns = [];
	const scoredRuns = [];
	for (const run of runList) {
		const task = taskById.get(run.taskId);
		if (!task) {
			unknownTaskRuns.push(run.runId);
			continue;
		}
		scoredRuns.push(scoreRun(run, task));
	}
	const taskResults = taskList.map((task) => {
		const taskRuns = scoredRuns.filter((run) => run.taskId === task.id);
		const bestBySystem = {};
		for (const run of taskRuns) {
			bestBySystem[run.system] = betterRun(run, bestBySystem[run.system]);
		}
		return { taskId: task.id, title: task.title, runs: taskRuns, bestBySystem };
	});
	const comparisons = taskResults.map((taskResult) => {
		const candidate = taskResult.bestBySystem[candidateSystem] ?? null;
		const baseline = taskResult.bestBySystem[baselineSystem] ?? null;
		return compareRuns(taskResult.taskId, candidate, baseline);
	});
	const systems = summarizeSystems(scoredRuns);
	const gate = evaluateGate({
		comparisons,
		candidateSystem,
		baselineSystem,
		minTasks,
		unknownTaskRuns,
	});
	return {
		taskCount: taskList.length,
		runCount: runList.length,
		candidateSystem,
		baselineSystem,
		taskResults,
		comparisons,
		systems,
		unknownTaskRuns,
		gate,
	};
}

function compareRuns(taskId, candidate, baseline) {
	if (!candidate || !baseline) {
		return {
			taskId,
			candidate,
			baseline,
			compared: false,
			blockers: [
				...(candidate ? [] : ["missing candidate run"]),
				...(baseline ? [] : ["missing baseline run"]),
			],
		};
	}
	const blockers = [];
	if (!candidate.productionReady) {
		blockers.push("candidate is not production-ready");
	}
	if (!baseline.productionReady) {
		blockers.push("baseline is not production-ready");
	}
	if (candidate.qualityScore + EPSILON < baseline.qualityScore) {
		blockers.push("candidate quality is lower than baseline quality");
	}
	if (candidate.tokensPerQualityPoint > baseline.tokensPerQualityPoint + EPSILON) {
		blockers.push("candidate token efficiency is worse than baseline");
	}
	if (candidate.secondsPerQualityPoint > baseline.secondsPerQualityPoint + EPSILON) {
		blockers.push("candidate speed efficiency is worse than baseline");
	}
	return {
		taskId,
		candidate,
		baseline,
		compared: true,
		qualityDelta: candidate.qualityScore - baseline.qualityScore,
		tokenEfficiencyRatio:
			candidate.tokensPerQualityPoint / baseline.tokensPerQualityPoint,
		speedEfficiencyRatio:
			candidate.secondsPerQualityPoint / baseline.secondsPerQualityPoint,
		blockers,
	};
}

function summarizeSystems(scoredRuns) {
	const bySystem = new Map();
	for (const run of scoredRuns) {
		const entry = bySystem.get(run.system) ?? [];
		entry.push(run);
		bySystem.set(run.system, entry);
	}
	const systems = {};
	for (const [system, runs] of bySystem.entries()) {
		const readyRuns = runs.filter((run) => run.productionReady);
		systems[system] = {
			runs: runs.length,
			productionReadyRuns: readyRuns.length,
			productionReadyTasks: new Set(readyRuns.map((run) => run.taskId)).size,
			meanQualityScore: mean(readyRuns.map((run) => run.qualityScore)),
			geomeanTokensPerQualityPoint: geometricMean(
				readyRuns.map((run) => run.tokensPerQualityPoint),
			),
			geomeanSecondsPerQualityPoint: geometricMean(
				readyRuns.map((run) => run.secondsPerQualityPoint),
			),
		};
	}
	return systems;
}

function mean(values) {
	if (values.length === 0) {
		return null;
	}
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluateGate({
	comparisons,
	candidateSystem,
	baselineSystem,
	minTasks,
	unknownTaskRuns,
}) {
	const blockers = [];
	if (unknownTaskRuns.length > 0) {
		blockers.push(`unknown task runs: ${unknownTaskRuns.join(", ")}`);
	}
	const compared = comparisons.filter((comparison) => comparison.compared);
	if (compared.length < minTasks) {
		blockers.push(
			`need ${minTasks} compared production benchmark tasks, found ${compared.length}`,
		);
	}
	for (const comparison of comparisons) {
		if (!comparison.compared) {
			blockers.push(`${comparison.taskId}: ${comparison.blockers.join("; ")}`);
			continue;
		}
		for (const blocker of comparison.blockers) {
			blockers.push(`${comparison.taskId}: ${blocker}`);
		}
	}
	const candidateTokenGeomean = geometricMean(
		compared.map((comparison) => comparison.candidate.tokensPerQualityPoint),
	);
	const baselineTokenGeomean = geometricMean(
		compared.map((comparison) => comparison.baseline.tokensPerQualityPoint),
	);
	const candidateSpeedGeomean = geometricMean(
		compared.map((comparison) => comparison.candidate.secondsPerQualityPoint),
	);
	const baselineSpeedGeomean = geometricMean(
		compared.map((comparison) => comparison.baseline.secondsPerQualityPoint),
	);
	if (
		candidateTokenGeomean !== null &&
		baselineTokenGeomean !== null &&
		candidateTokenGeomean > baselineTokenGeomean + EPSILON
	) {
		blockers.push(`${candidateSystem} token geomean is worse than ${baselineSystem}`);
	}
	if (
		candidateSpeedGeomean !== null &&
		baselineSpeedGeomean !== null &&
		candidateSpeedGeomean > baselineSpeedGeomean + EPSILON
	) {
		blockers.push(`${candidateSystem} speed geomean is worse than ${baselineSystem}`);
	}
	return {
		status: blockers.length === 0 ? "pass" : "fail",
		blockers,
		comparedTasks: compared.length,
		candidateTokenGeomean,
		baselineTokenGeomean,
		candidateSpeedGeomean,
		baselineSpeedGeomean,
	};
}

function round(value) {
	return Math.round(value * 1000) / 1000;
}

function roundedSummary(summary) {
	return JSON.parse(
		JSON.stringify(summary, (_key, value) => {
			if (typeof value === "number") {
				return round(value);
			}
			return value;
		}),
	);
}

function parseArgs(argv) {
	const options = {
		tasksDir: "benchmarks/tasks",
		resultsDir: "benchmarks/results",
		candidateSystem: "codewiki",
		baselineSystem: "plain-pi",
		minTasks: 2,
		gate: false,
		json: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--tasks") {
			options.tasksDir = argv[++index];
		} else if (arg === "--results") {
			options.resultsDir = argv[++index];
		} else if (arg === "--candidate") {
			options.candidateSystem = argv[++index];
		} else if (arg === "--baseline") {
			options.baselineSystem = argv[++index];
		} else if (arg === "--min-tasks") {
			options.minTasks = Number(argv[++index]);
		} else if (arg === "--gate") {
			options.gate = true;
		} else if (arg === "--json") {
			options.json = true;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (!Number.isInteger(options.minTasks) || options.minTasks < 1) {
		throw new Error("--min-tasks must be a positive integer");
	}
	return options;
}

function printText(summary) {
	console.log("CodeWiki agent-OS benchmark summary");
	console.log(`tasks: ${summary.taskCount}`);
	console.log(`runs: ${summary.runCount}`);
	for (const [system, data] of Object.entries(summary.systems)) {
		console.log(
			`${system}: ready ${data.productionReadyRuns}/${data.runs}, ` +
				`tasks ${data.productionReadyTasks}, ` +
				`quality ${round(data.meanQualityScore ?? 0)}, ` +
				`tokens/q ${round(data.geomeanTokensPerQualityPoint ?? 0)}, ` +
				`seconds/q ${round(data.geomeanSecondsPerQualityPoint ?? 0)}`,
		);
	}
	console.log(`gate: ${summary.gate.status}`);
	for (const blocker of summary.gate.blockers) {
		console.log(`- ${blocker}`);
	}
}

async function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	const summary = aggregateBenchmarks({
		tasks: loadTasks(options.tasksDir),
		runs: loadRuns(options.resultsDir),
		candidateSystem: options.candidateSystem,
		baselineSystem: options.baselineSystem,
		minTasks: options.minTasks,
	});
	const output = roundedSummary(summary);
	if (options.json) {
		console.log(JSON.stringify(output, null, 2));
	} else {
		printText(output);
	}
	if (options.gate && summary.gate.status !== "pass") {
		process.exitCode = 1;
	}
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
