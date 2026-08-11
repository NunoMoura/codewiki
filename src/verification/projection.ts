import type {
	CanonicalChangeOperation,
	CanonicalInlineSemanticArtifact,
	OperationId,
} from "../change-trace/contracts.ts";
import {
	materializeProjectWorkState,
	type ChangeWorkState,
	type LoopAttemptProjection,
	type ProjectWorkState,
} from "../change-trace/state.ts";
import {
	assertSha256Digest,
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type CanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {
	assertValidResolvedExitPolicy,
	type CheckEnforcement,
	type CheckResult,
	type ExitReport,
	type ResolvedExitPolicy,
} from "./contracts.ts";
import {
	assertValidCheckResult,
	assertValidExitReport,
} from "./results.ts";

export const VERIFICATION_PROJECTION = Object.freeze({
	id: "codewiki.verification-projection",
	version: "1.0.0",
} as const);

export type VerificationProjectionStatus =
	| "unresolved"
	| "pending"
	| "pass"
	| "fail"
	| "indeterminate"
	| "excluded"
	| "stale";

export interface VerificationCheckProjection {
	readonly checkId: string;
	readonly checkVersion: string;
	readonly enforcement: CheckEnforcement | null;
	readonly required: boolean;
	readonly status: VerificationProjectionStatus;
	readonly resultDigest: Sha256Digest | null;
	readonly resultOperationId: OperationId | null;
	readonly exclusionReason: string | null;
}

export interface VerificationPolicyProjection {
	readonly policyId: string;
	readonly operationId: OperationId;
	readonly candidateDigest: Sha256Digest;
	readonly catalogDigest: Sha256Digest;
	readonly selectorInputDigest: Sha256Digest;
	readonly configurationDigest: Sha256Digest;
	readonly policyDigest: Sha256Digest;
}

export interface VerificationReportProjection {
	readonly reportId: string;
	readonly operationId: OperationId;
	readonly status: "pass" | "fail" | "indeterminate";
	readonly requiredCheckCount: number;
	readonly advisoryCheckCount: number;
	readonly observedCheckCount: number;
	readonly excludedCheckCount: number;
	readonly blockingCheckCount: number;
	readonly blockingCheckIds: readonly string[];
	readonly blockingCheckIdsTruncated: boolean;
	readonly reportDigest: Sha256Digest;
}

export interface CandidateVerificationProjection {
	readonly changeId: string;
	readonly changeRevisionId: Sha256Digest;
	readonly loop: LoopAttemptProjection["loop"];
	readonly attemptOperationId: OperationId;
	readonly attemptStatus: LoopAttemptProjection["status"];
	readonly candidateId: string | null;
	readonly candidateDigest: Sha256Digest | null;
	readonly candidateOperationId: OperationId | null;
	readonly policy: VerificationPolicyProjection | null;
	readonly checks: readonly VerificationCheckProjection[];
	readonly report: VerificationReportProjection | null;
	readonly routeDigest: Sha256Digest | null;
	readonly routeOperationId: OperationId | null;
	readonly status: VerificationProjectionStatus;
	readonly operationIds: readonly OperationId[];
}

export interface VerificationProjectionCoverage {
	readonly totalAttempts: number;
	readonly projectedAttempts: number;
	readonly omittedAttempts: number;
	readonly totalChecksInProjectedAttempts: number;
	readonly projectedChecks: number;
	readonly omittedChecks: number;
	readonly truncated: boolean;
}

export interface ProjectVerificationProjection {
	readonly projector: typeof VERIFICATION_PROJECTION;
	readonly workStateDigest: Sha256Digest;
	readonly stateHead: string | null;
	readonly attempts: readonly CandidateVerificationProjection[];
	readonly coverage: VerificationProjectionCoverage;
	readonly snapshotDigest: Sha256Digest;
}

export interface ProjectVerificationProjectionOptions {
	readonly maxAttempts?: number;
	readonly maxChecksPerAttempt?: number;
}

interface AttemptContext {
	readonly change: ChangeWorkState;
	readonly attempt: LoopAttemptProjection;
	readonly operations: ReadonlyMap<OperationId, CanonicalChangeOperation>;
}

interface CandidateBinding {
	readonly id: string;
	readonly digest: Sha256Digest;
	readonly operationId: OperationId;
}

interface PolicyBinding {
	readonly policy: ResolvedExitPolicy;
	readonly projection: VerificationPolicyProjection;
}

interface PersistedResult {
	readonly result: CheckResult;
	readonly inlineId: string;
	readonly operationId: OperationId;
}

interface ProjectedAttempt {
	readonly projection: CandidateVerificationProjection;
	readonly totalChecks: number;
}

const DEFAULT_MAX_VERIFICATION_ATTEMPTS = 100;
const MAX_VERIFICATION_ATTEMPTS = 1_000;
const DEFAULT_MAX_CHECKS_PER_ATTEMPT = 256;
const MAX_CHECKS_PER_ATTEMPT = 1_024;

export function projectVerificationState(
	state: ProjectWorkState,
	options: ProjectVerificationProjectionOptions = {},
): ProjectVerificationProjection {
	assertSha256Digest(state.workStateDigest, "Verification WorkState digest");
	const {workStateDigest, ...workStateBody} = state;
	const expectedWorkStateDigest = materializeProjectWorkState(
		workStateBody,
	).workStateDigest;
	if (workStateDigest !== expectedWorkStateDigest) {
		throw new Error(
			`Verification WorkState digest mismatch: expected ${expectedWorkStateDigest}.`,
		);
	}
	const maxAttempts = boundedProjectionLimit(
		options.maxAttempts,
		DEFAULT_MAX_VERIFICATION_ATTEMPTS,
		MAX_VERIFICATION_ATTEMPTS,
		"maxAttempts",
	);
	const maxChecks = boundedProjectionLimit(
		options.maxChecksPerAttempt,
		DEFAULT_MAX_CHECKS_PER_ATTEMPT,
		MAX_CHECKS_PER_ATTEMPT,
		"maxChecksPerAttempt",
	);
	const allAttempts = attemptContexts(state);
	const selectedAttempts = allAttempts.slice(
		Math.max(0, allAttempts.length - maxAttempts),
	);
	const projected = selectedAttempts.map((context) =>
		projectAttempt(context, maxChecks),
	);
	const totalChecks = projected.reduce(
		(total, attempt) => total + attempt.totalChecks,
		0,
	);
	const projectedChecks = projected.reduce(
		(total, attempt) => total + attempt.projection.checks.length,
		0,
	);
	const coverage: VerificationProjectionCoverage = {
		totalAttempts: allAttempts.length,
		projectedAttempts: projected.length,
		omittedAttempts: allAttempts.length - projected.length,
		totalChecksInProjectedAttempts: totalChecks,
		projectedChecks,
		omittedChecks: totalChecks - projectedChecks,
		truncated:
			allAttempts.length !== projected.length || totalChecks !== projectedChecks,
	};
	const body = {
		projector: VERIFICATION_PROJECTION,
		workStateDigest: state.workStateDigest,
		stateHead: state.stateHead,
		attempts: projected.map((entry) => entry.projection),
		coverage,
	};
	return toCanonicalJsonValue({
		...body,
		snapshotDigest: canonicalJsonDigest(body),
	}) as unknown as ProjectVerificationProjection;
}

function attemptContexts(state: ProjectWorkState): AttemptContext[] {
	const contexts = state.changes.flatMap((change) => {
		const operations = new Map(
			change.operations.map((operation) => [operation.operationId, operation]),
		);
		return change.loopAttempts.map((attempt) => ({change, attempt, operations}));
	});
	return contexts.sort((left, right) => {
		const leftOperation = requiredOperation(left, left.attempt.operationId);
		const rightOperation = requiredOperation(right, right.attempt.operationId);
		return (
			compareText(leftOperation.body.recordedAt, rightOperation.body.recordedAt) ||
			compareText(left.attempt.operationId, right.attempt.operationId)
		);
	});
}

function projectAttempt(
	context: AttemptContext,
	maxChecks: number,
): ProjectedAttempt {
	const candidate = currentCandidate(context);
	const stale = attemptIsStale(context);
	const policyBinding = persistedPolicy(context, candidate);
	const persisted = policyBinding
		? persistedResults(context, policyBinding.policy, candidate)
		: {byCheck: new Map<string, PersistedResult>(), conflictedCheckIds: new Set<string>()};
	const report = policyBinding
		? persistedReport(
				context,
				policyBinding,
				candidate,
				persisted.byCheck,
				maxChecks,
			)
		: null;
	const routeDigest = persistedRouteDigest(context, report);
	const allChecks = policyBinding
		? projectChecks(
				policyBinding.policy,
				persisted.byCheck,
				persisted.conflictedCheckIds,
				stale,
			)
		: [];
	const checks = allChecks.slice(0, maxChecks);
	const status = attemptProjectionStatus({
		attempt: context.attempt,
		candidate,
		policy: policyBinding?.policy ?? null,
		report: report?.report ?? null,
		conflicted: persisted.conflictedCheckIds.size > 0,
		stale,
	});
	return {
		totalChecks: allChecks.length,
		projection: {
			changeId: context.change.changeId,
			changeRevisionId: context.attempt.changeRevisionId,
			loop: context.attempt.loop,
			attemptOperationId: context.attempt.operationId,
			attemptStatus: context.attempt.status,
			candidateId: candidate?.id ?? null,
			candidateDigest: candidate?.digest ?? null,
			candidateOperationId: candidate?.operationId ?? null,
			policy: policyBinding?.projection ?? null,
			checks,
			report: report?.projection ?? null,
			routeDigest,
			routeOperationId: context.attempt.routeOperationId,
			status,
			operationIds: projectionOperationIds({
				attempt: context.attempt,
				candidate,
				policy: policyBinding?.projection ?? null,
				checks,
				report: report?.projection ?? null,
			}),
		},
	};
}

function currentCandidate(context: AttemptContext): CandidateBinding | null {
	if (!context.attempt.currentCandidateId) return null;
	for (const operationId of [...context.attempt.candidateOperationIds].reverse()) {
		const operation = requiredOperation(context, operationId);
		if (!operation.body.kind.endsWith(".candidate_recorded")) continue;
		const inline = inlineArtifact(operation, "candidate");
		if (inline.id !== context.attempt.currentCandidateId) continue;
		const artifact = artifactRecord(inline, "Candidate");
		assertArtifactSchema(inline, artifact, "Candidate");
		const id = requiredText(artifact.id, "Candidate id");
		const digest = requiredDigest(artifact.digest, "Candidate digest");
		if (id !== inline.id) {
			throw new Error("Persisted Candidate identity does not match its binding.");
		}
		return {id, digest, operationId};
	}
	throw new Error(
		`Current Candidate ${context.attempt.currentCandidateId} has no persisted operation.`,
	);
}

function persistedPolicy(
	context: AttemptContext,
	candidate: CandidateBinding | null,
): PolicyBinding | null {
	const operationId = context.attempt.exitPolicyOperationId;
	if (!operationId) return null;
	if (!candidate) throw new Error("Persisted Exit Policy requires a Candidate.");
	const operation = requiredOperation(context, operationId, "loop.exit_policy_recorded");
	const payload = operationPayload(operation);
	if (requiredText(payload.candidateId, "Exit Policy candidateId") !== candidate.id) {
		throw new Error("Persisted Exit Policy references another Candidate.");
	}
	const inline = inlineArtifact(operation, "policy");
	const policyArtifact = artifactRecord(inline, "Resolved Exit Policy");
	assertArtifactSchema(inline, policyArtifact, "Resolved Exit Policy");
	const policy = policyArtifact as unknown as ResolvedExitPolicy;
	assertValidResolvedExitPolicy(policy);
	if (
		policy.loop !== context.attempt.loop ||
		policy.candidateDigest !== candidate.digest
	) {
		throw new Error("Persisted Exit Policy does not match its Loop Candidate.");
	}
	return {
		policy,
		projection: {
			policyId: inline.id,
			operationId,
			candidateDigest: requiredDigest(policy.candidateDigest, "policy candidateDigest"),
			catalogDigest: requiredDigest(policy.catalogDigest, "policy catalogDigest"),
			selectorInputDigest: requiredDigest(
				policy.selectorInputDigest,
				"policy selectorInputDigest",
			),
			configurationDigest: operation.body.baseSnapshot.configDigest,
			policyDigest: requiredDigest(policy.policyDigest, "policy policyDigest"),
		},
	};
}

function persistedResults(
	context: AttemptContext,
	policy: ResolvedExitPolicy,
	candidate: CandidateBinding | null,
): {
	readonly byCheck: Map<string, PersistedResult>;
	readonly conflictedCheckIds: Set<string>;
} {
	if (!candidate) throw new Error("Persisted Check Results require a Candidate.");
	const byCheck = new Map<string, PersistedResult>();
	const conflictedCheckIds = new Set<string>();
	for (const operationId of context.attempt.checkResultOperationIds) {
		const operation = requiredOperation(context, operationId, "check.result_recorded");
		const payload = operationPayload(operation);
		if (requiredText(payload.candidateId, "Check Result candidateId") !== candidate.id) {
			throw new Error("Persisted Check Result references another Candidate.");
		}
		const inline = inlineArtifact(operation, "result");
		const resultArtifact = artifactRecord(inline, "Check Result");
		assertArtifactSchema(inline, resultArtifact, "Check Result");
		const result = resultArtifact as unknown as CheckResult;
		assertValidCheckResult(result, policy);
		assertResultPayload(payload, result);
		const current = byCheck.get(result.checkId);
		if (current && current.result.resultDigest !== result.resultDigest) {
			conflictedCheckIds.add(result.checkId);
		}
		byCheck.set(result.checkId, {result, inlineId: inline.id, operationId});
	}
	return {byCheck, conflictedCheckIds};
}

function persistedReport(
	context: AttemptContext,
	policyBinding: PolicyBinding,
	candidate: CandidateBinding | null,
	results: ReadonlyMap<string, PersistedResult>,
	maxChecks: number,
): {
	readonly report: ExitReport;
	readonly inlineId: string;
	readonly projection: VerificationReportProjection;
} | null {
	const operationId = context.attempt.exitReportOperationId;
	if (!operationId) return null;
	if (!candidate) throw new Error("Persisted Exit Report requires a Candidate.");
	const operation = requiredOperation(context, operationId, "loop.exit_report_recorded");
	const payload = operationPayload(operation);
	if (requiredText(payload.candidateId, "Exit Report candidateId") !== candidate.id) {
		throw new Error("Persisted Exit Report references another Candidate.");
	}
	const inline = inlineArtifact(operation, "report");
	const reportArtifact = artifactRecord(inline, "Exit Report");
	assertArtifactSchema(inline, reportArtifact, "Exit Report");
	const report = reportArtifact as unknown as ExitReport;
	assertValidExitReport(report, policyBinding.policy);
	assertReportPayload(payload, report, results);
	return {
		report,
		inlineId: inline.id,
		projection: {
			reportId: inline.id,
			operationId,
			status: report.status,
			requiredCheckCount: report.outcomes.required.length,
			advisoryCheckCount: report.outcomes.advisory.length,
			observedCheckCount: report.outcomes.observed.length,
			excludedCheckCount: report.outcomes.excluded.length,
			blockingCheckCount: report.blockingCheckIds.length,
			blockingCheckIds: report.blockingCheckIds.slice(0, maxChecks),
			blockingCheckIdsTruncated: report.blockingCheckIds.length > maxChecks,
			reportDigest: requiredDigest(report.reportDigest, "report reportDigest"),
		},
	};
}

function persistedRouteDigest(
	context: AttemptContext,
	report: {readonly inlineId: string} | null,
): Sha256Digest | null {
	const operationId = context.attempt.routeOperationId;
	if (!operationId) return null;
	if (!report) throw new Error("Persisted Runtime Route requires an Exit Report.");
	const operation = requiredOperation(context, operationId, "runtime.route_recorded");
	const payload = operationPayload(operation);
	if (requiredText(payload.exitReportId, "Runtime Route exitReportId") !== report.inlineId) {
		throw new Error("Persisted Runtime Route references another Exit Report.");
	}
	const inline = inlineArtifact(operation, "runtimeRoute");
	const route = artifactRecord(inline, "Runtime Route");
	assertArtifactSchema(inline, route, "Runtime Route");
	return requiredDigest(route.routeDigest, "Runtime Route digest");
}

function projectChecks(
	policy: ResolvedExitPolicy,
	results: ReadonlyMap<string, PersistedResult>,
	conflictedCheckIds: ReadonlySet<string>,
	stale: boolean,
): VerificationCheckProjection[] {
	const selected = policy.bindings.map((binding) => {
		const persisted = results.get(binding.checkId);
		return {
			checkId: binding.checkId,
			checkVersion: binding.checkVersion,
			enforcement: binding.enforcement,
			required: binding.required,
			status: selectedCheckStatus(stale, persisted, conflictedCheckIds),
			resultDigest: persisted
				? requiredDigest(persisted.result.resultDigest, "Check Result digest")
				: null,
			resultOperationId: persisted?.operationId ?? null,
			exclusionReason: null,
		} satisfies VerificationCheckProjection;
	});
	const excluded = policy.exclusions.map(
		(exclusion): VerificationCheckProjection => ({
			checkId: exclusion.checkId,
			checkVersion: exclusion.checkVersion,
			enforcement: null,
			required: false,
			status: "excluded",
			resultDigest: null,
			resultOperationId: null,
			exclusionReason: exclusion.reason,
		}),
	);
	return [...selected, ...excluded].sort((left, right) =>
		compareText(left.checkId, right.checkId),
	);
}

function selectedCheckStatus(
	stale: boolean,
	persisted: PersistedResult | undefined,
	conflictedCheckIds: ReadonlySet<string>,
): VerificationProjectionStatus {
	if (stale) return "stale";
	if (!persisted) return "pending";
	if (conflictedCheckIds.has(persisted.result.checkId)) return "indeterminate";
	return persisted.result.status;
}

function attemptProjectionStatus(input: {
	readonly attempt: LoopAttemptProjection;
	readonly candidate: CandidateBinding | null;
	readonly policy: ResolvedExitPolicy | null;
	readonly report: ExitReport | null;
	readonly conflicted: boolean;
	readonly stale: boolean;
}): VerificationProjectionStatus {
	if (input.stale) return "stale";
	if (!input.candidate || !input.policy) return "unresolved";
	if (input.conflicted) return "indeterminate";
	if (input.report) return input.report.status;
	if (
		input.attempt.status === "failed" ||
		input.attempt.status === "indeterminate" ||
		input.attempt.status === "cancelled"
	) {
		return "indeterminate";
	}
	return "pending";
}

function attemptIsStale(context: AttemptContext): boolean {
	return (
		context.attempt.status === "stale" ||
		(context.change.currentRevision !== null &&
			context.change.currentRevision.revisionId !==
				context.attempt.changeRevisionId)
	);
}

function assertResultPayload(
	payload: Record<string, unknown>,
	result: CheckResult,
): void {
	const expectedStatus =
		result.status === "pass"
			? "passed"
			: result.status === "fail"
				? "failed"
				: "indeterminate";
	if (
		payload.checkId !== result.checkId ||
		payload.checkVersion !== result.checkVersion ||
		payload.status !== expectedStatus ||
		payload.evidenceInputDigest !== result.evidenceInputDigest ||
		!sameTextSet(payload.evidenceRecordIds, result.evidenceRecordIds)
	) {
		throw new Error("Persisted Check Result payload does not match its artifact.");
	}
}

function assertReportPayload(
	payload: Record<string, unknown>,
	report: ExitReport,
	results: ReadonlyMap<string, PersistedResult>,
): void {
	const expectedStatus =
		report.status === "pass"
			? "passed"
			: report.status === "fail"
				? "failed"
				: "indeterminate";
	const persistedIds = report.checkResults.map((result) => {
		const persisted = results.get(result.checkId);
		if (!persisted || persisted.result.resultDigest !== result.resultDigest) {
			throw new Error("Persisted Exit Report does not match recorded Check Results.");
		}
		return persisted.inlineId;
	});
	if (
		payload.status !== expectedStatus ||
		!sameTextSet(payload.resultIds, persistedIds) ||
		results.size !== report.checkResults.length
	) {
		throw new Error("Persisted Exit Report payload does not match its artifact.");
	}
}

function inlineArtifact(
	operation: CanonicalChangeOperation,
	field: string,
): CanonicalInlineSemanticArtifact {
	const value = operationPayload(operation)[field];
	if (!isRecord(value)) {
		throw new Error(`${operation.body.kind} ${field} must be an inline artifact.`);
	}
	const inline = value as unknown as CanonicalInlineSemanticArtifact;
	requiredText(inline.id, `${operation.body.kind} ${field} id`);
	requiredText(
		inline.schemaVersion,
		`${operation.body.kind} ${field} schemaVersion`,
	);
	requiredDigest(inline.digest, `${operation.body.kind} ${field} digest`);
	if (canonicalJsonDigest(inline.artifact) !== inline.digest) {
		throw new Error(`${operation.body.kind} ${field} content digest mismatch.`);
	}
	return inline;
}

function artifactRecord(
	inline: CanonicalInlineSemanticArtifact,
	label: string,
): Record<string, CanonicalJsonValue> {
	if (!isRecord(inline.artifact)) {
		throw new Error(`${label} artifact must be an object.`);
	}
	return inline.artifact as Record<string, CanonicalJsonValue>;
}

function assertArtifactSchema(
	inline: CanonicalInlineSemanticArtifact,
	artifact: Record<string, CanonicalJsonValue>,
	label: string,
): void {
	if (String(artifact.schemaVersion) !== inline.schemaVersion) {
		throw new Error(`${label} schema version does not match its binding.`);
	}
}

function requiredOperation(
	context: AttemptContext,
	operationId: OperationId,
	kind?: CanonicalChangeOperation["body"]["kind"],
): CanonicalChangeOperation {
	const operation = context.operations.get(operationId);
	if (!operation) throw new Error(`Verification operation ${operationId} is missing.`);
	if (kind && operation.body.kind !== kind) {
		throw new Error(`Verification operation ${operationId} must be ${kind}.`);
	}
	return operation;
}

function operationPayload(
	operation: CanonicalChangeOperation,
): Record<string, unknown> {
	return operation.body.payload as unknown as Record<string, unknown>;
}

function projectionOperationIds(input: {
	readonly attempt: LoopAttemptProjection;
	readonly candidate: CandidateBinding | null;
	readonly policy: VerificationPolicyProjection | null;
	readonly checks: readonly VerificationCheckProjection[];
	readonly report: VerificationReportProjection | null;
}): OperationId[] {
	return [
		input.attempt.operationId,
		...(input.candidate ? [input.candidate.operationId] : []),
		...(input.policy ? [input.policy.operationId] : []),
		...input.checks.flatMap((check) =>
			check.resultOperationId ? [check.resultOperationId] : [],
		),
		...(input.report ? [input.report.operationId] : []),
		...(input.attempt.routeOperationId ? [input.attempt.routeOperationId] : []),
		...(input.attempt.terminalOperationId
			? [input.attempt.terminalOperationId]
			: []),
	];
}

function sameTextSet(value: unknown, expected: readonly string[]): boolean {
	if (
		!Array.isArray(value) ||
		!value.every((entry) => typeof entry === "string") ||
		value.length !== expected.length
	) {
		return false;
	}
	const actual = [...value].sort(compareText);
	const wanted = [...expected].sort(compareText);
	return actual.every((entry, index) => entry === wanted[index]);
}

function requiredText(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${label} must be non-empty text.`);
	}
	return value;
}

function requiredDigest(value: unknown, label: string): Sha256Digest {
	assertSha256Digest(value, label);
	return value as Sha256Digest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedProjectionLimit(
	value: number | undefined,
	fallback: number,
	maximum: number,
	label: string,
): number {
	const resolved = value ?? fallback;
	if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) {
		throw new Error(`${label} must be an integer from 1 through ${maximum}.`);
	}
	return resolved;
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
