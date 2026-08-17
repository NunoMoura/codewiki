import { createCodewikiOperationError } from "../../error-handling/operation-errors.ts";
import {
	createProjectServerHeartbeatQueue,
	evaluateProjectServerHeartbeatCyclePolicy,
	runHeartbeatCycle,
	type HeartbeatCycleResult,
	type ProjectServerHeartbeatCyclePolicyDecision,
	type ProjectServerHeartbeatRequest,
} from "../coordinator/index.ts";
import {
	appendProjectServerWorkUnitClaims,
	createProjectServerWorkUnitClaimEvents,
	type ProjectServerWorkUnitClaimAppendResult,
	type ProjectServerWorkUnitClaimEventBatch,
} from "../claims/work-unit-events.ts";
import {
	appendProjectServerLeaseExpirations,
	planProjectServerLeaseExpirations,
	type ProjectServerLeaseExpirationAppendResult,
	type ProjectServerLeaseExpirationBatch,
} from "../claims/leases.ts";
import {
	evaluateProjectServerLeaseExpirationPolicy,
	evaluateProjectServerWorkUnitClaimPolicy,
	type ProjectServerLeaseExpirationPolicyDecision,
	type ProjectServerWorkUnitClaimPolicyDecision,
} from "../claims/policy.ts";
import {
	selectProjectServerWorkUnitClaims,
	type ProjectServerWorkUnitClaimSelection,
} from "../claims/work-unit-selection.ts";
import type { WorktreeRef } from "../../git/worktrees.ts";
import type { PartialWikiConfig, WikiConfig } from "../../project/config.ts";
import type { TraceRecord } from "../../changes/trace/types.ts";
import type {WorkQueueView} from "../../work-state/projection-types.ts";
import type {TriggersView} from "../queries/projection-types.ts";

export type WikiRuntimeMode = "preview" | "append";
export type WikiRuntimeAction = "work-unit-claims";

export interface RunWikiProjectServerInput {
	action?: WikiRuntimeAction;
	mode?: WikiRuntimeMode;
	queue: WorkQueueView;
	maxWorkers?: number;
	createdAt?: string;
	nextSequenceByTrace?: Record<string, number>;
	expectedBytesByTrace?: Record<string, number>;
	repoRoot?: string;
	expiresAt?: string;
	workerIdPrefix?: string;
	claimIdPrefix?: string;
	workerIds?: Record<string, string>;
	config?: PartialWikiConfig | WikiConfig;
	triggers?: TriggersView;
	heartbeats?: ProjectServerHeartbeatRequest[];
	includeDueTriggers?: boolean;
	worktreeRoot?: string;
	baseRef?: string;
	baseSha?: string;
	dirtyPaths?: string[];
	records?: TraceRecord[];
	expireLeases?: boolean;
	leaseExpirationIdPrefix?: string;
}

export interface RunWikiProjectServerHeartbeatCycleInput {
	mode?: WikiRuntimeMode;
	createdAt?: string;
	repoRoot?: string;
	config?: PartialWikiConfig | WikiConfig;
	triggers: TriggersView;
	heartbeats?: ProjectServerHeartbeatRequest[];
	includeDueTriggers?: boolean;
}

export interface RunWikiProjectServerHeartbeatCycleResult {
	action: "heartbeat-cycle";
	mode: WikiRuntimeMode;
	heartbeatPolicy: ProjectServerHeartbeatCyclePolicyDecision;
	heartbeatCycle: HeartbeatCycleResult;
}

export interface RunWikiProjectServerLeaseExpirationResult {
	policy: ProjectServerLeaseExpirationPolicyDecision;
	batch: ProjectServerLeaseExpirationBatch;
	append?: ProjectServerLeaseExpirationAppendResult;
}

export interface RunWikiProjectServerResult {
	action: WikiRuntimeAction;
	mode: WikiRuntimeMode;
	plan: ProjectServerWorkUnitClaimSelection;
	policy: ProjectServerWorkUnitClaimPolicyDecision;
	batch?: ProjectServerWorkUnitClaimEventBatch;
	append?: ProjectServerWorkUnitClaimAppendResult;
	heartbeatPolicy?: ProjectServerHeartbeatCyclePolicyDecision;
	heartbeatCycle?: HeartbeatCycleResult;
	leaseExpirations?: RunWikiProjectServerLeaseExpirationResult;
}

