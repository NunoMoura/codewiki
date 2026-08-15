import type {
	ChangeIntakeContent,
	ChangeIntakeMaterial,
} from "../../changes/intake/contracts.ts";
import {normalizeChangeIntakeContent} from "../../changes/intake/normalize.ts";
import {createSecurityScannerFindingMaterial} from "../../changes/intake/producers.ts";
import {
	EVIDENCE_SCHEMA_VERSION,
	type EvidenceRecord,
	type EvidenceSensitivity,
	type EvidenceSubject,
} from "../../evidence/contracts.ts";
import {materializeEvidenceRecord} from "../../evidence/materialize.ts";
import {
	assertSha256Digest,
	canonicalJson,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {assertExactKeys} from "../../utils/json.ts";
import {
	SECURITY_SURFACES,
	type SecuritySurface,
} from "../../checks/security-surfaces.ts";
import {
	SECURITY_SCANNER_TYPES,
	type SecurityScannerType,
} from "../ports.ts";

export const SECURITY_SCANNER_PROTOCOL = Object.freeze({
	id: "codewiki.security-scanner-suite",
	version: "3.0.0",
	maxScanners: 6,
	maxFindingsPerScanner: 128,
	maxCanonicalObservationBytes: 262_144,
} as const);

export interface SecurityAdvisorySnapshot {
	readonly scannerType: "dependency_advisory";
	readonly snapshotDigest: Sha256Digest;
	readonly observedAt: string;
	readonly validUntil: string;
	readonly sourceRefs: readonly string[];
}

export interface SecurityScannerSourceBinding {
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly sourceTree: string;
	readonly sourceTreeDigest: Sha256Digest;
	readonly environmentDigest: Sha256Digest;
	readonly sourceRefs: readonly string[];
	readonly knowledgeRefs: readonly string[];
	readonly ownershipRefs: readonly string[];
}

export interface SecurityScannerAdapterRequest extends SecurityScannerSourceBinding {
	readonly protocol: typeof SECURITY_SCANNER_PROTOCOL;
	readonly scannerType: SecurityScannerType;
	readonly scannerId: string;
	readonly scannerVersion: string;
	readonly configurationDigest: Sha256Digest;
	readonly requestDigest: Sha256Digest;
	readonly candidateDigest: Sha256Digest;
	readonly surfaces: readonly SecuritySurface[];
	readonly advisorySnapshot?: SecurityAdvisorySnapshot;
}

export interface SecurityScannerFindingObservation {
	readonly findingId: string;
	readonly content: ChangeIntakeContent;
}

export interface SecurityScannerAdapterObservation {
	readonly requestDigest: Sha256Digest;
	readonly runId: string;
	readonly startedAt: string;
	readonly completedAt: string;
	readonly termination: "exited" | "timed_out" | "cancelled" | "unavailable";
	readonly exitCode?: number;
	readonly outcome: "clean" | "findings" | "error";
	readonly coverage: "complete" | "partial" | "unknown";
	readonly stdoutDigest?: Sha256Digest;
	readonly stderrDigest?: Sha256Digest;
	readonly findings: readonly SecurityScannerFindingObservation[];
	readonly limitations: readonly string[];
}

export interface SecurityScannerAdapter {
	readonly scannerType: SecurityScannerType;
	readonly scannerId: string;
	readonly scannerVersion: string;
	readonly configurationDigest: Sha256Digest;
	readonly execute: (
		...args: [SecurityScannerAdapterRequest, AbortSignal]
	) => Promise<SecurityScannerAdapterObservation>;
}

export interface RunSecurityScannerSuiteInput extends SecurityScannerSourceBinding {
	readonly subject: EvidenceSubject;
	readonly surfaces: readonly SecuritySurface[];
	readonly observedAt: string;
	readonly sensitivity: EvidenceSensitivity;
	readonly adapters: readonly SecurityScannerAdapter[];
	readonly advisorySnapshots?: readonly SecurityAdvisorySnapshot[];
	readonly signal?: AbortSignal;
}

export interface SecurityScannerRunResult {
	readonly scannerType: SecurityScannerType;
	readonly scannerId: string;
	readonly scannerVersion: string;
	readonly requestDigest: Sha256Digest;
	readonly runId: string;
	readonly status: "passed" | "failed" | "indeterminate";
	readonly staleAdvisory: boolean;
	readonly findingCount: number;
	readonly findingIds: readonly string[];
	readonly evidenceIds: readonly string[];
	readonly limitations: readonly string[];
}

export interface SecurityScannerSuiteResult {
	readonly protocol: typeof SECURITY_SCANNER_PROTOCOL;
	readonly candidateDigest: Sha256Digest;
	readonly sourceSnapshotDigest: Sha256Digest;
	readonly sourceTree: string;
	readonly sourceTreeDigest: Sha256Digest;
	readonly requiredScannerTypes: readonly SecurityScannerType[];
	readonly status: "passed" | "failed" | "indeterminate";
	readonly runs: readonly SecurityScannerRunResult[];
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly intakeMaterials: readonly ChangeIntakeMaterial[];
	readonly findings: readonly string[];
	readonly suiteDigest: Sha256Digest;
}

interface CandidateEvidenceSubject extends EvidenceSubject {
	readonly candidateDigest: Sha256Digest;
}

interface NormalizedSuiteInput extends Omit<RunSecurityScannerSuiteInput, "signal"> {
	readonly subject: CandidateEvidenceSubject;
	readonly advisorySnapshots: readonly SecurityAdvisorySnapshot[];
	readonly signal: AbortSignal;
}

interface ScannerExecutionResult {
	readonly run: SecurityScannerRunResult;
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly intakeMaterials: readonly ChangeIntakeMaterial[];
	readonly findings: readonly string[];
}

const ADAPTER_FIELDS = [
	"scannerType",
	"scannerId",
	"scannerVersion",
	"configurationDigest",
	"execute",
] as const;
const OBSERVATION_FIELDS = [
	"requestDigest",
	"runId",
	"startedAt",
	"completedAt",
	"termination",
	"exitCode",
	"outcome",
	"coverage",
	"stdoutDigest",
	"stderrDigest",
	"findings",
	"limitations",
] as const;
const FINDING_FIELDS = ["findingId", "content"] as const;
const ADVISORY_FIELDS = [
	"scannerType",
	"snapshotDigest",
	"observedAt",
	"validUntil",
	"sourceRefs",
] as const;

export function requiredSecurityScannerTypes(
	surfaces: readonly SecuritySurface[],
): readonly SecurityScannerType[] {
	const normalized = normalizedSurfaces(surfaces);
	const required = new Set<SecurityScannerType>(["static_analysis"]);
	for (const surface of normalized) {
		if (surface === "dependency_supply_chain") required.add("dependency_advisory");
		if (surface === "credentials_secrets") required.add("secret_detection");
		if (surface === "infrastructure_configuration") {
			required.add("infrastructure_configuration");
		}
		if (surface === "authentication_authorization") required.add("authorization_test");
		if (surface === "persistence_migration") required.add("migration_test");
	}
	return Object.freeze(
		SECURITY_SCANNER_TYPES.filter((scannerType) => required.has(scannerType)),
	);
}

export function createSecurityScannerRequests(
	input: RunSecurityScannerSuiteInput,
): readonly SecurityScannerAdapterRequest[] {
	const normalized = normalizeSuiteInput(input);
	const adapters = new Map(
		normalized.adapters.map((adapter) => [adapter.scannerType, adapter]),
	);
	return Object.freeze(
		requiredSecurityScannerTypes(normalized.surfaces).map((scannerType) =>
			scannerRequest(
				normalized,
				adapters.get(scannerType) ?? missingAdapter(scannerType),
				scannerType,
				normalized.advisorySnapshots.find(
					(snapshot) => snapshot.scannerType === scannerType,
				),
			),
		),
	);
}

export async function runSecurityScannerSuite(
	input: RunSecurityScannerSuiteInput,
): Promise<SecurityScannerSuiteResult> {
	const normalized = normalizeSuiteInput(input);
	const requiredScannerTypes = requiredSecurityScannerTypes(normalized.surfaces);
	const adapters = new Map(
		normalized.adapters.map((adapter) => [adapter.scannerType, adapter]),
	);
	const executions = await Promise.all(
		requiredScannerTypes.map((scannerType) =>
			executeRequiredScanner(normalized, scannerType, adapters.get(scannerType)),
		),
	);
	const runs = executions.map((execution) => execution.run);
	const evidenceRecords = executions
		.flatMap((execution) => execution.evidenceRecords)
		.sort((left, right) => compareText(left.evidenceId, right.evidenceId));
	const intakeMaterials = executions.flatMap((execution) => execution.intakeMaterials);
	const findings = sortedUnique(executions.flatMap((execution) => execution.findings));
	const status = suiteStatus(runs);
	const body = {
		protocol: SECURITY_SCANNER_PROTOCOL,
		candidateDigest: normalized.subject.candidateDigest,
		sourceSnapshotDigest: normalized.sourceSnapshotDigest,
		sourceTree: normalized.sourceTree,
		sourceTreeDigest: normalized.sourceTreeDigest,
		requiredScannerTypes,
		status,
		runs,
		evidenceRecords,
		intakeMaterials,
		findings,
	};
	return toCanonicalJsonValue({
		...body,
		suiteDigest: canonicalJsonDigest(body),
	}) as unknown as SecurityScannerSuiteResult;
}

async function executeRequiredScanner(
	...args: [NormalizedSuiteInput, SecurityScannerType, SecurityScannerAdapter | undefined]
): Promise<ScannerExecutionResult> {
	const [input, scannerType, adapter] = args;
	const selected = adapter ?? missingAdapter(scannerType);
	const advisorySnapshot = input.advisorySnapshots.find(
		(snapshot) => snapshot.scannerType === scannerType,
	);
	const request = scannerRequest(input, selected, scannerType, advisorySnapshot);
	let observation: SecurityScannerAdapterObservation;
	if (!adapter) {
		observation = unavailableObservation(request, input.observedAt, "Required scanner adapter is unavailable.");
	} else if (scannerType === "dependency_advisory" && !advisorySnapshot) {
		observation = unavailableObservation(
			request,
			input.observedAt,
			"Required dependency advisory snapshot is unavailable.",
		);
	} else {
		try {
			observation = normalizeObservation(
				await adapter.execute(request, input.signal),
				request,
				input.observedAt,
			);
		} catch {
			observation = unavailableObservation(
				request,
				input.observedAt,
				input.signal.aborted
					? "Required scanner execution was cancelled."
					: "Required scanner adapter failed or returned malformed output.",
				input.signal.aborted ? "cancelled" : "unavailable",
			);
		}
	}
	return materializeScannerExecution(
		input,
		request,
		observation,
		advisorySnapshot,
	);
}

function scannerRequest(
	...args: [
		NormalizedSuiteInput,
		SecurityScannerAdapter,
		SecurityScannerType,
		SecurityAdvisorySnapshot | undefined,
	]
): SecurityScannerAdapterRequest {
	const [input, adapter, scannerType, advisorySnapshot] = args;
	const body = {
		scannerType,
		scannerId: adapter.scannerId,
		scannerVersion: adapter.scannerVersion,
		configurationDigest: adapter.configurationDigest,
		candidateDigest: input.subject.candidateDigest,
		sourceSnapshotDigest: input.sourceSnapshotDigest,
		sourceTree: input.sourceTree,
		sourceTreeDigest: input.sourceTreeDigest,
		environmentDigest: input.environmentDigest,
		surfaces: input.surfaces,
		sourceRefs: input.sourceRefs,
		knowledgeRefs: input.knowledgeRefs,
		ownershipRefs: input.ownershipRefs,
		...(advisorySnapshot ? {advisorySnapshot} : {}),
	};
	return toCanonicalJsonValue({
		protocol: SECURITY_SCANNER_PROTOCOL,
		...body,
		requestDigest: canonicalJsonDigest({
			protocol: SECURITY_SCANNER_PROTOCOL,
			...body,
		}),
	}) as unknown as SecurityScannerAdapterRequest;
}

function normalizeObservation(
	value: unknown,
	request: SecurityScannerAdapterRequest,
	observedAt: string,
): SecurityScannerAdapterObservation {
	assertExactKeys(value, OBSERVATION_FIELDS, "Security scanner observation");
	const record = value as SecurityScannerAdapterObservation;
	assertSha256Digest(record.requestDigest, "Security scanner observation requestDigest");
	if (record.requestDigest !== request.requestDigest) {
		throw new Error("Security scanner observation requestDigest mismatch.");
	}
	const runId = boundedId(record.runId, "Security scanner observation runId");
	const startedAt = canonicalIsoTimestamp(record.startedAt, "Security scanner startedAt");
	const completedAt = canonicalIsoTimestamp(record.completedAt, "Security scanner completedAt");
	if (Date.parse(startedAt) > Date.parse(completedAt)) {
		throw new Error("Security scanner completedAt cannot precede startedAt.");
	}
	if (Date.parse(completedAt) > Date.parse(observedAt)) {
		throw new Error("Security scanner completedAt cannot exceed Runtime observedAt.");
	}
	const termination = enumValue(
		record.termination,
		["exited", "timed_out", "cancelled", "unavailable"],
		"Security scanner termination",
	);
	const outcome = enumValue(
		record.outcome,
		["clean", "findings", "error"],
		"Security scanner outcome",
	);
	const coverage = enumValue(
		record.coverage,
		["complete", "partial", "unknown"],
		"Security scanner coverage",
	);
	assertExitCode(record.exitCode, termination);
	const findings = normalizeFindings(record.findings);
	assertOutcome(outcome, termination, record.exitCode, findings.length);
	const limitations = normalizedTextList(record.limitations, 32, "Security scanner limitations");
	const stdoutDigest = optionalDigest(record.stdoutDigest, "Security scanner stdoutDigest");
	const stderrDigest = optionalDigest(record.stderrDigest, "Security scanner stderrDigest");
	const normalized = {
		requestDigest: record.requestDigest,
		runId,
		startedAt,
		completedAt,
		termination,
		...(record.exitCode === undefined ? {} : {exitCode: record.exitCode}),
		outcome,
		coverage,
		...(stdoutDigest ? {stdoutDigest} : {}),
		...(stderrDigest ? {stderrDigest} : {}),
		findings,
		limitations,
	};
	if (
		Buffer.byteLength(canonicalJson(normalized), "utf8") >
		SECURITY_SCANNER_PROTOCOL.maxCanonicalObservationBytes
	) {
		throw new Error("Security scanner observation exceeds canonical byte limit.");
	}
	return toCanonicalJsonValue(normalized) as unknown as SecurityScannerAdapterObservation;
}

function materializeScannerExecution(
	input: NormalizedSuiteInput,
	request: SecurityScannerAdapterRequest,
	observation: SecurityScannerAdapterObservation,
	advisorySnapshot: SecurityAdvisorySnapshot | undefined,
): ScannerExecutionResult {
	const staleAdvisory =
		request.scannerType === "dependency_advisory" &&
		(!advisorySnapshot ||
			Date.parse(advisorySnapshot.validUntil) < Date.parse(observation.completedAt));
	const commandEvidence = materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "command_execution",
			provenanceRefs: scannerProvenanceRefs(request),
			payload: {
				adapterId: request.scannerId,
				adapterVersion: request.scannerVersion,
				invocationDigest: request.requestDigest,
				environmentDigest: request.environmentDigest,
				termination: observation.termination,
				...(observation.exitCode === undefined ? {} : {exitCode: observation.exitCode}),
				durationMs:
					Date.parse(observation.completedAt) - Date.parse(observation.startedAt),
				...(observation.stdoutDigest ? {stdoutDigest: observation.stdoutDigest} : {}),
				...(observation.stderrDigest ? {stderrDigest: observation.stderrDigest} : {}),
				diagnosticRefs: [
					`scanner:${request.scannerId}:outcome:${observation.outcome}`,
					...observation.findings.map(
						(finding) => `scanner:${request.scannerId}:finding:${finding.findingId}`,
					),
					...(staleAdvisory
						? [`scanner:${request.scannerId}:advisory-stale`]
						: []),
				],
			},
		},
		evidenceRuntimeContext(input, request, observation.coverage, advisorySnapshot),
	);
	const sourceEvidence =
		observation.termination === "exited"
			? materializeScannerSourceEvidence(input, request, observation, advisorySnapshot)
			: null;
	const evidenceRecords = sourceEvidence
		? [commandEvidence, sourceEvidence]
		: [commandEvidence];
	const intakeMaterials = observation.findings.map((finding) =>
		createSecurityScannerFindingMaterial({
			scannerId: request.scannerId,
			scannerVersion: request.scannerVersion,
			runId: observation.runId,
			tree: request.sourceTree,
			findingId: finding.findingId,
			content: finding.content,
		}),
	);
	const status = scannerRunStatus(observation, staleAdvisory);
	return {
		run: toCanonicalJsonValue({
			scannerType: request.scannerType,
			scannerId: request.scannerId,
			scannerVersion: request.scannerVersion,
			requestDigest: request.requestDigest,
			runId: observation.runId,
			status,
			staleAdvisory,
			findingCount: observation.findings.length,
			findingIds: observation.findings.map((finding) => finding.findingId),
			evidenceIds: evidenceRecords.map((record) => record.evidenceId).sort(compareText),
			limitations: sortedUnique([
				...observation.limitations,
				...(staleAdvisory ? ["Required advisory snapshot is missing or stale."] : []),
			]),
		}) as unknown as SecurityScannerRunResult,
		evidenceRecords,
		intakeMaterials,
		findings: observation.findings.map(
			(finding) => `${request.scannerType}:${finding.findingId}:${finding.content.summary}`,
		),
	};
}

