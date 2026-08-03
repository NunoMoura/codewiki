import type {
	EvidenceArtifact,
	EvidenceCoverage,
	EvidenceMaterial,
} from "../contracts.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import * as evidenceAdapter from "./shared.ts";
import {
	parseSafeXmlArtifact,
	xmlElementAttributes as elementAttributes,
	xmlElementObject as elementObject,
	xmlObjectArray as objectArray,
} from "./xml.ts";

const {
	admitAdapterArtifact,
	admitStandardAdapterExecution,
	assertOnlyKeys,
	boundedText,
	buildCommandExecutionMaterial,
	compareText,
	digestValue: digest,
	integerValue: integer,
	normalizedProjectPath: normalizedOptionalPath,
	normalizedRefList: normalizedRefs,
	objectValue: object,
	safeOpaqueRef: safeRef,
	sortedUnique,
} = evidenceAdapter;

export const JUNIT_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.junit",
	version: "1.0.0",
} as const);

const MAX_JUNIT_BYTES = 4 * 1024 * 1024;
const MAX_SUITES = 256;
const MAX_TESTS = 8_192;
const MAX_DIAGNOSTIC_REFS = 256;
const MAX_PROVENANCE_REFS = 248;
const XML_NESTING_LIMIT = 32;

const JUNIT_ARRAY_ELEMENTS = new Set([
	"testsuite",
	"testcase",
	"failure",
	"error",
	"skipped",
]);

export interface JunitRunnerIdentity {
	readonly name: string;
	readonly version: string;
}

export type JunitExecutionBinding =
	evidenceAdapter.StandardAdapterExecutionBinding;

export interface JunitEvidenceIngestionInput {
	readonly artifact: {
		readonly bytes: string | Uint8Array;
		readonly ref: string;
	};
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly testSelectionDigest: Sha256Digest;
	readonly expectedTestCount: number;
	readonly runner: JunitRunnerIdentity;
	readonly execution: JunitExecutionBinding;
	readonly provenanceRefs?: readonly string[];
}

export interface JunitIngestionSummary {
	readonly suiteCount: number;
	readonly admittedSuiteCount: number;
	readonly testCount: number;
	readonly admittedTestCount: number;
	readonly passedCount: number;
	readonly failureCount: number;
	readonly errorCount: number;
	readonly skippedCount: number;
	readonly expectedTestCount: number;
	readonly expectedTestCountMismatch: boolean;
	readonly declaredCountMismatchCount: number;
	readonly unsafeFileCount: number;
	readonly truncatedSuiteCount: number;
	readonly truncatedTestCount: number;
	readonly omittedDiagnosticCount: number;
}

export interface JunitEvidenceIngestionResult {
	readonly protocol: typeof JUNIT_EVIDENCE_ADAPTER_PROTOCOL;
	readonly artifact: EvidenceArtifact;
	readonly runner: JunitRunnerIdentity;
	readonly coverage: EvidenceCoverage;
	readonly summary: JunitIngestionSummary;
	readonly bindingDigest: Sha256Digest;
	readonly commandExecution: EvidenceMaterial<"command_execution">;
	readonly receiptDigest: Sha256Digest;
}

interface ParsedTestCase {
	readonly identityDigest: Sha256Digest;
	readonly detailDigest: Sha256Digest;
	readonly status: "passed" | "failure" | "error" | "skipped";
	readonly unsafeFile: boolean;
}

interface CollectedReport {
	readonly suiteCount: number;
	readonly testCount: number;
	readonly suites: readonly Record<string, unknown>[];
	readonly tests: readonly ParsedTestCase[];
	readonly declaredCountMismatchCount: number;
}

interface DeclaredCounts {
	readonly tests?: number;
	readonly failures?: number;
	readonly errors?: number;
	readonly skipped?: number;
}

