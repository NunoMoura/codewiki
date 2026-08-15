import {
	CHECK_RESULT_SCHEMA_VERSION,
	GATE_REPORT_REDUCTION_VERSION,
	GATE_REPORT_SCHEMA_VERSION,
	CheckResultSchema,
	GateReportSchema,
	checkPassed,
	normalizeExecutionIdentity,
	qualifiedCheckId,
	type CheckExecutionFact,
	type CheckExecutionIdentity,
	type CheckFailure,
	type CheckInvocation,
	type CheckOutput,
	type CheckResult,
	type GateReport,
	type GateStopReason,
	type GateWarning,
} from "./contracts.ts";
import {assertCheckInvocation} from "./protocol.ts";
import {assertTypeboxSchema} from "../utils/json.ts";
import {
	assertCheckPackSnapshot,
	packagedChecks,
	type CheckPackSnapshot,
	type PackagedCheck,
} from "./packs/contracts.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export interface CreateCheckResultInput {
	readonly snapshot: CheckPackSnapshot;
	readonly check: PackagedCheck;
	readonly invocation: CheckInvocation;
	readonly output: CheckOutput;
	readonly execution: CheckExecutionIdentity;
}

export interface CreateGateReportInput {
	readonly snapshot: CheckPackSnapshot;
	readonly subjectDigest: Sha256Digest;
	readonly results: readonly CheckResult[];
	readonly executions: readonly CheckExecutionFact[];
	readonly cacheHitCheckIds?: readonly string[];
	readonly warnings?: readonly GateWarning[];
	readonly stoppedReason?: GateStopReason;
}

export function createCheckResult(input: CreateCheckResultInput): CheckResult {
	assertCheckPackSnapshot(input.snapshot, input.check.stage);
	assertCheckInvocation(input.invocation);
	if (
		input.invocation.packSnapshotDigest !== input.snapshot.checkPackDigest ||
		input.invocation.check.checkDigest !== input.check.checkDigest ||
		input.invocation.subject.stage !== input.check.stage
	) {
		throw new Error("Check Result input identities do not match.");
	}
	if (input.output.invocationDigest !== input.invocation.invocationDigest) {
		throw new Error("Check Result Output does not match its Invocation.");
	}
	const execution = normalizeExecutionIdentity(input.execution);
	if (execution.kind !== input.check.definition.implementation.kind) {
		throw new Error("Check Result execution kind does not match Check Definition.");
	}
	if (execution.profile !== input.check.definition.implementation.profile) {
		throw new Error("Check Result execution profile does not match Check Definition.");
	}
	if (
		input.check.definition.implementation.kind === "model" &&
		execution.route !== input.check.definition.implementation.route
	) {
		throw new Error("Check Result model route does not match Check Definition.");
	}
	const passed = checkPassed(
		input.check.definition.measurement,
		input.output.measurement,
	);
	const failure = passed
		? undefined
		: failureFromOutput(input.check, input.output);
	const body = {
		schemaVersion: CHECK_RESULT_SCHEMA_VERSION,
		stage: input.check.stage,
		subjectDigest: input.invocation.subject.digest,
		packSnapshotDigest: input.snapshot.checkPackDigest,
		packId: input.check.packId,
		checkId: input.check.checkId,
		checkVersion: input.check.definition.version,
		checkDigest: input.check.checkDigest,
		invocationDigest: input.invocation.invocationDigest,
		inputDigest: input.invocation.inputDigest,
		evidenceRecordIds: evidenceRecordIds(input.invocation),
		status: passed ? ("passed" as const) : ("failed" as const),
		measurement: input.output.measurement,
		execution,
		...(failure ? {failure} : {}),
	};
	return immutable({...body, resultDigest: canonicalJsonDigest(body)});
}

