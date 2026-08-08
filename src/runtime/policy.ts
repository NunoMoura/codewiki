import {
	planRuntimeWorkUnitClaimWorktrees,
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
import type { RuntimeWorkUnitClaimSelection } from "./claims/work-unit-selection.ts";

export interface RuntimePolicy {
	automationEnabled: boolean;
	maxParallelClaims: number;
}

export type RuntimeWorkUnitClaimPolicyMode = "preview" | "append";
export type RuntimeHeartbeatCyclePolicyMode = "preview" | "append";
export type RuntimeLeaseExpirationPolicyMode = "preview" | "append";

export interface RuntimeWorkUnitClaimPolicyInput {
	mode: RuntimeWorkUnitClaimPolicyMode;
	queue: WorkQueueView;
	plan: RuntimeWorkUnitClaimSelection;
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

export interface RuntimeWorkUnitClaimPolicyDecision extends RuntimePolicy {
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	worktreeIsolation: WikiConfigWorktreeIsolation;
	worktrees: RuntimeWorktreePlan[];
	appendAllowed: boolean;
	blockers: string[];
	qualityBlockedWorkUnitIds: string[];
}

export interface RuntimeHeartbeatCyclePolicyInput {
	mode: RuntimeHeartbeatCyclePolicyMode;
	config?: PartialWikiConfig | WikiConfig;
	repoRoot?: string;
}

export interface RuntimeHeartbeatCyclePolicyDecision extends RuntimePolicy {
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	appendAllowed: boolean;
	blockers: string[];
}

export interface RuntimeLeaseExpirationPolicyInput {
	mode: RuntimeLeaseExpirationPolicyMode;
	config?: PartialWikiConfig | WikiConfig;
	repoRoot?: string;
	traceIds?: string[];
	expectedBytesByTrace?: Record<string, number>;
}

export interface RuntimeLeaseExpirationPolicyDecision extends RuntimePolicy {
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	appendAllowed: boolean;
	blockers: string[];
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

export function evaluateRuntimeHeartbeatCyclePolicy(
	input: RuntimeHeartbeatCyclePolicyInput,
): RuntimeHeartbeatCyclePolicyDecision {
	const config = resolveWikiConfig(input.config);
	const blockers = [
		...automationBlockers(config),
		...heartbeatAppendSafetyBlockers(input),
	];
	return {
		automationEnabled: config.runtime.automation !== "manual",
		maxParallelClaims: config.runtime.maxWorkers,
		automation: config.runtime.automation,
		agency: config.runtime.agency,
		appendAllowed: blockers.length === 0,
		blockers,
	};
}

export function evaluateRuntimeLeaseExpirationPolicy(
	input: RuntimeLeaseExpirationPolicyInput,
): RuntimeLeaseExpirationPolicyDecision {
	const config = resolveWikiConfig(input.config);
	const blockers = [
		...automationBlockers(config),
		...leaseExpirationAppendSafetyBlockers(input),
	];
	return {
		automationEnabled: config.runtime.automation !== "manual",
		maxParallelClaims: config.runtime.maxWorkers,
		automation: config.runtime.automation,
		agency: config.runtime.agency,
		appendAllowed: blockers.length === 0,
		blockers,
	};
}

export function evaluateRuntimeWorkUnitClaimPolicy(
	input: RuntimeWorkUnitClaimPolicyInput,
): RuntimeWorkUnitClaimPolicyDecision {
	const config = resolveWikiConfig(input.config);
	const setupCommands = config.runtime.worktreeSetupCommands;
	const worktrees = planRuntimeWorkUnitClaimWorktrees(input.plan.selected, {
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
	const qualityBlockedWorkUnitIds = selectedQualityBlockedWorkUnitIds(
		input.queue,
		input.plan,
	);
	const blockers = [
		...automationBlockers(config),
		...appendSafetyBlockers(input),
		...qualityBlockedWorkUnitIds.map(
			(id) => `Work unit ${id} is not claimable by quality policy.`,
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

function heartbeatAppendSafetyBlockers(
	input: RuntimeHeartbeatCyclePolicyInput,
): string[] {
	if (input.mode !== "append") return [];
	return input.repoRoot ? [] : ["Missing repoRoot for heartbeat cycle append."];
}

function leaseExpirationAppendSafetyBlockers(
	input: RuntimeLeaseExpirationPolicyInput,
): string[] {
	if (input.mode !== "append") return [];
	return [
		...(input.repoRoot
			? []
			: ["Missing repoRoot for lease expiration append."]),
		...(input.traceIds || [])
			.filter(
				(traceId) => !hasExpectedBytes(input.expectedBytesByTrace, traceId),
			)
			.map((traceId) => `Missing expected trace bytes for ${traceId}.`),
	];
}

function appendSafetyBlockers(
	input: RuntimeWorkUnitClaimPolicyInput,
): string[] {
	if (input.mode !== "append") return [];
	const traceIds = unique(input.plan.selected.map((item) => item.traceId));
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

function selectedQualityBlockedWorkUnitIds(
	queue: WorkQueueView,
	plan: RuntimeWorkUnitClaimSelection,
): string[] {
	const selectedIds = new Set(plan.selected.map((item) => item.workUnitId));
	return queue.items
		.filter((item) => selectedIds.has(item.id))
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
