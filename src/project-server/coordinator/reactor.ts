import type { ChangeRecord } from "../../changes/records.ts";
import { buildProjectWorkState } from "../../work-state/project.ts";
import {
	WorkStateSession,
	type WorkStateRefreshResult,
} from "../../work-state/session.ts";
import type {
	WorkState,
	WorkStateChange,
	WorkStateSprint,
} from "../../work-state/types.ts";

export const RUNTIME_REACTION_SCHEMA_VERSION = 1;

export type ProjectServerTriggerKind =
	| "session_started"
	| "change_trace_appended"
	| "project_truth_changed"
	| "timer_due"
	| "user_response"
	| "manual_resume";

export interface ProjectServerTrigger {
	kind: ProjectServerTriggerKind;
	occurredAt?: string;
	refs?: string[];
}

export interface ProjectServerChangeRef {
	changeId: string;
	traceId: string;
	changeRevision: number;
	changeDigest: string;
}

export interface ProjectServerDecisionSelection {
	loop: "decision";
	change: ProjectServerChangeRef;
}

export interface ProjectServerPlanningSelection {
	loop: "planning";
	planningHorizon: ProjectServerChangeRef[];
}

export interface ProjectServerImplementationSelection {
	loop: "implementation";
	sprintId: string;
	changeIds: string[];
	workItemIds: string[];
}

export type ProjectServerLoopSelection =
	| ProjectServerDecisionSelection
	| ProjectServerPlanningSelection
	| ProjectServerImplementationSelection;

export interface ProjectServerReaction {
	schemaVersion: typeof RUNTIME_REACTION_SCHEMA_VERSION;
	status: "ready" | "quiescent";
	trigger: ProjectServerTrigger;
	observedWorkStateDigest: string;
	selection?: ProjectServerLoopSelection;
}

export interface SelectProjectServerReactionOptions {
	maxPlanningChanges?: number;
	maxReactions?: number;
}

export interface InspectProjectServerInput extends SelectProjectServerReactionOptions {
	repoRoot: string;
	trigger: ProjectServerTrigger;
}

export interface ProjectServerObservation extends WorkStateRefreshResult {
	reaction: ProjectServerReaction;
}

export interface ProjectServerBatchObservation extends WorkStateRefreshResult {
	reactions: ProjectServerReaction[];
}

function runtimeReactionInvariantKey(reaction: ProjectServerReaction): string {
	if (reaction.status !== "ready" || !reaction.selection) return "quiescent";
	return JSON.stringify(reaction.selection);
}

export function runtimeReactionsShareInvariant(
	expected: ProjectServerReaction,
	candidate: ProjectServerReaction,
): boolean {
	if (
		expected.status !== "ready" ||
		candidate.status !== "ready" ||
		!expected.selection ||
		!candidate.selection
	) {
		return false;
	}
	if (
		expected.selection.loop === "implementation" &&
		expected.observedWorkStateDigest !== candidate.observedWorkStateDigest
	) {
		return false;
	}
	return runtimeReactionInvariantKey(expected) === runtimeReactionInvariantKey(candidate);
}

/** Supervised runtime reader that reuses indexed Change Trace state. */
export class ProjectServerReactor {
	private readonly workState: WorkStateSession;

	constructor(repoRoot: string) {
		this.workState = new WorkStateSession(repoRoot);
	}

	async observe(
		trigger: ProjectServerTrigger,
		options: SelectProjectServerReactionOptions = {},
	): Promise<ProjectServerObservation> {
		const refreshed = await this.workState.refresh(trigger.occurredAt);
		return {
			...refreshed,
			reaction: selectProjectServerReaction(refreshed.workState, trigger, options),
		};
	}

	async observeMany(
		trigger: ProjectServerTrigger,
		options: SelectProjectServerReactionOptions = {},
	): Promise<ProjectServerBatchObservation> {
		const refreshed = await this.workState.refresh(trigger.occurredAt);
		return {
			...refreshed,
			reactions: selectProjectServerReactions(refreshed.workState, trigger, options),
		};
	}

	async inspect(
		trigger: ProjectServerTrigger,
		options: SelectProjectServerReactionOptions = {},
	): Promise<ProjectServerReaction> {
		return (await this.observe(trigger, options)).reaction;
	}

	invalidate(traceId?: string): void {
		this.workState.invalidate(traceId);
	}
}

/**
 * Derive one bounded semantic-loop reaction from current project truth.
 * Project Server owns this selection; callers never choose Decision, Planning, or
 * Implementation directly.
 */
