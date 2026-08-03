#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL } from "../../src/loop-exit/security-scanner-checks.ts";
import {
	SECURITY_SCANNER_PROTOCOL,
	type SecurityScannerType,
} from "../../src/loop-exit/security-scanners.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
} from "../../src/utils/canonical-json.ts";
import { assertExactKeys, parseJsonObject } from "../../src/utils/json.ts";

export const SECURITY_ROUTE_CALIBRATION_PROTOCOL = Object.freeze({
	id: "codewiki.security-route-calibration",
	version: "1.0.0",
	scannerSuiteProtocol: `${SECURITY_SCANNER_PROTOCOL.id}@${SECURITY_SCANNER_PROTOCOL.version}`,
	atomicEvaluatorProtocol: `${ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL.id}@${ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL.version}`,
} as const);

const SCANNER_TYPES = Object.freeze([
	"static_analysis",
	"dependency_advisory",
	"secret_detection",
	"infrastructure_configuration",
	"authorization_test",
	"migration_test",
] as const satisfies readonly SecurityScannerType[]);
const OUTCOMES = Object.freeze(["pass", "fail", "indeterminate"] as const);
const SEVERITIES = Object.freeze([
	"none",
	"low",
	"medium",
	"high",
	"critical",
] as const);
const MAX_ROUTES = 8;
const MAX_SUITES = 32;
const MAX_CASES = 1_024;
const DEFAULT_SCORE_THRESHOLD = 95;

type CalibrationOutcome = (typeof OUTCOMES)[number];
type CalibrationSeverity = (typeof SEVERITIES)[number];

export interface SecurityCalibrationObservation {
	readonly routeId: string;
	readonly observed: CalibrationOutcome;
	readonly scannerIdentity: string;
	readonly scannerRequestDigest: string;
	readonly environmentDigest: string;
	readonly configurationDigest: string;
	readonly artifactDigest: string;
	readonly latencyMs: number;
	readonly costUsd: number;
	readonly evidenceRefs: readonly string[];
	readonly limitations: readonly string[];
}

export interface SecurityCalibrationCase {
	readonly suiteId: string;
	readonly id: string;
	readonly scannerType: SecurityScannerType;
	readonly expected: CalibrationOutcome;
	readonly severity: CalibrationSeverity;
	readonly failureClass?: string;
	readonly sourceSnapshotDigest: string;
	readonly observations: readonly SecurityCalibrationObservation[];
}

export interface SecurityCalibrationRoute {
	readonly id: string;
	readonly description: string;
	readonly evaluatorIdentity: string;
	readonly configurationDigest: string;
}

export interface SecurityCalibrationSuite {
	readonly id: string;
	readonly description: string;
	readonly cases: readonly SecurityCalibrationCase[];
}

export interface SecurityCalibrationBundle {
	readonly protocol: typeof SECURITY_ROUTE_CALIBRATION_PROTOCOL.id;
	readonly protocolVersion: typeof SECURITY_ROUTE_CALIBRATION_PROTOCOL.version;
	readonly scannerSuiteProtocol: typeof SECURITY_ROUTE_CALIBRATION_PROTOCOL.scannerSuiteProtocol;
	readonly atomicEvaluatorProtocol: typeof SECURITY_ROUTE_CALIBRATION_PROTOCOL.atomicEvaluatorProtocol;
	readonly filePath: string;
	readonly routes: readonly SecurityCalibrationRoute[];
	readonly suites: readonly SecurityCalibrationSuite[];
	readonly bundleDigest: string;
}

export interface SecurityCalibrationCaseResult {
	readonly suiteId: string;
	readonly caseId: string;
	readonly scannerType: SecurityScannerType;
	readonly expected: CalibrationOutcome;
	readonly observed: CalibrationOutcome;
	readonly severity: CalibrationSeverity;
	readonly correct: boolean;
	readonly falsePass: boolean;
	readonly falseFailure: boolean;
	readonly escapedCriticalDefect: boolean;
	readonly latencyMs: number;
	readonly costUsd: number;
}

export interface SecurityCalibrationRouteReport {
	readonly routeId: string;
	readonly evaluatorIdentity: string;
	readonly status: "pass" | "fail";
	readonly score: number;
	readonly caseCount: number;
	readonly falsePasses: number;
	readonly falseFailures: number;
	readonly escapedCriticalDefects: number;
	readonly indeterminate: number;
	readonly indeterminateRate: number;
	readonly totalLatencyMs: number;
	readonly meanLatencyMs: number;
	readonly p95LatencyMs: number;
	readonly totalCostUsd: number;
	readonly meanCostUsd: number;
	readonly cases: readonly SecurityCalibrationCaseResult[];
	readonly blockers: readonly string[];
}

