import type {ChangeIntakeMaterial} from "../../changes/intake/contracts.ts";
import type {
	EvidenceRecord,
	EvidenceSensitivity,
	EvidenceSubject,
} from "../../evidence/contracts.ts";
import {reduceEvidenceObligation} from "../../evidence/obligations.ts";
import type {CheckCatalog} from "../../loop-exit/catalog.ts";
import type {CheckDefinition} from "../../loop-exit/contracts.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "../../loop-exit/runner.ts";
import {
	createSecurityScannerRequests,
	runSecurityScannerSuite,
	type RunSecurityScannerSuiteInput,
	type SecurityScannerAdapter,
	type SecurityScannerAdapterRequest,
	type SecurityScannerSuiteResult,
} from "../../loop-exit/security-scanners.ts";
import {toCanonicalJsonValue} from "../../utils/canonical-json.ts";
import {
	assertSecuritySurfaceClassification,
	type SecuritySurfaceClassification,
} from "../../loop-exit/security-surfaces.ts";

export type DecisionSecurityScanContext = Omit<
	RunSecurityScannerSuiteInput,
	"subject" | "surfaces" | "sensitivity" | "adapters" | "signal"
>;

interface CreateDecisionSecurityScannerExecutorInput {
	readonly catalog: CheckCatalog;
	readonly subject: EvidenceSubject;
	readonly classification: SecuritySurfaceClassification;
	readonly adapters: readonly SecurityScannerAdapter[];
	readonly sensitivity: EvidenceSensitivity;
	readonly scanContext?: DecisionSecurityScanContext;
	readonly recordIntakeMaterials: (
		materials: readonly ChangeIntakeMaterial[],
	) => void;
}

export function createDecisionSecurityScannerExecutor(
	input: CreateDecisionSecurityScannerExecutorInput,
): LoopCheckExecutor {
	assertSecuritySurfaceClassification(input.classification);
	const registration = input.catalog.get("security_scanners_valid", "decision");
	if (!registration) {
		throw new Error("Decision security scanner Check is absent from the Catalog.");
	}
	const check = registration.check;
	if (check.execution.kind !== "code") {
		throw new Error("Decision security scanner Check must be a Code Check.");
	}
	return Object.freeze({
		loop: "decision" as const,
		checkId: check.id,
		checkVersion: check.version,
		execution: {...check.execution},
		cacheable: false,
		producesEvidenceObligationIds: check.evidenceObligations.map(
			(obligation) => obligation.id,
		),
		execute: (context: LoopCheckExecutorContext) =>
			executeSecurityScanners(context, check, input),
	});
}

async function executeSecurityScanners(
	context: LoopCheckExecutorContext,
	check: CheckDefinition,
	input: CreateDecisionSecurityScannerExecutorInput,
): Promise<CheckExecutorObservation> {
	if (!input.scanContext) {
		return {
			disposition: "indeterminate",
			findings: [
				"Required security scanner source snapshot and tree context is unavailable.",
			],
			issueClass: "security_scanner_input",
		};
	}
	if (context.candidate.digest !== input.subject.candidateDigest) {
		return {
			disposition: "indeterminate",
			findings: ["Security scanner subject does not match the exact Candidate."],
			issueClass: "security_scanner_input",
		};
	}
	const scannerSubject = toCanonicalJsonValue({
		...input.subject,
		sourceTreeDigest: input.scanContext.sourceTreeDigest,
	}) as unknown as EvidenceSubject;
	const persisted = persistedScannerObservation(context, input, scannerSubject);
	if (persisted) return persisted;
	const suite = await runSecurityScannerSuite({
		...input.scanContext,
		subject: scannerSubject,
		surfaces: input.classification.surfaces,
		sensitivity: input.sensitivity,
		adapters: input.adapters,
		signal: context.signal,
	});
	input.recordIntakeMaterials(suite.intakeMaterials);
	return suiteObservation(check, scannerSubject, suite);
}

interface PersistedScannerRecords {
	readonly request: SecurityScannerAdapterRequest;
	readonly command: EvidenceRecord<"command_execution"> | undefined;
	readonly source: EvidenceRecord<"source_observation"> | undefined;
}

function persistedScannerObservation(
	context: LoopCheckExecutorContext,
	input: CreateDecisionSecurityScannerExecutorInput,
	scannerSubject: EvidenceSubject,
): CheckExecutorObservation | null {
	if (!input.scanContext) return null;
	const observations = createSecurityScannerRequests({
		...input.scanContext,
		subject: scannerSubject,
		surfaces: input.classification.surfaces,
		sensitivity: input.sensitivity,
		adapters: input.adapters,
		signal: context.signal,
	}).map((request) => scannerRecords(context.evidenceRecords, request));
	if (observations.every(({command, source}) => !command && !source)) return null;
	return persistedScannerResult(observations);
}

