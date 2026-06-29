#!/usr/bin/env node
import { createHash } from "node:crypto";
import { DECISION_LOOP_GRAPH } from "../../src/decision/loop.ts";
import {
	createHttpLoopQualityJudge,
	resolveLoopQualityJudgeProviderConfig,
} from "../../src/loops/judge-provider.ts";
import type { LoopQualityJudge } from "../../src/loops/judge.ts";
import { IMPLEMENTATION_LOOP_GRAPH } from "../../src/implementation/loop.ts";
import { loopQualityGraphHash } from "../../src/loops/graph.ts";
import { PLANNING_LOOP_GRAPH } from "../../src/planning/loop.ts";
import { decisionLoopCandidate } from "../decision/loop.ts";
import { implementationLoopCandidate } from "../implementation/loop.ts";
import { scorePipeline } from "../pipeline/score.ts";
import { planningLoopCandidate } from "../planning/loop.ts";
import {
	calibrateLoopQualityJudge,
	loadJudgeCalibrationBundle,
	type JudgeCalibrationReport,
} from "./judge-calibration.ts";
import { buildLabObjectiveReport } from "./objective.ts";
import { labGateStatus, scoreAllLoops } from "./score.ts";
import type { LabCandidateStandards, LabLoop } from "./types.ts";

export type LabPromotionStatus = "eligible" | "blocked";
export type LabPromotionRequirementStatus = "pass" | "block";

export interface LabPromotionOptions {
	holdoutFilePath?: string;
	allowRepoLocalHoldout?: boolean;
	humanReviewRef?: string;
	objectiveThreshold?: number;
	judgeCalibrationFilePath?: string;
	allowRepoLocalJudgeCalibration?: boolean;
	requireJudgeCalibration?: boolean;
	judgeCalibrationThreshold?: number;
	judge?: LoopQualityJudge;
}

export interface LabPromotionRequirement {
	id: string;
	status: LabPromotionRequirementStatus;
	message: string;
	refs: string[];
}

export interface LabPromotionGraphDiffEntry {
	loop: LabLoop;
	production: {
		graphId: string;
		graphVersion: string;
		hash: string;
		path: string;
	};
	candidate: {
		graphId: string;
		graphVersion: string;
		hash: string;
		path: string;
	};
	changed: boolean;
}

export interface LabPromotionEligibilityReport {
	version: 1;
	status: LabPromotionStatus;
	objectiveThreshold: number;
	requirements: LabPromotionRequirement[];
	graphDiff: LabPromotionGraphDiffEntry[];
}

const DEFAULT_OBJECTIVE_THRESHOLD = 95;

export function buildPromotionEligibilityReport(
	options: LabPromotionOptions = {},
): LabPromotionEligibilityReport {
	const objectiveThreshold =
		options.objectiveThreshold ?? DEFAULT_OBJECTIVE_THRESHOLD;
	const objective = buildLabObjectiveReport({
		holdoutFilePath: options.holdoutFilePath,
		allowRepoLocalHoldout: options.allowRepoLocalHoldout,
	});
	const visibleGate = labGateStatus(scoreAllLoops());
	const pipeline = scorePipeline();
	const graphDiff = buildPromotionGraphDiff();
	const requirements: LabPromotionRequirement[] = [
		{
			id: "visible_gate",
			status: visibleGate.status === "pass" ? "pass" : "block",
			message:
				visibleGate.status === "pass"
					? "Visible DEC/PEC/IEC gates pass."
					: visibleGate.blockers.join(" "),
			refs: [
				"lab/runner/score.ts",
				"lab/decision/loop.ts",
				"lab/planning/loop.ts",
				"lab/implementation/loop.ts",
			],
		},
		{
			id: "pipeline_gate",
			status: pipelineRequirementStatus(pipeline, objectiveThreshold),
			message: pipelineRequirementMessage(pipeline, objectiveThreshold),
			refs: ["lab/pipeline/score.ts", "lab/pipeline/cases.ts"],
		},
		{
			id: "sealed_holdout",
			status:
				objective.mode === "sealed" &&
				objective.components.HCE.score >= objective.components.HCE.threshold &&
				objective.hardGates.blockers.length === 0
					? "pass"
					: "block",
			message:
				objective.mode === "sealed"
					? `Sealed holdout ${objective.holdout?.gateStatus ?? "fail"}; HCE ${objective.components.HCE.score}/${objective.components.HCE.threshold}.`
					: "No sealed holdout was provided; promotion cannot rely on visible cases only.",
			refs: options.holdoutFilePath
				? [options.holdoutFilePath]
				: ["lab/runner/holdout.ts", "lab/runner/holdout-score.ts"],
		},
		{
			id: "objective_threshold",
			status:
				objective.status === "pass" && objective.score >= objectiveThreshold
					? "pass"
					: "block",
			message: `Objective status ${objective.status}; score ${objective.score}/${objectiveThreshold}.`,
			refs: ["lab/runner/objective.ts"],
		},
		{
			id: "graph_diff",
			status:
				graphDiff.length === 3 && graphDiff.some((entry) => entry.changed)
					? "pass"
					: "block",
			message:
				graphDiff.length === 3 && graphDiff.some((entry) => entry.changed)
					? "Promotion graph diff is available for decision, planning, and implementation candidates."
					: "Promotion requires an explicit graph diff with candidate changes.",
			refs: graphDiff.flatMap((entry) => [
				entry.production.path,
				entry.candidate.path,
			]),
		},
		judgeCalibrationRequirementPreview(options),
		{
			id: "human_review",
			status: options.humanReviewRef ? "pass" : "block",
			message: options.humanReviewRef
				? `Human review recorded at ${options.humanReviewRef}.`
				: "Promotion requires an explicit human-review reference.",
			refs: options.humanReviewRef
				? [options.humanReviewRef]
				: ["lab/program.md"],
		},
	];
	return {
		version: 1,
		status: requirements.every((requirement) => requirement.status === "pass")
			? "eligible"
			: "blocked",
		objectiveThreshold,
		requirements,
		graphDiff,
	};
}

