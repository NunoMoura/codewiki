#!/usr/bin/env node
import { decisionCases } from "../decision/cases.ts";
import { decisionLoopCandidate } from "../decision/loop.ts";
import { implementationCases } from "../implementation/cases.ts";
import { implementationLoopCandidate } from "../implementation/loop.ts";
import { scorePipeline } from "../pipeline/score.ts";
import type { PipelineScore } from "../pipeline/types.ts";
import { planningCases } from "../planning/cases.ts";
import { planningLoopCandidate } from "../planning/loop.ts";
import { runLabExit } from "./engine.ts";
import { loadLabHoldoutBundle } from "./holdout.ts";
import {
	DEC_LOSS,
	IEC_LOSS,
	PEC_LOSS,
	scoreAllLoops,
	type LossMatrix,
} from "./score.ts";
import {
	scoreHoldoutBundle,
	type LabHoldoutScoreReport,
} from "./holdout-score.ts";
import type {
	LabCandidateStandards,
	LabCase,
	LabExpectedFailure,
	LabLoop,
	LabLoopMetric,
	LabLoopScore,
	LabMetric,
	LabStandard,
	LabStandardResult,
	LabVerdict,
} from "./types.ts";

export type LabObjectiveMode = "visible-only" | "sealed";
export type LabObjectiveStatus = "pass" | "fail" | "visible-only";

export interface LabObjectiveOptions {
	holdoutFilePath?: string;
	allowRepoLocalHoldout?: boolean;
}

export interface LabObjectiveComponent {
	metric: LabMetric;
	score: number;
	weight: number;
	threshold: number;
	caseCount: number;
	falsePasses: number;
	expectedPassRegressions: number;
}

export interface LabObjectivePenalties {
	complexity: number;
	brittleness: number;
	total: number;
}

export interface LabObjectiveHardGates {
	falsePasses: number;
	expectedPassRegressions: number;
	blockers: string[];
}

export interface LabObjectiveLossContributor {
	loop: LabLoop;
	metric: LabLoopMetric;
	nodeId: string;
	layer?: string;
	standardType?: string;
	repairTarget?: string;
	loss: number;
	cases: Array<{
		id: string;
		expected: LabVerdict;
		observed: LabVerdict;
		routeLoss: number;
		nodeLoss: number;
		message?: string;
		failureClass?: string;
	}>;
}

export interface LabObjectiveReport {
	version: 1;
	mode: LabObjectiveMode;
	status: LabObjectiveStatus;
	score: number;
	rawScore: number;
	maxMeaningfulScore: number;
	components: Record<LabMetric, LabObjectiveComponent>;
	penalties: LabObjectivePenalties;
	hardGates: LabObjectiveHardGates;
	warnings: string[];
	topLossContributors: LabObjectiveLossContributor[];
	holdout?: {
		filePath: string;
		suiteCount: number;
		gateStatus: "pass" | "fail";
	};
}

const COMPONENT_WEIGHTS: Record<LabMetric, number> = {
	DEC: 0.25,
	PEC: 0.25,
	IEC: 0.25,
	PCE: 0.15,
	HCE: 0.1,
};

const COMPONENT_THRESHOLDS: Record<LabMetric, number> = {
	DEC: 95,
	PEC: 95,
	IEC: 95,
	PCE: 95,
	HCE: 90,
};

const VISIBLE_ONLY_MAX_SCORE = 90;
const EXPECTED_REASON_LOSS_UNIT = 2;

