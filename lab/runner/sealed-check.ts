#!/usr/bin/env node
import { loadLabHoldoutBundle, type LabHoldoutBundle } from "./holdout.ts";
import {
	loadJudgeCalibrationBundle,
	type JudgeCalibrationBundle,
} from "./judge-calibration.ts";
import type { LabLoop, LabVerdict } from "./types.ts";

export interface SealedCheckOptions {
	holdoutFilePath?: string;
	judgeCalibrationFilePath?: string;
	repoRoot?: string;
	allowRepoLocal?: boolean;
	minCasesPerLoop?: number;
	allowMissingPassCase?: boolean;
	allowMissingNegativeCase?: boolean;
}

export interface SealedCheckSection {
	status: "pass" | "fail";
	filePath: string;
	suiteCount: number;
	caseCount: number;
	blockers: string[];
	placeholderPaths: string[];
}

export interface HoldoutCheckSection extends SealedCheckSection {
	loopCounts: Record<LabLoop, Record<LabVerdict, number>>;
}

export interface JudgeCalibrationCheckSection extends SealedCheckSection {
	expectedCounts: Record<LabVerdict, number>;
	methods: Record<string, number>;
}

export interface SealedCheckReport {
	version: 1;
	status: "pass" | "fail" | "blocked";
	holdout?: HoldoutCheckSection;
	judgeCalibration?: JudgeCalibrationCheckSection;
	blockers: string[];
}

const LAB_LOOPS: LabLoop[] = ["decision", "planning", "implementation"];
const LAB_VERDICTS: LabVerdict[] = ["pass", "fail", "block"];
const DEFAULT_MIN_CASES_PER_LOOP = 2;
const PLACEHOLDER_PATTERNS = [
	/replace with private/i,
	/replace placeholder/i,
	/private off-repo cases/i,
	/private human-labeled/i,
	/private human-authored/i,
	/private:replace/i,
	/replace-with-current-graph-version/i,
	/replace-with-case-ref/i,
	/placeholder inputs/i,
];

export function checkSealedBundles(
	options: SealedCheckOptions = {},
): SealedCheckReport {
	if (!options.holdoutFilePath && !options.judgeCalibrationFilePath) {
		return {
			version: 1,
			status: "blocked",
			blockers: [
				"Provide --holdout, --judge-calibration, or both sealed bundle paths.",
			],
		};
	}
	const holdout = options.holdoutFilePath
		? checkHoldoutBundle(options.holdoutFilePath, options)
		: undefined;
	const judgeCalibration = options.judgeCalibrationFilePath
		? checkJudgeCalibrationBundle(options.judgeCalibrationFilePath, options)
		: undefined;
	const blockers = [
		...(holdout?.blockers.map((blocker) => `holdout: ${blocker}`) || []),
		...(judgeCalibration?.blockers.map(
			(blocker) => `judgeCalibration: ${blocker}`,
		) || []),
	];
	return {
		version: 1,
		status: blockers.length === 0 ? "pass" : "fail",
		...(holdout ? { holdout } : {}),
		...(judgeCalibration ? { judgeCalibration } : {}),
		blockers,
	};
}

function checkHoldoutBundle(
	filePath: string,
	options: SealedCheckOptions,
): HoldoutCheckSection {
	try {
		const bundle = loadLabHoldoutBundle({
			filePath,
			repoRoot: options.repoRoot,
			allowRepoLocal: options.allowRepoLocal,
		});
		return holdoutSection(bundle, options);
	} catch (error) {
		return failedHoldoutSection(filePath, error);
	}
}