export async function runProjectServer(
	input: RunWikiProjectServerInput,
): Promise<RunWikiProjectServerResult> {
	const action = input.action || "work-unit-claims";
	const mode = input.mode || "preview";
	if (action !== "work-unit-claims") {
		throw unsupportedAction(action);
	}
	const queue = requiredQueue(input.queue);
	const createdAt = input.createdAt || new Date().toISOString();
	const plan = selectProjectServerWorkUnitClaims(queue, {
		maxWorkers: input.maxWorkers ?? input.config?.runtime?.maxWorkers,
	});
	const policy = evaluateProjectServerWorkUnitClaimPolicy({
		mode,
		queue,
		plan,
		config: input.config,
		maxWorkers: input.maxWorkers,
		nextSequenceByTrace: input.nextSequenceByTrace,
		expectedBytesByTrace: input.expectedBytesByTrace,
		repoRoot: input.repoRoot,
		worktreeRoot: input.worktreeRoot,
		baseRef: input.baseRef,
		baseSha: input.baseSha,
		dirtyPaths: input.dirtyPaths,
		workerIdPrefix: input.workerIdPrefix,
		workerIds: input.workerIds,
	});
	if (mode === "append" && !policy.appendAllowed) {
		throw appendBlocked(policy.blockers);
	}
	const batch = input.nextSequenceByTrace
		? createProjectServerWorkUnitClaimEvents(plan, {
				createdAt,
				nextSequenceByTrace: input.nextSequenceByTrace,
				expiresAt: input.expiresAt,
				workerIdPrefix: input.workerIdPrefix,
				claimIdPrefix: input.claimIdPrefix,
				workerIds: input.workerIds,
				worktreesByWorkUnit: worktreesByWorkUnit(policy.worktrees),
			})
		: undefined;
	const leaseExpirations = input.expireLeases
		? runtimeLeaseExpirations(input, mode, createdAt, batch)
		: undefined;
	if (mode === "append" && input.triggers) {
		assertHeartbeatAppendPolicy(input);
	}
	if (mode === "append" && leaseExpirations?.policy.appendAllowed === false) {
		throw appendBlocked(leaseExpirations.policy.blockers);
	}
	const heartbeatPreview =
		mode === "preview" && input.triggers
			? await runHeartbeatCycleFromProjectServerInput(input, mode)
			: undefined;
	if (mode === "append") {
		const append = plan.selected.length
			? await appendProjectServerWorkUnitClaims(requiredBatch(batch), {
					repoRoot: requiredRepoRoot(input.repoRoot),
					expectedBytesByTrace: requiredBytesByTrace(
						input.expectedBytesByTrace,
					),
				})
			: undefined;
		const leaseAppend = leaseExpirations?.batch.events.length
			? await appendProjectServerLeaseExpirations(leaseExpirations.batch, {
					repoRoot: requiredRepoRoot(input.repoRoot),
					expectedBytesByTrace: expectedBytesAfterWorkUnitClaims(
						input.expectedBytesByTrace,
						append,
					),
				})
			: undefined;
		const heartbeat = input.triggers
			? await runHeartbeatCycleFromProjectServerInput(input, mode)
			: undefined;
		return {
			action,
			mode,
			plan,
			policy,
			...(batch ? { batch } : {}),
			...(append ? { append } : {}),
			...(heartbeat ? heartbeatResultFields(heartbeat) : {}),
			...(leaseExpirations
				? {
						leaseExpirations: {
							...leaseExpirations,
							...(leaseAppend ? { append: leaseAppend } : {}),
						},
					}
				: {}),
		};
	}
	return {
		action,
		mode,
		plan,
		policy,
		...(batch ? { batch } : {}),
		...(heartbeatPreview ? heartbeatResultFields(heartbeatPreview) : {}),
		...(leaseExpirations ? { leaseExpirations } : {}),
	};
}

function runtimeLeaseExpirations(
	input: RunWikiProjectServerInput,
	mode: WikiRuntimeMode,
	createdAt: string,
	claimBatch: ProjectServerWorkUnitClaimEventBatch | undefined,
): RunWikiProjectServerLeaseExpirationResult {
	const records = requiredRecords(input.records);
	const nextSequenceByTrace = requiredNextSequenceByTrace(
		claimBatch?.nextSequenceByTrace || input.nextSequenceByTrace,
	);
	const batch = planProjectServerLeaseExpirations(records, {
		generatedAt: createdAt,
		nextSequenceByTrace,
		releaseIdPrefix: input.leaseExpirationIdPrefix,
	});
	const policy = evaluateProjectServerLeaseExpirationPolicy({
		mode,
		config: input.config,
		repoRoot: input.repoRoot,
		expectedBytesByTrace: input.expectedBytesByTrace,
		traceIds: unique(batch.events.map((event) => event.traceId)),
	});
	return { policy, batch };
}

function expectedBytesAfterWorkUnitClaims(
	expectedBytesByTrace: Record<string, number> | undefined,
	append: ProjectServerWorkUnitClaimAppendResult | undefined,
): Record<string, number> {
	return {
		...requiredBytesByTrace(expectedBytesByTrace),
		...(append?.nextBytesByTrace || {}),
	};
}