export interface SecurityCalibrationReport {
	readonly protocol: typeof SECURITY_ROUTE_CALIBRATION_PROTOCOL.id;
	readonly protocolVersion: typeof SECURITY_ROUTE_CALIBRATION_PROTOCOL.version;
	readonly filePath: string;
	readonly bundleDigest: string;
	readonly threshold: number;
	readonly status: "pass" | "fail";
	readonly routes: readonly SecurityCalibrationRouteReport[];
	readonly blockers: readonly string[];
}

export function loadSecurityCalibrationBundle(input: {
	readonly filePath: string;
	readonly repoRoot?: string;
	readonly allowRepoLocal?: boolean;
}): SecurityCalibrationBundle {
	const filePath = resolve(input.filePath);
	if (!existsSync(filePath)) {
		throw new Error(`Security calibration file does not exist: ${filePath}`);
	}
	const repoRoot = resolve(input.repoRoot ?? process.cwd());
	if (!input.allowRepoLocal && isInsidePath(filePath, repoRoot)) {
		throw new Error(
			"Security calibration bundles must live outside the repository so candidate agents cannot inspect or edit sealed cases.",
		);
	}
	const parsed = parseJsonObject<Record<string, unknown>>(
		readFileSync(filePath, "utf8"),
		`security calibration file ${filePath}`,
	);
	return validateBundle(parsed, filePath);
}

export function calibrateSecurityRoutes(
	bundle: SecurityCalibrationBundle,
	options: { readonly threshold?: number } = {},
): SecurityCalibrationReport {
	const threshold = positiveThreshold(options.threshold ?? DEFAULT_SCORE_THRESHOLD);
	const cases = bundle.suites.flatMap((suite) => suite.cases);
	const routes = bundle.routes.map((route) =>
		calibrateRoute(route, cases, threshold),
	);
	const blockers = routes.flatMap((route) =>
		route.blockers.map((blocker) => `${route.routeId}: ${blocker}`),
	);
	return Object.freeze({
		protocol: SECURITY_ROUTE_CALIBRATION_PROTOCOL.id,
		protocolVersion: SECURITY_ROUTE_CALIBRATION_PROTOCOL.version,
		filePath: bundle.filePath,
		bundleDigest: bundle.bundleDigest,
		threshold,
		status: blockers.length === 0 ? "pass" : "fail",
		routes: Object.freeze(routes),
		blockers: Object.freeze(blockers),
	});
}

function calibrateRoute(
	route: SecurityCalibrationRoute,
	cases: readonly SecurityCalibrationCase[],
	threshold: number,
): SecurityCalibrationRouteReport {
	const results = cases.map((testCase): SecurityCalibrationCaseResult => {
		const observation = testCase.observations.find(
			(candidate) => candidate.routeId === route.id,
		);
		if (!observation) {
			throw new Error(
				`Security calibration case ${testCase.suiteId}/${testCase.id} is missing route ${route.id}.`,
			);
		}
		const falsePass =
			testCase.expected !== "pass" && observation.observed === "pass";
		const falseFailure =
			testCase.expected === "pass" && observation.observed === "fail";
		return Object.freeze({
			suiteId: testCase.suiteId,
			caseId: testCase.id,
			scannerType: testCase.scannerType,
			expected: testCase.expected,
			observed: observation.observed,
			severity: testCase.severity,
			correct: observation.observed === testCase.expected,
			falsePass,
			falseFailure,
			escapedCriticalDefect:
				testCase.severity === "critical" &&
				testCase.expected === "fail" &&
				observation.observed === "pass",
			latencyMs: observation.latencyMs,
			costUsd: observation.costUsd,
		});
	});
	const correct = results.filter((result) => result.correct).length;
	const score = round((correct / results.length) * 100, 2);
	const falsePasses = count(results, "falsePass");
	const falseFailures = count(results, "falseFailure");
	const escapedCriticalDefects = count(results, "escapedCriticalDefect");
	const indeterminate = results.filter(
		(result) => result.observed === "indeterminate",
	).length;
	const latency = results.map((result) => result.latencyMs);
	const totalLatencyMs = sum(latency);
	const totalCostUsd = round(
		sum(results.map((result) => result.costUsd)),
		6,
	);
	const blockers = [
		...(falsePasses > 0
			? [`${falsePasses} false pass(es) on sealed scanner cases.`]
			: []),
		...(escapedCriticalDefects > 0
			? [`${escapedCriticalDefects} escaped critical defect(s).`]
			: []),
		...(score < threshold
			? [`Calibration score ${score} is below threshold ${threshold}.`]
			: []),
	];
	return Object.freeze({
		routeId: route.id,
		evaluatorIdentity: route.evaluatorIdentity,
		status: blockers.length === 0 ? "pass" : "fail",
		score,
		caseCount: results.length,
		falsePasses,
		falseFailures,
		escapedCriticalDefects,
		indeterminate,
		indeterminateRate: round((indeterminate / results.length) * 100, 2),
		totalLatencyMs,
		meanLatencyMs: round(totalLatencyMs / results.length, 2),
		p95LatencyMs: percentile95(latency),
		totalCostUsd,
		meanCostUsd: round(totalCostUsd / results.length, 6),
		cases: Object.freeze(results),
		blockers: Object.freeze(blockers),
	});
}

