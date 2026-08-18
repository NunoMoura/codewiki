import { normalizeTraceRefs } from "./refs.ts";
import type {
	DecisionTraceEventName,
	ExitDetails,
	ExitRoute,
	ImplementationTraceEventName,
	LoopIterationData,
	LoopIterationExit,
	LoopIterationProgress,
	LoopRoutePlan,
	PlanningTraceEventName,
	SemanticTraceEventName,
	TailCheckpoint,
	TraceEvent,
	TraceLoop,
} from "./types.ts";

export interface CreateLoopTailCheckpointInput {
	traceId: string;
	loop: TraceLoop;
	id: string;
	parentId: string;
	firstKeptRecordId: string;
	createdAt: string;
	exit: ExitDetails;
	sourceRefs: string[];
	summary?: string;
	data?: Record<string, unknown>;
}

export interface CreateLoopIterationEventInput {
	traceId: string;
	loop: TraceLoop;
	id: string;
	parentId: string | null;
	sequence: number;
	refs: string[];
	createdAt: string;
	iteration: number;
	trigger: string;
	output: Record<string, unknown>;
	exit: LoopIterationExit;
	progress?: Partial<LoopIterationProgress>;
	data?: Record<string, unknown>;
}

export const SEMANTIC_TRACE_EVENT_NAMES = {
	decision: [
		"change_received",
		"change_revised",
		"change_approved",
		"change_deferred",
		"change_rejected",
		"change_withdrawn",
		"user_input_required",
		"decision_blocked",
	],
	planning: [
		"change_planned",
		"change_replanned",
		"change_resolved",
		"work_units_created",
		"decisions_resolved",
		"route_back_requested",
		"planning_blocked",
	],
	implementation: [
		"evidence_accepted",
		"evidence_rejected",
		"route_back_requested",
		"implementation_blocked",
	],
} as const satisfies Record<TraceLoop, readonly SemanticTraceEventName[]>;

export function createLoopIterationEvent(
	input: CreateLoopIterationEventInput,
): TraceEvent {
	const data: LoopIterationData = {
		iteration: input.iteration,
		trigger: input.trigger,
		output: input.output,
		exit: normalizeLoopIterationExit(input.exit),
		progress: normalizeLoopIterationProgress(input.progress || {}),
	};
	return {
		type: "trace_event",
		id: input.id,
		parentId: input.parentId,
		traceId: input.traceId,
		sequence: input.sequence,
		loop: input.loop,
		event: loopIterationEventName(input.loop, data.exit, data.output),
		refs: normalizeTraceRefs(input.refs),
		createdAt: input.createdAt,
		data: {
			...data,
			...(input.data || {}),
		},
	};
}

export function isSemanticEventName(
	loop: TraceLoop,
	eventName: string,
): boolean {
	return (SEMANTIC_TRACE_EVENT_NAMES[loop] as readonly string[]).includes(
		eventName,
	);
}

function loopIterationEventName(
	loop: TraceLoop,
	exit: LoopIterationExit,
	output: Record<string, unknown>,
): SemanticTraceEventName {
	if (loop === "decision") return decisionEventName(exit);
	if (loop === "planning") return planningEventName(exit, output);
	return implementationEventName(exit);
}

function decisionEventName(exit: LoopIterationExit): DecisionTraceEventName {
	if (exit.status === "exit") return "change_approved";
	if (exit.targetLoop === null || exit.status === "blocked") {
		return "user_input_required";
	}
	return "decision_blocked";
}

function planningEventName(
	exit: LoopIterationExit,
	output: Record<string, unknown>,
): PlanningTraceEventName {
	if (exit.status === "exit") {
		return objectList(output.workUnits).length > 0
			? "work_units_created"
			: "decisions_resolved";
	}
	if (exit.status === "route_back" || exit.targetLoop === "decision") {
		return "route_back_requested";
	}
	return "planning_blocked";
}

function implementationEventName(
	exit: LoopIterationExit,
): ImplementationTraceEventName {
	if (exit.status === "exit") return "evidence_accepted";
	if (exit.status === "route_back" || exit.targetLoop === "planning") {
		return "route_back_requested";
	}
	if (exit.status === "continue") return "evidence_rejected";
	return "implementation_blocked";
}

export function createLoopTailCheckpoint(
	input: CreateLoopTailCheckpointInput,
): TailCheckpoint {
	const nextAction =
		input.exit.remediation[0]?.action || nextActionForRoute(input.exit.route);
	return {
		type: "tail_checkpoint",
		id: input.id,
		parentId: input.parentId,
		traceId: input.traceId,
		firstKeptRecordId: input.firstKeptRecordId,
		summary:
			input.summary ||
			`${input.loop} exit ${input.exit.verdict}; route ${input.exit.route}.`,
		createdAt: input.createdAt,
		data: {
			currentLoop: currentLoopForRoute(input.exit.route),
			lastExitVerdict: input.exit.verdict,
			nextAction,
			blockers: input.exit.findings.map((finding) => finding.id),
			sourceRefs: normalizeTraceRefs(input.sourceRefs),
			recoveryCursor: input.parentId,
			route: input.exit.route,
			...(input.exit.qualityGraph
				? { qualityGraph: input.exit.qualityGraph }
				: {}),
			...(input.exit.qualityRunner
				? { qualityRunner: input.exit.qualityRunner }
				: {}),
			...(input.exit.routePlan
				? { routePlan: normalizeRoutePlan(input.exit.routePlan) }
				: {}),
			...(input.data || {}),
		},
	};
}

