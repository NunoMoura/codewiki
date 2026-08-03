import {
	EVIDENCE_SCHEMA_VERSION,
	type EvidenceArtifact,
	type EvidenceCoverage,
	type EvidenceMaterial,
} from "../contracts.ts";
import {
	canonicalJsonDigest,
	sha256Digest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export const SARIF_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.sarif",
	version: "1.0.0",
} as const);

const MAX_SARIF_BYTES = 4 * 1024 * 1024;
const MAX_RUNS = 32;
const MAX_RESULTS = 8_192;
const MAX_OBSERVATIONS = 256;
const MAX_REFS = 256;

export interface SarifExpectedTool {
	readonly name: string;
	readonly version: string;
}

export interface SarifExecutionBinding {
	readonly adapterId: string;
	readonly adapterVersion: string;
	readonly requestDigest: Sha256Digest;
	readonly invocationDigest: Sha256Digest;
	readonly environmentDigest: Sha256Digest;
	readonly configurationDigest: Sha256Digest;
	readonly advisoryDatabaseDigest?: Sha256Digest;
	readonly termination: "exited" | "timed_out" | "cancelled" | "unavailable";
	readonly exitCode?: number;
	readonly durationMs: number;
}

export interface SarifEvidenceIngestionInput {
	readonly artifact: {
		readonly bytes: string | Uint8Array;
		readonly ref: string;
	};
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly scannedPaths: readonly string[];
	readonly ownershipRefs?: readonly string[];
	readonly expectedTools: readonly SarifExpectedTool[];
	readonly execution: SarifExecutionBinding;
	readonly provenanceRefs?: readonly string[];
}

export interface SarifIngestionSummary {
	readonly runCount: number;
	readonly resultCount: number;
	readonly admittedFindingCount: number;
	readonly errorCount: number;
	readonly warningCount: number;
	readonly noteCount: number;
	readonly noneCount: number;
	readonly unsafeLocationCount: number;
	readonly truncatedFindingCount: number;
}

export interface SarifEvidenceIngestionResult {
	readonly protocol: typeof SARIF_EVIDENCE_ADAPTER_PROTOCOL;
	readonly artifact: EvidenceArtifact;
	readonly tools: readonly SarifExpectedTool[];
	readonly coverage: EvidenceCoverage;
	readonly summary: SarifIngestionSummary;
	readonly bindingDigest: Sha256Digest;
	readonly commandExecution: EvidenceMaterial<"command_execution">;
	readonly sourceObservation: EvidenceMaterial<"source_observation">;
	readonly receiptDigest: Sha256Digest;
}

interface ParsedFinding {
	readonly ref: string;
	readonly level: "error" | "warning" | "note" | "none";
	readonly ruleId: string;
	readonly path?: string;
	readonly line?: number;
	readonly messageDigest: Sha256Digest;
	readonly unsafeLocation: boolean;
}