export function ingestJunitXmlEvidence(
	input: JunitEvidenceIngestionInput,
): JunitEvidenceIngestionResult {
	const admitted = admittedInput(input);
	const {artifactBytes, artifact} = admitAdapterArtifact(admitted.artifact, {
		label: "JUnit",
		maximumBytes: MAX_JUNIT_BYTES,
		mediaType: "application/junit+xml",
	});
	const parsed = parseJunitDocument(artifactBytes);
	const collected = collectReport(parsed.suites);
	const preliminarySummary = summarizeReport({
		collected,
		expectedTestCount: admitted.expectedTestCount,
		declaredCounts: parsed.declaredCounts,
		omittedDiagnosticCount: 0,
	});
	const nonPassingRefs = collected.tests
		.flatMap((test) =>
			test.status === "passed" ? [] : [testDiagnosticRef(test)],
		)
		.sort(compareText);
	const retainedDiagnosticRefs = nonPassingRefs.slice(
		0,
		MAX_DIAGNOSTIC_REFS - 1,
	);
	const omittedDiagnosticCount = Math.max(
		0,
		nonPassingRefs.length - retainedDiagnosticRefs.length,
	);
	const summary = Object.freeze({
		...preliminarySummary,
		omittedDiagnosticCount,
	});
	const structuralCoverage = coverageForSummary(summary);
	let coverage: EvidenceCoverage = structuralCoverage;
	if (admitted.execution.termination === "unavailable") coverage = "unknown";
	else if (admitted.execution.termination !== "exited") coverage = "partial";
	const bindingDigest = canonicalJsonDigest({
		sourceSnapshotDigest: admitted.sourceSnapshotDigest,
		testSelectionDigest: admitted.testSelectionDigest,
		expectedTestCount: admitted.expectedTestCount,
		runner: admitted.runner,
		execution: admitted.execution,
	});
	const provenanceRefs = sortedUnique([
		...admitted.provenanceRefs,
		`junit-artifact:${artifact.digest}`,
		`junit-binding:${bindingDigest}`,
		`junit-source-snapshot:${admitted.sourceSnapshotDigest}`,
		`junit-test-selection:${admitted.testSelectionDigest}`,
		`junit-expected-tests:${admitted.expectedTestCount}`,
		`junit-request:${admitted.execution.requestDigest}`,
		`junit-configuration:${admitted.execution.configurationDigest}`,
		`junit-runner:${canonicalJsonDigest(admitted.runner)}`,
	]);
	const diagnosticRefs = [
		summaryDiagnosticRef(summary),
		...retainedDiagnosticRefs,
	];
	const commandExecution = buildCommandExecutionMaterial({
		artifact,
		provenanceRefs,
		execution: admitted.execution,
		diagnosticRefs,
	});
	const body = toCanonicalJsonValue({
		protocol: JUNIT_EVIDENCE_ADAPTER_PROTOCOL,
		artifact,
		runner: admitted.runner,
		coverage,
		summary,
		bindingDigest,
		commandExecution,
	}) as unknown as Omit<JunitEvidenceIngestionResult, "receiptDigest">;
	return Object.freeze({...body, receiptDigest: canonicalJsonDigest(body)});
}

function admittedInput(
	value: JunitEvidenceIngestionInput,
): Omit<JunitEvidenceIngestionInput, "provenanceRefs"> & {
	readonly provenanceRefs: readonly string[];
} {
	const root = object(value, "JUnit ingestion input");
	assertOnlyKeys(
		root,
		[
			"artifact",
			"sourceSnapshotDigest",
			"testSelectionDigest",
			"expectedTestCount",
			"runner",
			"execution",
			"provenanceRefs",
		],
		"JUnit ingestion",
	);
	const artifact = object(root.artifact, "JUnit artifact");
	assertOnlyKeys(artifact, ["bytes", "ref"], "JUnit ingestion");
	if (typeof artifact.bytes !== "string" && !(artifact.bytes instanceof Uint8Array)) {
		throw new Error("JUnit artifact bytes must be a string or Uint8Array.");
	}
	const runner = object(root.runner, "JUnit runner");
	assertOnlyKeys(runner, ["name", "version"], "JUnit ingestion");
	return Object.freeze({
		artifact: Object.freeze({
			bytes: artifact.bytes,
			ref: safeRef(artifact.ref, "JUnit artifact ref"),
		}),
		sourceSnapshotDigest: digest(
			root.sourceSnapshotDigest,
			"JUnit sourceSnapshotDigest",
		),
		testSelectionDigest: digest(
			root.testSelectionDigest,
			"JUnit testSelectionDigest",
		),
		expectedTestCount: integer(
			root.expectedTestCount,
			"JUnit expectedTestCount",
			0,
		),
		runner: Object.freeze({
			name: boundedText(runner.name, "JUnit runner name", 256),
			version: boundedText(runner.version, "JUnit runner version", 128),
		}),
		execution: admitStandardAdapterExecution(root.execution, {
			label: "JUnit",
			errorPrefix: "JUnit ingestion",
		}),
		provenanceRefs: normalizedRefs(
			root.provenanceRefs,
			"JUnit provenanceRefs",
			MAX_PROVENANCE_REFS,
		),
	});
}

