#!/usr/bin/env node
import { scoreDecisionExit } from "../decision/score.ts";
import { scoreImplementationExit } from "../implementation/score.ts";
import { scorePlanningExit } from "../planning/score.ts";
import type {
	LabCase,
	LabCaseScore,
	LabExpectedFailure,
	LabExitResult,
	LabLoop,
	LabLoopScore,
	LabStandard,
	LabStandardMode,
	LabVerdict,
} from "./types.ts";
import { countStandardModes, runLabExit } from "./engine.ts";

export type LossMatrix = Record<LabVerdict, Record<LabVerdict, number>>;

export const DEC_LOSS: LossMatrix = {
	pass: { pass: 0, fail: 2, block: 4 },
	fail: { pass: 8, fail: 0, block: 1 },
	block: { pass: 10, fail: 3, block: 0 },
};

export const PEC_LOSS: LossMatrix = {
	pass: { pass: 0, fail: 2, block: 4 },
	fail: { pass: 10, fail: 0, block: 1 },
	block: { pass: 12, fail: 3, block: 0 },
};

export const IEC_LOSS: LossMatrix = {
	pass: { pass: 0, fail: 1, block: 3 },
	fail: { pass: 15, fail: 0, block: 1 },
	block: { pass: 18, fail: 3, block: 0 },
};

const REASON_LOSS_UNIT = 2;

export function scoreLoop<TInput>({
	loop,
	metric,
	cases,
	standards,
	lossMatrix,
}: {
	loop: LabLoop;
	metric: LabLoopScore["metric"];
	cases: LabCase<TInput>[];
	standards: LabStandard<TInput>[];
	lossMatrix: LossMatrix;
}): LabLoopScore {
	const caseScores = cases.map((testCase): LabCaseScore => {
		const exit = runLabExit({ input: testCase.input, standards });
		const observed = exit.verdict;
		const unitRouteLoss = lossMatrix[testCase.expected][observed];
		const unitRouteMaxLoss = maxRouteLoss(lossMatrix, testCase.expected);
		const expectedFailures = testCase.expectedFailures || [];
		const missedExpectedFailures = missedExpectedStandards(
			expectedFailures,
			exit,
		);
		const unitReasonLoss = reasonLoss(expectedFailures, missedExpectedFailures);
		const unitReasonMaxLoss =
			expectedFailures.length === 0 ? 0 : REASON_LOSS_UNIT;
		const routeLoss = unitRouteLoss * testCase.weight;
		const reasonLossValue = unitReasonLoss * testCase.weight;
		const routeCorrect = observed === testCase.expected;
		const reasonCorrect = missedExpectedFailures.length === 0;
		return {
			id: testCase.id,
			loop,
			expected: testCase.expected,
			observed,
			weight: testCase.weight,
			loss: routeLoss + reasonLossValue,
			maxLoss: (unitRouteMaxLoss + unitReasonMaxLoss) * testCase.weight,
			routeLoss,
			reasonLoss: reasonLossValue,
			correct: routeCorrect && reasonCorrect,
			routeCorrect,
			reasonCorrect,
			falsePass: observed === "pass" && testCase.expected !== "pass",
			expectedPassRegression:
				testCase.expected === "pass" && observed !== "pass",
			expectedFailures,
			observedFailureStandards: exit.standards
				.filter((standard) => !standard.passed)
				.map((standard) => standard.id),
			missedExpectedFailures,
		};
	});
	const loss = caseScores.reduce((sum, item) => sum + item.loss, 0);
	const maxLoss = caseScores.reduce((sum, item) => sum + item.maxLoss, 0);
	const routeLoss = caseScores.reduce((sum, item) => sum + item.routeLoss, 0);
	const routeMaxLoss = cases.reduce(
		(sum, item) => sum + maxRouteLoss(lossMatrix, item.expected) * item.weight,
		0,
	);
	const reasonLossTotal = caseScores.reduce(
		(sum, item) => sum + item.reasonLoss,
		0,
	);
	const reasonMaxLoss = caseScores.reduce(
		(sum, item) =>
			sum +
			(item.expectedFailures.length === 0 ? 0 : REASON_LOSS_UNIT * item.weight),
		0,
	);
	const routeQuality =
		routeMaxLoss === 0 ? 100 : 100 * (1 - routeLoss / routeMaxLoss);
	const reasonQuality =
		reasonMaxLoss === 0 ? 100 : 100 * (1 - reasonLossTotal / reasonMaxLoss);
	const totalQuality = maxLoss === 0 ? 100 : 100 * (1 - loss / maxLoss);
	return {
		loop,
		metric,
		score: roundScore(totalQuality),
		routeQuality: roundScore(routeQuality),
		reasonQuality: roundScore(reasonQuality),
		cases: caseScores,
		caseCount: caseScores.length,
		falsePasses: caseScores.filter((item) => item.falsePass).length,
		expectedPassRegressions: caseScores.filter(
			(item) => item.expectedPassRegression,
		).length,
		standardCounts: countStandardModes(standards),
	};
}

