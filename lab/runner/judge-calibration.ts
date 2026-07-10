#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
	createHttpLoopQualityJudge,
	resolveLoopQualityJudgeProviderConfig,
} from "../../src/loops/judge-provider.ts";
import {
	loopQualityJudgeCacheKey,
	loopQualityJudgeInputEvidenceHash,
	type LoopQualityJudge,
	type LoopQualityJudgeRequest,
	type LoopQualityJudgeVerdict,
} from "../../src/loops/judge.ts";
import type { LoopQualityStandardMethod } from "../../src/traces/types.ts";
import { parseJsonObject } from "../../src/utils/json.ts";
import type { LabVerdict } from "./types.ts";

export interface JudgeCalibrationCase {
	suiteId: string;
	id: string;
	description: string;
	standardId: string;
	method: LoopQualityStandardMethod | string;
	gate: "hard" | "soft";
	expected: LabVerdict;
	weight: number;
	graphId: string;
	graphVersion: string;
	standardDescription: string;
	message?: string;
	refs: string[];
	evidenceRefs: string[];
	judgeInput?: unknown;
}

export interface JudgeCalibrationSuite {
	id: string;
	description?: string;
	cases: JudgeCalibrationCase[];
}

export interface JudgeCalibrationBundle {
	version: 1;
	filePath: string;
	suites: JudgeCalibrationSuite[];
}

export interface LoadJudgeCalibrationBundleOptions {
	filePath: string;
	repoRoot?: string;
	allowRepoLocal?: boolean;
}

export interface JudgeCalibrationCaseScore {
	suiteId: string;
	id: string;
	standardId: string;
	expected: LabVerdict;
	observed: LabVerdict;
	weight: number;
	correct: boolean;
	falsePass: boolean;
	overBlock: boolean;
	message: string;
}

export interface JudgeCalibrationReport {
	version: 1;
	filePath: string;
	promptVersion: string;
	threshold: number;
	status: "pass" | "fail";
	score: number;
	caseCount: number;
	falsePasses: number;
	overBlocks: number;
	cases: JudgeCalibrationCaseScore[];
	blockers: string[];
}

export interface CalibrateJudgeOptions {
	threshold?: number;
}

const DEFAULT_CALIBRATION_THRESHOLD = 95;
const VALID_VERDICTS = new Set<LabVerdict>(["pass", "fail", "block"]);
const VALID_GATES = new Set(["hard", "soft"]);

export function loadJudgeCalibrationBundle({
	filePath,
	repoRoot = process.cwd(),
	allowRepoLocal = false,
}: LoadJudgeCalibrationBundleOptions): JudgeCalibrationBundle {
	const resolvedFilePath = resolve(filePath);
	if (!existsSync(resolvedFilePath)) {
		throw new Error(
			`Judge calibration file does not exist: ${resolvedFilePath}`,
		);
	}
	if (!allowRepoLocal && isInsidePath(resolvedFilePath, resolve(repoRoot))) {
		throw new Error(
			"Judge calibration holdout files must live outside the repository so candidate agents cannot inspect or edit them.",
		);
	}
	const parsed = parseJsonObject(
		readFileSync(resolvedFilePath, "utf8"),
		`judge calibration file ${resolvedFilePath}`,
	);
	return validateJudgeCalibrationBundle(parsed, resolvedFilePath);
}

export async function calibrateLoopQualityJudge(
	bundle: JudgeCalibrationBundle,
	judge: LoopQualityJudge,
	options: CalibrateJudgeOptions = {},
): Promise<JudgeCalibrationReport> {
	const threshold = options.threshold ?? DEFAULT_CALIBRATION_THRESHOLD;
	const cases = bundle.suites.flatMap((suite) => suite.cases);
	const requests = cases.map((testCase) =>
		judgeCalibrationRequest(testCase, judge.promptVersion),
	);
	const verdicts = await judge.judge(requests);
	const scores = cases.map((testCase): JudgeCalibrationCaseScore => {
		const verdict = verdicts.find(
			(candidate) => candidate.standardId === testCase.standardId,
		);
		const observed = normalizeObservedVerdict(verdict);
		return {
			suiteId: testCase.suiteId,
			id: testCase.id,
			standardId: testCase.standardId,
			expected: testCase.expected,
			observed,
			weight: testCase.weight,
			correct: observed === testCase.expected,
			falsePass: testCase.expected !== "pass" && observed === "pass",
			overBlock: testCase.expected === "pass" && observed === "block",
			message: verdict?.message || "Judge returned no verdict.",
		};
	});
	const totalWeight = scores.reduce((sum, score) => sum + score.weight, 0);
	const correctWeight = scores.reduce(
		(sum, score) => sum + (score.correct ? score.weight : 0),
		0,
	);
	const score = roundScore(
		totalWeight === 0 ? 0 : (correctWeight / totalWeight) * 100,
	);
	const falsePasses = scores.filter((item) => item.falsePass).length;
	const overBlocks = scores.filter((item) => item.overBlock).length;
	const blockers = [
		...(falsePasses > 0
			? [`${falsePasses} judge false pass(es) on sealed calibration cases.`]
			: []),
		...(score < threshold
			? [`Judge calibration score ${score} is below threshold ${threshold}.`]
			: []),
	];
	return {
		version: 1,
		filePath: bundle.filePath,
		promptVersion: judge.promptVersion,
		threshold,
		status: blockers.length === 0 ? "pass" : "fail",
		score,
		caseCount: scores.length,
		falsePasses,
		overBlocks,
		cases: scores,
		blockers,
	};
}