export async function buildPromotionEligibilityReportWithJudgeCalibration(
	options: LabPromotionOptions = {},
): Promise<LabPromotionEligibilityReport> {
	const report = buildPromotionEligibilityReport(options);
	const requirement = await judgeCalibrationRequirement({ options });
	return replaceRequirement(report, requirement);
}

function replaceRequirement(
	report: LabPromotionEligibilityReport,
	requirement: LabPromotionRequirement,
): LabPromotionEligibilityReport {
	const requirements = report.requirements.map((candidate) =>
		candidate.id === requirement.id ? requirement : candidate,
	);
	return {
		...report,
		status: requirements.every((candidate) => candidate.status === "pass")
			? "eligible"
			: "blocked",
		requirements,
	};
}

function judgeCalibrationRequirementPreview(
	options: LabPromotionOptions,
): LabPromotionRequirement {
	const required =
		Boolean(options.requireJudgeCalibration) ||
		Boolean(options.judgeCalibrationFilePath);
	if (!required) {
		return {
			id: "judge_calibration",
			status: "pass",
			message:
				"No quality judge calibration is required because no judge promotion gate was requested.",
			refs: ["lab/runner/judge-calibration.ts"],
		};
	}
	if (!options.judgeCalibrationFilePath) {
		return {
			id: "judge_calibration",
			status: "block",
			message:
				"Judge calibration is required but no sealed judge calibration bundle was provided.",
			refs: ["lab/runner/judge-calibration.ts"],
		};
	}
	return {
		id: "judge_calibration",
		status: "block",
		message:
			"Judge calibration bundle was provided; use the async promotion report to run calibration.",
		refs: [options.judgeCalibrationFilePath],
	};
}

async function judgeCalibrationRequirement(
	input: { options?: LabPromotionOptions } = {},
): Promise<LabPromotionRequirement> {
	const options = input.options || {};
	const preview = judgeCalibrationRequirementPreview(options);
	if (preview.status === "pass" || !options.judgeCalibrationFilePath) {
		return preview;
	}
	if (!options.judge) {
		return {
			id: "judge_calibration",
			status: "block",
			message:
				"Judge calibration requires a configured quality judge endpoint or injected judge.",
			refs: [options.judgeCalibrationFilePath],
		};
	}
	const report = await calibrateLoopQualityJudge(
		loadJudgeCalibrationBundle({
			filePath: options.judgeCalibrationFilePath,
			allowRepoLocal: options.allowRepoLocalJudgeCalibration,
		}),
		options.judge,
		{ threshold: options.judgeCalibrationThreshold },
	);
	return judgeCalibrationRequirementFromReport(report);
}

function judgeCalibrationRequirementFromReport(
	report: JudgeCalibrationReport,
): LabPromotionRequirement {
	return {
		id: "judge_calibration",
		status: report.status === "pass" ? "pass" : "block",
		message:
			report.status === "pass"
				? `Judge calibration passed: score ${report.score}/${report.threshold}; false passes ${report.falsePasses}; over-blocks ${report.overBlocks}.`
				: `Judge calibration failed: score ${report.score}/${report.threshold}; false passes ${report.falsePasses}; over-blocks ${report.overBlocks}. ${report.blockers.join(" ")}`,
		refs: [report.filePath],
	};
}

export function buildPromotionGraphDiff(): LabPromotionGraphDiffEntry[] {
	return [
		promotionGraphDiffEntry({
			loop: "decision",
			productionGraph: DECISION_LOOP_GRAPH,
			productionPath: "src/decision/loop.ts",
			candidate: decisionLoopCandidate,
			candidatePath: "lab/decision/loop.ts",
		}),
		promotionGraphDiffEntry({
			loop: "planning",
			productionGraph: PLANNING_LOOP_GRAPH,
			productionPath: "src/planning/loop.ts",
			candidate: planningLoopCandidate,
			candidatePath: "lab/planning/loop.ts",
		}),
		promotionGraphDiffEntry({
			loop: "implementation",
			productionGraph: IMPLEMENTATION_LOOP_GRAPH,
			productionPath: "src/implementation/loop.ts",
			candidate: implementationLoopCandidate,
			candidatePath: "lab/implementation/loop.ts",
		}),
	];
}

