import type {
	AuthorityBinding,
	BaseSnapshot,
	CanonicalChangeOperation,
	CanonicalInlineSemanticArtifact,
	ChangeOperationKind,
	OperationId,
} from "../change-trace/contracts.ts";
import {createNextChangeOperation} from "../change-trace/builder.ts";
import {reduceChangeOperation} from "../change-trace/reduce-operation.ts";
import type {GitCommandRunner} from "../change-trace/git-command.ts";
import type {ReplayAdmissionPolicy} from "../change-trace/reducer.ts";
import {
	changeById,
	type ChangeWorkState,
	type ProjectWorkState,
} from "../change-trace/state.ts";
import {
	createCurrentGitSynchronizer,
	pushSynchronizedStateBatch,
	type ProjectAuthoritySnapshot,
	type SynchronizationObservation,
} from "../change-trace/synchronization.ts";
import type {EvidenceRecord} from "../evidence/contracts.ts";
import {assertValidEvidenceRecord} from "../evidence/materialize.ts";
import {
	assertValidResolvedExitPolicy,
	type CheckResult,
	type ExitReport,
	type ResolvedExitPolicy,
} from "../loop-exit/contracts.ts";
import {assertValidExitReport} from "../loop-exit/results.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {
	createDecisionCandidate,
	type DecisionCandidate,
} from "../decision/exit/candidate.ts";
import type {DecisionRuntimeRoute} from "../decision/exit/runtime.ts";

export interface CreateNativeDecisionOperationsInput {
	readonly state: ProjectWorkState;
	readonly changeId: string;
	readonly attemptOperationId: OperationId;
	readonly baseSnapshot: BaseSnapshot;
	readonly authorityBinding: AuthorityBinding;
	readonly recordedAt: string;
	readonly candidate: DecisionCandidate;
	readonly policy: ResolvedExitPolicy;
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly report: ExitReport;
	readonly route: DecisionRuntimeRoute;
}

export interface NativeDecisionOperationSequence {
	readonly operations: readonly CanonicalChangeOperation[];
	readonly state: ChangeWorkState;
	readonly attemptOperationId: Sha256Digest;
	readonly candidateId: string;
	readonly policyId: string;
	readonly exitReportId: string;
	readonly routeOperationId: Sha256Digest;
}

export function createNativeDecisionOperationSequence(
	input: CreateNativeDecisionOperationsInput,
): NativeDecisionOperationSequence {
	const {attempt, change} = assertInput(input);
	const candidateBinding = inlineSemanticArtifact(
		input.candidate.id,
		input.candidate.schemaVersion,
		input.candidate,
	);
	const policyBinding = inlineSemanticArtifact(
		idFromDigest("exit-policy:decision", input.policy.policyDigest),
		String(input.policy.schemaVersion),
		input.policy,
	);
	const resultBindings = new Map(
		input.report.checkResults.map((result) => [
			result.checkId,
			inlineSemanticArtifact(
				idFromDigest(`check-result:decision:${result.checkId}`, result.resultDigest),
				String(result.schemaVersion),
				result,
			),
		]),
	);
	const reportBinding = inlineSemanticArtifact(
		idFromDigest("exit-report:decision", input.report.reportDigest),
		String(input.report.schemaVersion),
		input.report,
	);
	const runtimeRouteBinding = inlineSemanticArtifact(
		idFromDigest("runtime-route:decision", input.route.routeDigest),
		input.route.schemaVersion,
		input.route,
	);
	let projected = change;
	const operations: CanonicalChangeOperation[] = [];
	const append = <K extends ChangeOperationKind>(
		...values: [
			K,
			Parameters<typeof createNextChangeOperation<K>>[1]["payload"],
		]
	): CanonicalChangeOperation<K> => {
		const [kind, payload] = values;
		const operation = createNextChangeOperation(projected, {
			changeId: projected.changeId,
			kind,
			baseSnapshot: input.baseSnapshot,
			authorityBinding: input.authorityBinding,
			recordedAt: operationTimestamp(input.recordedAt, operations.length),
			payload,
		});
		projected = reduceChangeOperation(projected, operation, {planningEpochs: []});
		operations.push(operation);
		return operation;
	};
	append("decision.candidate_recorded", {
		attemptOperationId: attempt.operationId,
		candidate: candidateBinding,
		observedBaseDigest: canonicalJsonDigest(input.candidate.observedBase),
	});
	append("loop.exit_policy_recorded", {
		attemptOperationId: attempt.operationId,
		candidateId: candidateBinding.id,
		policy: policyBinding,
	});
	for (const evidence of sortedEvidence(input.evidenceRecords)) {
		append("evidence.recorded", {
			attemptOperationId: attempt.operationId,
			candidateId: candidateBinding.id,
			evidence: inlineSemanticArtifact(
				evidence.evidenceId,
				evidence.schemaVersion,
				evidence,
			),
			evidenceKind: evidence.kind,
			authority: evidence.authority,
			coverage: evidence.coverage,
		});
	}
	for (const result of sortedResults(input.report.checkResults)) {
		const binding = requiredResultBinding(resultBindings, result.checkId);
		append("check.result_recorded", {
			attemptOperationId: attempt.operationId,
			candidateId: candidateBinding.id,
			result: binding,
			checkId: result.checkId,
			checkVersion: result.checkVersion,
			status: operationResultStatus(result.status),
			evidenceRecordIds: [...result.evidenceRecordIds],
			evidenceInputDigest: result.evidenceInputDigest as Sha256Digest,
		});
	}
	append("loop.exit_report_recorded", {
		attemptOperationId: attempt.operationId,
		candidateId: candidateBinding.id,
		report: reportBinding,
		status: operationReportStatus(input.report.status),
		resultIds: sortedResults(input.report.checkResults).map(
			(result) => requiredResultBinding(resultBindings, result.checkId).id,
		),
	});
	const routeOperation = append("runtime.route_recorded", {
		attemptOperationId: attempt.operationId,
		exitReportId: reportBinding.id,
		route: input.route.route,
		reasonCode: input.route.reasonCode,
		runtimeRoute: runtimeRouteBinding,
		targetChangeId: input.changeId,
	});
	append("loop.attempt_ended", {
		attemptOperationId: attempt.operationId,
		status: operationReportStatus(input.report.status),
		exitReportId: reportBinding.id,
		routeOperationId: routeOperation.operationId,
	});
	return toCanonicalJsonValue({
		operations,
		state: projected,
		attemptOperationId: attempt.operationId,
		candidateId: candidateBinding.id,
		policyId: policyBinding.id,
		exitReportId: reportBinding.id,
		routeOperationId: routeOperation.operationId,
	}) as unknown as NativeDecisionOperationSequence;
}

