import { createCodewikiApiError } from "../error-handling/api-errors.ts";
import {
	createRuntimeHeartbeatQueue,
	runHeartbeatCycle,
	type HeartbeatCycleResult,
	type RuntimeHeartbeatRequest,
} from "../runtime/coordinator/index.ts";
import {
	appendRuntimeWorkUnitClaims,
	createRuntimeWorkUnitClaimEvents,
	type RuntimeWorkUnitClaimAppendResult,
	type RuntimeWorkUnitClaimEventBatch,
} from "../runtime/work-unit-claims.ts";
import {
	appendRuntimeLeaseExpirations,
	planRuntimeLeaseExpirations,
	type RuntimeLeaseExpirationAppendResult,
	type RuntimeLeaseExpirationBatch,
} from "../runtime/leases.ts";
import {
	evaluateRuntimeWorkUnitClaimPolicy,
	evaluateRuntimeHeartbeatCyclePolicy,
	evaluateRuntimeLeaseExpirationPolicy,
	type RuntimeWorkUnitClaimPolicyDecision,
	type RuntimeHeartbeatCyclePolicyDecision,
	type RuntimeLeaseExpirationPolicyDecision,
} from "../runtime/policy.ts";
import {
	selectRuntimeWorkUnitClaims,
	type RuntimeWorkUnitClaimSelection,
} from "../runtime/work-unit-claim-selection.ts";
import type { WorktreeRef } from "../git/worktrees.ts";
import type { PartialWikiConfig, WikiConfig } from "../project/config.ts";
import type { TraceRecord } from "../traces/types.ts";
import type { TriggersView, WorkQueueView } from "../views/types.ts";

export type WikiRuntimeMode = "preview" | "append";
export type WikiRuntimeAction = "work-unit-claims";

export interface RunWikiRuntimeInput {
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
	heartbeats?: RuntimeHeartbeatRequest[];
	includeDueTriggers?: boolean;
	worktreeRoot?: string;
	baseRef?: string;
	baseSha?: string;
	dirtyPaths?: string[];
	records?: TraceRecord[];
	expireLeases?: boolean;
	leaseExpirationIdPrefix?: string;
}

export interface RunWikiRuntimeHeartbeatCycleInput {
	mode?: WikiRuntimeMode;
	createdAt?: string;
	repoRoot?: string;
	config?: PartialWikiConfig | WikiConfig;
	triggers: TriggersView;
	heartbeats?: RuntimeHeartbeatRequest[];
	includeDueTriggers?: boolean;
}

export interface RunWikiRuntimeHeartbeatCycleResult {
	action: "heartbeat-cycle";
	mode: WikiRuntimeMode;
	heartbeatPolicy: RuntimeHeartbeatCyclePolicyDecision;
	heartbeatCycle: HeartbeatCycleResult;
}

export interface RunWikiRuntimeLeaseExpirationResult {
	policy: RuntimeLeaseExpirationPolicyDecision;
	batch: RuntimeLeaseExpirationBatch;
	append?: RuntimeLeaseExpirationAppendResult;
}

export interface RunWikiRuntimeResult {
	action: WikiRuntimeAction;
	mode: WikiRuntimeMode;
	plan: RuntimeWorkUnitClaimSelection;
	policy: RuntimeWorkUnitClaimPolicyDecision;
	batch?: RuntimeWorkUnitClaimEventBatch;
	append?: RuntimeWorkUnitClaimAppendResult;
	heartbeatPolicy?: RuntimeHeartbeatCyclePolicyDecision;
	heartbeatCycle?: HeartbeatCycleResult;
	leaseExpirations?: RunWikiRuntimeLeaseExpirationResult;
}

