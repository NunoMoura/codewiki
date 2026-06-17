import {
	planRuntimeDispatchWorktrees,
	type RuntimeWorktreePlan,
} from "../git/worktrees.ts";
import {
	resolveWikiConfig,
	type PartialWikiConfig,
	type WikiConfig,
	type WikiConfigAgencyLevel,
	type WikiConfigAutomationMode,
	type WikiConfigWorktreeIsolation,
} from "../project/config.ts";
import type { WorkQueueItem, WorkQueueView } from "../views/types.ts";
import type { RuntimeDispatchPlan } from "./scheduler.ts";

export interface RuntimePolicy {
	automationEnabled: boolean;
	maxParallelClaims: number;
}

export type RuntimeDispatchPolicyMode = "preview" | "append";

export interface RuntimeDispatchPolicyInput {
	mode: RuntimeDispatchPolicyMode;
	queue: WorkQueueView;
	plan: RuntimeDispatchPlan;
	config?: PartialWikiConfig | WikiConfig;
	maxWorkers?: number;
	nextSequenceByTrace?: Record<string, number>;
	expectedBytesByTrace?: Record<string, number>;
	repoRoot?: string;
	worktreeRoot?: string;
	baseRef?: string;
	baseSha?: string;
	dirtyPaths?: string[];
	workerIdPrefix?: string;
	workerIds?: Record<string, string>;
}

export interface RuntimeDispatchPolicyDecision extends RuntimePolicy {
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	worktreeIsolation: WikiConfigWorktreeIsolation;
	worktrees: RuntimeWorktreePlan[];
	appendAllowed: boolean;
	blockers: string[];
	qualityBlockedWorkUnitIds: string[];
}

export function runtimePolicyFromConfig(
	config: PartialWikiConfig | WikiConfig = {},
	maxWorkers?: number,
): RuntimePolicy {
	const resolved = resolveWikiConfig(config);
	return {
		automationEnabled: resolved.runtime.automation !== "manual",
		maxParallelClaims: Math.max(0, maxWorkers ?? resolved.runtime.maxWorkers),
	};
}

export function evaluateRuntimeDispatchPolicy(
	input: RuntimeDispatchPolicyInput,
): RuntimeDispatchPolicyDecision {
	const config = resolveWikiConfig(input.config);
	const setupCommands = config.runtime.worktreeSetupCommands;
	const worktrees = planRuntimeDispatchWorktrees(input.plan.dispatch, {
		mode: config.runtime.worktreeIsolation,
		repoRoot: input.repoRoot,
		projectName: config.project,
		worktreeRoot: input.worktreeRoot,
		baseRef: input.baseRef,
		baseSha: input.baseSha,
		dirtyPaths: input.dirtyPaths,
		workerIdPrefix: input.workerIdPrefix,
		workerIds: input.workerIds,
		setupCommands,
	});
	const qualityBlockedWorkUnitIds = dispatchQualityBlockedWorkUnitIds(
		input.queue,
		input.plan,
	);
	const blockers = [
		...automationBlockers(config),
		...appendSafetyBlockers(input),
		...qualityBlockedWorkUnitIds.map(
			(id) => `Work unit ${id} is not dispatchable by quality policy.`,
		),
	];
	return {
		automationEnabled: config.runtime.automation !== "manual",
		maxParallelClaims: Math.max(
			0,
			input.maxWorkers ?? config.runtime.maxWorkers,
		),
		automation: config.runtime.automation,
		agency: config.runtime.agency,
		worktreeIsolation: config.runtime.worktreeIsolation,
		worktrees,
		appendAllowed: blockers.length === 0,
		blockers,
		qualityBlockedWorkUnitIds,
	};
}

function automationBlockers(config: WikiConfig): string[] {
	const blockers: string[] = [];
	if (config.runtime.automation === "manual") {
		blockers.push("runtime.automation is manual.");
	}
	if (config.runtime.agency === "observe") {
		blockers.push("runtime.agency is observe.");
	}
	return blockers;
}

function appendSafetyBlockers(input: RuntimeDispatchPolicyInput): string[] {
	if (input.mode !== "append") return [];
	const traceIds = unique(input.plan.dispatch.map((item) => item.traceId));
	return [
		...traceIds
			.filter((traceId) => !hasNextSequence(input.nextSequenceByTrace, traceId))
			.map((traceId) => `Missing nextSequenceByTrace for ${traceId}.`),
		...traceIds
			.filter(
				(traceId) => !hasExpectedBytes(input.expectedBytesByTrace, traceId),
			)
			.map((traceId) => `Missing expected trace bytes for ${traceId}.`),
	];
}

function dispatchQualityBlockedWorkUnitIds(
	queue: WorkQueueView,
	plan: RuntimeDispatchPlan,
): string[] {
	const dispatchIds = new Set(plan.dispatch.map((item) => item.workUnitId));
	return queue.items
		.filter((item) => dispatchIds.has(item.id))
		.filter(qualityBlocked)
		.map((item) => item.id);
}

function qualityBlocked(item: WorkQueueItem): boolean {
	if (item.kind !== "work-unit" || item.status !== "ready") return false;
	const qualityBlockers = item.qualityBlockers || [];
	const qualityStandards = item.qualityStandards || [];
	if (qualityBlockers.length > 0) return true;
	if (qualityStandards.length === 0) return true;
	return qualityStandards.some((standard) => standard.status !== "met");
}

function hasNextSequence(
	nextSequenceByTrace: Record<string, number> | undefined,
	traceId: string,
): boolean {
	const sequence = nextSequenceByTrace?.[traceId];
	return Number.isInteger(sequence) && Number(sequence) >= 1;
}

function hasExpectedBytes(
	expectedBytesByTrace: Record<string, number> | undefined,
	traceId: string,
): boolean {
	const expected = expectedBytesByTrace?.[traceId];
	return Number.isInteger(expected) && Number(expected) >= 0;
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values));
}
