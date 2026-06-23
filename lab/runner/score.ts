#!/usr/bin/env node
import { scoreDecisionExit } from "../decision/score.ts";
import { scoreImplementationExit } from "../implementation/score.ts";
import { scorePlanningExit } from "../planning/score.ts";
import type {
	LabCase,
	LabCaseScore,
	LabLoop,
	LabLoopScore,
	LabStandard,
	LabStandardMode,
	LabVerdict,
} from "./types.ts";
import { countStandardModes } from "./engine.ts";

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

export function scoreLoop<TInput>({
	loop,
	metric,
	cases,
	standards,
	evaluate,
	lossMatrix,
}: {
	loop: LabLoop;
	metric: LabLoopScore["metric"];
	cases: LabCase<TInput>[];
	standards: LabStandard<TInput>[];
	evaluate: (input: TInput) => LabVerdict;
	lossMatrix: LossMatrix;
}): LabLoopScore {
	const caseScores = cases.map((testCase): LabCaseScore => {
		const observed = evaluate(testCase.input);
		const unitLoss = lossMatrix[testCase.expected][observed];
		const unitMaxLoss = Math.max(
			...Object.entries(lossMatrix[testCase.expected])
				.filter(([verdict]) => verdict !== testCase.expected)
				.map(([, loss]) => loss),
		);
		return {
			id: testCase.id,
			loop,
			expected: testCase.expected,
			observed,
			weight: testCase.weight,
			loss: unitLoss * testCase.weight,
			maxLoss: unitMaxLoss * testCase.weight,
			correct: observed === testCase.expected,
			falsePass: observed === "pass" && testCase.expected !== "pass",
			expectedPassRegression:
				testCase.expected === "pass" && observed !== "pass",
		};
	});
	const loss = caseScores.reduce((sum, item) => sum + item.loss, 0);
	const maxLoss = caseScores.reduce((sum, item) => sum + item.maxLoss, 0);
	const routeQuality = maxLoss === 0 ? 100 : 100 * (1 - loss / maxLoss);
	return {
		loop,
		metric,
		score: roundScore(routeQuality),
		routeQuality: roundScore(routeQuality),
		cases: caseScores,
		caseCount: caseScores.length,
		falsePasses: caseScores.filter((item) => item.falsePass).length,
		expectedPassRegressions: caseScores.filter(
			(item) => item.expectedPassRegression,
		).length,
		standardCounts: countStandardModes(standards),
	};
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
			console.log(
				`  - ${testCase.id}: expected ${testCase.expected}, observed ${testCase.observed}`,
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