function assertInput(input: CreateNativeDecisionOperationsInput): {
	readonly attempt: ChangeWorkState["loopAttempts"][number];
	readonly change: ChangeWorkState;
} {
	const change = changeById(input.state, input.changeId);
	if (!change) {
		throw new Error(`Native Decision Change ${input.changeId} is absent.`);
	}
	const changeRevisionId = activeChangeRevisionId(change);
	const attempt = change.loopAttempts.find(
		(entry) => entry.operationId === input.attemptOperationId,
	);
	const attemptOperation = change.operations.find(
		(operation) => operation.operationId === input.attemptOperationId,
	);
	if (
		!attempt ||
		attempt.loop !== "decision" ||
		attempt.status !== "active" ||
		attempt.changeRevisionId !== changeRevisionId ||
		!attempt.privateAttemptDigest ||
		attemptOperation?.body.kind !== "loop.attempt_started" ||
		!attemptOperation.body.authorityBinding.authenticationEvidenceId
	) {
		throw new Error(
			"Native Decision operations require the exact authenticated canonical Decision attempt.",
		);
	}
	assertDecisionArtifactIdentity(input, changeRevisionId);
	assertResultEvidenceAvailable(input.report, input.evidenceRecords);
	return {attempt, change};
}

function activeChangeRevisionId(state: ChangeWorkState): Sha256Digest {
	if (!state.currentRevision || state.withdrawn || state.trace.status !== "open") {
		throw new Error("Native Decision operations require an active current Change revision.");
	}
	return state.currentRevision.revisionId;
}

function assertDecisionArtifactIdentity(
	...values: [CreateNativeDecisionOperationsInput, Sha256Digest]
): void {
	const [input, changeRevisionId] = values;
	if (
		input.candidate.loop !== "decision" ||
		input.policy.loop !== "decision" ||
		input.report.loop !== "decision"
	) {
		throw new Error("Native Decision operations require Decision artifacts.");
	}
	assertCandidateIdentity(input.candidate);
	const expectedCandidate = createDecisionCandidate({
		state: input.state,
		changeId: input.changeId,
		proposal: {
			disposition: input.candidate.content.disposition,
			rationale: input.candidate.content.rationale,
		},
	});
	if (expectedCandidate.digest !== input.candidate.digest) {
		throw new Error(
			"Native Decision Candidate is not the exact Runtime materialization for current WorkState.",
		);
	}
	assertValidResolvedExitPolicy(input.policy);
	assertValidExitReport(input.report, input.policy);
	assertRuntimeRouteIdentity(input.route);
	for (const evidence of input.evidenceRecords) assertValidEvidenceRecord(evidence);
	if (
		input.policy.candidateDigest !== input.candidate.digest ||
		input.report.candidateDigest !== input.candidate.digest ||
		input.route.candidateDigest !== input.candidate.digest ||
		input.route.exitReportDigest !== input.report.reportDigest
	) {
		throw new Error("Native Decision operation artifacts do not share exact identity.");
	}
	if (!input.candidate.observedBase.canonicalRefs.includes(changeRevisionId)) {
		throw new Error("Native Decision Candidate does not bind current Change revision.");
	}
	if (input.candidate.observedBase.workStateDigest !== input.state.workStateDigest) {
		throw new Error("Native Decision Candidate WorkState is stale.");
	}
}

