import { createCodewikiOperationError } from "../../error-handling/operation-errors.ts";
import {
	readProjectTraceFiles,
	type ProjectTraceFiles,
} from "../../project/state-file.ts";
import {buildTriggersView} from "./triggers.ts";
import {buildBlockersView} from "../../work-state/blockers.ts";
import {buildConflictsView} from "../../work-state/conflicts.ts";
import {buildQualityView} from "../../work-state/quality.ts";
import {buildResumeView} from "./resume.ts";
import {buildStatusView} from "./status.ts";
import {buildTraceBoardView} from "../../work-state/trace-goals.ts";
import {buildTraceQueueView} from "./trace-queue.ts";
import {buildWorkPlanView} from "../../work-state/work-plan.ts";
import {buildWorkQueueView} from "../../work-state/work-queue.ts";
import {
	buildRuntimeBoard,
	type RuntimeBoard,
	type RuntimeBoardRuntimePreview,
} from "./runtime-board.ts";
import { foldProjectTraceRecords } from "../../changes/trace/project.ts";
import {
	defaultReviewEvidenceCache,
	summarizeReviewEvidenceReports,
	type ImplementationEvidenceReportInput,
	type ReviewEvidenceCacheReader,
	type ReviewEvidenceSummary,
} from "../../execution/review/index.ts";
import type { TraceRecord } from "../../changes/trace/types.ts";
import { buildWorkState } from "../../work-state/projector.ts";
import type { WorkState } from "../../work-state/types.ts";
import type {
	BlockersView,
	ConflictsView,
	QualityView,
	TraceBoardView,
	TraceViewInput,
	WorkPlanView,
	WorkQueueView,
} from "../../work-state/projection-types.ts";
import type {
	ResumeView,
	StatusView,
	TraceQueueView,
	TriggersView,
} from "./projection-types.ts";

export interface BuildProjectWikiStateInput {
	repoRoot: string;
	traceId?: string;
	generatedAt?: string;
	reviewEvidenceCache?: ReviewEvidenceCacheReader;
	reviewEvidenceMaxAgeMs?: number;
	traceFiles?: ProjectTraceFiles;
}

export async function buildProjectWikiState(
	input: BuildProjectWikiStateInput,
): Promise<WikiStateSnapshot> {
	const traceFiles =
		input.traceFiles || (await readProjectTraceFiles(input.repoRoot));
	return buildWikiState({
		records: traceFiles.records,
		traceId: input.traceId,
		generatedAt: input.generatedAt,
		expectedBytesByTrace: traceFiles.expectedBytesByTrace,
		reviewEvidenceCache:
			input.reviewEvidenceCache || defaultReviewEvidenceCache,
		reviewEvidenceMaxAgeMs: input.reviewEvidenceMaxAgeMs,
	});
}

export interface WikiStateAppendTraceHandle {
	expectedBytes: number;
	nextSequence: number;
}

export interface WikiStateAppendHandles {
	byTrace: Record<string, WikiStateAppendTraceHandle>;
}

export type WikiStateNextActionKind =
	| "decide"
	| "plan"
	| "implement"
	| "archive"
	| "wait";

export type WikiStateNextActionTool = "wiki_archive";

export interface WikiStateNextAction {
	action: WikiStateNextActionKind;
	reason: string;
	traceId?: string;
	tool?: WikiStateNextActionTool;
	workUnitId?: string;
}

export interface WikiStateInput {
	records: TraceRecord[];
	generatedAt?: string;
	traceId?: string;
	expectedBytesByTrace?: Record<string, number>;
	reviewEvidenceCache?: ReviewEvidenceCacheReader;
	reviewEvidenceMaxAgeMs?: number;
	runtimeMaxWorkers?: number;
	runtimeResultPreview?: RuntimeBoardRuntimePreview;
}

export interface WikiStateReviewEvidenceView {
	traceId?: string;
	traceBacked: ReviewEvidenceSummary;
	cachedFast: ReviewEvidenceSummary;
	blockers: string[];
}

export interface WikiStateSnapshot {
	generatedAt?: string;
	workState: WorkState;
	traceIds: string[];
	selectedTraceId?: string;
	status?: StatusView;
	resume?: ResumeView;
	workPlan?: WorkPlanView;
	workQueue: WorkQueueView;
	traceQueue: TraceQueueView;
	traceBoard: TraceBoardView;
	triggers: TriggersView;
	runtimeBoard: RuntimeBoard;
	append?: WikiStateAppendHandles;
	next: WikiStateNextAction;
	blockers?: BlockersView;
	conflicts?: ConflictsView;
	quality?: QualityView;
	reviewEvidence?: WikiStateReviewEvidenceView;
}