export function ingestSarif21Evidence(
	input: SarifEvidenceIngestionInput,
): SarifEvidenceIngestionResult {
	const admitted = admittedInput(input);
	const {artifactBytes, artifact} = admittedArtifact(admitted.artifact);
	const document = parseSarifDocument(artifactBytes);
	const runs = requiredArray(document.runs, "SARIF runs", 1, MAX_RUNS);
	const observedTools = normalizedObservedTools(runs);
	if (JSON.stringify(observedTools) !== JSON.stringify(admitted.expectedTools)) {
		throw new Error("SARIF tool identity does not match the Runtime binding.");
	}
	const collectedResults = collectResults(runs);
	const findings = collectedResults.results.map(parseFinding);
	const truncatedFindingCount = Math.max(
		0,
		collectedResults.totalCount - findings.length,
	);
	const unsafeLocationCount = findings.filter(
		(finding) => finding.unsafeLocation,
	).length;
	const summary = summarizeFindings({
		runCount: runs.length,
		resultCount: collectedResults.totalCount,
		findings,
		unsafeLocationCount,
		truncatedFindingCount,
	});
	const findingObservations = findings
		.slice(0, MAX_OBSERVATIONS - 1)
		.map(renderFinding);
	const omittedObservationCount = Math.max(
		0,
		findings.length - findingObservations.length,
	);
	const allSourcePaths = sortedUnique([
		...admitted.scannedPaths,
		...findings.flatMap((finding) => (finding.path ? [finding.path] : [])),
	]);
	const sourcePathTruncated = allSourcePaths.length > MAX_REFS;
	const structuralCoverage: EvidenceCoverage =
		truncatedFindingCount > 0 ||
		unsafeLocationCount > 0 ||
		omittedObservationCount > 0 ||
		sourcePathTruncated
			? "partial"
			: "complete";
	let coverage: EvidenceCoverage = structuralCoverage;
	if (admitted.execution.termination === "unavailable") coverage = "unknown";
	else if (admitted.execution.termination !== "exited") coverage = "partial";
	const bindingDigest = canonicalJsonDigest({
		sourceSnapshotDigest: admitted.sourceSnapshotDigest,
		scannedPaths: admitted.scannedPaths,
		ownershipRefs: admitted.ownershipRefs,
		expectedTools: admitted.expectedTools,
		execution: admitted.execution,
	});
	const provenanceRefs = sortedUnique([
		...admitted.provenanceRefs,
		`sarif-artifact:${artifact.digest}`,
		`sarif-binding:${bindingDigest}`,
	]);
	const diagnosticRefs = sortedUnique(findings.map((finding) => finding.ref)).slice(
		0,
		MAX_REFS,
	);
	const sourcePaths = allSourcePaths.slice(0, MAX_REFS);
	const commandExecution: EvidenceMaterial<"command_execution"> = Object.freeze({
		schemaVersion: EVIDENCE_SCHEMA_VERSION,
		kind: "command_execution",
		artifact,
		provenanceRefs,
		payload: {
			adapterId: admitted.execution.adapterId,
			adapterVersion: admitted.execution.adapterVersion,
			invocationDigest: admitted.execution.invocationDigest,
			environmentDigest: admitted.execution.environmentDigest,
			termination: admitted.execution.termination,
			...(admitted.execution.exitCode === undefined
				? {}
				: {exitCode: admitted.execution.exitCode}),
			durationMs: admitted.execution.durationMs,
			stdoutDigest: artifact.digest,
			diagnosticRefs,
		},
	});
	const sourceObservation: EvidenceMaterial<"source_observation"> = Object.freeze({
		schemaVersion: EVIDENCE_SCHEMA_VERSION,
		kind: "source_observation",
		artifact,
		provenanceRefs,
		payload: {
			sourceType: "source" as const,
			snapshotDigest: admitted.sourceSnapshotDigest,
			paths: sourcePaths,
			symbols: [],
			ownershipRefs: admitted.ownershipRefs,
			observations: [
				renderSummary(summary, omittedObservationCount),
				...findingObservations,
			],
		},
	});
	const body = toCanonicalJsonValue({
		protocol: SARIF_EVIDENCE_ADAPTER_PROTOCOL,
		artifact,
		tools: observedTools,
		coverage,
		summary,
		bindingDigest,
		commandExecution,
		sourceObservation,
	}) as unknown as Omit<SarifEvidenceIngestionResult, "receiptDigest">;
	return Object.freeze({...body, receiptDigest: canonicalJsonDigest(body)});
}

function admittedArtifact(input: {
	readonly bytes: string | Uint8Array;
	readonly ref: string;
}): {readonly artifactBytes: Uint8Array; readonly artifact: EvidenceArtifact} {
	const artifactBytes = Buffer.from(input.bytes);
	if (artifactBytes.byteLength === 0 || artifactBytes.byteLength > MAX_SARIF_BYTES) {
		throw new Error(
			`SARIF artifact must contain 1..${MAX_SARIF_BYTES} UTF-8 bytes.`,
		);
	}
	return Object.freeze({
		artifactBytes,
		artifact: Object.freeze({
			digest: sha256Digest(artifactBytes),
			mediaType: "application/sarif+json",
			ref: input.ref,
			sizeBytes: artifactBytes.byteLength,
		}),
	});
}