export function buildLabObjectiveReport(
	options: LabObjectiveOptions = {},
): LabObjectiveReport {
	const loopScores = scoreAllLoops();
	const pipelineScore = scorePipeline();
	const holdoutReport = options.holdoutFilePath
		? scoreHoldoutBundle(
				loadLabHoldoutBundle({
					filePath: options.holdoutFilePath,
					allowRepoLocal: options.allowRepoLocalHoldout,
				}),
			)
		: undefined;
	const mode: LabObjectiveMode = holdoutReport ? "sealed" : "visible-only";
	const hce = holdoutReport
		? holdoutComponent(holdoutReport)
		: emptyComponent("HCE");
	const components: Record<LabMetric, LabObjectiveComponent> = {
		DEC: loopComponent(loopScores.decision),
		PEC: loopComponent(loopScores.planning),
		IEC: loopComponent(loopScores.implementation),
		PCE: pipelineComponent(pipelineScore),
		HCE: hce,
	};
	const penalties = objectivePenalties(loopScores);
	const hardGates = objectiveHardGates({ components, mode, holdoutReport });
	const topLossContributors = visibleLossContributors();
	const weightedScore = Object.values(components).reduce(
		(sum, component) => sum + component.score * component.weight,
		0,
	);
	const rawScore = roundScore(weightedScore - penalties.total);
	const maxMeaningfulScore = mode === "sealed" ? 100 : VISIBLE_ONLY_MAX_SCORE;
	const cappedScore = applyHardCaps(
		Math.min(rawScore, maxMeaningfulScore),
		hardGates,
	);
	const status: LabObjectiveStatus =
		hardGates.blockers.length > 0
			? "fail"
			: mode === "sealed"
				? "pass"
				: "visible-only";
	return {
		version: 1,
		mode,
		status,
		score: cappedScore,
		rawScore,
		maxMeaningfulScore,
		components,
		penalties,
		hardGates,
		topLossContributors,
		warnings:
			mode === "visible-only"
				? [
						"No sealed holdout was provided; visible-only objective score is capped at 90 and is regression evidence only.",
					]
				: [],
		...(holdoutReport
			? {
					holdout: {
						filePath: holdoutReport.filePath,
						suiteCount: holdoutReport.suites.length,
						gateStatus: holdoutReport.gate.status,
					},
				}
			: {}),
	};
}

function loopComponent(score: LabLoopScore): LabObjectiveComponent {
	return {
		metric: score.metric,
		score: score.score,
		weight: COMPONENT_WEIGHTS[score.metric],
		threshold: COMPONENT_THRESHOLDS[score.metric],
		caseCount: score.caseCount,
		falsePasses: score.falsePasses,
		expectedPassRegressions: score.expectedPassRegressions,
	};
}

function pipelineComponent(score: PipelineScore): LabObjectiveComponent {
	return {
		metric: score.metric,
		score: score.score,
		weight: COMPONENT_WEIGHTS.PCE,
		threshold: COMPONENT_THRESHOLDS.PCE,
		caseCount: score.caseCount,
		falsePasses: score.falsePasses,
		expectedPassRegressions: score.expectedPassRegressions,
	};
}

function holdoutComponent(
	report: LabHoldoutScoreReport,
): LabObjectiveComponent {
	const scores = report.suites.flatMap((suite) => Object.values(suite.scores));
	const caseCount = scores.reduce((sum, score) => sum + score.caseCount, 0);
	const score =
		scores.length === 0
			? 0
			: scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
	return {
		metric: "HCE",
		score: roundScore(score),
		weight: COMPONENT_WEIGHTS.HCE,
		threshold: COMPONENT_THRESHOLDS.HCE,
		caseCount,
		falsePasses: scores.reduce((sum, item) => sum + item.falsePasses, 0),
		expectedPassRegressions: scores.reduce(
			(sum, item) => sum + item.expectedPassRegressions,
			0,
		),
	};
}

function emptyComponent(metric: LabMetric): LabObjectiveComponent {
	return {
		metric,
		score: 0,
		weight: COMPONENT_WEIGHTS[metric],
		threshold: COMPONENT_THRESHOLDS[metric],
		caseCount: 0,
		falsePasses: 0,
		expectedPassRegressions: 0,
	};
}

