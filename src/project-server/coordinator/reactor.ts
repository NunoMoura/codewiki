import { buildProjectWorkState } from "../../work-state/project.ts";
import {
	WorkStateSession,
	type WorkStateRefreshResult,
} from "../../work-state/session.ts";
import type {
	WorkState,
	WorkStateChange,
	WorkStateWorkUnit,
} from "../../work-state/types.ts";

export const RUNTIME_REACTION_SCHEMA_VERSION = 3;

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
	change: ProjectServerChangeRef;
}

export interface ProjectServerImplementationSelection {
	loop: "implementation";
	changeId: string;
	workUnitId: string;
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
	) return false;
	if (
		expected.selection.loop === "implementation" &&
		expected.observedWorkStateDigest !== candidate.observedWorkStateDigest
	) return false;
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

export function selectProjectServerReaction(
	workState: WorkState,
	trigger: ProjectServerTrigger,
	options: SelectProjectServerReactionOptions = {},
): ProjectServerReaction {
	return selectProjectServerReactions(workState, trigger, {
		...options,
		maxReactions: 1,
	})[0] || quiescentReaction(workState, trigger);
}

/** Derive bounded independent reactions. Planning never groups Changes. */
export function selectProjectServerReactions(
	workState: WorkState,
	trigger: ProjectServerTrigger,
	options: SelectProjectServerReactionOptions = {},
): ProjectServerReaction[] {
	const maxReactions = boundedReactionLimit(options.maxReactions);
	const candidates = eligibleChanges(workState, trigger);
	const reactions: ProjectServerReaction[] = [];
	const selectedWorkUnits = new Set<string>();

	for (const candidate of candidates) {
		if (reactions.length >= maxReactions) break;
		if (candidate.currentLoop === "planning") {
			reactions.push(
				readyReaction(workState, trigger, {
					loop: "planning",
					change: runtimeChangeRef(candidate),
				}),
			);
			continue;
		}
		const workUnit = readyImplementationWorkUnit(workState, candidate.id);
		if (!workUnit || selectedWorkUnits.has(workUnit.id)) continue;
		selectedWorkUnits.add(workUnit.id);
		reactions.push(
			readyReaction(workState, trigger, {
				loop: "implementation",
				changeId: candidate.id,
				workUnitId: workUnit.id,
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
	return workState.changes
		.filter(
			(change) =>
				change.currentLoop !== undefined && change.currentLoop !== "decision",
		)
		.sort((left, right) => {
			const relevance = triggerRelevance(right, trigger) - triggerRelevance(left, trigger);
			if (relevance !== 0) return relevance;
			const updatedAt = left.record.change.provenance.updatedAt.localeCompare(
				right.record.change.provenance.updatedAt,
			);
			return updatedAt || left.id.localeCompare(right.id);
		});
}

function readyImplementationWorkUnit(
	workState: WorkState,
	changeId: string,
): WorkStateWorkUnit | undefined {
	const byId = new Map(workState.workUnits.map((unit) => [unit.id, unit]));
	return workState.workUnits
		.filter((unit) => unit.owningChangeId === changeId)
		.filter((unit) => !unit.implemented && unit.blockers.length === 0)
		.filter((unit) =>
			unit.dependsOn.every((dependencyId) => byId.get(dependencyId)?.implemented),
		)
		.sort((left, right) => left.id.localeCompare(right.id))[0];
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
	) ? 1 : 0;
}

function runtimeChangeRef(change: WorkStateChange): ProjectServerChangeRef {
	return {
		changeId: change.id,
		traceId: change.traceId,
		changeRevision: change.approval.changeRevision,
		changeDigest: change.approval.changeDigest,
	};
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
		...(trigger.refs?.length ? { refs: [...new Set(trigger.refs)].sort(compareText) } : {}),
	};
}

function boundedReactionLimit(value: number | undefined): number {
	if (value === undefined) return 4;
	if (!Number.isInteger(value) || value < 1 || value > 32) {
		throw new Error("Project Server maxReactions must be an integer from 1 to 32.");
	}
	return value;
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}