function validateBundle(
	value: Record<string, unknown>,
	filePath: string,
): SecurityCalibrationBundle {
	assertExactKeys(
		value,
		[
			"protocol",
			"protocolVersion",
			"scannerSuiteProtocol",
			"atomicEvaluatorProtocol",
			"routes",
			"suites",
		],
		"Security calibration bundle",
	);
	exact(value.protocol, SECURITY_ROUTE_CALIBRATION_PROTOCOL.id, "protocol");
	exact(
		value.protocolVersion,
		SECURITY_ROUTE_CALIBRATION_PROTOCOL.version,
		"protocolVersion",
	);
	exact(
		value.scannerSuiteProtocol,
		SECURITY_ROUTE_CALIBRATION_PROTOCOL.scannerSuiteProtocol,
		"scannerSuiteProtocol",
	);
	exact(
		value.atomicEvaluatorProtocol,
		SECURITY_ROUTE_CALIBRATION_PROTOCOL.atomicEvaluatorProtocol,
		"atomicEvaluatorProtocol",
	);
	const routes = validateRoutes(value.routes);
	const suites = validateSuites(value.suites, routes.map((route) => route.id));
	const caseCount = suites.reduce((sum, suite) => sum + suite.cases.length, 0);
	if (caseCount > MAX_CASES) {
		throw new Error(`Security calibration bundles support at most ${MAX_CASES} cases.`);
	}
	assertScannerCoverage(suites.flatMap((suite) => suite.cases));
	const canonical = {
		protocol: value.protocol,
		protocolVersion: value.protocolVersion,
		scannerSuiteProtocol: value.scannerSuiteProtocol,
		atomicEvaluatorProtocol: value.atomicEvaluatorProtocol,
		routes,
		suites,
	};
	return Object.freeze({
		...(canonical as Omit<SecurityCalibrationBundle, "filePath" | "bundleDigest">),
		filePath,
		bundleDigest: canonicalJsonDigest(toCanonicalJsonValue(canonical)),
	});
}

function validateRoutes(value: unknown): readonly SecurityCalibrationRoute[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROUTES) {
		throw new Error(`Security calibration routes must contain 1..${MAX_ROUTES} entries.`);
	}
	const ids = new Set<string>();
	return Object.freeze(
		value.map((entry) => {
			assertExactKeys(
				entry,
				["id", "description", "evaluatorIdentity", "configurationDigest"],
				"Security calibration route",
			);
			const record = objectRecord(entry, "Security calibration route");
			const id = boundedString(record.id, "route.id");
			if (ids.has(id)) throw new Error(`Duplicate security calibration route id: ${id}`);
			ids.add(id);
			return Object.freeze({
				id,
				description: boundedString(record.description, "route.description"),
				evaluatorIdentity: boundedString(
					record.evaluatorIdentity,
					"route.evaluatorIdentity",
				),
				configurationDigest: digest(
					record.configurationDigest,
					"route.configurationDigest",
				),
			});
		}),
	);
}