function assertResultEvidenceAvailable(
	...values: [ExitReport, readonly EvidenceRecord[]]
): void {
	const [report, evidenceRecords] = values;
	const recordedEvidence = new Set(evidenceRecords.map((record) => record.evidenceId));
	for (const result of report.checkResults) {
		for (const evidenceId of result.evidenceRecordIds) {
			if (!recordedEvidence.has(evidenceId)) {
				throw new Error(`Native Decision Result references unavailable Evidence ${evidenceId}.`);
			}
		}
	}
}

function requiredResultBinding(
	...values: [ReadonlyMap<string, CanonicalInlineSemanticArtifact>, string]
): CanonicalInlineSemanticArtifact {
	const [bindings, checkId] = values;
	const binding = bindings.get(checkId);
	if (!binding) throw new Error(`Native Decision Result ${checkId} has no binding.`);
	return binding;
}

function inlineSemanticArtifact(
	...values: [string, string, unknown]
): CanonicalInlineSemanticArtifact {
	const [id, schemaVersion, artifact] = values;
	const normalized = toCanonicalJsonValue(artifact);
	return toCanonicalJsonValue({
		id,
		digest: canonicalJsonDigest(normalized),
		schemaVersion,
		artifact: normalized,
	}) as unknown as CanonicalInlineSemanticArtifact;
}

function assertCandidateIdentity(candidate: DecisionCandidate): void {
	const {id, digest, ...body} = candidate;
	const expectedDigest = canonicalJsonDigest(body);
	const expectedId = `candidate:decision:${expectedDigest.slice("sha256:".length)}`;
	if (digest !== expectedDigest || id !== expectedId) {
		throw new Error("Native Decision Candidate identity is invalid.");
	}
}

function assertRuntimeRouteIdentity(route: DecisionRuntimeRoute): void {
	const {routeDigest, ...body} = route;
	if (routeDigest !== canonicalJsonDigest(body)) {
		throw new Error("Native Decision Runtime Route identity is invalid.");
	}
}

function idFromDigest(...values: [string, string]): string {
	const [prefix, digest] = values;
	return `${prefix}:${digest.slice("sha256:".length)}`;
}

function operationTimestamp(...values: [string, number]): string {
	const [base, offset] = values;
	const epoch = Date.parse(base);
	if (!Number.isFinite(epoch)) throw new Error("Native Decision recordedAt is invalid.");
	return new Date(epoch + offset).toISOString();
}

function sortedEvidence(values: readonly EvidenceRecord[]): EvidenceRecord[] {
	const byId = new Map<string, EvidenceRecord>();
	for (const value of values) {
		if (byId.has(value.evidenceId)) {
			throw new Error(`Native Decision Evidence ${value.evidenceId} is duplicated.`);
		}
		byId.set(value.evidenceId, value);
	}
	return [...byId.values()].sort(compareEvidence);
}

function sortedResults(values: readonly CheckResult[]): CheckResult[] {
	return [...values].sort(compareResults);
}

function compareEvidence(...values: [EvidenceRecord, EvidenceRecord]): number {
	const [left, right] = values;
	return left.evidenceId.localeCompare(right.evidenceId);
}

function compareResults(...values: [CheckResult, CheckResult]): number {
	const [left, right] = values;
	return left.checkId.localeCompare(right.checkId);
}

function operationResultStatus(
	status: CheckResult["status"],
): "passed" | "failed" | "indeterminate" | "excluded" {
	if (status === "pass") return "passed";
	if (status === "fail") return "failed";
	return status;
}

function operationReportStatus(
	status: ExitReport["status"],
): "passed" | "failed" | "indeterminate" {
	if (status === "pass") return "passed";
	if (status === "fail") return "failed";
	return "indeterminate";
}