export function buildWikiState(input: WikiStateInput): WikiStateSnapshot {
	const workState = buildWorkState({
		records: input.records,
		...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
	});
	const fold = foldProjectTraceRecords(input.records);
	const selectedTraceId = selectTraceId(fold.traceIds, input.traceId);
	const selectedRecords = selectedTraceId
		? fold.recordsByTrace[selectedTraceId]
		: undefined;
	const traceViewInput = selectedRecords
		? { records: selectedRecords, generatedAt: input.generatedAt }
		: undefined;
	const selected = buildSelectedTraceViews(traceViewInput);
	const projectViewInput = {
		records: input.records,
		generatedAt: input.generatedAt,
	};
	const workQueue = buildWorkQueueView(projectViewInput);
	const traceQueue = buildTraceQueueView(projectViewInput);
	const traceBoard = buildTraceBoardView(projectViewInput);
	const triggers = buildTriggersView(projectViewInput);
	const reviewEvidence = buildWikiStateReviewEvidence({
		records: selectedRecords || input.records,
		traceId: selectedTraceId,
		cache: input.reviewEvidenceCache,
		generatedAt: input.generatedAt,
		maxAgeMs: input.reviewEvidenceMaxAgeMs,
	});
	const runtimeBoard = buildRuntimeBoard({
		generatedAt: input.generatedAt,
		traceBoard,
		workQueue,
		triggers,
		maxWorkers: input.runtimeMaxWorkers,
		runtimeResultPreview: input.runtimeResultPreview,
	});
	const next = nextStateAction({
		selectedTraceId,
		status: selected.status,
		resume: selected.resume,
		traceBoard,
	});
	return {
		generatedAt: input.generatedAt,
		workState,
		traceIds: fold.traceIds,
		...(selectedTraceId ? { selectedTraceId } : {}),
		...selected,
		...(reviewEvidence ? { reviewEvidence } : {}),
		workQueue,
		traceQueue,
		traceBoard,
		triggers,
		runtimeBoard,
		...appendHandles(
			openTraceIds(traceBoard),
			input.records,
			input.expectedBytesByTrace,
		),
		next,
	};
}

function buildSelectedTraceViews(input: TraceViewInput | undefined): {
	status?: StatusView;
	resume?: ResumeView;
	workPlan?: WorkPlanView;
	blockers?: BlockersView;
	conflicts?: ConflictsView;
	quality?: QualityView;
} {
	if (!input) return {};
	return {
		status: buildStatusView(input),
		resume: buildResumeView(input),
		workPlan: buildWorkPlanView(input),
		blockers: buildBlockersView(input),
		conflicts: buildConflictsView(input),
		quality: buildQualityView(input),
	};
}

function buildWikiStateReviewEvidence(input: {
	records: TraceRecord[];
	traceId?: string;
	cache?: ReviewEvidenceCacheReader;
	generatedAt?: string;
	maxAgeMs?: number;
}): WikiStateReviewEvidenceView | undefined {
	if (input.records.length === 0 && !input.traceId) return undefined;
	const traceBackedReports = reviewEvidenceReportsFromRecords(input.records);
	const cachedFastReports =
		input.cache?.reports({
			...(input.traceId ? { traceId: input.traceId } : {}),
			phases: ["fast"],
			...(input.maxAgeMs !== undefined ? { maxAgeMs: input.maxAgeMs } : {}),
			...(input.generatedAt ? { now: input.generatedAt } : {}),
		}) || [];
	const traceBacked = summarizeReviewEvidenceReports(traceBackedReports);
	const cachedFast = summarizeReviewEvidenceReports(cachedFastReports);
	if (traceBacked.reportCount === 0 && cachedFast.reportCount === 0) {
		return undefined;
	}
	return {
		...(input.traceId ? { traceId: input.traceId } : {}),
		traceBacked,
		cachedFast,
		blockers: [
			...traceBacked.blockingDiagnostics,
			...cachedFast.blockingDiagnostics,
		].map(reviewEvidenceBlockerMessage),
	};
}

function reviewEvidenceReportsFromRecords(
	records: TraceRecord[],
): ImplementationEvidenceReportInput[] {
	return records.flatMap((record) => {
		if (record.type !== "trace_event" || record.loop !== "implementation") {
			return [];
		}
		const output = objectValue(objectValue(record.data).output);
		const reports = output.reviewEvidenceReports;
		return Array.isArray(reports)
			? (reports as ImplementationEvidenceReportInput[])
			: [];
	});
}

function reviewEvidenceBlockerMessage(input: {
	path: string;
	message: string;
	sourceId?: string;
	ruleId?: string;
	line?: number;
}): string {
	return [
		input.sourceId || "review",
		input.ruleId ? ` ${input.ruleId}` : "",
		`: ${input.path}`,
		input.line !== undefined ? `:${input.line}` : "",
		` ${input.message}`,
	].join("");
}