function validateSuites(
	value: unknown,
	routeIds: readonly string[],
): readonly SecurityCalibrationSuite[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SUITES) {
		throw new Error(`Security calibration suites must contain 1..${MAX_SUITES} entries.`);
	}
	const suiteIds = new Set<string>();
	const caseIds = new Set<string>();
	return Object.freeze(
		value.map((entry) => {
			assertExactKeys(entry, ["id", "description", "cases"], "Security calibration suite");
			const record = objectRecord(entry, "Security calibration suite");
			const id = boundedString(record.id, "suite.id");
			if (suiteIds.has(id)) throw new Error(`Duplicate security calibration suite id: ${id}`);
			suiteIds.add(id);
			if (!Array.isArray(record.cases) || record.cases.length === 0) {
				throw new Error(`Security calibration suite ${id} must contain cases.`);
			}
			const cases = record.cases.map((testCase) => {
				const parsed = validateCase(testCase, id, routeIds);
				const caseKey = `${id}/${parsed.id}`;
				if (caseIds.has(caseKey)) throw new Error(`Duplicate security calibration case id: ${caseKey}`);
				caseIds.add(caseKey);
				return parsed;
			});
			return Object.freeze({
				id,
				description: boundedString(record.description, "suite.description"),
				cases: Object.freeze(cases),
			});
		}),
	);
}

function validateCase(
	value: unknown,
	suiteId: string,
	routeIds: readonly string[],
): SecurityCalibrationCase {
	assertExactKeys(
		value,
		[
			"id",
			"scannerType",
			"expected",
			"severity",
			"failureClass",
			"sourceSnapshotDigest",
			"observations",
		],
		"Security calibration case",
	);
	const record = objectRecord(value, "Security calibration case");
	const expected = enumValue(record.expected, OUTCOMES, "case.expected");
	const severity = enumValue(record.severity, SEVERITIES, "case.severity");
	if (expected === "pass" && severity !== "none") {
		throw new Error("Passing security calibration cases must use severity none.");
	}
	if (expected === "fail" && severity === "none") {
		throw new Error("Failing security calibration cases must declare defect severity.");
	}
	const failureClass = optionalBoundedString(record.failureClass, "case.failureClass");
	if (expected === "fail" && !failureClass) {
		throw new Error("Failing security calibration cases must declare failureClass.");
	}
	if (!Array.isArray(record.observations)) {
		throw new Error("Security calibration case observations must be an array.");
	}
	const observations = record.observations.map(validateObservation);
	const observedRouteIds = observations.map((observation) => observation.routeId);
	if (
		observedRouteIds.length !== routeIds.length ||
		new Set(observedRouteIds).size !== routeIds.length ||
		routeIds.some((routeId) => !observedRouteIds.includes(routeId))
	) {
		throw new Error(
			`Security calibration case ${suiteId}/${String(record.id)} must contain exactly one observation for every route.`,
		);
	}
	return Object.freeze({
		suiteId,
		id: boundedString(record.id, "case.id"),
		scannerType: enumValue(record.scannerType, SCANNER_TYPES, "case.scannerType"),
		expected,
		severity,
		...(failureClass ? { failureClass } : {}),
		sourceSnapshotDigest: digest(record.sourceSnapshotDigest, "case.sourceSnapshotDigest"),
		observations: Object.freeze(observations),
	});
}

function validateObservation(value: unknown): SecurityCalibrationObservation {
	assertExactKeys(
		value,
		[
			"routeId",
			"observed",
			"scannerIdentity",
			"scannerRequestDigest",
			"environmentDigest",
			"configurationDigest",
			"artifactDigest",
			"latencyMs",
			"costUsd",
			"evidenceRefs",
			"limitations",
		],
		"Security calibration observation",
	);
	const record = objectRecord(value, "Security calibration observation");
	return Object.freeze({
		routeId: boundedString(record.routeId, "observation.routeId"),
		observed: enumValue(record.observed, OUTCOMES, "observation.observed"),
		scannerIdentity: boundedString(
			record.scannerIdentity,
			"observation.scannerIdentity",
		),
		scannerRequestDigest: digest(
			record.scannerRequestDigest,
			"observation.scannerRequestDigest",
		),
		environmentDigest: digest(
			record.environmentDigest,
			"observation.environmentDigest",
		),
		configurationDigest: digest(
			record.configurationDigest,
			"observation.configurationDigest",
		),
		artifactDigest: digest(record.artifactDigest, "observation.artifactDigest"),
		latencyMs: nonNegativeNumber(record.latencyMs, "observation.latencyMs"),
		costUsd: nonNegativeNumber(record.costUsd, "observation.costUsd"),
		evidenceRefs: boundedStringArray(record.evidenceRefs, "observation.evidenceRefs", true),
		limitations: boundedStringArray(record.limitations, "observation.limitations", false),
	});
}

