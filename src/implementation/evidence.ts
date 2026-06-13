import type { ContentProof } from "../git/content-proof.ts";
import type { TraceEvent } from "../traces/types.ts";
import type {
	AcceptanceEvidenceInput,
	AcceptanceEvidenceItem,
	AcceptanceRequirement,
	CheckPhase,
	CheckResult,
	CheckResultInput,
	CheckStatus,
	ImplementationChange,
	ImplementationChangeInput,
	PlanningImplementationScope,
} from "./types.ts";

const CHECK_STATUSES = new Set<CheckStatus>([
	"pass",
	"fail",
	"blocked",
	"not-run",
]);
const CHECK_PHASES = new Set<CheckPhase>([
	"red",
	"green",
	"refactor",
	"verify",
]);

export function normalizeImplementationChanges(
	changes: ImplementationChangeInput[],
): ImplementationChange[] {
	return changes.map((change) => ({
		id: text(change.id),
		planningRefs: unique([
			...stringList(change.planningRefs),
			...stringList(change.planning_refs),
		]),
		...optionalTextField("workerId", change.workerId ?? change.worker_id),
		...optionalTextField(
			"workUnitId",
			change.workUnitId ?? change.work_unit_id,
		),
		...optionalTextField("claimId", change.claimId ?? change.claim_id),
		...optionalTextField("sessionId", change.sessionId ?? change.session_id),
		...optionalTextField(
			"sessionFile",
			change.sessionFile ?? change.session_file,
		),
		codePaths: unique([
			...stringList(change.codePaths),
			...stringList(change.code_paths),
		]),
		docPaths: unique([
			...stringList(change.docPaths),
			...stringList(change.doc_paths),
		]),
		testPaths: unique([
			...stringList(change.testPaths),
			...stringList(change.test_paths),
		]),
		checks: unique([
			...stringList(change.checks),
			...stringList(change.checks_run),
		]),
		checkResults: normalizeCheckResults([
			...objectList<CheckResultInput>(change.checkResults),
			...objectList<CheckResultInput>(change.check_results),
		]),
		acceptanceEvidence: unique([
			...stringList(change.acceptanceEvidence),
			...stringList(change.acceptance_evidence),
		]),
		acceptanceEvidenceItems: normalizeAcceptanceEvidence([
			...objectList<AcceptanceEvidenceInput>(change.acceptanceEvidenceItems),
			...objectList<AcceptanceEvidenceInput>(change.acceptance_evidence_items),
		]),
		contentProof: change.contentProof ?? change.content_proof,
		publicationRefs: unique([
			...stringList(change.publicationRefs),
			...stringList(change.publication_refs),
		]),
	}));
}

export function acceptanceRequirementsFromPlanningEvents(
	events: TraceEvent[],
): AcceptanceRequirement[] {
	return planningWorkItemsFromIterationEvents(events).flatMap((item) =>
		objectList<AcceptanceEvidenceInput>(item.acceptanceCriteria).map(
			(criterion, index) => ({
				planningRef: item.planningRef,
				criterionId:
					text(criterion.criterionId ?? criterion.criterion_id) ||
					text((criterion as { id?: string }).id) ||
					`AC-${String(index + 1).padStart(3, "0")}`,
				text: text((criterion as { text?: string }).text || criterion.summary),
			}),
		),
	);
}

export function planningRefsFromEvents(events: TraceEvent[]): string[] {
	return unique(
		planningWorkItemsFromIterationEvents(events).map(
			(item) => item.planningRef,
		),
	);
}

export function planningScopesFromEvents(
	events: TraceEvent[],
): PlanningImplementationScope[] {
	return planningWorkItemsFromIterationEvents(events).map((item) => ({
		planningRef: item.planningRef,
		workUnitId: item.id,
		componentRefs: stringList(item.componentRefs),
		pathScopes: stringList(item.pathScopes),
		verification: stringList(item.verification),
	}));
}

export function implementationEvidenceRefs(
	change: ImplementationChange,
): string[] {
	return unique([
		...change.planningRefs,
		...change.codePaths,
		...change.docPaths,
		...change.testPaths,
		...checkResultRefs(change),
		...acceptanceEvidenceRefs(change),
		...contentProofRefs(change),
		...change.publicationRefs,
	]);
}

export function contentProofRefs(change: ImplementationChange): string[] {
	return contentProofRefList(change.contentProof);
}