function admittedInput(
	value: SarifEvidenceIngestionInput,
): Omit<SarifEvidenceIngestionInput, "ownershipRefs" | "provenanceRefs"> & {
	readonly ownershipRefs: readonly string[];
	readonly provenanceRefs: readonly string[];
} {
	const root = object(value, "SARIF ingestion input");
	assertOnlyKeys(root, [
		"artifact",
		"sourceSnapshotDigest",
		"scannedPaths",
		"ownershipRefs",
		"expectedTools",
		"execution",
		"provenanceRefs",
	]);
	const artifact = object(root.artifact, "SARIF artifact");
	assertOnlyKeys(artifact, ["bytes", "ref"]);
	if (typeof artifact.bytes !== "string" && !(artifact.bytes instanceof Uint8Array)) {
		throw new Error("SARIF artifact bytes must be a string or Uint8Array.");
	}
	const execution = admittedExecution(root.execution);
	const expectedToolEntries = requiredArray(
		root.expectedTools,
		"SARIF expectedTools",
		1,
		MAX_RUNS,
	);
	const expectedTools = Array.from(
		expectedToolEntries.entries(),
		([index, entry]) =>
			admittedExpectedTool(entry, `SARIF expectedTools[${index}]`),
	);
	const normalizedTools = sortedTools(expectedTools);
	if (normalizedTools.length !== expectedTools.length) {
		throw new Error("SARIF expectedTools must be unique.");
	}
	return Object.freeze({
		artifact: Object.freeze({
			bytes: artifact.bytes,
			ref: safeRef(artifact.ref, "SARIF artifact ref"),
		}),
		sourceSnapshotDigest: digest(
			root.sourceSnapshotDigest,
			"SARIF sourceSnapshotDigest",
		),
		scannedPaths: normalizedPaths(root.scannedPaths, "SARIF scannedPaths", true),
		ownershipRefs: normalizedRefs(root.ownershipRefs, "SARIF ownershipRefs", 256),
		expectedTools: normalizedTools,
		execution,
		provenanceRefs: normalizedRefs(
			root.provenanceRefs,
			"SARIF provenanceRefs",
			MAX_REFS - 2,
		),
	});
}

function admittedExecution(value: unknown): SarifExecutionBinding {
	const execution = object(value, "SARIF execution binding");
	assertOnlyKeys(execution, [
		"adapterId",
		"adapterVersion",
		"requestDigest",
		"invocationDigest",
		"environmentDigest",
		"configurationDigest",
		"advisoryDatabaseDigest",
		"termination",
		"exitCode",
		"durationMs",
	]);
	const termination = enumValue(
		execution.termination,
		["exited", "timed_out", "cancelled", "unavailable"] as const,
		"SARIF execution termination",
	);
	const exitCode = optionalInteger(execution.exitCode, "SARIF execution exitCode");
	if (termination === "exited" && exitCode === undefined) {
		throw new Error("Exited SARIF execution requires exitCode.");
	}
	if (termination !== "exited" && exitCode !== undefined) {
		throw new Error("Non-exited SARIF execution cannot include exitCode.");
	}
	return Object.freeze({
		adapterId: boundedText(execution.adapterId, "SARIF execution adapterId", 256),
		adapterVersion: boundedText(
			execution.adapterVersion,
			"SARIF execution adapterVersion",
			128,
		),
		requestDigest: digest(
			execution.requestDigest,
			"SARIF execution requestDigest",
		),
		invocationDigest: digest(
			execution.invocationDigest,
			"SARIF execution invocationDigest",
		),
		environmentDigest: digest(
			execution.environmentDigest,
			"SARIF execution environmentDigest",
		),
		configurationDigest: digest(
			execution.configurationDigest,
			"SARIF execution configurationDigest",
		),
		...(execution.advisoryDatabaseDigest === undefined
			? {}
			: {
					advisoryDatabaseDigest: digest(
						execution.advisoryDatabaseDigest,
						"SARIF execution advisoryDatabaseDigest",
					),
				}),
		termination,
		...(exitCode === undefined ? {} : {exitCode}),
		durationMs: integer(execution.durationMs, "SARIF execution durationMs", 0),
	});
}