export function selectProjectServerReaction(
	workState: WorkState,
	trigger: ProjectServerTrigger,
	options: SelectProjectServerReactionOptions = {},
): ProjectServerReaction {
	return (
		selectProjectServerReactions(workState, trigger, {
			...options,
			maxReactions: 1,
		})[0] || quiescentReaction(workState, trigger)
	);
}

/** Derive a bounded compatible horizon for the project coordinator. */
export function selectProjectServerReactions(
	workState: WorkState,
	trigger: ProjectServerTrigger,
	options: SelectProjectServerReactionOptions = {},
): ProjectServerReaction[] {
	const maxReactions = boundedReactionLimit(options.maxReactions);
	const planningLimit = boundedPlanningLimit(options.maxPlanningChanges);
	const candidates = eligibleChanges(workState, trigger);
	const reactions: ProjectServerReaction[] = [];
	const selectedSprints = new Set<string>();
	let planningSelected = false;

	for (const candidate of candidates) {
		if (reactions.length >= maxReactions) break;
		if (candidate.currentLoop === "planning") {
			if (planningSelected) continue;
			planningSelected = true;
			const horizon = relatedPlanningChanges(
				workState,
				candidate,
				planningLimit,
			);
			reactions.push(
				readyReaction(workState, trigger, {
					loop: "planning",
					planningHorizon: horizon.map(runtimeChangeRef),
				}),
			);
			continue;
		}
		const implementation = implementationSprint(workState, candidate.id);
		if (!implementation || selectedSprints.has(implementation.id)) continue;
		selectedSprints.add(implementation.id);
		reactions.push(
			readyReaction(workState, trigger, {
				loop: "implementation",
				sprintId: implementation.id,
				changeIds: [...implementation.participatingChangeIds].sort(compareText),
				workItemIds: readyWorkItemIds(workState, implementation),
			}),
		);
	}
	return reactions;
}

export async function inspectProjectServer(
	input: InspectProjectServerInput,
): Promise<ProjectServerReaction> {
	const workState = await buildProjectWorkState({ repoRoot: input.repoRoot });
	return selectProjectServerReaction(workState, input.trigger, input);
}


function eligibleChanges(
	workState: WorkState,
	trigger: ProjectServerTrigger,
): WorkStateChange[] {
	return workState.changes.filter(
		(change) =>
			change.currentLoop !== undefined && change.currentLoop !== "decision",
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
		.filter((sprint) => !sprint.complete && sprint.blockers.length === 0)
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
	trigger: ProjectServerTrigger,
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

function runtimeChangeRef(change: WorkStateChange): ProjectServerChangeRef {
	return {
		changeId: change.id,
		traceId: change.traceId,
		changeRevision: change.approval.changeRevision,
		changeDigest: change.approval.changeDigest,
	};
}

function readyWorkItemIds(
	workState: WorkState,
	sprint: WorkStateSprint,
): string[] {
	return sprint.workItemIds
		.filter((id) => {
			const item = workState.workItems.find((workItem) => workItem.id === id);
			return item ? !item.implemented && item.blockers.length === 0 : false;
		})
		.sort(compareText);
}

function readyReaction(
	workState: WorkState,
	trigger: ProjectServerTrigger,
	selection: ProjectServerLoopSelection,
): ProjectServerReaction {
	return {
		schemaVersion: RUNTIME_REACTION_SCHEMA_VERSION,
		status: "ready",
		trigger: normalizedTrigger(trigger),
		observedWorkStateDigest: workState.snapshotDigest,
		selection,
	};
}

function quiescentReaction(
	workState: WorkState,
	trigger: ProjectServerTrigger,
): ProjectServerReaction {
	return {
		schemaVersion: RUNTIME_REACTION_SCHEMA_VERSION,
		status: "quiescent",
		trigger: normalizedTrigger(trigger),
		observedWorkStateDigest: workState.snapshotDigest,
	};
}

function normalizedTrigger(trigger: ProjectServerTrigger): ProjectServerTrigger {
	return {
		kind: trigger.kind,
		...(trigger.occurredAt ? { occurredAt: trigger.occurredAt } : {}),
		...(trigger.refs?.length
			? { refs: [...new Set(trigger.refs)].sort(compareText) }
			: {}),
	};
}

function boundedReactionLimit(value: number | undefined): number {
	if (value === undefined) return 4;
	if (!Number.isInteger(value) || value < 1 || value > 32) {
		throw new Error("Project Server maxReactions must be an integer from 1 to 32.");
	}
	return value;
}

function boundedPlanningLimit(value: number | undefined): number {
	if (value === undefined) return 8;
	if (!Number.isInteger(value) || value < 1 || value > 32) {
		throw new Error(
			"Project Server maxPlanningChanges must be an integer from 1 to 32.",
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
