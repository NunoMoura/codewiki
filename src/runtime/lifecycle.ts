import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
	hostErrorData,
	type CodewikiHostError,
	type CodewikiHostRole,
} from "../error-handling/host-errors.ts";
import {
	CodewikiTraceError,
	TraceAppendConflictError,
} from "../error-handling/trace-errors.ts";
import { applyDevLogRetention } from "./persistence/dev-log.ts";
import {
	appendRuntimeTraceRecords,
	type AppendTraceBatchResult,
} from "./persistence/trace.ts";
import { normalizeTraceRefs } from "../traces/refs.ts";
import { traceFilePath } from "../traces/schema.ts";
import type { TraceEvent, TraceLoop } from "../traces/types.ts";
import type {
	StatusView,
	TraceBoardConflict,
	TraceBoardView,
	TraceGoalStatus,
	TraceGoalView,
	WorkQueueItem,
	WorkQueueView,
} from "../views/types.ts";

export type RuntimeLifecycleState = "active" | "blocked" | "closed";
export type RuntimeHostRole = CodewikiHostRole;
export type RuntimeHostLifecycleEventName =
	| "runtime.host.started"
	| "runtime.host.observed"
	| "runtime.host.blocked"
	| "runtime.host.completed"
	| "runtime.host.stopped";
export type RuntimeHostActionKind =
	| "sleep"
	| "start_trace_host"
	| "run_decision"
	| "run_planning"
	| "run_implementation"
	| "start_workers"
	| "watch_workers"
	| "close_trace"
	| "report_blocker"
	| "recover_host_error"
	| "stop";

export interface RuntimeHostAction {
	kind: RuntimeHostActionKind;
	message: string;
	traceId?: string;
	targetLoop?: TraceLoop;
	refs: string[];
	blocked?: boolean;
}

export interface RuntimeHostLifecyclePlan {
	role: RuntimeHostRole;
	state: RuntimeLifecycleState;
	traceId?: string;
	actions: RuntimeHostAction[];
	blockers: string[];
	refs: string[];
	hostError?: CodewikiHostError;
}

export interface MainHostLifecycleInput {
	traceBoard: TraceBoardView;
	workQueue?: WorkQueueView;
	maxTraceHosts?: number;
	activeTraceHosts?: string[];
	hostError?: CodewikiHostError;
}

export interface TraceHostLifecycleInput {
	status: StatusView;
	workQueue?: WorkQueueView;
	hostError?: CodewikiHostError;
}

export type RuntimeHostLifecycleInput =
	| ({ role: "main" } & MainHostLifecycleInput)
	| ({ role: "trace" } & TraceHostLifecycleInput);

export interface RuntimeHostLifecycleEventInput {
	traceId: string;
	sequence: number;
	createdAt: string;
	role: RuntimeHostRole;
	state: RuntimeLifecycleState;
	event?: RuntimeHostLifecycleEventName;
	id?: string;
	parentId?: string | null;
	actions?: RuntimeHostAction[];
	blockers?: string[];
	refs?: string[];
	hostError?: CodewikiHostError;
	data?: Record<string, unknown>;
}

export interface RuntimeHostLifecycleEventOptions {
	createdAt: string;
	nextSequenceByTrace: Record<string, number>;
	event?: RuntimeHostLifecycleEventName;
	idPrefix?: string;
	parentIdByTrace?: Record<string, string | null>;
}

export interface RuntimeHostLifecycleBatch {
	events: TraceEvent[];
	nextSequenceByTrace: Record<string, number>;
}

export interface RuntimeHostLifecycleAppendOptions {
	repoRoot: string;
	expectedBytesByTrace: Record<string, number>;
}

export interface RuntimeHostLifecycleAppendResult {
	events: TraceEvent[];
	results: AppendTraceBatchResult[];
	nextBytesByTrace: Record<string, number>;
}

export function planRuntimeHostLifecycle(
	input: RuntimeHostLifecycleInput,
): RuntimeHostLifecyclePlan {
	if (input.role === "main") return planMainHostLifecycle(input);
	return planTraceHostLifecycle(input);
}

