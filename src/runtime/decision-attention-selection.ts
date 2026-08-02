import type {
	ProjectCoordinator,
	ProjectCoordinatorJob,
	ProjectCoordinatorRecovery,
} from "./project-coordinator.ts";
import {
	assertDecisionAttentionSelectionCurrent,
	assertDecisionAttentionSelectionReceipt,
	type AuthenticatedDecisionSelectionAuthority,
	type DecisionAttentionSelectionCommand,
	type DecisionAttentionSelectionContext,
	type DecisionAttentionSelectionReceipt,
	type DecisionAttentionSelectionRuntime,
} from "../changes/triage/selection.ts";
import type {BacklogTriageCandidate} from "../changes/triage/contracts.ts";

export interface DecisionAttentionJobExecutor<TResult> {
	run(input: {
		readonly selection: DecisionAttentionSelectionReceipt;
		readonly candidate: BacklogTriageCandidate;
		readonly signal: AbortSignal;
	}): TResult | Promise<TResult>;
	recover(input: {
		readonly selection: DecisionAttentionSelectionReceipt;
	}):
		| ProjectCoordinatorRecovery<TResult>
		| undefined
		| Promise<ProjectCoordinatorRecovery<TResult> | undefined>;
}

export interface StartedDecisionAttentionJob<TResult> {
	readonly selection: DecisionAttentionSelectionReceipt;
	readonly result: TResult;
}

export async function selectAndScheduleDecisionAttentionJob<TResult>(input: {
	readonly selectionRuntime: DecisionAttentionSelectionRuntime;
	readonly command: DecisionAttentionSelectionCommand;
	readonly authority: AuthenticatedDecisionSelectionAuthority;
	readonly coordinator: ProjectCoordinator;
	readonly loadCurrentContext: () =>
		| DecisionAttentionSelectionContext
		| Promise<DecisionAttentionSelectionContext>;
	readonly executor: DecisionAttentionJobExecutor<TResult>;
}): Promise<StartedDecisionAttentionJob<TResult>> {
	const selection = await input.selectionRuntime.execute({
		command: input.command,
		authority: input.authority,
	});
	const result = await scheduleDecisionAttentionJob({
		coordinator: input.coordinator,
		selection,
		loadCurrentContext: input.loadCurrentContext,
		executor: input.executor,
	});
	return Object.freeze({selection, result});
}

export async function scheduleDecisionAttentionJob<TResult>(input: {
	readonly coordinator: ProjectCoordinator;
	readonly selection: DecisionAttentionSelectionReceipt;
	readonly loadCurrentContext: () =>
		| DecisionAttentionSelectionContext
		| Promise<DecisionAttentionSelectionContext>;
	readonly executor: DecisionAttentionJobExecutor<TResult>;
}): Promise<TResult> {
	assertDecisionAttentionSelectionReceipt(input.selection);
	const job: ProjectCoordinatorJob<TResult> = {
		idempotencyKey: input.selection.decisionJobId,
		lane: {
			kind: "decision",
			changeId: input.selection.binding.changeId,
			changeRevisionId: input.selection.binding.changeRevisionId,
		},
		conflictRefs: [...input.selection.conflictRefs],
		effect: "write",
		recover: () => input.executor.recover({selection: input.selection}),
		async run(signal) {
			const context = await input.loadCurrentContext();
			const candidate = assertDecisionAttentionSelectionCurrent({
				receipt: input.selection,
				context,
			});
			return input.executor.run({
				selection: input.selection,
				candidate,
				signal,
			});
		},
	};
	return input.coordinator.schedule(job);
}
