import type { EvidenceId } from "../evidence/contracts.ts";
import {
	assertValidEvidenceObligationResolution,
	type EvidenceObligationResolution,
} from "../evidence/obligation-resolution.ts";
import type { SemanticLoop } from "../semantic-loop.ts";
import {
	assertValidResolvedExitPolicy,
	LOOP_EXIT_SCHEMA_VERSION,
	type CheckBinding,
	type CheckDefinition,
	type CheckExecutionIdentity,
	type CheckJsonValue,
	type CheckMeasurement,
	type CheckResult,
	type CheckResultStatus,
	type CheckThreshold,
	type ExitReport,
	type ExitReportStatus,
	type ResolvedExitPolicy,
} from "./contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	loopQualifiedCheckDigest,
	toCanonicalJsonValue,
} from "./identity.ts";

const EXIT_REPORT_REDUCTION_VERSION = "1.0.0";

type CheckObservationDisposition =
	| "satisfied"
	| "unsatisfied"
	| "indeterminate";

interface CreateCheckResultInput {
	loop: SemanticLoop;
	policy: ResolvedExitPolicy;
	check: CheckDefinition;
	disposition: CheckObservationDisposition;
	measurement?: CheckMeasurement;
	evidenceResolutions: EvidenceObligationResolution[];
	findings?: string[];
	issueClass?: string;
	feedback?: string;
	execution: CheckExecutionIdentity;
}

interface CreateExitReportInput {
	policy: ResolvedExitPolicy;
	checkResults: CheckResult[];
}

export function createCheckResult(
	input: CreateCheckResultInput,
): CheckResult {
	assertExactKeys(
		input,
		[
			"loop",
			"policy",
			"check",
			"disposition",
			"measurement",
			"evidenceResolutions",
			"findings",
			"issueClass",
			"feedback",
			"execution",
		],
		"Check Result input",
	);
	assertValidResolvedExitPolicy(input.policy);
	if (
		input.disposition !== "satisfied" &&
		input.disposition !== "unsatisfied" &&
		input.disposition !== "indeterminate"
	) {
		throw new Error(`Check Result disposition ${String(input.disposition)} is invalid.`);
	}
	if (input.loop !== input.policy.loop) {
		throw new Error(
			`Check Result loop ${input.loop} does not match policy loop ${input.policy.loop}.`,
		);
	}
	const binding = requiredBinding(input.policy, input.check.id);
	assertCheckBinding(input.loop, input.policy, input.check, binding);
	assertExecution(input.check, input.execution);
	const measurement = normalizedMeasurement(input.check, input.measurement);
	const threshold = resolvedThreshold(input.check, binding);
	const status = derivedStatus(input.disposition, measurement, threshold);
	const findings = normalizedTextList(input.findings ?? [], "finding", false);
	if (status !== "pass" && findings.length === 0) {
		throw new Error(`Check Result ${input.check.id} ${status} requires findings.`);
	}
	const evidence = normalizedCheckEvidence({
		check: input.check,
		checkDigest: binding.checkDigest,
		disposition: input.disposition,
		resolutions: input.evidenceResolutions,
	});
	const issueClass = optionalText(input.issueClass, "issueClass");
	const feedback = optionalText(input.feedback, "feedback");
	const resultWithoutDigest = {
		schemaVersion: LOOP_EXIT_SCHEMA_VERSION,
		checkId: input.check.id,
		checkVersion: input.check.version,
		requirementDigest: input.check.requirementDigest,
		checkDigest: binding.checkDigest,
		candidateDigest: input.policy.candidateDigest,
		policyDigest: input.policy.policyDigest,
		status,
		...(measurement ? { measurement } : {}),
		...(threshold ? { threshold } : {}),
		evidenceResolutions: evidence.resolutions,
		evidenceRecordIds: evidence.recordIds,
		evidenceInputDigest: evidence.inputDigest,
		findings,
		...(issueClass ? { issueClass } : {}),
		repairTarget: input.check.repairTarget,
		...(feedback ? { feedback } : {}),
		execution: normalizedExecution(input.execution),
	};
	return immutable<CheckResult>({
		...resultWithoutDigest,
		resultDigest: canonicalJsonDigest(resultWithoutDigest),
	});
}

interface NormalizedCheckEvidence {
	readonly resolutions: EvidenceObligationResolution[];
	readonly recordIds: EvidenceId[];
	readonly inputDigest: string;
}

