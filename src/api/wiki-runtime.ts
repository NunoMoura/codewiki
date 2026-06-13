import {
	appendRuntimeDispatchClaims,
	createRuntimeDispatchClaimEvents,
	type RuntimeDispatchClaimAppendResult,
	type RuntimeDispatchClaimBatch,
} from "../runtime/dispatcher.ts";
import {
	planRuntimeDispatch,
	type RuntimeDispatchPlan,
} from "../runtime/scheduler.ts";
import type { WorkQueueView } from "../views/types.ts";

export type WikiRuntimeMode = "preview" | "append";
export type WikiRuntimeAction = "dispatch";

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
}

export interface RunWikiRuntimeResult {
	action: WikiRuntimeAction;
	mode: WikiRuntimeMode;
	plan: RuntimeDispatchPlan;
	batch?: RuntimeDispatchClaimBatch;
	append?: RuntimeDispatchClaimAppendResult;
}

export async function runWikiRuntime(
	input: RunWikiRuntimeInput,
): Promise<RunWikiRuntimeResult> {
	const action = input.action || "dispatch";
	if (action !== "dispatch")
		throw new Error(`Unsupported wiki_runtime action ${action}.`);
	const mode = input.mode || "preview";
	const plan = planRuntimeDispatch(input.queue, {
		maxWorkers: input.maxWorkers,
	});
	const batch = input.nextSequenceByTrace
		? createRuntimeDispatchClaimEvents(plan, {
				createdAt: input.createdAt || new Date().toISOString(),
				nextSequenceByTrace: input.nextSequenceByTrace,
				expiresAt: input.expiresAt,
				workerIdPrefix: input.workerIdPrefix,
				claimIdPrefix: input.claimIdPrefix,
				workerIds: input.workerIds,
			})
		: undefined;
	if (mode === "append") {
		const append = await appendRuntimeDispatchClaims(requiredBatch(batch), {
			repoRoot: requiredRepoRoot(input.repoRoot),
			expectedBytesByTrace: requiredBytesByTrace(input.expectedBytesByTrace),
		});
		return { action, mode, plan, batch, append };
	}
	return { action, mode, plan, ...(batch ? { batch } : {}) };
}

function requiredBatch(
	batch: RuntimeDispatchClaimBatch | undefined,
): RuntimeDispatchClaimBatch {
	if (!batch) {
		throw new Error("wiki_runtime append mode requires nextSequenceByTrace.");
	}
	return batch;
}

function requiredRepoRoot(value: string | undefined): string {
	if (!value) throw new Error("wiki_runtime append mode requires repoRoot.");
	return value;
}

function requiredBytesByTrace(
	value: Record<string, number> | undefined,
): Record<string, number> {
	if (!value) {
		throw new Error("wiki_runtime append mode requires expectedBytesByTrace.");
	}
	return value;
}