function materializeScannerSourceEvidence(
	input: NormalizedSuiteInput,
	request: SecurityScannerAdapterRequest,
	observation: SecurityScannerAdapterObservation,
	advisorySnapshot: SecurityAdvisorySnapshot | undefined,
): EvidenceRecord<"source_observation"> {
	const allPaths = sortedUnique([
		...request.sourceRefs,
		...observation.findings.flatMap((finding) => finding.content.affectedRefs),
	]);
	const paths = allPaths.slice(0, 256);
	const pathLimitations =
		paths.length < allPaths.length
			? [`Source path projection retained ${paths.length} of ${allPaths.length} paths.`]
			: [];
	return materializeEvidenceRecord(
		{
			schemaVersion: EVIDENCE_SCHEMA_VERSION,
			kind: "source_observation",
			provenanceRefs: scannerProvenanceRefs(request),
			payload: {
				sourceType: "source",
				snapshotDigest: request.sourceSnapshotDigest,
				paths,
				symbols: [],
				ownershipRefs: request.ownershipRefs,
				observations: [
					`Security scanner ${request.scannerId}@${request.scannerVersion} completed with outcome ${observation.outcome} and coverage ${observation.coverage}.`,
					...observation.findings.map((finding) => finding.content.summary),
					...observation.limitations,
					...pathLimitations,
				],
			},
		},
		evidenceRuntimeContext(input, request, observation.coverage, advisorySnapshot),
	);
}