function normalizedCheckEvidence(input: {
	readonly check: CheckDefinition;
	readonly checkDigest: string;
	readonly disposition: CheckObservationDisposition;
	readonly resolutions: EvidenceObligationResolution[];
}): NormalizedCheckEvidence {
	const resolutions = normalizedEvidenceResolutions(input.resolutions);
	const expectedById = new Map(
		input.check.evidenceObligations.map((obligation) => [obligation.id, obligation]),
	);
	for (const resolution of resolutions) {
		const obligation = expectedById.get(resolution.obligationId);
		if (!obligation) {
			throw new Error(
				`Check Result ${input.check.id} received unknown Evidence obligation resolution ${resolution.obligationId}.`,
			);
		}
		assertValidEvidenceObligationResolution(resolution, obligation);
		if (resolution.status !== "ready" && input.disposition !== "indeterminate") {
			throw new Error(
				`Check Result ${input.check.id} requires indeterminate disposition while Evidence obligation ${resolution.obligationId} is ${resolution.status}.`,
			);
		}
	}
	for (const obligation of input.check.evidenceObligations) {
		if (!resolutions.some((entry) => entry.obligationId === obligation.id)) {
			throw new Error(
				`Check Result ${input.check.id} is missing Evidence obligation resolution ${obligation.id}.`,
			);
		}
	}
	const recordIds = evidenceRecordIds(resolutions);
	return {
		resolutions,
		recordIds,
		inputDigest: checkEvidenceInputDigest(input.checkDigest, resolutions),
	};
}

function checkEvidenceInputDigest(
	checkDigest: string,
	resolutions: readonly EvidenceObligationResolution[],
): string {
	assertSha256Digest(checkDigest, "Check evidence input Check digest");
	const normalized = normalizedEvidenceResolutions(resolutions);
	return canonicalJsonDigest({
		checkDigest,
		evidenceRecordIds: evidenceRecordIds(normalized),
		resolutionDigests: normalized.map((entry) => entry.resolutionDigest),
	});
}

function normalizedEvidenceResolutions(
	values: readonly EvidenceObligationResolution[],
): EvidenceObligationResolution[] {
	if (!Array.isArray(values)) {
		throw new Error("Check Result evidenceResolutions must be an array.");
	}
	for (const value of values) {
		assertValidEvidenceObligationResolution(value);
	}
	const normalized = [...values].sort((left, right) =>
		compareText(left.obligationId, right.obligationId),
	);
	const ids = normalized.map((entry) => entry.obligationId);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Check Result Evidence obligation resolution ids must be unique.");
	}
	return normalized;
}

function evidenceRecordIds(
	resolutions: readonly EvidenceObligationResolution[],
): EvidenceId[] {
	return [...new Set(resolutions.flatMap((entry) => entry.inputEvidenceIds))].sort(
		compareText,
	);
}

export function assertValidCheckResult(
	result: CheckResult,
	policy: ResolvedExitPolicy,
): void {
	assertValidResolvedExitPolicy(policy);
	const binding = requiredBinding(policy, result.checkId);
	assertResultIdentity(result, policy, binding);
}

export function createExitReport(input: CreateExitReportInput): ExitReport {
	assertExactKeys(input, ["policy", "checkResults"], "Exit Report input");
	assertValidResolvedExitPolicy(input.policy);
	const checkResults = [...input.checkResults].sort((left, right) =>
		left.checkId.localeCompare(right.checkId),
	);
	assertResultSet(input.policy, checkResults);
	const status = reduceExitStatus(input.policy.bindings, checkResults);
	const reportWithoutDigest = {
		schemaVersion: LOOP_EXIT_SCHEMA_VERSION,
		reductionVersion: EXIT_REPORT_REDUCTION_VERSION,
		loop: input.policy.loop,
		candidateDigest: input.policy.candidateDigest,
		catalogDigest: input.policy.catalogDigest,
		policyDigest: input.policy.policyDigest,
		status,
		checkResults,
	};
	return immutable<ExitReport>({
		...reportWithoutDigest,
		reportDigest: canonicalJsonDigest(reportWithoutDigest),
	});
}