export function judgeCalibrationRequest(
	testCase: JudgeCalibrationCase,
	promptVersion: string,
): LoopQualityJudgeRequest {
	const graphHash = hashObject({
		graphId: testCase.graphId,
		graphVersion: testCase.graphVersion,
		standardId: testCase.standardId,
		method: testCase.method,
		gate: testCase.gate,
		standardDescription: testCase.standardDescription,
	});
	const node = {
		id: testCase.standardId,
		description: testCase.standardDescription,
		codes: [] as string[],
		layer: "evidence_quality" as const,
		standardType: "evidence_quality" as const,
		method: testCase.method as LoopQualityStandardMethod,
		repairTarget: "decision" as const,
		weight: 1,
		cost: 1,
		gate: testCase.gate,
	};
	const standard = {
		id: testCase.standardId,
		status: "met" as const,
		mode: "agent" as const,
		description: testCase.standardDescription,
		message: testCase.message,
		refs: testCase.refs,
		evidenceRefs: testCase.evidenceRefs,
	};
	const inputEvidenceHash = loopQualityJudgeInputEvidenceHash({
		node,
		standard,
		judgeInput: testCase.judgeInput,
	});
	const cacheKey = loopQualityJudgeCacheKey({
		graphHash,
		promptVersion,
		inputEvidenceHash,
	});
	return {
		cacheKey,
		promptVersion,
		graphHash,
		graphId: testCase.graphId,
		graphVersion: testCase.graphVersion,
		standardId: testCase.standardId,
		method: testCase.method,
		gate: testCase.gate,
		description: testCase.standardDescription,
		standard,
		inputEvidenceHash,
		judgeInput: testCase.judgeInput,
	};
}

function validateJudgeCalibrationBundle(
	value: unknown,
	filePath: string,
): JudgeCalibrationBundle {
	const record = objectRecord(value, "judge calibration bundle");
	if (record.version !== 1) {
		throw new Error("Judge calibration bundle version must be 1.");
	}
	if (!Array.isArray(record.suites) || record.suites.length === 0) {
		throw new Error(
			"Judge calibration bundle must include at least one suite.",
		);
	}
	const suiteIds = new Set<string>();
	const caseIds = new Set<string>();
	const standardIds = new Set<string>();
	const suites = record.suites.map((suiteValue): JudgeCalibrationSuite => {
		const suite = objectRecord(suiteValue, "judge calibration suite");
		const id = stringValue(suite.id, "suite.id");
		if (suiteIds.has(id))
			throw new Error(`Duplicate calibration suite id: ${id}`);
		suiteIds.add(id);
		if (!Array.isArray(suite.cases) || suite.cases.length === 0) {
			throw new Error(
				`Calibration suite ${id} must include at least one case.`,
			);
		}
		const cases = suite.cases.map((caseValue): JudgeCalibrationCase => {
			const testCase = validateJudgeCalibrationCase(caseValue, id);
			const caseKey = `${id}/${testCase.id}`;
			if (caseIds.has(caseKey))
				throw new Error(`Duplicate calibration case id: ${caseKey}`);
			caseIds.add(caseKey);
			if (standardIds.has(testCase.standardId)) {
				throw new Error(
					`Duplicate calibration standard id: ${testCase.standardId}. Standard ids must be unique so judge verdicts can be matched safely.`,
				);
			}
			standardIds.add(testCase.standardId);
			return testCase;
		});
		return {
			id,
			...(typeof suite.description === "string"
				? { description: suite.description }
				: {}),
			cases,
		};
	});
	return { version: 1, filePath, suites };
}