function objectValue(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function openTraceIds(traceBoard: TraceBoardView): string[] {
	return traceBoard.traces
		.filter((trace) => !trace.closed)
		.map((trace) => trace.traceId);
}

function appendHandles(
	traceIds: string[],
	records: TraceRecord[],
	expectedBytesByTrace: Record<string, number> | undefined,
): { append?: WikiStateAppendHandles } {
	if (!expectedBytesByTrace) return {};
	return {
		append: {
			byTrace: Object.fromEntries(
				traceIds.map((traceId) => [
					traceId,
					{
						expectedBytes: expectedBytesByTrace[traceId] || 0,
						nextSequence: nextSequenceForTrace(records, traceId),
					},
				]),
			),
		},
	};
}

function nextSequenceForTrace(records: TraceRecord[], traceId: string): number {
	return (
		Math.max(
			0,
			...records.flatMap((record) =>
				record.traceId === traceId && record.type === "trace_event"
					? [record.sequence]
					: [],
			),
		) + 1
	);
}

function nextStateAction(input: {
	selectedTraceId?: string;
	status?: StatusView;
	resume?: ResumeView;
	traceBoard: TraceBoardView;
}): WikiStateNextAction {
	if (input.selectedTraceId && input.status) {
		return selectedTraceNextAction(
			input.selectedTraceId,
			input.status,
			input.resume,
		);
	}
	if (input.traceBoard.conflicts.length > 0) {
		return {
			action: "wait",
			reason: input.traceBoard.conflicts[0].message,
			traceId: input.traceBoard.conflicts[0].leftTraceId,
		};
	}
	const openTrace = input.traceBoard.traces.find((trace) => !trace.closed);
	if (!openTrace) return { action: "wait", reason: "No active trace." };
	if (openTrace.blockers.length > 0) {
		return {
			action: "wait",
			reason: openTrace.blockers[0],
			traceId: openTrace.traceId,
		};
	}
	if (openTrace.status === "needs_decision") {
		return {
			action: "decide",
			reason: `Trace ${openTrace.traceId} needs decision coverage.`,
			traceId: openTrace.traceId,
		};
	}
	if (openTrace.status === "needs_planning") {
		return {
			action: "plan",
			reason: `Trace ${openTrace.traceId} needs planning coverage.`,
			traceId: openTrace.traceId,
		};
	}
	if (openTrace.status === "needs_implementation") {
		return {
			action: "implement",
			reason: `Trace ${openTrace.traceId} needs implementation evidence.`,
			traceId: openTrace.traceId,
		};
	}
	if (openTrace.status === "finished") {
		return {
			action: "archive",
			reason: `Trace ${openTrace.traceId} is ready for trace close.`,
			traceId: openTrace.traceId,
			tool: "wiki_archive",
		};
	}
	return {
		action: "wait",
		reason: `Trace ${openTrace.traceId} status is ${openTrace.status}.`,
		traceId: openTrace.traceId,
	};
}

function selectedTraceNextAction(
	traceId: string,
	status: StatusView,
	resume: ResumeView | undefined,
): WikiStateNextAction {
	if (status.closed)
		return { action: "wait", reason: "Trace is closed.", traceId };
	if (status.blockers[0]) {
		return { action: "wait", reason: status.blockers[0], traceId };
	}
	if (status.currentLoop === "decision") {
		return {
			action: "decide",
			reason: resume?.nextAction || "Create or approve proposed changes.",
			traceId,
		};
	}
	if (status.currentLoop === "planning") {
		return {
			action: "plan",
			reason: resume?.nextAction || "Plan approved decisions.",
			traceId,
		};
	}
	if (status.currentLoop === "implementation") {
		return {
			action: "implement",
			reason: resume?.nextAction || "Implement planned work units.",
			traceId,
			...(resume?.activeWorkUnitId
				? { workUnitId: resume.activeWorkUnitId }
				: {}),
		};
	}
	if (status.readyForClosure || status.goalStatus === "finished") {
		return {
			action: "archive",
			reason: resume?.nextAction || "Close trace with archive checks.",
			traceId,
			tool: "wiki_archive",
		};
	}
	return {
		action: "wait",
		reason: resume?.nextAction || "No semantic loop action pending.",
		traceId,
	};
}

function selectTraceId(
	traceIds: string[],
	requestedTraceId?: string,
): string | undefined {
	if (requestedTraceId) {
		if (!traceIds.includes(requestedTraceId)) {
			throw createCodewikiOperationError({
				operation: "wiki_state",
				code: "invalid_input",
				field: "traceId",
				message: `Unknown trace id: ${requestedTraceId}`,
				data: { requestedTraceId, traceIds },
			});
		}
		return requestedTraceId;
	}
	return traceIds.length === 1 ? traceIds[0] : undefined;
}