function assertHeartbeatAppendPolicy(input: RunWikiProjectServerInput): void {
	const heartbeatPolicy = evaluateProjectServerHeartbeatCyclePolicy({
		mode: "append",
		config: input.config,
		repoRoot: input.repoRoot,
	});
	if (!heartbeatPolicy.appendAllowed) {
		throw appendBlocked(heartbeatPolicy.blockers);
	}
}

async function runHeartbeatCycleFromProjectServerInput(
	input: RunWikiProjectServerHeartbeatCycleInput | RunWikiProjectServerInput,
	mode: WikiRuntimeMode = input.mode || "preview",
): Promise<RunWikiProjectServerHeartbeatCycleResult> {
	const triggers = requiredTriggers(input.triggers);
	const heartbeatPolicy = evaluateProjectServerHeartbeatCyclePolicy({
		mode,
		config: input.config,
		repoRoot: input.repoRoot,
	});
	if (mode === "append" && !heartbeatPolicy.appendAllowed) {
		throw appendBlocked(heartbeatPolicy.blockers);
	}
	const heartbeatQueue = createProjectServerHeartbeatQueue();
	for (const heartbeat of input.heartbeats || []) {
		heartbeatQueue.request(heartbeat);
	}
	const heartbeatCycle = await runHeartbeatCycle({
		queue: heartbeatQueue,
		triggers,
		mode,
		...(input.repoRoot ? { repoRoot: input.repoRoot } : {}),
		...(input.createdAt ? { createdAt: input.createdAt } : {}),
		includeDueTriggers: input.includeDueTriggers,
	});
	return {
		action: "heartbeat-cycle",
		mode,
		heartbeatPolicy,
		heartbeatCycle,
	};
}

function heartbeatResultFields(
	result: RunWikiProjectServerHeartbeatCycleResult,
): Pick<RunWikiProjectServerResult, "heartbeatPolicy" | "heartbeatCycle"> {
	return {
		...(result.heartbeatPolicy
			? { heartbeatPolicy: result.heartbeatPolicy }
			: {}),
		...(result.heartbeatCycle ? { heartbeatCycle: result.heartbeatCycle } : {}),
	};
}

function requiredRecords(value: TraceRecord[] | undefined): TraceRecord[] {
	if (!value) {
		throw createCodewikiOperationError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "records",
			message: "wiki_runtime lease expiration requires records.",
		});
	}
	return value;
}

function requiredQueue(value: WorkQueueView | undefined): WorkQueueView {
	if (!value) {
		throw createCodewikiOperationError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "queue",
			message: "wiki_runtime work-unit-claims action requires queue.",
		});
	}
	return value;
}

function requiredTriggers(value: TriggersView | undefined): TriggersView {
	if (!value) {
		throw createCodewikiOperationError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "triggers",
			message: "wiki_runtime heartbeat-cycle action requires triggers.",
		});
	}
	return value;
}

function unsupportedAction(action: string): Error {
	return createCodewikiOperationError({
		operation: "wiki_runtime",
		code: "unsupported_action",
		field: "action",
		message: `Unsupported wiki_runtime action ${action}.`,
		data: { action },
	});
}

function appendBlocked(blockers: string[]): Error {
	return createCodewikiOperationError({
		operation: "wiki_runtime",
		code: "append_blocked",
		message: `wiki_runtime append blocked by policy: ${blockers.join(" ")}`,
		suggestedAction: "ask_user",
		data: { blockers },
	});
}

function worktreesByWorkUnit(
	worktrees: ProjectServerWorkUnitClaimPolicyDecision["worktrees"],
): Record<string, WorktreeRef> {
	return Object.fromEntries(
		worktrees.flatMap((plan) =>
			plan.worktree ? [[plan.workUnitId, plan.worktree]] : [],
		),
	);
}

function requiredBatch(
	batch: ProjectServerWorkUnitClaimEventBatch | undefined,
): ProjectServerWorkUnitClaimEventBatch {
	if (!batch) {
		throw createCodewikiOperationError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "nextSequenceByTrace",
			message: "wiki_runtime append mode requires nextSequenceByTrace.",
		});
	}
	return batch;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) {
		throw createCodewikiOperationError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "repoRoot",
			message: "wiki_runtime append mode requires repoRoot.",
		});
	}
	return value;
}

function requiredNextSequenceByTrace(
	value: Record<string, number> | undefined,
): Record<string, number> {
	if (!value) {
		throw createCodewikiOperationError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "nextSequenceByTrace",
			message: "wiki_runtime lease expiration requires nextSequenceByTrace.",
		});
	}
	return value;
}

function requiredBytesByTrace(
	value: Record<string, number> | undefined,
): Record<string, number> {
	if (!value) {
		throw createCodewikiOperationError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "expectedBytesByTrace",
			message: "wiki_runtime append mode requires expectedBytesByTrace.",
		});
	}
	return value;
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}