export function assertValidCheckResult(
	result: CheckResult,
	snapshot?: CheckPackSnapshot,
): void {
	assertTypeboxSchema(CheckResultSchema, result, "Check Result");
	assertExactKeys(
		result,
		[
			"schemaVersion",
			"stage",
			"subjectDigest",
			"packSnapshotDigest",
			"packId",
			"checkId",
			"checkVersion",
			"checkDigest",
			"invocationDigest",
			"inputDigest",
			"evidenceRecordIds",
			"status",
			"measurement",
			"execution",
			"failure",
			"resultDigest",
		],
		"Check Result",
	);
	if (result.schemaVersion !== CHECK_RESULT_SCHEMA_VERSION) {
		throw new Error(`Unsupported Check Result version ${String(result.schemaVersion)}.`);
	}
	for (const [digest, label] of [
		[result.subjectDigest, "subject"],
		[result.packSnapshotDigest, "Pack snapshot"],
		[result.checkDigest, "Check"],
		[result.invocationDigest, "Invocation"],
		[result.inputDigest, "input"],
		[result.resultDigest, "Result"],
	] as const) {
		assertSha256Digest(digest, `Check Result ${label} digest`);
	}
	if (result.status !== "passed" && result.status !== "failed") {
		throw new Error("Completed Check Result status must be passed or failed.");
	}
	if (result.status === "failed" && !result.failure) {
		throw new Error("Failed Check Result requires failure feedback.");
	}
	if (result.status === "passed" && result.failure !== undefined) {
		throw new Error("Passed Check Result cannot contain failure feedback.");
	}
	normalizeExecutionIdentity(result.execution);
	const {resultDigest, ...body} = result;
	if (resultDigest !== canonicalJsonDigest(body)) {
		throw new Error("Check Result digest does not match its content.");
	}
	if (snapshot) assertResultSnapshotBinding(result, snapshot);
}

export function createGateReport(input: CreateGateReportInput): GateReport {
	assertCheckPackSnapshot(input.snapshot);
	assertSha256Digest(input.subjectDigest, "Gate Report subject digest");
	const selected = packagedChecks(input.snapshot);
	const results = [...input.results].sort(compareResults);
	const executions = [...input.executions].sort(compareExecutionFacts);
	assertResultSet(results, input.snapshot, input.subjectDigest);
	assertExecutionFacts(executions, input.snapshot, results);
	const stoppedReason = input.stoppedReason
		? normalizeStopReason(input.stoppedReason)
		: undefined;
	const status = stoppedReason
		? ("stopped" as const)
		: results.some((result) => result.status === "failed")
			? ("failed" as const)
			: ("passed" as const);
	if (status === "passed" && results.length !== selected.length) {
		throw new Error("Passed Gate requires one completed Result per selected Check.");
	}
	const cacheHitCheckIds = normalizedTextList(
		input.cacheHitCheckIds ?? [],
		"Gate Report cache hit Check ids",
	);
	const warnings = normalizedWarnings([
		...(input.warnings ?? []),
		...(stoppedReason ? [] : automaticWarnings(input.snapshot)),
	]);
	const body = {
		schemaVersion: GATE_REPORT_SCHEMA_VERSION,
		reductionVersion: GATE_REPORT_REDUCTION_VERSION,
		stage: input.snapshot.stage,
		subjectDigest: input.subjectDigest,
		packSnapshotDigest: input.snapshot.checkPackDigest,
		status,
		selectedCheckCount: selected.length,
		results,
		executions,
		cacheHitCheckIds,
		warnings,
		...(stoppedReason ? {stoppedReason} : {}),
	};
	return immutable({...body, reportDigest: canonicalJsonDigest(body)});
}

