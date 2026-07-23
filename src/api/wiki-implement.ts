import { changeTraceId } from "../changes/change-trace.ts";
import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import type { ImplementationEvidencePolicy } from "../implementation/evidence-policy.ts";
import { resolveLoopQualityJudgeExecutionOptions } from "../loops/judge-provider.ts";
import { uniqueStrings } from "../loops/quality-standards.ts";
import {
	assertKnownInputKeys,
	requiredStringField,
} from "./input-validation.ts";
import type { ContentProof } from "../git/content-proof.ts";
import type { SourceMapContract } from "../knowledge/source-map.ts";
import {
	changedPaths,
	normalizeImplementationChanges,
} from "../implementation/evidence.ts";
import {
	createImplementationEvidenceReport,
	defaultReviewEvidenceCache,
	reviewPackSelectionForPolicy,
	runLanguageReviewPacks,
	summarizeReviewEvidenceReports,
	type ImplementationEvidenceReportInput,
	type LanguageReviewPack,
	type LanguageReviewPackRunSummary,
	type LanguageReviewPackSkipSummary,
	type ReviewEvidenceSummary,
	type ReviewPackSelection,
} from "../implementation/review/index.ts";
import {
	runImplementationIterationWithRunner,
	type ImplementationIterationInput,
	type ImplementationIterationResult,
} from "../implementation/iteration.ts";
import type {
	ImplementationArchiveDisposition,
	ImplementationArchiveDispositionInput,
	ImplementationChange,
	ImplementationChangeInput,
	ImplementationWorkerClaim,
} from "../implementation/types.ts";
import { createImplementationMergeContentProof } from "../implementation/merge-proof.ts";
import {
	aggregateImplementationWorkerResults,
	type ImplementationWorkerResultInput,
} from "../implementation/workers.ts";
import { loadWikiConfigFile } from "../project/config-file.ts";
import { readProjectSourceMap } from "../project/explain.ts";
import type { WikiQualityReviewConfig } from "../project/config.ts";
import {
	collectProjectSnapshot,
	type ProjectSnapshot,
} from "../project/snapshot.ts";
import { RuntimeReactor, type RuntimeObservation } from "../runtime/reactor.ts";
import { assertRuntimeSemanticJobId } from "../traces/schema.ts";
import {
	appendSemanticLoopReport,
	assertSemanticLoopReportBatch,
	type AppendSemanticLoopReportResult,
} from "../runtime/trace-writer.ts";
import type { TraceEvent, TraceRecord } from "../traces/types.ts";
import type {
	WorkState,
	WorkStateAssignment,
	WorkStateWorkItem,
} from "../work-state/types.ts";

export type WikiImplementMode = "preview" | "append";

type RuntimeOwnedImplementationField =
	| "id"
	| "planningRefs"
	| "planning_refs"
	| "workerId"
	| "worker_id"
	| "workUnitId"
	| "work_unit_id"
	| "claimId"
	| "claim_id"
	| "sessionId"
	| "session_id"
	| "sessionFile"
	| "session_file";

/** Evidence supplied by a worker or semantic adapter; runtime owns all routing facts. */
export type ImplementationEvidenceSubmission = Omit<
	ImplementationChangeInput,
	RuntimeOwnedImplementationField
> & {
	workItemId: string;
	assignmentId?: string;
};

export interface RunWikiImplementInput {
	repoRoot: string;
	expectedWorkStateDigest: string;
	evidence?: ImplementationEvidenceSubmission[];
	workerResults?: ImplementationWorkerResultInput[];
	reviewEvidenceReports?: ImplementationEvidenceReportInput[];
	archiveDisposition?: ImplementationArchiveDisposition;
	archiveDispositionInput?: ImplementationArchiveDispositionInput;
	requireArchiveDisposition?: boolean;
	evidencePolicy?: ImplementationEvidencePolicy;
	includeCachedReviewEvidence?: boolean;
	autoReviewEvidence?: boolean;
	reviewTimeoutMs?: number;
	requireTddEvidence?: boolean;
	createdAt?: string;
	mode?: WikiImplementMode;
	snapshotRoots?: string[];
	snapshotExclude?: string[];
	proofPaths?: string[];
	changedPaths?: string[];
	evidencePaths?: string[];
	aggregateContentProof?: ContentProof;
	runtimeJobId?: string;
}