export function planMainHostLifecycle(
	input: MainHostLifecycleInput,
): RuntimeHostLifecyclePlan {
	if (input.hostError) return hostErrorLifecyclePlan("main", input.hostError);
	if (input.traceBoard.conflicts.length > 0) {
		return blockedMainHostPlan(input.traceBoard.conflicts);
	}
	const active = new Set(input.activeTraceHosts || []);
	const capacity = Math.max(0, (input.maxTraceHosts ?? 1) - active.size);
	const candidates = input.traceBoard.traces.filter((trace) =>
		mainHostShouldStartTrace(trace, active),
	);
	const actions = candidates.slice(0, capacity).map(startTraceHostAction);
	const held = candidates
		.slice(capacity)
		.map((trace) =>
			reportBlockerAction(
				`Trace host capacity is full; ${trace.traceId} waits for a trace host.`,
				trace.traceId,
				traceGoalRefs(trace),
			),
		);
	const blockers = held.map((action) => action.message);
	if (actions.length === 0 && held.length === 0) {
		return lifecyclePlan({
			role: "main",
			state: "active",
			actions: [sleepAction("No trace host work is currently actionable.")],
		});
	}
	return lifecyclePlan({
		role: "main",
		state: blockers.length > 0 && actions.length === 0 ? "blocked" : "active",
		actions: [...actions, ...held],
		blockers,
	});
}

export function planTraceHostLifecycle(
	input: TraceHostLifecycleInput,
): RuntimeHostLifecyclePlan {
	const traceId = requiredTraceId(input.status.traceId);
	if (input.hostError) return hostErrorLifecyclePlan("trace", input.hostError);
	if (input.status.closed) return closedTraceHostPlan(input.status, traceId);
	const blockers = [...input.status.blockers, ...input.status.qualityBlockers];
	if (blockers.length > 0) {
		return lifecyclePlan({
			role: "trace",
			traceId,
			state: "blocked",
			actions: [
				reportBlockerAction(
					`Trace ${traceId} is blocked: ${blockers.join(" ")}`,
					traceId,
					statusRefs(input.status),
				),
			],
			blockers,
		});
	}
	if (input.status.currentLoop) {
		return lifecyclePlan({
			role: "trace",
			traceId,
			state: "active",
			actions: [runLoopAction(traceId, input.status.currentLoop, input.status)],
		});
	}
	if (input.status.readyForClosure || input.status.goalStatus === "finished") {
		return lifecyclePlan({
			role: "trace",
			traceId,
			state: "active",
			actions: [
				{
					kind: "close_trace",
					message: `Trace ${traceId} is ready for archive close.`,
					traceId,
					refs: statusRefs(input.status),
				},
			],
		});
	}
	const queueItems = traceQueueItems(traceId, input.workQueue);
	const queuedAction = queueLifecycleAction(traceId, queueItems, input.status);
	return lifecyclePlan({
		role: "trace",
		traceId,
		state: queuedAction.blocked ? "blocked" : "active",
		actions: [queuedAction],
		blockers: queuedAction.blocked ? [queuedAction.message] : [],
	});
}

export function createRuntimeHostLifecycleEvent(
	input: RuntimeHostLifecycleEventInput,
): TraceEvent {
	const event = input.event || lifecycleEventName(input.state);
	const actions = input.actions || [];
	const hostError = input.hostError;
	return {
		type: "trace_event",
		id:
			input.id ||
			`${input.traceId}:runtime:host:${input.role}:${event.split(".").at(-1)}:${input.sequence}`,
		parentId: input.parentId ?? null,
		traceId: input.traceId,
		sequence: input.sequence,
		event,
		refs: lifecycleRefs(input, actions, hostError),
		createdAt: input.createdAt,
		data: {
			role: input.role,
			state: input.state,
			...(actions.length ? { actions: actions.map(actionData) } : {}),
			...(input.blockers?.length ? { blockers: [...input.blockers] } : {}),
			...(hostError ? { hostError: hostErrorData(hostError) } : {}),
			...(input.data || {}),
		},
	};
}