function validateJudgeCalibrationCase(
	value: unknown,
	suiteId: string,
): JudgeCalibrationCase {
	const record = objectRecord(value, "judge calibration case");
	const expected = labVerdict(record.expected);
	const gate = stringValue(record.gate ?? "soft", "case.gate");
	if (!VALID_GATES.has(gate))
		throw new Error("case.gate must be hard or soft.");
	return {
		suiteId,
		id: stringValue(record.id, "case.id"),
		description: stringValue(record.description, "case.description"),
		standardId: stringValue(record.standardId, "case.standardId"),
		method: stringValue(record.method, "case.method"),
		gate: gate as "hard" | "soft",
		expected,
		weight: positiveNumber(record.weight ?? 1, "case.weight"),
		graphId: stringValue(record.graphId ?? "judge.calibration", "case.graphId"),
		graphVersion: stringValue(
			record.graphVersion ?? "holdout",
			"case.graphVersion",
		),
		standardDescription: stringValue(
			record.standardDescription ?? record.description,
			"case.standardDescription",
		),
		message: typeof record.message === "string" ? record.message : undefined,
		refs: stringArray(record.refs, "case.refs"),
		evidenceRefs: stringArray(record.evidenceRefs, "case.evidenceRefs"),
		judgeInput: record.judgeInput,
	};
}

function normalizeObservedVerdict(
	verdict: LoopQualityJudgeVerdict | undefined,
): LabVerdict {
	if (!verdict) return "block";
	return verdict.status;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`Expected ${label} to be an object.`);
	}
	return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Expected ${label} to be a non-empty string.`);
	}
	return value;
}

function stringArray(value: unknown, label: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value))
		throw new Error(`Expected ${label} to be an array.`);
	return value.map((entry) => stringValue(entry, label));
}

function positiveNumber(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`Expected ${label} to be a positive number.`);
	}
	return value;
}

function labVerdict(value: unknown): LabVerdict {
	if (value === "pass" || value === "fail" || value === "block") return value;
	throw new Error(
		`Expected case.expected to be one of ${[...VALID_VERDICTS].join(", ")}.`,
	);
}

function isInsidePath(filePath: string, parentPath: string): boolean {
	const pathFromParent = relative(parentPath, filePath);
	return (
		Boolean(pathFromParent) &&
		!pathFromParent.startsWith("..") &&
		!pathFromParent.startsWith("/")
	);
}

function hashObject(value: unknown): string {
	return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function roundScore(value: number): number {
	return Math.round(value * 100) / 100;
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

function printCalibrationReport(report: JudgeCalibrationReport): void {
	console.log(`Judge calibration: ${report.status}`);
	console.log(`Score: ${report.score}/${report.threshold}`);
	console.log(`Cases: ${report.caseCount}`);
	console.log(`False passes: ${report.falsePasses}`);
	console.log(`Over-blocks: ${report.overBlocks}`);
	for (const blocker of report.blockers) console.log(`  - ${blocker}`);
}

function stringFlag(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	if (index < 0) return undefined;
	return argv[index + 1];
}

function numericFlag(argv: string[], flag: string): number | undefined {
	const value = stringFlag(argv, flag);
	if (!value) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive number.`);
	}
	return parsed;
}

async function main(argv = process.argv.slice(2)) {
	const filePath =
		stringFlag(argv, "--file") || process.env.CODEWIKI_JUDGE_CALIBRATION_FILE;
	if (!filePath) {
		throw new Error(
			"Provide --file <path> or CODEWIKI_JUDGE_CALIBRATION_FILE. Judge calibration files must live outside the repository and must not be committed.",
		);
	}
	const provider = resolveLoopQualityJudgeProviderConfig({ env: process.env });
	if (!provider.enabled || provider.provider !== "http" || !provider.endpoint) {
		throw new Error(
			"Configure an HTTP judge with CODEWIKI_LOOP_QUALITY_JUDGE_URL before running judge calibration.",
		);
	}
	const bundle = loadJudgeCalibrationBundle({
		filePath,
		allowRepoLocal: argv.includes("--allow-repo-local"),
	});
	const report = await calibrateLoopQualityJudge(
		bundle,
		createHttpLoopQualityJudge({
			endpoint: provider.endpoint,
			promptVersion: provider.promptVersion,
			timeoutMs: provider.timeoutMs,
		}),
		{ threshold: numericFlag(argv, "--threshold") },
	);
	if (argv.includes("--json")) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		printCalibrationReport(report);
	}
	if (argv.includes("--gate") && report.status !== "pass") {
		process.exitCode = 1;
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