export function assertValidExitReport(
	report: ExitReport,
	policy: ResolvedExitPolicy,
): void {
	assertValidResolvedExitPolicy(policy);
	if (report.schemaVersion !== LOOP_EXIT_SCHEMA_VERSION) {
		throw new Error(
			`Exit Report uses unsupported schema version ${report.schemaVersion}.`,
		);
	}
	if (report.reductionVersion !== EXIT_REPORT_REDUCTION_VERSION) {
		throw new Error(
			`Exit Report uses unsupported reduction version ${report.reductionVersion}.`,
		);
	}
	if (report.loop !== policy.loop) {
		throw new Error(`Exit Report loop does not match Resolved Exit Policy.`);
	}
	if (report.candidateDigest !== policy.candidateDigest) {
		throw new Error(`Exit Report candidate does not match Resolved Exit Policy.`);
	}
	if (report.catalogDigest !== policy.catalogDigest) {
		throw new Error(`Exit Report Catalog does not match Resolved Exit Policy.`);
	}
	if (report.policyDigest !== policy.policyDigest) {
		throw new Error(`Exit Report policy digest does not match Resolved Exit Policy.`);
	}
	assertResultSet(policy, report.checkResults);
	const expectedStatus = reduceExitStatus(policy.bindings, report.checkResults);
	if (report.status !== expectedStatus) {
		throw new Error(
			`Exit Report status mismatch: expected ${expectedStatus}, received ${report.status}.`,
		);
	}
	const { reportDigest, ...reportWithoutDigest } = report;
	assertSha256Digest(reportDigest, "Exit Report digest");
	const expectedDigest = canonicalJsonDigest(reportWithoutDigest);
	if (reportDigest !== expectedDigest) {
		throw new Error(`Exit Report digest mismatch: expected ${expectedDigest}.`);
	}
}

function assertResultSet(
	policy: ResolvedExitPolicy,
	results: CheckResult[],
): void {
	const bindings = new Map(
		policy.bindings.map((binding) => [binding.checkId, binding]),
	);
	const seen = new Set<string>();
	for (const result of results) {
		if (seen.has(result.checkId)) {
			throw new Error(`Duplicate Check Result ${result.checkId}.`);
		}
		seen.add(result.checkId);
		const binding = bindings.get(result.checkId);
		if (!binding) {
			throw new Error(`Check Result ${result.checkId} is not active in policy.`);
		}
		assertResultIdentity(result, policy, binding);
	}
	const resultIds = results.map((result) => result.checkId);
	const sortedResultIds = [...resultIds].sort((left, right) =>
		left.localeCompare(right),
	);
	if (resultIds.some((id, index) => id !== sortedResultIds[index])) {
		throw new Error("Check Result set is not in canonical Check order.");
	}
	for (const binding of policy.bindings) {
		if (binding.required && !seen.has(binding.checkId)) {
			throw new Error(`Required Check Result ${binding.checkId} is missing.`);
		}
	}
}

function assertResultIdentity(
	result: CheckResult,
	policy: ResolvedExitPolicy,
	binding: CheckBinding,
): void {
	assertExactKeys(
		result,
		[
			"schemaVersion",
			"checkId",
			"checkVersion",
			"requirementDigest",
			"checkDigest",
			"candidateDigest",
			"policyDigest",
			"status",
			"measurement",
			"threshold",
			"evidenceResolutions",
			"evidenceRecordIds",
			"evidenceInputDigest",
			"findings",
			"issueClass",
			"repairTarget",
			"feedback",
			"execution",
			"resultDigest",
		],
		`Check Result ${result.checkId}`,
	);
	if (result.schemaVersion !== LOOP_EXIT_SCHEMA_VERSION) {
		throw new Error(
			`Check Result ${result.checkId} uses unsupported schema version ${result.schemaVersion}.`,
		);
	}
	if (result.checkVersion !== binding.checkVersion) {
		throw new Error(`Check Result ${result.checkId} has wrong Check version.`);
	}
	if (
		result.requirementDigest !== binding.requirementDigest ||
		result.checkDigest !== binding.checkDigest
	) {
		throw new Error(`Check Result ${result.checkId} has wrong Check identity.`);
	}
	if (result.candidateDigest !== policy.candidateDigest) {
		throw new Error(`Check Result ${result.checkId} has wrong candidate.`);
	}
	if (result.policyDigest !== policy.policyDigest) {
		throw new Error(`Check Result ${result.checkId} has wrong policy.`);
	}
	if (!isCheckResultStatus(result.status)) {
		throw new Error(`Check Result ${result.checkId} has invalid status.`);
	}
	assertResultEvidenceIdentity(result);
	const { resultDigest, ...resultWithoutDigest } = result;
	assertSha256Digest(resultDigest, `Check Result ${result.checkId} digest`);
	const expectedDigest = canonicalJsonDigest(resultWithoutDigest);
	if (resultDigest !== expectedDigest) {
		throw new Error(
			`Check Result ${result.checkId} digest mismatch: expected ${expectedDigest}.`,
		);
	}
}

