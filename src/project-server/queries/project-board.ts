import type { TraceEvent } from "../../changes/trace/types.ts";
import type {
	TraceBoardConflict,
	TraceBoardView,
	WorkQueueItem,
	WorkQueueView,
} from "../../work-state/projection-types.ts";
import type {TriggerView, TriggersView} from "./projection-types.ts";
import type {
	HeartbeatCycleResult,
	ProjectServerHeartbeatCyclePolicyDecision,
} from "../coordinator/index.ts";
import type { ProjectServerLeaseExpirationBatch } from "../claims/leases.ts";
import type {
	ProjectServerLeaseExpirationPolicyDecision,
	ProjectServerWorkUnitClaimPolicyDecision,
} from "../claims/policy.ts";
import {
	selectProjectServerWorkUnitClaims,
	type ProjectServerHeldWorkUnitClaim,
	type ProjectServerWorkUnitClaimCandidate,
	type ProjectServerWorkUnitClaimSelection,
} from "../claims/work-unit-selection.ts";

export type ProjectServerBoardBlockerKind =
	| "trace_conflict"
	| "work_unit_blocked"
	| "work_unit_quality"
	| "runtime_policy"
	| "heartbeat_policy"
	| "lease_policy"
	| "trigger_run_skip"
	| "trigger_run_blocked";

export interface ProjectServerBoardRunPreview {
	plan?: ProjectServerWorkUnitClaimSelection;
	policy?: ProjectServerWorkUnitClaimPolicyDecision;
	heartbeatPolicy?: ProjectServerHeartbeatCyclePolicyDecision;
	heartbeatCycle?: HeartbeatCycleResult;
	leaseExpirations?: {
		policy?: ProjectServerLeaseExpirationPolicyDecision;
		batch?: ProjectServerLeaseExpirationBatch;
	};
}

interface ProjectServerBoardInput {
	generatedAt?: string;
	traceBoard: TraceBoardView;
	workQueue: WorkQueueView;
	triggers: TriggersView;
	maxWorkers?: number;
	runtimeResultPreview?: ProjectServerBoardRunPreview;
}

export interface ProjectServerBoardSummary {
	openTraces: number;
	readyWorkUnits: number;
	claimedWorkUnits: number;
	activeClaims: number;
	selectedClaims: number;
	heldClaims: number;
	dueTriggers: number;
	plannedRuns: number;
	expiredLeases: number;
	blockers: number;
	traceConflicts: number;
}

export interface ProjectServerBoardBlocker {
	kind: ProjectServerBoardBlockerKind;
	message: string;
	refs: string[];
	traceId?: string;
	workUnitId?: string;
	triggerId?: string;
}

export interface ProjectServerBoard {
	generatedAt?: string;
	summary: ProjectServerBoardSummary;
	traces: TraceBoardView["traces"];
	readyWorkUnits: WorkQueueItem[];
	claimedWorkUnits: WorkQueueItem[];
	activeClaims: ProjectServerWorkUnitClaimCandidate[];
	selectedClaims: ProjectServerWorkUnitClaimCandidate[];
	heldClaims: ProjectServerHeldWorkUnitClaim[];
	dueTriggers: TriggerView[];
	plannedRuns: HeartbeatCycleResult["plan"]["starts"];
	expiredLeases: TraceEvent[];
	blockers: ProjectServerBoardBlocker[];
	nextActions: string[];
}

export function buildProjectServerBoard(input: ProjectServerBoardInput): ProjectServerBoard {
	const claimSelection =
		input.runtimeResultPreview?.plan ||
		selectProjectServerWorkUnitClaims(input.workQueue, {
			maxWorkers: input.maxWorkers,
		});
	const readyWorkUnits = workUnitsWithStatus(input.workQueue, "ready");
	const claimedWorkUnits = workUnitsWithStatus(input.workQueue, "claimed");
	const dueTriggers = input.triggers.triggers.filter(
		(trigger) => trigger.status === "due",
	);
	const plannedRuns =
		input.runtimeResultPreview?.heartbeatCycle?.plan.starts || [];
	const expiredLeases =
		input.runtimeResultPreview?.leaseExpirations?.batch?.events || [];
	const blockers = runtimeBoardBlockers(input);
	return {
		generatedAt:
			input.generatedAt ||
			input.traceBoard.generatedAt ||
			input.workQueue.generatedAt ||
			input.triggers.generatedAt,
		summary: {
			openTraces: input.traceBoard.traces.filter((trace) => !trace.closed)
				.length,
			readyWorkUnits: readyWorkUnits.length,
			claimedWorkUnits: claimedWorkUnits.length,
			activeClaims: claimSelection.activeClaims.length,
			selectedClaims: claimSelection.selected.length,
			heldClaims: claimSelection.held.length,
			dueTriggers: dueTriggers.length,
			plannedRuns: plannedRuns.length,
			expiredLeases: expiredLeases.length,
			blockers: blockers.length,
			traceConflicts: input.traceBoard.conflicts.length,
		},
		traces: input.traceBoard.traces,
		readyWorkUnits,
		claimedWorkUnits,
		activeClaims: claimSelection.activeClaims,
		selectedClaims: claimSelection.selected,
		heldClaims: claimSelection.held,
		dueTriggers,
		plannedRuns,
		expiredLeases,
		blockers,
		nextActions: runtimeBoardNextActions({
			selectedClaims: claimSelection.selected,
			heldClaims: claimSelection.held,
			dueTriggers,
			plannedRuns,
			expiredLeases,
			blockers,
		}),
	};
}