function parseJunitDocument(bytesValue: Uint8Array): {
	readonly suites: readonly Record<string, unknown>[];
	readonly declaredCounts: DeclaredCounts;
} {
	const document = object(
		parseSafeXmlArtifact(bytesValue, {
			label: "JUnit",
			arrayElements: JUNIT_ARRAY_ELEMENTS,
			maximumNesting: XML_NESTING_LIMIT,
		}),
		"JUnit document",
	);
	const rootKeys = Object.keys(document);
	if (rootKeys.length !== 1) {
		throw new Error("JUnit document must contain exactly one testsuites or testsuite root.");
	}
	if (rootKeys[0] === "testsuites") {
		const envelope = elementObject(document.testsuites, "JUnit testsuites root");
		return Object.freeze({
			suites: objectArray(envelope.testsuite, "JUnit testsuites root suites"),
			declaredCounts: declaredCounts(envelope, "JUnit testsuites root"),
		});
	}
	if (rootKeys[0] === "testsuite") {
		const suites = objectArray(document.testsuite, "JUnit testsuite root");
		if (suites.length !== 1) {
			throw new Error("JUnit document must contain exactly one testsuite root.");
		}
		return Object.freeze({
			suites,
			declaredCounts: Object.freeze({}),
		});
	}
	throw new Error("JUnit document root must be testsuites or testsuite.");
}

function collectReport(
	rootSuites: readonly Record<string, unknown>[],
): CollectedReport {
	const pending = Array.from(rootSuites.entries(), ([index, suite]) => ({
		suite,
		parentDigest: null as Sha256Digest | null,
		index,
	}));
	const admittedSuites: Record<string, unknown>[] = [];
	const tests: ParsedTestCase[] = [];
	let suiteCount = 0;
	let testCount = 0;
	let declaredCountMismatchCount = 0;
	for (let cursor = 0; cursor < pending.length; cursor += 1) {
		const entry = pending[cursor];
		suiteCount += 1;
		const attributes = elementAttributes(entry.suite, `JUnit suite ${suiteCount}`);
		const suiteDigest = canonicalJsonDigest({
			parentDigest: entry.parentDigest,
			index: entry.index,
			name: optionalBoundedText(attributes.name, 1_024) ?? null,
			package: optionalBoundedText(attributes.package, 1_024) ?? null,
		});
		const nestedSuites = objectArray(
			entry.suite.testsuite,
			`JUnit suite ${suiteCount} nested suites`,
		);
		for (const [index, suite] of nestedSuites.entries()) {
			pending.push({suite, parentDigest: suiteDigest, index});
		}
		const caseNodes = objectArray(
			entry.suite.testcase,
			`JUnit suite ${suiteCount} test cases`,
		);
		testCount += caseNodes.length;
		const firstTestIndex = tests.length;
		if (admittedSuites.length < MAX_SUITES) {
			admittedSuites.push(entry.suite);
			const remaining = MAX_TESTS - tests.length;
			for (const [index, testCase] of caseNodes.slice(0, remaining).entries()) {
				tests.push(parseTestCase(testCase, suiteDigest, index));
			}
		}
		if (nestedSuites.length === 0) {
			const suiteTests = tests.slice(firstTestIndex);
			declaredCountMismatchCount += countDeclaredMismatches(
				declaredCounts(entry.suite, `JUnit suite ${suiteCount}`),
				caseNodes.length,
				suiteTests,
			);
		}
	}
	return Object.freeze({
		suiteCount,
		testCount,
		suites: admittedSuites,
		tests,
		declaredCountMismatchCount,
	});
}