function promotionGraphDiffEntry(input: {
	loop: LabLoop;
	productionGraph: {
		graphId: string;
		graphVersion: string;
	};
	productionPath: string;
	candidate: LabCandidateStandards<unknown>;
	candidatePath: string;
}): LabPromotionGraphDiffEntry {
	const productionHash = loopQualityGraphHash(input.productionGraph as never);
	const candidateHash = candidateHashFor(input.candidate);
	return {
		loop: input.loop,
		production: {
			graphId: input.productionGraph.graphId,
			graphVersion: input.productionGraph.graphVersion,
			hash: productionHash,
			path: input.productionPath,
		},
		candidate: {
			graphId: input.candidate.graphId,
			graphVersion: input.candidate.graphVersion,
			hash: candidateHash,
			path: input.candidatePath,
		},
		changed: productionHash !== candidateHash,
	};
}

function candidateHashFor(candidate: LabCandidateStandards<unknown>): string {
	return `sha256:${createHash("sha256")
		.update(stableJson(candidate))
		.digest("hex")}`;
}

function pipelineRequirementStatus(
	pipeline: ReturnType<typeof scorePipeline>,
	threshold: number,
): LabPromotionRequirementStatus {
	return pipeline.score >= threshold &&
		pipeline.falsePasses === 0 &&
		pipeline.expectedPassRegressions === 0
		? "pass"
		: "block";
}

function pipelineRequirementMessage(
	pipeline: ReturnType<typeof scorePipeline>,
	threshold: number,
): string {
	return `PCE score ${pipeline.score}/${threshold}; false passes ${pipeline.falsePasses}; expected-pass regressions ${pipeline.expectedPassRegressions}.`;
}

function stableJson(value: unknown): string {
	if (typeof value === "function") return JSON.stringify("[function]");
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function parsePromotionOptions(argv: string[]): LabPromotionOptions {
	return {
		holdoutFilePath:
			stringFlag(argv, "--holdout") || process.env.CODEWIKI_LAB_HOLDOUT_FILE,
		allowRepoLocalHoldout: argv.includes("--allow-repo-local"),
		humanReviewRef:
			stringFlag(argv, "--human-review-ref") ||
			process.env.CODEWIKI_LAB_HUMAN_REVIEW_REF,
		objectiveThreshold: numberFlag(argv, "--objective-threshold"),
		judgeCalibrationFilePath:
			stringFlag(argv, "--judge-calibration") ||
			process.env.CODEWIKI_JUDGE_CALIBRATION_FILE,
		allowRepoLocalJudgeCalibration: argv.includes(
			"--allow-repo-local-judge-calibration",
		),
		requireJudgeCalibration: argv.includes("--require-judge-calibration"),
		judgeCalibrationThreshold: numberFlag(
			argv,
			"--judge-calibration-threshold",
		),
	};
}

function stringFlag(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	if (index < 0) return undefined;
	return argv[index + 1];
}

function numberFlag(argv: string[], flag: string): number | undefined {
	const value = stringFlag(argv, flag);
	if (!value) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive number.`);
	}
	return parsed;
}

function printPromotionReport(report: LabPromotionEligibilityReport): void {
	console.log(`Promotion: ${report.status}`);
	for (const requirement of report.requirements) {
		console.log(
			`${requirement.status === "pass" ? "✓" : "✗"} ${requirement.id}: ${requirement.message}`,
		);
	}
	console.log("Graph diff:");
	for (const entry of report.graphDiff) {
		console.log(
			`  - ${entry.loop}: ${entry.production.graphId}@${entry.production.graphVersion} -> ${entry.candidate.graphId}@${entry.candidate.graphVersion} (${entry.changed ? "changed" : "unchanged"})`,
		);
	}
}

async function main(argv = process.argv.slice(2)) {
	const options = parsePromotionOptions(argv);
	if (options.judgeCalibrationFilePath || options.requireJudgeCalibration) {
		const provider = resolveLoopQualityJudgeProviderConfig({
			env: process.env,
		});
		if (provider.enabled && provider.provider === "http" && provider.endpoint) {
			options.judge = createHttpLoopQualityJudge({
				endpoint: provider.endpoint,
				promptVersion: provider.promptVersion,
				timeoutMs: provider.timeoutMs,
			});
		}
	}
	const report =
		await buildPromotionEligibilityReportWithJudgeCalibration(options);
	if (argv.includes("--json")) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		printPromotionReport(report);
	}
	if (argv.includes("--gate") && report.status !== "eligible") {
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