function maxRouteLoss(lossMatrix: LossMatrix, expected: LabVerdict): number {
	return Math.max(
		...Object.entries(lossMatrix[expected])
			.filter(([verdict]) => verdict !== expected)
			.map(([, loss]) => loss),
	);
}

function missedExpectedStandards(
	expectedFailures: LabExpectedFailure[],
	exit: LabExitResult,
): LabExpectedFailure[] {
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

function reasonLoss(
	expectedFailures: LabExpectedFailure[],
	missedFailures: LabExpectedFailure[],
): number {
	if (expectedFailures.length === 0) return 0;
	return REASON_LOSS_UNIT * (missedFailures.length / expectedFailures.length);
}

export function scoreAllLoops(): Record<LabLoop, LabLoopScore> {
	return {
		decision: scoreDecisionExit(),
		planning: scorePlanningExit(),
		implementation: scoreImplementationExit(),
	};
}

export function labGateStatus(scores: Record<LabLoop, LabLoopScore>): {
	status: "pass" | "fail";
	blockers: string[];
} {
	const blockers = Object.values(scores).flatMap((score) => [
		...(score.falsePasses > 0
			? [`${score.metric} has ${score.falsePasses} false pass(es).`]
			: []),
		...(score.expectedPassRegressions > 0
			? [
					`${score.metric} has ${score.expectedPassRegressions} expected-pass regression(s).`,
				]
			: []),
		...(score.score < 100
			? [`${score.metric} is ${score.score}, not 100.`]
			: []),
	]);
	return { status: blockers.length === 0 ? "pass" : "fail", blockers };
}

export function printScores(scores: Record<LabLoop, LabLoopScore>): void {
	for (const score of Object.values(scores)) {
		console.log(
			`${score.metric}: ${score.score} (${score.falsePasses} false pass, ${score.expectedPassRegressions} pass regression, ${score.caseCount} cases, standards d/a/u=${modeCount(score.standardCounts)})`,
		);
		for (const testCase of score.cases.filter((item) => !item.correct)) {
			const missingReasons = testCase.missedExpectedFailures
				.map((failure) => `${failure.standardId}/${failure.failureClass}`)
				.join(", ");
			console.log(
				`  - ${testCase.id}: expected ${testCase.expected}, observed ${testCase.observed}${missingReasons ? `, missed ${missingReasons}` : ""}`,
			);
		}
	}
}

function modeCount(counts: Record<LabStandardMode, number>): string {
	return `${counts.deterministic}/${counts.agent}/${counts.user}`;
}

function roundScore(value: number): number {
	return Math.round(value * 100) / 100;
}

async function main(argv = process.argv.slice(2)) {
	const json = argv.includes("--json");
	const gate = argv.includes("--gate");
	const scores = scoreAllLoops();
	const gateStatus = labGateStatus(scores);
	if (json) {
		console.log(JSON.stringify({ scores, gate: gateStatus }, null, 2));
	} else {
		printScores(scores);
		console.log(`Gate: ${gateStatus.status}`);
		for (const blocker of gateStatus.blockers) console.log(`  - ${blocker}`);
	}
	if (gate && gateStatus.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