interface PreparedWikiImplementInput
	extends Omit<RunWikiImplementInput, "expectedWorkStateDigest" | "evidence"> {
	traceId: string;
	planningEvents: TraceEvent[];
	changeInputs: ImplementationChangeInput[];
	workerClaims?: ImplementationWorkerClaim[];
	claimEvents: TraceEvent[];
	expectedWorkerBaseSha?: string;
	componentMap?: SourceMapContract;
	parentId: string | null;
	expectedBytes: number;
	nextSequence: number;
	expectedTraceId: string;
}

export interface WikiImplementReviewEvidenceResult {
	enabled: boolean;
	autoEvidence: boolean;
	includeCachedEvidence: boolean;
	availablePackIds: string[];
	enabledPackIds: string[];
	selectedPackIds: string[];
	requiredPackIds: string[];
	skippedPacks: LanguageReviewPackSkipSummary[];
	explicitReportCount: number;
	generatedReportCount: number;
	submittedReportCount: number;
	summary: ReviewEvidenceSummary;
}

export interface RunWikiImplementResult {
	mode: WikiImplementMode;
	traceId: string;
	selection: {
		sprintId: string;
		changeId: string;
		workItemIds: string[];
	};
	proofPaths: string[];
	snapshot: ProjectSnapshot;
	aggregateContentProof?: ContentProof;
	reviewEvidence: WikiImplementReviewEvidenceResult;
	loopResult: ImplementationIterationResult;
	iterationEvent: TraceEvent;
	append?: AppendSemanticLoopReportResult<ImplementationIterationResult>["append"];
}

interface PreparedWikiImplementReviewEvidence {
	reports: ImplementationEvidenceReportInput[];
	enabled: boolean;
	autoEvidence: boolean;
	includeCachedEvidence: boolean;
	availablePackIds: string[];
	enabledPackIds: string[];
	selectedPackIds: string[];
	requiredPackIds: string[];
	skippedPacks: LanguageReviewPackSkipSummary[];
	explicitReportCount: number;
	generatedReportCount: number;
}

const WIKI_IMPLEMENT_INPUT_KEYS = [
	"repoRoot",
	"expectedWorkStateDigest",
	"evidence",
	"workerResults",
	"reviewEvidenceReports",
	"archiveDisposition",
	"archiveDispositionInput",
	"requireArchiveDisposition",
	"evidencePolicy",
	"includeCachedReviewEvidence",
	"autoReviewEvidence",
	"reviewTimeoutMs",
	"requireTddEvidence",
	"createdAt",
	"mode",
	"snapshotRoots",
	"snapshotExclude",
	"proofPaths",
	"changedPaths",
	"evidencePaths",
	"aggregateContentProof",
	"runtimeJobId",
] as const;

interface PreparedWikiImplementResult
	extends Omit<RunWikiImplementResult, "selection"> {}

export async function runWikiImplement(
	input: RunWikiImplementInput,
): Promise<RunWikiImplementResult> {
	return await runWikiImplementFromObservation(input);
}

/** Runtime-only entry using the exact observation that selected this iteration. */
export async function runRuntimeSelectedWikiImplement(
	input: RunWikiImplementInput,
	observation: RuntimeObservation,
	beforeAppend?: () => void | Promise<void>,
): Promise<RunWikiImplementResult> {
	return await runWikiImplementFromObservation(input, observation, beforeAppend);
}

