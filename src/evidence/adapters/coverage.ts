import {
	EVIDENCE_SCHEMA_VERSION,
	type EvidenceArtifact,
	type EvidenceCoverage,
	type EvidenceMaterial,
} from "../contracts.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	coverageParsers,
	type ParsedCoverageFile,
	type ParsedCoverageReport,
} from "./coverage-parsers.ts";
import * as adapterShared from "./shared.ts";

const {
	admitAdapterArtifact,
	admitStandardAdapterExecution,
	assertOnlyKeys,
	boundedText,
	buildCommandExecutionMaterial,
	compareText,
	digestValue: digest,
	normalizedProjectPath,
	normalizedRefList,
	objectValue: object,
	safeOpaqueRef: safeRef,
	sortedUnique,
} = adapterShared;

export const LCOV_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.lcov",
	version: "1.0.0",
} as const);

export const COBERTURA_EVIDENCE_ADAPTER_PROTOCOL = Object.freeze({
	id: "codewiki.evidence-adapter.cobertura",
	version: "1.0.0",
} as const);

const MAX_COVERAGE_BYTES = 4 * 1024 * 1024;
const MAX_REPORT_FILES = 2_048;
const MAX_REQUIRED_PATHS = 255;
const MAX_PROVENANCE_REFS = 247;

export type CoverageArtifactFormat = "lcov" | "cobertura_xml";

export interface CoverageToolIdentity {
	readonly name: string;
	readonly version: string;
}

export type CoverageExecutionBinding =
	adapterShared.StandardAdapterExecutionBinding;

export interface CoverageEvidenceIngestionInput {
	readonly artifact: {
		readonly bytes: string | Uint8Array;
		readonly ref: string;
	};
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly coverageScopeDigest: Sha256Digest;
	readonly requiredPaths: readonly string[];
	readonly ownershipRefs?: readonly string[];
	readonly tool: CoverageToolIdentity;
	readonly execution: CoverageExecutionBinding;
	readonly provenanceRefs?: readonly string[];
}

export interface CoverageIngestionSummary {
	readonly reportedFileCount: number;
	readonly uniqueSafeFileCount: number;
	readonly requiredPathCount: number;
	readonly matchedRequiredPathCount: number;
	readonly missingRequiredPathCount: number;
	readonly outOfScopeFileCount: number;
	readonly lineFound: number;
	readonly lineHit: number;
	readonly branchFound: number;
	readonly branchHit: number;
	readonly functionFound: number;
	readonly functionHit: number;
	readonly unsafePathCount: number;
	readonly declaredCountMismatchCount: number;
	readonly excessFileCount: number;
}

export interface CoverageEvidenceIngestionResult {
	readonly protocol:
		| typeof LCOV_EVIDENCE_ADAPTER_PROTOCOL
		| typeof COBERTURA_EVIDENCE_ADAPTER_PROTOCOL;
	readonly format: CoverageArtifactFormat;
	readonly artifact: EvidenceArtifact;
	readonly tool: CoverageToolIdentity;
	readonly coverage: EvidenceCoverage;
	readonly summary: CoverageIngestionSummary;
	readonly bindingDigest: Sha256Digest;
	readonly commandExecution: EvidenceMaterial<"command_execution">;
	readonly sourceObservation: EvidenceMaterial<"source_observation">;
	readonly receiptDigest: Sha256Digest;
}

interface CoverageAdapterDefinition {
	readonly format: CoverageArtifactFormat;
	readonly label: string;
	readonly mediaType: string;
	readonly protocol: CoverageEvidenceIngestionResult["protocol"];
	readonly parse: (bytes: Uint8Array) => ParsedCoverageReport;
}

interface ScopedCoverage {
	readonly summary: CoverageIngestionSummary;
	readonly observations: readonly string[];
	readonly diagnosticRefs: readonly string[];
}

export function ingestLcovEvidence(
	input: CoverageEvidenceIngestionInput,
): CoverageEvidenceIngestionResult {
	return ingestCoverageEvidence(input, {
		format: "lcov",
		label: "LCOV",
		mediaType: "text/lcov",
		protocol: LCOV_EVIDENCE_ADAPTER_PROTOCOL,
		parse: coverageParsers.lcov,
	});
}

export function ingestCoberturaEvidence(
	input: CoverageEvidenceIngestionInput,
): CoverageEvidenceIngestionResult {
	return ingestCoverageEvidence(input, {
		format: "cobertura_xml",
		label: "Cobertura",
		mediaType: "application/xml",
		protocol: COBERTURA_EVIDENCE_ADAPTER_PROTOCOL,
		parse: coverageParsers.cobertura,
	});
}

