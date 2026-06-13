import { normalizeTraceRefs } from "./refs.ts";
import type {
	ExitDetails,
	ExitRoute,
	LoopIterationData,
	LoopIterationExit,
	LoopIterationProgress,
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
		event: `${input.loop}.iteration`,
		refs: normalizeTraceRefs(input.refs),
		createdAt: input.createdAt,
		data: {
			...data,
			...(input.data || {}),
		},
	};
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
		targetLoop: currentLoopForRoute(exit.route),
		nextAction: exit.remediation[0]?.action || nextActionForRoute(exit.route),
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
		...(exit.targetLoop === undefined ? {} : { targetLoop: exit.targetLoop }),
		...(exit.nextAction ? { nextAction: exit.nextAction } : {}),
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
