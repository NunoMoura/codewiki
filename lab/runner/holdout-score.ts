#!/usr/bin/env node
import { evaluateDecisionCandidate } from "../decision/score.ts";
import {
	decisionExitCandidate,
	type DecisionLabInput,
} from "../decision/exit.ts";
import { evaluateImplementationCandidate } from "../implementation/score.ts";
import {
	implementationExitCandidate,
	type ImplementationLabInput,
} from "../implementation/exit.ts";
import { evaluatePlanningCandidate } from "../planning/score.ts";
import {
	planningExitCandidate,
	type PlanningLabInput,
} from "../planning/exit.ts";
import { loadLabHoldoutBundle, type LabHoldoutBundle } from "./holdout.ts";
import {
	DEC_LOSS,
	IEC_LOSS,
	labGateStatus,
	PEC_LOSS,
	printScores,
	scoreLoop,
	type LossMatrix,
} from "./score.ts";
import type {
	LabCase,
	LabLoop,
	LabLoopScore,
	LabStandard,
	LabVerdict,
} from "./types.ts";

export interface LabHoldoutSuiteScore {
	suiteId: string;
	scores: Record<LabLoop, LabLoopScore>;
	gate: ReturnType<typeof labGateStatus>;
}

export interface LabHoldoutScoreReport {
	filePath: string;
	suites: LabHoldoutSuiteScore[];
	gate: ReturnType<typeof labGateStatus>;
}

export function scoreHoldoutBundle(
	bundle: LabHoldoutBundle,
): LabHoldoutScoreReport {
	const suites = bundle.suites.map((suite): LabHoldoutSuiteScore => {
		const scores = scoreHoldoutCases(suite.cases);
		return { suiteId: suite.id, scores, gate: holdoutGateStatus(scores) };
	});
	return {
		filePath: bundle.filePath,
		suites,
		gate: holdoutReportGate(suites),
	};
}

export function scoreHoldoutCases(
	cases: LabCase<unknown>[],
): Record<LabLoop, LabLoopScore> {
	return {
		decision: scoreTypedHoldoutLoop<DecisionLabInput>({
			loop: "decision",
			metric: "DEC",
			cases,
			standards: decisionExitCandidate.standards,
			evaluate: evaluateDecisionCandidate,
			lossMatrix: DEC_LOSS,
		}),
		planning: scoreTypedHoldoutLoop<PlanningLabInput>({
			loop: "planning",
			metric: "PEC",
			cases,
			standards: planningExitCandidate.standards,
			evaluate: evaluatePlanningCandidate,
			lossMatrix: PEC_LOSS,
		}),
		implementation: scoreTypedHoldoutLoop<ImplementationLabInput>({
			loop: "implementation",
			metric: "IEC",
			cases,
			standards: implementationExitCandidate.standards,
			evaluate: evaluateImplementationCandidate,
			lossMatrix: IEC_LOSS,
		}),
	};
}

function scoreTypedHoldoutLoop<TInput>({
	loop,
	metric,
	cases,
	standards,
	evaluate,
	lossMatrix,
}: {
	loop: LabLoop;
	metric: LabLoopScore["metric"];
	cases: LabCase<unknown>[];
	standards: LabStandard<TInput>[];
	evaluate: (input: TInput) => LabVerdict;
	lossMatrix: LossMatrix;
}): LabLoopScore {
	return scoreLoop({
		loop,
		metric,
		cases: cases
			.filter((testCase) => testCase.loop === loop)
			.map((testCase) => ({ ...testCase, input: testCase.input as TInput })),
		standards,
		evaluate,
		lossMatrix,
	});
}

function holdoutGateStatus(
	scores: Record<LabLoop, LabLoopScore>,
): ReturnType<typeof labGateStatus> {
	const baseGate = labGateStatus(scores);
	const missingCaseBlockers = Object.values(scores).flatMap((score) =>
		score.caseCount === 0
			? [`${score.metric} has no holdout cases in this suite.`]
			: [],
	);
	const blockers = [...baseGate.blockers, ...missingCaseBlockers];
	return { status: blockers.length === 0 ? "pass" : "fail", blockers };
}

function holdoutReportGate(
	suites: LabHoldoutSuiteScore[],
): ReturnType<typeof labGateStatus> {
	const blockers = suites.flatMap((suite) =>
		suite.gate.blockers.map((blocker) => `${suite.suiteId}: ${blocker}`),
	);
	return { status: blockers.length === 0 ? "pass" : "fail", blockers };
}

function printHoldoutReport(report: LabHoldoutScoreReport): void {
	console.log(`Holdout: ${report.filePath}`);
	for (const suite of report.suites) {
		console.log(`Suite: ${suite.suiteId}`);
		printScores(suite.scores);
		console.log(`Suite gate: ${suite.gate.status}`);
		for (const blocker of suite.gate.blockers) console.log(`  - ${blocker}`);
	}
	console.log(`Holdout gate: ${report.gate.status}`);
	for (const blocker of report.gate.blockers) console.log(`  - ${blocker}`);
}

function parseFileArg(argv: string[]): string | undefined {
	const fileFlagIndex = argv.indexOf("--file");
	if (fileFlagIndex >= 0) return argv[fileFlagIndex + 1];
	return process.env.CODEWIKI_LAB_HOLDOUT_FILE;
}

async function main(argv = process.argv.slice(2)) {
	const filePath = parseFileArg(argv);
	if (!filePath) {
		throw new Error(
			"Provide --file <path> or CODEWIKI_LAB_HOLDOUT_FILE. Holdout files must live outside the repository and must not be committed.",
		);
	}
	const report = scoreHoldoutBundle(
		loadLabHoldoutBundle({
			filePath,
			allowRepoLocal: argv.includes("--allow-repo-local"),
		}),
	);
	if (argv.includes("--json")) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		printHoldoutReport(report);
	}
	if (argv.includes("--gate") && report.gate.status !== "pass") {
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