function ingestCoverageEvidence(
	...input: [CoverageEvidenceIngestionInput, CoverageAdapterDefinition]
): CoverageEvidenceIngestionResult {
	const [value, definition] = input;
	const admitted = admittedInput(value, definition.label);
	const {artifactBytes, artifact} = admitAdapterArtifact(admitted.artifact, {
		label: definition.label,
		maximumBytes: MAX_COVERAGE_BYTES,
		mediaType: definition.mediaType,
	});
	const parsed = definition.parse(artifactBytes);
	const scoped = scopeCoverage(
		parsed,
		admitted.requiredPaths,
		definition.format,
	);
	let coverage: EvidenceCoverage = completeCoverage(scoped.summary)
		? "complete"
		: "partial";
	if (admitted.execution.termination === "unavailable") coverage = "unknown";
	else if (admitted.execution.termination !== "exited") coverage = "partial";
	const bindingDigest = canonicalJsonDigest({
		format: definition.format,
		sourceSnapshotDigest: admitted.sourceSnapshotDigest,
		coverageScopeDigest: admitted.coverageScopeDigest,
		requiredPaths: admitted.requiredPaths,
		ownershipRefs: admitted.ownershipRefs,
		tool: admitted.tool,
		execution: admitted.execution,
	});
	const provenanceRefs = sortedUnique([
		...admitted.provenanceRefs,
		`coverage-artifact:${artifact.digest}`,
		`coverage-binding:${bindingDigest}`,
		`coverage-source-snapshot:${admitted.sourceSnapshotDigest}`,
		`coverage-scope:${admitted.coverageScopeDigest}`,
		`coverage-required-paths:${canonicalJsonDigest(admitted.requiredPaths)}`,
		`coverage-request:${admitted.execution.requestDigest}`,
		`coverage-configuration:${admitted.execution.configurationDigest}`,
		`coverage-tool:${canonicalJsonDigest(admitted.tool)}`,
		`coverage-format:${definition.format}`,
	]);
	const commandExecution = buildCommandExecutionMaterial({
		artifact,
		provenanceRefs,
		execution: admitted.execution,
		diagnosticRefs: scoped.diagnosticRefs,
	});
	const sourceObservation: EvidenceMaterial<"source_observation"> = Object.freeze({
		schemaVersion: EVIDENCE_SCHEMA_VERSION,
		kind: "source_observation",
		artifact,
		provenanceRefs,
		payload: {
			sourceType: "source" as const,
			snapshotDigest: admitted.sourceSnapshotDigest,
			paths: admitted.requiredPaths,
			symbols: [],
			ownershipRefs: admitted.ownershipRefs,
			observations: scoped.observations,
		},
	});
	const body = toCanonicalJsonValue({
		protocol: definition.protocol,
		format: definition.format,
		artifact,
		tool: admitted.tool,
		coverage,
		summary: scoped.summary,
		bindingDigest,
		commandExecution,
		sourceObservation,
	}) as unknown as Omit<CoverageEvidenceIngestionResult, "receiptDigest">;
	return Object.freeze({...body, receiptDigest: canonicalJsonDigest(body)});
}

function admittedInput(
	...input: [CoverageEvidenceIngestionInput, string]
): Omit<CoverageEvidenceIngestionInput, "ownershipRefs" | "provenanceRefs"> & {
	readonly ownershipRefs: readonly string[];
	readonly provenanceRefs: readonly string[];
} {
	const [value, label] = input;
	const root = object(value, `${label} ingestion input`);
	assertOnlyKeys(
		root,
		[
			"artifact",
			"sourceSnapshotDigest",
			"coverageScopeDigest",
			"requiredPaths",
			"ownershipRefs",
			"tool",
			"execution",
			"provenanceRefs",
		],
		`${label} ingestion`,
	);
	const artifact = object(root.artifact, `${label} artifact`);
	assertOnlyKeys(artifact, ["bytes", "ref"], `${label} ingestion`);
	if (typeof artifact.bytes !== "string" && !(artifact.bytes instanceof Uint8Array)) {
		throw new Error(`${label} artifact bytes must be a string or Uint8Array.`);
	}
	const tool = object(root.tool, `${label} tool`);
	assertOnlyKeys(tool, ["name", "version"], `${label} ingestion`);
	return Object.freeze({
		artifact: Object.freeze({
			bytes: artifact.bytes,
			ref: safeRef(artifact.ref, `${label} artifact ref`),
		}),
		sourceSnapshotDigest: digest(
			root.sourceSnapshotDigest,
			`${label} sourceSnapshotDigest`,
		),
		coverageScopeDigest: digest(
			root.coverageScopeDigest,
			`${label} coverageScopeDigest`,
		),
		requiredPaths: admittedRequiredPaths(root.requiredPaths, label),
		ownershipRefs: normalizedRefList(
			root.ownershipRefs,
			`${label} ownershipRefs`,
			MAX_REQUIRED_PATHS,
		),
		tool: Object.freeze({
			name: boundedText(tool.name, `${label} tool name`, 256),
			version: boundedText(tool.version, `${label} tool version`, 128),
		}),
		execution: admitStandardAdapterExecution(root.execution, {
			label,
			errorPrefix: `${label} ingestion`,
		}),
		provenanceRefs: normalizedRefList(
			root.provenanceRefs,
			`${label} provenanceRefs`,
			MAX_PROVENANCE_REFS,
		),
	});
}