export function createRuntimeHostLifecycleEvents(
	plans: RuntimeHostLifecyclePlan[],
	options: RuntimeHostLifecycleEventOptions,
): RuntimeHostLifecycleBatch {
	const nextSequenceByTrace = { ...options.nextSequenceByTrace };
	const events = plans.flatMap((plan) => {
		const traceIds = traceIdsForPlan(plan);
		return traceIds.map((traceId) => {
			const sequence = nextTraceSequence(nextSequenceByTrace, traceId);
			return createRuntimeHostLifecycleEvent({
				traceId,
				sequence,
				createdAt: options.createdAt,
				role: plan.role,
				state: plan.state,
				event: options.event,
				id: lifecycleEventId(traceId, plan.role, sequence, options),
				parentId: options.parentIdByTrace?.[traceId] ?? null,
				actions: plan.actions.filter(
					(action) => !action.traceId || action.traceId === traceId,
				),
				blockers: plan.blockers,
				refs: plan.refs,
				hostError: plan.hostError,
			});
		});
	});
	return { events, nextSequenceByTrace };
}

export async function appendRuntimeHostLifecycleEvents(
	batch: RuntimeHostLifecycleBatch,
	options: RuntimeHostLifecycleAppendOptions,
): Promise<RuntimeHostLifecycleAppendResult> {
	const groups = eventsByTrace(batch.events);
	await Promise.all(
		groups.map((group) => assertExpectedTraceBytes(group, options)),
	);
	const results: AppendTraceBatchResult[] = [];
	for (const group of groups) {
		results.push(
			await appendRuntimeTraceRecords(
				options.repoRoot,
				group.events,
				expectedBytesForTrace(group.traceId, options),
			),
		);
	}
	await Promise.all(
		batch.events
			.filter(
				(event) =>
					event.data?.role === "trace" && event.data?.state === "closed",
			)
			.map((event) =>
				applyDevLogRetention(options.repoRoot, event.traceId, "completed"),
			),
	);
	return {
		events: [...batch.events],
		results,
		nextBytesByTrace: Object.fromEntries(
			results.map((result) => [result.records[0].traceId, result.nextBytes]),
		),
	};
}

function blockedMainHostPlan(
	conflicts: TraceBoardConflict[],
): RuntimeHostLifecyclePlan {
	const messages = conflicts.map((conflict) => conflict.message);
	return lifecyclePlan({
		role: "main",
		state: "blocked",
		actions: conflicts.map((conflict) =>
			reportBlockerAction(conflict.message, conflict.leftTraceId, [
				conflict.leftTraceId,
				conflict.rightTraceId,
				conflict.pathScope,
			]),
		),
		blockers: messages,
	});
}

function closedTraceHostPlan(
	status: StatusView,
	traceId: string,
): RuntimeHostLifecyclePlan {
	if (status.goalStatus === "closed_incomplete") {
		return lifecyclePlan({
			role: "trace",
			traceId,
			state: "blocked",
			actions: [
				reportBlockerAction(
					`Trace ${traceId} is closed but its goal is incomplete.`,
					traceId,
					statusRefs(status),
				),
			],
			blockers: [`Trace ${traceId} is closed but its goal is incomplete.`],
		});
	}
	return lifecyclePlan({
		role: "trace",
		traceId,
		state: "closed",
		actions: [
			{
				kind: "stop",
				message: `Trace ${traceId} is closed; trace host can stop.`,
				traceId,
				refs: statusRefs(status),
			},
		],
	});
}

function hostErrorLifecyclePlan(
	role: RuntimeHostRole,
	hostError: CodewikiHostError,
): RuntimeHostLifecyclePlan {
	const action: RuntimeHostAction = {
		kind: "recover_host_error",
		message: hostError.message,
		...(hostError.traceId ? { traceId: hostError.traceId } : {}),
		refs: [...hostError.refs],
		blocked: !hostError.retryable,
	};
	return lifecyclePlan({
		role,
		...(hostError.traceId ? { traceId: hostError.traceId } : {}),
		state: action.blocked ? "blocked" : "active",
		actions: [action],
		blockers: action.blocked ? [hostError.message] : [],
		hostError,
	});
}

function mainHostShouldStartTrace(
	trace: TraceGoalView,
	activeTraceHosts: Set<string>,
): boolean {
	return (
		!activeTraceHosts.has(trace.traceId) &&
		["needs_planning", "needs_implementation", "finished"].includes(
			trace.status,
		)
	);
}

