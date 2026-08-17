import type {TriggersView} from "../queries/projection-types.ts";
import type { ProjectServerHeartbeatQueue } from "./heartbeat-queue.ts";
import {
	planDueTriggerHeartbeats,
	type ProjectServerDueTriggerHeartbeatPlan,
} from "./due-triggers.ts";
import {
	appendPlannedTriggerRuns,
	planProjectServerTriggerRuns,
	type AppendPlannedTriggerRunsResult,
	type ProjectServerTriggerRunKeyFactory,
	type ProjectServerTriggerRunPlan,
	type ProjectServerTriggerTraceIdFactory,
} from "./trigger-runs.ts";
import type { QueuedProjectServerHeartbeat } from "./types.ts";

export type HeartbeatCycleMode = "preview" | "append";

export interface HeartbeatCycleInput {
	queue: ProjectServerHeartbeatQueue;
	triggers: TriggersView;
	mode?: HeartbeatCycleMode;
	repoRoot?: string;
	createdAt?: string;
	includeDueTriggers?: boolean;
	traceIdFactory?: ProjectServerTriggerTraceIdFactory;
	runKeyFactory?: ProjectServerTriggerRunKeyFactory;
}

export interface HeartbeatCycleResult {
	mode: HeartbeatCycleMode;
	dueTriggers?: ProjectServerDueTriggerHeartbeatPlan;
	heartbeats: QueuedProjectServerHeartbeat[];
	plan: ProjectServerTriggerRunPlan;
	appendResult?: AppendPlannedTriggerRunsResult;
}

export async function runHeartbeatCycle(
	input: HeartbeatCycleInput,
): Promise<HeartbeatCycleResult> {
	const mode = input.mode || "preview";
	const repoRoot = input.repoRoot;
	if (mode === "append" && !repoRoot) {
		throw new HeartbeatCycleAppendError(
			"Heartbeat cycle append mode requires repoRoot.",
		);
	}
	const dueTriggers = input.includeDueTriggers
		? planDueTriggerHeartbeats(input.triggers)
		: undefined;
	for (const heartbeat of dueTriggers?.heartbeats || []) {
		input.queue.request(heartbeat);
	}
	const heartbeats = input.queue.drain();
	const plan = planProjectServerTriggerRuns({
		triggers: input.triggers,
		heartbeats,
		...(input.createdAt ? { createdAt: input.createdAt } : {}),
		...(input.traceIdFactory ? { traceIdFactory: input.traceIdFactory } : {}),
		...(input.runKeyFactory ? { runKeyFactory: input.runKeyFactory } : {}),
	});
	if (mode === "append") {
		const appendRepoRoot = repoRoot;
		if (!appendRepoRoot) {
			throw new HeartbeatCycleAppendError(
				"Heartbeat cycle append mode requires repoRoot.",
			);
		}
		return {
			mode,
			...(dueTriggers ? { dueTriggers } : {}),
			heartbeats,
			plan,
			appendResult: await appendPlannedTriggerRuns({
				repoRoot: appendRepoRoot,
				plan,
			}),
		};
	}
	return { mode, ...(dueTriggers ? { dueTriggers } : {}), heartbeats, plan };
}

export class HeartbeatCycleAppendError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HeartbeatCycleAppendError";
	}
}