export async function runWikiRuntime(
	input: RunWikiRuntimeInput,
): Promise<RunWikiRuntimeResult> {
	const action = input.action || "work-unit-claims";
	const mode = input.mode || "preview";
	if (action !== "work-unit-claims") {
		throw unsupportedAction(action);
	}
	const queue = requiredQueue(input.queue);
	const createdAt = input.createdAt || new Date().toISOString();
	const plan = selectRuntimeWorkUnitClaims(queue, {
		maxWorkers: input.maxWorkers ?? input.config?.runtime?.maxWorkers,
	});
	const policy = evaluateRuntimeWorkUnitClaimPolicy({
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
		? createRuntimeWorkUnitClaimEvents(plan, {
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
			? await runHeartbeatCycleFromRuntimeInput(input, mode)
			: undefined;
	if (mode === "append") {
		const append = plan.selected.length
			? await appendRuntimeWorkUnitClaims(requiredBatch(batch), {
					repoRoot: requiredRepoRoot(input.repoRoot),
					expectedBytesByTrace: requiredBytesByTrace(
						input.expectedBytesByTrace,
					),
				})
			: undefined;
		const leaseAppend = leaseExpirations?.batch.events.length
			? await appendRuntimeLeaseExpirations(leaseExpirations.batch, {
					repoRoot: requiredRepoRoot(input.repoRoot),
					expectedBytesByTrace: expectedBytesAfterWorkUnitClaims(
						input.expectedBytesByTrace,
						append,
					),
				})
			: undefined;
		const heartbeat = input.triggers
			? await runHeartbeatCycleFromRuntimeInput(input, mode)
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
	input: RunWikiRuntimeInput,
	mode: WikiRuntimeMode,
	createdAt: string,
	claimBatch: RuntimeWorkUnitClaimEventBatch | undefined,
): RunWikiRuntimeLeaseExpirationResult {
	const records = requiredRecords(input.records);
	const nextSequenceByTrace = requiredNextSequenceByTrace(
		claimBatch?.nextSequenceByTrace || input.nextSequenceByTrace,
	);
	const batch = planRuntimeLeaseExpirations(records, {
		generatedAt: createdAt,
		nextSequenceByTrace,
		releaseIdPrefix: input.leaseExpirationIdPrefix,
	});
	const policy = evaluateRuntimeLeaseExpirationPolicy({
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
	append: RuntimeWorkUnitClaimAppendResult | undefined,
): Record<string, number> {
	return {
		...requiredBytesByTrace(expectedBytesByTrace),
		...(append?.nextBytesByTrace || {}),
	};
}

function assertHeartbeatAppendPolicy(input: RunWikiRuntimeInput): void {
	const heartbeatPolicy = evaluateRuntimeHeartbeatCyclePolicy({
		mode: "append",
		config: input.config,
		repoRoot: input.repoRoot,
	});
	if (!heartbeatPolicy.appendAllowed) {
		throw appendBlocked(heartbeatPolicy.blockers);
	}
}

async function runHeartbeatCycleFromRuntimeInput(
	input: RunWikiRuntimeHeartbeatCycleInput | RunWikiRuntimeInput,
	mode: WikiRuntimeMode = input.mode || "preview",
): Promise<RunWikiRuntimeHeartbeatCycleResult> {
	const triggers = requiredTriggers(input.triggers);
	const heartbeatPolicy = evaluateRuntimeHeartbeatCyclePolicy({
		mode,
		config: input.config,
		repoRoot: input.repoRoot,
	});
	if (mode === "append" && !heartbeatPolicy.appendAllowed) {
		throw appendBlocked(heartbeatPolicy.blockers);
	}
	const heartbeatQueue = createRuntimeHeartbeatQueue();
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
	result: RunWikiRuntimeHeartbeatCycleResult,
): Pick<RunWikiRuntimeResult, "heartbeatPolicy" | "heartbeatCycle"> {
	return {
		...(result.heartbeatPolicy
			? { heartbeatPolicy: result.heartbeatPolicy }
			: {}),
		...(result.heartbeatCycle ? { heartbeatCycle: result.heartbeatCycle } : {}),
	};
}

function requiredRecords(value: TraceRecord[] | undefined): TraceRecord[] {
	if (!value) {
		throw createCodewikiApiError({
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
		throw createCodewikiApiError({
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
		throw createCodewikiApiError({
			operation: "wiki_runtime",
			code: "missing_required",
			field: "triggers",
			message: "wiki_runtime heartbeat-cycle action requires triggers.",
		});
	}
	return value;
}

function unsupportedAction(action: string): Error {
	return createCodewikiApiError({
		operation: "wiki_runtime",
		code: "unsupported_action",
		field: "action",
		message: `Unsupported wiki_runtime action ${action}.`,
		data: { action },
	});
}

function appendBlocked(blockers: string[]): Error {
	return createCodewikiApiError({
		operation: "wiki_runtime",
		code: "append_blocked",
		message: `wiki_runtime append blocked by policy: ${blockers.join(" ")}`,
		suggestedAction: "ask_user",
		data: { blockers },
	});
}

function worktreesByWorkUnit(
	worktrees: RuntimeWorkUnitClaimPolicyDecision["worktrees"],
): Record<string, WorktreeRef> {
	return Object.fromEntries(
		worktrees.flatMap((plan) =>
			plan.worktree ? [[plan.workUnitId, plan.worktree]] : [],
		),
	);
}

function requiredBatch(
	batch: RuntimeWorkUnitClaimEventBatch | undefined,
): RuntimeWorkUnitClaimEventBatch {
	if (!batch) {
		throw createCodewikiApiError({
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
		throw createCodewikiApiError({
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
		throw createCodewikiApiError({
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
		throw createCodewikiApiError({
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
