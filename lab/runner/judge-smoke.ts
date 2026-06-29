#!/usr/bin/env node
import { createHash } from "node:crypto";
import { loadWikiConfigFile } from "../../src/project/config-file.ts";
import {
	createHttpLoopQualityJudge,
	resolveLoopQualityJudgeProviderConfig,
} from "../../src/loops/judge-provider.ts";
import { LOOP_QUALITY_JUDGE_PROMPT_VERSION } from "../../src/loops/judge-prompts.ts";
import {
	loopQualityJudgeCacheKey,
	loopQualityJudgeInputEvidenceHash,
	type LoopQualityJudge,
	type LoopQualityJudgeRequest,
	type LoopQualityJudgeVerdict,
} from "../../src/loops/judge.ts";
import {
	loopQualityJudgeSpecForNode,
	type LoopQualityGraphNode,
} from "../../src/loops/graph.ts";
import type {
	LoopQualityStandardMethod,
	LoopQualityStandardResult,
} from "../../src/traces/types.ts";

export type JudgeSmokeStatus = "pass" | "fail" | "blocked";
export type JudgeSmokeLoop = "decision" | "planning" | "implementation";

export interface JudgeSmokeOptions {
	repoRoot?: string;
	env?: NodeJS.ProcessEnv;
	endpoint?: string;
	promptVersion?: string;
	timeoutMs?: number;
	judge?: LoopQualityJudge;
}

export interface JudgeSmokeVerdictSummary {
	standardId: string;
	status: string;
	message: string;
	score?: number;
}

export interface JudgeSmokeLoopReport {
	loop: JudgeSmokeLoop;
	status: JudgeSmokeStatus;
	requestCount: number;
	verdicts: JudgeSmokeVerdictSummary[];
	blockers: string[];
	latencyMs: number;
}

export interface JudgeSmokeReport {
	version: 1;
	status: JudgeSmokeStatus;
	promptVersion: string;
	provider: "http" | "injected" | "none";
	endpoint?: string;
	loops: JudgeSmokeLoopReport[];
	blockers: string[];
}

interface SmokeStandardSpec {
	id: string;
	method: LoopQualityStandardMethod;
	gate: "soft" | "hard";
	layer: LoopQualityGraphNode<string>["layer"];
	standardType: LoopQualityGraphNode<string>["standardType"];
	repairTarget: LoopQualityGraphNode<string>["repairTarget"];
	description: string;
}

interface SmokeLoopSpec {
	loop: JudgeSmokeLoop;
	graphId: string;
	graphVersion: string;
	judgeInput: Record<string, unknown>;
	standards: SmokeStandardSpec[];
}

const SMOKE_LOOPS: SmokeLoopSpec[] = [
	{
		loop: "decision",
		graphId: "decision.loop.smoke",
		graphVersion: "smoke",
		judgeInput: {
			loop: "decision",
			approvedRows: [
				{
					id: "DTR-smoke",
					currentState:
						"Decision standards need semantic review after deterministic fields pass.",
					desiredState:
						"A judge receives loop evidence and returns per-standard verdicts.",
					rationale:
						"This smoke packet validates provider protocol without private holdout data.",
					effort: "low",
					workScale: "small",
					risk: "low",
				},
			],
		},
		standards: [
			{
				id: "decision_semantically_sufficient",
				method: "model_judge",
				gate: "soft",
				layer: "specificity",
				standardType: "user_value",
				repairTarget: "decision",
				description:
					"Judge whether decision intent is specific, coherent, and planning-ready.",
			},
			{
				id: "cost_tradeoff_plausible",
				method: "model_judge",
				gate: "soft",
				layer: "project_fit",
				standardType: "maintainability",
				repairTarget: "decision",
				description:
					"Judge whether stated effort and maintainer impact fit the change scope.",
			},
		],
	},
	{
		loop: "planning",
		graphId: "planning.loop.smoke",
		graphVersion: "smoke",
		judgeInput: {
			loop: "planning",
			workItems: [
				{
					id: "WU-smoke",
					outcome:
						"Add batched judge provider protocol checks for loop quality review.",
					pathScopes: ["lab/runner/judge-smoke.ts"],
					acceptanceCriteria: [
						"Smoke report includes one verdict per semantic standard id.",
					],
					verification: ["npm run lab:judge-smoke -- --json"],
				},
			],
		},
		standards: [
			{
				id: "work_unit_atomic_judged",
				method: "model_judge",
				gate: "soft",
				layer: "scope_control",
				standardType: "scope_control",
				repairTarget: "planning",
				description:
					"Judge whether each work unit is atomic enough for one implementation worker.",
			},
			{
				id: "acceptance_criteria_testable_judged",
				method: "model_judge",
				gate: "soft",
				layer: "evidence_quality",
				standardType: "evidence_quality",
				repairTarget: "planning",
				description:
					"Judge whether acceptance criteria are concrete enough to verify completion.",
			},
		],
	},
	{
		loop: "implementation",
		graphId: "implementation.loop.smoke",
		graphVersion: "smoke",
		judgeInput: {
			loop: "implementation",
			changes: [
				{
					id: "CHANGE-smoke",
					codePaths: ["lab/runner/judge-smoke.ts"],
					checks: ["npm run typecheck"],
					acceptanceEvidence: [
						"Endpoint returned one verdict per smoke standard id.",
					],
					implementationAssessment: {
						productionReady: true,
						rationale:
							"Smoke command validates protocol only; sealed calibration still owns semantic quality.",
					},
				},
			],
		},
		standards: [
			{
				id: "evidence_matches_claims_judged",
				method: "model_judge",
				gate: "soft",
				layer: "evidence_quality",
				standardType: "evidence_quality",
				repairTarget: "implementation",
				description:
					"Judge whether implementation evidence supports the claimed changes.",
			},
			{
				id: "checks_relevant_judged",
				method: "model_judge",
				gate: "soft",
				layer: "evidence_quality",
				standardType: "robustness",
				repairTarget: "implementation",
				description: "Judge whether checks are relevant to changed behavior.",
			},
		],
	},
];

