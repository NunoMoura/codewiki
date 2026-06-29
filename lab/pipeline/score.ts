#!/usr/bin/env node
import { pipelineCases } from "./cases.ts";
import { buildPipelineTrace } from "./trace-harness.ts";
import type {
	PipelineCase,
	PipelineCaseInput,
	PipelineCaseScore,
	PipelineEvaluationIssue,
	PipelineScore,
} from "./types.ts";
import type { LabVerdict } from "../runner/types.ts";

const PCE_LOSS: Record<LabVerdict, Record<LabVerdict, number>> = {
	pass: { pass: 0, fail: 2, block: 4 },
	fail: { pass: 12, fail: 0, block: 1 },
	block: { pass: 14, fail: 3, block: 0 },
};

export function scorePipeline(cases = pipelineCases): PipelineScore {
	const caseScores = cases.map(scorePipelineCase);
	const loss = caseScores.reduce((sum, testCase) => sum + testCase.loss, 0);
	const maxLoss = caseScores.reduce(
		(sum, testCase) => sum + testCase.maxLoss,
		0,
	);
	const score = maxLoss === 0 ? 100 : 100 * (1 - loss / maxLoss);
	return {
		metric: "PCE",
		score: roundScore(score),
		caseCount: caseScores.length,
		falsePasses: caseScores.filter((testCase) => testCase.falsePass).length,
		expectedPassRegressions: caseScores.filter(
			(testCase) => testCase.expectedPassRegression,
		).length,
		cases: caseScores,
	};
}

export function scorePipelineCase(testCase: PipelineCase): PipelineCaseScore {
	const issues = evaluatePipelineTrace(testCase.input);
	const observed = observedVerdict(issues);
	const unitLoss = PCE_LOSS[testCase.expected][observed];
	const maxUnitLoss = Math.max(
		...Object.entries(PCE_LOSS[testCase.expected])
			.filter(([verdict]) => verdict !== testCase.expected)
			.map(([, loss]) => loss),
	);
	return {
		id: testCase.id,
		expected: testCase.expected,
		observed,
		weight: testCase.weight,
		score: unitLoss === 0 ? 100 : 0,
		loss: unitLoss * testCase.weight,
		maxLoss: maxUnitLoss * testCase.weight,
		correct: observed === testCase.expected,
		falsePass: observed === "pass" && testCase.expected !== "pass",
		expectedPassRegression: testCase.expected === "pass" && observed !== "pass",
		issues,
	};
}

export function evaluatePipelineTrace(
	input: PipelineCaseInput,
): PipelineEvaluationIssue[] {
	buildPipelineTrace(input);
	return [
		...decisionFactIssues(input),
		...planningFactIssues(input),
		...planningRefIssues(input),
		...implementationFactIssues(input),
		...implementationCoverageIssues(input),
		...implementationRefIssues(input),
	];
}

export function printPipelineScore(score = scorePipeline()): void {
	console.log(
		`${score.metric}: ${score.score} (${score.falsePasses} false pass, ${score.expectedPassRegressions} pass regression, ${score.caseCount} cases)`,
	);
	for (const testCase of score.cases.filter((item) => !item.correct)) {
		console.log(
			`  - ${testCase.id}: expected ${testCase.expected}, observed ${testCase.observed}`,
		);
		for (const issue of testCase.issues) console.log(`    - ${issue.message}`);
	}
}

function decisionFactIssues(
	input: PipelineCaseInput,
): PipelineEvaluationIssue[] {
	return missingFacts(
		"decision_missing_fact",
		"decision row",
		input.expectedFacts.map((fact) => fact.id),
		input.decision.facts,
	);
}

function planningFactIssues(
	input: PipelineCaseInput,
): PipelineEvaluationIssue[] {
	const planningFacts = input.planning.workItems.flatMap(
		(workItem) => workItem.facts,
	);
	return missingFacts(
		"planning_missing_fact",
		"planning work items",
		input.expectedFacts.map((fact) => fact.id),
		planningFacts,
	);
}

function planningRefIssues(
	input: PipelineCaseInput,
): PipelineEvaluationIssue[] {
	return input.planning.workItems.flatMap((workItem) =>
		workItem.decisionRefs.includes(input.decision.rowId)
			? []
			: [
					{
						id: "planning_missing_decision_ref",
						severity: "error" as const,
						message: `Planning work item ${workItem.id} does not reference decision row ${input.decision.rowId}.`,
					},
				],
	);
}

function implementationFactIssues(
	input: PipelineCaseInput,
): PipelineEvaluationIssue[] {
	const implementationFacts = input.implementation.changes.flatMap(
		(change) => change.facts,
	);
	return missingFacts(
		"implementation_missing_fact",
		"implementation evidence",
		input.expectedFacts.map((fact) => fact.id),
		implementationFacts,
	);
}

function implementationCoverageIssues(
	input: PipelineCaseInput,
): PipelineEvaluationIssue[] {
	const covered = input.implementation.changes.flatMap(
		(change) => change.acceptanceCovered,
	);
	return input.planning.workItems.flatMap((workItem) =>
		workItem.acceptanceCriteria
			.filter((acceptanceId) => !covered.includes(acceptanceId))
			.map((acceptanceId) => ({
				id: "implementation_missing_acceptance_coverage",
				severity: "error" as const,
				message: `Implementation evidence does not cover ${acceptanceId} from ${workItem.id}.`,
			})),
	);
}

function implementationRefIssues(
	input: PipelineCaseInput,
): PipelineEvaluationIssue[] {
	const implementationRefs = input.implementation.changes.flatMap(
		(change) => change.workItemRefs,
	);
	return input.planning.workItems
		.filter((workItem) => !implementationRefs.includes(workItem.id))
		.map((workItem) => ({
			id: "implementation_missing_work_item_ref",
			severity: "error" as const,
			message: `Implementation evidence does not reference planning work item ${workItem.id}.`,
		}));
}

function missingFacts(
	id: string,
	stage: string,
	expectedFactIds: string[],
	observedFactIds: string[],
): PipelineEvaluationIssue[] {
	return expectedFactIds
		.filter((factId) => !observedFactIds.includes(factId))
		.map((factId) => ({
			id,
			severity: "error" as const,
			message: `Expected fact ${factId} is missing from ${stage}.`,
		}));
}

function observedVerdict(issues: PipelineEvaluationIssue[]): LabVerdict {
	return issues.length === 0 ? "pass" : "fail";
}

function roundScore(value: number): number {
	return Math.round(value * 100) / 100;
}

async function main(argv = process.argv.slice(2)) {
	const score = scorePipeline();
	if (argv.includes("--json")) {
		console.log(JSON.stringify(score, null, 2));
	} else {
		printPipelineScore(score);
	}
	if (argv.includes("--gate") && score.score !== 100) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