function parseSarifDocument(bytesValue: Uint8Array): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(bytesValue).toString("utf8"));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`SARIF artifact is not valid JSON: ${reason}`);
	}
	const document = object(parsed, "SARIF document");
	if (document.version !== "2.1.0") {
		throw new Error("SARIF document version must be 2.1.0.");
	}
	return document;
}

function collectResults(runs: readonly Record<string, unknown>[]): {
	readonly totalCount: number;
	readonly results: readonly Record<string, unknown>[];
} {
	let totalCount = 0;
	const results: Record<string, unknown>[] = [];
	for (const [runIndex, run] of runs.entries()) {
		if (run.results === undefined) continue;
		if (!Array.isArray(run.results)) {
			throw new Error(`SARIF runs[${runIndex}].results must be an array.`);
		}
		totalCount += run.results.length;
		const remaining = MAX_RESULTS - results.length;
		if (remaining <= 0) continue;
		for (const [resultIndex, result] of run.results.slice(0, remaining).entries()) {
			results.push(
				object(result, `SARIF runs[${runIndex}].results[${resultIndex}]`),
			);
		}
	}
	return Object.freeze({totalCount, results});
}

function normalizedObservedTools(
	runs: readonly Record<string, unknown>[],
): SarifExpectedTool[] {
	const tools = Array.from(runs.entries(), ([index, run]) => {
		const tool = object(run.tool, `SARIF runs[${index}].tool`);
		const driver = object(tool.driver, `SARIF runs[${index}].tool.driver`);
		return admittedTool(driver, `SARIF runs[${index}].tool.driver`);
	});
	const normalized = sortedTools(tools);
	if (normalized.length !== tools.length) {
		throw new Error("SARIF runs contain duplicate tool identities.");
	}
	return normalized;
}

function admittedExpectedTool(
	...input: [Record<string, unknown>, string]
): SarifExpectedTool {
	const [value, label] = input;
	assertOnlyKeys(value, ["name", "version"]);
	return admittedTool(value, label);
}

function admittedTool(...input: [unknown, string]): SarifExpectedTool {
	const [value, label] = input;
	const tool = object(value, label);
	return Object.freeze({
		name: boundedText(tool.name, `${label}.name`, 256),
		version: boundedText(
			tool.version ?? tool.semanticVersion,
			`${label}.version`,
			128,
		),
	});
}

function parseFinding(
	...input: [Record<string, unknown>, number]
): ParsedFinding {
	const [value, index] = input;
	const message = object(value.message, `SARIF result ${index} message`);
	const messageText = boundedText(
		message.text ?? message.markdown,
		`SARIF result ${index} message text`,
		65_536,
	);
	const ruleId = boundedText(value.ruleId, `SARIF result ${index} ruleId`, 256);
	const level = enumValue(
		value.level ?? "warning",
		["error", "warning", "note", "none"] as const,
		`SARIF result ${index} level`,
	);
	const location = firstOptionalObject(
		value.locations,
		`SARIF result ${index} locations`,
	);
	const physical = location
		? optionalObject(
				location.physicalLocation,
				`SARIF result ${index} physicalLocation`,
			)
		: undefined;
	const artifactLocation = physical
		? optionalObject(
				physical.artifactLocation,
				`SARIF result ${index} artifactLocation`,
			)
		: undefined;
	const rawPath = artifactLocation?.uri;
	const pathResult = normalizedOptionalPath(rawPath);
	const region = physical
		? optionalObject(physical.region, `SARIF result ${index} region`)
		: undefined;
	const line = optionalPositiveInteger(region?.startLine);
	const messageDigest = sha256Digest(messageText);
	const findingIdentity = canonicalJsonDigest({
		level,
		ruleId,
		path: pathResult.path || null,
		line: line || null,
		messageDigest,
	});
	return Object.freeze({
		ref: `sarif-finding:${findingIdentity}`,
		level,
		ruleId,
		...(pathResult.path ? {path: pathResult.path} : {}),
		...(line === undefined ? {} : {line}),
		messageDigest,
		unsafeLocation: pathResult.unsafe,
	});
}