export async function runJudgeSmoke(
	options: JudgeSmokeOptions = {},
): Promise<JudgeSmokeReport> {
	const resolved = await resolveSmokeJudge(options);
	if (!resolved.judge) {
		const blockers = [
			"No enabled judge endpoint. Set CODEWIKI_LOOP_QUALITY_JUDGE_URL or pass --url.",
		];
		return {
			version: 1,
			status: "blocked",
			promptVersion: resolved.promptVersion,
			provider: "none",
			blockers,
			loops: [],
		};
	}
	const judge = resolved.judge;
	const loops = await Promise.all(
		SMOKE_LOOPS.map((loop) => runSmokeLoop(loop, judge)),
	);
	const blockers = loops.flatMap((loop) =>
		loop.blockers.map((blocker) => `${loop.loop}: ${blocker}`),
	);
	return {
		version: 1,
		status: blockers.length === 0 ? "pass" : "fail",
		promptVersion: judge.promptVersion,
		provider: resolved.provider,
		...(resolved.endpoint ? { endpoint: resolved.endpoint } : {}),
		loops,
		blockers,
	};
}

function buildSmokeRequests(
	loop: SmokeLoopSpec,
	promptVersion: string,
): LoopQualityJudgeRequest[] {
	const graphHash = hashObject({
		graphId: loop.graphId,
		graphVersion: loop.graphVersion,
		standards: loop.standards.map((standard) => standard.id),
	});
	return loop.standards.map((spec) => {
		const node: LoopQualityGraphNode<string> = {
			id: spec.id,
			description: spec.description,
			codes: [],
			layer: spec.layer,
			standardType: spec.standardType,
			method: spec.method,
			repairTarget: spec.repairTarget,
			weight: 1,
			cost: 1,
			gate: spec.gate,
		};
		const judge = loopQualityJudgeSpecForNode(node);
		const standard: LoopQualityStandardResult = {
			id: spec.id,
			status: "met",
			mode: "agent",
			description: spec.description,
			graphId: loop.graphId,
			graphVersion: loop.graphVersion,
			graphHash,
			layer: spec.layer,
			standardType: spec.standardType,
			method: spec.method,
			gate: spec.gate,
			cost: 1,
			score: 100,
			repairTarget: spec.repairTarget,
			evidenceRefs: [`smoke:${loop.loop}`],
		};
		const inputEvidenceHash = loopQualityJudgeInputEvidenceHash({
			node,
			standard,
			judgeInput: loop.judgeInput,
		});
		return {
			cacheKey: loopQualityJudgeCacheKey({
				graphHash,
				promptVersion,
				inputEvidenceHash,
			}),
			promptVersion,
			graphHash,
			graphId: loop.graphId,
			graphVersion: loop.graphVersion,
			standardId: spec.id,
			method: spec.method,
			gate: spec.gate,
			description: spec.description,
			standard,
			inputEvidenceHash,
			...(judge ? { judge } : {}),
			judgeInput: loop.judgeInput,
		};
	});
}