function evidenceRuntimeContext(
	input: NormalizedSuiteInput,
	request: SecurityScannerAdapterRequest,
	coverage: "complete" | "partial" | "unknown",
	advisorySnapshot: SecurityAdvisorySnapshot | undefined,
) {
	return {
		subject: input.subject,
		observedAt: input.observedAt,
		producer: {
			kind: "runtime" as const,
			id: request.scannerId,
			version: request.scannerVersion,
		},
		authority: "observed" as const,
		coverage,
		...(advisorySnapshot ? {freshnessBoundary: advisorySnapshot.validUntil} : {}),
		sensitivity: input.sensitivity,
	};
}

function normalizeSuiteInput(input: RunSecurityScannerSuiteInput): NormalizedSuiteInput {
	assertExactKeys(
		input,
		[
			"subject",
			"sourceSnapshotDigest",
			"sourceTree",
			"sourceTreeDigest",
			"environmentDigest",
			"surfaces",
			"sourceRefs",
			"knowledgeRefs",
			"ownershipRefs",
			"observedAt",
			"sensitivity",
			"adapters",
			"advisorySnapshots",
			"signal",
		],
		"Security scanner suite input",
	);
	assertSha256Digest(input.sourceSnapshotDigest, "Security scanner sourceSnapshotDigest");
	assertSha256Digest(input.sourceTreeDigest, "Security scanner sourceTreeDigest");
	assertSha256Digest(input.environmentDigest, "Security scanner environmentDigest");
	if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/u.test(input.sourceTree)) {
		throw new Error("Security scanner sourceTree must be a lowercase Git object id.");
	}
	if (!input.subject.candidateDigest) {
		throw new Error("Security scanner suite requires subject.candidateDigest.");
	}
	assertSha256Digest(
		input.subject.candidateDigest,
		"Security scanner subject candidateDigest",
	);
	if (input.subject.sourceTreeDigest !== input.sourceTreeDigest) {
		throw new Error("Security scanner subject sourceTreeDigest mismatch.");
	}
	const observedAt = canonicalIsoTimestamp(input.observedAt, "Security scanner observedAt");
	const surfaces = normalizedSurfaces(input.surfaces);
	const sourceRefs = normalizedRefList(input.sourceRefs, "Security scanner sourceRefs", 64, true);
	const knowledgeRefs = normalizedRefList(
		input.knowledgeRefs,
		"Security scanner knowledgeRefs",
		64,
		false,
	);
	const ownershipRefs = normalizedRefList(
		input.ownershipRefs,
		"Security scanner ownershipRefs",
		64,
		false,
	);
	const sensitivity = enumValue(
		input.sensitivity,
		["public", "project", "private"],
		"Security scanner sensitivity",
	);
	const adapters = normalizedAdapters(input.adapters);
	const advisorySnapshots = normalizedAdvisorySnapshots(
		input.advisorySnapshots ?? [],
		observedAt,
	);
	return {
		subject: toCanonicalJsonValue(input.subject) as unknown as CandidateEvidenceSubject,
		sourceSnapshotDigest: input.sourceSnapshotDigest,
		sourceTree: input.sourceTree,
		sourceTreeDigest: input.sourceTreeDigest,
		environmentDigest: input.environmentDigest,
		surfaces,
		sourceRefs,
		knowledgeRefs,
		ownershipRefs,
		observedAt,
		sensitivity,
		adapters,
		advisorySnapshots,
		signal: input.signal ?? new AbortController().signal,
	};
}