function visibleLossContributors(): LabObjectiveLossContributor[] {
	return aggregateContributors([
		...loopLossContributors({
			loop: "decision",
			metric: "DEC",
			cases: decisionCases,
			candidate: decisionLoopCandidate,
			lossMatrix: DEC_LOSS,
		}),
		...loopLossContributors({
			loop: "planning",
			metric: "PEC",
			cases: planningCases,
			candidate: planningLoopCandidate,
			lossMatrix: PEC_LOSS,
		}),
		...loopLossContributors({
			loop: "implementation",
			metric: "IEC",
			cases: implementationCases,
			candidate: implementationLoopCandidate,
			lossMatrix: IEC_LOSS,
		}),
	]).slice(0, 10);
}

function loopLossContributors<TInput>({
	loop,
	metric,
	cases,
	candidate,
	lossMatrix,
}: {
	loop: LabLoop;
	metric: LabLoopMetric;
	cases: LabCase<TInput>[];
	candidate: LabCandidateStandards<TInput>;
	lossMatrix: LossMatrix;
}): LabObjectiveLossContributor[] {
	return cases.flatMap((testCase) => {
		const exit = runLabExit({
			input: testCase.input,
			standards: candidate.standards,
		});
		const missedExpectedFailures = missedExpectedFailuresForCase(
			testCase,
			exit,
		);
		if (
			exit.verdict === testCase.expected &&
			missedExpectedFailures.length === 0
		) {
			return [];
		}
		const routeLoss =
			lossMatrix[testCase.expected][exit.verdict] * testCase.weight;
		const routeContributors =
			routeLoss === 0
				? []
				: routeLossContributorsForCase({
						loop,
						metric,
						testCase,
						observed: exit.verdict,
						routeLoss,
						standards: exit.standards,
					});
		const reasonContributors = missedExpectedFailures.map((failure) =>
			missedReasonContributor({
				loop,
				metric,
				testCase,
				observed: exit.verdict,
				failure,
				expectedFailureCount: testCase.expectedFailures?.length || 1,
				standard: candidate.standards.find(
					(candidateStandard) => candidateStandard.id === failure.standardId,
				),
			}),
		);
		return [...routeContributors, ...reasonContributors];
	});
}

function routeLossContributorsForCase({
	loop,
	metric,
	testCase,
	observed,
	routeLoss,
	standards,
}: {
	loop: LabLoop;
	metric: LabLoopMetric;
	testCase: LabCase<unknown>;
	observed: LabVerdict;
	routeLoss: number;
	standards: LabStandardResult[];
}): LabObjectiveLossContributor[] {
	const failedStandards = standards.filter(
		(standard) => (standard.loss || 0) > 0,
	);
	if (failedStandards.length === 0) {
		return [
			routeMismatchContributor({
				loop,
				metric,
				testCase,
				observed,
				routeLoss,
			}),
		];
	}
	const totalNodeLoss = failedStandards.reduce(
		(sum, standard) => sum + (standard.loss || 0),
		0,
	);
	return failedStandards.map((standard) =>
		standardContributor({
			loop,
			metric,
			testCase,
			observed,
			routeLoss,
			standard,
			totalNodeLoss,
		}),
	);
}

function missedExpectedFailuresForCase<TInput>(
	testCase: LabCase<TInput>,
	exit: { standards: LabStandardResult[] },
): LabExpectedFailure[] {
	const expectedFailures = testCase.expectedFailures || [];
	if (expectedFailures.length === 0) return [];
	const observedFailures = new Set(
		exit.standards
			.filter((standard) => !standard.passed)
			.map((standard) => standard.id),
	);
	return expectedFailures.filter(
		(failure) => !observedFailures.has(failure.standardId),
	);
}

function missedReasonContributor<TInput>({
	loop,
	metric,
	testCase,
	observed,
	failure,
	expectedFailureCount,
	standard,
}: {
	loop: LabLoop;
	metric: LabLoopMetric;
	testCase: LabCase<TInput>;
	observed: LabVerdict;
	failure: LabExpectedFailure;
	expectedFailureCount: number;
	standard?: LabStandard<TInput>;
}): LabObjectiveLossContributor {
	const reasonLoss =
		(EXPECTED_REASON_LOSS_UNIT * testCase.weight) / expectedFailureCount;
	return {
		loop,
		metric,
		nodeId: failure.standardId,
		layer: standard?.layer || "expected_failure",
		standardType: standard?.standardType || "loop_contract",
		repairTarget: standard?.repairTarget || loop,
		loss: roundScore(reasonLoss),
		cases: [
			{
				id: testCase.id,
				expected: testCase.expected,
				observed,
				routeLoss: 0,
				nodeLoss: reasonLoss,
				failureClass: failure.failureClass,
				message: `Expected ${failure.failureClass} failure ${failure.standardId} did not activate.`,
			},
		],
	};
}