async function runWikiImplementFromObservation(
	input: RunWikiImplementInput,
	observation?: RuntimeObservation,
	beforeAppend?: () => void | Promise<void>,
): Promise<RunWikiImplementResult> {
	assertKnownInputKeys(
		"wiki_implement",
		input as unknown as Record<string, unknown>,
		WIKI_IMPLEMENT_INPUT_KEYS,
	);
	requiredStringField("wiki_implement", "repoRoot", input.repoRoot);
	requiredStringField(
		"wiki_implement",
		"expectedWorkStateDigest",
		input.expectedWorkStateDigest,
	);
	assertRuntimeSemanticJobId(input.runtimeJobId, "wiki_implement");
	const context = await runtimeImplementationContext(input, observation);
	const result = await runPreparedWikiImplement(context.input, beforeAppend);
	return { ...result, selection: context.selection };
}

async function runPreparedWikiImplement(
	input: PreparedWikiImplementInput,
	beforeAppend?: () => void | Promise<void>,
): Promise<PreparedWikiImplementResult> {
	const traceId = input.traceId;
	const mode = input.mode || "preview";
	const nextSequence = input.nextSequence;
	const config = await loadWikiConfigFile(input.repoRoot);
	const snapshot = await collectProjectSnapshot({
		root: input.repoRoot,
		roots: input.snapshotRoots,
		exclude: input.snapshotExclude,
	});
	const changes = implementationChangesForRun(input);
	const mergeProof = await createImplementationMergeContentProof({
		repoRoot: input.repoRoot,
		changes,
		workerResults: input.workerResults,
		proofPaths: input.proofPaths,
		changedPaths: input.changedPaths,
		evidencePaths: input.evidencePaths,
		exclude: input.snapshotExclude,
		aggregateContentProof: input.aggregateContentProof,
	});
	const { proofPaths, aggregateContentProof } = mergeProof;
	const preparedChanges = changesWithLocalProof(changes, aggregateContentProof);
	const reviewEvidencePreparation = await reviewEvidenceReportsForRun(
		input,
		preparedChanges,
		config.quality.review,
	);
	const qualityJudge = await resolveLoopQualityJudgeExecutionOptions({
		repoRoot: input.repoRoot,
	});
	const loopInput = implementationIterationInput(input, {
		changes: preparedChanges,
		existingPaths: snapshot.paths,
		aggregateContentProof,
		reviewEvidenceReports: reviewEvidencePreparation.reports,
		reviewConfig: config.quality.review,
		qualityJudge,
	});
	if (mode === "append") {
		await beforeAppend?.();
		const expectedBytes = requiredExpectedBytes(input.expectedBytes);
		const result = await appendSemanticLoopReport({
			repoRoot: input.repoRoot,
			loop: "implementation",
			expectedBytes,
			nextSequence,
			expectedTraceId: input.expectedTraceId ?? input.traceId,
			run: ({ startSequence }) =>
				runImplementationIterationWithRunner({ ...loopInput, startSequence }),
		});
		return {
			mode,
			traceId: result.traceId,
			proofPaths,
			snapshot,
			aggregateContentProof,
			reviewEvidence: wikiImplementReviewEvidenceResult(
				reviewEvidencePreparation,
				result.loopResult,
			),
			loopResult: result.loopResult,
			iterationEvent: result.iterationEvent,
			append: result.append,
		};
	}
	const loopResult = await runImplementationIterationWithRunner({
		...loopInput,
		startSequence: nextSequence,
	});
	const iterationEvent = assertSemanticLoopReportBatch({
		records: loopResult.traceRecords,
		loop: "implementation",
		nextSequence,
		expectedTraceId: input.expectedTraceId ?? traceId,
	});
	return {
		mode,
		traceId: iterationEvent.traceId,
		proofPaths,
		snapshot,
		aggregateContentProof,
		reviewEvidence: wikiImplementReviewEvidenceResult(
			reviewEvidencePreparation,
			loopResult,
		),
		loopResult,
		iterationEvent,
	};
}