function normalizedAdapters(
	adapters: readonly SecurityScannerAdapter[],
): readonly SecurityScannerAdapter[] {
	if (!Array.isArray(adapters) || adapters.length > SECURITY_SCANNER_PROTOCOL.maxScanners) {
		throw new Error("Security scanner suite accepts at most 6 adapters.");
	}
	const normalized = adapters.map((adapter, index) => {
		assertExactKeys(adapter, ADAPTER_FIELDS, `Security scanner adapter ${index}`);
		const scannerType = enumValue(
			adapter.scannerType,
			SECURITY_SCANNER_TYPES,
			`Security scanner adapter ${index} scannerType`,
		);
		const scannerId = boundedId(adapter.scannerId, `Security scanner adapter ${index} scannerId`);
		const scannerVersion = boundedId(
			adapter.scannerVersion,
			`Security scanner adapter ${index} scannerVersion`,
		);
		assertSha256Digest(
			adapter.configurationDigest,
			`Security scanner adapter ${index} configurationDigest`,
		);
		if (typeof adapter.execute !== "function") {
			throw new Error(`Security scanner adapter ${index} execute must be a function.`);
		}
		return Object.freeze({...adapter, scannerType, scannerId, scannerVersion});
	});
	const types = normalized.map((adapter) => adapter.scannerType);
	if (new Set(types).size !== types.length) {
		throw new Error("Security scanner suite accepts one adapter per scanner type.");
	}
	const ids = normalized.map((adapter) => adapter.scannerId);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Security scanner suite requires a distinct scannerId per adapter.");
	}
	return Object.freeze(normalized);
}