export function assertValidGateReport(
	report: GateReport,
	snapshot: CheckPackSnapshot,
): void {
	assertTypeboxSchema(GateReportSchema, report, "Gate Report");
	assertExactKeys(
		report,
		[
			"schemaVersion",
			"reductionVersion",
			"stage",
			"subjectDigest",
			"packSnapshotDigest",
			"status",
			"selectedCheckCount",
			"results",
			"executions",
			"cacheHitCheckIds",
			"warnings",
			"stoppedReason",
			"reportDigest",
		],
		"Gate Report",
	);
	if (
		report.schemaVersion !== GATE_REPORT_SCHEMA_VERSION ||
		report.reductionVersion !== GATE_REPORT_REDUCTION_VERSION
	) {
		throw new Error("Gate Report protocol identity is unsupported.");
	}
	assertCheckPackSnapshot(snapshot, report.stage);
	if (report.packSnapshotDigest !== snapshot.checkPackDigest) {
		throw new Error("Gate Report Pack snapshot digest does not match.");
	}
	const expected = createGateReport({
		snapshot,
		subjectDigest: report.subjectDigest,
		results: report.results,
		executions: report.executions,
		cacheHitCheckIds: report.cacheHitCheckIds,
		warnings: report.warnings.filter(
			(warning) =>
				report.status === "stopped" ||
				(warning.code !== "no_checks_configured" && warning.code !== "empty_pack"),
		),
		...(report.stoppedReason ? {stoppedReason: report.stoppedReason} : {}),
	});
	if (report.reportDigest !== expected.reportDigest) {
		throw new Error("Gate Report digest does not match its content.");
	}
}

function failureFromOutput(
	check: PackagedCheck,
	output: CheckOutput,
): CheckFailure {
	return immutable({
		code: check.definition.failure.code,
		message: check.definition.failure.message,
		remediation: [...check.definition.failure.remediation],
		summary: output.summary,
		details: [...output.details],
	});
}

function evidenceRecordIds(invocation: CheckInvocation): string[] {
	return normalizedTextList(
		invocation.inputs
			.filter((selection) => selection.selector.source === "evidence")
			.flatMap((selection) => selection.items.map((item) => item.ref)),
		"Check Result Evidence ids",
	);
}

function assertResultSet(
	results: readonly CheckResult[],
	snapshot: CheckPackSnapshot,
	subjectDigest: Sha256Digest,
): void {
	const seen = new Set<string>();
	for (const result of results) {
		assertValidCheckResult(result, snapshot);
		if (result.subjectDigest !== subjectDigest) {
			throw new Error("Gate Result subject does not match Gate Report subject.");
		}
		const id = qualifiedCheckId(result.packId, result.checkId);
		if (seen.has(id)) throw new Error(`Gate Report contains duplicate Result ${id}.`);
		seen.add(id);
	}
}

function assertResultSnapshotBinding(
	result: CheckResult,
	snapshot: CheckPackSnapshot,
): void {
	if (
		result.stage !== snapshot.stage ||
		result.packSnapshotDigest !== snapshot.checkPackDigest
	) {
		throw new Error("Check Result does not belong to Pack snapshot.");
	}
	const check = snapshot.packs
		.find((pack) => pack.id === result.packId)
		?.checks.find((entry) => entry.checkId === result.checkId);
	if (
		!check ||
		check.checkDigest !== result.checkDigest ||
		check.definition.version !== result.checkVersion
	) {
		throw new Error(`Check Result ${result.packId}/${result.checkId} identity is stale.`);
	}
}

