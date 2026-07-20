import type { ChangeRecord } from "../changes/records.ts";
import { buildProjectWorkState } from "../work-state/project.ts";
import {
	WorkStateSession,
	type WorkStateRefreshResult,
} from "../work-state/session.ts";
import type {
	WorkState,
	WorkStateChange,
	WorkStateSprint,
} from "../work-state/types.ts";

export const RUNTIME_REACTION_SCHEMA_VERSION = 1;

export type RuntimeTriggerKind =
	| "session_started"
	| "change_trace_appended"
	| "project_truth_changed"
	| "timer_due"
	| "user_response"
	| "manual_resume";

export interface RuntimeTrigger {
	kind: RuntimeTriggerKind;
	occurredAt?: string;
	refs?: string[];
}

export interface RuntimeChangeRef {
	changeId: string;
	traceId: string;
	changeRevision: number;
	changeDigest: string;
}

export interface RuntimeDecisionSelection {
	loop: "decision";
	change: RuntimeChangeRef;
}

export interface RuntimePlanningSelection {
	loop: "planning";
	planningHorizon: RuntimeChangeRef[];
}

export interface RuntimeImplementationSelection {
	loop: "implementation";
	sprintId: string;
	changeIds: string[];
	workItemIds: string[];
}

export type RuntimeLoopSelection =
	| RuntimeDecisionSelection
	| RuntimePlanningSelection
	| RuntimeImplementationSelection;

export interface RuntimeReaction {
	schemaVersion: typeof RUNTIME_REACTION_SCHEMA_VERSION;
	status: "ready" | "quiescent";
	trigger: RuntimeTrigger;
	observedWorkStateDigest: string;
	selection?: RuntimeLoopSelection;
}

export interface SelectRuntimeReactionOptions {
	maxPlanningChanges?: number;
}

export interface InspectRuntimeInput extends SelectRuntimeReactionOptions {
	repoRoot: string;
	trigger: RuntimeTrigger;
}

export interface RuntimeObservation extends WorkStateRefreshResult {
	reaction: RuntimeReaction;
}

/** Supervised runtime reader that reuses indexed Change Trace state. */
export class RuntimeReactor {
	private readonly workState: WorkStateSession;

	constructor(repoRoot: string) {
		this.workState = new WorkStateSession(repoRoot);
	}

	async observe(
		trigger: RuntimeTrigger,
		options: SelectRuntimeReactionOptions = {},
	): Promise<RuntimeObservation> {
		const refreshed = await this.workState.refresh(trigger.occurredAt);
		return {
			...refreshed,
			reaction: selectRuntimeReaction(refreshed.workState, trigger, options),
		};
	}

	async inspect(
		trigger: RuntimeTrigger,
		options: SelectRuntimeReactionOptions = {},
	): Promise<RuntimeReaction> {
		return (await this.observe(trigger, options)).reaction;
	}

	invalidate(traceId?: string): void {
		this.workState.invalidate(traceId);
	}
}

/**
 * Derive one bounded semantic-loop reaction from current project truth.
 * Runtime owns this selection; callers never choose Decision, Planning, or
 * Implementation directly.
 */
export function selectRuntimeReaction(
	workState: WorkState,
	trigger: RuntimeTrigger,
	options: SelectRuntimeReactionOptions = {},
): RuntimeReaction {
	const candidates = eligibleChanges(workState, trigger);
	for (const candidate of candidates) {
		if (candidate.currentLoop === "decision") {
			return readyReaction(workState, trigger, {
				loop: "decision",
				change: runtimeChangeRef(candidate),
			});
		}
		if (candidate.currentLoop === "planning") {
			const limit = boundedPlanningLimit(options.maxPlanningChanges);
			const horizon = relatedPlanningChanges(workState, candidate, limit);
			return readyReaction(workState, trigger, {
				loop: "planning",
				planningHorizon: horizon.map(runtimeChangeRef),
			});
		}
		const implementation = implementationSprint(workState, candidate.id);
		if (implementation) {
			return readyReaction(workState, trigger, {
				loop: "implementation",
				sprintId: implementation.id,
				changeIds: [...implementation.participatingChangeIds].sort(compareText),
				workItemIds: implementation.workItemIds
					.filter((id) => {
						const item = workState.workItems.find(
							(workItem) => workItem.id === id,
						);
						return item
							? !item.implemented && item.blockers.length === 0
							: false;
					})
					.sort(compareText),
			});
		}
	}

	return {
		schemaVersion: RUNTIME_REACTION_SCHEMA_VERSION,
		status: "quiescent",
		trigger: normalizedTrigger(trigger),
		observedWorkStateDigest: workState.snapshotDigest,
	};
}