function normalizedAdvisorySnapshots(
	snapshots: readonly SecurityAdvisorySnapshot[],
	observedAt: string,
): readonly SecurityAdvisorySnapshot[] {
	if (!Array.isArray(snapshots) || snapshots.length > 1) {
		throw new Error("Security scanner suite accepts at most one advisory snapshot.");
	}
	return Object.freeze(
		snapshots.map((snapshot, index) => {
			assertExactKeys(snapshot, ADVISORY_FIELDS, `Security advisory snapshot ${index}`);
			if (snapshot.scannerType !== "dependency_advisory") {
				throw new Error("Security advisory snapshot scannerType must be dependency_advisory.");
			}
			assertSha256Digest(snapshot.snapshotDigest, "Security advisory snapshotDigest");
			const snapshotObservedAt = canonicalIsoTimestamp(
				snapshot.observedAt,
				"Security advisory observedAt",
			);
			const validUntil = canonicalIsoTimestamp(
				snapshot.validUntil,
				"Security advisory validUntil",
			);
			if (Date.parse(snapshotObservedAt) > Date.parse(validUntil)) {
				throw new Error("Security advisory validUntil cannot precede observedAt.");
			}
			if (Date.parse(snapshotObservedAt) > Date.parse(observedAt)) {
				throw new Error("Security advisory observedAt cannot exceed Runtime observedAt.");
			}
			return toCanonicalJsonValue({
				scannerType: snapshot.scannerType,
				snapshotDigest: snapshot.snapshotDigest,
				observedAt: snapshotObservedAt,
				validUntil,
				sourceRefs: normalizedRefList(
					snapshot.sourceRefs,
					"Security advisory sourceRefs",
					16,
					true,
				),
			}) as unknown as SecurityAdvisorySnapshot;
		}),
	);
}