function assertScannerCoverage(cases: readonly SecurityCalibrationCase[]): void {
	for (const scannerType of SCANNER_TYPES) {
		const familyCases = cases.filter((testCase) => testCase.scannerType === scannerType);
		if (!familyCases.some((testCase) => testCase.expected === "pass")) {
			throw new Error(`Security calibration requires a passing ${scannerType} control.`);
		}
		if (!familyCases.some((testCase) => testCase.expected === "fail")) {
			throw new Error(`Security calibration requires a failing ${scannerType} trap.`);
		}
		if (!familyCases.some((testCase) => testCase.expected === "indeterminate")) {
			throw new Error(
				`Security calibration requires an indeterminate ${scannerType} availability case.`,
			);
		}
	}
	if (!cases.some((testCase) => testCase.severity === "critical")) {
		throw new Error("Security calibration requires at least one critical defect trap.");
	}
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function boundedString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0 || value.length > 512) {
		throw new Error(`${label} must contain 1..512 characters.`);
	}
	return value;
}

function optionalBoundedString(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined;
	return boundedString(value, label);
}

function boundedStringArray(
	value: unknown,
	label: string,
	required: boolean,
): readonly string[] {
	if (!Array.isArray(value) || value.length > 64 || (required && value.length === 0)) {
		throw new Error(`${label} must contain ${required ? "1" : "0"}..64 strings.`);
	}
	return Object.freeze(value.map((entry) => boundedString(entry, label)));
}

function enumValue<const T extends readonly string[]>(
	value: unknown,
	allowed: T,
	label: string,
): T[number] {
	if (typeof value !== "string" || !allowed.includes(value as T[number])) {
		throw new Error(`${label} must be one of ${allowed.join(", ")}.`);
	}
	return value as T[number];
}

function exact(value: unknown, expected: string, label: string): void {
	if (value !== expected) throw new Error(`${label} must be ${expected}.`);
}

function digest(value: unknown, label: string): string {
	if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest.`);
	}
	return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be a non-negative finite number.`);
	}
	return value;
}

function positiveThreshold(value: number): number {
	if (!Number.isFinite(value) || value <= 0 || value > 100) {
		throw new Error("Security calibration threshold must be within 0..100.");
	}
	return value;
}

function count(
	results: readonly SecurityCalibrationCaseResult[],
	key: "falsePass" | "falseFailure" | "escapedCriticalDefect",
): number {
	return results.filter((result) => result[key]).length;
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function percentile95(values: readonly number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function round(value: number, digits: number): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function isInsidePath(filePath: string, parentPath: string): boolean {
	const pathFromParent = relative(parentPath, filePath);
	return (
		pathFromParent === "" ||
		(!pathFromParent.startsWith("..") && !pathFromParent.startsWith("/"))
	);
}

function stringFlag(argv: readonly string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	return index < 0 ? undefined : argv[index + 1];
}

function printReport(report: SecurityCalibrationReport): void {
	const lines = [
		`Security route calibration: ${report.status}`,
		`Bundle: ${report.bundleDigest}`,
	];
	for (const route of report.routes) {
		lines.push(
			`${route.routeId}: ${route.status}; score=${route.score}; falsePasses=${route.falsePasses}; falseFailures=${route.falseFailures}; escapedCritical=${route.escapedCriticalDefects}; indeterminate=${route.indeterminateRate}%; p95Ms=${route.p95LatencyMs}; costUsd=${route.totalCostUsd}`,
		);
		for (const blocker of route.blockers) lines.push(`  - ${blocker}`);
	}
	process.stdout.write(`${lines.join("\n")}\n`);
}

function main(argv = process.argv.slice(2)): void {
	const filePath =
		stringFlag(argv, "--file") || process.env.CODEWIKI_SECURITY_CALIBRATION_FILE;
	if (!filePath) {
		throw new Error(
			"Provide --file <path> or CODEWIKI_SECURITY_CALIBRATION_FILE. Security calibration bundles must live outside the repository and must not be committed.",
		);
	}
	const thresholdValue = stringFlag(argv, "--threshold");
	const threshold = thresholdValue ? Number(thresholdValue) : undefined;
	const bundle = loadSecurityCalibrationBundle({
		filePath,
		allowRepoLocal: argv.includes("--allow-repo-local"),
	});
	const report = calibrateSecurityRoutes(bundle, { threshold });
	if (argv.includes("--json")) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} else printReport(report);
	if (argv.includes("--gate") && report.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