function workUnitsWithStatus(
	queue: WorkQueueView,
	status: WorkQueueItem["status"],
): WorkQueueItem[] {
	return queue.items.filter(
		(item) => item.kind === "work-unit" && item.status === status,
	);
}

function runtimeBoardBlockers(input: ProjectServerBoardInput): ProjectServerBoardBlocker[] {
	return [
		...input.traceBoard.conflicts.map(traceConflictBlocker),
		...workQueueBlockers(input.workQueue),
		...policyBlockers(
			"runtime_policy",
			input.runtimeResultPreview?.policy?.blockers || [],
		),
		...policyBlockers(
			"heartbeat_policy",
			input.runtimeResultPreview?.heartbeatPolicy?.blockers || [],
		),
		...policyBlockers(
			"lease_policy",
			input.runtimeResultPreview?.leaseExpirations?.policy?.blockers || [],
		),
		...triggerRunSkipBlockers(input.runtimeResultPreview?.heartbeatCycle),
		...triggerRunAppendBlockers(input.runtimeResultPreview?.heartbeatCycle),
	];
}

function traceConflictBlocker(
	conflict: TraceBoardConflict,
): ProjectServerBoardBlocker {
	return {
		kind: "trace_conflict",
		message: conflict.message,
		traceId: conflict.leftTraceId,
		refs: unique([
			conflict.leftTraceId,
			conflict.rightTraceId,
			conflict.pathScope,
		]),
	};
}

function workQueueBlockers(queue: WorkQueueView): ProjectServerBoardBlocker[] {
	return queue.items.flatMap((item) => {
		if (item.kind !== "work-unit" || item.status !== "blocked") return [];
		const blockers = item.blockers.map((message) =>
			workUnitBlocker(item, "work_unit_blocked", message),
		);
		const qualityBlockers = item.qualityBlockers.map((message) =>
			workUnitBlocker(item, "work_unit_quality", message),
		);
		if (blockers.length || qualityBlockers.length) {
			return [...blockers, ...qualityBlockers];
		}
		return [
			workUnitBlocker(
				item,
				"work_unit_blocked",
				`Work unit ${item.id} is blocked.`,
			),
		];
	});
}

function workUnitBlocker(
	item: WorkQueueItem,
	kind: ProjectServerBoardBlockerKind,
	message: string,
): ProjectServerBoardBlocker {
	return {
		kind,
		message,
		traceId: item.traceId,
		workUnitId: item.id,
		refs: unique([...item.traceRefs, ...item.planningRefs, ...item.pathScopes]),
	};
}

function policyBlockers(
	kind: ProjectServerBoardBlockerKind,
	messages: string[],
): ProjectServerBoardBlocker[] {
	return messages.map((message) => ({ kind, message, refs: [] }));
}

function triggerRunSkipBlockers(
	cycle: HeartbeatCycleResult | undefined,
): ProjectServerBoardBlocker[] {
	return (cycle?.plan.skipped || []).map((skip) => ({
		kind: "trigger_run_skip",
		message: skip.message,
		refs: [...skip.refs],
		...(skip.traceId ? { traceId: skip.traceId } : {}),
		...(skip.triggerId ? { triggerId: skip.triggerId } : {}),
	}));
}

function triggerRunAppendBlockers(
	cycle: HeartbeatCycleResult | undefined,
): ProjectServerBoardBlocker[] {
	return (cycle?.appendResult?.blocked || []).map((blocked) => ({
		kind: "trigger_run_blocked",
		message: blocked.message,
		traceId: blocked.start.triggerTraceId,
		triggerId: blocked.start.triggerId,
		refs: [...blocked.refs],
	}));
}

function runtimeBoardNextActions(input: {
	selectedClaims: ProjectServerWorkUnitClaimCandidate[];
	heldClaims: ProjectServerHeldWorkUnitClaim[];
	dueTriggers: TriggerView[];
	plannedRuns: HeartbeatCycleResult["plan"]["starts"];
	expiredLeases: TraceEvent[];
	blockers: ProjectServerBoardBlocker[];
}): string[] {
	const actions: string[] = [];
	if (input.expiredLeases.length > 0) {
		actions.push(
			`Append ${input.expiredLeases.length} expired work-unit claim release event(s).`,
		);
	}
	if (input.plannedRuns.length > 0) {
		actions.push(
			`Append ${input.plannedRuns.length} planned Run trace head(s).`,
		);
	}
	if (input.selectedClaims.length > 0) {
		actions.push(
			`Append ${input.selectedClaims.length} work-unit claim event(s), then let host perform worker start.`,
		);
	}
	if (input.plannedRuns.length === 0 && input.dueTriggers.length > 0) {
		actions.push(
			`Run heartbeat cycle with due Trigger support for ${input.dueTriggers.length} Trigger(s).`,
		);
	}
	if (input.heldClaims.some((claim) => claim.reason === "capacity")) {
		actions.push(
			"Increase worker capacity or wait for active claims to finish.",
		);
	}
	if (input.heldClaims.some((claim) => claim.reason === "path_conflict")) {
		actions.push(
			"Wait for conflicting path scopes before claiming held work units.",
		);
	}
	if (input.blockers.length > 0) {
		actions.push(`Resolve ${input.blockers.length} runtime board blocker(s).`);
	}
	return actions.length ? actions : ["No runtime action pending."];
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