function normalizeFindings(
	findings: readonly SecurityScannerFindingObservation[],
): readonly SecurityScannerFindingObservation[] {
	if (!Array.isArray(findings) || findings.length > SECURITY_SCANNER_PROTOCOL.maxFindingsPerScanner) {
		throw new Error("Security scanner observation accepts at most 128 findings.");
	}
	const normalized = findings.map((finding, index) => {
		assertExactKeys(finding, FINDING_FIELDS, `Security scanner finding ${index}`);
		return toCanonicalJsonValue({
			findingId: boundedId(finding.findingId, `Security scanner finding ${index} findingId`),
			content: normalizeChangeIntakeContent(finding.content),
		}) as unknown as SecurityScannerFindingObservation;
	});
	const ids = normalized.map((finding) => finding.findingId);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Security scanner observation repeats findingId.");
	}
	return Object.freeze(
		[...normalized].sort((left, right) => compareText(left.findingId, right.findingId)),
	);
}

function assertExitCode(
	exitCode: number | undefined,
	termination: SecurityScannerAdapterObservation["termination"],
): void {
	if (termination === "exited" && !Number.isInteger(exitCode)) {
		throw new Error("Exited security scanner observation requires integer exitCode.");
	}
	if (termination !== "exited" && exitCode !== undefined) {
		throw new Error(`Security scanner termination ${termination} cannot include exitCode.`);
	}
}