export interface CommitNativeDecisionOperationSequenceInput {
	readonly repoRoot: string;
	readonly remote: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly currentProject: () =>
		| ProjectAuthoritySnapshot
		| Promise<ProjectAuthoritySnapshot>;
	readonly replayPolicy: ReplayAdmissionPolicy;
	readonly authorityBinding: AuthorityBinding;
	readonly changeId: string;
	readonly attemptOperationId: OperationId;
	readonly expectedTeamSnapshotDigest: Sha256Digest;
	readonly expectedWorkStateDigest: Sha256Digest;
	readonly recordedAt: string;
	readonly candidate: DecisionCandidate;
	readonly exitPolicy: ResolvedExitPolicy;
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly report: ExitReport;
	readonly route: DecisionRuntimeRoute;
	readonly runner?: GitCommandRunner;
	readonly materializationRoot?: string;
	readonly signal?: AbortSignal;
}

export interface NativeDecisionCommitReceipt {
	readonly candidateId: string;
	readonly attemptOperationId: Sha256Digest;
	readonly exitReportId: string;
	readonly routeOperationId: Sha256Digest;
	readonly stateHead: string;
	readonly sequence: NativeDecisionOperationSequence;
	readonly observation: SynchronizationObservation;
}

export async function commitNativeDecisionOperationSequence(
	input: CommitNativeDecisionOperationSequenceInput,
): Promise<NativeDecisionCommitReceipt> {
	const synchronizeCurrent = createCurrentGitSynchronizer({
		repoRoot: input.repoRoot,
		remote: input.remote,
		repositoryIdentity: input.repositoryIdentity,
		currentProject: input.currentProject,
		policy: input.replayPolicy,
		runner: input.runner,
		materializationRoot: input.materializationRoot,
		signal: input.signal,
	});
	const {observation} = await synchronizeCurrent();
	if (
		observation.status !== "fresh" ||
		!observation.workState ||
		!observation.teamSnapshot
	) {
		throw new Error(
			`Native Decision commit requires fresh synchronization; current status is ${observation.status}.`,
		);
	}
	if (
		observation.teamSnapshot.snapshotDigest !==
		input.expectedTeamSnapshotDigest
	) {
		throw new Error("Native Decision team snapshot is stale and must be rerun.");
	}
	if (
		observation.workState.workStateDigest !== input.expectedWorkStateDigest
	) {
		throw new Error("Native Decision WorkState is stale and must be rerun.");
	}
	const change = changeById(observation.workState, input.changeId);
	if (!change) {
		throw new Error(`Native Decision Change ${input.changeId} is absent.`);
	}
	const sequence = createNativeDecisionOperationSequence({
		state: observation.workState,
		changeId: input.changeId,
		attemptOperationId: input.attemptOperationId,
		baseSnapshot: {
			remoteStateHead: observation.teamSnapshot.remoteStateHead,
			sourceHead: observation.teamSnapshot.protectedSourceHead,
			knowledgeDigest: observation.teamSnapshot.knowledgeDigest,
			configDigest: observation.teamSnapshot.configDigest,
			policyDigest: observation.teamSnapshot.policyDigest,
		},
		authorityBinding: input.authorityBinding,
		recordedAt: input.recordedAt,
		candidate: input.candidate,
		policy: input.exitPolicy,
		evidenceRecords: input.evidenceRecords,
		report: input.report,
		route: input.route,
	});
	const {pushResult} = await pushSynchronizedStateBatch({
		repoRoot: input.repoRoot,
		remote: input.remote,
		state: observation.workState,
		records: sequence.operations,
		policy: input.replayPolicy,
		observation,
		runner: input.runner,
		signal: input.signal,
	});
	if (pushResult.status === "stale") {
		throw new Error(
			"Native Decision push became stale; Runtime must refetch and rerun Decision.",
		);
	}
	const {observation: verified} = await synchronizeCurrent();
	const acceptedIds = new Set(verified.workState?.acceptedOperationIds ?? []);
	if (
		verified.status !== "fresh" ||
		!verified.workState?.stateHead ||
		!sequence.operations.every((operation) =>
			acceptedIds.has(operation.operationId),
		)
	) {
		throw new Error(
			`Accepted native Decision Candidate ${sequence.candidateId} could not be verified.`,
		);
	}
	return Object.freeze({
		candidateId: sequence.candidateId,
		attemptOperationId: sequence.attemptOperationId,
		exitReportId: sequence.exitReportId,
		routeOperationId: sequence.routeOperationId,
		stateHead: verified.workState.stateHead,
		sequence,
		observation: verified,
	});
}