export function contentProofRefList(proof?: ContentProof): string[] {
	return unique([proof?.commit, proof?.tree, proof?.workingTreeDigest]);
}

export function checkResultRefs(change: ImplementationChange): string[] {
	return unique(change.checkResults.map((check) => check.outputRef));
}

export function acceptanceEvidenceRefs(change: ImplementationChange): string[] {
	return unique(
		change.acceptanceEvidenceItems.flatMap((item) => item.evidenceRefs),
	);
}

export function changedPaths(change: ImplementationChange): string[] {
	return unique([...change.codePaths, ...change.docPaths, ...change.testPaths]);
}

function planningWorkItemsFromIterationEvents(
	events: TraceEvent[],
): Array<Record<string, unknown> & { planningRef: string; id: string }> {
	return events.flatMap((event) => {
		if (event.loop !== "planning" || event.event !== "planning.iteration") {
			return [];
		}
		return objectList<Record<string, unknown>>(
			objectRecord(event.data?.output).workItems,
		).map((item) => ({
			...item,
			id: text(item.id),
			planningRef: iterationSubref(event, "work", text(item.id)),
		}));
	});
}

function iterationSubref(event: TraceEvent, kind: string, id: string): string {
	return `trace:${event.id}#${kind}:${id || event.id}`;
}

function objectRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function normalizeCheckResults(results: CheckResultInput[]): CheckResult[] {
	return results.map(normalizeCheckResult);
}

function normalizeCheckResult(result: CheckResultInput): CheckResult {
	const normalized: CheckResult = {
		command: text(result.command),
		status: normalizeCheckStatus(result.status),
	};
	setCheckPhase(normalized, result);
	setCheckCriterion(normalized, result);
	setCheckExitCode(normalized, result);
	setOptionalText(
		normalized,
		"outputRef",
		result.outputRef ?? result.output_ref,
	);
	setOptionalText(normalized, "summary", result.summary);
	return normalized;
}

function setCheckPhase(check: CheckResult, input: CheckResultInput): void {
	const phase = normalizeCheckPhase(
		input.phase ?? input.tddPhase ?? input.tdd_phase,
	);
	if (phase) check.phase = phase;
}

function setCheckCriterion(check: CheckResult, input: CheckResultInput): void {
	setOptionalText(
		check,
		"criterionId",
		input.criterionId ?? input.criterion_id,
	);
}

function setCheckExitCode(check: CheckResult, input: CheckResultInput): void {
	const exitCode = input.exitCode ?? input.exit_code;
	if (typeof exitCode === "number") check.exitCode = exitCode;
}

function setOptionalText<T extends object, K extends keyof T>(
	value: T,
	key: K,
	input: unknown,
): void {
	const normalized = text(input);
	if (normalized) value[key] = normalized as T[K];
}

function normalizeAcceptanceEvidence(
	evidence: AcceptanceEvidenceInput[],
): AcceptanceEvidenceItem[] {
	return evidence.map((item) => ({
		...(text(item.criterionId ?? item.criterion_id)
			? { criterionId: text(item.criterionId ?? item.criterion_id) }
			: {}),
		summary: text(item.summary),
		evidenceRefs: unique([
			...stringList(item.evidenceRefs),
			...stringList(item.evidence_refs),
		]),
	}));
}

function normalizeCheckStatus(value: unknown): CheckStatus {
	const status = text(value).toLowerCase();
	return CHECK_STATUSES.has(status as CheckStatus)
		? (status as CheckStatus)
		: "not-run";
}

function normalizeCheckPhase(value: unknown): CheckPhase | undefined {
	const phase = text(value).toLowerCase().replace(/_/g, "-");
	return CHECK_PHASES.has(phase as CheckPhase)
		? (phase as CheckPhase)
		: undefined;
}

function text(value: unknown): string {
	return String(value || "").trim();
}

function optionalTextField<Key extends string>(
	key: Key,
	value: unknown,
): Partial<Record<Key, string>> {
	const output = text(value);
	return output ? ({ [key]: output } as Partial<Record<Key, string>>) : {};
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((item) => text(item)).filter(Boolean)
		: [];
}

function objectList<T>(value: unknown): T[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is T => typeof item === "object" && item !== null,
			)
		: [];
}

function unique(values: Array<string | undefined>): string[] {
	return Array.from(
		new Set(values.map((value) => text(value)).filter(Boolean)),
	);
}