function assertResultEvidenceIdentity(result: CheckResult): void {
	const resolutions = normalizedEvidenceResolutions(result.evidenceResolutions);
	const receivedOrder = result.evidenceResolutions.map(
		(resolution) => resolution.obligationId,
	);
	const expectedOrder = resolutions.map((resolution) => resolution.obligationId);
	if (!sameTextList(receivedOrder, expectedOrder)) {
		throw new Error(
			`Check Result ${result.checkId} Evidence obligation resolutions are not canonical.`,
		);
	}
	const expectedRecordIds = evidenceRecordIds(resolutions);
	if (!sameTextList(result.evidenceRecordIds, expectedRecordIds)) {
		throw new Error(
			`Check Result ${result.checkId} Evidence Record identities do not match its resolutions.`,
		);
	}
	assertSha256Digest(
		result.evidenceInputDigest,
		`Check Result ${result.checkId} evidence input digest`,
	);
	const expectedInputDigest = checkEvidenceInputDigest(
		result.checkDigest,
		resolutions,
	);
	if (result.evidenceInputDigest !== expectedInputDigest) {
		throw new Error(
			`Check Result ${result.checkId} evidence input digest mismatch: expected ${expectedInputDigest}.`,
		);
	}
}

function sameTextList(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return (
		Array.isArray(left) &&
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function assertCheckBinding(
	loop: SemanticLoop,
	policy: ResolvedExitPolicy,
	check: CheckDefinition,
	binding: CheckBinding,
): void {
	if (
		binding.checkVersion !== check.version ||
		binding.requirementDigest !== check.requirementDigest
	) {
		throw new Error(`Check ${check.id} does not match its policy binding.`);
	}
	const expectedCheckDigest = loopQualifiedCheckDigest({
		loop,
		check,
		configuration: binding.parameters,
		catalogDigest: policy.catalogDigest,
	});
	if (binding.checkDigest !== expectedCheckDigest) {
		throw new Error(`Check ${check.id} digest does not match its policy binding.`);
	}
}

function assertExecution(
	check: CheckDefinition,
	execution: CheckExecutionIdentity,
): void {
	assertExactKeys(
		execution,
		[
			"id",
			"version",
			"kind",
			"adapterVersion",
			"modelRef",
			"configurationDigest",
			"trialPolicy",
			"aggregationPolicy",
		],
		`Check Result ${check.id} execution`,
	);
	if (
		execution.id !== check.execution.id ||
		execution.version !== check.execution.version ||
		execution.kind !== check.execution.kind
	) {
		throw new Error(`Check Result ${check.id} has wrong execution identity.`);
	}
	if (execution.configurationDigest) {
		assertSha256Digest(
			execution.configurationDigest,
			`Check Result ${check.id} configurationDigest`,
		);
	}
	for (const [key, value] of Object.entries(execution)) {
		if (key === "configurationDigest") continue;
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`Check Result ${check.id} execution ${key} is invalid.`);
		}
	}
}

function normalizedExecution(
	execution: CheckExecutionIdentity,
): CheckExecutionIdentity {
	return { ...execution };
}

function normalizedMeasurement(
	check: CheckDefinition,
	measurement: CheckMeasurement | undefined,
): CheckMeasurement | undefined {
	if (!measurement) return undefined;
	if (measurement.shape !== check.measurement.shape) {
		throw new Error(
			`Check Result ${check.id} measurement shape ${measurement.shape} does not match ${check.measurement.shape}.`,
		);
	}
	switch (measurement.shape) {
		case "boolean":
			assertExactKeys(measurement, ["shape", "value"], "boolean measurement");
			if (typeof measurement.value !== "boolean") invalidMeasurement(check.id);
			return { shape: "boolean", value: measurement.value };
		case "score":
		case "count":
			assertExactKeys(measurement, ["shape", "value"], `${measurement.shape} measurement`);
			if (!Number.isFinite(measurement.value)) invalidMeasurement(check.id);
			return { shape: measurement.shape, value: measurement.value };
		case "set":
			assertExactKeys(measurement, ["shape", "values"], "set measurement");
			return {
				shape: "set",
				values: normalizedTextList(measurement.values, "set value", true),
			};
		case "structured":
			assertExactKeys(
				measurement,
				["shape", "schemaRef", "value"],
				"structured measurement",
			);
			if (
				!measurement.schemaRef.trim() ||
				measurement.schemaRef !== check.measurement.schemaRef
			) {
				throw new Error(
					`Check Result ${check.id} structured measurement has wrong schemaRef.`,
				);
			}
			return immutable<CheckMeasurement>({
				shape: "structured",
				schemaRef: measurement.schemaRef,
				value: measurement.value,
			});
		default:
			return invalidMeasurement(check.id);
	}
}