async function runtimeImplementationContext(
	input: RunWikiImplementInput,
	selectedObservation?: RuntimeObservation,
): Promise<{
	input: PreparedWikiImplementInput;
	selection: RunWikiImplementResult["selection"];
}> {
	const observation =
		selectedObservation ||
		(await new RuntimeReactor(input.repoRoot).observe({
			kind: "manual_resume",
		}));
	if (observation.workState.snapshotDigest !== input.expectedWorkStateDigest) {
		throw new Error(
			`Implementation WorkState changed: expected ${input.expectedWorkStateDigest}, actual ${observation.workState.snapshotDigest}.`,
		);
	}
	const selection = observation.reaction.selection;
	if (selection?.loop !== "implementation") {
		throw new Error(
			"Runtime did not select Implementation for current WorkState.",
		);
	}
	const sources = implementationEvidenceSources(input);
	if (sources.length === 0) {
		throw new Error(
			"Implementation requires worker results or explicit evidence for runtime-selected Work Items.",
		);
	}
	const selectedIds = new Set(selection.workItemIds);
	const selectedItems = sources.map((source) => {
		const workItemId = evidenceWorkItemId(source);
		if (!selectedIds.has(workItemId)) {
			throw new Error(
				`Implementation evidence targets ${workItemId}, but runtime selected ${selection.workItemIds.join(", ")}.`,
			);
		}
		return requiredWorkItem(observation.workState, workItemId);
	});
	const changeIds = uniqueStrings(
		selectedItems.map((item) => requiredOwningChangeId(item)),
	);
	if (changeIds.length !== 1) {
		throw new Error(
			`One Implementation invocation may append evidence for only one owning Change: ${changeIds.join(", ")}.`,
		);
	}
	const changeId = changeIds[0];
	const traceId = changeTraceId(changeId);
	const workItemIds = uniqueStrings(selectedItems.map((item) => item.id));
	const traceRecords = observation.records.filter(
		(record) => record.traceId === traceId,
	);
	const planningEvents = selectedPlanningEvents(traceRecords, workItemIds);
	if (planningEvents.length === 0) {
		throw new Error(
			`Runtime found no Planning event for selected Work Items in ${traceId}.`,
		);
	}
	const assignments = selectedAssignments(observation.workState, workItemIds);
	const claimEvents = selectedClaimEvents(traceRecords, workItemIds);
	const expectedBytes = observation.expectedBytesByTrace[traceId];
	if (!Number.isInteger(expectedBytes) || expectedBytes < 0) {
		throw new Error(`Runtime has no append handle for ${traceId}.`);
	}
	const parent = traceRecords.at(-1);
	return {
		selection: {
			sprintId: selection.sprintId,
			changeId,
			workItemIds,
		},
		input: {
			...input,
			traceId,
			planningEvents,
			changeInputs: sources.map((source) =>
				runtimeOwnedChangeInput(
					source,
					requiredWorkItem(observation.workState, evidenceWorkItemId(source)),
					assignments,
					planningEvents,
				),
			),
			claimEvents,
			componentMap: await readProjectSourceMap(input.repoRoot),
			parentId:
				parent && parent.type !== "trace_head" ? parent.id || null : null,
			expectedBytes,
			nextSequence: nextTraceSequence(traceRecords),
			expectedTraceId: traceId,
		},
	};
}

function implementationEvidenceSources(
	input: RunWikiImplementInput,
): ImplementationChangeInput[] {
	if (input.evidence !== undefined && !Array.isArray(input.evidence)) {
		throw new Error("Implementation evidence must be an array.");
	}
	const explicit = (input.evidence || []).map((entry) => {
		assertEvidenceDoesNotClaimRuntimeAuthority(entry);
		const { workItemId, assignmentId, ...evidence } = entry;
		return {
			...evidence,
			id: `submitted:${workItemId}`,
			workUnitId: workItemId,
			...(assignmentId ? { claimId: assignmentId } : {}),
		} as ImplementationChangeInput;
	});
	const workerAggregation = aggregateImplementationWorkerResults(
		input.workerResults,
	);
	const worker = [
		...workerAggregation.changeInputs,
		...(input.workerResults || []).flatMap((result) =>
			workerAggregation.changeInputs.some(
				(change) => evidenceWorkItemId(change) === result.workUnitId,
			)
				? []
				: [
						{
							id: `worker:${result.workerId}:${result.workUnitId}`,
							workUnitId: result.workUnitId,
							workerId: result.workerId,
							...(result.claimId ? { claimId: result.claimId } : {}),
						} satisfies ImplementationChangeInput,
					],
		),
	];
	const explicitWorkItems = new Set(explicit.map(evidenceWorkItemId));
	return [
		...explicit,
		...worker.filter(
			(entry) => !explicitWorkItems.has(evidenceWorkItemId(entry)),
		),
	];
}