export async function inspectRuntime(
	input: InspectRuntimeInput,
): Promise<RuntimeReaction> {
	const workState = await buildProjectWorkState({ repoRoot: input.repoRoot });
	return selectRuntimeReaction(workState, input.trigger, input);
}

function eligibleChanges(
	workState: WorkState,
	trigger: RuntimeTrigger,
): WorkStateChange[] {
	const pendingDecision = workState.changes.filter(
		(change) => change.currentLoop === "decision",
	);
	return workState.changes
		.filter((change) => change.currentLoop !== undefined)
		.filter(
			(change) =>
				change.currentLoop !== "planning" ||
				!pendingDecision.some((pending) =>
					changesOverlap(change.record, pending.record),
				),
		)
		.sort((left, right) => {
			const relevance =
				triggerRelevance(right, trigger) - triggerRelevance(left, trigger);
			if (relevance !== 0) return relevance;
			const updatedAt = left.record.change.provenance.updatedAt.localeCompare(
				right.record.change.provenance.updatedAt,
			);
			return updatedAt || compareChanges(left, right);
		});
}

function implementationSprint(
	workState: WorkState,
	changeId: string,
): WorkStateSprint | undefined {
	const workItemsById = new Map(
		workState.workItems.map((item) => [item.id, item]),
	);
	return workState.sprints
		.filter((sprint) => sprint.complete && sprint.blockers.length === 0)
		.filter((sprint) => sprint.participatingChangeIds.includes(changeId))
		.filter((sprint) =>
			sprint.workItemIds.some((id) => {
				const item = workItemsById.get(id);
				return item ? !item.implemented && item.blockers.length === 0 : false;
			}),
		)
		.sort((left, right) => left.id.localeCompare(right.id))[0];
}

function relatedPlanningChanges(
	workState: WorkState,
	seed: WorkStateChange,
	limit: number,
): WorkStateChange[] {
	const candidates = workState.changes
		.filter((change) => change.currentLoop === "planning")
		.sort(compareChanges);
	const selected: WorkStateChange[] = [seed];
	const selectedIds = new Set([seed.id]);
	while (selected.length < limit) {
		const related = candidates.find(
			(candidate) =>
				!selectedIds.has(candidate.id) &&
				selected.some((current) =>
					changesOverlap(current.record, candidate.record),
				),
		);
		if (!related) break;
		selected.push(related);
		selectedIds.add(related.id);
	}
	return selected.sort(compareChanges);
}

function changesOverlap(left: ChangeRecord, right: ChangeRecord): boolean {
	const leftId = left.change.id;
	const rightId = right.change.id;
	if (left.links.some((link) => link.targetChangeId === rightId)) return true;
	if (right.links.some((link) => link.targetChangeId === leftId)) return true;
	const rightRefs = new Set(right.change.classification.targetRefs);
	return left.change.classification.targetRefs.some((ref) =>
		rightRefs.has(ref),
	);
}

function triggerRelevance(
	change: WorkStateChange,
	trigger: RuntimeTrigger,
): number {
	return trigger.refs?.some(
		(ref) =>
			ref === change.id ||
			ref === change.traceId ||
			ref === `change:${change.id}` ||
			ref === `trace:${change.traceId}`,
	)
		? 1
		: 0;
}

function runtimeChangeRef(change: WorkStateChange): RuntimeChangeRef {
	return {
		changeId: change.id,
		traceId: change.traceId,
		changeRevision: change.approval.changeRevision,
		changeDigest: change.approval.changeDigest,
	};
}

function readyReaction(
	workState: WorkState,
	trigger: RuntimeTrigger,
	selection: RuntimeLoopSelection,
): RuntimeReaction {
	return {
		schemaVersion: RUNTIME_REACTION_SCHEMA_VERSION,
		status: "ready",
		trigger: normalizedTrigger(trigger),
		observedWorkStateDigest: workState.snapshotDigest,
		selection,
	};
}

function normalizedTrigger(trigger: RuntimeTrigger): RuntimeTrigger {
	return {
		kind: trigger.kind,
		...(trigger.occurredAt ? { occurredAt: trigger.occurredAt } : {}),
		...(trigger.refs?.length
			? { refs: [...new Set(trigger.refs)].sort(compareText) }
			: {}),
	};
}

function boundedPlanningLimit(value: number | undefined): number {
	if (value === undefined) return 8;
	if (!Number.isInteger(value) || value < 1 || value > 32) {
		throw new Error(
			"Runtime maxPlanningChanges must be an integer from 1 to 32.",
		);
	}
	return value;
}

function compareChanges(left: WorkStateChange, right: WorkStateChange): number {
	return left.id.localeCompare(right.id);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