function startTraceHostAction(trace: TraceGoalView): RuntimeHostAction {
	return {
		kind: "start_trace_host",
		message: `Start trace host for ${trace.traceId}: ${traceGoalActionReason(trace.status)}.`,
		traceId: trace.traceId,
		targetLoop: targetLoopForTraceGoal(trace.status),
		refs: traceGoalRefs(trace),
	};
}

function traceGoalActionReason(status: TraceGoalStatus): string {
	if (status === "needs_decision") return "decision needed";
	if (status === "needs_planning") return "planning needed";
	if (status === "needs_implementation") return "implementation needed";
	if (status === "finished") return "trace close needed";
	return status;
}

function targetLoopForTraceGoal(
	status: TraceGoalStatus,
): TraceLoop | undefined {
	if (status === "needs_decision") return "decision";
	if (status === "needs_planning") return "planning";
	if (status === "needs_implementation") return "implementation";
	return undefined;
}

function runLoopAction(
	traceId: string,
	loop: TraceLoop,
	status: StatusView,
): RuntimeHostAction {
	return {
		kind: `run_${loop}` as RuntimeHostActionKind,
		message: `Run ${loop} loop for ${traceId}.`,
		traceId,
		targetLoop: loop,
		refs: statusRefs(status),
	};
}

function queueLifecycleAction(
	traceId: string,
	items: WorkQueueItem[],
	status: StatusView,
): RuntimeHostAction {
	if (items.some((item) => item.status === "ready")) {
		return {
			kind: "start_workers",
			message: `Trace ${traceId} has ready work units.`,
			traceId,
			targetLoop: "implementation",
			refs: queueRefs(items, status),
		};
	}
	if (items.some((item) => item.status === "claimed")) {
		return {
			kind: "watch_workers",
			message: `Trace ${traceId} has claimed worker work to watch.`,
			traceId,
			targetLoop: "implementation",
			refs: queueRefs(items, status),
		};
	}
	const blockedItems = items.filter((item) => item.status === "blocked");
	if (blockedItems.length > 0) {
		return reportBlockerAction(
			`Trace ${traceId} has blocked work units: ${blockedItems.map((item) => item.id).join(", ")}.`,
			traceId,
			queueRefs(blockedItems, status),
		);
	}
	return sleepAction(
		`Trace ${traceId} has no actionable runtime work.`,
		traceId,
	);
}

function traceQueueItems(
	traceId: string,
	workQueue: WorkQueueView | undefined,
): WorkQueueItem[] {
	return (workQueue?.items || []).filter((item) => item.traceId === traceId);
}

function reportBlockerAction(
	message: string,
	traceId: string | undefined,
	refs: string[],
): RuntimeHostAction {
	return {
		kind: "report_blocker",
		message,
		...(traceId ? { traceId } : {}),
		refs: normalizeTraceRefs(refs),
		blocked: true,
	};
}

function sleepAction(message: string, traceId?: string): RuntimeHostAction {
	return {
		kind: "sleep",
		message,
		...(traceId ? { traceId } : {}),
		refs: traceId ? [traceId] : [],
	};
}

function lifecyclePlan(input: {
	role: RuntimeHostRole;
	state: RuntimeLifecycleState;
	traceId?: string;
	actions: RuntimeHostAction[];
	blockers?: string[];
	hostError?: CodewikiHostError;
}): RuntimeHostLifecyclePlan {
	const refs = normalizeTraceRefs([
		input.traceId || "",
		...input.actions.flatMap((action) => action.refs),
		...(input.hostError?.refs || []),
	]);
	return {
		role: input.role,
		state: input.state,
		...(input.traceId ? { traceId: input.traceId } : {}),
		actions: input.actions,
		blockers: [...(input.blockers || [])],
		refs,
		...(input.hostError ? { hostError: input.hostError } : {}),
	};
}

function statusRefs(status: StatusView): string[] {
	return normalizeTraceRefs([status.traceId || "", ...status.sourceRefs]);
}

function traceGoalRefs(trace: TraceGoalView): string[] {
	return normalizeTraceRefs([
		trace.traceId,
		...trace.changeRefs,
		...trace.plannedChangeRefs,
		...trace.workUnitRefs,
		...trace.pathScopes,
		...(trace.lastEventId ? [trace.lastEventId] : []),
	]);
}

