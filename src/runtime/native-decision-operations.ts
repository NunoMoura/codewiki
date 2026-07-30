import type {
	AuthorityBinding,
	BaseSnapshot,
	CanonicalChangeOperation,
	ChangeOperationKind,
} from "../change-trace/contracts.ts";
import {createNextChangeOperation} from "../change-trace/builder.ts";
import {reduceChangeOperation} from "../change-trace/reduce-operation.ts";
import type {ChangeWorkState} from "../change-trace/state.ts";
import type {EvidenceRecord} from "../evidence/contracts.ts";
import {
	assertValidResolvedExitPolicy,
	type CheckResult,
	type ExitReport,
	type ResolvedExitPolicy,
} from "../loop-exit/contracts.ts";
import {assertValidExitReport} from "../loop-exit/results.ts";
import type {LoopCandidate} from "../loop-exit/identity.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import type {DecisionRuntimeRoute} from "../decision/exit/runtime.ts";

interface CreateNativeDecisionOperationsInput {
	readonly state: ChangeWorkState;
	readonly baseSnapshot: BaseSnapshot;
	readonly authorityBinding: AuthorityBinding;
	readonly recordedAt: string;
	readonly candidate: LoopCandidate<"decision">;
	readonly policy: ResolvedExitPolicy;
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly report: ExitReport;
	readonly route: DecisionRuntimeRoute;
}

interface NativeDecisionOperationSequence {
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
	const changeRevisionId = assertInput(input);
	const candidateBinding = objectBinding(
		input.candidate.id,
		input.candidate.digest,
		input.candidate.schemaVersion,
	);
	const policyBinding = objectBinding(
		idFromDigest("exit-policy:decision", input.policy.policyDigest),
		input.policy.policyDigest as Sha256Digest,
		String(input.policy.schemaVersion),
	);
	const resultBindings = new Map(
		input.report.checkResults.map((result) => [
			result.checkId,
			objectBinding(
				idFromDigest(`check-result:decision:${result.checkId}`, result.resultDigest),
				result.resultDigest as Sha256Digest,
				String(result.schemaVersion),
			),
		]),
	);
	const reportBinding = objectBinding(
		idFromDigest("exit-report:decision", input.report.reportDigest),
		input.report.reportDigest as Sha256Digest,
		String(input.report.schemaVersion),
	);
	let projected = input.state;
	const operations: CanonicalChangeOperation[] = [];
	const append = <K extends ChangeOperationKind>(
		kind: K,
		payload: Parameters<typeof createNextChangeOperation<K>>[1]["payload"],
	): CanonicalChangeOperation<K> => {
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
	const attempt = append("loop.attempt_started", {
		loop: "decision",
		changeRevisionId,
		loopProtocolDigest: decisionProtocolDigest(input.policy),
		routeId: "decision-native-v1",
	});
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
			evidence: objectBinding(
				evidence.evidenceId,
				canonicalJsonDigest(evidence),
				evidence.schemaVersion,
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
		targetChangeId: input.state.changeId,
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

function assertInput(input: CreateNativeDecisionOperationsInput): Sha256Digest {
	const changeRevisionId = activeChangeRevisionId(input.state);
	assertDecisionArtifactIdentity(input, changeRevisionId);
	assertResultEvidenceAvailable(input.report, input.evidenceRecords);
	return changeRevisionId;
}

function activeChangeRevisionId(state: ChangeWorkState): Sha256Digest {
	if (!state.currentRevision || state.withdrawn || state.trace.status !== "open") {
		throw new Error("Native Decision operations require an active current Change revision.");
	}
	return state.currentRevision.revisionId;
}

function assertDecisionArtifactIdentity(
	input: CreateNativeDecisionOperationsInput,
	changeRevisionId: Sha256Digest,
): void {
	if (
		input.candidate.loop !== "decision" ||
		input.policy.loop !== "decision" ||
		input.report.loop !== "decision"
	) {
		throw new Error("Native Decision operations require Decision artifacts.");
	}
	assertValidResolvedExitPolicy(input.policy);
	assertValidExitReport(input.report, input.policy);
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
}

function assertResultEvidenceAvailable(
	report: ExitReport,
	evidenceRecords: readonly EvidenceRecord[],
): void {
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
	bindings: ReadonlyMap<
		string,
		{id: string; digest: Sha256Digest; schemaVersion: string; ref: string}
	>,
	checkId: string,
): {id: string; digest: Sha256Digest; schemaVersion: string; ref: string} {
	const binding = bindings.get(checkId);
	if (!binding) throw new Error(`Native Decision Result ${checkId} has no binding.`);
	return binding;
}

function objectBinding(
	id: string,
	digest: Sha256Digest,
	schemaVersion: string,
): {id: string; digest: Sha256Digest; schemaVersion: string; ref: string} {
	return {id, digest, schemaVersion, ref: `state:objects/${id}`};
}

function idFromDigest(prefix: string, digest: string): string {
	return `${prefix}:${digest.slice("sha256:".length)}`;
}

function decisionProtocolDigest(policy: ResolvedExitPolicy): Sha256Digest {
	return canonicalJsonDigest({
		protocol: "codewiki.native-decision-runtime@1.0.0",
		catalogDigest: policy.catalogDigest,
		bindings: policy.bindings.map((binding) => ({
			checkId: binding.checkId,
			checkVersion: binding.checkVersion,
			checkDigest: binding.checkDigest,
		})),
	});
}

function operationTimestamp(base: string, offset: number): string {
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
	return [...byId.values()].sort((left, right) =>
		left.evidenceId.localeCompare(right.evidenceId),
	);
}

function sortedResults(values: readonly CheckResult[]): CheckResult[] {
	return [...values].sort((left, right) => left.checkId.localeCompare(right.checkId));
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
