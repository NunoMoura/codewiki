import type {
	CanonicalChangeOperation,
	CanonicalInlineSemanticArtifact,
	OperationId,
} from "../changes/trace/contracts.ts";
import type {
	ChangeWorkState,
	LoopAttemptProjection,
	ProjectWorkState,
} from "../changes/trace/state.ts";
import {
	canonicalJsonDigest,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export const CHECKS_PROJECTION = Object.freeze({
	id: "codewiki.work-state.checks",
	version: "2.0.0",
} as const);

export type CheckProjectionStatus =
	| "pending"
	| "passed"
	| "failed"
	| "stopped"
	| "stale"
	| "historical";

export interface CheckResultProjection {
	readonly checkId: string;
	readonly status: "passed" | "failed" | "historical";
	readonly resultDigest: Sha256Digest;
	readonly evidenceRecordIds: readonly string[];
	readonly failureCode?: string;
	readonly feedbackSummary?: string;
	readonly remediation?: readonly string[];
	readonly operationId: OperationId;
}

export interface GateReportProjection {
	readonly status: "passed" | "failed" | "stopped" | "historical";
	readonly reportDigest: Sha256Digest;
	readonly selectedCheckCount: number | null;
	readonly resultCount: number;
	readonly warningCodes: readonly string[];
	readonly stoppedReasonCode?: string;
	readonly operationId: OperationId;
}

export interface CheckAttemptProjection {
	readonly changeId: string;
	readonly attemptOperationId: OperationId;
	readonly stage: LoopAttemptProjection["loop"];
	readonly status: CheckProjectionStatus;
	readonly subjectId: string | null;
	readonly packSnapshotDigest: Sha256Digest | null;
	readonly results: readonly CheckResultProjection[];
	readonly report: GateReportProjection | null;
	readonly transitionOperationId: OperationId | null;
	readonly stale: boolean;
	readonly operationIds: readonly OperationId[];
}

export interface ProjectChecksProjection {
	readonly protocol: typeof CHECKS_PROJECTION;
	readonly workStateDigest: Sha256Digest;
	readonly attempts: readonly CheckAttemptProjection[];
	readonly totalAttempts: number;
	readonly truncated: boolean;
	readonly projectionDigest: Sha256Digest;
}

export interface ProjectChecksProjectionOptions {
	readonly maximumAttempts?: number;
	readonly maximumResultsPerAttempt?: number;
}

export function projectChecksState(
	state: ProjectWorkState,
	options: ProjectChecksProjectionOptions = {},
): ProjectChecksProjection {
	const maximumAttempts = boundedLimit(
		options.maximumAttempts,
		100,
		1_000,
		"maximumAttempts",
	);
	const maximumResults = boundedLimit(
		options.maximumResultsPerAttempt,
		128,
		512,
		"maximumResultsPerAttempt",
	);
	const allAttempts = state.changes
		.flatMap((change) =>
			change.loopAttempts.map((attempt) =>
				projectAttempt(change, attempt, maximumResults),
			),
		)
		.sort(compareAttempts);
	const attempts = allAttempts.slice(-maximumAttempts);
	const body = {
		protocol: CHECKS_PROJECTION,
		workStateDigest: state.workStateDigest,
		attempts,
		totalAttempts: allAttempts.length,
		truncated: allAttempts.length > attempts.length,
	};
	return Object.freeze({...body, projectionDigest: canonicalJsonDigest(body)});
}

function projectAttempt(
	change: ChangeWorkState,
	attempt: LoopAttemptProjection,
	maximumResults: number,
): CheckAttemptProjection {
	const operationById = new Map(
		change.operations.map((operation) => [operation.operationId, operation]),
	);
	const resultOperations = attempt.checkResultOperationIds
		.map((operationId) => operationById.get(operationId))
		.filter(isOperation)
		.slice(0, maximumResults);
	const results = resultOperations.map(projectResult).sort(compareResults);
	const reportOperation = attempt.exitReportOperationId
		? operationById.get(attempt.exitReportOperationId)
		: undefined;
	const report = reportOperation ? projectReport(reportOperation, results.length) : null;
	const staleOperationIds = new Set(
		change.contradictions
			.filter(
				(contradiction) =>
					contradiction.kind === "check_result" ||
					contradiction.kind === "runtime_route",
			)
			.flatMap((contradiction) => contradiction.operationIds),
	);
	const attemptOperationIds = [
		attempt.operationId,
		...attempt.candidateOperationIds,
		...(attempt.exitPolicyOperationId ? [attempt.exitPolicyOperationId] : []),
		...attempt.evidenceOperationIds,
		...attempt.checkResultOperationIds,
		...(attempt.exitReportOperationId ? [attempt.exitReportOperationId] : []),
		...(attempt.routeOperationId ? [attempt.routeOperationId] : []),
		...(attempt.terminalOperationId ? [attempt.terminalOperationId] : []),
	];
	const stale = attemptOperationIds.some((operationId) =>
		staleOperationIds.has(operationId),
	);
	const packSnapshotDigest = attempt.exitPolicyOperationId
		? projectedPackSnapshotDigest(operationById.get(attempt.exitPolicyOperationId))
		: null;
	return Object.freeze({
		changeId: change.changeId,
		attemptOperationId: attempt.operationId,
		stage: attempt.loop,
		status: attemptStatus({attempt, report, stale}),
		subjectId: attempt.currentCandidateId,
		packSnapshotDigest,
		results: Object.freeze(results),
		report,
		transitionOperationId: attempt.routeOperationId,
		stale,
		operationIds: Object.freeze([...new Set(attemptOperationIds)]),
	});
}

function projectResult(
	operation: CanonicalChangeOperation,
): CheckResultProjection {
	const payload = operation.body.payload as Record<string, unknown>;
	const inline = inlineArtifact(payload.result, "Check Result");
	const artifact = artifactRecord(inline);
	const active =
		artifact.schemaVersion === "1.0.0" &&
		(artifact.status === "passed" || artifact.status === "failed") &&
		typeof artifact.resultDigest === "string";
	const failed = active && artifact.status === "failed";
	const failure = record(artifact.failure);
	return Object.freeze({
		checkId: requiredText(payload.checkId, "Check Result checkId"),
		status: active
			? (artifact.status as "passed" | "failed")
			: "historical",
		resultDigest: requiredDigest(
			active ? artifact.resultDigest : inline.digest,
			"Check Result digest",
		),
		evidenceRecordIds: Object.freeze(textList(payload.evidenceRecordIds)),
		...(failed
			? {
					failureCode: requiredText(failure.code, "Check Result failure code"),
					feedbackSummary: requiredText(
						failure.summary,
						"Check Result feedback summary",
					),
					remediation: Object.freeze(textList(failure.remediation)),
				}
			: {}),
		operationId: operation.operationId,
	});
}

function projectReport(
	operation: CanonicalChangeOperation,
	resultCount: number,
): GateReportProjection {
	const payload = operation.body.payload as Record<string, unknown>;
	const inline = inlineArtifact(payload.report, "Gate Report");
	const artifact = artifactRecord(inline);
	const active =
		artifact.schemaVersion === "1.0.0" &&
		(artifact.status === "passed" ||
			artifact.status === "failed" ||
			artifact.status === "stopped") &&
		typeof artifact.reportDigest === "string";
	const stoppedReason = record(artifact.stoppedReason);
	return Object.freeze({
		status: active
			? (artifact.status as "passed" | "failed" | "stopped")
			: "historical",
		reportDigest: requiredDigest(
			active ? artifact.reportDigest : inline.digest,
			"Gate Report digest",
		),
		selectedCheckCount:
			active && Number.isSafeInteger(artifact.selectedCheckCount)
				? Number(artifact.selectedCheckCount)
				: null,
		resultCount,
		warningCodes: Object.freeze(
			Array.isArray(artifact.warnings)
				? artifact.warnings.flatMap((warning) => {
						const value = record(warning);
						return typeof value.code === "string" ? [value.code] : [];
					})
				: [],
		),
		...(active && typeof stoppedReason.code === "string"
			? {stoppedReasonCode: stoppedReason.code}
			: {}),
		operationId: operation.operationId,
	});
}

function projectedPackSnapshotDigest(
	operation: CanonicalChangeOperation | undefined,
): Sha256Digest | null {
	if (!operation) return null;
	const payload = operation.body.payload as Record<string, unknown>;
	const inline = inlineArtifact(payload.policy, "Check Pack snapshot");
	const artifact = artifactRecord(inline);
	return artifact.schemaVersion === "2.0.0" &&
		typeof artifact.checkPackDigest === "string"
		? requiredDigest(artifact.checkPackDigest, "Check Pack snapshot digest")
		: null;
}

function attemptStatus(input: {
	readonly attempt: LoopAttemptProjection;
	readonly report: GateReportProjection | null;
	readonly stale: boolean;
}): CheckProjectionStatus {
	if (input.stale) return "stale";
	if (!input.report) return input.attempt.status === "active" ? "pending" : "historical";
	return input.report.status;
}

function inlineArtifact(
	value: unknown,
	label: string,
): CanonicalInlineSemanticArtifact {
	const artifact = record(value);
	if (
		typeof artifact.id !== "string" ||
		typeof artifact.digest !== "string" ||
		typeof artifact.schemaVersion !== "string" ||
		!("artifact" in artifact)
	) {
		throw new Error(`${label} inline artifact is invalid.`);
	}
	return artifact as unknown as CanonicalInlineSemanticArtifact;
}

function artifactRecord(
	inline: CanonicalInlineSemanticArtifact,
): Record<string, unknown> {
	return record(inline.artifact);
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function requiredText(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${label} must be non-empty text.`);
	}
	return value;
}

function requiredDigest(value: unknown, label: string): Sha256Digest {
	if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
		throw new Error(`${label} must be a SHA-256 digest.`);
	}
	return value as Sha256Digest;
}

function textList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string").sort()
		: [];
}

function isOperation(
	value: CanonicalChangeOperation | undefined,
): value is CanonicalChangeOperation {
	return value !== undefined;
}

function boundedLimit(
	value: number | undefined,
	fallback: number,
	maximum: number,
	label: string,
): number {
	const result = value ?? fallback;
	if (!Number.isSafeInteger(result) || result < 1 || result > maximum) {
		throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
	}
	return result;
}

function compareAttempts(
	left: CheckAttemptProjection,
	right: CheckAttemptProjection,
): number {
	return left.attemptOperationId.localeCompare(right.attemptOperationId);
}

function compareResults(
	left: CheckResultProjection,
	right: CheckResultProjection,
): number {
	return left.checkId.localeCompare(right.checkId);
}