function assertOutcome(
	outcome: SecurityScannerAdapterObservation["outcome"],
	termination: SecurityScannerAdapterObservation["termination"],
	exitCode: number | undefined,
	findingCount: number,
): void {
	if (termination !== "exited" && outcome !== "error") {
		throw new Error(`Security scanner termination ${termination} requires error outcome.`);
	}
	if (outcome === "clean" && (findingCount !== 0 || exitCode !== 0)) {
		throw new Error("Clean security scanner outcome requires exitCode 0 and no findings.");
	}
	if (outcome === "findings" && findingCount === 0) {
		throw new Error("Security scanner findings outcome requires at least one finding.");
	}
	if (outcome === "error" && findingCount !== 0) {
		throw new Error("Security scanner error outcome cannot include findings.");
	}
}

function scannerRunStatus(
	observation: SecurityScannerAdapterObservation,
	staleAdvisory: boolean,
): SecurityScannerRunResult["status"] {
	if (observation.findings.length > 0) return "failed";
	if (
		observation.termination !== "exited" ||
		observation.outcome === "error" ||
		observation.coverage !== "complete" ||
		staleAdvisory
	) {
		return "indeterminate";
	}
	return "passed";
}

function suiteStatus(
	runs: readonly SecurityScannerRunResult[],
): SecurityScannerSuiteResult["status"] {
	if (runs.some((run) => run.status === "failed")) return "failed";
	if (runs.some((run) => run.status === "indeterminate")) return "indeterminate";
	return "passed";
}