function summarizeFindings(input: {
	readonly runCount: number;
	readonly resultCount: number;
	readonly findings: readonly ParsedFinding[];
	readonly unsafeLocationCount: number;
	readonly truncatedFindingCount: number;
}): SarifIngestionSummary {
	return Object.freeze({
		runCount: input.runCount,
		resultCount: input.resultCount,
		admittedFindingCount: input.findings.length,
		errorCount: input.findings.filter((entry) => entry.level === "error").length,
		warningCount: input.findings.filter((entry) => entry.level === "warning")
			.length,
		noteCount: input.findings.filter((entry) => entry.level === "note").length,
		noneCount: input.findings.filter((entry) => entry.level === "none").length,
		unsafeLocationCount: input.unsafeLocationCount,
		truncatedFindingCount: input.truncatedFindingCount,
	});
}

function renderSummary(
	...input: [SarifIngestionSummary, number]
): string {
	const [summary, omittedObservationCount] = input;
	return [
		`sarif-summary runs=${summary.runCount}`,
		`results=${summary.resultCount}`,
		`admitted=${summary.admittedFindingCount}`,
		`error=${summary.errorCount}`,
		`warning=${summary.warningCount}`,
		`note=${summary.noteCount}`,
		`none=${summary.noneCount}`,
		`unsafeLocations=${summary.unsafeLocationCount}`,
		`truncated=${summary.truncatedFindingCount}`,
		`omittedObservations=${omittedObservationCount}`,
	].join(" ");
}

function renderFinding(finding: ParsedFinding): string {
	return [
		`sarif-finding level=${finding.level}`,
		`rule=${finding.ruleId}`,
		`path=${finding.path || (finding.unsafeLocation ? "excluded" : "unlocated")}`,
		`line=${finding.line || "unknown"}`,
		`messageDigest=${finding.messageDigest}`,
		`ref=${finding.ref}`,
	].join(" ");
}

function normalizedOptionalPath(value: unknown): {
	readonly path?: string;
	readonly unsafe: boolean;
} {
	if (value === undefined) return {unsafe: false};
	if (typeof value !== "string") return {unsafe: true};
	const trimmed = value.trim().replaceAll("\\", "/");
	if (
		trimmed.length === 0 ||
		trimmed.length > 1_024 ||
		trimmed.startsWith("/") ||
		trimmed.includes("%") ||
		trimmed.includes("?") ||
		trimmed.includes("#") ||
		/^[A-Za-z]:\//.test(trimmed) ||
		/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed) ||
		trimmed.split("/").some((part) => part === "..") ||
		/[\u0000-\u001f\u007f]/u.test(trimmed)
	) {
		return {unsafe: true};
	}
	return {path: trimmed.replace(/^\.\//, ""), unsafe: false};
}

function normalizedPaths(
	...input: [unknown, string, boolean]
): string[] {
	const [value, label, required] = input;
	const paths = normalizedTexts(value, label, MAX_REFS).map((entry) => {
		const normalized = normalizedOptionalPath(entry);
		if (!normalized.path || normalized.unsafe) {
			throw new Error(`${label} must contain project-relative paths.`);
		}
		return normalized.path;
	});
	const unique = sortedUnique(paths);
	if (required && unique.length === 0) {
		throw new Error(`${label} requires at least one path.`);
	}
	return unique;
}

function normalizedTexts(...input: [unknown, string, number]): string[] {
	const [value, label, maximum] = input;
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > maximum) {
		throw new Error(`${label} must contain 0..${maximum} entries.`);
	}
	const values = Array.from(value.entries(), ([index, entry]) =>
		boundedText(entry, `${label}[${index}]`, 1_024),
	);
	if (sortedUnique(values).length !== values.length) {
		throw new Error(`${label} must not contain duplicates.`);
	}
	return values;
}

