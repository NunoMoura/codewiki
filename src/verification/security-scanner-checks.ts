import type {
	EvidenceRecord,
	EvidenceSubject,
} from "../evidence/contracts.ts";
import type {EvidenceObligationResolution} from "../evidence/obligation-resolution.ts";
import {reduceEvidenceObligation} from "../evidence/obligations.ts";
import type {SemanticLoop} from "./contracts.ts";
import type {CheckCatalog} from "./catalog.ts";
import type {CheckDefinition, CheckResult} from "./contracts.ts";
import type {
	CheckExecutorObservation,
	LoopCheckExecutor,
	LoopCheckExecutorContext,
} from "./runner.ts";
import type {SecurityScannerType} from "./security-scanners.ts";

export const ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL = Object.freeze({
	id: "codewiki.atomic-security-scanner-check",
	version: "2.0.0",
	producerCheckId: "security_scanners_valid",
} as const);

export const ATOMIC_SECURITY_SCANNER_CHECKS = Object.freeze([
	{
		checkId: "static_analysis_findings_absent",
		scannerType: "static_analysis",
		issueClass: "static_analysis_finding",
		feedback: "Repair in-scope static-analysis findings before Loop exit.",
	},
	{
		checkId: "dependency_advisories_absent",
		scannerType: "dependency_advisory",
		issueClass: "dependency_advisory_finding",
		feedback: "Resolve or explicitly change accepted dependency risk before Loop exit.",
	},
	{
		checkId: "credential_exposure_absent",
		scannerType: "secret_detection",
		issueClass: "credential_exposure_finding",
		feedback: "Remove exposed credentials and rotate affected secrets before Loop exit.",
	},
	{
		checkId: "infrastructure_configuration_verified",
		scannerType: "infrastructure_configuration",
		issueClass: "infrastructure_configuration_finding",
		feedback: "Repair infrastructure or deployment configuration findings before Loop exit.",
	},
	{
		checkId: "authorization_controls_verified",
		scannerType: "authorization_test",
		issueClass: "authorization_control_finding",
		feedback: "Repair authorization-control failures before Loop exit.",
	},
	{
		checkId: "persistence_safety_verified",
		scannerType: "migration_test",
		issueClass: "persistence_safety_finding",
		feedback: "Repair persistence or migration safety failures before Loop exit.",
	},
] as const satisfies readonly AtomicSecurityScannerCheck[]);

interface AtomicSecurityScannerCheck {
	readonly checkId: string;
	readonly scannerType: SecurityScannerType;
	readonly issueClass: string;
	readonly feedback: string;
}

interface CreateAtomicSecurityScannerCheckExecutorsInput {
	readonly catalog: CheckCatalog;
	readonly loop: SemanticLoop;
	readonly subject: EvidenceSubject;
}

interface AtomicScannerRecords {
	readonly resolutions: readonly EvidenceObligationResolution[];
}

export function createAtomicSecurityScannerCheckExecutors(
	input: CreateAtomicSecurityScannerCheckExecutorsInput,
): readonly LoopCheckExecutor[] {
	return Object.freeze(
		ATOMIC_SECURITY_SCANNER_CHECKS.map((definition) => {
			const registration = input.catalog.get(definition.checkId, input.loop);
			if (!registration) {
				throw new Error(
					`Atomic security scanner Check ${definition.checkId} is absent from the Catalog.`,
				);
			}
			const check = registration.check;
			if (check.execution.kind !== "code") {
				throw new Error(
					`Atomic security scanner Check ${definition.checkId} must be a Code Check.`,
				);
			}
			return Object.freeze({
				loop: input.loop,
				checkId: check.id,
				checkVersion: check.version,
				execution: {...check.execution},
				producesEvidenceObligationIds: check.evidenceObligations.map(
					(obligation) => obligation.id,
				),
				execute: (context: LoopCheckExecutorContext) =>
					executeAtomicScannerCheck(context, check, definition, input.subject),
			}) satisfies LoopCheckExecutor;
		}),
	);
}