function scannerRecords(
	records: readonly EvidenceRecord[],
	request: SecurityScannerAdapterRequest,
): PersistedScannerRecords {
	const requestRef = `scanner-request:${request.requestDigest}`;
	return {
		request,
		command: records.find(
			(record): record is EvidenceRecord<"command_execution"> =>
				record.kind === "command_execution" &&
				record.producer.id === request.scannerId &&
				record.producer.version === request.scannerVersion &&
				record.payload.invocationDigest === request.requestDigest &&
				record.provenanceRefs.includes(requestRef),
		),
		source: records.find(
			(record): record is EvidenceRecord<"source_observation"> =>
				record.kind === "source_observation" &&
				record.producer.id === request.scannerId &&
				record.producer.version === request.scannerVersion &&
				record.payload.snapshotDigest === request.sourceSnapshotDigest &&
				record.provenanceRefs.includes(requestRef),
		),
	};
}

function persistedScannerResult(
	observations: readonly PersistedScannerRecords[],
): CheckExecutorObservation {
	const commandRecords = observations.flatMap(({command}) =>
		command ? [command] : [],
	);
	const findingRefs = commandRecords.flatMap((record) =>
		record.payload.diagnosticRefs.filter((reference) => reference.includes(":finding:")),
	);
	if (findingRefs.length > 0) {
		return {
			disposition: "unsatisfied",
			measurement: {shape: "boolean", value: false},
			findings: findingRefs.map((reference) => `Persisted scanner finding ${reference}.`),
			issueClass: "security_scanner_finding",
			feedback: "Repair persisted in-scope scanner findings before Decision exit.",
		};
	}
	const stale = commandRecords.some((record) =>
		record.payload.diagnosticRefs.some((reference) =>
			reference.endsWith(":advisory-stale"),
		),
	);
	if (!observations.every(completeScannerRecords) || stale) {
		return {
			disposition: "indeterminate",
			findings: [
				stale
					? "Persisted dependency advisory Evidence is stale."
					: "Persisted security scanner Evidence is incomplete or unavailable.",
			],
			issueClass: "security_scanner_unavailable",
		};
	}
	return {
		disposition: "satisfied",
		measurement: {shape: "boolean", value: true},
		findings: [],
	};
}

function completeScannerRecords({
	request,
	command,
	source,
}: PersistedScannerRecords): boolean {
	return Boolean(
		command?.payload.termination === "exited" &&
			command.payload.environmentDigest === request.environmentDigest &&
			command.subject.sourceTreeDigest === request.sourceTreeDigest &&
			source?.coverage === "complete" &&
			source.subject.sourceTreeDigest === request.sourceTreeDigest,
	);
}

function suiteObservation(
	check: CheckDefinition,
	subject: EvidenceSubject,
	suite: SecurityScannerSuiteResult,
): CheckExecutorObservation {
	const producedEvidenceResolutions = check.evidenceObligations.map((obligation) =>
		reduceEvidenceObligation({
			obligation,
			evidence: evidenceForObligation(obligation.id, suite.evidenceRecords).map(
				(evidence) => ({evidence, relation: "supporting" as const}),
			),
			expectedSubject: subject,
		}),
	);
	const operationalFindings = suite.runs.flatMap((run) =>
		run.limitations.map((limitation) => `${run.scannerType}: ${limitation}`),
	);
	const findings = [...suite.findings, ...operationalFindings];
	if (suite.status === "passed") {
		return {
			disposition: "satisfied",
			measurement: {shape: "boolean", value: true},
			findings,
			producedEvidenceRecords: suite.evidenceRecords,
			producedEvidenceResolutions,
		};
	}
	if (suite.status === "failed") {
		return {
			disposition: "unsatisfied",
			measurement: {shape: "boolean", value: false},
			findings,
			issueClass: "security_scanner_finding",
			feedback:
				"Repair in-scope findings; route sanitized independent findings through Change intake.",
			producedEvidenceRecords: suite.evidenceRecords,
			producedEvidenceResolutions,
		};
	}
	return {
		disposition: "indeterminate",
		findings:
			findings.length > 0
				? findings
				: ["Required security scanner coverage is unavailable or incomplete."],
		issueClass: "security_scanner_unavailable",
		producedEvidenceRecords: suite.evidenceRecords,
		producedEvidenceResolutions,
	};
}

function evidenceForObligation(
	obligationId: string,
	records: readonly EvidenceRecord[],
): readonly EvidenceRecord[] {
	if (obligationId === "scanner-command-execution") {
		return records.filter((record) => record.kind === "command_execution");
	}
	if (obligationId === "scanner-source-observation") {
		return records.filter((record) => record.kind === "source_observation");
	}
	throw new Error(`Unknown security scanner Evidence obligation ${obligationId}.`);
}