function unavailableObservation(
	request: SecurityScannerAdapterRequest,
	observedAt: string,
	limitation: string,
	termination: "cancelled" | "unavailable" = "unavailable",
): SecurityScannerAdapterObservation {
	return toCanonicalJsonValue({
		requestDigest: request.requestDigest,
		runId: `unavailable:${request.requestDigest.slice("sha256:".length, "sha256:".length + 16)}`,
		startedAt: observedAt,
		completedAt: observedAt,
		termination,
		outcome: "error",
		coverage: "unknown",
		findings: [],
		limitations: [limitation],
	}) as unknown as SecurityScannerAdapterObservation;
}

function missingAdapter(scannerType: SecurityScannerType): SecurityScannerAdapter {
	return Object.freeze({
		scannerType,
		scannerId: `codewiki.missing.${scannerType}`,
		scannerVersion: "1.0.0",
		configurationDigest: canonicalJsonDigest({scannerType, state: "unavailable"}),
		async execute() {
			throw new Error("Missing scanner adapter cannot execute.");
		},
	});
}

function scannerProvenanceRefs(request: SecurityScannerAdapterRequest): string[] {
	return [
		`scanner:${request.scannerId}@${request.scannerVersion}`,
		`scanner-type:${request.scannerType}`,
		`scanner-request:${request.requestDigest}`,
		`scanner-config:${request.configurationDigest}`,
		...(request.advisorySnapshot
			? [
					`advisory-snapshot:${request.advisorySnapshot.snapshotDigest}`,
					...request.advisorySnapshot.sourceRefs,
				]
			: []),
	];
}

function normalizedSurfaces(surfaces: readonly SecuritySurface[]): SecuritySurface[] {
	if (!Array.isArray(surfaces) || surfaces.length > SECURITY_SURFACES.length) {
		throw new Error("Security scanner surfaces must be a bounded array.");
	}
	const normalized = surfaces.map((surface) =>
		enumValue(surface, SECURITY_SURFACES, "Security scanner surface"),
	);
	if (new Set(normalized).size !== normalized.length) {
		throw new Error("Security scanner surfaces must not contain duplicates.");
	}
	return normalized.sort(compareText);
}

function normalizedRefList(
	values: readonly string[],
	label: string,
	maximum: number,
	required: boolean,
): string[] {
	if (!Array.isArray(values) || values.length > maximum || (required && values.length === 0)) {
		throw new Error(`${label} is outside its bounded cardinality.`);
	}
	const normalized = values.map((value, index) =>
		boundedText(value, `${label}[${index}]`, 2_048),
	);
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${label} must not contain duplicates.`);
	}
	return normalized.sort(compareText);
}

function normalizedTextList(
	values: readonly string[],
	maximum: number,
	label: string,
): string[] {
	if (!Array.isArray(values) || values.length > maximum) {
		throw new Error(`${label} accepts at most ${maximum} values.`);
	}
	const normalized = values
		.map((value, index) => boundedText(value, `${label}[${index}]`, 2_000))
		.sort(compareText);
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${label} must not contain duplicates.`);
	}
	return normalized;
}

function boundedId(value: unknown, label: string): string {
	const normalized = boundedText(value, label, 256);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u.test(normalized)) {
		throw new Error(`${label} is not a valid id.`);
	}
	return normalized;
}

function boundedText(value: unknown, label: string, maximum: number): string {
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const normalized = value.replace(/\r\n?/gu, "\n").normalize("NFC").trim();
	if (!normalized || [...normalized].length > maximum) {
		throw new Error(`${label} is outside its text bound.`);
	}
	if (/\p{Cc}/u.test(normalized)) throw new Error(`${label} contains prohibited controls.`);
	return normalized;
}

function optionalDigest(value: unknown, label: string): Sha256Digest | undefined {
	if (value === undefined) return undefined;
	assertSha256Digest(value, label);
	return value as Sha256Digest;
}

function canonicalIsoTimestamp(value: unknown, label: string): string {
	if (typeof value !== "string") throw new Error(`${label} must be text.`);
	const parsed = new Date(value);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
		throw new Error(`${label} must be a canonical ISO timestamp.`);
	}
	return value;
}

function enumValue<const T extends readonly string[]>(
	value: unknown,
	values: T,
	label: string,
): T[number] {
	if (typeof value !== "string" || !values.includes(value)) {
		throw new Error(`${label} must be one of: ${values.join(", ")}.`);
	}
	return value as T[number];
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareText);
}