function executeAtomicScannerCheck(
	context: LoopCheckExecutorContext,
	check: CheckDefinition,
	definition: AtomicSecurityScannerCheck,
	subject: EvidenceSubject,
): CheckExecutorObservation {
	const dependency = scannerDependency(context.dependencyResults);
	if (!dependency) {
		return indeterminate(
			check,
			[],
			subject,
			`Atomic ${definition.scannerType} Check did not receive its scanner substrate dependency.`,
		);
	}
	const substrateIds = new Set(dependency.evidenceRecordIds);
	const records = context.evidenceRecords.filter(
		(record) =>
			substrateIds.has(record.evidenceId) &&
			record.provenanceRefs.includes(`scanner-type:${definition.scannerType}`),
	);
	const admitted = scannerRecords(check, records, subject);
	const requestRefs = unique(
		records.flatMap((record) =>
			record.provenanceRefs.filter((reference) =>
				reference.startsWith("scanner-request:"),
			),
		),
	);
	if (requestRefs.length !== 1) {
		return indeterminateWithResolutions(
			admitted.resolutions,
			`Atomic ${definition.scannerType} Check requires one exact scanner request substrate.`,
		);
	}
	return evaluateAtomicScannerRecords(records, admitted.resolutions, definition);
}

function evaluateAtomicScannerRecords(
	...args: [
		readonly EvidenceRecord[],
		readonly EvidenceObligationResolution[],
		AtomicSecurityScannerCheck,
	]
): CheckExecutorObservation {
	const [records, resolutions, definition] = args;
	const commandRecords = records.filter(
		(record): record is EvidenceRecord<"command_execution"> =>
			record.kind === "command_execution",
	);
	const sourceRecords = records.filter(
		(record): record is EvidenceRecord<"source_observation"> =>
			record.kind === "source_observation",
	);
	if (commandRecords.length !== 1 || sourceRecords.length > 1) {
		return indeterminateWithResolutions(
			resolutions,
			`Atomic ${definition.scannerType} Check received conflicting scanner records.`,
		);
	}
	const command = commandRecords[0];
	const findingRefs = command.payload.diagnosticRefs.filter((reference) =>
		reference.includes(":finding:"),
	);
	if (findingRefs.length > 0) {
		return {
			disposition: "unsatisfied",
			measurement: {shape: "boolean", value: false},
			findings: findingRefs.map(
				(reference) => `${definition.scannerType} reported ${reference}.`,
			),
			issueClass: definition.issueClass,
			feedback: definition.feedback,
			producedEvidenceResolutions: resolutions,
		};
	}
	const stale = command.payload.diagnosticRefs.some((reference) =>
		reference.endsWith(":advisory-stale"),
	);
	const outcomeRefs = command.payload.diagnosticRefs.filter((reference) =>
		reference.includes(":outcome:"),
	);
	const complete =
		outcomeRefs.length === 1 &&
		outcomeRefs[0]?.endsWith(":outcome:clean") &&
		command.payload.termination === "exited" &&
		command.coverage === "complete" &&
		sourceRecords.length === 1 &&
		sourceRecords[0]?.coverage === "complete" &&
		!stale &&
		resolutions.every((resolution) => resolution.status === "ready");
	if (!complete) {
		const finding = stale
			? `Atomic ${definition.scannerType} Check received stale advisory Evidence.`
			: `Atomic ${definition.scannerType} Check Evidence is unavailable or incomplete.`;
		return indeterminateWithResolutions(resolutions, finding);
	}
	return {
		disposition: "satisfied",
		measurement: {shape: "boolean", value: true},
		findings: [],
		producedEvidenceResolutions: resolutions,
	};
}

function scannerRecords(
	check: CheckDefinition,
	records: readonly EvidenceRecord[],
	subject: EvidenceSubject,
): AtomicScannerRecords {
	return {
		resolutions: check.evidenceObligations.map((obligation) =>
			reduceEvidenceObligation({
				obligation,
				evidence: records.flatMap((evidence) =>
					obligation.kinds.includes(evidence.kind)
						? [{evidence, relation: "supporting" as const}]
						: [],
				),
				expectedSubject: subject,
			}),
		),
	};
}

function scannerDependency(
	results: readonly CheckResult[],
): CheckResult | undefined {
	const matches = results.filter(
		(result) =>
			result.checkId === ATOMIC_SECURITY_SCANNER_CHECK_PROTOCOL.producerCheckId,
	);
	return matches.length === 1 ? matches[0] : undefined;
}

function indeterminate(
	check: CheckDefinition,
	records: readonly EvidenceRecord[],
	subject: EvidenceSubject,
	finding: string,
): CheckExecutorObservation {
	return indeterminateWithResolutions(
		scannerRecords(check, records, subject).resolutions,
		finding,
	);
}

function indeterminateWithResolutions(
	resolutions: readonly EvidenceObligationResolution[],
	finding: string,
): CheckExecutorObservation {
	return {
		disposition: "indeterminate",
		findings: [finding],
		issueClass: "security_scanner_unavailable",
		producedEvidenceResolutions: resolutions,
	};
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