function normalizedRefs(...input: [unknown, string, number]): string[] {
	const [value, label, maximum] = input;
	return normalizedTexts(value, label, maximum).map((entry) =>
		safeRef(entry, label),
	);
}

function safeRef(...input: [unknown, string]): string {
	const [value, label] = input;
	const ref = boundedText(value, label, 1_024);
	if (!/^[A-Za-z][A-Za-z0-9._-]*:[A-Za-z0-9._:/-]+$/.test(ref)) {
		throw new Error(`${label} must be an opaque credential-free ref.`);
	}
	return ref;
}

function sortedTools(tools: readonly SarifExpectedTool[]): SarifExpectedTool[] {
	const byIdentity = new Map<string, SarifExpectedTool>();
	for (const tool of tools) byIdentity.set(`${tool.name}\u0000${tool.version}`, tool);
	return [...byIdentity.values()].sort((...tools) => {
		const [left, right] = tools;
		const byName = compareText(left.name, right.name);
		return byName || compareText(left.version, right.version);
	});
}

function object(...input: [unknown, string]): Record<string, unknown> {
	const [value, label] = input;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function optionalObject(
	...input: [unknown, string]
): Record<string, unknown> | undefined {
	const [value, label] = input;
	return value === undefined ? undefined : object(value, label);
}

function assertOnlyKeys(
	...input: [Record<string, unknown>, readonly string[]]
): void {
	const [value, allowed] = input;
	const allowedKeys = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!allowedKeys.has(key)) throw new Error(`SARIF ingestion received unsupported field ${key}.`);
	}
}

function requiredArray(
	...input: [unknown, string, number, number]
): Record<string, unknown>[] {
	const [value, label, minimum, maximum] = input;
	if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
		throw new Error(`${label} must contain ${minimum}..${maximum} entries.`);
	}
	return Array.from(value.entries(), ([index, entry]) =>
		object(entry, `${label}[${index}]`),
	);
}

function firstOptionalObject(
	...input: [unknown, string]
): Record<string, unknown> | undefined {
	const [value, label] = input;
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	if (value.length === 0) return undefined;
	return object(value[0], `${label}[0]`);
}

function boundedText(...input: [unknown, string, number]): string {
	const [value, label, maximum] = input;
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const normalized = value.trim();
	if (
		normalized.length === 0 ||
		[...normalized].length > maximum ||
		/[\u0000-\u001f\u007f]/u.test(normalized)
	) {
		throw new Error(`${label} is invalid or exceeds ${maximum} code points.`);
	}
	return normalized;
}

function digest(...input: [unknown, string]): Sha256Digest {
	const [value, label] = input;
	if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
		throw new Error(`${label} must be a lowercase sha256 digest.`);
	}
	return value as Sha256Digest;
}

function integer(...input: [unknown, string, number]): number {
	const [value, label, minimum] = input;
	if (!Number.isSafeInteger(value) || (value as number) < minimum) {
		throw new Error(`${label} must be an integer >= ${minimum}.`);
	}
	return value as number;
}

function optionalInteger(...input: [unknown, string]): number | undefined {
	const [value, label] = input;
	if (value === undefined) return undefined;
	if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer.`);
	return value as number;
}

function optionalPositiveInteger(value: unknown): number | undefined {
	return Number.isSafeInteger(value) && (value as number) > 0
		? (value as number)
		: undefined;
}

function enumValue<const T extends readonly string[]>(
	...input: [unknown, T, string]
): T[number] {
	const [value, values, label] = input;
	if (typeof value !== "string" || !values.includes(value)) {
		throw new Error(`${label} is unsupported.`);
	}
	return value as T[number];
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}

function compareText(...values: [string, string]): number {
	const [left, right] = values;
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