function standardContributor({
	loop,
	metric,
	testCase,
	observed,
	routeLoss,
	standard,
	totalNodeLoss,
}: {
	loop: LabLoop;
	metric: LabLoopMetric;
	testCase: LabCase<unknown>;
	observed: LabVerdict;
	routeLoss: number;
	standard: LabStandardResult;
	totalNodeLoss: number;
}): LabObjectiveLossContributor {
	const nodeLoss = standard.loss || 0;
	return {
		loop,
		metric,
		nodeId: standard.id,
		...(standard.layer ? { layer: standard.layer } : {}),
		...(standard.standardType ? { standardType: standard.standardType } : {}),
		...(standard.repairTarget ? { repairTarget: standard.repairTarget } : {}),
		loss: roundScore(
			totalNodeLoss === 0 ? routeLoss : routeLoss * (nodeLoss / totalNodeLoss),
		),
		cases: [
			{
				id: testCase.id,
				expected: testCase.expected,
				observed,
				routeLoss,
				nodeLoss,
				...(standard.message ? { message: standard.message } : {}),
			},
		],
	};
}

function routeMismatchContributor({
	loop,
	metric,
	testCase,
	observed,
	routeLoss,
}: {
	loop: LabLoop;
	metric: LabLoopMetric;
	testCase: LabCase<unknown>;
	observed: LabVerdict;
	routeLoss: number;
}): LabObjectiveLossContributor {
	return {
		loop,
		metric,
		nodeId: "route_mismatch_without_node_loss",
		layer: "exit_loss",
		standardType: "loop_contract",
		repairTarget: loop,
		loss: routeLoss,
		cases: [
			{
				id: testCase.id,
				expected: testCase.expected,
				observed,
				routeLoss,
				nodeLoss: 0,
			},
		],
	};
}

function aggregateContributors(
	contributors: LabObjectiveLossContributor[],
): LabObjectiveLossContributor[] {
	const byKey = new Map<string, LabObjectiveLossContributor>();
	for (const contributor of contributors) {
		const key = `${contributor.loop}:${contributor.nodeId}`;
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, contributor);
			continue;
		}
		existing.loss = roundScore(existing.loss + contributor.loss);
		existing.cases.push(...contributor.cases);
	}
	return [...byKey.values()].sort((left, right) => right.loss - left.loss);
}

function objectivePenalties(
	scores: Record<LabLoop, LabLoopScore>,
): LabObjectivePenalties {
	const standardCounts = Object.values(scores).map(
		(score) => score.standardCounts,
	);
	const totalStandards = standardCounts.reduce(
		(sum, counts) => sum + counts.deterministic + counts.agent + counts.user,
		0,
	);
	const agentStandards = standardCounts.reduce(
		(sum, counts) => sum + counts.agent,
		0,
	);
	const userStandards = standardCounts.reduce(
		(sum, counts) => sum + counts.user,
		0,
	);
	const deterministicNodeBudget = 36;
	const complexity = roundScore(
		Math.max(0, totalStandards - deterministicNodeBudget) * 0.25 +
			agentStandards * 2 +
			userStandards,
	);
	const brittleness = 0;
	return {
		complexity,
		brittleness,
		total: roundScore(complexity + brittleness),
	};
}

