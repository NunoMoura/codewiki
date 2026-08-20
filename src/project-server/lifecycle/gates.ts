import {
	createGateRunner,
	type CheckExecutor,
	type CheckInputResolver,
	type CheckInputResolverContext,
	type GateRunnerLimits,
} from "../../checks/runner.ts";
import {
	createCheckInputSelection,
	type CreateCheckInputSelectionInput,
} from "../../checks/protocol.ts";
import {
	createCheckPackSnapshot,
	packagedChecks,
	type CheckPackSnapshot,
} from "../../checks/packs/contracts.ts";
import {checkSubjectFromCandidate} from "../../checks/identity.ts";
import type {
	CheckInputItem,
	CheckInputSelection,
	GateReport,
	GateStopReason,
} from "../../checks/contracts.ts";
import {createGateReport} from "../../checks/results.ts";
import type {CheckResultCache} from "../../checks/cache.ts";
import type {EvidenceRecord} from "../../evidence/contracts.ts";
import {ACTIVE_CHANGE_COMPATIBILITY_CHECK_ID} from "../../loops/decision/active-change-portfolio.ts";
import type {DecisionCandidate} from "../../loops/decision/candidate.ts";
import {
	admitReviewEvidence,
	reviewFeedbackFromGate,
	reviewSubjectFromAttempt,
	type ReviewAttempt,
	type ReviewEvidenceSubmission,
	type ReviewFeedbackItem,
	type ReviewProviderReceiptBinding,
} from "../../loops/review/contracts.ts";
import {
	canonicalJsonDigest,
	toCanonicalJsonValue,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

export interface DecisionGateEvidenceCollector {
	collect(input: {
		readonly candidate: DecisionCandidate;
		readonly changeRef: string;
		readonly signal: AbortSignal;
	}): readonly EvidenceRecord[] | Promise<readonly EvidenceRecord[]>;
}

export interface CreateDecisionGateInput {
	readonly packSnapshot?: CheckPackSnapshot;
	readonly executors?: readonly CheckExecutor[];
	readonly inputResolver?: CheckInputResolver;
	readonly evidenceCollectors?: readonly DecisionGateEvidenceCollector[];
	readonly stoppedReason?: GateStopReason;
	readonly cache?: CheckResultCache;
	readonly limits?: Partial<GateRunnerLimits>;
}

export interface RunDecisionGateInput {
	readonly candidate: DecisionCandidate;
	readonly changeRef: string;
	readonly evidenceRecords?: readonly EvidenceRecord[];
	readonly signal?: AbortSignal;
}

export type DecisionLifecycleTransition = Readonly<{
	readonly schemaVersion: "1.0.0";
	readonly candidateDigest: Sha256Digest;
	readonly gateReportDigest: Sha256Digest;
	readonly target:
		| "planning"
		| "decision"
		| "terminal"
		| "deferred"
		| "preserve_state";
	readonly reasonCode: string;
	readonly requestedDisposition: DecisionCandidate["content"]["disposition"];
	readonly transitionDigest: Sha256Digest;
}>;

export interface DecisionGateRun {
	readonly candidate: DecisionCandidate;
	readonly packSnapshot: CheckPackSnapshot;
	readonly report: GateReport;
	readonly transition: DecisionLifecycleTransition;
	readonly collectedEvidenceRecords: readonly EvidenceRecord[];
}

export interface CreateReviewGateInput {
	readonly packSnapshot: CheckPackSnapshot;
	readonly executors?: readonly CheckExecutor[];
	readonly inputResolver?: CheckInputResolver;
	readonly stoppedReason?: GateStopReason;
	readonly cache?: CheckResultCache;
	readonly limits?: Partial<GateRunnerLimits>;
}

export interface RunReviewGateInput {
	readonly attempt: ReviewAttempt;
	readonly evidence: readonly ReviewEvidenceSubmission[];
	readonly providerReceipts: readonly ReviewProviderReceiptBinding[];
	readonly signal?: AbortSignal;
}

export type ReviewLifecycleTransition = Readonly<{
	readonly schemaVersion: "1.0.0";
	readonly reviewAttemptDigest: Sha256Digest;
	readonly gateReportDigest: Sha256Digest;
	readonly target: "guarded_delivery" | "implementation" | "preserve_state";
	readonly reasonCode: string;
	readonly transitionDigest: Sha256Digest;
}>;

export interface ReviewGateRun {
	readonly attempt: ReviewAttempt;
	readonly packSnapshot: CheckPackSnapshot;
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly report: GateReport;
	readonly feedback: readonly ReviewFeedbackItem[];
	readonly transition: ReviewLifecycleTransition;
}

export function createDecisionGate(input: CreateDecisionGateInput = {}): Readonly<{
	run(runInput: RunDecisionGateInput): Promise<DecisionGateRun>;
}> {
	const packSnapshot =
		input.packSnapshot ?? createCheckPackSnapshot({stage: "decision", packs: []});
	if (packSnapshot.stage !== "decision") {
		throw new Error("Decision Gate requires a Decision Check Pack snapshot.");
	}
	return Object.freeze({
		async run(runInput: RunDecisionGateInput): Promise<DecisionGateRun> {
			assertRunInput(runInput);
			const subject = checkSubjectFromCandidate(runInput.candidate);
			const requiredCompatibilityCheck = packagedChecks(packSnapshot).find(
				(check) => check.checkId === ACTIVE_CHANGE_COMPATIBILITY_CHECK_ID,
			);
			const compatibilityStopReason =
				runInput.candidate.content.activePortfolio.changes.length > 0 &&
				(!requiredCompatibilityCheck ||
					requiredCompatibilityCheck.definition.implementation.kind !== "model")
					? {
							code: "malformed_check" as const,
							message:
								"Decision active portfolio requires active_change_compatibility as a Model Check.",
							checkId: ACTIVE_CHANGE_COMPATIBILITY_CHECK_ID,
						}
					: undefined;
			const stoppedReason = input.stoppedReason ?? compatibilityStopReason;
			if (stoppedReason) {
				const report = createGateReport({
					snapshot: packSnapshot,
					subjectDigest: subject.digest,
					results: [],
					executions: [],
					stoppedReason,
				});
				return Object.freeze({
					candidate: runInput.candidate,
					packSnapshot,
					report,
					transition: deriveDecisionLifecycleTransition(runInput.candidate, report),
					collectedEvidenceRecords: Object.freeze([]),
				});
			}
			const signal = runInput.signal ?? new AbortController().signal;
			const collectedEvidenceRecords = (
				await Promise.all(
					(input.evidenceCollectors ?? []).map((collector) =>
						collector.collect({
							candidate: runInput.candidate,
							changeRef: runInput.changeRef,
							signal,
						}),
					),
				)
			).flat();
			const evidenceRecords = [
				...(runInput.evidenceRecords ?? []),
				...collectedEvidenceRecords,
			];
			const resolver = evidenceInputResolver({
				evidenceRecords,
				fallback: input.inputResolver,
			});
			const runner = createGateRunner({
				executors: input.executors,
				inputResolver: resolver,
				cache: input.cache,
				limits: input.limits,
			});
			const report = await runner.run({
				subject,
				snapshot: packSnapshot,
				signal: runInput.signal,
			});
			return Object.freeze({
				candidate: runInput.candidate,
				packSnapshot,
				report,
				transition: deriveDecisionLifecycleTransition(runInput.candidate, report),
				collectedEvidenceRecords: Object.freeze(collectedEvidenceRecords),
			});
		},
	});
}

export function createReviewGate(input: CreateReviewGateInput): Readonly<{
	run(runInput: RunReviewGateInput): Promise<ReviewGateRun>;
}> {
	if (input.packSnapshot.stage !== "review") {
		throw new Error("Review Gate requires a Review Check Pack snapshot.");
	}
	return Object.freeze({
		async run(runInput: RunReviewGateInput): Promise<ReviewGateRun> {
			assertReviewGateRunInput(runInput);
			const subject = reviewSubjectFromAttempt(runInput.attempt);
			if (
				runInput.attempt.checkPackSnapshotDigest !==
				input.packSnapshot.checkPackDigest
			) {
				throw new Error("Review attempt Check Pack snapshot is stale.");
			}
			const evidenceRecords = admitReviewEvidence({
				attempt: runInput.attempt,
				evidence: runInput.evidence,
				providerReceipts: runInput.providerReceipts,
			});
			const report = input.stoppedReason
				? createGateReport({
						snapshot: input.packSnapshot,
						subjectDigest: subject.digest,
						results: [],
						executions: [],
						stoppedReason: input.stoppedReason,
					})
				: await createGateRunner({
						executors: input.executors,
						inputResolver: evidenceInputResolver({
							evidenceRecords,
							fallback: input.inputResolver,
						}),
						cache: input.cache,
						limits: input.limits,
					}).run({
						subject,
						snapshot: input.packSnapshot,
						signal: runInput.signal,
					});
			return Object.freeze({
				attempt: runInput.attempt,
				packSnapshot: input.packSnapshot,
				evidenceRecords,
				report,
				feedback: reviewFeedbackFromGate({attempt: runInput.attempt, report}),
				transition: deriveReviewLifecycleTransition(runInput.attempt, report),
			});
		},
	});
}

function assertReviewGateRunInput(input: RunReviewGateInput): void {
	const unsupported = Object.keys(input).filter(
		(key) => !["attempt", "evidence", "providerReceipts", "signal"].includes(key),
	);
	if (unsupported.length > 0) {
		throw new Error(
			`Review Gate input has unsupported fields: ${unsupported.join(", ")}.`,
		);
	}
	if (!Array.isArray(input.evidence) || !Array.isArray(input.providerReceipts)) {
		throw new Error("Review Gate Evidence and provider receipts must be arrays.");
	}
}

export function deriveReviewLifecycleTransition(
	attempt: ReviewAttempt,
	report: GateReport,
): ReviewLifecycleTransition {
	if (
		report.stage !== "review" ||
		report.subjectDigest !== reviewSubjectFromAttempt(attempt).digest
	) {
		throw new Error("Review Gate Report identity does not match Review attempt.");
	}
	let selection: Pick<ReviewLifecycleTransition, "target" | "reasonCode">;
	if (report.status === "passed") {
		selection = {target: "guarded_delivery", reasonCode: "review_passed"};
	} else if (report.status === "failed") {
		selection = {target: "implementation", reasonCode: "review_checks_failed"};
	} else {
		selection = {
			target: "preserve_state",
			reasonCode: report.stoppedReason?.code ?? "gate_stopped",
		};
	}
	const body = {
		schemaVersion: "1.0.0" as const,
		reviewAttemptDigest: attempt.attemptDigest,
		gateReportDigest: report.reportDigest,
		...selection,
	};
	return toCanonicalJsonValue({
		...body,
		transitionDigest: canonicalJsonDigest(body),
	}) as unknown as ReviewLifecycleTransition;
}

export function deriveDecisionLifecycleTransition(
	candidate: DecisionCandidate,
	report: GateReport,
): DecisionLifecycleTransition {
	if (report.stage !== "decision" || report.subjectDigest !== candidate.digest) {
		throw new Error("Decision Gate Report identity does not match Candidate.");
	}
	const selection = decisionLifecycleSelection(candidate, report);
	const body = {
		schemaVersion: "1.0.0" as const,
		candidateDigest: candidate.digest,
		gateReportDigest: report.reportDigest,
		target: selection.target,
		reasonCode: selection.reasonCode,
		requestedDisposition: candidate.content.disposition,
	};
	return toCanonicalJsonValue({
		...body,
		transitionDigest: canonicalJsonDigest(body),
	}) as unknown as DecisionLifecycleTransition;
}

function decisionLifecycleSelection(
	candidate: DecisionCandidate,
	report: GateReport,
): Pick<DecisionLifecycleTransition, "target" | "reasonCode"> {
	if (report.status === "stopped") {
		return {target: "preserve_state", reasonCode: report.stoppedReason?.code ?? "gate_stopped"};
	}
	if (report.status === "failed") {
		return {target: "decision", reasonCode: "decision_checks_failed"};
	}
	switch (candidate.content.disposition) {
		case "approve":
			return {target: "planning", reasonCode: "decision_approved"};
		case "defer":
			return {target: "deferred", reasonCode: "decision_deferred"};
		case "reject":
			return {target: "terminal", reasonCode: "decision_rejected"};
		case "withdraw":
			return {target: "terminal", reasonCode: "decision_withdrawn"};
		default:
			return assertNever(candidate.content.disposition);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unsupported Decision disposition ${String(value)}.`);
}

function evidenceInputResolver(input: {
	readonly evidenceRecords: readonly EvidenceRecord[];
	readonly fallback?: CheckInputResolver;
}): CheckInputResolver {
	return Object.freeze({
		async resolve(
			context: CheckInputResolverContext,
		): Promise<CheckInputSelection | CreateCheckInputSelectionInput> {
			const source = context.selector.source;
			if (source !== "evidence" && source !== "provider_receipts") {
				if (input.fallback) return input.fallback.resolve(context);
				return createCheckInputSelection({
					selector: context.selector,
					status: "unavailable",
				});
			}
			const records = input.evidenceRecords.filter((record) =>
				evidenceMatchesSelector(record, source, context.selector.refs),
			);
			const items: CheckInputItem[] = records.map((record) => ({
				source,
				ref: record.evidenceId,
				digest: canonicalJsonDigest(record),
				content: toCanonicalJsonValue(record),
			}));
			return createCheckInputSelection({
				selector: context.selector,
				status: items.length > 0 || !context.selector.required ? "ready" : "unavailable",
				items,
			});
		},
	});
}

function evidenceMatchesSelector(
	record: EvidenceRecord,
	source: "evidence" | "provider_receipts",
	refs: readonly string[],
): boolean {
	if (
		source === "provider_receipts" &&
		!record.evidenceId.includes("provider_check_receipt")
	) {
		return false;
	}
	if (refs.length === 0) return true;
	return refs.some((ref) =>
		ref.endsWith("/**")
			? record.evidenceId.startsWith(ref.slice(0, -2))
			: record.evidenceId === ref,
	);
}

function assertRunInput(input: RunDecisionGateInput): void {
	if (input.candidate.loop !== "decision") {
		throw new Error("Decision Gate requires Decision Candidate.");
	}
	if (!input.changeRef.trim() || input.changeRef !== input.changeRef.trim()) {
		throw new Error("Decision Gate changeRef must be trimmed non-empty text.");
	}
}