function assertEvidenceDoesNotClaimRuntimeAuthority(
	entry: ImplementationEvidenceSubmission,
): void {
	const forbidden = [
		"id",
		"planningRefs",
		"planning_refs",
		"workerId",
		"worker_id",
		"workUnitId",
		"work_unit_id",
		"claimId",
		"claim_id",
		"sessionId",
		"session_id",
		"sessionFile",
		"session_file",
	].filter((key) => key in (entry as unknown as Record<string, unknown>));
	if (forbidden.length > 0) {
		throw new Error(
			`Implementation evidence cannot supply runtime-owned fields: ${forbidden.join(", ")}.`,
		);
	}
}

function evidenceWorkItemId(input: ImplementationChangeInput): string {
	const value = input.workUnitId || input.work_unit_id;
	if (!value) throw new Error("Implementation evidence requires workItemId.");
	return value;
}

function requiredWorkItem(
	workState: WorkState,
	workItemId: string,
): WorkStateWorkItem {
	const item = workState.workItems.find(
		(candidate) => candidate.id === workItemId,
	);
	if (!item)
		throw new Error(`Runtime-selected Work Item ${workItemId} was not found.`);
	return item;
}

function requiredOwningChangeId(item: WorkStateWorkItem): string {
	if (!item.owningChangeId) {
		throw new Error(`Work Item ${item.id} has no owning Change.`);
	}
	return item.owningChangeId;
}

function selectedAssignments(
	workState: WorkState,
	workItemIds: string[],
): WorkStateAssignment[] {
	const selected = new Set(workItemIds);
	return workState.assignments.filter((assignment) =>
		selected.has(assignment.workItemId),
	);
}

function selectedClaimEvents(
	records: TraceRecord[],
	workItemIds: string[],
): TraceEvent[] {
	const selected = new Set(workItemIds);
	return records.filter(
		(record): record is TraceEvent =>
			record.type === "trace_event" &&
			record.event.startsWith("runtime.work_unit.") &&
			selected.has(text(record.data?.workUnitId)),
	);
}

function selectedPlanningEvents(
	records: TraceRecord[],
	workItemIds: string[],
): TraceEvent[] {
	const selected = new Set(workItemIds);
	return records.flatMap((record) => {
		if (record.type !== "trace_event" || record.loop !== "planning") return [];
		const output = objectRecord(record.data?.output);
		const workItems = objectList(output.workItems).filter((item) =>
			selected.has(text(item.id)),
		);
		if (workItems.length === 0) return [];
		return [
			{
				...record,
				data: {
					...record.data,
					output: { ...output, workItems },
				},
			},
		];
	});
}

function runtimeOwnedChangeInput(
	source: ImplementationChangeInput,
	item: WorkStateWorkItem,
	assignments: WorkStateAssignment[],
	planningEvents: TraceEvent[],
): ImplementationChangeInput {
	const assignment = assignmentForEvidence(source, item.id, assignments);
	const planningEvent = planningEvents.find((event) =>
		objectList(objectRecord(event.data?.output).workItems).some(
			(candidate) => text(candidate.id) === item.id,
		),
	);
	if (!planningEvent) {
		throw new Error(`Planning event for Work Item ${item.id} was not found.`);
	}
	const evidence = { ...source } as Record<string, unknown>;
	for (const key of RUNTIME_OWNED_CHANGE_INPUT_KEYS) delete evidence[key];
	return {
		...(evidence as unknown as ImplementationChangeInput),
		id: `implementation:${item.id}:${assignment?.id || "unassigned"}`,
		planningRefs: [`trace:${planningEvent.id}#work:${item.id}`],
		workUnitId: item.id,
		...(assignment?.id ? { claimId: assignment.id } : {}),
		...(assignment?.workerId ? { workerId: assignment.workerId } : {}),
	};
}