async function runSmokeLoop(
	loop: SmokeLoopSpec,
	judge: LoopQualityJudge,
): Promise<JudgeSmokeLoopReport> {
	const startedAt = Date.now();
	const requests = buildSmokeRequests(loop, judge.promptVersion);
	try {
		const verdicts = await judge.judge(requests);
		const blockers = smokeLoopBlockers(requests, verdicts);
		return {
			loop: loop.loop,
			status: blockers.length === 0 ? "pass" : "fail",
			requestCount: requests.length,
			verdicts: verdicts.map((verdict) => ({
				standardId: verdict.standardId,
				status: verdict.status,
				message: verdict.message,
				...(verdict.score === undefined ? {} : { score: verdict.score }),
			})),
			blockers,
			latencyMs: Math.max(0, Date.now() - startedAt),
		};
	} catch (error) {
		return {
			loop: loop.loop,
			status: "fail",
			requestCount: requests.length,
			verdicts: [],
			blockers: [error instanceof Error ? error.message : String(error)],
			latencyMs: Math.max(0, Date.now() - startedAt),
		};
	}
}

function smokeLoopBlockers(
	requests: LoopQualityJudgeRequest[],
	verdicts: LoopQualityJudgeVerdict[],
): string[] {
	return requests.flatMap((request) => {
		const verdict = verdicts.find(
			(candidate) => candidate.standardId === request.standardId,
		);
		if (!verdict)
			return [`Missing verdict for standard ${request.standardId}.`];
		const blockers: string[] = [];
		if (typeof verdict.score !== "number" || !Number.isFinite(verdict.score)) {
			blockers.push(
				`Missing numeric score for standard ${request.standardId}.`,
			);
		} else if (
			verdict.status === "pass" &&
			request.judge &&
			verdict.score < request.judge.scoreThreshold
		) {
			blockers.push(
				`Score ${verdict.score} is below threshold ${request.judge.scoreThreshold} for standard ${request.standardId}.`,
			);
		}
		return blockers;
	});
}

async function resolveSmokeJudge(options: JudgeSmokeOptions): Promise<{
	judge?: LoopQualityJudge;
	provider: "http" | "injected" | "none";
	endpoint?: string;
	promptVersion: string;
}> {
	if (options.judge) {
		return {
			judge: options.judge,
			provider: "injected",
			promptVersion: options.judge.promptVersion,
		};
	}
	const config = options.repoRoot
		? await loadWikiConfigFile(options.repoRoot)
		: undefined;
	const providerConfig = resolveLoopQualityJudgeProviderConfig({
		config,
		env: options.env,
	});
	const endpoint = options.endpoint || providerConfig.endpoint;
	const endpointExplicit = Boolean(options.endpoint);
	const endpointEnabled = endpointExplicit || providerConfig.enabled;
	const promptVersion =
		options.promptVersion ||
		providerConfig.promptVersion ||
		LOOP_QUALITY_JUDGE_PROMPT_VERSION;
	if (!endpoint || !endpointEnabled) {
		return { provider: "none", promptVersion };
	}
	return {
		judge: createHttpLoopQualityJudge({
			endpoint,
			promptVersion,
			timeoutMs: options.timeoutMs || providerConfig.timeoutMs || 30_000,
		}),
		provider: "http",
		endpoint,
		promptVersion,
	};
}

function hashObject(value: unknown): string {
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")}`;
}

function parseJudgeSmokeArgs(argv: string[]): JudgeSmokeOptions & {
	json: boolean;
	gate: boolean;
} {
	return {
		endpoint: stringFlag(argv, "--url"),
		promptVersion: stringFlag(argv, "--prompt-version"),
		timeoutMs: numberFlag(argv, "--timeout-ms"),
		json: argv.includes("--json"),
		gate: argv.includes("--gate"),
	};
}

function stringFlag(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	return index >= 0 ? argv[index + 1] : undefined;
}

function numberFlag(argv: string[], flag: string): number | undefined {
	const raw = stringFlag(argv, flag);
	if (!raw) return undefined;
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${flag} must be a positive integer.`);
	}
	return value;
}

function printJudgeSmokeReport(report: JudgeSmokeReport): void {
	console.log(`Judge smoke: ${report.status}`);
	console.log(`Provider: ${report.provider}`);
	console.log(`Prompt: ${report.promptVersion}`);
	for (const loop of report.loops) {
		console.log(`${loop.status === "pass" ? "✓" : "✗"} ${loop.loop}`);
		for (const blocker of loop.blockers) console.log(`  - ${blocker}`);
	}
	for (const blocker of report.blockers) console.log(`Blocker: ${blocker}`);
}

async function main(argv = process.argv.slice(2)) {
	const args = parseJudgeSmokeArgs(argv);
	const report = await runJudgeSmoke(args);
	if (args.json) console.log(JSON.stringify(report, null, 2));
	else printJudgeSmokeReport(report);
	if (args.gate && report.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