function holdoutSection(
	bundle: LabHoldoutBundle,
	options: SealedCheckOptions,
): HoldoutCheckSection {
	const loopCounts = emptyLoopCounts();
	for (const suite of bundle.suites) {
		for (const testCase of suite.cases) {
			loopCounts[testCase.loop][testCase.expected] += 1;
		}
	}
	const placeholderPaths = placeholderPathsFor(bundle.suites);
	const negativeReasonBlockers = missingExpectedFailureBlockers(bundle);
	const minCasesPerLoop = options.minCasesPerLoop ?? DEFAULT_MIN_CASES_PER_LOOP;
	const blockers = [
		...LAB_LOOPS.flatMap((loop) =>
			holdoutLoopBlockers(loop, loopCounts[loop], {
				minCasesPerLoop,
				allowMissingPassCase: options.allowMissingPassCase,
				allowMissingNegativeCase: options.allowMissingNegativeCase,
			}),
		),
		...negativeReasonBlockers,
		...placeholderBlockers(placeholderPaths),
	];
	return {
		status: blockers.length === 0 ? "pass" : "fail",
		filePath: bundle.filePath,
		suiteCount: bundle.suites.length,
		caseCount: bundle.suites.reduce(
			(sum, suite) => sum + suite.cases.length,
			0,
		),
		loopCounts,
		blockers,
		placeholderPaths,
	};
}

function missingExpectedFailureBlockers(bundle: LabHoldoutBundle): string[] {
	return bundle.suites.flatMap((suite) =>
		suite.cases.flatMap((testCase) =>
			testCase.expected !== "pass" &&
			(testCase.expectedFailures || []).length === 0
				? [
						`${testCase.loop}/${testCase.id} has no expectedFailures reason labels.`,
					]
				: [],
		),
	);
}

function holdoutLoopBlockers(
	loop: LabLoop,
	counts: Record<LabVerdict, number>,
	options: {
		minCasesPerLoop: number;
		allowMissingPassCase?: boolean;
		allowMissingNegativeCase?: boolean;
	},
): string[] {
	const total = verdictTotal(counts);
	const negativeCount = counts.fail + counts.block;
	return [
		...(total < options.minCasesPerLoop
			? [
					`${loop} has ${total} case(s), below minimum ${options.minCasesPerLoop}.`,
				]
			: []),
		...(!options.allowMissingPassCase && counts.pass === 0
			? [`${loop} has no expected-pass control case.`]
			: []),
		...(!options.allowMissingNegativeCase && negativeCount === 0
			? [`${loop} has no expected fail/block false-pass trap.`]
			: []),
	];
}

function checkJudgeCalibrationBundle(
	filePath: string,
	options: SealedCheckOptions,
): JudgeCalibrationCheckSection {
	try {
		const bundle = loadJudgeCalibrationBundle({
			filePath,
			repoRoot: options.repoRoot,
			allowRepoLocal: options.allowRepoLocal,
		});
		return judgeCalibrationSection(bundle, options);
	} catch (error) {
		return failedJudgeSection(filePath, error);
	}
}

function judgeCalibrationSection(
	bundle: JudgeCalibrationBundle,
	options: SealedCheckOptions,
): JudgeCalibrationCheckSection {
	const expectedCounts = emptyVerdictCounts();
	const methods: Record<string, number> = {};
	for (const suite of bundle.suites) {
		for (const testCase of suite.cases) {
			expectedCounts[testCase.expected] += 1;
			methods[testCase.method] = (methods[testCase.method] || 0) + 1;
		}
	}
	const placeholderPaths = placeholderPathsFor(bundle.suites);
	const blockers = [
		...(options.allowMissingPassCase || expectedCounts.pass > 0
			? []
			: ["Judge calibration has no expected-pass control case."]),
		...(options.allowMissingNegativeCase ||
		expectedCounts.fail + expectedCounts.block > 0
			? []
			: ["Judge calibration has no expected fail/block false-pass trap."]),
		...placeholderBlockers(placeholderPaths),
	];
	return {
		status: blockers.length === 0 ? "pass" : "fail",
		filePath: bundle.filePath,
		suiteCount: bundle.suites.length,
		caseCount: bundle.suites.reduce(
			(sum, suite) => sum + suite.cases.length,
			0,
		),
		expectedCounts,
		methods,
		blockers,
		placeholderPaths,
	};
}