const RUNTIME_OWNED_CHANGE_INPUT_KEYS = [
	"id",
	"planningRefs",
	"planning_refs",
	"workerId",
	"worker_id",
	"workUnitId",
	"work_unit_id",
	"claimId",
	"claim_id",
	"sessionId",
	"session_id",
	"sessionFile",
	"session_file",
] as const;

function assignmentForEvidence(
	source: ImplementationChangeInput,
	workItemId: string,
	assignments: WorkStateAssignment[],
): WorkStateAssignment | undefined {
	const assignmentId = text(source.claimId || source.claim_id);
	if (assignmentId) {
		const exact = assignments.find(
			(candidate) =>
				candidate.id === assignmentId && candidate.workItemId === workItemId,
		);
		if (!exact) {
			throw new Error(
				`Assignment ${assignmentId} does not belong to Work Item ${workItemId}.`,
			);
		}
		return exact;
	}
	return assignments
		.filter((candidate) => candidate.workItemId === workItemId)
		.sort((left, right) => right.id.localeCompare(left.id))[0];
}

function nextTraceSequence(records: TraceRecord[]): number {
	return (
		Math.max(
			0,
			...records.flatMap((record) =>
				record.type === "trace_event" ? [record.sequence] : [],
			),
		) + 1
	);
}

function objectRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(entry): entry is Record<string, unknown> =>
					Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
			)
		: [];
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

async function reviewEvidenceReportsForRun(
	input: PreparedWikiImplementInput,
	changes: ImplementationChange[],
	reviewConfig: WikiQualityReviewConfig,
): Promise<PreparedWikiImplementReviewEvidence> {
	const explicitReports = input.reviewEvidenceReports || [];
	const paths = uniqueChangedPaths(changes);
	const effectiveReviewConfig: WikiQualityReviewConfig = {
		...reviewConfig,
		requiredPacks: uniqueStrings([
			...reviewConfig.requiredPacks,
			...(input.evidencePolicy?.requiredReviewPacks || []),
		]),
	};
	const selection = reviewPackSelectionForConfig(
		effectiveReviewConfig,
		paths,
		input.evidencePolicy,
	);
	const autoEvidence = shouldAutoReviewEvidence(input, effectiveReviewConfig);
	const includeCachedEvidence = shouldIncludeCachedReviewEvidence(
		input,
		effectiveReviewConfig,
	);
	const basePreparation = {
		enabled: effectiveReviewConfig.enabled,
		autoEvidence,
		includeCachedEvidence,
		availablePackIds: selection.availablePacks.map((pack) => pack.id),
		enabledPackIds: selection.enabledPacks.map((pack) => pack.id),
		selectedPackIds: selection.selectedPacks.map((pack) => pack.id),
		requiredPackIds: [...effectiveReviewConfig.requiredPacks],
		skippedPacks: selection.skippedPacks,
		explicitReportCount: explicitReports.length,
	};
	if (!autoEvidence) {
		return {
			reports: explicitReports,
			...basePreparation,
			generatedReportCount: 0,
		};
	}
	const languageReport = await runLanguageReviewPacks(selection.enabledPacks, {
		cwd: input.repoRoot,
		phase: "exit",
		changedPaths: paths,
		timeoutMs: input.reviewTimeoutMs ?? effectiveReviewConfig.timeoutMs,
	});
	const reports = [...explicitReports];
	let generatedReportCount = 0;
	if (hasReviewEvidence(languageReport)) {
		reports.push(languageReport);
		generatedReportCount += 1;
	}
	const requiredReport = requiredReviewPackPolicyReport(
		effectiveReviewConfig,
		selection,
		languageReport,
	);
	if (requiredReport && hasReviewEvidence(requiredReport)) {
		reports.push(requiredReport);
		generatedReportCount += 1;
	}
	if (reports.some((report) => (report.phase || "exit") === "exit")) {
		const acceptanceReport = acceptanceReviewEvidenceReport(changes);
		if ((acceptanceReport.evidenceLinks || []).length > 0) {
			reports.push(acceptanceReport);
			generatedReportCount += 1;
		}
	}
	return {
		reports,
		...basePreparation,
		generatedReportCount,
	};
}