function parseTestCase(
	...input: [Record<string, unknown>, Sha256Digest, number]
): ParsedTestCase {
	const [testCase, suiteDigest, index] = input;
	const attributes = elementAttributes(testCase, `JUnit test case ${index}`);
	const name = boundedText(attributes.name, `JUnit test case ${index} name`, 2_048);
	const className = optionalBoundedText(attributes.classname, 2_048);
	const path = normalizedOptionalPath(attributes.file);
	const line = optionalXmlInteger(attributes.line, `JUnit test case ${index} line`);
	optionalXmlDuration(attributes.time, `JUnit test case ${index} time`);
	const failures = elementArray(testCase.failure, `JUnit test case ${index} failures`);
	const errors = elementArray(testCase.error, `JUnit test case ${index} errors`);
	const skipped = elementArray(testCase.skipped, `JUnit test case ${index} skipped`);
	if (failures.length + errors.length + skipped.length > 1) {
		throw new Error(`JUnit test case ${index} has contradictory outcomes.`);
	}
	let status: ParsedTestCase["status"] = "passed";
	let detail: unknown = null;
	if (failures.length === 1) {
		status = "failure";
		detail = failures[0];
	} else if (errors.length === 1) {
		status = "error";
		detail = errors[0];
	} else if (skipped.length === 1) {
		status = "skipped";
		detail = skipped[0];
	} else {
		status = statusFromAttribute(attributes.status, index);
	}
	return Object.freeze({
		identityDigest: canonicalJsonDigest({
			suiteDigest,
			index,
			name,
			className: className ?? null,
			path: path.path ?? null,
			line: line ?? null,
		}),
		detailDigest: canonicalJsonDigest(detail),
		status,
		unsafeFile: path.unsafe,
	});
}

function summarizeReport(input: {
	readonly collected: CollectedReport;
	readonly expectedTestCount: number;
	readonly declaredCounts: DeclaredCounts;
	readonly omittedDiagnosticCount: number;
}): JunitIngestionSummary {
	const {collected, declaredCounts} = input;
	const passedCount = countStatus(collected.tests, "passed");
	const failureCount = countStatus(collected.tests, "failure");
	const errorCount = countStatus(collected.tests, "error");
	const skippedCount = countStatus(collected.tests, "skipped");
	const declaredCountMismatchCount =
		collected.declaredCountMismatchCount +
		countDeclaredMismatches(
			declaredCounts,
			collected.testCount,
			collected.tests,
		);
	return Object.freeze({
		suiteCount: collected.suiteCount,
		admittedSuiteCount: collected.suites.length,
		testCount: collected.testCount,
		admittedTestCount: collected.tests.length,
		passedCount,
		failureCount,
		errorCount,
		skippedCount,
		expectedTestCount: input.expectedTestCount,
		expectedTestCountMismatch: collected.testCount !== input.expectedTestCount,
		declaredCountMismatchCount,
		unsafeFileCount: collected.tests.filter((test) => test.unsafeFile).length,
		truncatedSuiteCount: Math.max(0, collected.suiteCount - collected.suites.length),
		truncatedTestCount: Math.max(0, collected.testCount - collected.tests.length),
		omittedDiagnosticCount: input.omittedDiagnosticCount,
	});
}