function objectiveHardGates({
	components,
	mode,
	holdoutReport,
}: {
	components: Record<LabMetric, LabObjectiveComponent>;
	mode: LabObjectiveMode;
	holdoutReport?: LabHoldoutScoreReport;
}): LabObjectiveHardGates {
	const visibleMetrics: LabMetric[] = ["DEC", "PEC", "IEC", "PCE"];
	const metricsToGate =
		mode === "sealed" ? [...visibleMetrics, "HCE" as const] : visibleMetrics;
	const blockers = metricsToGate.flatMap((metric) => {
		const component = components[metric];
		return component.score < component.threshold
			? [
					`${metric} is ${component.score}, below objective threshold ${component.threshold}.`,
				]
			: [];
	});
	const falsePasses = metricsToGate.reduce(
		(sum, metric) => sum + components[metric].falsePasses,
		0,
	);
	const expectedPassRegressions = metricsToGate.reduce(
		(sum, metric) => sum + components[metric].expectedPassRegressions,
		0,
	);
	if (falsePasses > 0)
		blockers.push(`Objective has ${falsePasses} false pass(es).`);
	if (expectedPassRegressions > 0) {
		blockers.push(
			`Objective has ${expectedPassRegressions} expected-pass regression(s).`,
		);
	}
	if (holdoutReport && holdoutReport.gate.status !== "pass") {
		blockers.push(...holdoutReport.gate.blockers);
	}
	return { falsePasses, expectedPassRegressions, blockers };
}

function applyHardCaps(score: number, gates: LabObjectiveHardGates): number {
	let capped = score;
	if (gates.falsePasses > 0) capped = Math.min(capped, 49);
	else if (gates.expectedPassRegressions > 0) capped = Math.min(capped, 69);
	if (gates.blockers.length > 0) capped = Math.min(capped, 89);
	return roundScore(Math.max(0, capped));
}

export function printLabObjectiveReport(report: LabObjectiveReport): void {
	console.log(
		`Objective: ${report.score} (${report.mode}, status ${report.status})`,
	);
	for (const metric of ["DEC", "PEC", "IEC", "PCE", "HCE"] as const) {
		const component = report.components[metric];
		console.log(
			`${metric}: ${component.score} (${component.falsePasses} false pass, ${component.expectedPassRegressions} pass regression, ${component.caseCount} cases)`,
		);
	}
	console.log(
		`Penalties: complexity ${report.penalties.complexity}, brittleness ${report.penalties.brittleness}`,
	);
	for (const warning of report.warnings) console.log(`Warning: ${warning}`);
	for (const blocker of report.hardGates.blockers)
		console.log(`Blocker: ${blocker}`);
	if (report.topLossContributors.length > 0) {
		console.log("Top loss contributors:");
		for (const contributor of report.topLossContributors) {
			console.log(
				`  - ${contributor.metric} ${contributor.nodeId}: ${contributor.loss}`,
			);
		}
	}
}

function parseObjectiveArgs(argv: string[]): {
	json: boolean;
	gate: boolean;
	requireHoldout: boolean;
	options: LabObjectiveOptions;
} {
	const fileFlagIndex = argv.findIndex(
		(value) => value === "--file" || value === "--holdout-file",
	);
	const holdoutFilePath =
		fileFlagIndex >= 0
			? argv[fileFlagIndex + 1]
			: process.env.CODEWIKI_LAB_HOLDOUT_FILE;
	return {
		json: argv.includes("--json"),
		gate: argv.includes("--gate"),
		requireHoldout: argv.includes("--require-holdout"),
		options: {
			...(holdoutFilePath ? { holdoutFilePath } : {}),
			...(argv.includes("--allow-repo-local")
				? { allowRepoLocalHoldout: true }
				: {}),
		},
	};
}

function roundScore(value: number): number {
	return Math.round(value * 100) / 100;
}

function main(argv = process.argv.slice(2)) {
	const args = parseObjectiveArgs(argv);
	const report = buildLabObjectiveReport(args.options);
	if (args.json) console.log(JSON.stringify(report, null, 2));
	else printLabObjectiveReport(report);
	if (
		args.gate &&
		(report.status === "fail" ||
			(args.requireHoldout && report.mode !== "sealed"))
	) {
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