function admittedRequiredPaths(...input: [unknown, string]): string[] {
	const [value, label] = input;
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.length > MAX_REQUIRED_PATHS
	) {
		throw new Error(
			`${label} requiredPaths must contain 1..${MAX_REQUIRED_PATHS} project paths.`,
		);
	}
	const paths = Array.from(value.entries(), ([index, entry]) => {
		const normalized = normalizedProjectPath(entry);
		if (normalized.unsafe || !normalized.path) {
			throw new Error(`${label} requiredPaths[${index}] must be project-relative.`);
		}
		return normalized.path;
	});
	if (new Set(paths).size !== paths.length) {
		throw new Error(`${label} requiredPaths must not contain duplicates.`);
	}
	return paths.sort(compareText);
}

function scopeCoverage(
	...input: [ParsedCoverageReport, readonly string[], CoverageArtifactFormat]
): ScopedCoverage {
	const [parsed, requiredPaths, format] = input;
	const filesByPath = new Map(parsed.files.map((file) => [file.path, file]));
	const matched = requiredPaths.flatMap((path) => {
		const file = filesByPath.get(path);
		return file ? [file] : [];
	});
	const missingPaths = requiredPaths.filter((path) => !filesByPath.has(path));
	const requiredSet = new Set(requiredPaths);
	const totals = coverageParsers.aggregate(matched);
	const summary = Object.freeze({
		reportedFileCount: parsed.reportedFileCount,
		uniqueSafeFileCount: parsed.files.length,
		requiredPathCount: requiredPaths.length,
		matchedRequiredPathCount: matched.length,
		missingRequiredPathCount: missingPaths.length,
		outOfScopeFileCount: parsed.files.filter((file) => !requiredSet.has(file.path)).length,
		...totals,
		unsafePathCount: parsed.unsafePathCount,
		declaredCountMismatchCount: parsed.declaredCountMismatchCount,
		excessFileCount: Math.max(0, parsed.files.length - MAX_REPORT_FILES),
	});
	const observations = [
		renderCoverageSummary(summary),
		...requiredPaths.map((path) => {
			const file = filesByPath.get(path);
			return file ? renderCoverageFile(file) : `Coverage file ${path} is missing.`;
		}),
	];
	const diagnosticRefs = [
		coverageSummaryRef(summary, format),
		...requiredPaths.map((path) => {
			const file = filesByPath.get(path);
			return file
				? `coverage-file:${canonicalJsonDigest(path)}/${file.measurementDigest}`
				: `coverage-missing:${canonicalJsonDigest(path)}`;
		}),
	];
	return Object.freeze({summary, observations, diagnosticRefs});
}

function completeCoverage(summary: CoverageIngestionSummary): boolean {
	return (
		summary.missingRequiredPathCount === 0 &&
		summary.unsafePathCount === 0 &&
		summary.declaredCountMismatchCount === 0 &&
		summary.excessFileCount === 0
	);
}

function renderCoverageSummary(summary: CoverageIngestionSummary): string {
	return `Coverage scope observed ${summary.matchedRequiredPathCount}/${summary.requiredPathCount} required files; lines ${summary.lineHit}/${summary.lineFound}; branches ${summary.branchHit}/${summary.branchFound}; functions ${summary.functionHit}/${summary.functionFound}; missing=${summary.missingRequiredPathCount}; unsafe=${summary.unsafePathCount}; declared_mismatches=${summary.declaredCountMismatchCount}; excess_files=${summary.excessFileCount}.`;
}

function renderCoverageFile(file: ParsedCoverageFile): string {
	return `Coverage file ${file.path}: lines ${file.lineHit}/${file.lineFound}; branches ${file.branchHit}/${file.branchFound}; functions ${file.functionHit}/${file.functionFound}; measurement=${file.measurementDigest}.`;
}

function coverageSummaryRef(
	...input: [CoverageIngestionSummary, CoverageArtifactFormat]
): string {
	const [summary, format] = input;
	return [
		`coverage-summary:${format}`,
		"required",
		summary.requiredPathCount,
		"matched",
		summary.matchedRequiredPathCount,
		"lines",
		`${summary.lineHit}-${summary.lineFound}`,
		"branches",
		`${summary.branchHit}-${summary.branchFound}`,
		"functions",
		`${summary.functionHit}-${summary.functionFound}`,
		"missing",
		summary.missingRequiredPathCount,
		"unsafe",
		summary.unsafePathCount,
		"declaredMismatches",
		summary.declaredCountMismatchCount,
		"excessFiles",
		summary.excessFileCount,
	].join("/");
}