function queueRefs(items: WorkQueueItem[], status: StatusView): string[] {
	return normalizeTraceRefs([
		...statusRefs(status),
		...items.flatMap((item) => [
			item.id,
			item.sourceEventId || "",
			...item.traceRefs,
			...item.planningRefs,
			...item.pathScopes,
		]),
	]);
}

function lifecycleEventName(
	state: RuntimeLifecycleState,
): RuntimeHostLifecycleEventName {
	if (state === "blocked") return "runtime.host.blocked";
	if (state === "closed") return "runtime.host.stopped";
	return "runtime.host.observed";
}

function lifecycleRefs(
	input: RuntimeHostLifecycleEventInput,
	actions: RuntimeHostAction[],
	hostError: CodewikiHostError | undefined,
): string[] {
	return normalizeTraceRefs([
		input.traceId,
		...(input.refs || []),
		...actions.flatMap((action) => action.refs),
		...(hostError?.refs || []),
	]);
}

function actionData(action: RuntimeHostAction): Record<string, unknown> {
	return {
		kind: action.kind,
		message: action.message,
		refs: [...action.refs],
		...(action.traceId ? { traceId: action.traceId } : {}),
		...(action.targetLoop ? { targetLoop: action.targetLoop } : {}),
		...(action.blocked ? { blocked: true } : {}),
	};
}

function traceIdsForPlan(plan: RuntimeHostLifecyclePlan): string[] {
	return normalizeTraceRefs([
		...(plan.traceId ? [plan.traceId] : []),
		...plan.actions.map((action) => action.traceId || ""),
	]).filter((ref) => ref.startsWith("TRACE-"));
}

function lifecycleEventId(
	traceId: string,
	role: RuntimeHostRole,
	sequence: number,
	options: RuntimeHostLifecycleEventOptions,
): string {
	return `${options.idPrefix || `${traceId}:runtime:host`}:${role}:${sequence}`;
}

interface RuntimeLifecycleEventGroup {
	traceId: string;
	events: TraceEvent[];
}

function eventsByTrace(events: TraceEvent[]): RuntimeLifecycleEventGroup[] {
	const groups = new Map<string, TraceEvent[]>();
	for (const event of events) {
		groups.set(event.traceId, [...(groups.get(event.traceId) || []), event]);
	}
	return [...groups.entries()].map(([traceId, traceEvents]) => ({
		traceId,
		events: traceEvents,
	}));
}

async function assertExpectedTraceBytes(
	group: RuntimeLifecycleEventGroup,
	options: RuntimeHostLifecycleAppendOptions,
): Promise<void> {
	const expectedBytes = expectedBytesForTrace(group.traceId, options);
	const path = resolve(options.repoRoot, traceFilePath(group.traceId));
	const actualBytes = await traceBytes(path);
	if (actualBytes !== expectedBytes) {
		throw new TraceAppendConflictError(path, expectedBytes, actualBytes);
	}
}

function expectedBytesForTrace(
	traceId: string,
	options: RuntimeHostLifecycleAppendOptions,
): number {
	const expected = options.expectedBytesByTrace[traceId];
	if (!Number.isInteger(expected) || expected < 0) {
		throw new CodewikiTraceError({
			code: "append_conflict",
			message: `Missing expected trace bytes for ${traceId}.`,
			traceId,
			data: { expected },
		});
	}
	return expected;
}

async function traceBytes(path: string): Promise<number> {
	try {
		return (await stat(path)).size;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return 0;
		throw error;
	}
}

function nextTraceSequence(
	nextSequenceByTrace: Record<string, number>,
	traceId: string,
): number {
	const sequence = nextSequenceByTrace[traceId];
	if (!Number.isInteger(sequence) || sequence < 1) {
		throw new Error(`Missing next trace sequence for ${traceId}.`);
	}
	nextSequenceByTrace[traceId] = sequence + 1;
	return sequence;
}

function requiredTraceId(traceId: string | undefined): string {
	if (!traceId)
		throw new Error("Trace host lifecycle requires status.traceId.");
	return traceId;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