export function loopExitFromEvaluation(
	loop: TraceLoop,
	exit: ExitDetails,
): LoopIterationExit {
	return {
		status: loopExitStatusFromEvaluation(loop, exit),
		conditions: exit.criteria.map((criterion) => ({
			id: criterion.id,
			status: loopConditionStatus(criterion.status),
			...(criterion.message ? { message: criterion.message } : {}),
			...(criterion.refs ? { refs: criterion.refs } : {}),
		})),
		...(exit.qualityGraph ? { qualityGraph: exit.qualityGraph } : {}),
		...(exit.diagnostics ? { diagnostics: exit.diagnostics } : {}),
		...(exit.qualityRunner ? { qualityRunner: exit.qualityRunner } : {}),
		targetLoop: currentLoopForRoute(exit.route),
		nextAction: exit.remediation[0]?.action || nextActionForRoute(exit.route),
		...(exit.routePlan
			? { routePlan: normalizeRoutePlan(exit.routePlan) }
			: {}),
	};
}

export function loopProgressFromEvaluation(
	exit: ExitDetails,
	changedRefs: string[],
): LoopIterationProgress {
	return {
		changedRefs,
		newlyMetConditions: exit.criteria
			.filter((criterion) => criterion.status === "pass")
			.map((criterion) => criterion.id),
		repeatedFailures: [],
		nextSafeAction:
			exit.remediation[0]?.action || nextActionForRoute(exit.route),
	};
}

function loopExitStatusFromEvaluation(
	loop: TraceLoop,
	exit: ExitDetails,
): LoopIterationExit["status"] {
	if (exit.verdict === "block") return "blocked";
	if (exit.verdict === "pass") return "exit";
	const targetLoop = currentLoopForRoute(exit.route);
	if (targetLoop && loopOrder(targetLoop) < loopOrder(loop))
		return "route_back";
	return "continue";
}

function loopConditionStatus(
	status: ExitDetails["criteria"][number]["status"],
): LoopIterationExit["conditions"][number]["status"] {
	if (status === "pass") return "met";
	if (status === "block") return "blocked";
	return "unmet";
}

function loopOrder(loop: TraceLoop): number {
	if (loop === "decision") return 0;
	if (loop === "planning") return 1;
	return 2;
}

function normalizeLoopIterationExit(
	exit: LoopIterationExit,
): LoopIterationExit {
	return {
		status: exit.status,
		conditions: exit.conditions.map((condition) => ({
			...condition,
			...(condition.refs ? { refs: normalizeTraceRefs(condition.refs) } : {}),
		})),
		...(exit.qualityGraph ? { qualityGraph: exit.qualityGraph } : {}),
		...(exit.diagnostics ? { diagnostics: exit.diagnostics } : {}),
		...(exit.qualityRunner ? { qualityRunner: exit.qualityRunner } : {}),
		...(exit.targetLoop === undefined ? {} : { targetLoop: exit.targetLoop }),
		...(exit.nextAction ? { nextAction: exit.nextAction } : {}),
		...(exit.routePlan
			? { routePlan: normalizeRoutePlan(exit.routePlan) }
			: {}),
	};
}

function normalizeRoutePlan(routePlan: LoopRoutePlan): LoopRoutePlan {
	return {
		target: routePlan.target,
		kind: routePlan.kind,
		rationale: routePlan.rationale,
		...(routePlan.implementationMode
			? { implementationMode: routePlan.implementationMode }
			: {}),
		...(routePlan.refs ? { refs: normalizeTraceRefs(routePlan.refs) } : {}),
	};
}

function normalizeLoopIterationProgress(
	progress: Partial<LoopIterationProgress>,
): LoopIterationProgress {
	return {
		changedRefs: normalizeTraceRefs(progress.changedRefs || []),
		newlyMetConditions: [...(progress.newlyMetConditions || [])],
		repeatedFailures: [...(progress.repeatedFailures || [])],
		...(progress.unchangedStateDigests
			? { unchangedStateDigests: [...progress.unchangedStateDigests] }
			: {}),
		...(progress.budgetSpent === undefined
			? {}
			: { budgetSpent: progress.budgetSpent }),
		...(progress.nextSafeAction
			? { nextSafeAction: progress.nextSafeAction }
			: {}),
	};
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
		: [];
}

function currentLoopForRoute(route: ExitRoute): TraceLoop | null {
	return isTraceLoop(route) ? route : null;
}

function isTraceLoop(route: ExitRoute): route is TraceLoop {
	return (
		route === "decision" || route === "planning" || route === "implementation"
	);
}

function nextActionForRoute(route: ExitRoute): string {
	if (route === "planning") return "Start planning from passed decision facts.";
	if (route === "implementation") return "Implement passed planning work.";
	if (route === "decision")
		return "Repair decision evidence and rerun decision exit.";
	if (route === "close")
		return "Close trace or publish implementation evidence.";
	if (route === "user") return "Ask user for approval or clarification.";
	return "Observe until blocked condition changes.";
}