function assertExecutionFacts(
	facts: readonly CheckExecutionFact[],
	snapshot: CheckPackSnapshot,
	results: readonly CheckResult[],
): void {
	const selected = new Set(
		packagedChecks(snapshot).map((check) => qualifiedCheckId(check.packId, check.checkId)),
	);
	const resultById = new Map(
		results.map((result) => [qualifiedCheckId(result.packId, result.checkId), result]),
	);
	const seen = new Set<string>();
	for (const fact of facts) {
		const id = qualifiedCheckId(fact.packId, fact.checkId);
		if (!selected.has(id)) throw new Error(`Gate execution fact ${id} is not selected.`);
		if (seen.has(id)) throw new Error(`Gate execution fact ${id} is duplicated.`);
		seen.add(id);
		if (!Number.isSafeInteger(fact.attempts) || fact.attempts < 0 || fact.attempts > 3) {
			throw new Error(`Gate execution fact ${id} attempts are invalid.`);
		}
		if (fact.execution) normalizeExecutionIdentity(fact.execution);
		const result = resultById.get(id);
		if (fact.status === "completed") {
			if (!fact.execution) {
				throw new Error(`Completed Gate execution fact ${id} requires execution identity.`);
			}
			if (!result || fact.resultDigest !== result.resultDigest) {
				throw new Error(`Completed Gate execution fact ${id} requires its Result.`);
			}
			if (fact.stopReason !== undefined) {
				throw new Error(`Completed Gate execution fact ${id} cannot have stop reason.`);
			}
		} else {
			if (fact.resultDigest !== undefined) {
				throw new Error(`Incomplete Gate execution fact ${id} cannot have Result digest.`);
			}
			if (fact.status === "stopped" && !fact.stopReason) {
				throw new Error(`Stopped Gate execution fact ${id} requires stop reason.`);
			}
		}
	}
}

function automaticWarnings(snapshot: CheckPackSnapshot): GateWarning[] {
	const warnings: GateWarning[] = snapshot.packs
		.filter((pack) => pack.checks.length === 0)
		.map((pack) => ({
			code: "empty_pack" as const,
			message: `Check Pack ${pack.id} contains no Checks.`,
			packId: pack.id,
		}));
	if (snapshot.checkCount === 0) {
		const stageName = `${snapshot.stage[0].toUpperCase()}${snapshot.stage.slice(1)}`;
		warnings.push({
			code: "no_checks_configured",
			message: `No ${stageName} Checks are configured. Gate passed without running Checks.`,
		});
	}
	return warnings;
}

function normalizedWarnings(values: readonly GateWarning[]): GateWarning[] {
	const byIdentity = new Map<string, GateWarning>();
	for (const warning of values) {
		if (warning.code !== "no_checks_configured" && warning.code !== "empty_pack") {
			throw new Error(`Gate warning code ${String(warning.code)} is invalid.`);
		}
		if (!warning.message.trim() || warning.message !== warning.message.trim()) {
			throw new Error("Gate warning message must be trimmed non-empty text.");
		}
		const key = `${warning.code}:${warning.packId ?? ""}`;
		byIdentity.set(key, {...warning});
	}
	return [...byIdentity.values()].sort((left, right) =>
		`${left.code}:${left.packId ?? ""}`.localeCompare(`${right.code}:${right.packId ?? ""}`),
	);
}

function normalizeStopReason(reason: GateStopReason): GateStopReason {
	if (!reason.message.trim() || reason.message !== reason.message.trim()) {
		throw new Error("Gate stop reason message must be trimmed non-empty text.");
	}
	return immutable({...reason});
}

function normalizedTextList(values: readonly string[], label: string): string[] {
	const normalized = values.map((value, index) => {
		if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
			throw new Error(`${label}[${index}] must be trimmed non-empty text.`);
		}
		return value;
	});
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${label} must be unique.`);
	}
	return [...normalized].sort();
}

function compareResults(left: CheckResult, right: CheckResult): number {
	return qualifiedCheckId(left.packId, left.checkId).localeCompare(
		qualifiedCheckId(right.packId, right.checkId),
	);
}

function compareExecutionFacts(
	left: CheckExecutionFact,
	right: CheckExecutionFact,
): number {
	return qualifiedCheckId(left.packId, left.checkId).localeCompare(
		qualifiedCheckId(right.packId, right.checkId),
	);
}

function assertExactKeys(
	value: object,
	allowed: readonly string[],
	label: string,
): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const allowedKeys = new Set(allowed);
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string" || !allowedKeys.has(key)) {
			throw new Error(`${label} contains unsupported field ${String(key)}.`);
		}
	}
}

function immutable<T>(value: T): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