function acceptanceReviewEvidenceReport(
	changes: ImplementationChange[],
): ImplementationEvidenceReportInput {
	return createImplementationEvidenceReport({
		phase: "exit",
		sources: [
			{
				id: "codewiki.acceptance-evidence-links",
				kind: "common",
				layer: "common",
				summary:
					"Implementation acceptance evidence linked for review evidence gates.",
			},
		],
		changedPaths: uniqueChangedPaths(changes),
		evidenceLinks: changes.flatMap((change) =>
			change.planningRefs.flatMap((planningRef) =>
				change.acceptanceEvidenceItems.flatMap((item) => {
					if (!item.criterionId || item.evidenceRefs.length === 0) return [];
					return [
						{
							kind: "acceptance" as const,
							targetRef: planningRef,
							criterionId: item.criterionId,
							evidenceRefs: item.evidenceRefs,
							summary: item.summary,
							sourceId: "codewiki.acceptance-evidence-links",
						},
					];
				}),
			),
		),
	});
}

function uniqueChangedPaths(changes: ImplementationChange[]): string[] {
	return Array.from(new Set(changes.flatMap((change) => changedPaths(change))));
}

function hasReviewEvidence(report: ImplementationEvidenceReportInput): boolean {
	return Boolean(
		(report.sources || []).length ||
			(report.checks || []).length ||
			(report.diagnostics || []).length ||
			(report.symbols || []).length ||
			(report.dependencyEdges || []).length ||
			(report.evidenceLinks || []).length,
	);
}

function wikiImplementReviewEvidenceResult(
	prepared: PreparedWikiImplementReviewEvidence,
	loopResult: ImplementationIterationResult,
): WikiImplementReviewEvidenceResult {
	return {
		enabled: prepared.enabled,
		autoEvidence: prepared.autoEvidence,
		includeCachedEvidence: prepared.includeCachedEvidence,
		availablePackIds: prepared.availablePackIds,
		enabledPackIds: prepared.enabledPackIds,
		selectedPackIds: prepared.selectedPackIds,
		requiredPackIds: prepared.requiredPackIds,
		skippedPacks: prepared.skippedPacks,
		explicitReportCount: prepared.explicitReportCount,
		generatedReportCount: prepared.generatedReportCount,
		submittedReportCount: loopResult.reviewEvidenceReports.length,
		summary: summarizeReviewEvidenceReports(loopResult.reviewEvidenceReports),
	};
}

function shouldAutoReviewEvidence(
	input: PreparedWikiImplementInput,
	reviewConfig: WikiQualityReviewConfig,
): boolean {
	if (input.autoReviewEvidence !== undefined) return input.autoReviewEvidence;
	return reviewConfig.enabled && reviewConfig.autoEvidence;
}

function shouldIncludeCachedReviewEvidence(
	input: PreparedWikiImplementInput,
	reviewConfig: WikiQualityReviewConfig | undefined,
): boolean {
	if (input.includeCachedReviewEvidence !== undefined) {
		return input.includeCachedReviewEvidence;
	}
	return Boolean(reviewConfig?.enabled && reviewConfig.includeCachedEvidence);
}

function reviewPackSelectionForConfig(
	reviewConfig: WikiQualityReviewConfig,
	changedPaths: string[],
	evidencePolicy?: ImplementationEvidencePolicy,
): ReviewPackSelection {
	return reviewPackSelectionForPolicy(
		reviewConfig,
		changedPaths,
		{},
		evidencePolicy,
	);
}

