import {
	planProjectServerWorkUnitClaimWorktrees,
	type ProjectServerWorktreePlan,
} from "../../git/worktrees.ts";
import {
	resolveWikiConfig,
	type PartialWikiConfig,
	type WikiConfig,
	type WikiConfigAgencyLevel,
	type WikiConfigAutomationMode,
	type WikiConfigWorktreeIsolation,
} from "../../project/config.ts";
import type { WorkQueueItem, WorkQueueView } from "../../work-state/projection-types.ts";
import { runtimeAutomationBlockers } from "../admission/automation.ts";
import type { ProjectServerWorkUnitClaimSelection } from "./work-unit-selection.ts";

type ProjectServerWorkUnitClaimPolicyMode = "preview" | "append";
type ProjectServerLeaseExpirationPolicyMode = "preview" | "append";

interface ProjectServerWorkUnitClaimPolicyInput {
	mode: ProjectServerWorkUnitClaimPolicyMode;
	queue: WorkQueueView;
	plan: ProjectServerWorkUnitClaimSelection;
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

export interface ProjectServerWorkUnitClaimPolicyDecision {
	maxParallelClaims: number;
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	worktreeIsolation: WikiConfigWorktreeIsolation;
	worktrees: ProjectServerWorktreePlan[];
	appendAllowed: boolean;
	blockers: string[];
	qualityBlockedWorkUnitIds: string[];
}

interface ProjectServerLeaseExpirationPolicyInput {
	mode: ProjectServerLeaseExpirationPolicyMode;
	config?: PartialWikiConfig | WikiConfig;
	repoRoot?: string;
	traceIds?: string[];
	expectedBytesByTrace?: Record<string, number>;
}

export interface ProjectServerLeaseExpirationPolicyDecision {
	automation: WikiConfigAutomationMode;
	agency: WikiConfigAgencyLevel;
	appendAllowed: boolean;
	blockers: string[];
}

export function evaluateProjectServerLeaseExpirationPolicy(
	input: ProjectServerLeaseExpirationPolicyInput,
): ProjectServerLeaseExpirationPolicyDecision {
	const config = resolveWikiConfig(input.config);
	const blockers = [
		...runtimeAutomationBlockers(config),
		...leaseExpirationAppendSafetyBlockers(input),
	];
	return {
		automation: config.runtime.automation,
		agency: config.runtime.agency,
		appendAllowed: blockers.length === 0,
		blockers,
	};
}

export function evaluateProjectServerWorkUnitClaimPolicy(
	input: ProjectServerWorkUnitClaimPolicyInput,
): ProjectServerWorkUnitClaimPolicyDecision {
	const config = resolveWikiConfig(input.config);
	const worktrees = planProjectServerWorkUnitClaimWorktrees(input.plan.selected, {
		mode: config.runtime.worktreeIsolation,
		repoRoot: input.repoRoot,
		projectName: config.project,
		worktreeRoot: input.worktreeRoot,
		baseRef: input.baseRef,
		baseSha: input.baseSha,
		dirtyPaths: input.dirtyPaths,
		workerIdPrefix: input.workerIdPrefix,
		workerIds: input.workerIds,
		setupCommands: config.runtime.worktreeSetupCommands,
	});
	const qualityBlockedWorkUnitIds = selectedQualityBlockedWorkUnitIds(
		input.queue,
		input.plan,
	);
	const blockers = [
		...runtimeAutomationBlockers(config),
		...appendSafetyBlockers(input),
		...qualityBlockedWorkUnitIds.map(
			(id) => `Work unit ${id} is not claimable by quality policy.`,
		),
	];
	return {
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

function leaseExpirationAppendSafetyBlockers(
	input: ProjectServerLeaseExpirationPolicyInput,
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
	input: ProjectServerWorkUnitClaimPolicyInput,
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
	plan: ProjectServerWorkUnitClaimSelection,
): string[] {
	const selectedIds = new Set(plan.selected.map((item) => item.workUnitId));
	return queue.items
		.filter((item) => selectedIds.has(item.id) && qualityBlocked(item))
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