function failedHoldoutSection(
	filePath: string,
	error: unknown,
): HoldoutCheckSection {
	return {
		status: "fail",
		filePath,
		suiteCount: 0,
		caseCount: 0,
		loopCounts: emptyLoopCounts(),
		blockers: [errorMessage(error)],
		placeholderPaths: [],
	};
}

function failedJudgeSection(
	filePath: string,
	error: unknown,
): JudgeCalibrationCheckSection {
	return {
		status: "fail",
		filePath,
		suiteCount: 0,
		caseCount: 0,
		expectedCounts: emptyVerdictCounts(),
		methods: {},
		blockers: [errorMessage(error)],
		placeholderPaths: [],
	};
}

function placeholderBlockers(paths: string[]): string[] {
	return paths.length > 0
		? [
				`Bundle still contains template placeholders at ${paths.slice(0, 8).join(", ")}${paths.length > 8 ? " ..." : ""}.`,
			]
		: [];
}

function placeholderPathsFor(value: unknown): string[] {
	return scanPlaceholders(value, "$", []);
}

function scanPlaceholders(
	value: unknown,
	path: string,
	paths: string[],
): string[] {
	if (typeof value === "string") {
		if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
			paths.push(path);
		}
		return paths;
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) =>
			scanPlaceholders(entry, `${path}[${index}]`, paths),
		);
		return paths;
	}
	if (typeof value === "object" && value !== null) {
		for (const [key, entry] of Object.entries(value)) {
			const childPath = `${path}.${key}`;
			if (key === "__replaceWithPrivateInput") paths.push(childPath);
			scanPlaceholders(entry, childPath, paths);
		}
	}
	return paths;
}

function emptyLoopCounts(): Record<LabLoop, Record<LabVerdict, number>> {
	return {
		decision: emptyVerdictCounts(),
		planning: emptyVerdictCounts(),
		implementation: emptyVerdictCounts(),
	};
}

function emptyVerdictCounts(): Record<LabVerdict, number> {
	return { pass: 0, fail: 0, block: 0 };
}

function verdictTotal(counts: Record<LabVerdict, number>): number {
	return LAB_VERDICTS.reduce((sum, verdict) => sum + counts[verdict], 0);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function parseSealedCheckArgs(argv: string[]): SealedCheckOptions & {
	json: boolean;
	gate: boolean;
} {
	return {
		holdoutFilePath: stringFlag(argv, "--holdout"),
		judgeCalibrationFilePath: stringFlag(argv, "--judge-calibration"),
		allowRepoLocal: argv.includes("--allow-repo-local"),
		minCasesPerLoop: numberFlag(argv, "--min-cases-per-loop"),
		allowMissingPassCase: argv.includes("--allow-missing-pass-case"),
		allowMissingNegativeCase: argv.includes("--allow-missing-negative-case"),
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
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${flag} must be a positive integer.`);
	}
	return value;
}

function printReport(report: SealedCheckReport): void {
	console.log(`Sealed check: ${report.status}`);
	if (report.holdout) {
		console.log(`Holdout: ${report.holdout.status}`);
		for (const blocker of report.holdout.blockers)
			console.log(`  - ${blocker}`);
	}
	if (report.judgeCalibration) {
		console.log(`Judge calibration: ${report.judgeCalibration.status}`);
		for (const blocker of report.judgeCalibration.blockers) {
			console.log(`  - ${blocker}`);
		}
	}
	for (const blocker of report.blockers) console.log(`Blocker: ${blocker}`);
}

function main(argv = process.argv.slice(2)) {
	const args = parseSealedCheckArgs(argv);
	const report = checkSealedBundles(args);
	if (args.json) console.log(JSON.stringify(report, null, 2));
	else printReport(report);
	if (args.gate && report.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		main();
	} catch (error) {
		console.error(errorMessage(error));
		process.exitCode = 1;
	}
}