function requiredReviewPackPolicyReport(
	reviewConfig: WikiQualityReviewConfig,
	selection: ReviewPackSelection,
	languageReport: ImplementationEvidenceReportInput,
): ImplementationEvidenceReportInput | undefined {
	const required = new Set(reviewConfig.requiredPacks);
	if (required.size === 0) return undefined;
	const packRuns = summarizeReviewEvidenceReports([languageReport]).packRuns;
	const runsById = new Map(packRuns.map((run) => [run.id, run]));
	const diagnostics = selection.selectedPacks.flatMap((pack) => {
		if (!required.has(pack.id)) return [];
		const run = runsById.get(pack.id);
		if (run && !requiredPackRunBlocks(run)) return [];
		const path = run?.changedPaths[0] || languageReport.changedPaths?.[0];
		if (!path) return [];
		return [
			{
				path,
				severity: "error" as const,
				message: requiredPackMessage(pack, run),
				sourceId: "codewiki.required-review-packs",
				ruleId: "required-review-pack",
				evidenceRefs: [path],
			},
		];
	});
	if (diagnostics.length === 0) return undefined;
	return createImplementationEvidenceReport({
		phase: "exit",
		changedPaths: languageReport.changedPaths,
		sources: [
			{
				id: "codewiki.required-review-packs",
				kind: "common",
				layer: "common",
				summary: "Required review pack policy.",
			},
		],
		diagnostics,
		metadata: { requiredPacks: [...required] },
	});
}

function requiredPackRunBlocks(run: LanguageReviewPackRunSummary): boolean {
	return ["fail", "blocked", "not-run", "no-evidence"].includes(run.status);
}

function requiredPackMessage(
	pack: LanguageReviewPack,
	run: LanguageReviewPackRunSummary | undefined,
): string {
	if (!run) {
		return `Required review pack ${pack.id} produced no evidence.`;
	}
	return run.summary
		? `Required review pack ${pack.id} did not pass (${run.status}): ${run.summary}`
		: `Required review pack ${pack.id} did not pass (${run.status}).`;
}

function implementationIterationInput(
	input: PreparedWikiImplementInput,
	prepared: {
		changes: ImplementationChange[];
		existingPaths: string[];
		aggregateContentProof?: ContentProof;
		reviewEvidenceReports?: ImplementationEvidenceReportInput[];
		reviewConfig?: WikiQualityReviewConfig;
		qualityJudge?: ImplementationIterationInput["qualityJudge"];
	},
): ImplementationIterationInput {
	return {
		traceId: input.traceId,
		planningEvents: input.planningEvents,
		changes: prepared.changes,
		workerResults: input.workerResults,
		workerClaims: input.workerClaims,
		claimEvents: input.claimEvents,
		expectedWorkerBaseSha: input.expectedWorkerBaseSha,
		componentMap: input.componentMap,
		requireTddEvidence: input.requireTddEvidence,
		runtimeJobId: input.runtimeJobId,
		parentId: input.parentId,
		createdAt: input.createdAt,
		existingPaths: prepared.existingPaths,
		aggregateContentProof: prepared.aggregateContentProof,
		reviewEvidenceReports: prepared.reviewEvidenceReports,
		archiveDisposition: input.archiveDisposition,
		archiveDispositionInput: input.archiveDispositionInput,
		requireArchiveDisposition: input.requireArchiveDisposition,
		reviewEvidenceCache: shouldIncludeCachedReviewEvidence(
			input,
			prepared.reviewConfig,
		)
			? defaultReviewEvidenceCache
			: undefined,
		qualityJudge: prepared.qualityJudge,
	};
}

function implementationChangesForRun(
	input: PreparedWikiImplementInput,
): ImplementationChange[] {
	return normalizeImplementationChanges(input.changeInputs);
}

function changesWithLocalProof(
	changes: ImplementationChange[],
	proof?: ContentProof,
): ImplementationChange[] {
	if (!proof) return changes;
	return changes.map((change) =>
		change.contentProof ? change : { ...change, contentProof: proof },
	);
}

function requiredExpectedBytes(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw createCodewikiApiError({
			operation: "wiki_implement",
			code: "invalid_input",
			field: "expectedBytes",
			message: "wiki_implement append mode requires expectedBytes >= 0.",
			data: { value },
		});
	}
	return value;
}
