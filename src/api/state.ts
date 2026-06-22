import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import {
	buildTriggersView,
	buildBlockersView,
	buildConflictsView,
	buildQualityView,
	buildResumeView,
	buildStatusView,
	buildTraceBoardView,
	buildWorkPlanView,
	buildWorkQueueView,
} from "./views.ts";
import {
	buildRuntimeBoard,
	type RuntimeBoard,
	type RuntimeBoardRuntimePreview,
} from "../views/runtime-board.ts";
import { foldProjectTraceRecords } from "../traces/project.ts";
import type { TraceRecord } from "../traces/types.ts";
import type {
	TriggersView,
	BlockersView,
	ConflictsView,
	QualityView,
	ResumeView,
	StatusView,
	TraceBoardView,
	WorkPlanView,
	WorkQueueView,
} from "../views/types.ts";

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

export type WikiStateNextActionTool =
	| "wiki_decide"
	| "wiki_plan"
	| "wiki_implement"
	| "wiki_archive";

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
	runtimeMaxWorkers?: number;
	runtimeResultPreview?: RuntimeBoardRuntimePreview;
}

export interface WikiStateSnapshot {
	generatedAt?: string;
	traceIds: string[];
	selectedTraceId?: string;
	status?: StatusView;
	resume?: ResumeView;
	workPlan?: WorkPlanView;
	workQueue: WorkQueueView;
	traceBoard: TraceBoardView;
	triggers: TriggersView;
	runtimeBoard: RuntimeBoard;
	append?: WikiStateAppendHandles;
	next: WikiStateNextAction;
	blockers?: BlockersView;
	conflicts?: ConflictsView;
	quality?: QualityView;
}

export function buildWikiState(input: WikiStateInput): WikiStateSnapshot {
	const fold = foldProjectTraceRecords(input.records);
	const selectedTraceId = selectTraceId(fold.traceIds, input.traceId);
	const selectedRecords = selectedTraceId
		? fold.recordsByTrace[selectedTraceId]
		: undefined;
	const traceViewInput = selectedRecords
		? { records: selectedRecords, generatedAt: input.generatedAt }
		: undefined;
	const projectViewInput = {
		records: input.records,
		generatedAt: input.generatedAt,
	};
	const workQueue = buildWorkQueueView(projectViewInput);
	const traceBoard = buildTraceBoardView(projectViewInput);
	const triggers = buildTriggersView(projectViewInput);
	const status = traceViewInput ? buildStatusView(traceViewInput) : undefined;
	const resume = traceViewInput ? buildResumeView(traceViewInput) : undefined;
	const workPlan = traceViewInput
		? buildWorkPlanView(traceViewInput)
		: undefined;
	const blockers = traceViewInput
		? buildBlockersView(traceViewInput)
		: undefined;
	const conflicts = traceViewInput
		? buildConflictsView(traceViewInput)
		: undefined;
	const quality = traceViewInput ? buildQualityView(traceViewInput) : undefined;
	return {
		generatedAt: input.generatedAt,
		traceIds: fold.traceIds,
		...(selectedTraceId ? { selectedTraceId } : {}),
		...(status ? { status } : {}),
		...(resume ? { resume } : {}),
		...(workPlan ? { workPlan } : {}),
		...(blockers ? { blockers } : {}),
		...(conflicts ? { conflicts } : {}),
		...(quality ? { quality } : {}),
		workQueue,
		traceBoard,
		triggers,
		runtimeBoard: buildRuntimeBoard({
			generatedAt: input.generatedAt,
			traceBoard,
			workQueue,
			triggers,
			maxWorkers: input.runtimeMaxWorkers,
			runtimeResultPreview: input.runtimeResultPreview,
		}),
		...appendHandles(
			openTraceIds(traceBoard),
			input.records,
			input.expectedBytesByTrace,
		),
		next: nextStateAction({
			selectedTraceId,
			status,
			resume,
			traceBoard,
		}),
	};
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
			tool: "wiki_decide",
		};
	}
	if (openTrace.status === "needs_planning") {
		return {
			action: "plan",
			reason: `Trace ${openTrace.traceId} needs planning coverage.`,
			traceId: openTrace.traceId,
			tool: "wiki_plan",
		};
	}
	if (openTrace.status === "needs_implementation") {
		return {
			action: "implement",
			reason: `Trace ${openTrace.traceId} needs implementation evidence.`,
			traceId: openTrace.traceId,
			tool: "wiki_implement",
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
			reason: resume?.nextAction || "Create or approve decision rows.",
			traceId,
			tool: "wiki_decide",
		};
	}
	if (status.currentLoop === "planning") {
		return {
			action: "plan",
			reason: resume?.nextAction || "Plan approved decisions.",
			traceId,
			tool: "wiki_plan",
		};
	}
	if (status.currentLoop === "implementation") {
		return {
			action: "implement",
			reason: resume?.nextAction || "Implement planned work units.",
			traceId,
			tool: "wiki_implement",
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
			throw createCodewikiApiError({
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