function countDeclaredMismatches(
	...input: [DeclaredCounts, number, readonly ParsedTestCase[]]
): number {
	const [declared, testCount, admittedTests] = input;
	let mismatchCount =
		declared.tests !== undefined && declared.tests !== testCount ? 1 : 0;
	if (admittedTests.length !== testCount) return mismatchCount;
	const comparisons = [
		[declared.failures, countStatus(admittedTests, "failure")],
		[declared.errors, countStatus(admittedTests, "error")],
		[declared.skipped, countStatus(admittedTests, "skipped")],
	] as const;
	mismatchCount += comparisons.filter(
		([expected, observed]) => expected !== undefined && expected !== observed,
	).length;
	return mismatchCount;
}

function coverageForSummary(summary: JunitIngestionSummary): EvidenceCoverage {
	return summary.expectedTestCountMismatch ||
		summary.declaredCountMismatchCount > 0 ||
		summary.unsafeFileCount > 0 ||
		summary.truncatedSuiteCount > 0 ||
		summary.truncatedTestCount > 0 ||
		summary.omittedDiagnosticCount > 0
		? "partial"
		: "complete";
}

function testDiagnosticRef(test: ParsedTestCase): string {
	return `junit-case:${test.identityDigest}/${test.status}/${test.detailDigest}`;
}

function summaryDiagnosticRef(summary: JunitIngestionSummary): string {
	return [
		"junit-summary:tests",
		summary.testCount,
		"passed",
		summary.passedCount,
		"failures",
		summary.failureCount,
		"errors",
		summary.errorCount,
		"skipped",
		summary.skippedCount,
		"expected",
		summary.expectedTestCount,
		"expectedMismatch",
		summary.expectedTestCountMismatch,
	].join("/");
}

function declaredCounts(
	...input: [Record<string, unknown>, string]
): DeclaredCounts {
	const [value, label] = input;
	const attributes = elementAttributes(value, label);
	return Object.freeze({
		...(attributes.tests === undefined
			? {}
			: {tests: xmlInteger(attributes.tests, `${label} tests`)}),
		...(attributes.failures === undefined
			? {}
			: {failures: xmlInteger(attributes.failures, `${label} failures`)}),
		...(attributes.errors === undefined
			? {}
			: {errors: xmlInteger(attributes.errors, `${label} errors`)}),
		...(attributes.skipped === undefined
			? {}
			: {skipped: xmlInteger(attributes.skipped, `${label} skipped`)}),
	});
}

function statusFromAttribute(
	...input: [unknown, number]
): ParsedTestCase["status"] {
	const [value, index] = input;
	if (value === undefined) return "passed";
	const status = boundedText(value, `JUnit test case ${index} status`, 32).toLowerCase();
	if (["run", "passed", "success"].includes(status)) return "passed";
	if (["notrun", "skipped", "disabled"].includes(status)) return "skipped";
	if (status === "failure" || status === "failed") return "failure";
	if (status === "error") return "error";
	throw new Error(`JUnit test case ${index} status is unsupported.`);
}

function countStatus(
	...input: [readonly ParsedTestCase[], ParsedTestCase["status"]]
): number {
	const [tests, status] = input;
	return tests.filter((test) => test.status === status).length;
}

function elementArray(...input: [unknown, string]): unknown[] {
	const [value, label] = input;
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

function optionalBoundedText(
	...input: [unknown, number]
): string | undefined {
	const [value, maximum] = input;
	return value === undefined
		? undefined
		: boundedText(value, "JUnit XML attribute", maximum);
}

function optionalXmlInteger(
	...input: [unknown, string]
): number | undefined {
	const [value, label] = input;
	return value === undefined ? undefined : xmlInteger(value, label);
}

function xmlInteger(...input: [unknown, string]): number {
	const [value, label] = input;
	if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
		throw new Error(`${label} must be a non-negative integer.`);
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) {
		throw new Error(`${label} exceeds the safe integer range.`);
	}
	return parsed;
}

function optionalXmlDuration(...input: [unknown, string]): void {
	const [value, label] = input;
	if (value === undefined) return;
	if (typeof value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
		throw new Error(`${label} must be non-negative decimal seconds.`);
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite.`);
}