function resolvedThreshold(
	check: CheckDefinition,
	binding: CheckBinding,
): CheckThreshold | undefined {
	if (check.measurement.kind !== "quantitative") return undefined;
	if (check.measurement.shape !== "score" && check.measurement.shape !== "count") {
		return undefined;
	}
	const minimum = numericParameter(
		binding.parameters.minimum,
		check.measurement.minimum,
		"minimum",
		check.id,
	);
	const maximum = numericParameter(
		binding.parameters.maximum,
		check.measurement.maximum,
		"maximum",
		check.id,
	);
	if (minimum === undefined && maximum === undefined) return undefined;
	if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
		throw new Error(`Check ${check.id} threshold minimum exceeds maximum.`);
	}
	return {
		...(minimum !== undefined ? { minimum } : {}),
		...(maximum !== undefined ? { maximum } : {}),
	};
}

function numericParameter(
	configured: CheckJsonValue | undefined,
	fallback: number | undefined,
	name: string,
	checkId: string,
): number | undefined {
	const value = configured ?? fallback;
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`Check ${checkId} ${name} threshold must be finite.`);
	}
	return value;
}

function derivedStatus(
	disposition: CheckObservationDisposition,
	measurement: CheckMeasurement | undefined,
	threshold: CheckThreshold | undefined,
): CheckResultStatus {
	if (disposition === "indeterminate") {
		if (measurement) {
			throw new Error("Indeterminate Check Result cannot include measurement.");
		}
		return "indeterminate";
	}
	if (!measurement) {
		throw new Error("Determinate Check Result requires measurement.");
	}
	const reported = disposition === "satisfied" ? "pass" : "fail";
	const measured = measuredStatus(measurement, threshold);
	if (measured && measured !== reported) {
		throw new Error(
			`Check Result disposition contradicts measurement: expected ${measured}.`,
		);
	}
	return measured ?? reported;
}

function measuredStatus(
	measurement: CheckMeasurement,
	threshold: CheckThreshold | undefined,
): "pass" | "fail" | undefined {
	if (measurement.shape === "boolean") {
		return measurement.value ? "pass" : "fail";
	}
	if (
		(measurement.shape === "score" || measurement.shape === "count") &&
		threshold
	) {
		const aboveMinimum =
			threshold.minimum === undefined || measurement.value >= threshold.minimum;
		const belowMaximum =
			threshold.maximum === undefined || measurement.value <= threshold.maximum;
		return aboveMinimum && belowMaximum ? "pass" : "fail";
	}
	return undefined;
}

function reduceExitStatus(
	bindings: CheckBinding[],
	results: CheckResult[],
): ExitReportStatus {
	const byId = new Map(results.map((result) => [result.checkId, result]));
	const requiredStatuses = bindings.flatMap((binding) =>
		binding.required ? [byId.get(binding.checkId)?.status] : [],
	);
	if (requiredStatuses.includes("fail")) return "fail";
	if (requiredStatuses.includes("indeterminate")) return "indeterminate";
	return "pass";
}

function requiredBinding(
	policy: ResolvedExitPolicy,
	checkId: string,
): CheckBinding {
	const binding = policy.bindings.find((entry) => entry.checkId === checkId);
	if (!binding) throw new Error(`Check ${checkId} is not active in policy.`);
	return binding;
}

function normalizedTextList(
	values: string[],
	label: string,
	sort: boolean,
): string[] {
	if (!Array.isArray(values)) {
		throw new Error(`Check Result ${label} must be an array.`);
	}
	for (const value of values) {
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`Check Result ${label} must be non-empty text.`);
		}
	}
	const normalized = [...new Set(values)];
	return sort ? normalized.sort((left, right) => left.localeCompare(right)) : normalized;
}

function optionalText(value: string | undefined, label: string): string | undefined {
	if (value === undefined) return undefined;
	if (!value.trim()) throw new Error(`Check Result ${label} cannot be blank.`);
	return value;
}

function assertExactKeys(
	value: object,
	allowed: readonly string[],
	label: string,
): void {
	const allowedKeys = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!allowedKeys.has(key)) {
			throw new Error(`${label} contains unsupported field ${key}.`);
		}
	}
}

function invalidMeasurement(checkId: string): never {
	throw new Error(`Check Result ${checkId} measurement is invalid.`);
}

function isCheckResultStatus(value: unknown): value is CheckResultStatus {
	return value === "pass" || value === "fail" || value === "indeterminate";
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function immutable<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
